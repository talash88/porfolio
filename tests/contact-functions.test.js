import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import contactHandler from '../api/contact.js'
import healthHandler from '../api/health.js'
import { isSameOriginRequest, processContactSubmission } from '../server/contact-email.js'

const originalFetch = globalThis.fetch
const originalEnv = {
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  CONTACT_EMAIL: process.env.CONTACT_EMAIL,
  CONTACT_FROM_EMAIL: process.env.CONTACT_FROM_EMAIL,
}

const validPayload = {
  name: 'Portfolio Test',
  email: 'visitor@example.com',
  subject: 'Test portfolio contact',
  message: 'A valid contact form message for automated testing.',
}

function responseMock() {
  return {
    headers: {},
    statusCode: 0,
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

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('rejects invalid submissions without calling Brevo', async () => {
  let fetchCalled = false
  globalThis.fetch = async () => {
    fetchCalled = true
    throw new Error('unexpected fetch')
  }

  const result = await processContactSubmission({ ...validPayload, email: 'invalid' }, {})

  assert.equal(result.status, 400)
  assert.equal(result.body.code, 'VALIDATION_ERROR')
  assert.equal(fetchCalled, false)
})

test('returns a safe configuration error when the Brevo key is missing', async () => {
  const result = await processContactSubmission(validPayload, {})

  assert.equal(result.status, 503)
  assert.equal(result.body.code, 'EMAIL_NOT_CONFIGURED')
  assert.doesNotMatch(JSON.stringify(result.body), /key|secret/i)
})

test('Vercel contact route returns a safe error when its server key is missing', async () => {
  delete process.env.BREVO_API_KEY
  const res = responseMock()

  await contactHandler(
    {
      method: 'POST',
      headers: {
        origin: 'https://portfolio.example',
        host: 'portfolio.example',
        'content-type': 'application/json',
      },
      body: validPayload,
    },
    res,
  )

  assert.equal(res.statusCode, 503)
  assert.equal(res.body.code, 'EMAIL_NOT_CONFIGURED')
  assert.doesNotMatch(JSON.stringify(res.body), /key|secret/i)
})

test('sends the configured sender, recipient, reply-to, and timestamp to Brevo', async () => {
  let request
  globalThis.fetch = async (url, options) => {
    request = { url, options }
    return new Response(JSON.stringify({ messageId: 'provider-acceptance-id' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })
  }

  const result = await processContactSubmission(validPayload, {
    BREVO_API_KEY: 'test-key-not-a-real-credential',
    CONTACT_EMAIL: 'owner@example.com',
    CONTACT_FROM_EMAIL: 'verified@example.com',
  })

  const sent = JSON.parse(request.options.body)
  assert.equal(result.status, 200)
  assert.equal(result.body.accepted, true)
  assert.equal(request.url, 'https://api.brevo.com/v3/smtp/email')
  assert.equal(request.options.headers['api-key'], 'test-key-not-a-real-credential')
  assert.deepEqual(sent.sender, { name: 'Portfolio Contact', email: 'verified@example.com' })
  assert.deepEqual(sent.to, [{ email: 'owner@example.com' }])
  assert.deepEqual(sent.replyTo, { email: validPayload.email })
  assert.match(sent.textContent, /Submitted: .+ \(UTC\)/)
  assert.match(sent.htmlContent, /<time datetime="/)
})

test('validates same-origin Vercel requests and rejects cross-origin requests', async () => {
  assert.equal(
    isSameOriginRequest({ headers: { origin: 'https://portfolio.example', host: 'portfolio.example' } }),
    true,
  )
  assert.equal(
    isSameOriginRequest({ headers: { origin: 'https://attacker.example', host: 'portfolio.example' } }),
    false,
  )

  const res = responseMock()
  await contactHandler(
    {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        host: 'portfolio.example',
        'content-type': 'application/json',
      },
      body: validPayload,
    },
    res,
  )

  assert.equal(res.statusCode, 403)
  assert.equal(res.body.code, 'ORIGIN_NOT_ALLOWED')
})

test('Vercel contact route confirms provider acceptance and health route supports GET', async () => {
  process.env.BREVO_API_KEY = 'test-key-not-a-real-credential'
  process.env.CONTACT_EMAIL = 'owner@example.com'
  process.env.CONTACT_FROM_EMAIL = 'verified@example.com'
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ messageId: 'provider-acceptance-id' }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    })

  const contactRes = responseMock()
  await contactHandler(
    {
      method: 'POST',
      headers: {
        origin: 'https://portfolio.example',
        host: 'portfolio.example',
        'content-type': 'application/json',
      },
      body: validPayload,
    },
    contactRes,
  )

  const healthRes = responseMock()
  healthHandler({ method: 'GET' }, healthRes)

  assert.equal(contactRes.statusCode, 200)
  assert.equal(contactRes.body.accepted, true)
  assert.equal(contactRes.headers['Cache-Control'], 'no-store')
  assert.equal(healthRes.statusCode, 200)
  assert.equal(healthRes.body.ok, true)
})
