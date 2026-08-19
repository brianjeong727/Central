-- Retire the vestigial grade ladder; drive the graduation prompt off class year.
-- APPLIED 2026-08-19 via Supabase MCP. Reviewed by rls-reviewer before + after.
--
-- WHY. Two cohort models existed. The LADDER (profiles.grade freshman→senior,
-- church chats named "Freshman Chat"…"Senior Chat") was dead: zero of those chats
-- existed in any ministry, zero profiles held freshman/sophomore/junior, and
-- nothing in app/ had written those grades since signup moved to graduation_year.
-- The LIVE model is graduation_year → "Class of {year}" (lib/cohort.ts).
--
-- grade_bump_all_ministries() maintained the dead one. Steps 1–3 were permanent
-- no-ops against chats that do not exist and grades nobody holds; only step 4 did
-- anything — flag grade='senior' for the "have you graduated?" banner. It last ran
-- 1 Aug 2026 and flagged 203 rows, ALL load-test rig accounts, zero real users.
--
-- The replacement asks the same question of the people it should: whoever's class
-- year has arrived. Answering runs respondToGradCheck → grade='young_adult' +
-- moveToCohortChat into "Young Adults".
--
-- Verified blast radius before applying: 6 rows on the next run (3 Brian's
-- Sandbox, 1 Central test persona, 2 with no ministry — who never see the banner
-- because middleware parks them at /ministries). No real user in an active
-- ministry is affected.

-- ── The definition being retired, preserved verbatim ─────────────────────────
-- It existed ONLY in the database — no migration file defined it — so dropping it
-- without recording it would erase the only copy of how the ladder worked.
--
-- CREATE OR REPLACE FUNCTION public.grade_bump_all_ministries()
--  RETURNS void LANGUAGE plpgsql SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- BEGIN
--   -- 1. Remove users from their current grade chat
--   DELETE FROM group_members WHERE id IN (
--     SELECT gm.id FROM group_members gm
--     JOIN profiles p ON p.id = gm.user_id AND p.grade IN ('freshman','sophomore','junior')
--     JOIN groups g ON g.id = gm.group_id AND g.type = 'church'
--     WHERE g.name = CASE p.grade
--       WHEN 'freshman' THEN 'Freshman Chat'
--       WHEN 'sophomore' THEN 'Sophomore Chat'
--       WHEN 'junior' THEN 'Junior Chat' END);
--   -- 2. Add to the next grade's chat
--   INSERT INTO group_members (group_id, user_id)
--   SELECT g.id, um.user_id FROM profiles p
--     JOIN user_ministries um ON um.user_id = p.id
--     JOIN groups g ON g.ministry_id = um.ministry_id AND g.type = 'church'
--       AND g.name = CASE p.grade
--         WHEN 'freshman' THEN 'Sophomore Chat'
--         WHEN 'sophomore' THEN 'Junior Chat'
--         WHEN 'junior' THEN 'Senior Chat' END
--   WHERE p.grade IN ('freshman','sophomore','junior')
--   ON CONFLICT (group_id, user_id) DO NOTHING;
--   -- 3. Bump grade values
--   UPDATE profiles SET grade = CASE grade
--     WHEN 'freshman' THEN 'sophomore'
--     WHEN 'sophomore' THEN 'junior'
--     WHEN 'junior' THEN 'senior' END,
--     grade_updated_at = NOW()
--   WHERE grade IN ('freshman','sophomore','junior');
--   -- 4. Flag all current seniors to confirm graduation status
--   UPDATE profiles SET needs_grad_check = TRUE WHERE grade = 'senior';
-- END;
-- $function$;

CREATE OR REPLACE FUNCTION public.flag_graduating_cohorts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- pg_temp named EXPLICITLY: it is searched FIRST for relations unless listed, so
-- a bare 'public' leaves a planted pg_temp.profiles able to shadow the real table.
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.profiles
  SET needs_grad_check = TRUE
  WHERE graduation_year IS NOT NULL
    AND graduation_year <= EXTRACT(YEAR FROM NOW())::int
    -- Already answered — never ask a young adult again.
    AND grade IS DISTINCT FROM 'young_adult'
    -- Idempotent: a re-run writes zero rows, so it neither churns the WAL nor
    -- re-raises a banner someone is part-way through answering.
    AND needs_grad_check IS DISTINCT FROM TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.flag_graduating_cohorts() FROM PUBLIC, anon, authenticated;

-- Repoint the existing annual job (1 Aug) at the replacement.
-- unschedule BY JOBID, not by name: unschedule('name') RAISES when the job is
-- already gone, so the name form makes this file fail on a re-run after a partial
-- apply. The subquery form is a clean no-op when there is nothing to remove.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'grade-bump-annual';
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'flag-graduating-cohorts';
SELECT cron.schedule('flag-graduating-cohorts', '0 0 1 8 *',
                     $cron$SELECT public.flag_graduating_cohorts();$cron$);

DROP FUNCTION IF EXISTS public.grade_bump_all_ministries();
