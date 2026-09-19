import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../../workers/app";
import {
  processDueNotifications,
  processNotification,
  queueManualRetry,
} from "../../workers/notifications";
import { saveLeadAndNotification } from "../../lib/lead-delivery";
import { getLead, getSettings } from "../../lib/db";
import type { Env } from "../../workers/env";
import { SqliteD1 } from "../helpers/sqlite-d1";

let requestCount = 0;
const origin = "http://localhost:5173";
const adminHeaders = { Origin: origin, "Content-Type": "application/json" };
const payload = {
  name: "Test Buyer",
  email: "buyer@example.com",
  leadType: "contact",
  preferredContact: "email",
  turnstileToken: "verified-token",
};
function setup() {
  const db = new SqliteD1();
  const send = vi.fn(async () => ({ messageId: "test-provider-message" }));
  const env: Env = {
    DB: db,
    APP_ORIGIN: origin,
    DEV_ADMIN_EMAIL: "admin@example.com",
    ADMIN_EMAILS: "admin@example.com",
    EMAIL_FROM: "leads@example.com",
    EMAIL_TO: "sophie@youxuancars.com",
    EMAIL: { send },
  };
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (task: Promise<unknown>) => pending.push(task) };
  const verifier = vi.fn(async () => ({ success: true }));
  const post = (key = crypto.randomUUID(), data = payload) =>
    handleRequest(
      new Request(`${origin}/api/leads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          "CF-Connecting-IP": `test-${++requestCount}`,
        },
        body: JSON.stringify(data),
      }),
      env,
      ctx,
      { turnstileImpl: verifier },
    );
  return { db, env, send, pending, ctx, post, verifier };
}
async function seed(env: Env) {
  return (
    await saveLeadAndNotification(
      env.DB,
      {
        vehicleId: null,
        leadType: "contact",
        name: "Test Buyer",
        phone: null,
        email: "buyer@example.com",
        preferredContact: "email",
        message: null,
        details: {},
        sourceUrl: origin,
        referrer: null,
        utm: {},
        country: null,
        ipHash: null,
      },
      { key: crypto.randomUUID(), hash: "test-hash", recipient: env.EMAIL_TO! },
    )
  ).id;
}
async function due(env: Env, id: string) {
  await env.DB.prepare(
    "UPDATE lead_email_jobs SET next_attempt_at='2000-01-01T00:00:00.000Z',updated_at='2000-01-01T00:00:00.000Z' WHERE lead_id=?",
  )
    .bind(id)
    .run();
}
afterEach(() => vi.useRealTimers());

describe("Durable lead notifications", () => {
  it("acknowledges a saved lead while mail is still pending, then records provider acceptance", async () => {
    const { env, post, send, pending } = setup();
    let finish!: (result: { messageId: string }) => void;
    send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const response = await post();
    expect(response.status).toBe(200);
    const { leadId } = (await response.json()) as { leadId: string };
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect((await getLead(env.DB, leadId))?.emailStatus).toBe("sending");
    finish({ messageId: "accepted-123" });
    await Promise.all(pending);
    expect((await getLead(env.DB, leadId))?.notification).toMatchObject({
      status: "sent",
      attempts: 1,
      messageId: "accepted-123",
      recipient: env.EMAIL_TO,
    });
  });

  it("reuses a committed submission without verifying a consumed token, and rejects changed payloads", async () => {
    const { post, env, send, pending, verifier } = setup();
    const key = crypto.randomUUID();
    const first = await (await post(key)).json();
    const second = await (
      await post(key, { ...payload, turnstileToken: "new-token" })
    ).json();
    expect(second).toEqual(first);
    expect(verifier).toHaveBeenCalledTimes(1);
    expect(
      (await post(key, { ...payload, name: "Another Buyer" })).status,
    ).toBe(409);
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM leads").first(),
    ).toEqual({ count: 1 });
    expect(
      await env.DB.prepare(
        "SELECT SUM(event_count) AS count FROM analytics_daily",
      ).first(),
    ).toEqual({ count: 1 });
  });

  it("commits only one lead and one job for concurrent submissions", async () => {
    const { env, post, pending, send } = setup();
    const key = crypto.randomUUID();
    const responses = await Promise.all([post(key), post(key)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM lead_email_jobs",
      ).first(),
    ).toEqual({ count: 1 });
  });

  it("rolls back the lead, job and analytics when an outbox write fails", async () => {
    const { db, env } = setup();
    db.sqlite.exec(
      "CREATE TRIGGER reject_job BEFORE INSERT ON lead_email_jobs BEGIN SELECT RAISE(ABORT,'test rejection'); END;",
    );
    await expect(seed(env)).rejects.toThrow();
    expect(
      await db.prepare("SELECT COUNT(*) AS count FROM leads").first(),
    ).toEqual({ count: 0 });
    expect(
      await db.prepare("SELECT COUNT(*) AS count FROM analytics_daily").first(),
    ).toEqual({ count: 0 });
  });

  it("retries transient errors on cron and stops after the bounded attempt limit", async () => {
    const { env, send } = setup();
    send.mockRejectedValue(
      Object.assign(new Error("private provider details"), {
        code: "E_RATE_LIMIT_EXCEEDED",
      }),
    );
    const id = await seed(env);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await due(env, id);
      await processDueNotifications(env);
      expect((await getLead(env.DB, id))?.notification).toMatchObject({
        status: attempt === 5 ? "failed" : "retrying",
        attempts: attempt,
        lastErrorCode: "E_RATE_LIMIT_EXCEEDED",
      });
    }
    await processDueNotifications(env);
    expect(send).toHaveBeenCalledTimes(5);
  });

  it("claims a job once across concurrent processors and recovers a transient failure", async () => {
    const { env, send } = setup();
    send.mockRejectedValueOnce(
      Object.assign(new Error("temporary failure"), {
        code: "E_RATE_LIMIT_EXCEEDED",
      }),
    );
    const id = await seed(env);
    await Promise.all([
      processNotification(env, id),
      processNotification(env, id),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    await due(env, id);
    await processDueNotifications(env);
    expect((await getLead(env.DB, id))?.notification).toMatchObject({
      status: "sent",
      attempts: 2,
    });
  });

  it("does not automatically resend after timeout or an expired sending lease", async () => {
    vi.useFakeTimers();
    const { env, send } = setup();
    send.mockImplementationOnce(() => new Promise(() => {}));
    const id = await seed(env);
    const task = processNotification(env, id);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(15_001);
    await task;
    expect((await getLead(env.DB, id))?.notification).toMatchObject({
      status: "unknown",
      lastErrorCode: "SEND_TIMEOUT",
    });
    const lost = await seed(env);
    await env.DB.prepare(
      "UPDATE lead_email_jobs SET status='sending',lease_token='lost',lease_expires_at='2000-01-01T00:00:00.000Z' WHERE lead_id=?",
    )
      .bind(lost)
      .run();
    await processDueNotifications(env);
    expect((await getLead(env.DB, lost))?.notification).toMatchObject({
      status: "unknown",
      lastErrorCode: "LEASE_EXPIRED",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not resend an accepted email if persisting its result failed", async () => {
    const { env, send } = setup();
    const id = await seed(env);
    const prepare = env.DB.prepare.bind(env.DB);
    const spy = vi.spyOn(env.DB, "prepare").mockImplementation((sql) => {
      if (sql.includes("SET status=?,next_attempt_at="))
        throw new Error("Database unavailable after send");
      return prepare(sql);
    });
    await expect(processNotification(env, id)).rejects.toThrow(
      "Database unavailable",
    );
    spy.mockRestore();
    await env.DB.prepare(
      "UPDATE lead_email_jobs SET lease_expires_at='2000-01-01T00:00:00.000Z' WHERE lead_id=?",
    )
      .bind(id)
      .run();
    await processDueNotifications(env);
    expect((await getLead(env.DB, id))?.emailStatus).toBe("unknown");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("treats internal service errors as uncertain because provider acceptance is not guaranteed", async () => {
    const { env, send } = setup();
    send.mockRejectedValue(
      Object.assign(new Error("private service details"), {
        code: "E_INTERNAL_SERVER_ERROR",
      }),
    );
    const id = await seed(env);
    await processNotification(env, id);
    await processDueNotifications(env);
    expect((await getLead(env.DB, id))?.notification).toMatchObject({
      status: "unknown",
      lastErrorCode: "E_INTERNAL_SERVER_ERROR",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("marks permanent rejection as failed, and blocks unverified configured recipients", async () => {
    const { env, send } = setup();
    send.mockRejectedValueOnce(
      Object.assign(new Error("recipient blocked"), {
        code: "E_RECIPIENT_SUPPRESSED",
      }),
    );
    const first = await seed(env);
    await processNotification(env, first);
    expect((await getLead(env.DB, first))?.emailStatus).toBe("failed");
    const second = await seed(env);
    await env.DB.prepare(
      "UPDATE lead_email_jobs SET recipient='unverified@example.com' WHERE lead_id=?",
    )
      .bind(second)
      .run();
    await processNotification(env, second);
    expect((await getLead(env.DB, second))?.notification?.lastErrorCode).toBe(
      "CONFIGURATION_ERROR",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("requires explicit confirmation for uncertain retries and queues/audits only once", async () => {
    const { env } = setup();
    const id = await seed(env);
    await env.DB.prepare(
      "UPDATE lead_email_jobs SET status='unknown' WHERE lead_id=?",
    )
      .bind(id)
      .run();
    await due(env, id);
    expect(await queueManualRetry(env, id, "admin@example.com", false)).toBe(
      false,
    );
    const results = await Promise.all([
      queueManualRetry(env, id, "admin@example.com", true),
      queueManualRetry(env, id, "admin@example.com", true),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE action='lead_email_retry'",
      ).first(),
    ).toEqual({ count: 1 });
    await processNotification(env, id);
    expect(await queueManualRetry(env, id, "admin@example.com", true)).toBe(
      false,
    );
  });

  it("does not backfill historical leads until an administrator explicitly retries", async () => {
    const { env, send } = setup();
    const id = await seed(env);
    await env.DB.prepare("DELETE FROM lead_email_jobs WHERE lead_id=?")
      .bind(id)
      .run();
    await env.DB.prepare("UPDATE leads SET email_status='skipped' WHERE id=?")
      .bind(id)
      .run();
    await processDueNotifications(env);
    expect(send).not.toHaveBeenCalled();
    expect(await queueManualRetry(env, id, "admin@example.com", false)).toBe(
      true,
    );
    await processNotification(env, id);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("guards the retry endpoint with authentication and same-origin checks", async () => {
    const { env, ctx, pending } = setup();
    const id = await seed(env);
    await env.DB.prepare(
      "UPDATE lead_email_jobs SET status='failed' WHERE lead_id=?",
    )
      .bind(id)
      .run();
    await due(env, id);
    const request = (headers: HeadersInit = adminHeaders) =>
      new Request(`${origin}/api/admin/leads/${id}/email/retry`, {
        method: "POST",
        headers,
        body: "{}",
      });
    expect(
      (
        await handleRequest(
          request(),
          { ...env, DEV_ADMIN_EMAIL: undefined },
          ctx,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleRequest(
          request({ ...adminHeaders, Origin: "https://attacker.example" }),
          env,
          ctx,
        )
      ).status,
    ).toBe(403);
    expect((await handleRequest(request(), env, ctx)).status).toBe(202);
    await Promise.all(pending);
    expect((await handleRequest(request(), env, ctx)).status).toBe(409);
  });

  it("rejects an unsupported notification recipient without modifying public settings", async () => {
    const { env } = setup();
    const settings = await getSettings(env.DB);
    const response = await handleRequest(
      new Request(`${origin}/api/admin/settings`, {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({
          ...settings,
          leadNotificationRecipient: "wrong@example.com",
        }),
      }),
      env,
    );
    expect(response.status).toBe(400);
    expect(await getSettings(env.DB)).toEqual(settings);
  });
});
