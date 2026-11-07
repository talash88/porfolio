/**
 * Visual test harness — screenshots the dev server at a few viewports.
 * Usage: node scripts/shot.mjs [url] [prefix]
 * Assumes the Vite dev server is already running on :5173.
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5173'
const prefix = process.argv[3] ?? 'phase'
const outDir = path.resolve('shots')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch()

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
]

for (const vp of viewports) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(outDir, `${prefix}-${vp.name}.png`) })
  console.log(`${prefix}-${vp.name}: "${await page.title()}" ${vp.width}x${vp.height} errors=${errors.length ? errors.join(' | ') : 'none'}`)
  await page.close()
}

await browser.close()
console.log('DONE')
