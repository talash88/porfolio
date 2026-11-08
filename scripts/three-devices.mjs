/**
 * Device / navigation / reduced-motion suite for the Three.js scenes.
 * Complements three-audit.mjs: mobile viewport, deep links, refresh, reduced motion.
 */
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:5173'
let failures = 0
const check = (name, pass, detail = '') => {
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures++
}
/** Wait until window.scrollY stops changing (CSS smooth scroll settled). */
async function waitScrollSettled(page, maxMs = 5000) {
  const t0 = Date.now()
  let last = -1
  while (Date.now() - t0 < maxMs) {
    const y = await page.evaluate(() => window.scrollY)
    if (y === last && y > 0) return y
    last = y
    await page.waitForTimeout(250)
  }
  return last
}

const browser = await chromium.launch()

console.log('=== MOBILE 390x844 (DPR 3) ===')
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const canvasWidth = await page.evaluate(() => document.querySelector('.site-scene-canvas').clientWidth)
  check('mobile: hero canvas sized correctly', await page.evaluate(() => {
    const c = document.querySelector('.site-scene-canvas')
    return c.width > 0 && Math.abs(c.clientWidth - c.parentElement.clientWidth) < 2
  }), `${canvasWidth}px wide`)
  check('mobile: no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 0)
  await page.locator('#playground').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  for (const label of ['Floating 3D Shapes', 'Virtual Retro Computer', 'Cybernetic Grid']) {
    await page.locator('.playground-toolbar button', { hasText: label }).click()
    await page.waitForTimeout(900)
    const shot = await page.locator('.playground-canvas').screenshot()
    check(`mobile preset renders: ${label}`, shot.length > 30000, `${shot.length} bytes`)
  }
  await page.setViewportSize({ width: 844, height: 390 })
  await page.waitForTimeout(700)
  const pgWidth = await page.evaluate(() => document.querySelector('.playground-canvas').width)
  check('mobile: resize (landscape) keeps canvas correct', await page.evaluate(() => {
    const c = document.querySelector('.playground-canvas')
    return Math.abs(c.width - c.clientWidth * Math.min(window.devicePixelRatio, 1.75)) < 20
  }), `canvas ${pgWidth}px`)
  check('mobile: no console errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean')
  await page.close()
}

console.log('=== REFRESH + DIRECT NAVIGATION ===')
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.goto(`${url}/#contact`, { waitUntil: 'networkidle' })
  await waitScrollSettled(page)
  check('deep link #contact lands on contact', await page.evaluate(() => {
    const r = document.getElementById('contact').getBoundingClientRect()
    return r.top < window.innerHeight
  }), `scrollY ${await page.evaluate(() => Math.round(scrollY))}`)
  const f1 = await page.evaluate(() => window.__heroScene.frameCount)
  await page.waitForTimeout(1000)
  const f2 = await page.evaluate(() => window.__heroScene.frameCount)
  check('deep link: hero paused while off-screen', f2 - f1 < 4, `${f1} -> ${f2}`)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(800)
  const f3 = await page.evaluate(() => window.__heroScene.frameCount)
  check('deep link: hero resumes on scroll-up', f3 > f2 + 5, `${f2} -> ${f3}`)
  await page.goto(`${url}/#playground`, { waitUntil: 'networkidle' })
  await waitScrollSettled(page)
  const shot = await page.locator('.playground-canvas').screenshot()
  check('refresh on #playground: preset renders', shot.length > 30000, `${shot.length} bytes`)
  check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean')
  await page.close()
}

console.log('=== REDUCED MOTION ===')
{
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const r1 = await page.evaluate(() => window.__heroScene.frameCount)
  await page.waitForTimeout(1000)
  const r2 = await page.evaluate(() => window.__heroScene.frameCount)
  check('reduced motion: no animation loop (static frame)', r1 === r2, `frames ${r1} === ${r2}`)
  const shot = await page.locator('.site-scene-canvas').screenshot()
  check('reduced motion: static frame still renders', shot.length > 30000, `${shot.length} bytes`)
  check('reduced motion: no errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'clean')
  await ctx.close()
}

console.log('=== PLAYGROUND FPS (desktop, in-view) ===')
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('#playground').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0
    const tick = () => { frames++; requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    setTimeout(() => resolve(Math.round(frames / 2)), 2000)
  }))
  console.log(`  [INFO] rAF rate while playground in view (headless SwiftShader): ${fps} fps — software GL bound; real GPUs run at display refresh`)
  await page.close()
}

await browser.close()
console.log(failures === 0 ? '\nALL DEVICE/NAV CHECKS PASSED ✅' : `\n${failures} CHECK(S) FAILED ❌`)
process.exit(failures === 0 ? 0 : 1)
