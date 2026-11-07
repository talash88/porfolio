/**
 * Safe SQLite backup — uses the online-backup API so the database can be
 * copied while the server keeps running (WAL-safe, no partial states).
 *
 * Usage: node scripts/db-backup.mjs [destination-file]
 * Default destination: data/backups/community-<timestamp>.db
 */
import Database from 'better-sqlite3'
import { mkdirSync, existsSync, statSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sourcePath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '..', 'data', 'community.db')

if (!existsSync(sourcePath)) {
  console.error(`No database found at ${sourcePath}`)
  process.exit(1)
}

const backupDir = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.join(path.dirname(sourcePath), 'backups')
mkdirSync(backupDir, { recursive: true })

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const target =
  process.argv[2] && !process.argv[2].startsWith('-')
    ? path.resolve(process.argv[2])
    : path.join(backupDir, `community-${stamp}.db`)

const source = new Database(sourcePath, { readonly: true })
source.backup(target).then(() => {
  source.close()
  const size = statSync(target).size
  console.log(`Backup created: ${target} (${(size / 1024).toFixed(1)} KiB)`)
  // Sanity check: open the copy and verify tables exist.
  const verify = new Database(target, { readonly: true })
  const tables = verify
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name)
  const rows = verify.prepare('SELECT COUNT(*) AS c FROM community_messages').get().c
  verify.close()
  console.log(`Verified: tables=${tables.join(', ')} community_messages=${rows} row(s)`)
})
