-- ─────────────────────────────────────────────────────────────────────────────
-- APPLIED 2026-07-31, by hand through the Supabase SQL editor.
--
-- ⚠️ NOT in the migration history. It was applied out-of-band, so
-- `list_migrations` does not show it — this file is the only record in version
-- control. Post-apply state verified live: prosecdef=true,
-- proconfig={search_path=public}, owner=postgres,
-- proacl={postgres=X,service_role=X} (anon/authenticated EXECUTE = false),
-- cron job intact (`5 * * * *`, runs as postgres), notification_ledger
-- unchanged at 21 rows.
--
-- Project: wgqpnilaokfipocsugqo
--
-- Reviewed and sanctioned by the rls-reviewer BEFORE pass; follows its safe-edit
-- recipe (rls-review-after.md §6) point for point:
--   • the B1 EXECUTE revoke already landed FIRST (required — this rewrite removes
--     the accidental 9-10am-PT blast-radius cap that was limiting the exposure)
--   • CREATE OR REPLACE only, never DROP+CREATE (a drop resets proacl and would
--     re-expose the function that was just revoked)
--   • SECURITY DEFINER and SET search_path restated verbatim (omitting either
--     silently drops it)
--   • steps 1/2/3a inside the per-ministry loop; 3b and 4 deliberately outside
--   • cron.job untouched
--
-- Baseline captured immediately before writing this (recipe step 1):
--   pg_get_functiondef md5 = 34d9c26bde692a9a0125536d41778470, length 3992
--   notification_ledger = 21 rows, event_confirmations = 0, active ministries = 7
--   If that md5 no longer matches, RE-REVIEW before applying — someone else changed it.
--
-- POST-APPLY VERIFICATION (run all four; do NOT call the function to test it —
-- it fires real pushes):
--   select prosecdef, proconfig::text, proacl::text, pg_get_userbyid(proowner)
--   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and proname='run_sheet_tick';
--     -- expect prosecdef=true; proconfig={search_path=public}; owner=postgres;
--     -- proacl must show NO '=X/postgres', NO anon, NO authenticated
--   select has_function_privilege('anon','public.run_sheet_tick()','EXECUTE');  -- false
--   select jobid, schedule, command, username, active from cron.job where jobname='run-sheet-tick';
--   select count(*) from notification_ledger;   -- unchanged by the edit itself (21)
-- Then observe the next real 9am-local tick: the ledger should grow by the
-- expected amount with no duplicate push.
-- ─────────────────────────────────────────────────────────────────────────────

-- Per-ministry timezone for the daily run-sheet nudges.
--
-- WAS: one hardcoded 'America/Los_Angeles' window and PT date math for every
-- tenant, so a Pittsburgh ministry got its 9am deadline pings at noon local and
-- its T-2 confirmations keyed off the wrong calendar day.
-- NOW: each active ministry is evaluated in ITS OWN zone (ministries.timezone).
--
-- Steps 1, 2 and 3a are date-sensitive and move inside the per-ministry loop.
-- Steps 3b and 4 stay OUTSIDE it: their predicates are pure durations with no
-- date term, and running them per-ministry would let one tenant's window
-- escalate another tenant's rows.
--
-- Ledger keys for the task nudges are now date-stamped. Beyond the timezone
-- work this fixes a live bug: 'due_today' was claimed against the task id alone,
-- so a task whose due_date was edited to a later date could never be pinged
-- again — its claim was already burned. The key now describes the occasion.
-- Confirmation keys are unchanged (round already namespaces re-requests).
CREATE OR REPLACE FUNCTION public.run_sheet_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  url text; secret text;
  local_ts timestamptz := now();
  m        record;
  m_now    timestamp;
  m_date   date;
  rec      record;
