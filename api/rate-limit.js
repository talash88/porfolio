/*
 * Thin re-export: rate limiting lives in server/rate-limit.js so both the
 * Vercel functions (api/*) and the local Node server can share one copy.
 */
export { checkRateLimit, clientIpFrom } from '../server/rate-limit.js'
