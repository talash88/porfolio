-- ===========================================================================
-- Tejas Portfolio — Developer Community (Supabase Postgres)
--
-- Run this ONCE in the Supabase dashboard:
--   Dashboard → SQL Editor → "New query" → paste everything → Run
--
-- design notes:
--   * Channel: exactly ONE group ('developer-community') — per requirement.
--   * RLS is enabled: the public anon key may only SELECT. All writes happen
--     through Vercel functions with the service-role key, which bypasses
--     RLS — SendMessage via the anon key is refused with 403.
--   * Moderation: reported_count >= 3 hides a message from history/feeds.
--   * Retention: rows older than 90 days are pruned on each new message
--     (see server/community-api.js), keeping the free-tier database small.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- community_messages — chat history (column-compatible with the SQLite
-- implementation, so the same frontend shape keeps working)
-- ---------------------------------------------------------------------------
create table if not exists public.community_messages (
  id            uuid primary key default gen_random_uuid(),
  channel       text not null,                          -- always 'developer-community'
  display_name  text not null,
  message       text not null,
  created_at    timestamptz not null default now(),
  user_id       text,
  profile       text,
  reply_to      uuid references public.community_messages (id) on delete set null,
  reply_preview text,
  reported_count integer not null default 0
);

create index if not exists idx_community_channel_created
  on public.community_messages (channel, created_at);
create index if not exists idx_community_messages_reply
  on public.community_messages (reply_to);
create index if not exists idx_community_messages_retention
  on public.community_messages (created_at);

-- ---------------------------------------------------------------------------
-- community_reports — moderation input (does not expose reporter identity)
-- ---------------------------------------------------------------------------
create table if not exists public.community_reports (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.community_messages (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists idx_community_reports_message
  on public.community_reports (message_id);

-- ---------------------------------------------------------------------------
-- Row-level security: expose read ONLY. Writes are server-side only.
-- ---------------------------------------------------------------------------
alter table public.community_messages enable row level security;
alter table public.community_reports   enable row level security;

drop policy if exists "community_messages_read" on public.community_messages;
create policy "community_messages_read"
  on public.community_messages
  for select
  to anon
  using (true);

-- community_reports is NEVER readable by the browser (no policy, no grant):
-- only the server-side moderation counter touches it.

-- ---------------------------------------------------------------------------
-- Privileges for the new API-key roles (sb_publishable_ → anon,
-- sb_secret_ → service_role). Tables created by `postgres` in the SQL
-- editor do not receive default privileges on new projects, so grant them
-- explicitly. RLS still filters every anon read — grants only permit the
-- operations RLS already allows.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, service_role;
grant select on public.community_messages to anon;
grant all on public.community_messages to service_role;
grant all on public.community_reports   to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast inserts of community_messages to subscribed browsers.
-- (Supabase Realtime is role-aware — the same RLS read policy applies.)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename  = 'community_messages'
  ) then
    alter publication supabase_realtime add table public.community_messages;
  end if;
end $$;

-- Idempotent cleanup for earlier runs of this file: the (now removed)
-- community_reports read policy must not survive a re-run.
drop policy if exists "community_reports_read" on public.community_reports;
