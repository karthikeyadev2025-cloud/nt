/*
  # ID Proof document uploads (2026-08-07)

  Real gap found while auditing the training manual against the actual
  app: the whole "Documents" system (employee_documents) only ever
  generates text templates (offer letters, NDAs, policies) — there was
  no way for anyone, staff or HR, to actually upload a file. Nowhere in
  the system could a scanned Aadhaar card or PAN card be attached to an
  employee's record.

  Scoped to ID proof specifically, per instruction — not a general
  file-attachment system. Both staff (their own) and HR/admin (for any
  staff member) can upload; HR/admin can additionally mark one as
  verified, which nobody else can do.
*/

CREATE TABLE IF NOT EXISTS staff_id_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('aadhaar', 'pan', 'passport', 'driving_license', 'voter_id', 'other')),
  file_path text NOT NULL,
  file_name text DEFAULT '',
  uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  uploaded_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  verified_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  notes text DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_id_proofs_staff ON staff_id_proofs(staff_user_id);

ALTER TABLE staff_id_proofs ENABLE ROW LEVEL SECURITY;

-- View: your own, or HR/admin viewing anyone's.
DROP POLICY IF EXISTS "view own or hr id proofs" ON staff_id_proofs;
CREATE POLICY "view own or hr id proofs" ON staff_id_proofs FOR SELECT TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR has_permission('manage_staff'));

-- Upload: your own, or HR/admin uploading for anyone.
DROP POLICY IF EXISTS "upload own or hr id proofs" ON staff_id_proofs;
CREATE POLICY "upload own or hr id proofs" ON staff_id_proofs FOR INSERT TO authenticated
  WITH CHECK (staff_user_id = auth.uid() OR is_super_admin() OR has_permission('manage_staff'));

-- Delete: your own upload (fix a mistake), or HR/admin.
DROP POLICY IF EXISTS "delete own or hr id proofs" ON staff_id_proofs;
CREATE POLICY "delete own or hr id proofs" ON staff_id_proofs FOR DELETE TO authenticated
  USING (staff_user_id = auth.uid() OR is_super_admin() OR has_permission('manage_staff'));

-- Update (verification): HR/admin only — a staff member marking their
-- own ID proof "verified" would defeat the point of verification.
DROP POLICY IF EXISTS "hr verify id proofs" ON staff_id_proofs;
CREATE POLICY "hr verify id proofs" ON staff_id_proofs FOR UPDATE TO authenticated
  USING (is_super_admin() OR has_permission('manage_staff'))
  WITH CHECK (is_super_admin() OR has_permission('manage_staff'));

-- Storage: private bucket, path convention "{staff_user_id}/{file}" so
-- the folder-ownership check below works the same way lead-photos does.
INSERT INTO storage.buckets (id, name, public) VALUES
  ('id-proofs', 'id-proofs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "id proofs upload own or hr" ON storage.objects;
CREATE POLICY "id proofs upload own or hr" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'id-proofs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR is_super_admin() OR has_permission('manage_staff'))
  );

DROP POLICY IF EXISTS "id proofs read own or hr" ON storage.objects;
CREATE POLICY "id proofs read own or hr" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'id-proofs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR is_super_admin() OR has_permission('manage_staff'))
  );

DROP POLICY IF EXISTS "id proofs delete own or hr" ON storage.objects;
CREATE POLICY "id proofs delete own or hr" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'id-proofs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR is_super_admin() OR has_permission('manage_staff'))
  );
