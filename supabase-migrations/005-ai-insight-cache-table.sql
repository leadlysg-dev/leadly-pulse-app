-- Migration 005: per-view AI insight cache.
-- Run this once in the Supabase SQL editor before deploying.
--
-- The AI insights card now follows the dashboard's date-range toggle, so
-- the cache moves from one slot per user (users.ai_insight) to one row per
-- (customer, selected range) - at most 4 rows per user, upserted in place.
-- Freshness (10 minutes) is enforced in code against generated_at, so no
-- scheduled cleanup is needed. prefs_hash fingerprints the user's custom
-- focus prompt (changing it invalidates instantly); data_hash fingerprints
-- the condensed ad data the summary was written from, letting an expired
-- entry be reused without an Anthropic call when the numbers haven't
-- actually changed.

create table public.ai_insight_cache (
  user_id      uuid not null references public.users(id) on delete cascade,
  range        text not null check (range in ('last_7d', 'last_30d', 'this_month', 'last_month')),
  prefs_hash   text not null,
  data_hash    text not null,
  summary      text not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, range)
);

-- Lock down for the public anon key, same as every other table; the
-- functions' secret key bypasses RLS.
alter table public.ai_insight_cache enable row level security;

-- Optional cleanup once this is deployed and verified: the old single-slot
-- cache column is no longer read or written.
-- alter table public.users drop column if exists ai_insight;
