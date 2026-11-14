-- Opt-in usage report with per-surface feature counts (consent v4). Run once in the Supabase SQL editor, after
-- usage_v3.sql, then re-run daily_stats.sql. Reports may carry an optional surfaceUses map ("<feature>__<surface>"
-- key -> count 1..999, at most 120 entries, checked by lib/schema.js); it is stored as-is in surface_counts. Reports
-- without it leave it null. Existing rows and views are untouched, and public_stats() never reads this column (it
-- publishes 2.0.x heartbeats only).
alter table heartbeats add column if not exists surface_counts jsonb
  check (surface_counts is null or jsonb_typeof(surface_counts) = 'object');
