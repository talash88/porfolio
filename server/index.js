import http from 'node:http'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import dotenv from 'dotenv'
import Database from 'better-sqlite3'
import { WebSocketServer } from 'ws'
import { processContactSubmission } from './contact-email.js'
import {
  communityConfigured,
  createCommunityMessage,
  createCommunityReport,
  getCommunityMessages,
} from './community-api.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const port = Number(process.env.PORT || 3001)
const isProd = process.env.NODE_ENV === 'production'

/* Behind a reverse proxy (Render/Railway/nginx) this makes express-rate-limit
   key on the real client IP instead of the proxy IP. Opt-in via env. */
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)

const dataDir = path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const db = new Database(path.join(dataDir, 'community.db'))
db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS community_messages (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    display_name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    user_id TEXT,
    profile TEXT
  );

  CREATE TABLE IF NOT EXISTS community_reports (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`)

/* Additive migration (preserves every existing row/data): reply support. */
const messageColumns = db.prepare('PRAGMA table_info(community_messages)').all().map((c) => c.name)
if (!messageColumns.includes('reply_to')) {
  db.exec('ALTER TABLE community_messages ADD COLUMN reply_to TEXT')
}
if (!messageColumns.includes('reply_preview')) {
  db.exec('ALTER TABLE community_messages ADD COLUMN reply_preview TEXT')
}

/* Additive indexes: history lookups, reply resolution, report dedupe. */
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_community_channel_created
    ON community_messages (channel, created_at);
  CREATE INDEX IF NOT EXISTS idx_community_reports_message
    ON community_reports (message_id);
  CREATE INDEX IF NOT EXISTS idx_community_messages_reply
    ON community_messages (reply_to);
`)

const MESSAGE_COLUMNS =
  'id, channel, display_name, message, created_at, user_id, profile, reply_to, reply_preview'

const CHANNELS = [
  { id: 'developer-community', name: 'Developer Community', description: 'One shared group for developers, students, and builders to ask questions, share ideas, and connect in real time.' },
]

const sanitise = (value) => String(value ?? '').trim()

const truncate = (value, max) => {
  const text = String(value ?? '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

const sanitizeText = (input) => {
  const value = String(input ?? '').replace(/[<>]/g, '')
  return value.trim().replace(/\s+/g, ' ')
}

const normaliseGroup = (value) => {
  const candidate = sanitise(value)
  return candidate || 'developer-community'
}

app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            fontSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            frameAncestors: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'none'"],
          },
        }
      : false,
    crossOriginResourcePolicy: false,
  }),
)

/* Production CORS is same-origin by default; split frontends must be explicitly
   listed in ALLOWED_ORIGINS. Dev is exempt because Vite proxies local requests
   and rewrites Host. */
const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
)
app.use('/api', (req, res, next) => {
  if (!isProd) return next()
  const origin = req.headers.origin
  if (!origin) return next() // same-origin GET/POST without CORS, curl, health checks
  let originHost
  try {
    originHost = new URL(origin).host
  } catch {
    return res.status(403).json({
      success: false,
      code: 'CORS_ORIGIN_DENIED',
      error: 'Cross-origin API access is not allowed.',
    })
  }
  const sameOrigin = originHost === req.headers.host
  if (!sameOrigin && !allowedOrigins.has(origin) && !allowedOrigins.has(originHost)) {
    return res.status(403).json({
      success: false,
      code: 'CORS_ORIGIN_DENIED',
      error: 'Cross-origin API access is not allowed.',
    })
  }
  res.vary('Origin')
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  return next()
})

/* Rate limiting is scoped to the contact form so community reads/writes are
   never throttled. Contact spam protection keeps the original budget. */
app.use(
  '/api/contact',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      code: 'RATE_LIMITED',
      error: 'Too many contact form submissions. Please try again later.',
    },
  }),
)

app.use(express.json({ limit: '1mb' }))

/* When Supabase is configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
 * community routes use the same Supabase-backed logic as the Vercel
 * functions — so local development exercises the exact production data
 * layer. Without Supabase env vars, the original SQLite routes below stay
 * unchanged and keep working. */
const communitySupabaseEnabled = communityConfigured()
if (communitySupabaseEnabled) {
  const communityHandler = (processor) => async (req, res) => {
    const result = await processor(req.body ?? {}, process.env, req.socket.remoteAddress || 'unknown')
    return res.status(result.status).json(result.body)
  }
  app.get('/api/community/messages', async (_req, res) => {
    const result = await getCommunityMessages(process.env)
    return res.status(result.status).json(result.body)
  })
  app.post('/api/community/messages', communityHandler(createCommunityMessage))
  app.post('/api/community/report', communityHandler(createCommunityReport))
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    status: 'contact service running',
  })
})