BEGIN
  SELECT value INTO url    FROM app_config WHERE key = 'push_dispatch_url';
  SELECT value INTO secret FROM app_config WHERE key = 'push_secret';
  IF url IS NULL OR secret IS NULL THEN RETURN; END IF;

  FOR m IN SELECT id, timezone FROM ministries WHERE status = 'active' LOOP
    -- One subtransaction per ministry. Without it a single bad IANA string
    -- (22023 invalid_parameter_value) aborts the tick for EVERY ministry,
    -- silently and permanently. It also keeps each tenant's ledger claims and
    -- queued posts atomic, so nothing is ever claimed-but-unsent.
    BEGIN
      m_now  := now() AT TIME ZONE m.timezone;
      m_date := (now() AT TIME ZONE m.timezone)::date;

      -- Keep BETWEEN 9 AND 10 (not = 9): preserves the two-tick-per-day
      -- behaviour the ledger dedupes, and tolerates 30/45-minute-offset zones.
      IF extract(hour FROM m_now) NOT BETWEEN 9 AND 10 THEN CONTINUE; END IF;

      -- 1. Task due TOMORROW (ministry-local)
      FOR rec IN
        SELECT et.id FROM event_tasks et
        JOIN event_plans ep ON ep.id = et.event_plan_id
        WHERE ep.ministry_id = m.id
          AND et.assigned_to IS NOT NULL AND et.completed = false
          AND et.due_date = m_date + 1
      LOOP
        INSERT INTO notification_ledger(subject_type, subject_id, offset_key)
        VALUES ('event_task', rec.id, 'due_tomorrow:' || m_date) ON CONFLICT DO NOTHING;
        IF FOUND THEN
          PERFORM net.http_post(
            url := url,
            headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret),
            body := jsonb_build_object('table','event_tasks','record_id', rec.id, 'event','task_due'));
        END IF;
      END LOOP;

      -- 2. Task due TODAY (ministry-local)
      FOR rec IN
        SELECT et.id FROM event_tasks et
        JOIN event_plans ep ON ep.id = et.event_plan_id
        WHERE ep.ministry_id = m.id
          AND et.assigned_to IS NOT NULL AND et.completed = false
          AND et.due_date = m_date
      LOOP
        INSERT INTO notification_ledger(subject_type, subject_id, offset_key)
        VALUES ('event_task', rec.id, 'due_today:' || m_date) ON CONFLICT DO NOTHING;
        IF FOUND THEN
          PERFORM net.http_post(
            url := url,
            headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret),
            body := jsonb_build_object('table','event_tasks','record_id', rec.id, 'event','task_due'));
        END IF;
      END LOOP;

      -- 3a. Auto-create confirmations for assigned roles of events starting in
      --     2 days, measured in the MINISTRY's zone.
      INSERT INTO event_confirmations (ministry_id, event_plan_id, subject_type, subject_id, user_id, status, round, requested_at)
      SELECT ep.ministry_id, ep.id, 'role', er.id, er.assigned_to, 'requested', 1, now()
      FROM event_roles er
      JOIN event_plans ep     ON ep.id = er.event_plan_id
      JOIN calendar_events ce ON ce.id = ep.calendar_event_id
      WHERE ep.ministry_id = m.id
        AND er.assigned_to IS NOT NULL
        AND (ce.start_date AT TIME ZONE m.timezone)::date = m_date + 2
      ON CONFLICT (subject_type, subject_id, user_id) DO NOTHING;

    EXCEPTION WHEN others THEN
      RAISE WARNING 'run_sheet_tick: ministry % skipped: %', m.id, sqlerrm;
    END;
  END LOOP;

  -- 3b. Ping every still-'requested' confirmation once per round.
  --     No date term — platform-wide, exactly once per tick.
  FOR rec IN
    SELECT id, round FROM event_confirmations WHERE status = 'requested'
  LOOP
    INSERT INTO notification_ledger(subject_type, subject_id, offset_key)
    VALUES ('event_confirmation', rec.id, 'confirm_request:' || rec.round) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      PERFORM net.http_post(
        url := url,
        headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret),
        body := jsonb_build_object('table','event_confirmations','record_id', rec.id, 'event','confirm_request'));
    END IF;
  END LOOP;

  -- 4. Escalate confirmations silent > 24h. A pure duration, zone-independent —
  --    must stay outside the loop or one ministry's window escalates another's.
  FOR rec IN
    UPDATE event_confirmations
       SET status = 'escalated'
     WHERE status = 'requested' AND requested_at < local_ts - interval '24 hours'
    RETURNING id, round
  LOOP
    INSERT INTO notification_ledger(subject_type, subject_id, offset_key)
    VALUES ('event_confirmation', rec.id, 'escalated:' || rec.round) ON CONFLICT DO NOTHING;
    IF FOUND THEN
      PERFORM net.http_post(
        url := url,
        headers := jsonb_build_object('Content-Type','application/json','x-push-secret', secret),
        body := jsonb_build_object('table','event_confirmations','record_id', rec.id, 'event','confirm_escalation'));
    END IF;
  END LOOP;
END $function$;
