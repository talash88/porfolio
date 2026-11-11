/* Minimal in-memory sliding-window rate limiter for Vercel serverless
 * functions. The Express server (server/index.js) keeps using
 * express-rate-limit; these serverless-side guards cover the deployed
 * /api/* functions, which bypass Express entirely.
 *
 * Caveat: Vercel scales functions across instances, so each instance holds
 * its own budget. This is best-effort spam protection layered under input
 * validation, payload caps, same-origin checks and provider-side limits —
 * not a hard global quota. No dependencies, fully regex/test friendly. */

/* Fixed-limit per bucket to keep memory bounded under abusive traffic. */
const MAX_TRACKED_KEYS = 5000

const buckets = new Map()

/**
 * Consume one slot for `key`.
 * @returns {{ allowed: boolean, retryAfterSeconds: number, count: number }}
 */
export function checkRateLimit(key, { windowMs, max, now = Date.now() } = {}) {
  const windowKey = `window:${windowMs}:max:${max}`
  const clippedNow = Number.isFinite(now) ? now : Date.now()
  const entry = buckets.has(key) ? buckets.get(key) : new Map()
  if (!buckets.has(key)) buckets.set(key, entry)

  if (entry.get('signature') !== windowKey) {
    entry.clear()
    entry.set('signature', windowKey)
  }

  const times = (entry.get('times') ?? []).filter((ts) => clippedNow - ts < windowMs)
  if (times.length >= max) {
    const oldest = times[0] ?? clippedNow
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (clippedNow - oldest)) / 1000)),
      count: times.length,
    }
  }

  times.push(clippedNow)
  entry.set('times', times)

  /* Keep the limiter's own footprint bounded. */
  if (buckets.size > MAX_TRACKED_KEYS) {
    const firstKey = buckets.keys().next().value
    if (firstKey !== undefined) buckets.delete(firstKey)
  }

  return { allowed: true, retryAfterSeconds: 0, count: times.length }
}

/** Best-effort client IP: Vercel/node both append real IP to x-forwarded-for. */
export function clientIpFrom(req) {
  const forwarded = req?.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }
  return req?.socket?.remoteAddress ?? 'unknown'
}
