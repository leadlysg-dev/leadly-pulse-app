-- Migration 006: Google Search Console properties for the SEO tab.
-- Run this once in the Supabase SQL editor before deploying.
--
-- Mirrors the ad-account pattern exactly: the customer's chosen property
-- lives as a pointer on their existing Google connection row, and the list
-- of properties they can access is a child table replaced wholesale on
-- reconnect. Tokens are NOT duplicated - Search Console reuses the same
-- access/refresh token already stored on connected_accounts once the
-- webmasters.readonly scope is granted.

alter table public.connected_accounts
  add column if not exists selected_sc_site_url text;

create table public.sc_properties (
  id                   bigint generated always as identity primary key,
  connected_account_id uuid not null references public.connected_accounts(id) on delete cascade,
  site_url             text not null,     -- e.g. "sc-domain:example.com" or "https://example.com/"
  permission           text,              -- Search Console permission level snapshot
  position             int not null default 0,
  unique (connected_account_id, site_url)
);

-- Lock down for the public anon key, same as every other table; the
-- functions' secret key bypasses RLS.
alter table public.sc_properties enable row level security;

create index sc_properties_connected_account_id_idx on public.sc_properties (connected_account_id);
