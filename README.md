# Tejas — 3D Developer Portfolio

A production-structured personal developer portfolio: Vite + React + TypeScript with a functional Three.js hero, an award-style projects showcase, and every piece of content driven by **one config file**.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Dev server |
| `npm run build` | Type-check + production build → `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Just the TypeScript check |
| `npm run lint` | Oxlint |

## Structure

```text
src/
├── data/portfolio.ts        ← ALL content & links (single source of truth)
├── three/heroScene.ts       ← Three.js scene (instanced light-bar sculpture)
├── components/
│   ├── Header.tsx           ↔ sticky nav, active-section, mobile menu
│   ├── sections/            ↔ Hero, About, Skills, Projects, Experience,
│   │                           Education, Learning, Contact, Footer
│   └── ui/                  ↔ SectionHeading, Icon
├── hooks/                   ↔ useActiveSection, useReducedMotion
└── styles/                  ↔ tokens.css (design system) + per-section CSS
scripts/                     ← Playwright test harnesses (dev-only helpers)
```

## Customizing — one file first

Edit `src/data/portfolio.ts`. Everything — name, headline, about copy, skill
groups, projects, socials, education, email — lives there. Searches like
`[ Your details ]` mark every spot awaiting personalization.

Important behaviors:

- **Projects with no links print no buttons.** Only add `links.live` /
  `links.source` once the URLs are real, so the live site never has dead links.
- **Social links**: set real URLs before publishing. While a URL is still the
  bracketed placeholder, it renders as a non-clickable chip by design.
- **Learning cards take an honest text state** (`progressLabel`) — no fake
  percentage bars.
- Each project gets `hue` to drive its generative artwork (no fabricated
  screenshots needed).

## The 3D hero

`src/three/heroScene.ts` renders an instanced field of glowing bars over a disc.
It reacts to the cursor (ripple + up-close bars), supports drag-to-spin with
damped inertia, and drifts with scroll. Engineering guarantees:

- DPR capped at 1.75; instance count adapts to viewport (640 desktop / 300 mobile)
- The render loop **pauses** when the hero is off-screen or the tab is hidden
  (verified by frame counters)
- `prefers-reduced-motion` renders one calm static frame
- WebGL-less browsers degrade to the typographic hero with zero errors
- Three.js is a lazy async chunk — the first paint never downloads it

## Testing

Harnesses under `scripts/` use Playwright (`npx playwright install chromium` first):

```bash
npm test                          # Contact email helper and Vercel handler
node scripts/shot.mjs            # viewport screenshots + console-error audit
node scripts/test-hero.mjs       # scene reactivity, drag, fallbacks, fps
```

Verified: 320–1920 px with no horizontal overflow; keyboard nav (skip link,
menu Escape, dialog focus management, form errors); production build passes
the same suites.

## Deploying

```bash
npm run build && npm run preview
```

`dist/` is a static site — host it anywhere (Vercel, Netlify, Cloudflare
Pages, GitHub Pages). For subpath hosting, set `base` in `vite.config.ts`.

## Production deployment

The site is a static build (`npm run build` → `dist/`) plus a small Node API +
chat server (`server/index.js`) that owns two route families:

| Route | What it does |
| ----- | ------------ |
| `/api/contact` | Contact form → Brevo email (Vercel Function in production; local Express proxy in development) |
| `/api/health` | Contact API health check |
| `/api/community/*` | Developer Community group chat (SQLite persistence) |
| `/ws` | Same-origin WebSocket for live community chat + presence |

On Vercel, `api/contact.js` and `api/health.js` are same-origin Node.js
Functions. The local `npm run dev` workflow continues to proxy these paths to
the Express routes in `server/index.js`; both use the same contact-email helper.
The Developer Community API and WebSocket remain on their existing Node
backend and are not moved by this setup. Brevo keys belong only in server-side
environment variables, never in `VITE_*` variables.

Example nginx locations:

```nginx
location /api/ { proxy_pass http://127.0.0.1:3001; }
location /ws   { proxy_pass http://127.0.0.1:3001; proxy_http_version 1.1;
                 proxy_set_header Upgrade $http_upgrade;
                 proxy_set_header Connection "upgrade";
                 proxy_set_header Host $host; }  # keep Host: the /ws origin check requires it
```

### Deployment

Deploy the Vercel frontend and Contact API together:

- **Vercel** — `vercel.json` builds `dist/` and configures the Node.js contact
  function duration. Root-level `api/` functions deploy alongside the static
  Vite output. Set `BREVO_API_KEY`, `CONTACT_EMAIL`, and (if different from the
  recipient) `CONTACT_FROM_EMAIL` in the Vercel project's server environment.
  The contact endpoint is same-origin and validates the request Origin against
  the request host.

The existing Node service remains available for the Developer Community and
WebSocket routes:

- **Render (recommended)** — `render.yaml` blueprint is ready: New Blueprint →
  pick the GitHub repo. It mounts a 1 GiB persistent disk at `/var/data`
  (database survives deploys), sets `NODE_ENV/TRUST_PROXY/DB_PATH`, and
  auto-deploys on push. Contact submissions from the Vercel site use the
  Vercel Function, not a Render API URL.
- **Railway / Fly.io / VPS** — use the included `Dockerfile`; mount a volume at
  `/app/data` (or set `DB_PATH`) or community messages reset on restart.

Local production check: `npm run build && NODE_ENV=production npm start`
(then open http://localhost:3001 — the full site, API, and WebSocket).

### Environment variables (copy `.env.example` → `.env`)

| Var | Purpose |
| --- | ------- |
| `BREVO_API_KEY` | Required server-side for contact email delivery. Without it `/api/contact` responds 503. |
| `CONTACT_EMAIL` | Where contact messages are delivered. |
| `CONTACT_FROM_EMAIL` | Optional verified Brevo sender; defaults to `CONTACT_EMAIL`. |
| `ALLOWED_ORIGINS` | Comma-separated origins permitted by the existing Node backend's production CORS policy. |
| `PORT` | Port for the Node server (default 3001). |
| `NODE_ENV` | Set to `production` on the host: serves `dist/` + enforces CORS/CSP. |
| `TRUST_PROXY` | Set to `1` behind Render/nginx so rate limits key on real client IPs. |
| `DB_PATH` | Optional override for the SQLite file (Render disk: `/var/data/community.db`). |

`npm run backup` / `npm run restore <file>` gives WAL-safe database backups —
see `docs/DATABASE.md`.

### Brevo configuration

1. Create a free Brevo account and generate a Transactional API key at
   https://app.brevo.com/settings/keys/api — set it as the server-side
   `BREVO_API_KEY` in Vercel (and `.env` for local development).
2. Brevo only accepts senders validated inside the account. Register with
   `CONTACT_EMAIL` and it is used as the sender automatically, or validate a
   different sender there and set the optional `CONTACT_FROM_EMAIL`.
3. Configure `CONTACT_EMAIL` and, if needed, `CONTACT_FROM_EMAIL` as unprefixed
   Vercel server environment variables, then redeploy. These values and the
   Brevo key are never bundled into frontend JavaScript.

### Production SEO checklist

Set these in `index.html` once the real domain is known (they are commented
out — never invented for you):

- `<link rel="canonical" href="https://your-domain/" />`
- `<meta property="og:url" content="https://your-domain/" />`
- Absolute `og:image` / `twitter:image` URLs (replace the relative `/og-image.png`)
- Add `public/sitemap.xml` with the real origin.

## Notes

- `tests/`-style screenshots land in `shots/` (git-ignored).
- The copy-email + mailto form needs no backend and stores nothing.
# porfolio
