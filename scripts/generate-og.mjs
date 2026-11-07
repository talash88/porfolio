/**
 * Dev-only helper: regenerates public/og-image.png (1200×630) using the
 * site's real palette and wordmark. Run: node scripts/generate-og.mjs
 * (requires `npx playwright install chromium` once).
 */
import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'og-image.png')

const html = `<!doctype html>
<html>
<head><style>
  html, body { margin: 0; }
  body {
    width: 1200px; height: 630px;
    background: #0a0b0e;
    color: #e2e8f0;
    font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    display: flex; align-items: center;
  }
  .accent { color: #c9f24f; }
  .frame {
    box-sizing: border-box; width: 100%;
    padding: 0 96px;
  }
  .eyebrow {
    font-size: 22px; letter-spacing: 0.28em; text-transform: uppercase;
    color: #8a90a0; margin: 0 0 18px;
  }
  h1 {
    font-family: Georgia, 'Times New Roman', serif; font-weight: 600;
    font-size: 118px; line-height: 1.02; margin: 0 0 26px; color: #f1f5f9;
  }
  h1 .accent { font-style: italic; }
  p.sub { font-size: 30px; line-height: 1.5; color: #b6bdcc; margin: 0; max-width: 900px; }
  .bar { width: 132px; height: 10px; border-radius: 6px; background: #c9f24f; margin: 0 0 34px; }
</style></head>
<body>
  <div class="frame">
    <p class="eyebrow">Developer Portfolio</p>
    <div class="bar"></div>
    <h1>Tejas — <span class="accent">full-stack builder.</span></h1>
    <p class="sub">Practical software, developer tooling, and interactive Three.js experiences.</p>
  </div>
</body>
</html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html)
await page.screenshot({ path: outPath })
await browser.close()
console.log(`Wrote ${outPath}`)
