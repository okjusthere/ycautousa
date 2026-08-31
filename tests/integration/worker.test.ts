import { describe, expect, it, beforeEach } from "vitest";
import { handleRequest } from "../../workers/app";
import type { Env } from "../../workers/env";
import { SqliteD1 } from "../helpers/sqlite-d1";

function setup() {
  const db = new SqliteD1();
  const env: Env = {
    DB: db,
    APP_ORIGIN: "http://localhost:5173",
    CANONICAL_HOST: "www.ycautousa.com",
    ADMIN_EMAILS: "admin@example.com",
    DEV_ADMIN_EMAIL: "admin@example.com",
    TURNSTILE_SECRET_KEY: "test-secret",
    IP_HASH_SALT: "test-salt",
    EMAIL_FROM: "leads@example.com",
    EMAIL_TO: "sophie@youxuancars.com",
  };
  return { db, env };
}

const adminHeaders = {
  "CF-Access-Authenticated-User-Email": "admin@example.com",
  Origin: "http://localhost:5173",
  "Content-Type": "application/json",
};

describe("Worker API integration", () => {
  let env: Env;
  beforeEach(() => {
    ({ env } = setup());
  });

  it("creates inventory through the protected API and exposes it publicly", async () => {
    const create = await handleRequest(
      new Request("http://localhost:5173/api/admin/vehicles", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          title: "2022 Toyota RAV4 XLE",
          status: "available",
          featured: true,
          year: 2022,
          make: "Toyota",
          model: "RAV4",
          priceCents: 2699000,
          mileage: 28000,
          features: ["Backup camera"],
        }),
      }),
      env,
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { id: string };
    const inventory = await handleRequest(
      new Request("http://localhost:5173/api/inventory"),
      env,
    );
    expect(inventory.status).toBe(200);
    expect(
      ((await inventory.json()) as { vehicles: Array<{ id: string }> })
        .vehicles[0].id,
    ).toBe(created.id);
    const denied = await handleRequest(
      new Request("http://localhost:5173/api/admin/dashboard"),
      { ...env, DEV_ADMIN_EMAIL: undefined },
    );
    expect(denied.status).toBe(401);
  });

  it("keeps sold pages public and persists leads before email failures", async () => {
    const create = await handleRequest(
      new Request("http://localhost:5173/api/admin/vehicles", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          title: "2020 Honda Civic",
          status: "available",
          featured: false,
          year: 2020,
          make: "Honda",
          model: "Civic",
          priceCents: 1899000,
          mileage: 45000,
          features: [],
        }),
      }),
      env,
    );
    const id = ((await create.json()) as { id: string }).id;
    const adminVehicle = await handleRequest(
      new Request(`http://localhost:5173/api/admin/vehicles/${id}`),
      env,
    );
    const slug = ((await adminVehicle.json()) as { vehicle: { slug: string } })
      .vehicle.slug;
    const lead = await handleRequest(
      new Request("http://localhost:5173/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Alex Buyer",
          email: "alex@example.com",
          phone: "718-555-0101",
          vehicleId: id,
          leadType: "contact",
          preferredContact: "email",
          message: "Hello",
          turnstileToken: "test-token",
        }),
      }),
      env,
      undefined,
      { turnstileImpl: async () => ({ success: true }) },
    );
    expect(lead.status).toBe(200);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM leads",
    ).first<{ count: number }>();
    expect(Number(count?.count ?? 0)).toBe(1);
    await handleRequest(
      new Request(`http://localhost:5173/api/admin/vehicles/${id}/status`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ status: "sold" }),
      }),
      env,
    );
    const publicVehicle = await handleRequest(
      new Request(`http://localhost:5173/api/vehicles/${slug}`),
      env,
    );
    expect(publicVehicle.status).toBe(200);
  });

  it("uses injected NHTSA response and caches the normalized result", async () => {
    const response = await handleRequest(
      new Request("http://localhost:5173/api/admin/vin/decode", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ vin: "1HGCM82633A004352" }),
      }),
      env,
      undefined,
      {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              Results: [{ ModelYear: "2022", Make: "Honda", Model: "Civic" }],
            }),
            { status: 200 },
          ),
      },
    );
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { decoded: { make: string } }).decoded.make,
    ).toBe("Honda");
    const second = await handleRequest(
      new Request("http://localhost:5173/api/admin/vin/decode", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ vin: "1HGCM82633A004352" }),
      }),
      env,
      undefined,
      {
        fetchImpl: async () => new Response("should not call", { status: 500 }),
      },
    );
    expect(((await second.json()) as { fromCache: boolean }).fromCache).toBe(
      true,
    );
  });

  it("protects the admin document and rejects cross-origin mutations", async () => {
    const denied = await handleRequest(
      new Request("http://localhost:5173/admin"),
      { ...env, DEV_ADMIN_EMAIL: undefined },
    );
    expect(denied.status).toBe(401);
    const rejected = await handleRequest(
      new Request("http://localhost:5173/api/admin/vehicles", {
        method: "POST",
        headers: { ...adminHeaders, Origin: "https://attacker.example" },
        body: JSON.stringify({
          title: "Injected",
          status: "draft",
          featured: false,
          features: [],
        }),
      }),
      env,
    );
    expect(rejected.status).toBe(403);
  });

  it("keeps a lead when optional email delivery fails", async () => {
    const failingEnv: Env = {
      ...env,
      EMAIL: {
        send: async () => {
          throw new Error("mail offline");
        },
      },
    };
    const response = await handleRequest(
      new Request("http://localhost:5173/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Jamie Driver",
          email: "jamie@example.com",
          leadType: "contact",
          preferredContact: "email",
          message: "Please call me",
          turnstileToken: "local-form-token",
        }),
      }),
      failingEnv,
      undefined,
      { turnstileImpl: async () => ({ success: true }) },
    );
    expect(response.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT email_status AS emailStatus FROM leads ORDER BY created_at DESC LIMIT 1",
    ).first<{ emailStatus: string }>();
    expect(row?.emailStatus).toBe("failed");
  });

  it("accepts Cloudflare's dummy hostname only with the official test site key", async () => {
    const previewEnv: Env = {
      ...env,
      APP_ORIGIN: "https://yc-auto-web.example.workers.dev",
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    };
    const response = await handleRequest(
      new Request("https://yc-auto-web.example.workers.dev/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Preview Buyer",
          email: "preview@example.com",
          leadType: "contact",
          preferredContact: "email",
          turnstileToken: "dummy-token",
        }),
      }),
      previewEnv,
      undefined,
      {
        turnstileImpl: async () => ({
          success: true,
          hostname: "dummy_key",
        }),
      },
    );
    expect(response.status).toBe(200);
  });

  it("keeps sold records in the sitemap but excludes drafts", async () => {
    const create = async (title: string, status: string) => {
      const response = await handleRequest(
        new Request("http://localhost:5173/api/admin/vehicles", {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify({
            title,
            status,
            featured: false,
            priceCents: 100000,
            mileage: 1000,
            features: [],
          }),
        }),
        env,
      );
      return ((await response.json()) as { id: string }).id;
    };
    const soldId = await create("Sold Sitemap Vehicle", "available");
    await handleRequest(
      new Request(`http://localhost:5173/api/admin/vehicles/${soldId}/status`, {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({ status: "sold" }),
      }),
      env,
    );
    const draftId = await create("Draft Private Vehicle", "draft");
    const sold = await env.DB.prepare("SELECT slug FROM vehicles WHERE id=?")
      .bind(soldId)
      .first<{ slug: string }>();
    const draft = await env.DB.prepare("SELECT slug FROM vehicles WHERE id=?")
      .bind(draftId)
      .first<{ slug: string }>();
    const sitemap = await handleRequest(
      new Request("http://localhost:5173/sitemap.xml"),
      env,
    );
    const xml = await sitemap.text();
    expect(xml).toContain(`/inventory/${sold?.slug}`);
    expect(xml).not.toContain(`/inventory/${draft?.slug}`);
  });
});
