-- Weekly Settlement Cron Job
-- Runs every Monday at 6AM PST (14:00 UTC)
-- Calls the weekly-settlement-cron edge function
--
-- SETUP INSTRUCTIONS:
-- 1. Run this SQL in the Supabase SQL Editor (Dashboard > SQL Editor)
-- 2. Replace YOUR_SERVICE_ROLE_KEY with your actual service role key
--    (Find it in Dashboard > Settings > API > service_role key)
--
-- ALTERNATIVE: Use Supabase Dashboard UI
-- Dashboard > Database > Extensions > Enable pg_cron
-- Dashboard > Database > Cron Jobs > Create new job

-- Enable required extensions (pg_cron is pre-installed in Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule weekly settlement cron job
SELECT cron.schedule(
  'weekly-settlement-reports',  -- job name
  '0 14 * * 1',                 -- cron schedule: Monday 14:00 UTC = 6AM PST
  $$
  SELECT net.http_post(
    url := 'https://hzdybwclwqkcobpwxzoo.supabase.co/functions/v1/weekly-settlement-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6ZHlid2Nsd3FrY29icHd4em9vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjE3NTg4NCwiZXhwIjoyMDgxNzUxODg0fQ.Do9Ql8diHqDBRtcnGx9kw6ZeaNlS7gRZ7MSV0mVoa3Y"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To view job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- To unschedule the job:
-- SELECT cron.unschedule('weekly-settlement-reports');
