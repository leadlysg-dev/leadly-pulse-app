-- Migration 013: master metrics system (supersedes tracked_metrics).
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- One onboarding-set config per workspace:
-- {
--   "extras": ["reach","frequency","video_views","thruplays","engagement"],
--   "conversions": [{"id":"lead","label":"Leads","platform":"meta"}, ...],
--   "primaryResult": {
--     "name": "Enquiries",                -- client-facing, editable
--     "source": "platform_event",        -- result_source enum: platform_event | crm_verified
--     "meta":   {"event":"lead","label":"Lead form submissions"},
--     "google": {"event":"click_to_whatsapp","label":"WhatsApp clicks"}
--   }
-- }
-- Defaults (Spend, CPM, Impressions, Ad Clicks, CTR, CPC) are code-side and
-- always on - never stored, never editable.
alter table public.workspaces
  add column if not exists metrics_config jsonb;
