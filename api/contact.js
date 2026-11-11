import { isSameOriginRequest, processContactSubmission } from '../server/contact-email.js'
import { checkRateLimit, clientIpFrom } from '../server/rate-limit.js'

/* 5 submissions per IP per 15 minutes — mirrors the Express budget so local
   development and production enforce the same spam budget. */
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_WINDOW = 5

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

  const limit = checkRateLimit(clientIpFrom(req), { windowMs: WINDOW_MS, max: MAX_PER_WINDOW })
  if (!limit.allowed) {
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMITED',
      error: 'Too many contact form submissions. Please try again later.',
    })
  }

  if (!isSameOriginRequest(req)) {
    return res.status(403).json({
      success: false,
      code: 'ORIGIN_NOT_ALLOWED',
      error: 'This request origin is not allowed.',
    })
  }

  if (!String(req.headers['content-type'] || '').toLowerCase().includes('application/json')) {
    return res.status(415).json({
      success: false,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      error: 'A JSON request body is required.',
    })
  }

  const contentLength = Number(req.headers['content-length'])
  if (Number.isFinite(contentLength) && contentLength > 1_000_000) {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      error: 'The request is too large.',
    })
  }

  const result = await processContactSubmission(req.body)
  return res.status(result.status).json(result.body)
}
