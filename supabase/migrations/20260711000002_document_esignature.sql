/*
  # E-Signature for Onboarding Documents
  - document_templates.requires_signature: does this doc type need a signature, or just acknowledgement?
  - employee_documents: signature_data_url (drawn) + signed_name (typed) captured at signing time
*/

ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS requires_signature boolean NOT NULL DEFAULT true;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS requires_signature boolean NOT NULL DEFAULT true;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS signature_data_url text;
ALTER TABLE employee_documents ADD COLUMN IF NOT EXISTS signed_name text;

-- Roles & Responsibilities and generic policies are acknowledge-only by default;
-- offer/welcome letters require an actual signature.
UPDATE document_templates SET requires_signature = false WHERE doc_type IN ('roles_responsibilities', 'policy');
