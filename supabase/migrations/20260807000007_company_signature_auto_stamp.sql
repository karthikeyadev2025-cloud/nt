/*
  # Company signature — auto-stamp on document issue (2026-08-07)

  Documents (offer letters, NDAs, policies) already had a signature slot
  for the EMPLOYEE (signature_data_url / signed_name / acknowledged_at,
  filled in when they view and sign). There was no equivalent for the
  company side — a document went out with nobody representing Nikki
  Technologies having signed it at all.

  Two pieces:
  1. app_users.signature_data_url — a saved signature for whoever issues
     documents (super_admin, or anyone with manage_staff), captured once
     via My Profile, reused automatically after that.
  2. employee_documents gets its own company_* trio (parallel to the
     employee's own signature_data_url/signed_name/acknowledged_at) so a
     document can show both signatures independently, not share one slot.

  The actual "auto-stamp before it's sent" part happens in the app at
  the moment a document is issued (pulls the issuing user's saved
  signature and writes it onto the new row) -- this migration only adds
  the columns that makes that possible.
*/

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS signature_data_url text;

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS company_signature_data_url text,
  ADD COLUMN IF NOT EXISTS company_signed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_signed_at timestamptz;
