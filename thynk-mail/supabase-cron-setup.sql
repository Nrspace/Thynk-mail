-- ============================================================================
-- FREE scheduler: run MailFlow's send-tick every minute from inside Supabase
-- (no Vercel cron, no extra service). Run in Supabase -> SQL Editor.
--
-- 1. Replace YOUR-APP-URL and YOUR-CRON-SECRET below
--    (CRON_SECRET must match the env var set in Vercel).
-- 2. Run the whole script.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove an older version of this job if you re-run the script
select cron.unschedule(jobid) from cron.job where jobname = 'mailflow-send-tick';

select cron.schedule(
  'mailflow-send-tick',
  '* * * * *',                      -- every minute
  $$
  select net.http_get(
    url                  := 'https://YOUR-APP-URL/api/cron/send-tick',
    headers              := jsonb_build_object('Authorization', 'Bearer YOUR-CRON-SECRET'),
    timeout_milliseconds := 60000
  );
  $$
);

-- Check it is running (run a minute later):
--   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
--   select status_code, left(content::text, 200) from net._http_response order by created desc limit 5;
-- Expect status_code 200 and JSON like {"processed":0,"results":[],"sequences":{...}}.
-- To stop it:  select cron.unschedule('mailflow-send-tick');
