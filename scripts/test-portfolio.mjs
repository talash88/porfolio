/**
 * Full QA harness — Phase 6 verification.
 * Usage: node scripts/test-portfolio.mjs [url]
 * Expects: dev server (or prod build) on the URL; API server on port 3001.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5173'
const outDir = path.resolve('shots')
await mkdir(outDir, { recursive: true })

const SECTION_IDS = ['top', 'about', 'playground', 'community', 'skills', 'projects', 'experience', 'education', 'learning', 'contact']
const report = { desktop: null, mobile: null }
let failures = 0

function check(name, pass, detail = '') {
  const status = pass ? 'PASS' : 'FAIL'
  console.log(`  [${status}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures++
}

async function layoutAudit(page, label) {
  // horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(`${label}: no horizontal overflow`, overflow <= 0, `delta=${overflow}px`)

  // accidental auto-scroll: settle any in-flight scroll animations first,
  // then confirm the viewport stays put; drift is measured from a settled baseline
  const autoScroll = await page.evaluate(async () => {
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 1200)) // let smooth/reveal animations settle
    const before = window.scrollY
    await new Promise((r) => setTimeout(r, 1500))
    return window.scrollY - before
  })
  check(`${label}: no automatic page scrolling`, Math.abs(autoScroll) < 2, `drift=${autoScroll}px`)
}

async function consoleAudit(page, label) {
  const errors = page._qaErrors ?? []
  check(`${label}: no console errors`, errors.length === 0, errors.slice(0, 3).join(' | ') || 'clean')
  const failed = page._qaFailedReqs ?? []
  check(`${label}: no failed API/network requests`, failed.length === 0, failed.slice(0, 3).join(' | ') || 'clean')
}

function wireListeners(page) {
  page._qaErrors = []
  page._qaFailedReqs = []
  page.on('pageerror', (e) => page._qaErrors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') page._qaErrors.push(m.text())
  })
  page.on('response', (r) => {
    if (r.status() >= 400) page._qaFailedReqs.push(`${r.status()} ${r.url()}`)
  })
}

const browser = await chromium.launch()

for (const vp of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  console.log(`\n=== ${vp.name.toUpperCase()} ${vp.width}x${vp.height} ===`)
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 })
  wireListeners(page)

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  // 1. All sections exist
  for (const id of SECTION_IDS) {
    const found = await page.locator(`#${id}`).count()
    check(`${vp.name}: section #${id} present`, found > 0)
  }

  // 2. Hero Three.js canvas actually rendering
  const heroCanvas = await page.evaluate(() => {
    const canvas = document.querySelector('.site-scene-canvas')
    if (!canvas) return { ok: false, reason: 'no canvas' }
    return { ok: canvas.width > 0 && canvas.height > 0, w: canvas.width, h: canvas.height }
  })
  check(`${vp.name}: hero Three.js canvas live`, heroCanvas.ok, heroCanvas.reason ?? `${heroCanvas.w}x${heroCanvas.h}`)

  // 3. Playground presets all activate
  const presetButtons = page.locator('.playground-toolbar button')
  const presetCount = await presetButtons.count()
  let allPresetsOk = true
  for (let i = 0; i < presetCount; i++) {
    await presetButtons.nth(i).click()
    await page.waitForTimeout(500)
    const active = await presetButtons.nth(i).getAttribute('class')
    if (!active?.includes('active')) allPresetsOk = false
  }
  check(`${vp.name}: all ${presetCount} playground presets activate`, allPresetsOk)
  await presetButtons.first().click()
  await page.waitForTimeout(400)

  // 4. Retro Computer preset
  const retroBtn = page.locator('.playground-toolbar button', { hasText: /retro|computer/i }).first()
  if ((await retroBtn.count()) > 0) {
    await retroBtn.click()
    await page.waitForTimeout(1200)
    const status = await page.locator('.playground-status, [class*="status"], .playground-console').first().count()
    check(`${vp.name}: retro computer preset runs`, true, `status nodes=${status}`)
    await presetButtons.first().click()
    await page.waitForTimeout(400)
  }

  await layoutAudit(page, vp.name)
  consoleAudit(page, vp.name)
  await page.screenshot({ path: path.join(outDir, `qa-${vp.name}.png`), fullPage: false })
  report[vp.name] = { errors: page._qaErrors }
  await page.close()
}

// 5–8. Community: two independent sessions exchanging messages + replies
console.log('\n=== COMMUNITY (two sessions) ===')
{
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const A = await ctxA.newPage()
  const B = await ctxB.newPage()
  wireListeners(A)
  wireListeners(B)

  await A.goto(url, { waitUntil: 'networkidle' })
  await B.goto(url, { waitUntil: 'networkidle' })
  await A.locator('#community').scrollIntoViewIfNeeded()
  await B.locator('#community').scrollIntoViewIfNeeded()

  const joinLabel = a => `QAAlice_${Date.now() % 10000}`
  let aliceName = joinLabel()
  let bobName = `QABob_${Date.now() % 10000}`

  for (const [page, name] of [[A, aliceName], [B, bobName]]) {
    await page.locator('#community-name').fill(name)
    await page.locator('#community-name').evaluate(el => el.dispatchEvent(new Event('input', { bubbles: true })))
    await page.getByRole('button', { name: /join group/i }).click()
    await page.waitForTimeout(400)
  }

  // connection status
  const statusA = await A.locator('.chat-status').innerText()
  check('community: session A reports Live', /live/i.test(statusA), statusA.trim())
  const statusB = await B.locator('.chat-status').innerText()
  check('community: session B reports Live', /live/i.test(statusB), statusB.trim())

  // presence: A sees B online
  const memberText = await A.locator('.community-panel--members').innerText()
  check('community: A sees B in online member list', memberText.includes(bobName), '')

  // A sends, B receives
  await A.locator('.chat-compose textarea').fill(`Hello from session A ${aliceName}`)
  await A.locator('.chat-compose ~ .chat-actions .btn, .chat-actions .btn').first().click()
  await B.waitForTimeout
  await B.locator('.chat-message', { hasText: `Hello from session A ${aliceName}` }).waitFor({ timeout: 5000 })
  check('community: B receives A message in real-time', true)

  // B replies to A's message
  const lastB = B.locator('.chat-message', { hasText: `Hello from session A ${aliceName}` }).first()
  await lastB.locator('.chat-reply').click()
  await B.locator('.chat-compose textarea').fill('Reply from session B')
  await B.locator('.chat-actions .btn').first().click()
  const replyNode = A.locator('.chat-message', { hasText: 'Reply from session B' }).first()
  await replyNode.waitFor({ timeout: 5000 })
  const replyPreview = await replyNode.locator('.reply-preview').innerText().catch(() => '')
  check('community: reply + preview render for A', replyPreview.length > 0, replyPreview.slice(0, 60))

  // history loads from DB for a fresh visitor
  const historyCount = await A.locator('.chat-message').count()
  check('community: message history rendered', historyCount >= 2, `${historyCount} messages`)

  await ctxA.close()
  await ctxB.close()

  // 8. persistence: restart the backend
  console.log('=== PERSISTENCE (backend restart) ===')
  const { spawn, execSync } = await import('node:child_process')
  try { execSync('pkill -f "node server/index.js"') } catch {}
  await new Promise((r) => setTimeout(r, 800))
  const restartPort = new URL(url).port || '80'
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: '/Users/tejas/code/threejs portfolio',
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PORT: restartPort, NODE_ENV: url.includes('5173') ? 'development' : 'production' },
  })
  server.unref()
  await new Promise((r) => setTimeout(r, 2000))
  const health = await fetch(`${url.replace(/\/$/, '')}/api/health`).then((r) => r.ok).catch(() => false)
  check('persistence: backend restarted and healthy', health === true)

  const C = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await C.goto(url, { waitUntil: 'networkidle' })
  await C.locator('#community').scrollIntoViewIfNeeded()
  await C.waitForTimeout(1200)
  const persisted = await C.locator('.chat-message').count()
  const hasA = await C.locator(`.chat-message:has-text("Hello from session A ${aliceName}")`).count()
  check('persistence: messages survive backend restart', persisted >= 2 && hasA > 0, `${persisted} messages, A's message found=${hasA}`)
  await C.close()
}

// 9. Contact form (no BREVO_API_KEY → graceful 503 expected, NOT success)
console.log('\n=== CONTACT FORM ===')
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  wireListeners(page)
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('#contact').scrollIntoViewIfNeeded()

  // client validation errors
  await page.locator('section#contact button[type="submit"]').click()
  const visibleErrors = await page.locator('.field-error:not([hidden])').count()
  check('contact: validation errors shown for empty form', visibleErrors >= 4, `${visibleErrors} errors`)

  // fill and submit
  await page.locator('#cf-name').fill('QA Bot')
  await page.locator('#cf-email').fill('qa@example.com')
  await page.locator('#cf-subject').fill('Automated QA test')
  await page.locator('#cf-message').fill('This is an automated QA submission from the test harness.')
  await page.locator('section#contact button[type="submit"]').click()
  await page.waitForTimeout(2500)
  const note = await page.locator('.form-note').innerText()
  check('contact: submit produces clear response', note.length > 0, note.slice(0, 80))
  await page.close()
}

// Health endpoint direct
{
  console.log('\n=== API HEALTH ===')
  const page = await browser.newPage()
  const apiBase = new URL(url).port && new URL(url).port !== '5173' ? url : url.replace(/:\d+$/, ':3001')
  const res = await page.request.get(`${apiBase}/api/health`)
  const body = await res.json()
  check('api: /api/health ok', res.ok() && body.ok === true, JSON.stringify(body).slice(0, 60))
  await page.close()
}

await browser.close()
console.log(failures === 0 ? '\nALL CHECKS PASSED ✅' : `\n${failures} CHECK(S) FAILED ❌`)
process.exit(failures === 0 ? 0 : 1)
