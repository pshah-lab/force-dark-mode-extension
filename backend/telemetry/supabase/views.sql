-- Metric views over heartbeats. Run after schema.sql. Query as the project owner
-- (SQL editor); the anon role has no access to the table.

-- Distinct active installs per day.
create or replace view dau as
select day, count(distinct install_id) as installs
from heartbeats
group by day
order by day;

-- Distinct installs seen in the 7 / 30 days ending on each day.
create or replace view wau as
select d.day, count(distinct h.install_id) as installs
from (select distinct day from heartbeats) d
join heartbeats h on h.day between d.day - 6 and d.day
group by d.day
order by d.day;

create or replace view mau as
select d.day, count(distinct h.install_id) as installs
from (select distinct day from heartbeats) d
join heartbeats h on h.day between d.day - 29 and d.day
group by d.day
order by d.day;

-- Per day: installs whose first-ever day is that day versus installs first seen earlier.
create or replace view new_vs_returning as
with first_seen as (
  select install_id, min(day) as first_day from heartbeats group by install_id
)
select h.day,
       count(*) filter (where f.first_day = h.day) as new_installs,
       count(*) filter (where f.first_day < h.day) as returning_installs
from heartbeats h
join first_seen f using (install_id)
group by h.day
order by h.day;

-- Cohorts too young for a given N yield NULL, not 0.
-- Note: first_day is min(day) of the rows that still exist, so after purge.sql long-lived installs
-- look new at the oldest surviving date.
-- Per first-day cohort: share of installs seen exactly N days after their first day.
create or replace view retention as
with first_seen as (
  select install_id, min(day) as first_day from heartbeats group by install_id
),
cohort as (
  select first_day, count(*) as installs from first_seen group by first_day
)
select c.first_day as cohort_day,
       c.installs,
       case when c.first_day + 1 <= current_date then round(count(distinct h1.install_id)::numeric  / c.installs, 4) end as d1,
       case when c.first_day + 7 <= current_date then round(count(distinct h7.install_id)::numeric  / c.installs, 4) end as d7,
       case when c.first_day + 30 <= current_date then round(count(distinct h30.install_id)::numeric / c.installs, 4) end as d30
from cohort c
join first_seen f on f.first_day = c.first_day
left join heartbeats h1  on h1.install_id  = f.install_id and h1.day  = f.first_day + 1
left join heartbeats h7  on h7.install_id  = f.install_id and h7.day  = f.first_day + 7
left join heartbeats h30 on h30.install_id = f.install_id and h30.day = f.first_day + 30
group by c.first_day, c.installs
order by c.first_day;
