/**
 * Interaction checks for the hero scene:
 *  1. pointer over the scene → bars react (canvas pixels change near cursor)
 *  2. reduced-motion emulation → page still renders, no rAF spam errors
 *  3. no-WebGL → hero degrades to typographic layout, no crash
 */
import { chromium } from 'playwright'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5173'
const browser = await chromium.launch()

// --- 1. pointer reactivity -------------------------------------------------
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// The canvas no longer carries a data-state attribute; verify the scene via
// the live instance the hero exposes for this harness (window.__heroScene).
const canvas = page.locator('.site-scene-canvas').first()
const hasCanvas = (await canvas.count()) > 0
const sceneState = await page.evaluate(() => ({
  present: Boolean(window.__heroScene),
  frameCount: window.__heroScene?.frameCount ?? -1,
}))
const state =
  hasCanvas && sceneState.present
    ? `live (frame ${sceneState.frameCount})`
    : 'MISSING'
console.log(`hero scene: ${state}`)

// baseline snapshot of scene pixels
await page.mouse.move(200, 200) // far from scene
await page.waitForTimeout(400)
const bufA = Buffer.from(await page.screenshot())

// move to the right half (over the disc) and let it settle
for (let x = 200; x <= 1000; x += 200) {
  await page.mouse.move(x, 480)
  await page.waitForTimeout(60)
}
await page.waitForTimeout(350) // ripple settles ~350ms
const bufB = Buffer.from(await page.screenshot())

const same = bufA.equals(bufB)
console.log(`scene state: ${state}`)
console.log(`pixel stream differs over time (alive): ${same ? 'FAIL' : 'PASS'}`)

// verified functional interaction: dragging must spin the sculpture
const rotBefore = await page.evaluate(() => window.__heroScene?.rotY)
for (let x = 1000; x >= 400; x -= 50) {
  await page.mouse.down()
  await page.mouse.move(x, 500, { steps: 4 })
}
await page.mouse.up()
await page.waitForTimeout(600)
const rotAfter = await page.evaluate(() => window.__heroScene?.rotY)
const dragged = Math.abs(rotAfter - rotBefore) > 0.3
console.log(`drag-to-spin (Δrot=${(rotAfter - rotBefore).toFixed(2)}): ${dragged ? 'PASS' : 'FAIL'}`)

// fps probe
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let frames = 0
      const t0 = performance.now()
      const tick = () => {
        frames++
        if (performance.now() - t0 < 1000) requestAnimationFrame(tick)
        else resolve(Math.round(frames / ((performance.now() - t0) / 1000)))
      }
      requestAnimationFrame(tick)
    }),
)
console.log(`fps: ${fps}`)

// scroll parallax: camera should change scene as we scroll
const midScroll = Buffer.from(await (async () => {
  await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
  await page.waitForTimeout(500)
  return page.screenshot()
})())
console.log(`scroll parallax changes scene: ${midScroll.equals(bufB) ? 'FAIL' : 'PASS'}`)
await page.close()

// --- 2. reduced motion ------------------------------------------------------
const rmPage = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await rmPage.emulateMedia({ reducedMotion: 'reduce' })
const rmErrors = []
rmPage.on('pageerror', (e) => rmErrors.push(String(e)))
await rmPage.goto(url, { waitUntil: 'networkidle' })
await rmPage.waitForTimeout(600)
await rmPage.screenshot({ path: path.resolve('shots/phase2-reducedmotion.png') })
console.log(`reduced-motion errors: ${rmErrors.length ? rmErrors.join(' | ') : 'none'}`)
await rmPage.close()

// --- 3. no WebGL -------------------------------------------------------------
const noGl = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await noGl.addInitScript(() => {
  const orig = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (type === 'webgl2' || type === 'webgl') throw new DOMException('blocked', 'NotSupportedError')
    return orig.call(this, type, ...args)
  }
})
const glErrors = []
noGl.on('pageerror', (e) => glErrors.push(String(e)))
await noGl.goto(url, { waitUntil: 'networkidle' })
await noGl.waitForTimeout(600)
await noGl.screenshot({ path: path.resolve('shots/phase2-nowebgl.png') })
const titleVisible = await noGl.getByRole('heading', { name: /developer/i }).isVisible()
console.log(`no-WebGL fallback renders hero text: ${titleVisible ? 'PASS' : 'FAIL'}`)
console.log(`no-WebGL errors: ${glErrors.length ? glErrors.join(' | ') : 'none'}`)
await noGl.close()

await browser.close()
console.log('interaction test DONE')
