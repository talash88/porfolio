/**
 * Safe Brevo authentication diagnostics.
 *
 *   node scripts/check-brevo-auth.mjs
 *
 * Loads .env, trims BREVO_API_KEY, calls the official
 * GET https://api.brevo.com/v3/account endpoint, and prints ONLY a status
 * classification — the key itself is never echoed, logged, or printed.
 */
import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const key = (process.env.BREVO_API_KEY ?? '').trim()

if (!key) {
  console.error('No BREVO_API_KEY loaded from .env (missing or empty).')
  process.exit(1)
}

console.log(`Key loaded: length ${key.length}, prefix ${key.slice(0, 8)}…`)

if (!key.startsWith('xkeysib-')) {
  const wrongType = key.startsWith('xsmtps')
  console.error(
    wrongType
      ? 'This is an SMTP-relay credential (xsmtpsib-…), NOT a Brevo API v3 key.\n' +
          'It cannot authenticate /v3 endpoints — generate an API v3 key at\n' +
          'https://app.brevo.com/settings/keys/api and save it into .env.'
      : 'Unrecognized key prefix — Brevo API v3 keys start with "xkeysib-".\n' +
          'Generate an API v3 key at https://app.brevo.com/settings/keys/api and save it into .env.',
  )
  process.exit(1)
}

let response
try {
  response = await fetch('https://api.brevo.com/v3/account', {
    headers: { 'api-key': key, accept: 'application/json' },
  })
} catch (error) {
  console.error('Network error — could not reach api.brevo.com:', error.message)
  process.exit(2)
}

switch (response.status) {
  case 200:
    console.log('Brevo authentication: HTTP 200 — key is valid ✓  (account details not displayed for privacy)')
    break
  case 401:
    console.error('Brevo authentication: HTTP 401 — key invalid, revoked, expired, or incorrect.')
    break
  case 403:
    console.error('Brevo authentication: HTTP 403 — key valid but lacks permission for this endpoint; check key scope.')
    break
  default:
    console.error(`Brevo authentication: unexpected HTTP ${response.status}`)
}
process.exit(response.status === 200 ? 0 : 1)
