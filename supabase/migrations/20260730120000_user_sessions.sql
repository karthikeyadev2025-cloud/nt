-- ─────────────────────────────────────────────────────────────
-- user_sessions — device-level session tracking so each user can
-- see every device signed in with their account and revoke any one
-- of them with one click.
--
-- Rows are created by the client on successful sign-in, heart-beated
-- every ~60s while the tab is open, and marked revoked (soft delete)
-- when the user clicks Revoke or Sign Out on All Others.
--
-- Any tab whose row has been revoked will notice on its next
-- heart-beat and force a local sign-out.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.user_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,

  -- Human-friendly label like "Chrome on macOS" so users don't
  -- have to squint at a raw User-Agent string.
  device_label  text not null default 'Unknown device',
  user_agent    text,
  platform_hint text,          -- 'web', 'ios', 'android', 'desktop-pwa' etc.

  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),

  revoked_at    timestamptz,   -- null = active, non-null = revoked
  revoked_by    uuid references auth.users(id) on delete set null
);

create index if not exists user_sessions_user_last_seen_idx
  on public.user_sessions(user_id, last_seen_at desc);

create index if not exists user_sessions_active_idx
  on public.user_sessions(user_id)
  where revoked_at is null;

alter table public.user_sessions enable row level security;

-- Users can only see, insert, update and delete their own rows.
drop policy if exists "sessions_own_select" on public.user_sessions;
create policy "sessions_own_select"
  on public.user_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "sessions_own_insert" on public.user_sessions;
create policy "sessions_own_insert"
  on public.user_sessions for insert
  with check (auth.uid() = user_id);

drop policy if exists "sessions_own_update" on public.user_sessions;
create policy "sessions_own_update"
  on public.user_sessions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sessions_own_delete" on public.user_sessions;
create policy "sessions_own_delete"
  on public.user_sessions for delete
  using (auth.uid() = user_id);
