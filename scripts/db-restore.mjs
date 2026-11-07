/**
 * Restore a database backup safely:
 *  1. backs up the CURRENT database first (never destroys the last good state)
 *  2. copies the chosen backup over the live file
 *  3. runs the server's schema migration so the restored file matches code
 *
 * Usage: node scripts/db-restore.mjs <backup-file>
 * Stop the server before restoring (or restart it right after).
 */
import Database from 'better-sqlite3'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const backup = path.resolve(process.argv[2] ?? '')

if (!backup || !existsSync(backup)) {
  console.error('Usage: node scripts/db-restore.mjs <backup-file>')
  process.exit(1)
}

const livePath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '..', 'data', 'community.db')

// Step 1 — snapshot the current state before touching anything.
mkdirSync(path.join(path.dirname(livePath), 'backups'), { recursive: true })
const preRestore = path.join(
  path.dirname(livePath),
  'backups',
  `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`,
)
copyFileSync(livePath, preRestore)
console.log(`Pre-restore snapshot: ${preRestore}`)

// Step 2 — restore.
copyFileSync(backup, livePath)
copyFileSync(`${backup}-wal`, `${livePath}-wal`) // keep WAL siblings consistent
copyFileSync(`${backup}-shm`, `${livePath}-shm`)
console.log(`Restored ${backup} → ${livePath}`)

// Step 3 — make sure the restored file satisfies the current schema.
const db = new Database(livePath)
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
  CREATE INDEX IF NOT EXISTS idx_community_channel_created ON community_messages (channel, created_at);
  CREATE INDEX IF NOT EXISTS idx_community_reports_message ON community_reports (message_id);
  CREATE INDEX IF NOT EXISTS idx_community_messages_reply ON community_messages (reply_to);
`)
const columns = db.prepare('PRAGMA table_info(community_messages)').all().map((c) => c.name)
if (!columns.includes('reply_to')) db.exec('ALTER TABLE community_messages ADD COLUMN reply_to TEXT')
if (!columns.includes('reply_preview')) db.exec('ALTER TABLE community_messages ADD COLUMN reply_preview TEXT')
const rows = db.prepare('SELECT COUNT(*) AS c FROM community_messages').get().c
db.close()
console.log(`Schema verified. community_messages now holds ${rows} row(s).`)
