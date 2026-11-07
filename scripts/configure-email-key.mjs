/**
 * Save your Brevo API key into .env through a HIDDEN terminal input.
 *
 *   node scripts/configure-email-key.mjs [env-file]   # env-file is optional
 *
 * - The key is never echoed, logged, or printed (raw-mode capture, echo off).
 * - Validation calls Brevo's official account endpoint and prints only an
 *   OK/failed status.
 * - Only the BREVO_API_KEY line is rewritten; every other .env variable is
 *   preserved exactly. Nothing is written if the key is rejected or cancelled.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const envPath = path.resolve(
  process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'),
)

const askHidden = () =>
  new Promise((resolve, reject) => {
    const { stdin, stdout } = process
    if (!stdin.isTTY) {
      reject(new Error('This script needs an interactive terminal (run it directly in your shell).'))
      return
    }

    let value = ''
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      stdin.setRawMode(false)
      stdin.resume()
      stdin.off('data', onData)
      stdout.write('\n')
      resolve(result)
    }
    const onData = (chunk) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\r' || char === '\n') return finish(value)
        if (char === '\u0003') return finish(null) // Ctrl+C
        if (char === '\u007f' || char === '\b') {
          value = value.slice(0, -1)
          continue
        }
        value += char
      }
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
    stdout.write('Paste your Brevo API key (input is hidden, Enter to confirm): ')
  })

const validateWithBrevo = async (key) => {
  // Official account endpoint — the exact same key your API key will use.
  let status = 0
  try {
    const response = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': key, accept: 'application/json' },
    })
    status = response.status
  } catch (error) {
    // Network failure: do not print exception details (they can embed nothing
    // sensitive, but status-only reporting keeps the convention uniform).
    console.warn('Could not reach Brevo to validate the key.')
    return 'network-error'
  }
  if (status === 200) {
    console.log('Brevo accepted the key ✓  (details hidden for privacy)')
    return 'ok'
  }
  if (status === 401) {
    console.error('Brevo rejected this key (401 invalid). Nothing was saved.')
    return 'invalid'
  }
  console.warn(`Brevo answered with status ${status} — treating as unverifiable.`)
  return `status-${status}`
}

function saveEnv(key) {
  const line = `BREVO_API_KEY=${key}`
  let content = ''
  if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, 'utf8')

  // Replace only the key line; all other variables stay byte-for-byte intact.
  let replaced = false
  const updated = content
    .split('\n')
    .map((entry) => {
      if (entry.startsWith('BREVO_API_KEY=')) {
        replaced = true
        return line
      }
      return entry
    })
    .join('\n')

  fs.writeFileSync(envPath, replaced ? updated : updated + (updated.endsWith('\n') || updated === '' ? '' : '\n') + line + '\n')
  console.log(`Saved to ${path.basename(envPath)} (${replaced ? 'existing key line replaced' : 'appended'}). Other variables untouched.`)
  console.log('Restart the API server, e.g. npm run dev:server (or tell the assistant to restart it).')
}

const key = await askHidden()
if (key === null) {
  console.log('Cancelled. Nothing was written.')
  process.exit(0)
}
if (!key || key.length < 20) {
  console.error('No usable key was entered — nothing was written.')
  process.exit(1)
}

console.log(`Key accepted (length ${key.length}). Validating with Brevo's official account endpoint...`)
const verdict = await validateWithBrevo(key)
if (verdict === 'invalid') process.exit(1)
saveEnv(key)
process.exit(0)
