# Database

The portfolio has two storage layers, selected by configuration:

1. **Developer Community in production — Supabase Postgres** (see
   `supabase/schema.sql` and the README). One public group
   (`developer-community`), realtime delivery via Supabase Realtime,
   read-only RLS for the browser.
2. **Local/optional fallback — SQLite (better-sqlite3)** in WAL mode at
   `data/community.db`, backing the legacy local community chat and REST
   routes in `server/index.js`. This section documents that layer.

SQLite is the right choice for this project because:

- The production host runs one Node process serving the site + API + WebSocket
  (Render/Railway/Fly with a persistent disk). A single writer is all the
  community chat needs.
- No network round-trips — reads/writes are synchronous and fast.
- Zero-configuration with the data directory persisted between deploys.

PostgreSQL would only become necessary if scaling to multiple server
instances. The data access is contained in `server/index.js`; migrating later
means swapping `better-sqlite3` calls for `pg` pool calls — the schema
transfers 1:1.

> Deploy requirement: the host must mount **persisted storage at `data/`**
> (Render: a Disk mounted to the repo root/folder; Railway: a Volume). Without
> a persistent disk, community messages reset on every deploy.

## Schema

Migrations are **additive and idempotent**, applied automatically at server
startup (safe on every boot, never drops or rewrites data):

```sql
community_messages (
  id            TEXT PRIMARY KEY,          -- UUID
  channel       TEXT NOT NULL,             -- always 'developer-community'
  display_name  TEXT NOT NULL,
  message       TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  user_id       TEXT,
  profile       TEXT,
  reply_to      TEXT,                      -- added by migration 1
  reply_preview TEXT                        -- added by migration 1
)
community_reports (
  id         TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)

Indexes:
  idx_community_channel_created (channel, created_at)  -- history queries
  idx_community_reports_message (message_id)           -- report FK lookups
  idx_community_messages_reply  (reply_to)             -- reply resolution
```

All statements use prepared statements (`?` placeholders) — SQL injection is
structurally prevented. Writes are effectively atomic: better-sqlite3
transactions are synchronous, and WAL mode keeps readers unblocked.

## Initialization

The server creates the data directory, tables, indexes, and missing columns on
first start. Nothing to run manually.

```bash
npm run dev:server        # dev
npm start                 # production (with NODE_ENV=production serving dist/)
```

## Backup

While the server is running (online backup, WAL-safe):

```bash
npm run backup            # → data/backups/community-<timestamp>.db (+ row verification)
```

Or to a custom file: `node scripts/db-backup.mjs /path/to/backup.db`

Nightly on the host (Render cron / system crontab):

```bash
0 4 * * * cd /app && node scripts/db-backup.mjs
```

## Restore

Stop the server first (or restart it right after), then:

```bash
npm run restore data/backups/community-2026-11-07T…db
```

The restore script:

1. snapshots the current database to `data/backups/pre-restore-<timestamp>.db`
   first — the last good state can never be destroyed,
2. copies the chosen backup over `data/community.db`,
3. re-applies the current schema/migrations and reports the row count.

## Data retention notes

- Messages are kept in `community_messages` rows — no cron purge exists.
- Only traffic terms: history endpoints cap at the last ~120 messages per
  request for display, but **all rows persist on disk**.
