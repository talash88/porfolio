/**
 * Save your Brevo API key into .env through a HIDDEN terminal input.
 *
 *   node scripts/configure-email-key.mjs
 *
 * The key is never echoed, logged, or printed — input is captured from the
 * terminal with echo suppressed and only confirmed by length. The script
 * rewrites ONLY the BREVO_API_KEY line in .env, preserving every other
 * variable exactly as they are. The key is validated against Brevo's
 * account endpoint; the validation prints an OK/failed status only.
 */
import { createInterface } from 'node:readline'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '..', '.env')

const readline = createInterface({ input: process.stdin, terminal: true })
// cross-platform hidden input: mute the stream while capturing characters
const { stdin, stdout } = process

let current = ''

stdin.setRawMode?.(true)
stdout.write('Paste your Brevo API key (input is hidden): ')

function cleanup() {
  stdin.setRawMode?.(false)
  stdin.pause()
  readline.close()
}

stdin.on('data', (chunk) => {
  for (const char of chunk.toString('utf8')) {
    if (char === '\r' || char === '\n') {
      stdout.write('\n')
      cleanup()
      handle(current.trim())
      return
    }
    if (char === '\u0003') {
      // Ctrl+C
      stdout.write('\nCancelled — nothing was written.\n')
      cleanup()
      process.exit(130)
    }
    if (char === '\u007f' || char === '\b') {
      current = current.slice(0, -1)
      continue
    }
    current += char
  }
})

function handle(key) {
  if (!key || key.length < 20) {
    console.error('No key entered (or it looks too short) — nothing was written.')
    process.exit(1)
  }

  console.log(`Key accepted (length ${key.length}). Validating with Brevo...`)

  fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': key, accept: 'application/json' } })
    .then((response) => {
      if (response.ok) {
        console.log('Brevo accepted the key ✓  (details not shown for privacy)')
      } else if (response.status === 401) {
        console.error('Brevo rejected the key (401 invalid). It was NOT saved.')
        process.exit(1)
      } else {
        console.warn(`Brevo answered with status ${response.status} — key saved anyway; /api/contact will report issues if any.`)
      }
    })
    .catch((error) => {
      console.warn(`Could not reach Brevo (${error.message}) — key saved without validation.`)
    })
    .finally(() => saveEnv(key))
}

function saveEnv(key) {
  const line = `BREVO_API_KEY=${key}`
  let content = ''
  if (existsSync(envPath)) content = readFileSync(envPath, 'utf8')

  // Replace the key line only; every other .env variable stays untouched.
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

  writeFileSync(envPath, replaced
    ? updated
    : (updated.endsWith('\n') || updated === '' ? '' : '\n') + `${line}\n`)

  console.log(`Saved to .env (${replaced ? 'replaced the existing key line' : 'appended'}). Other variables untouched.`)
  console.log('Restart the API server (npm run dev:server) to load it, then test /api/contact.')
}
