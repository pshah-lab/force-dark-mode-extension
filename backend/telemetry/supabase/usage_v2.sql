-- 2.1.0 opt-in usage report. Run once in the Supabase SQL editor, after schema.sql and views.sql.
-- The 2.1.0 report has five fields (install id, day, version, engines, sites_darkened); the device columns that
-- only the 2.0.x heartbeat filled in become optional. Existing rows and views (dau, wau, mau, retention) are untouched.
alter table heartbeats alter column chrome drop not null;
alter table heartbeats alter column os drop not null;
alter table heartbeats alter column lang drop not null;
alter table heartbeats alter column theme drop not null;
alter table heartbeats alter column features drop not null;

-- How many distinct sites dark mode was applied on that day (a count only, never the sites).
alter table heartbeats add column if not exists sites_darkened smallint
  check (sites_darkened between 0 and 9999);

-- Per day: how many reporting installs fall in each sites-darkened bucket (2.1.0 reports only).
create or replace view sites_distribution as
select day,
       count(*) filter (where sites_darkened = 0)            as sites_0,
       count(*) filter (where sites_darkened between 1 and 5)  as sites_1_5,
       count(*) filter (where sites_darkened between 6 and 20) as sites_6_20,
       count(*) filter (where sites_darkened > 20)           as sites_21_plus
from heartbeats
where sites_darkened is not null
group by day
order by day;

-- Owner-only, like the other metric views.
revoke all on sites_distribution from anon, authenticated;
