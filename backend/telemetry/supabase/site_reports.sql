-- User-confirmed broken-site reports. One row per day, site, engine, theme and version; `reports` counts repeats.
-- There is no install ID and no per-person data, so a report cannot be linked to a person.
create table if not exists site_reports (
  day     date not null,
  site    text not null check (char_length(site) <= 253),
  engine  text not null check (engine in ('auto', 'css', 'invert')),
  theme   text not null check (char_length(theme) <= 40),
  version text not null check (char_length(version) <= 16),
  reports int  not null default 1,
  primary key (day, site, engine, theme, version)
);

-- Service-role key (used by the function) bypasses RLS; with no policies anon and authenticated read and write nothing.
alter table site_reports enable row level security;

create index if not exists site_reports_site_idx on site_reports (site);

create or replace function report_site(p_day date, p_site text, p_engine text, p_theme text, p_version text)
returns void
language sql
set search_path = public
as $$
  insert into site_reports (day, site, engine, theme, version)
  values (p_day, p_site, p_engine, p_theme, p_version)
  on conflict (day, site, engine, theme, version) do update set reports = site_reports.reports + 1
$$;

revoke execute on function report_site(date, text, text, text, text) from public, anon, authenticated;
grant execute on function report_site(date, text, text, text, text) to service_role;

-- Owner-only (SQL editor): which sites are reported most. Not published anywhere.
create or replace view top_reported_sites as
select site, sum(reports)::int as reports, count(distinct day)::int as days, max(day) as last_day
from site_reports
group by site
order by reports desc, site;

revoke all on top_reported_sites from anon, authenticated;

-- Retention: remove reports older than 13 months (400 days). Schedule with pg_cron, e.g.
--   select cron.schedule('purge-site-reports', '23 3 * * *', $$delete from public.site_reports where day < (current_date - interval '400 days')$$);
delete from site_reports where day < (current_date - interval '400 days');
