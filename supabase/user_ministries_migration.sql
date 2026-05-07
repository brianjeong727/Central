-- user_ministries: tracks all ministry affiliations per user (multi-tenant)
CREATE TABLE IF NOT EXISTS public.user_ministries (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ministry_id uuid NOT NULL REFERENCES public.ministries(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member',
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, ministry_id)
);

ALTER TABLE public.user_ministries ENABLE ROW LEVEL SECURITY;

-- Users can read their own memberships
CREATE POLICY "user_ministries_select_own"
  ON public.user_ministries FOR SELECT
  USING (auth.uid() = user_id);

-- Backfill existing single-ministry users
INSERT INTO public.user_ministries (user_id, ministry_id, role)
SELECT p.id, p.ministry_id, p.role
FROM public.profiles p
WHERE p.ministry_id IS NOT NULL
ON CONFLICT (user_id, ministry_id) DO NOTHING;
