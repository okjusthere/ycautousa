import { afterEach, describe, expect, it, vi } from "vitest";
import { getLead } from "../../lib/db";
import { handleRequest } from "../../workers/app";
import type { Env } from "../../workers/env";
import { SqliteD1 } from "../helpers/sqlite-d1";

// Deliberately synthetic identity; these requests never leave the in-memory Worker.
const identity = {
  name: "Synthetic Preapproval Applicant",
  phone: "2125550187",
  email: "synthetic-applicant@example.invalid",
};
const application = {
  ssn: "123456789",
  addressLine1: "104 Synthetic Avenue",
  addressLine2: "Test Unit 42",
  city: "Flushing",
  state: "NY",
  postalCode: "11358",
  residenceYears: 3,
  residenceMonths: 4,
  consent: true,
};
const origin = "http://localhost:5173";
const headers = { Origin: origin, "Content-Type": "application/json" };
const privateValues = [
  ...Object.values(identity),
  application.ssn,
  application.addressLine1,
  application.addressLine2,
];
const fixtures: Array<{ db: SqliteD1; pending: Promise<unknown>[] }> = [];

function expectNoPrivateValues(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const privateValue of privateValues)
    expect(serialized).not.toContain(privateValue);
}

async function setup() {
  const db = new SqliteD1();
  const pending: Promise<unknown>[] = [];
  fixtures.push({ db, pending });
  const send = vi.fn<(message: unknown) => Promise<{ messageId: string }>>(
    async () => ({ messageId: "synthetic-preapproval-message" }),
  );
  const env: Env = {
    DB: db,
    APP_ORIGIN: origin,
    DEV_ADMIN_EMAIL: "admin@example.com",
    ADMIN_EMAILS: "admin@example.com",
    EMAIL_FROM: "leads@example.com",
    EMAIL_TO: "sophie@youxuancars.com",
    EMAIL: { send },
    PREAPPROVAL_KEYS: JSON.stringify({
      activeKeyId: "v1",
      keys: { v1: Buffer.alloc(32, 7).toString("base64") },
    }),
  };
  const create = await handleRequest(
    new Request(`${origin}/api/admin/vehicles`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "2022 Toyota Synthetic Test",
        status: "available",
        priceCents: 2_699_000,
      }),
    }),
    env,
  );
  expect(create.status).toBe(201);
  const { id: vehicleId } = (await create.json()) as { id: string };
  const data = {
    ...identity,
    vehicleId,
    leadType: "preapproval",
    preapproval: application,
    turnstileToken: "synthetic-verification-token",
    // Untrusted attribution must not copy identity values into ordinary rows or emails.
    message: `My SSN is ${application.ssn}`,
    sourceUrl: `${origin}/contact?ssn=${application.ssn}`,
    referrer: `${origin}/?applicant=${identity.email}`,
    utm: { applicant: identity.name },
  };
  const verifier = vi.fn(async () => ({ success: true }));
  const post = (
    overrides: Record<string, unknown> = {},
    key = crypto.randomUUID(),
    useEnv = env,
  ) =>
    handleRequest(
      new Request(`${origin}/api/leads`, {
        method: "POST",
        headers: {
          ...headers,
          "Idempotency-Key": key,
          "CF-Connecting-IP": crypto.randomUUID(),
        },
        body: JSON.stringify({ ...data, ...overrides }),
      }),
      useEnv,
      { waitUntil: (promise: Promise<unknown>) => pending.push(promise) },
      { turnstileImpl: verifier },
    );
  const admin = (
    path: string,
    body?: unknown,
    useEnv = env,
    requestHeaders = headers,
  ) =>
    handleRequest(
      new Request(`${origin}/api/admin/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: requestHeaders,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      useEnv,
    );
  const submit = async (overrides: Record<string, unknown> = {}) => {
    const response = await post(overrides);
    expect(response.status).toBe(200);
    return (await response.json()) as { ok: boolean; leadId: string };
  };
  return { db, env, pending, send, verifier, vehicleId, post, submit, admin };
}

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await Promise.all(fixture.pending);
    fixture.db.sqlite.close();
  }
  vi.restoreAllMocks();
});

describe("Encrypted preapproval applications", () => {
  it("accepts an application without a credit selection and exposes only metadata outside the audited view", async () => {
    const { env, pending, send, submit, admin } = await setup();
    const saved = await submit();
    expectNoPrivateValues(saved);
    const lead = await getLead(env.DB, saved.leadId);
    expect(lead).toMatchObject({
      leadType: "preapproval",
      name: "Pre-approval applicant",
      phone: null,
      email: null,
      message: null,
      referrer: null,
      utm: {},
      details: {
        preapproval: {
          status: "received",
          submittedAt: expect.any(String),
          deletedAt: null,
        },
      },
    });
    expect(lead!.details.financing).toBeUndefined();
    expectNoPrivateValues(lead);
    const encrypted = await env.DB.prepare(
      "SELECT * FROM preapproval_applications WHERE lead_id=?",
    )
      .bind(saved.leadId)
      .first<{ ciphertext: string }>();
    expect(encrypted?.ciphertext.length).toBeGreaterThan(100);
    for (const table of [
      "leads",
      "preapproval_applications",
      "lead_email_jobs",
      "audit_logs",
      "analytics_daily",
    ])
      expectNoPrivateValues(
        await env.DB.prepare(`SELECT * FROM ${table}`).all(),
      );
    for (const path of ["leads", `leads/${saved.leadId}`, "dashboard", "audit"])
      expectNoPrivateValues(await (await admin(path)).text());
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
    const notification = send.mock.calls[0][0];
    expectNoPrivateValues(notification);
    expect(notification).toMatchObject({
      text: expect.stringContaining(`/admin/leads/${saved.leadId}`),
      html: expect.stringContaining("2022 Toyota Synthetic Test"),
    });
  });

  it.each([
    undefined,
    "invalid-json",
    JSON.stringify({ activeKeyId: "missing", keys: {} }),
  ])(
    "returns 503 with no writes when the encryption key is unavailable (%s)",
    async (keyring) => {
      const { env, post, send } = await setup();
      const response = await post({}, crypto.randomUUID(), {
        ...env,
        PREAPPROVAL_KEYS: keyring,
      });
      expect(response.status).toBe(503);
      expectNoPrivateValues(await response.text());
      for (const table of [
        "leads",
        "preapproval_applications",
        "lead_email_jobs",
        "analytics_daily",
      ])
        expect(
          await env.DB.prepare(
            `SELECT COUNT(*) AS count FROM ${table}`,
          ).first(),
        ).toEqual({ count: 0 });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("commits only one encrypted application and notification across concurrent and repeated submissions", async () => {
    const { env, post, pending, send } = await setup();
    const key = crypto.randomUUID();
    const responses = await Promise.all([post({}, key), post({}, key)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const saved = await responses[0].json();
    expect(await responses[1].json()).toEqual(saved);
    const original = await env.DB.prepare(
      "SELECT ciphertext FROM preapproval_applications",
    ).first();
    expect(
      await (await post({ turnstileToken: "replacement-token" }, key)).json(),
    ).toEqual(saved);
    expect(
      await env.DB.prepare(
        "SELECT ciphertext FROM preapproval_applications",
      ).first(),
    ).toEqual(original);
    expect(
      (await post({ preapproval: { ...application, residenceMonths: 5 } }, key))
        .status,
    ).toBe(409);
    await Promise.all(pending);
    for (const table of [
      "leads",
      "preapproval_applications",
      "lead_email_jobs",
    ])
      expect(
        await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first(),
      ).toEqual({ count: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns decrypted data only through an authorized, reasoned, non-cacheable view with an audit record", async () => {
    const { env, submit, admin } = await setup();
    const { leadId } = await submit();
    const response = await admin(`leads/${leadId}/preapproval/view`, {
      reason: "application_review",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    const result = (await response.json()) as { application: unknown };
    expect(result.application).toMatchObject({ ...identity, ...application });
    const audit = await env.DB.prepare(
      "SELECT admin_email,entity_id,details_json FROM audit_logs WHERE action='preapproval_viewed'",
    ).first<{ admin_email: string; entity_id: string; details_json: string }>();
    expect(audit).toMatchObject({
      admin_email: "admin@example.com",
      entity_id: leadId,
    });
    expect(JSON.parse(audit!.details_json)).toEqual({
      reason: "application_review",
    });
    expectNoPrivateValues(audit);
  });

  it("denies anonymous, unapproved and cross-origin viewing and deletion", async () => {
    const { env, submit, admin } = await setup();
    const { leadId } = await submit();
    for (const [action, body] of [
      ["view", { reason: "application_review" }],
      ["delete", { confirm: true }],
    ] as const) {
      const path = `leads/${leadId}/preapproval/${action}`;
      const anonymous = await admin(path, body, {
        ...env,
        DEV_ADMIN_EMAIL: undefined,
      });
      expect([401, 403]).toContain(anonymous.status);
      expectNoPrivateValues(await anonymous.text());
      const unapproved = await admin(path, body, {
        ...env,
        DEV_ADMIN_EMAIL: "other@example.com",
      });
      expect([401, 403]).toContain(unapproved.status);
      const crossOrigin = await admin(path, body, env, {
        ...headers,
        Origin: "https://untrusted.example",
      });
      expect(crossOrigin.status).toBe(403);
      expectNoPrivateValues(await crossOrigin.text());
    }
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE action LIKE 'preapproval_%'",
      ).first(),
    ).toEqual({ count: 0 });
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM preapproval_applications",
      ).first(),
    ).toEqual({ count: 1 });
  });

  it("rejects empty or arbitrary audit reasons and never exposes data if auditing fails", async () => {
    const { db, env, submit, admin } = await setup();
    const { leadId } = await submit();
    const path = `leads/${leadId}/preapproval/view`;
    for (const body of [{}, { reason: "" }, { reason: application.ssn }]) {
      const response = await admin(path, body);
      expect(response.status).toBe(400);
      expectNoPrivateValues(await response.text());
    }
    expect((await admin(path)).status).toBeGreaterThanOrEqual(400);
    db.sqlite.exec(
      "CREATE TRIGGER reject_private_audit BEFORE INSERT ON audit_logs WHEN NEW.action='preapproval_viewed' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const blocked = await admin(path, { reason: "application_review" });
    expect(blocked.status).toBeGreaterThanOrEqual(500);
    expectNoPrivateValues(await blocked.text());
    expectNoPrivateValues(log.mock.calls);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE action='preapproval_viewed'",
      ).first(),
    ).toEqual({ count: 0 });
  });

  it("deletes the encrypted record only after confirmation and records a metadata-only audit", async () => {
    const { env, submit, admin } = await setup();
    const { leadId } = await submit();
    const path = `leads/${leadId}/preapproval/delete`;
    expect((await admin(path, { confirm: false })).status).toBe(400);
    const response = await admin(path, { confirm: true });
    expect(response.status).toBe(200);
    expectNoPrivateValues(await response.text());
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM preapproval_applications",
      ).first(),
    ).toEqual({ count: 0 });
    expect((await getLead(env.DB, leadId))?.details.preapproval).toMatchObject({
      status: "deleted",
      submittedAt: expect.any(String),
      deletedAt: expect.any(String),
    });
    const view = await admin(`leads/${leadId}/preapproval/view`, {
      reason: "application_review",
    });
    expect(view.status).toBe(404);
    expectNoPrivateValues(await view.text());
    const audits = await env.DB.prepare(
      "SELECT * FROM audit_logs WHERE action='preapproval_deleted'",
    ).all();
    expect(audits.results).toHaveLength(1);
    expectNoPrivateValues(audits);
  });

  it("does not disclose an application when the audit driver reports an unsuccessful write", async () => {
    const { db, submit, admin } = await setup();
    const { leadId } = await submit();
    const prepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((sql) => {
      const statement = prepare(sql);
      if (!sql.startsWith("INSERT INTO audit_logs")) return statement;
      const bind = statement.bind.bind(statement);
      statement.bind = (...values: unknown[]) => ({
        ...bind(...values),
        run: async () => ({ success: false }),
      });
      return statement;
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await admin(`leads/${leadId}/preapproval/view`, {
      reason: "application_review",
    });
    expect(response.status).toBeGreaterThanOrEqual(500);
    expectNoPrivateValues(await response.text());
    expectNoPrivateValues(log.mock.calls);
  });

  it("rolls back the entire submission if encrypted application storage fails", async () => {
    const { db, env, post, send } = await setup();
    db.sqlite.exec(
      "CREATE TRIGGER reject_application BEFORE INSERT ON preapproval_applications BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END;",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await post();
    expect(response.status).toBeGreaterThanOrEqual(500);
    expectNoPrivateValues(await response.text());
    for (const table of [
      "leads",
      "preapproval_applications",
      "lead_email_jobs",
      "analytics_daily",
    ])
      expect(
        await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first(),
      ).toEqual({ count: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("rolls back deletion if its audit record cannot be written", async () => {
    const { db, env, submit, admin } = await setup();
    const { leadId } = await submit();
    const before = await env.DB.prepare(
      "SELECT ciphertext FROM preapproval_applications WHERE lead_id=?",
    )
      .bind(leadId)
      .first();
    db.sqlite.exec(
      "CREATE TRIGGER reject_private_delete BEFORE INSERT ON audit_logs WHEN NEW.action='preapproval_deleted' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      (await admin(`leads/${leadId}/preapproval/delete`, { confirm: true }))
        .status,
    ).toBeGreaterThanOrEqual(500);
    expect(
      await env.DB.prepare(
        "SELECT ciphertext FROM preapproval_applications WHERE lead_id=?",
      )
        .bind(leadId)
        .first(),
    ).toEqual(before);
    expect((await getLead(env.DB, leadId))?.details.preapproval?.status).toBe(
      "received",
    );
  });

  it.each([
    ["missing SSN", { ssn: undefined }],
    ["short SSN", { ssn: "1234" }],
    ["invalid SSN", { ssn: "000000000" }],
    ["missing address", { addressLine1: "" }],
    ["missing city", { city: "" }],
    ["invalid state", { state: "ZZ" }],
    ["invalid ZIP", { postalCode: "ABCDE" }],
    ["negative residence", { residenceYears: -1 }],
    ["fractional residence", { residenceYears: 0.5 }],
    ["invalid months", { residenceMonths: 12 }],
    ["missing consent", { consent: undefined }],
    ["refused consent", { consent: false }],
  ])("rejects %s before storing or sending", async (_name, invalid) => {
    const { env, post, send } = await setup();
    expect(
      (await post({ preapproval: { ...application, ...invalid } })).status,
    ).toBe(400);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM leads").first(),
    ).toEqual({ count: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("requires applicant name, phone, email and a real available vehicle", async () => {
    const { env, post, vehicleId, send } = await setup();
    for (const invalid of [
      { name: "" },
      { phone: null },
      { phone: "1234567890123456" },
      { phone: "call2125550187" },
      { email: null },
      { email: "invalid" },
      { vehicleId: null },
      { preapproval: undefined },
      { leadType: "contact" },
    ])
      expect((await post(invalid)).status).toBe(400);
    expect((await post({ vehicleId: "missing-vehicle" })).status).toBe(409);
    await env.DB.prepare("UPDATE vehicles SET status='sold' WHERE id=?")
      .bind(vehicleId)
      .run();
    expect((await post()).status).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });
});
