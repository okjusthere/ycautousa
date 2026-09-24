-- Applications are isolated from ordinary lead reads and notification content.
-- Only authenticated encryption envelopes belong in this table.
CREATE TABLE preapproval_applications (
  lead_id TEXT PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL
);
