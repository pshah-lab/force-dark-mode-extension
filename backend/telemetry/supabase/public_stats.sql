-- Public aggregate statistics for GET /api/darkmode-stats. Run after schema.sql.
-- Returns one jsonb document in the shape checked by lib/publicStats.js (validatePublicStats).
--
-- Disclosure control (MIN_GROUP = 10 distinct installs):
--   * Any published count or share resting on fewer than 10 installs is null.
--   * If MAU < 10, every section except `active` is null.
--   * Exclusive categories (theme, os, chrome, lang): groups under 10 go into "other"; if
--     "other" is then between 1 and 9 installs, the smallest remaining named group is folded
--     into "other" as well (complementary suppression), so no hidden group can be recovered
--     by subtracting published groups from the total.
--   * Non-exclusive flags (engines, features): null per item when fewer than 10 installs used it
--     OR fewer than 10 active installs did NOT use it (else MAU - users reveals the non-users).
--   * New vs returning: if either count of a week is under 10 both are null, because their
--     sum (that week's active installs) can equal the published WAU.
--   * Retention: published only when the pooled denominator is at least 10.
-- Window: the 30 UTC days ending yesterday. Rows dated today or later are ignored everywhere.
-- Only aggregates leave this function: never install IDs, rows or per-install series.

-- Helper: {"key": installs} -> {"key": percent} with the exclusive-category merge applied.
create or replace function public_stats_merge(groups jsonb, mau int) returns jsonb
language sql
immutable
set search_path = public
as $$
  with g as (
    select key, value::int as n from jsonb_each_text(coalesce(groups, '{}'::jsonb))
  ),
  small as (
    -- Groups under 10, plus anything already labelled "other".
    select coalesce(sum(n), 0)::int as n from g where n < 10 or key = 'other'
  ),
  named as (
    select key, n from g where n >= 10 and key <> 'other'
  ),
  victim as (
    -- Complementary suppression: only when "other" is non-empty but still under 10.
    select key, n from named
    where (select n from small) between 1 and 9
    order by n, key
    limit 1
  ),
  merged as (
    select key, n from named where key not in (select key from victim)
    union all
    select 'other', (select n from small) + coalesce((select n from victim), 0)
    where (select n from small) > 0
  )
  select case
    when mau is null or mau < 10 then null
    else coalesce(jsonb_object_agg(key, round(100.0 * n / mau)::int), '{}'::jsonb)
  end
  from merged
$$;

create or replace function public_stats() returns jsonb
language sql
stable
set search_path = public
as $$
  with params as (
    select ((now() at time zone 'utc')::date - 1) as y
  ),
  -- 2.0.x heartbeats only: 2.1.0 usage reports (sites_darkened set) are used by the developer and never published.
  hb as (
    select h.* from heartbeats h, params p where h.day <= p.y and h.sites_darkened is null
  ),
  w as (
    select hb.* from hb, params p where hb.day between p.y - 29 and p.y
  ),
  mau as (
    select count(distinct install_id)::int as n from w
  ),
  wau as (
    select count(distinct w.install_id)::int as n from w, params p where w.day between p.y - 6 and p.y
  ),
  days as (
    select (p.y - g)::date as day from params p, generate_series(29, 0, -1) as g
  ),
  dau as (
    select d.day, count(distinct w.install_id)::int as n
    from days d left join w on w.day = d.day
    group by d.day
  ),
  -- Theme and environment from each install's most recent heartbeat in the window.
  latest as (
    select distinct on (install_id)
      install_id,
      case when theme = 'custom' or theme ~ '^builtin:[a-z0-9-]{1,40}$' then theme else 'other' end as theme,
      case when os in ('mac', 'windows', 'linux', 'chromeos', 'other') then os else 'other' end as os,
      case when chrome between 1 and 999 then chrome::text else 'other' end as chrome,
      case when lang ~ '^[a-z]{2,3}$' then lang else 'other' end as lang
    from w
    order by install_id, day desc
  ),
  -- A flag counts if any heartbeat in the window has it true.
  flags as (
    select install_id,
      bool_or(engines -> 'auto' = 'true'::jsonb) as auto,
      bool_or(engines -> 'css' = 'true'::jsonb) as css,
      bool_or(engines -> 'invert' = 'true'::jsonb) as invert,
      bool_or(features -> 'viewer' = 'true'::jsonb) as viewer,
      bool_or(features -> 'editor' = 'true'::jsonb) as editor,
      bool_or(features -> 'customCss' = 'true'::jsonb) as custom_css,
      bool_or(features -> 'sitePack' = 'true'::jsonb) as site_pack
    from w
    group by install_id
  ),
  flag_counts as (
    select
      count(*) filter (where auto)::int as auto,
      count(*) filter (where css)::int as css,
      count(*) filter (where invert)::int as invert,
      count(*) filter (where viewer)::int as viewer,
      count(*) filter (where editor)::int as editor,
      count(*) filter (where custom_css)::int as custom_css,
      count(*) filter (where site_pack)::int as site_pack
    from flags
  ),
  first_seen as (
    select install_id, min(day) as first_day from hb group by install_id
  ),
  -- Up to 4 most recent complete Monday-to-Sunday weeks, not earlier than the first data.
  weeks as (
    select (date_trunc('week', (p.y + 1)::timestamp)::date - 7 * k) as ws
    from params p, generate_series(1, 4) as k
    where date_trunc('week', (p.y + 1)::timestamp)::date - 7 * k
          >= (select date_trunc('week', min(day)::timestamp)::date from hb)
  ),
  week_counts as (
    select wk.ws,
      (select count(*) from first_seen f where f.first_day between wk.ws and wk.ws + 6)::int as new_n,
      (select count(distinct hb.install_id) from hb join first_seen f using (install_id)
        where hb.day between wk.ws and wk.ws + 6 and f.first_day < wk.ws)::int as ret_n
    from weeks wk
  ),
  -- Retention: cohorts first seen in the 90 days ending yesterday, pooled.
  cohort as (
    select f.install_id, f.first_day from first_seen f, params p where f.first_day between p.y - 89 and p.y
  ),
  retention as (
    select v.n_days,
      count(*) filter (where c.first_day + v.n_days <= p.y)::int as den,
      count(*) filter (where c.first_day + v.n_days <= p.y and exists (
        select 1 from hb where hb.install_id = c.install_id and hb.day = c.first_day + v.n_days))::int as num
    from (values (1), (7), (30)) as v(n_days)
    cross join params p
    left join cohort c on true
    group by v.n_days
  ),
  ret as (
    select jsonb_object_agg('d' || n_days,
      case when den >= 10 then round(100.0 * num / den)::int end) as doc
    from retention
  )
  select jsonb_build_object(
    'generatedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'minGroup', 10,
    'windowDays', 30,
    'active', jsonb_build_object(
      'dau', (select jsonb_agg(jsonb_build_object(
                'day', to_char(day, 'YYYY-MM-DD'),
                'count', case when n >= 10 then n end) order by day) from dau),
      'wau', (select case when n >= 10 then n end from wau),
      'mau', case when m.n >= 10 then m.n end
    ),
    'newVsReturning', case when m.n >= 10 then jsonb_build_object('weeks', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'weekStart', to_char(ws, 'YYYY-MM-DD'),
          'new', case when new_n >= 10 and ret_n >= 10 then new_n end,
          'returning', case when new_n >= 10 and ret_n >= 10 then ret_n end) order by ws)
       from week_counts), '[]'::jsonb)) end,
    'retention', case when m.n >= 10 then (select doc from ret) end,
    'engines', case when m.n >= 10 then jsonb_build_object(
      'auto', case when fc.auto >= 10 and m.n - fc.auto >= 10 then round(100.0 * fc.auto / m.n)::int end,
      'css', case when fc.css >= 10 and m.n - fc.css >= 10 then round(100.0 * fc.css / m.n)::int end,
      'invert', case when fc.invert >= 10 and m.n - fc.invert >= 10 then round(100.0 * fc.invert / m.n)::int end) end,
    'themes', public_stats_merge((select jsonb_object_agg(theme, c) from
        (select theme, count(*)::int as c from latest group by theme) t), m.n),
    'features', case when m.n >= 10 then jsonb_build_object(
      'viewer', case when fc.viewer >= 10 and m.n - fc.viewer >= 10 then round(100.0 * fc.viewer / m.n)::int end,
      'editor', case when fc.editor >= 10 and m.n - fc.editor >= 10 then round(100.0 * fc.editor / m.n)::int end,
      'customCss', case when fc.custom_css >= 10 and m.n - fc.custom_css >= 10 then round(100.0 * fc.custom_css / m.n)::int end,
      'sitePack', case when fc.site_pack >= 10 and m.n - fc.site_pack >= 10 then round(100.0 * fc.site_pack / m.n)::int end) end,
    'os', public_stats_merge((select jsonb_object_agg(os, c) from
        (select os, count(*)::int as c from latest group by os) t), m.n),
    'chrome', public_stats_merge((select jsonb_object_agg(chrome, c) from
        (select chrome, count(*)::int as c from latest group by chrome) t), m.n),
    'lang', public_stats_merge((select jsonb_object_agg(lang, c) from
        (select lang, count(*)::int as c from latest group by lang) t), m.n)
  )
  from mau m cross join flag_counts fc
$$;

-- Service role only (the stats function uses the service key). Supabase grants EXECUTE on new
-- functions to anon and authenticated by default, so revoke it explicitly.
revoke execute on function public_stats() from public, anon, authenticated;
revoke execute on function public_stats_merge(jsonb, int) from public, anon, authenticated;
grant execute on function public_stats() to service_role;
grant execute on function public_stats_merge(jsonb, int) to service_role;
