/*
  # Careers / Job Postings
  - job_postings: Super Admin/HR post open roles per segment, with custom screening questions
  - career_applications: extended with job link, resume, question answers, hiring pipeline status
  - New permissions: view_careers, manage_careers (granted to hr + super_admin by default)
  - Storage bucket for resumes + passport photos (private — staff-only access)
*/

-- ═══════════════════════════════════════════════════════════════
-- 1. Job Postings
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS job_postings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_slug text REFERENCES segments(slug) ON DELETE CASCADE,   -- null = company-wide role
  title text NOT NULL,
  employment_type text NOT NULL DEFAULT 'full_time' CHECK (employment_type IN ('full_time','part_time','contract','intern')),
  location text DEFAULT 'Hyderabad',
  description text NOT NULL DEFAULT '',
  requirements text DEFAULT '',
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,   -- array of question strings shown on the apply form
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  positions_open int DEFAULT 1,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE job_postings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read open jobs" ON job_postings FOR SELECT USING (status = 'open' OR is_super_admin() OR has_permission('manage_careers'));
CREATE POLICY "hr manage jobs" ON job_postings FOR ALL TO authenticated
  USING (is_super_admin() OR has_permission('manage_careers'))
  WITH CHECK (is_super_admin() OR has_permission('manage_careers'));

-- ═══════════════════════════════════════════════════════════════
-- 2. Extend career_applications: job link, resume, answers, pipeline status
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS job_posting_id uuid REFERENCES job_postings(id) ON DELETE SET NULL;
ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS resume_url text;
ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS question_answers jsonb NOT NULL DEFAULT '[]'::jsonb;  -- [{question, answer}]
ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new'
  CHECK (status IN ('new','shortlisted','interviewed','rejected','hired'));
ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE career_applications ADD COLUMN IF NOT EXISTS review_note text DEFAULT '';

-- Replace the old broad "hr read careers" policy with permission-scoped ones.
DROP POLICY IF EXISTS "hr read careers" ON career_applications;
CREATE POLICY "hr read careers" ON career_applications FOR SELECT TO authenticated
  USING (is_super_admin() OR has_permission('view_careers') OR has_permission('manage_careers'));
CREATE POLICY "hr update careers" ON career_applications FOR UPDATE TO authenticated
  USING (is_super_admin() OR has_permission('manage_careers'))
  WITH CHECK (is_super_admin() OR has_permission('manage_careers'));

-- ═══════════════════════════════════════════════════════════════
-- 3. Permissions: view_careers / manage_careers, granted to hr by default
-- ═══════════════════════════════════════════════════════════════
UPDATE role_permissions
SET permissions = permissions || '{"view_careers": true, "manage_careers": true}'::jsonb
WHERE role_name = 'hr';

-- ═══════════════════════════════════════════════════════════════
-- 4. Storage: private bucket for resumes + passport photos
-- ═══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public) VALUES ('career-uploads', 'career-uploads', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public upload career files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'career-uploads');
CREATE POLICY "staff read career files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'career-uploads' AND (is_super_admin() OR has_permission('view_careers') OR has_permission('manage_careers')));
