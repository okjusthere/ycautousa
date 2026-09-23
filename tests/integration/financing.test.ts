import { afterEach, describe, expect, it, vi } from "vitest";
import { getLead, getSettings } from "../../lib/db";
import type { FinancingConfig } from "../../lib/financing";
import { handleRequest } from "../../workers/app";
import type { Env } from "../../workers/env";
import { SqliteD1 } from "../helpers/sqlite-d1";

const origin = "http://localhost:5173";
const headers = { Origin: origin, "Content-Type": "application/json" };
const selection = {
  creditTier: "excellent",
  termMonths: 72,
  downPaymentCents: 500_000,
};
const fixtures: Array<{ db: SqliteD1; pending: Promise<unknown>[] }> = [];

async function setup() {
  const db = new SqliteD1();
  const send = vi.fn<(message: unknown) => Promise<{ messageId: string }>>(
    async () => ({
      messageId: "financing-test-message",
    }),
  );
  const pending: Promise<unknown>[] = [];
  fixtures.push({ db, pending });
  const env: Env = {
    DB: db,
    APP_ORIGIN: origin,
    DEV_ADMIN_EMAIL: "admin@example.com",
    ADMIN_EMAILS: "admin@example.com",
    EMAIL_FROM: "leads@example.com",
    EMAIL_TO: "sophie@youxuancars.com",
    EMAIL: { send },
  };
  const create = await handleRequest(
    new Request(`${origin}/api/admin/vehicles`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: "2022 Toyota RAV4 XLE",
        status: "available",
        year: 2022,
        make: "Toyota",
        model: "RAV4",
        priceCents: 2_699_000,
      }),
    }),
    env,
  );
  expect(create.status).toBe(201);
  const { id: vehicleId } = (await create.json()) as { id: string };
  const data = {
    name: "Financing Test Buyer",
    email: "buyer@example.invalid",
    preferredContact: "email",
    leadType: "financing",
    vehicleId,
    financing: selection,
    turnstileToken: "verified-test-token",
  };
  const verifier = vi.fn(async () => ({ success: true }));
  const post = (
    overrides: Record<string, unknown> = {},
    key = crypto.randomUUID(),
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
      env,
      { waitUntil: (task: Promise<unknown>) => pending.push(task) },
      { turnstileImpl: verifier },
    );
  const saveSettings = (settings: unknown, useEnv = env) =>
    handleRequest(
      new Request(`${origin}/api/admin/settings`, {
        method: "PUT",
        headers,
        body: JSON.stringify(settings),
      }),
      useEnv,
    );
  return { db, env, send, pending, vehicleId, post, verifier, saveSettings };
}

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await Promise.all(fixture.pending);
    fixture.db.sqlite.close();
  }
});