app.get('/api/community/channels', (_req, res) => {
  res.json({ channels: CHANNELS })
})

app.get('/api/community/messages', (req, res) => {
  const group = normaliseGroup(req.query.group || req.query.channel)
  const rows = db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS}
       FROM community_messages
       WHERE channel = ?
       ORDER BY created_at ASC
       LIMIT 120`,
    )
    .all(group)

  res.json({ messages: rows })
})

/* Moderate budget for report spam; reads stay unthrottled. */
app.use(
  '/api/community/report',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many reports. Please try again later.' },
  }),
)

app.post('/api/community/report', (req, res) => {
  const messageId = sanitise(req.body?.messageId)
  if (!messageId) {
    return res.status(400).json({ success: false, message: 'A message identifier is required.' })
  }

  const existing = db.prepare('SELECT id FROM community_messages WHERE id = ?').get(messageId)
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Message not found.' })
  }

  const reportId = crypto.randomUUID()
  db.prepare('INSERT INTO community_reports (id, message_id) VALUES (?, ?)').run(reportId, messageId)

  return res.json({ success: true, message: 'Report sent to moderation.' })
})

app.post('/api/contact', async (req, res) => {
  const result = await processContactSubmission(req.body)
  return res.status(result.status).json(result.body)
})

const server = http.createServer(app)
/* Browser WebSocket clients always send an Origin header. Only accept
   connections whose Origin host matches the request Host (same-origin),
   which stays correct behind reverse proxies and in production. */
function isAllowedWsOrigin(originHeader, hostHeader) {
  if (!originHeader) return true
  try {
    return new URL(originHeader).host === hostHeader
  } catch {
    return false
  }
}

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 64 * 1024, // refuse oversized frames instead of buffering them
  verifyClient: (info) => isAllowedWsOrigin(info.req.headers.origin, info.req.headers.host),
})
const clientState = new Map()

/* Per-connection chat throttle: max messages per 10s window. */
const CHAT_WINDOW_MS = 10_000
const CHAT_MAX_PER_WINDOW = 8

function getChannelMembers(channel) {
  const members = []
  for (const socket of clientState.values()) {
    if (socket.channel === channel) {
      members.push({
        id: socket.userId,
        display_name: socket.displayName,
        profile: socket.profile,
        channel,
      })
    }
  }
  return members
}

function broadcastPresence(channel) {
  const members = getChannelMembers(channel)
  for (const client of clientState.values()) {
    if (client.channel === channel) {
      client.socket.send(JSON.stringify({ type: 'presence', channel, members }))
    }
  }
}

function broadcastToChannel(channel, payload) {
  for (const client of clientState.values()) {
    if (client.channel === channel) {
      client.socket.send(JSON.stringify(payload))
    }
  }
}

function getHistory(channel) {
  return db
    .prepare(
      `SELECT ${MESSAGE_COLUMNS}
       FROM community_messages
       WHERE channel = ?
       ORDER BY created_at ASC
       LIMIT 60`,
    )
    .all(channel)
}

wss.on('connection', (socket) => {
  const state = {
    socket,
    userId: crypto.randomUUID(),
    displayName: 'Guest',
    profile: 'Developer',
    channel: 'general',
    recentMessages: [],
    messageTimes: [],
  }
  clientState.set(socket, state)

  socket.send(
    JSON.stringify({
      type: 'history',
      channel: 'developer-community',
      messages: getHistory('developer-community'),
      you: state.userId,
    }),
  )
  broadcastPresence('developer-community')

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString())
      if (!message || typeof message !== 'object') return

      if (message.type === 'join') {
        const displayName = sanitizeText(message.display_name || '').slice(0, 24)
        const profile = sanitizeText(message.profile || '').slice(0, 80)
        const nextChannel = normaliseGroup(message.group || message.channel)

        if (!displayName || displayName.length < 2) {
          socket.send(JSON.stringify({ type: 'error', message: 'Choose a display name with at least 2 characters.' }))
          return
        }

        state.displayName = displayName
        state.profile = profile || 'Developer'

        const previousChannel = state.channel
        state.channel = nextChannel

        if (previousChannel !== nextChannel) {
          broadcastPresence(previousChannel)
        }

        socket.send(JSON.stringify({ type: 'history', channel: nextChannel, messages: getHistory(nextChannel), you: state.userId }))
        broadcastPresence(nextChannel)
        return
      }

      if (message.type === 'message') {
        const channel = normaliseGroup(message.group || message.channel)
        const text = sanitizeText(message.message)

        if (!state.displayName || state.displayName === 'Guest') {
          socket.send(JSON.stringify({ type: 'error', message: 'Join the community before sending a message.' }))
          return
        }

        if (!text || text.length < 1 || text.length > 500) {
          socket.send(JSON.stringify({ type: 'error', message: 'Messages must be between 1 and 500 characters.' }))
          return
        }

        /* Per-connection flood control: sliding 10s window. */
        const nowMs = Date.now()
        state.messageTimes = state.messageTimes.filter((ts) => nowMs - ts < CHAT_WINDOW_MS)
        if (state.messageTimes.length >= CHAT_MAX_PER_WINDOW) {
          socket.send(JSON.stringify({ type: 'error', message: 'You are sending messages too quickly. Please slow down.' }))
          return
        }
        state.messageTimes.push(nowMs)

        /* Reply resolution: only accept a reply_to that points to a real,
           stored message so previews can never be forged by the client. */
        let replyTo = null
        let replyPreview = null
        const requestedReplyId = sanitise(message.reply_to)
        if (requestedReplyId) {
          const target = db
            .prepare('SELECT id, display_name, message FROM community_messages WHERE id = ?')
            .get(requestedReplyId)
          if (target && target.id && target.message) {
            replyTo = target.id
            replyPreview = truncate(`${target.display_name}: ${target.message}`, 140)
          }
        }

        const id = crypto.randomUUID()
        const createdAt = new Date().toISOString()

        db.prepare(
          `INSERT INTO community_messages (id, channel, display_name, message, created_at, user_id, profile, reply_to, reply_preview)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, channel, state.displayName, text, createdAt, state.userId, state.profile, replyTo, replyPreview)

        const payload = {
          type: 'message',
          message: {
            id,
            channel,
            display_name: state.displayName,
            message: text,
            created_at: createdAt,
            user_id: state.userId,
            profile: state.profile,
            reply_to: replyTo,
            reply_preview: replyPreview,
          },
        }

        broadcastToChannel(channel, payload)
        broadcastPresence(channel)
      }
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Message payload is invalid.' }))
    }
  })

  socket.on('close', () => {
    const closedChannel = state.channel
    clientState.delete(socket)
    broadcastPresence(closedChannel)
  })
})

