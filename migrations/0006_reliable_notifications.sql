-- Existing inquiries are deliberately not enqueued: no historical email blast.
ALTER TABLE leads ADD COLUMN submission_key TEXT;
ALTER TABLE leads ADD COLUMN submission_hash TEXT;
CREATE UNIQUE INDEX idx_leads_submission_key ON leads(submission_key);

CREATE TABLE lead_email_jobs (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','sending','retrying','sent','failed','unknown')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  last_error_code TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_lead_email_jobs_due ON lead_email_jobs(status, next_attempt_at);

-- Keep legacy readers and operational SQL consistent with the durable job.
CREATE TRIGGER lead_email_job_insert AFTER INSERT ON lead_email_jobs BEGIN
  UPDATE leads SET email_status = NEW.status WHERE id = NEW.lead_id;
END;
CREATE TRIGGER lead_email_job_status AFTER UPDATE OF status ON lead_email_jobs BEGIN
  UPDATE leads SET email_status = NEW.status WHERE id = NEW.lead_id;
END;
