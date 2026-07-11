/*
  # Work From Home attendance mode
  Available to every role (including telecallers) since attendance is a shared self-service feature.
*/
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS work_mode text NOT NULL DEFAULT 'office'
  CHECK (work_mode IN ('office','wfh','field_visit'));
