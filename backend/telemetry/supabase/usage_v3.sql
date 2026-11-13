-- Opt-in usage report with feature counts. Run once in the Supabase SQL editor, after usage_v2.sql, then re-run
-- daily_stats.sql. Reports may carry an optional featureUses map (allow-listed feature key -> count 1..999, checked by
-- lib/schema.js); it is stored as-is in feature_counts. Five-field reports leave it null. Existing rows and views are
-- untouched, and public_stats() never reads this column (it publishes 2.0.x heartbeats only).
alter table heartbeats add column if not exists feature_counts jsonb
  check (feature_counts is null or jsonb_typeof(feature_counts) = 'object');
