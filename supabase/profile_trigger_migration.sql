-- ─── Migration: Auto-create profile row on signup ────────────────────────────
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).
--
-- WHY: The profiles RLS INSERT policy (WITH CHECK (id = auth.uid())) fires
-- AFTER the auth session is established. If email confirmation is enabled,
-- signUp() returns a user but no session, so auth.uid() is null and the
-- client-side insert is silently blocked by RLS.
--
-- This trigger fires inside the signup transaction itself — before the client
-- gets a response — and runs SECURITY DEFINER, so RLS never applies.
-- ─────────────────────────────────────────────────────────────────────────────

-- ministry_id is intentionally excluded from the INSERT — it is assigned later
-- via the /join flow. If ministry_id were NOT NULL, this trigger would fail
-- with a constraint violation and Supabase would surface it as
-- "Database error saving new user".
ALTER TABLE profiles ALTER COLUMN ministry_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, graduation_year, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    (new.raw_user_meta_data->>'graduation_year')::integer,
    'member'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- Drop first in case it already exists with a different definition
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
