-- Retention: remove heartbeats older than 13 months (400 days). The owner schedules this,
-- e.g. with pg_cron or a Supabase scheduled function. The interval may be changed.
delete from heartbeats where day < (current_date - interval '400 days');