/* Heartbeat: drop connections that died without a close frame (mobile network
   switches, machine sleep). Unreaped sockets would linger in presence lists. */
const heartbeat = setInterval(() => {
  for (const [socket, state] of clientState) {
    if (state.isAlive === false) {
      // missed a full ping cycle — treat the connection as dead
      socket.terminate()
      clientState.delete(socket)
      broadcastPresence(state.channel)
      continue
    }
    state.isAlive = false
    socket.ping()
  }
}, 30_000)
wss.on('connection', (socket) => {
  const state = clientState.get(socket)
  state.isAlive = true
  socket.on('pong', () => {
    if (clientState.has(socket)) clientState.get(socket).isAlive = true
  })
})
wss.on('close', () => clearInterval(heartbeat))
wss.on('error', (error) => console.error('WebSocket server error:', error.message))

/* API 404: any unknown /api/* path must return JSON, never the Express
   HTML error page or the SPA fallback — a misrouted API request should be
   diagnosable by clients (and by the contact form's error handling). */
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, code: 'API_NOT_FOUND', error: 'API endpoint not found.' })
})

/* In production the same Node process serves the built frontend, so the
   portfolio, the API and the WebSocket share one HTTPS origin with no extra
   proxy configuration needed (Render/Railway/Fly single-service deploys). */
const distDir = path.join(__dirname, '..', 'dist')
if (isProd) {
  app.use(express.static(distDir, { maxAge: '1y', index: false }))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/ws')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((error, _req, res, _next) => {
  console.error('Unhandled server error:', error?.name ?? 'unknown')
  res.status(500).json({
    success: false,
    code: 'SERVER_ERROR',
    error: 'Unexpected server error. Please try again later.',
  })
})

const httpServer = server.listen(port, '0.0.0.0', () => {
  console.log(`Portfolio API + community chat listening on http://localhost:${port}${isProd ? ' (serving dist/)' : ''}`)
})

let shuttingDown = false
function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`${signal} received — shutting down gracefully...`)
  clearInterval(heartbeat)
  wss.close()
  for (const [socket, state] of clientState) {
    try {
      socket.close(1001, 'Server shutting down')
    } catch {
      socket.terminate()
    }
    clientState.delete(state.socket)
  }
  httpServer.close(() => {
    try {
      db.close()
    } catch (error) {
      console.error('Error closing database:', error)
    }
    process.exit(0)
  })
  /* Force-exit if something refuses to close within 10s. */
  setTimeout(() => {
    console.error('Graceful shutdown timed out — exiting.')
    try {
      db.close()
    } catch {
      /* already closed */
    }
    process.exit(0)
  }, 10_000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
