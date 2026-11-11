/* Developer Community backend logic — shared by:
 *  - api/community/*.js          (Vercel serverless functions, production)
 *  - server/index.js             (local Express routes, when configured)
 *
 * Storage: Supabase Postgres (see supabase/schema.sql). Writes go through
 * the service-role key held ONLY in server-side environment variables — the
 * anon key (safe to expose via RLS SELECT) is used by the browser only for
 * realtime message subscription and presence, never for writes.
 *
 * Shape-compatible with the previous SQLite implementation: the frontend
 * contract (response fields, codes, budgets) is unchanged. */

const CHANNEL = 'developer-community'
const HISTORY_LIMIT = 120
const HIDE_REPORT_THRESHOLD = 3
const RETENTION_DAYS = 90

const MAX_MESSAGE_LENGTH = 500
const MAX_NAME_LENGTH = 24
const MAX_PROFILE_LENGTH = 80

/* Parity with the previous WebSocket flood guard (8 messages / 10s). */
const SEND_WINDOW_MS = 10_000
const SEND_MAX_PER_WINDOW = 8
/* Parity with the Express report throttle (20 / 15 min). */
const REPORT_WINDOW_MS = 15 * 60 * 1000
const REPORT_MAX_PER_WINDOW = 20

import { checkRateLimit, clientIpFrom } from './rate-limit.js'

const response = (status, body) => ({ status, body })

const failure = (status, code, error) => response(status, { success: false, code, error })

const isValidUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? ''))

const sanitise = (value) => String(value ?? '').trim()

const sanitizeText = (input) => String(input ?? '').replace(/[<>]/g, '').trim().replace(/\s+/g, ' ')

/* Same HTML-stripping + collapsing applied by the local SQLite server, so
 * stored content is identical no matter which backend wrote it. React also
 * escapes on render; this keeps the DB clean at rest. */
export const sanitizeCommunityText = sanitizeText

export function communityConfigured(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim().replace(/\/$/, '')
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  return Boolean(url && key)
}

function restConfig(env) {
  if (!communityConfigured(env)) return null
  const url = String(env.SUPABASE_URL).trim().replace(/\/$/, '')
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY).trim()
  return {
    url,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  }
}

/* Every Supabase REST failure is classified and reported WITHOUT echoing the
 * key or URL — messages never leak credentials into responses or logs. */
