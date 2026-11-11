import { createCommunityReport, clientIp } from '../../server/community-api.js'
import { checkRateLimit } from '../../server/rate-limit.js'

/* Same-origin safeguard (parity with api/contact.js): the browser always
 * sends Origin on POSTs, so cross-site callers are refused. */
function isSameOriginRequest(req) {
  const origin = req.headers.origin
  const host = req.headers.host
  if (typeof origin !== 'string' || typeof host !== 'string') return false
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false
  }
}

/** POST → submit a moderation report for a message. */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'Method not allowed.',
    })
  }

  if (!isSameOriginRequest(req)) {
    return res.status(403).json({
      success: false,
      code: 'ORIGIN_NOT_ALLOWED',
      error: 'This request origin is not allowed.',
    })
  }

  /* Cheap per-instance guard that runs before any database work. */
  const limit = checkRateLimit(`report-hint:${clientIp(req)}`, { windowMs: 60_000, max: 10 })
  if (!limit.allowed) {
    return res.status(429).json({ success: false, message: 'Too many reports. Please try again later.' })
  }

  const result = await createCommunityReport(req.body, process.env, clientIp(req))
  return res.status(result.status).json(result.body)
}
