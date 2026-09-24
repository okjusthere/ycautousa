import type { D1Like, D1Statement } from "./db";
import type { Lead, LeadNotification } from "./types";
import { nowIso, uid } from "./utils";

export type NewLead = {
  vehicleId: string | null;
  leadType: string;
  name: string;
  phone: string | null;
  email: string | null;
  preferredContact: string;
  message: string | null;
  details: Lead["details"];
  sourceUrl: string;
  referrer: string | null;
  utm: Record<string, string>;
  country: string | null;
  ipHash: string | null;
};

export async function atomicBatch(db: D1Like, statements: D1Statement[]) {
  // D1 batch is transactional. Never degrade a durable write to separate calls.
  if (!db.batch) throw new Error("Transactional database binding is required");
  await db.batch(statements);
}

export async function findSubmission(db: D1Like, key: string) {
  return db
    .prepare(
      "SELECT id, submission_hash AS hash FROM leads WHERE submission_key = ?",
    )
    .bind(key)
    .first<{ id: string; hash: string }>();
}

export async function saveLeadAndNotification(
  db: D1Like,
  lead: NewLead,
  submission: { key: string | null; hash: string; recipient: string },
  secureApplication?: { encrypt: (leadId: string) => Promise<string> },
): Promise<{ id: string; created: boolean; hash: string }> {
  if ((lead.leadType === "preapproval") !== Boolean(secureApplication))
    throw new Error("Pre-approval storage requires an encrypted application");
  const id = uid("lead");
  const at = nowIso();
  // Encrypt before any database write. The callback binds the envelope to this
  // server-generated lead ID without exposing plaintext to persistence helpers.
  const ciphertext = secureApplication
    ? await secureApplication.encrypt(id)
    : null;
  await atomicBatch(db, [
    db
      .prepare(
        `INSERT INTO leads
      (id,vehicle_id,lead_type,name,phone,email,preferred_contact,message,details_json,status,
       source_url,referrer,utm_json,cf_country,ip_hash,created_at,updated_at,email_status,submission_key,submission_hash)
      VALUES (?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?,?,?,'pending',?,?)
      ON CONFLICT(submission_key) DO NOTHING`,
      )
      .bind(
        id,
        lead.vehicleId,
        lead.leadType,
        lead.name,
        lead.phone,
        lead.email,
        lead.preferredContact,
        lead.message,
        JSON.stringify(lead.details),
        lead.sourceUrl,
        lead.referrer,
        JSON.stringify(lead.utm),
        lead.country,
        lead.ipHash,
        at,
        at,
        submission.key,
        submission.hash,
      ),
    ...(ciphertext === null
      ? []
      : [
          db
            .prepare(
              `INSERT INTO preapproval_applications (lead_id,ciphertext,created_at)
             SELECT id,?,? FROM leads WHERE id=?`,
            )
            .bind(ciphertext, at, id),
        ]),
    db
      .prepare(
        `INSERT INTO lead_email_jobs (lead_id,recipient,status,next_attempt_at,created_at,updated_at)
      SELECT id,?,'pending',?,?,? FROM leads WHERE id = ?`,
      )
      .bind(submission.recipient, at, at, at, id),
    db
      .prepare(
        `INSERT INTO analytics_daily (date,event_name,vehicle_id,event_count)
      SELECT ?,'lead_submitted',COALESCE(vehicle_id,''),1 FROM leads WHERE id = ?
      ON CONFLICT(date,event_name,vehicle_id) DO UPDATE SET event_count=event_count+1`,
      )
      .bind(at.slice(0, 10), id),
  ]);
  if (!submission.key) return { id, created: true, hash: submission.hash };
  const saved = await findSubmission(db, submission.key);
  if (!saved) throw new Error("Saved submission could not be read");
  return { id: saved.id, created: saved.id === id, hash: saved.hash };
}

export const notificationColumns = `n.recipient AS notification_recipient,
  n.status AS notification_status, n.attempts AS notification_attempts,
  n.next_attempt_at AS notification_next_attempt_at,
  n.last_error_code AS notification_error, n.message_id AS notification_message_id,
  n.updated_at AS notification_updated_at`;

export function readNotification(
  row: Record<string, unknown>,
): LeadNotification | null {
  if (!row.notification_status) return null;
  return {
    status: String(row.notification_status) as LeadNotification["status"],
    recipient: String(row.notification_recipient),
    attempts: Number(row.notification_attempts),
    nextAttemptAt: row.notification_next_attempt_at
      ? String(row.notification_next_attempt_at)
      : null,
    lastErrorCode: row.notification_error
      ? String(row.notification_error)
      : null,
    messageId: row.notification_message_id
      ? String(row.notification_message_id)
      : null,
    updatedAt: String(row.notification_updated_at),
  };
}
