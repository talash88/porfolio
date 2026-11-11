import {
  createCommunityMessage,
  getCommunityMessages,
  clientIp,
} from '../../server/community-api.js'

/** GET  → message history (last 120, reports below the hide threshold)
 *  POST → send a new message (validated, rate-limited, reply-resolved) */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'GET') {
    const result = await getCommunityMessages()
    return res.status(result.status).json(result.body)
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      error: 'Method not allowed.',
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
  if (Number.isFinite(contentLength) && contentLength > 50_000) {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      error: 'The request is too large.',
    })
  }

  const result = await createCommunityMessage(req.body, process.env, clientIp(req))
  return res.status(result.status).json(result.body)
}
