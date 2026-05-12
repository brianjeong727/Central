-- Forms feature: announcement_forms, form_fields, form_responses, form_answers

CREATE TABLE IF NOT EXISTS announcement_forms (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  ministry_id     UUID NOT NULL REFERENCES ministries(id)   ON DELETE CASCADE,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT announcement_forms_announcement_id_unique UNIQUE (announcement_id)
);

CREATE TABLE IF NOT EXISTS form_fields (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id     UUID NOT NULL REFERENCES announcement_forms(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('text', 'multiple_choice', 'checkbox', 'dropdown')),
  options     JSONB NOT NULL DEFAULT '[]',
  required    BOOLEAN NOT NULL DEFAULT false,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS form_responses (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  form_id         UUID NOT NULL REFERENCES announcement_forms(id) ON DELETE CASCADE,
  announcement_id UUID NOT NULL REFERENCES announcements(id)      ON DELETE CASCADE,
  ministry_id     UUID NOT NULL REFERENCES ministries(id)         ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  submitted_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT form_responses_unique UNIQUE (form_id, user_id)
);

CREATE TABLE IF NOT EXISTS form_answers (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  response_id UUID NOT NULL REFERENCES form_responses(id) ON DELETE CASCADE,
  field_id    UUID NOT NULL REFERENCES form_fields(id)    ON DELETE CASCADE,
  value       TEXT,
  values      JSONB NOT NULL DEFAULT '[]'
);

ALTER TABLE announcement_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_fields        ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_answers       ENABLE ROW LEVEL SECURITY;

-- announcement_forms
CREATE POLICY "Ministry members can view forms"
  ON announcement_forms FOR SELECT
  USING (ministry_id = auth_ministry_id());

CREATE POLICY "Leaders/admins can create forms"
  ON announcement_forms FOR INSERT
  WITH CHECK (ministry_id = auth_ministry_id() AND auth_is_admin_or_leader());

CREATE POLICY "Leaders/admins can update forms"
  ON announcement_forms FOR UPDATE
  USING (ministry_id = auth_ministry_id() AND auth_is_admin_or_leader());

CREATE POLICY "Leaders/admins can delete forms"
  ON announcement_forms FOR DELETE
  USING (ministry_id = auth_ministry_id() AND auth_is_admin_or_leader());

-- form_fields
CREATE POLICY "Ministry members can view form fields"
  ON form_fields FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM announcement_forms
      WHERE id = form_fields.form_id AND ministry_id = auth_ministry_id()
    )
  );

CREATE POLICY "Leaders/admins can create form fields"
  ON form_fields FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM announcement_forms
      WHERE id = form_fields.form_id AND ministry_id = auth_ministry_id()
    )
    AND auth_is_admin_or_leader()
  );

CREATE POLICY "Leaders/admins can update form fields"
  ON form_fields FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM announcement_forms
      WHERE id = form_fields.form_id AND ministry_id = auth_ministry_id()
    )
    AND auth_is_admin_or_leader()
  );

CREATE POLICY "Leaders/admins can delete form fields"
  ON form_fields FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM announcement_forms
      WHERE id = form_fields.form_id AND ministry_id = auth_ministry_id()
    )
    AND auth_is_admin_or_leader()
  );

-- form_responses
CREATE POLICY "Users can view their own responses"
  ON form_responses FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Leaders/admins can view all ministry responses"
  ON form_responses FOR SELECT
  USING (ministry_id = auth_ministry_id() AND auth_is_admin_or_leader());

CREATE POLICY "Users can submit responses"
  ON form_responses FOR INSERT
  WITH CHECK (user_id = auth.uid() AND ministry_id = auth_ministry_id());

-- form_answers
CREATE POLICY "Users can view their own answers"
  ON form_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM form_responses
      WHERE id = form_answers.response_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Leaders/admins can view all ministry answers"
  ON form_answers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM form_responses fr
      JOIN announcement_forms af ON fr.form_id = af.id
      WHERE fr.id = form_answers.response_id
        AND af.ministry_id = auth_ministry_id()
        AND auth_is_admin_or_leader()
    )
  );

CREATE POLICY "Users can insert their own answers"
  ON form_answers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM form_responses
      WHERE id = form_answers.response_id AND user_id = auth.uid()
    )
  );