describe("Financing API and notification contract", () => {
  it("publishes the migrated illustrative rates and persists each tier/term independently", async () => {
    const { env, saveSettings } = await setup();
    const settings = await getSettings(env.DB);
    expect(settings.financing).toEqual({
      version: 1,
      illustrative: true,
      rates: {
        excellent: { 36: 5.99, 48: 5.99, 60: 5.99, 72: 5.99 },
        very_good: { 36: 6.99, 48: 6.99, 60: 6.99, 72: 6.99 },
        good: { 36: 7.99, 48: 7.99, 60: 7.99, 72: 7.99 },
      },
    });
    const financing: FinancingConfig = {
      version: 1,
      illustrative: false,
      rates: {
        excellent: { 36: 0, 48: 4.25, 60: 5.5, 72: 6.75 },
        very_good: { 36: 6.25, 48: 7.5, 60: 8.75, 72: 9 },
        good: { 36: 10, 48: 11.25, 60: 12.5, 72: null },
      },
    };
    expect((await saveSettings({ ...settings, financing })).status).toBe(200);
    const home = await handleRequest(
      new Request(`${origin}/api/public/home`),
      env,
    );
    expect(
      ((await home.json()) as { settings: { financing: unknown } }).settings
        .financing,
    ).toEqual(financing);
    const audit = await env.DB.prepare(
      "SELECT details_json FROM audit_logs WHERE action='settings_updated'",
    ).first<{ details_json: string }>();
    expect(JSON.parse(audit!.details_json)).toEqual({
      financing: { before: settings.financing, after: financing },
    });
  });

  it("preserves rates when a legacy settings client omits financing, including explicit disabled state", async () => {
    const { env, saveSettings } = await setup();
    const settings = await getSettings(env.DB);
    const { financing, ...legacy } = settings;
    expect(
      (await saveSettings({ ...legacy, shortName: "Updated name" })).status,
    ).toBe(200);
    expect((await getSettings(env.DB)).financing).toEqual(financing);
    expect((await saveSettings({ ...settings, financing: null })).status).toBe(
      200,
    );
    expect((await saveSettings(legacy)).status).toBe(200);
    expect((await getSettings(env.DB)).financing).toBeNull();
  });

  it("rejects an unauthenticated settings write and invalid rates without modifying stored configuration", async () => {
    const { env, saveSettings } = await setup();
    const settings = await getSettings(env.DB);
    expect(
      (await saveSettings(settings, { ...env, DEV_ADMIN_EMAIL: undefined }))
        .status,
    ).toBe(401);
    for (const badApr of [-0.01, 100.01, "5.99"]) {
      const financing = structuredClone(settings.financing!);
      Object.assign(financing.rates.excellent, { 72: badApr });
      expect((await saveSettings({ ...settings, financing })).status).toBe(400);
    }
    expect(await getSettings(env.DB)).toEqual(settings);
    expect(
      await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM audit_logs WHERE action='settings_updated'",
      ).first(),
    ).toEqual({ count: 0 });
  });

  it.each([null, "not-json", '{"version":1,"rates":{}}'])(
    "treats missing or corrupt configuration (%s) as unavailable, never a zero-rate estimate",
    async (stored) => {
      const { env, post, send, pending } = await setup();
      await env.DB.prepare(
        "UPDATE site_settings SET financing_config_json=? WHERE id=1",
      )
        .bind(stored)
        .run();
      expect((await getSettings(env.DB)).financing).toBeNull();
      const response = await post();
      expect(response.status).toBe(200);
      const { leadId } = (await response.json()) as { leadId: string };
      expect((await getLead(env.DB, leadId))?.details.financing).toMatchObject({
        status: "rates_unavailable",
        principalCents: 2_199_000,
        aprPercent: null,
        monthlyPaymentCents: null,
        totalInterestCents: null,
      });
      await Promise.all(pending);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toMatchObject({
        text: expect.stringContaining("Rates are unavailable"),
      });
    },
  );

  it("uses the current server price and rate, and retains the original snapshot on an idempotent retry", async () => {
    const { env, post, pending, send, verifier, vehicleId, saveSettings } =
      await setup();
    const settings = await getSettings(env.DB);
    settings.financing!.rates.excellent[72] = 8.25;
    expect((await saveSettings(settings)).status).toBe(200);
    const key = crypto.randomUUID();
    const response = await post({}, key);
    expect(response.status).toBe(200);
    const saved = (await response.json()) as { leadId: string };
    const first = (await getLead(env.DB, saved.leadId))!.details.financing!;
    expect(first).toMatchObject({
      version: 1,
      ...selection,
      status: "estimated",
      priceCents: 2_699_000,
      principalCents: 2_199_000,
      aprPercent: 8.25,
      monthlyPaymentCents: 38825,
      totalInterestCents: 596370,
      illustrative: true,
      calculatedAt: expect.any(String),
    });
    await Promise.all(pending);
    await env.DB.prepare("UPDATE vehicles SET price_cents=2799000 WHERE id=?")
      .bind(vehicleId)
      .run();
    settings.financing!.rates.excellent[72] = 9.5;
    await saveSettings(settings);
    expect(
      await (await post({ turnstileToken: "fresh-test-token" }, key)).json(),
    ).toEqual(saved);
    expect((await getLead(env.DB, saved.leadId))?.details.financing).toEqual(
      first,
    );
    expect(
      (await post({ financing: { ...selection, termMonths: 60 } }, key)).status,
    ).toBe(409);
    expect(verifier).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM leads").first(),
    ).toEqual({ count: 1 });
  });

  it.each([
    ["unknown credit tier", { creditTier: "approved" }],
    ["unsupported term", { termMonths: 84 }],
    ["string term", { termMonths: "72" }],
    ["negative down payment", { downPaymentCents: -1 }],
    ["fractional cents", { downPaymentCents: 0.5 }],
    ["down payment above price", { downPaymentCents: 2_699_001 }],
    ["forged APR", { aprPercent: 0 }],
    ["forged payment", { monthlyPaymentCents: 1 }],
    ["forged vehicle price", { priceCents: 1 }],
    ["unsupported trade-in", { tradeInCents: 1_000_000 }],
  ])(
    "rejects %s before creating a lead or email job",
    async (_label, fields) => {
      const { env, post, send } = await setup();
      expect(
        (await post({ financing: { ...selection, ...fields } })).status,
      ).toBe(400);
      expect(
        await env.DB.prepare("SELECT COUNT(*) AS count FROM leads").first(),
      ).toEqual({ count: 0 });
      expect(
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM lead_email_jobs",
        ).first(),
      ).toEqual({ count: 0 });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("requires a financing vehicle and selection, and rejects unavailable or unpriced vehicles", async () => {
    const { env, post, vehicleId, send } = await setup();
    for (const invalid of [
      { financing: undefined },
      { vehicleId: null },
      { leadType: "contact" },
    ])
      expect((await post(invalid)).status).toBe(400);
    await env.DB.prepare("UPDATE vehicles SET price_cents=NULL WHERE id=?")
      .bind(vehicleId)
      .run();
    expect((await post()).status).toBe(400);
    await env.DB.prepare(
      "UPDATE vehicles SET status='sold',price_cents=2699000 WHERE id=?",
    )
      .bind(vehicleId)
      .run();
    expect((await post()).status).toBe(409);
    expect(send).not.toHaveBeenCalled();
  });

  it("records low-credit consultation without an APR/payment and emails once only after explicit submission", async () => {
    const { env, post, pending, send } = await setup();
    expect(send).not.toHaveBeenCalled();
    const key = crypto.randomUUID();
    const inquiry = { financing: { ...selection, creditTier: "consultation" } };
    const response = await post(inquiry, key);
    expect(response.status).toBe(200);
    const { leadId } = (await response.json()) as { leadId: string };
    expect((await getLead(env.DB, leadId))?.details.financing).toMatchObject({
      creditTier: "consultation",
      status: "manual_review",
      principalCents: 2_199_000,
      aprPercent: null,
      monthlyPaymentCents: null,
      totalInterestCents: null,
    });
    expect((await post(inquiry, key)).status).toBe(200);
    await Promise.all(pending);
    expect(send).toHaveBeenCalledTimes(1);
    const email = send.mock.calls[0][0] as {
      text: string;
      html: string;
      subject: string;
    };
    expect(email.subject).toContain("financing inquiry");
    for (const content of [email.text, email.html]) {
      expect(content).toContain("619 or below");
      expect(content).toContain(
        "Personalized financing consultation requested",
      );
      expect(content).not.toMatch(
        /Estimated monthly payment|Estimated total interest|APR:/,
      );
      expect(content).not.toMatch(/declined|rejected|denied/i);
    }
  });
});
