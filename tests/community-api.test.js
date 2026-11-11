import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { checkRateLimit, clientIpFrom } from '../server/rate-limit.js'
import {
  communityConfigured,
  createCommunityMessage,
  createCommunityReport,
  getCommunityMessages,
  sanitizeCommunityText,
} from '../server/community-api.js'
import messagesHandler from '../api/community/messages.js'
import reportHandler from '../api/community/report.js'

const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
}

const env = {
  SUPABASE_URL: 'https://project.example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-not-a-real-credential',
}

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

/** Distinct IPs per call so the shared per-IP rate-limit budget of one test
 * never starves another (the limiter is module-level by design). */
const ip = (n) => `203.0.113.${n}`

function responseMock() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

const restResponse = (rows, status = 200) =>
  new Response(JSON.stringify(rows), { status, headers: { 'content-type': 'application/json' } })

const identity = {
  display_name: 'Visitor',
  profile: 'Student developer',
  user_id: '11111111-1111-4111-8111-111111111111',
  message: 'Hello from the verification suite',
}

test('configuration detection reports both present and absent setups', () => {
  assert.equal(communityConfigured({}), false)
  assert.equal(
    communityConfigured({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }),
    true,
  )
})

test('history reads exactly one public group below the report threshold', async () => {
  let requestedUrl = ''
  globalThis.fetch = async (url) => {
    requestedUrl = url
    return restResponse([
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', channel: 'developer-community', display_name: 'A', message: 'kept', created_at: '2026-11-01T00:00:00Z' },
    ])
  }

  const result = await getCommunityMessages(env)

  assert.equal(result.status, 200)
  assert.equal(result.body.messages.length, 1)
  assert.match(requestedUrl, /channel=eq\.developer-community/)
  assert.match(requestedUrl, /reported_count=lt\.3/)
  assert.match(requestedUrl, /order=created_at\.asc/)
  assert.match(requestedUrl, /limit=120/)
})

test('message validation rejects bad input before any database call', async () => {
  let fetchCalled = false
  globalThis.fetch = async () => {
    fetchCalled = true
    throw new Error('unexpected fetch')
  }

  const samples = await Promise.all([
    createCommunityMessage({ ...identity, display_name: 'V' }, env, ip(1)),
    createCommunityMessage({ ...identity, display_name: 'x'.repeat(30) }, env, ip(2)),
    createCommunityMessage({ ...identity, message: '' }, env, ip(3)),
    createCommunityMessage({ ...identity, message: 'y'.repeat(600) }, env, ip(4)),
  ])

  for (const result of samples) {
    assert.equal(result.status, 400)
    assert.equal(result.body.code, 'VALIDATION_ERROR')
  }
  assert.equal(fetchCalled, false)
})

test('a genuine reply is resolved, a forged reply id is dropped', async () => {
  const requests = []
  const validReplyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method, body: options.body })
    if (options.method === 'POST') {
      return restResponse(
        [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ...identity, reply_preview: 'Author: earlier' }],
        201,
      )
    }
    if (String(url).includes(`id=eq.${validReplyId}`)) {
      return restResponse([{ id: validReplyId, display_name: 'Author', message: 'earlier', reply_preview: null }])
    }
    return restResponse([])
  }

  const resolved = await createCommunityMessage({ ...identity, reply_to: validReplyId }, env, ip(5))
  assert.equal(resolved.status, 201)
  const sent = JSON.parse(requests.find((entry) => entry.method === 'POST').body)
  assert.equal(sent.reply_to, validReplyId)
  assert.equal(sent.reply_preview, 'Author: earlier')

  const forged = await createCommunityMessage(
    { ...identity, reply_to: '00000000-0000-4000-8000-000000000000' },
    env,
    ip(6),
  )
  assert.equal(forged.status, 201)
  const forgedSent = JSON.parse(requests.at(-1).body)
  assert.equal(forgedSent.reply_to, null)
  assert.equal(forgedSent.reply_preview, null)
})

test('sanitisation matches the historical SQLite behaviour', () => {
  assert.equal(sanitizeCommunityText('  <b>bold</b>   text '), 'bbold/b text')
  assert.equal(sanitizeCommunityText('a<script>\nb</script> '), 'ascript b/script')
})