async function restRequest(config, table, { searchParams, method = 'GET', body, prefer } = {}) {
  let response
  try {
    response = await fetch(`${config.url}/rest/v1/${table}${searchParams ? `?${searchParams}` : ''}`, {
      method,
      signal: AbortSignal.timeout(10_000),
      headers: prefer ? { ...config.headers, Prefer: prefer } : config.headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (fetchError) {
    const timedOut = fetchError?.name === 'TimeoutError' || fetchError?.name === 'AbortError'
    console.error('Community DB request failed:', timedOut ? 'timed out after 10s' : 'network error')
    return { ok: false, rows: [], error: { status: 504, code: timedOut ? 'DB_TIMEOUT' : 'DB_UNREACHABLE' } }
  }

  let rows = []
  try {
    const parsed = await response.json()
    if (Array.isArray(parsed)) rows = parsed
    else if (parsed && typeof parsed === 'object') rows = [parsed]
    else rows = []
  } catch {
    rows = []
  }

  if (!response.ok) {
    const codeAttribute = rows.find((row) => row?.code)
    console.error(`Community DB request rejected: HTTP ${response.status} ${rows[0]?.message || ''}`.trim())
    return {
      ok: false,
      rows,
      error: { status: response.status === 401 ? 503 : 502, code: `DB_${codeAttribute?.code || `HTTP_${response.status}`}` },
    }
  }

  return { ok: true, rows, error: null }
}

/* ------------------------------------------------------------------ reads */

export async function getCommunityMessages(env = process.env) {
  const config = restConfig(env)
  if (!config) return failure(503, 'COMMUNITY_NOT_CONFIGURED', 'Community storage is not configured yet.')

  /* Reply resolution lives in stored reply_preview data (mirroring the old
   * server), so history is a single round-trip. */
  const params = new URLSearchParams({
    channel: `eq.${CHANNEL}`,
    reported_count: `lt.${HIDE_REPORT_THRESHOLD}`,
    select: 'id,channel,display_name,message,created_at,user_id,profile,reply_to,reply_preview',
    order: 'created_at.asc',
    limit: String(HISTORY_LIMIT),
  })

  const result = await restRequest(config, 'community_messages', { searchParams: params.toString() })
  if (!result.ok) {
    return failure(result.error.status, result.error.code, 'Earlier messages could not be loaded. Please try again later.')
  }

  return response(200, { messages: result.rows.filter(Boolean) })
}

/* ----------------------------------------------------------------- writes */

export async function createCommunityMessage(payload, env = process.env, ip = 'unknown') {
  const config = restConfig(env)
  if (!config) return failure(503, 'COMMUNITY_NOT_CONFIGURED', 'Community storage is not configured yet.')

  const limit = checkRateLimit(`chat:${ip}`, { windowMs: SEND_WINDOW_MS, max: SEND_MAX_PER_WINDOW })
  if (!limit.allowed) {
    return failure(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please slow down.')
  }

  const displayName = sanitizeText(payload?.display_name)
  const profile = sanitizeText(payload?.profile) || 'Developer'
  const message = sanitizeText(payload?.message)
  const userId = invalidOrEmpty(payload?.user_id) ? null : sanitise(payload?.user_id).slice(0, 64)
  const requestedReplyId = sanitise(payload?.reply_to)

  if (displayName.length < 2 || displayName.length > MAX_NAME_LENGTH) {
    return failure(400, 'VALIDATION_ERROR', 'Choose a display name with at least 2 characters.')
  }
  if (profile.length > MAX_PROFILE_LENGTH) {
    return failure(400, 'VALIDATION_ERROR', 'Profile must be 80 characters or fewer.')
  }
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return failure(400, 'VALIDATION_ERROR', `Messages must be between 1 and ${MAX_MESSAGE_LENGTH} characters.`)
  }

  /* Reply resolution: only a reply_to that points to a real, stored message
   * is accepted, so previews can never be forged by a client. */
  let replyTo = null
  let replyPreview = null
  if (isValidUuid(requestedReplyId)) {
    const lookup = await restRequest(config, 'community_messages', {
      searchParams: new URLSearchParams({ id: `eq.${requestedReplyId}`, select: 'id,display_name,message', limit: '1' }).toString(),
    })
    const target = lookup.rows.find(Boolean)
    if (target?.id && target?.message) {
      replyTo = target.id
      replyPreview = `${sanitizeText(target.display_name)}: ${String(target.message).slice(0, 133)}`.slice(0, 140)
    }
  }

  /* Retention: prune messages older than the retention window before each
   * insert keeps the free-tier database small. Failures are tolerated. */
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  await restRequest(config, 'community_messages', {
    searchParams: new URLSearchParams({ channel: `eq.${CHANNEL}`, created_at: `lt.${cutoff}` }).toString(),
    method: 'DELETE',
  })

  const insert = await restRequest(config, 'community_messages', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      channel: CHANNEL,
      display_name: displayName,
      message,
      user_id: userId,
      profile,
      reply_to: replyTo,
      reply_preview: replyPreview,
    },
  })

  if (!insert.ok) {
    return failure(insert.error.status, insert.error.code, 'Could not save your message. Please try again later.')
  }

  const row = insert.rows.find(Boolean)
  if (!row?.id) {
    console.error('Community insert response missing identifier')
    return failure(502, 'DB_UNCONFIRMED', 'Could not save your message. Please try again later.')
  }

  return response(201, { message: row })
}

function invalidOrEmpty(value) {
  const candidate = sanitise(value)
  return !candidate || candidate.length > 64
}

/* ---------------------------------------------------------------- reports */

export async function createCommunityReport(payload, env = process.env, ip = 'unknown') {
  const config = restConfig(env)
  if (!config) return failure(503, 'COMMUNITY_NOT_CONFIGURED', 'Community storage is not configured yet.')

  const limit = checkRateLimit(`report:${ip}`, { windowMs: REPORT_WINDOW_MS, max: REPORT_MAX_PER_WINDOW })
  if (!limit.allowed) {
    return failure(429, 'RATE_LIMITED', 'Too many reports. Please try again later.')
  }

  const messageId = sanitise(payload?.messageId)
  if (!messageId) return failure(400, 'VALIDATION_ERROR', 'A message identifier is required.')

  const lookup = await restRequest(config, 'community_messages', {
    searchParams: new URLSearchParams({ id: `eq.${messageId}`, select: 'id,reported_count', limit: '1' }).toString(),
  })
  const target = lookup.ok ? lookup.rows.find(Boolean) ?? null : null
  if (!target) return failure(404, 'MESSAGE_NOT_FOUND', 'Message not found.')

  const report = await restRequest(config, 'community_reports', {
    method: 'POST',
    body: { message_id: messageId },
  })
  if (!report.ok) return failure(report.error.status, report.error.code, 'Could not send the report. Please try again later.')

  /* Moderation: at the threshold the message disappears from history and
   * live feeds on its own — no manual moderation tooling required. */
  const nextCount = (typeof target.reported_count === 'number' ? target.reported_count : 0) + 1
  const increment = await restRequest(config, 'community_messages', {
    searchParams: new URLSearchParams({ id: `eq.${messageId}` }).toString(),
    method: 'PATCH',
    body: { reported_count: nextCount },
  })
  if (!increment.ok) {
    return failure(increment.error.status, increment.error.code, 'Could not send the report. Please try again later.')
  }

  return response(200, { success: true, message: 'Report sent to moderation.' })
}

/* -------------------------------------------------- Vercel function glue */

export function clientIp(req) {
  return clientIpFrom(req)
}

export const LIMITS = {
  CHANNEL,
  HISTORY_LIMIT,
  HIDE_REPORT_THRESHOLD,
  RETENTION_DAYS,
  MAX_MESSAGE_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PROFILE_LENGTH,
  SEND_WINDOW_MS,
  SEND_MAX_PER_WINDOW,
  REPORT_WINDOW_MS,
  REPORT_MAX_PER_WINDOW,
}
