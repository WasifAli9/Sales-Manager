-- Add lead_type to flag end users vs resellers
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS lead_type text NOT NULL DEFAULT 'end_user';