test('message bodies are sanitised before storage', async () => {
  let storedBody = null
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST' && storedBody === null) {
      storedBody = JSON.parse(options.body)
      return restResponse([{ id: '99999999-9999-4999-8999-999999999999', ...storedBody }])
    }
    return restResponse([])
  }

  const result = await createCommunityMessage(
    { ...identity, message: 'hi <script>alert(1)</script>   there ' },
    env,
    ip(11),
  )

  assert.equal(result.status, 201)
  assert.equal(result.body.message.message, 'hi scriptalert(1)/script there')
})

test('reports require an existing message and increment toward hiding', async () => {
  const messageId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method })
    if (String(url).includes('community_reports')) return restResponse([])
    if (String(url).includes(`id=eq.${messageId}`)) {
      return options.method === 'PATCH'
        ? restResponse([{ id: messageId }])
        : restResponse([{ id: messageId, reported_count: 2 }])
    }
    return restResponse([])
  }

  const listed = await createCommunityReport({ messageId }, env, ip(7))
  assert.equal(listed.status, 200)
  assert.equal(listed.body.message, 'Report sent to moderation.')
  assert.ok(requests.some((entry) => entry.method === 'PATCH'))

  const missing = await createCommunityReport({ messageId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }, env, ip(8))
  assert.equal(missing.status, 404)
  assert.equal(missing.body.code, 'MESSAGE_NOT_FOUND')

  const malformed = await createCommunityReport({ messageId: 'not-a-uuid' }, env, ip(9))
  assert.equal(malformed.status, 404)

  const blank = await createCommunityReport({}, env, ip(10))
  assert.equal(blank.status, 400)
})

test('the in-memory limiter allows exactly the configured budget', () => {
  const fixedNow = 1_000_000
  const key = 'chat:198.51.100.7'
  let allowedCalls = 0
  for (let index = 0; index < 10; index += 1) {
    const result = checkRateLimit(key, { windowMs: 10_000, max: 8, now: fixedNow })
    if (result.allowed) allowedCalls += 1
    else assert.ok(result.retryAfterSeconds >= 1)
  }
  assert.equal(allowedCalls, 8)
})

test('clientIpFrom prefers the forwarded address and falls back safely', () => {
  assert.equal(clientIpFrom({ headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' } }), '203.0.113.5')
  assert.equal(clientIpFrom({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }), '127.0.0.1')
  assert.equal(clientIpFrom({}), 'unknown')
})

/* ------------------------------------------------------------ handlers */

test('Vercel community messages handler routes GET and POST', async () => {
  process.env.SUPABASE_URL = env.SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

  globalThis.fetch = async (url, options) => {
    if (options.body) return restResponse([{ id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }], 201)
    return restResponse([
      { id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', display_name: 'A', message: 'm', created_at: '2026-11-01T00:00:00Z' },
    ])
  }

  const getRes = responseMock()
  await messagesHandler({ method: 'GET', headers: {} }, getRes)
  assert.equal(getRes.statusCode, 200)
  assert.equal(getRes.body.messages.length, 1)
  assert.equal(getRes.headers['Cache-Control'], 'no-store')

  const postRes = responseMock()
  await messagesHandler(
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: identity },
    postRes,
  )
  assert.equal(postRes.statusCode, 201)
  assert.ok(postRes.body.message.id)

  const methodRes = responseMock()
  await messagesHandler({ method: 'PUT', headers: {} }, methodRes)
  assert.equal(methodRes.statusCode, 405)
})

test('Vercel report handler enforces the same-origin rule like the contact function', async () => {
  globalThis.fetch = async () => restResponse([{ id: 'abababab-abab-4bab-8bab-abababababab', reported_count: 0 }])

  const crossOrigin = responseMock()
  await reportHandler(
    {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        host: 'portfolio.example',
        'content-type': 'application/json',
      },
      body: { messageId: 'abababab-abab-4bab-8bab-abababababab' },
    },
    crossOrigin,
  )
  assert.equal(crossOrigin.statusCode, 403)
})

test('unconfigured database responses stay safe', async () => {
  const result = await getCommunityMessages({})
  assert.equal(result.status, 503)
  assert.equal(result.body.code, 'COMMUNITY_NOT_CONFIGURED')
  assert.doesNotMatch(JSON.stringify(result.body), /key|secret|service/i)
})
