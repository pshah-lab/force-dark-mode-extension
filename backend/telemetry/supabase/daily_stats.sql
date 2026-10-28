-- Owner dashboard: one aggregate row per UTC day, built nightly from heartbeats and site_reports. Run after
-- schema.sql, usage_v2.sql and site_reports.sql. The table holds counts and category names only (no install IDs),
-- so it is not personal data and may outlive the 13-month purge of raw heartbeats. Owner-only: nothing here
-- is published (the public page uses public_stats(), which suppresses small groups).

create table if not exists daily_stats (
  day          date primary key,
  active       int  not null,
  new_installs int  not null,
  returning_installs int not null,
  site_reports int  not null default 0,
  avg_sites    numeric(7,2),
  sites        jsonb not null default '{"s0":0,"s1_5":0,"s6_20":0,"s21p":0}',
  versions     jsonb not null default '{}',
  engines      jsonb not null default '{}',
  themes       jsonb not null default '{}',
  os           jsonb not null default '{}',
  chrome       jsonb not null default '{}',
  lang         jsonb not null default '{}'
);

alter table daily_stats enable row level security;

-- {"key": installs} for one column of the day's heartbeats (nulls skipped).
create or replace function rollup_counts(p_day date, p_column text) returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare result jsonb;
begin
  if p_column not in ('version', 'theme', 'os', 'chrome', 'lang') then
    raise exception 'bad column';
  end if;
  execute format(
    'select coalesce(jsonb_object_agg(k, n), ''{}''::jsonb) from (select %1$I::text as k, count(*)::int as n from heartbeats where day = $1 and %1$I is not null group by 1) t',
    p_column) into result using p_day;
  return result;
end
$$;

-- Rebuilds one day (idempotent). Call for yesterday; run on a day that has passed.
create or replace function rollup_daily_stats(p_day date default ((now() at time zone 'utc')::date - 1)) returns void
language sql
set search_path = public
as $$
  with hb as (select * from heartbeats where day = p_day),
  first_seen as (select install_id, min(day) as first_day from heartbeats group by install_id)
  insert into daily_stats (day, active, new_installs, returning_installs, site_reports, avg_sites, sites, versions, engines, themes, os, chrome, lang)
  select p_day,
    (select count(*) from hb)::int,
    (select count(*) from hb join first_seen f using (install_id) where f.first_day = p_day)::int,
    (select count(*) from hb join first_seen f using (install_id) where f.first_day < p_day)::int,
    coalesce((select sum(reports) from site_reports where day = p_day), 0)::int,
    (select round(avg(sites_darkened)::numeric, 2) from hb where sites_darkened is not null),
    jsonb_build_object(
      's0',    (select count(*) from hb where sites_darkened = 0)::int,
      's1_5',  (select count(*) from hb where sites_darkened between 1 and 5)::int,
      's6_20', (select count(*) from hb where sites_darkened between 6 and 20)::int,
      's21p',  (select count(*) from hb where sites_darkened > 20)::int),
    rollup_counts(p_day, 'version'),
    jsonb_build_object(
      'auto',   (select count(*) from hb where engines -> 'auto' = 'true'::jsonb)::int,
      'css',    (select count(*) from hb where engines -> 'css' = 'true'::jsonb)::int,
      'invert', (select count(*) from hb where engines -> 'invert' = 'true'::jsonb)::int),
    rollup_counts(p_day, 'theme'),
    rollup_counts(p_day, 'os'),
    rollup_counts(p_day, 'chrome'),
    rollup_counts(p_day, 'lang')
  on conflict (day) do update set
    active = excluded.active, new_installs = excluded.new_installs, returning_installs = excluded.returning_installs,
    site_reports = excluded.site_reports, avg_sites = excluded.avg_sites, sites = excluded.sites,
    versions = excluded.versions, engines = excluded.engines, themes = excluded.themes,
    os = excluded.os, chrome = excluded.chrome, lang = excluded.lang
$$;

-- One-time backfill of every day that already has heartbeats (re-runnable).
select rollup_daily_stats(day) from (select distinct day from heartbeats where day < (now() at time zone 'utc')::date) d order by day;

-- The document read by GET /api/darkmode-dashboard-data (shape checked by lib/dashboardData.js).
create or replace function owner_dashboard() returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'generatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
        'day', to_char(day, 'YYYY-MM-DD'), 'active', active, 'newInstalls', new_installs, 'returning', returning_installs,
        'siteReports', site_reports, 'avgSites', avg_sites, 'sites', sites, 'versions', versions,
        'engines', engines, 'themes', themes, 'os', os, 'chrome', chrome, 'lang', lang) order by day)
      from (select * from daily_stats order by day desc limit 800) s), '[]'::jsonb),
    'topSites', coalesce((select jsonb_agg(jsonb_build_object(
        'site', site, 'reports', reports, 'days', days, 'lastDay', to_char(last_day, 'YYYY-MM-DD')) order by reports desc, site)
      from (select site, sum(reports)::int as reports, count(distinct day)::int as days, max(day) as last_day
            from site_reports where day >= (now() at time zone 'utc')::date - 30
            group by site order by sum(reports) desc, site limit 20) t), '[]'::jsonb)
  )
$$;

revoke execute on function rollup_counts(date, text) from public, anon, authenticated;
revoke execute on function rollup_daily_stats(date) from public, anon, authenticated;
revoke execute on function owner_dashboard() from public, anon, authenticated;
grant execute on function rollup_daily_stats(date) to service_role;
grant execute on function owner_dashboard() to service_role;

-- Nightly at 00:30 UTC, after the day has ended (raises if pg_cron is not enabled).
select cron.schedule('rollup-daily-stats', '30 0 * * *', $$select public.rollup_daily_stats()$$);
