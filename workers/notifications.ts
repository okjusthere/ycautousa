import { getLead } from "../lib/db";
import { atomicBatch } from "../lib/lead-delivery";
import { uid } from "../lib/utils";
import type { Env, ExecutionContextLike } from "./env";
import { sendLeadNotification } from "./email";

const MAX_ATTEMPTS = 5;
const RETRY_DELAYS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const SEND_TIMEOUT_MS = 15_000;
const LEASE_MS = 2 * 60_000;
const TRANSIENT_ERRORS = new Set([
  "E_RATE_LIMIT_EXCEEDED",
  "E_DAILY_LIMIT_EXCEEDED",
]);

type ClaimedJob = { recipient: string; attempts: number };

function errorCode(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  // Never persist provider messages: they can contain customer contact details.
  return typeof code === "string" &&
    /^(E_[A-Z_]{1,60}|CONFIGURATION_ERROR|SEND_TIMEOUT)$/.test(code)
    ? code
    : "UNKNOWN_PROVIDER_ERROR";
}

async function withDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              Object.assign(new Error("Email send timed out"), {
                code: "SEND_TIMEOUT",
              }),
            ),
          SEND_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Claim with a compare-and-set so request, cron and admin retries cannot send together. */
export async function processNotification(
  env: Env,
  leadId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const lease = crypto.randomUUID();
  const job = await env.DB.prepare(
    `UPDATE lead_email_jobs
    SET status='sending',attempts=attempts+1,lease_token=?,lease_expires_at=?,updated_at=?
    WHERE lead_id=? AND status IN ('pending','retrying') AND next_attempt_at<=? AND attempts<?
    RETURNING recipient,attempts`,
  )
    .bind(
      lease,
      new Date(Date.now() + LEASE_MS).toISOString(),
      now,
      leadId,
      now,
      MAX_ATTEMPTS,
    )
    .first<ClaimedJob>();
  if (!job) return;
  let status: "sent" | "retrying" | "failed" | "unknown" = "sent";
  let code: string | null = null;
  let messageId: string | null = null;
  let nextAttempt: string | null = null;
  try {
    const lead = await getLead(env.DB, leadId);
    if (!lead)
      throw Object.assign(new Error("Lead is missing"), {
        code: "CONFIGURATION_ERROR",
      });
    const result = await withDeadline(
      sendLeadNotification(env, lead, job.recipient),
    );
    messageId = result.messageId;
  } catch (error) {
    code = errorCode(error);
    if (TRANSIENT_ERRORS.has(code) && job.attempts < MAX_ATTEMPTS) {
      status = "retrying";
      nextAttempt = new Date(
        Date.now() + RETRY_DELAYS[job.attempts - 1],
      ).toISOString();
    } else {
      // No provider idempotency API exists. A timeout/network error might already
      // have delivered; automatically resending it could produce duplicate mail.
      status = [
        "SEND_TIMEOUT",
        "UNKNOWN_PROVIDER_ERROR",
        "E_INTERNAL_SERVER_ERROR",
      ].includes(code)
        ? "unknown"
        : "failed";
    }
  }
  await env.DB.prepare(
    `UPDATE lead_email_jobs
    SET status=?,next_attempt_at=?,last_error_code=?,message_id=?,lease_token=NULL,lease_expires_at=NULL,updated_at=?
    WHERE lead_id=? AND status='sending' AND lease_token=?`,
  )
    .bind(
      status,
      nextAttempt,
      code,
      messageId,
      new Date().toISOString(),
      leadId,
      lease,
    )
    .run();
}

export function scheduleNotification(
  env: Env,
  ctx: ExecutionContextLike,
  leadId: string,
): void {
  ctx.waitUntil(
    processNotification(env, leadId).catch(() => {
      // The durable row survives a process/database failure; cron handles it.
      console.error("notification processing interrupted", { leadId });
    }),
  );
}

export async function processDueNotifications(env: Env): Promise<void> {
  const at = new Date().toISOString();
  // A terminated worker may have sent before losing its lease. Require review.
  await env.DB.prepare(
    `UPDATE lead_email_jobs SET status='unknown',last_error_code='LEASE_EXPIRED',
    lease_token=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=?
    WHERE status='sending' AND lease_expires_at<=?`,
  )
    .bind(at, at)
    .run();
  const due = await env.DB.prepare(
    `SELECT lead_id FROM lead_email_jobs
    WHERE status IN ('pending','retrying') AND next_attempt_at<=? AND attempts<?
    ORDER BY next_attempt_at LIMIT 20`,
  )
    .bind(at, MAX_ATTEMPTS)
    .all<{ lead_id: string }>();
  const jobs = due.results ?? [];
  // Bounded parallelism keeps a provider outage from monopolizing each cron run.
  for (let index = 0; index < jobs.length; index += 5) {
    const results = await Promise.allSettled(
      jobs
        .slice(index, index + 5)
        .map((job) => processNotification(env, job.lead_id)),
    );
    if (results.some((result) => result.status === "rejected"))
      console.error("notification batch interrupted");
  }
}

/** Queue explicit admin retries only; never backfill historical leads automatically. */
export async function queueManualRetry(
  env: Env,
  leadId: string,
  adminEmail: string,
  confirmUncertain: boolean,
): Promise<boolean> {
  const at = new Date().toISOString();
  const cooldown = new Date(Date.now() - 60_000).toISOString();
  const auditId = uid("audit");
  const marker = crypto.randomUUID();
  await atomicBatch(env.DB, [
    env.DB.prepare(
      `INSERT INTO lead_email_jobs (lead_id,recipient,status,attempts,next_attempt_at,lease_token,created_at,updated_at)
      SELECT id,?,'pending',0,?,?,?,? FROM leads
      WHERE id=? AND email_status IN ('failed','skipped','unknown') AND (email_status<>'unknown' OR ?=1)
      ON CONFLICT(lead_id) DO UPDATE SET status='pending',attempts=0,next_attempt_at=excluded.next_attempt_at,
        recipient=excluded.recipient,lease_token=excluded.lease_token,lease_expires_at=NULL,last_error_code=NULL,message_id=NULL,updated_at=excluded.updated_at
      WHERE lead_email_jobs.status IN ('failed','unknown') AND (lead_email_jobs.status<>'unknown' OR ?=1)
        AND lead_email_jobs.updated_at<=?`,
    ).bind(
      env.EMAIL_TO?.trim() ?? "",
      at,
      marker,
      at,
      at,
      leadId,
      confirmUncertain ? 1 : 0,
      confirmUncertain ? 1 : 0,
      cooldown,
    ),
    env.DB.prepare(
      `INSERT INTO audit_logs (id,admin_email,action,entity_type,entity_id,details_json,created_at)
      SELECT ?,?,'lead_email_retry','lead',lead_id,?,? FROM lead_email_jobs WHERE lead_id=? AND lease_token=?`,
    ).bind(
      auditId,
      adminEmail,
      JSON.stringify({ confirmedUncertain: confirmUncertain }),
      at,
      leadId,
      marker,
    ),
  ]);
  return !!(await env.DB.prepare("SELECT id FROM audit_logs WHERE id=?")
    .bind(auditId)
    .first());
}
