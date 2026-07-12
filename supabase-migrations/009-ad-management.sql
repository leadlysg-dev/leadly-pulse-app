-- Migration 009: ad management (Phase 1).
-- Run this once in the Supabase SQL editor.
--
-- Two additions: a write-capability flag on each platform connection
-- (detected at connect time - e.g. a Meta token without ads_management is
-- read-only and the Manage tab disables its controls), and the audit log
-- that records every write the Manage tab performs: who, which account,
-- which entity, old -> new value, and the API's answer.

alter table public.connected_accounts
  add column if not exists can_manage boolean;

create table public.ad_change_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.users(id) on delete cascade,
  channel      text not null,           -- meta | google
  account_id   text not null,           -- the ad account acted on
  entity_type  text not null,           -- campaign | adset | adgroup | ad
  entity_id    text not null,
  entity_name  text,
  action       text not null,           -- set_status | set_budget | set_bid
  old_value    text,
  new_value    text,
  api_result   text,                    -- truncated API response snapshot
  created_at   timestamptz not null default now()
);

alter table public.ad_change_log enable row level security;
create index ad_change_log_user_id_idx on public.ad_change_log (user_id, created_at desc);
