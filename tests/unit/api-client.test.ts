import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseLocalDemo,
  getHome,
  getInventory,
  getPublicConfig,
  getVehicle,
  mutate,
  saveVehicle,
} from "../../src/api";
import {
  ApiError,
  isNotFoundError,
  REQUEST_TIMEOUT_MS,
  requestJson,
} from "../../src/http";
import { demoSettings, demoVehicles } from "../../src/demo";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function respond(body: unknown, status = 200) {
  return vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(body, { status })),
  );
}

describe("API client contracts and recovery", () => {
  it("returns valid inventory and settings without modifying data", async () => {
    const home = { settings: demoSettings, featured: demoVehicles, makes: [] };
    respond(home);
    await expect(getHome()).resolves.toEqual(home);
    const inventory = {
      vehicles: demoVehicles,
      total: demoVehicles.length,
      page: 1,
      perPage: 12,
    };
    respond(inventory);
    await expect(getInventory()).resolves.toEqual(inventory);
  });

  it.each([
    [
      "HTML with HTTP 200",
      () =>
        new Response('<html><div id="root"></div></html>', {
          headers: { "Content-Type": "text/html" },
        }),
    ],
    [
      "malformed JSON",
      () =>
        new Response('{"settings":', {
          headers: { "Content-Type": "application/json" },
        }),
    ],
    ["missing settings", () => Response.json({})],
    [
      "invalid nested vehicle",
      () =>
        Response.json({
          settings: demoSettings,
          featured: [{ ...demoVehicles[0], features: null }],
          makes: [],
        }),
    ],
  ])(
    "rejects %s instead of rendering undefined data",
    async (_name, response) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => response()),
      );
      await expect(getHome()).rejects.toMatchObject({
        code: "invalid_response",
      });
    },
  );

  it("does not hide localhost failures behind demo data by default", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("network secret")),
    );
    expect(canUseLocalDemo()).toBe(false);
    await expect(getHome()).rejects.toMatchObject({ code: "network" });
    await expect(saveVehicle({ title: "Unsaved car" })).rejects.toMatchObject({
      code: "network",
    });
  });

  it("distinguishes a missing vehicle from a temporary server error", async () => {
    respond({ error: "Vehicle not found" }, 404);
    const missing = await getVehicle("missing").catch(
      (error: unknown) => error,
    );
    expect(isNotFoundError(missing)).toBe(true);
    respond({ error: "database-password=private" }, 503);
    const failed = await getVehicle("existing").catch(
      (error: unknown) => error,
    );
    expect(isNotFoundError(failed)).toBe(false);
    expect(failed).toMatchObject({ code: "server_error", status: 503 });
    expect(String(failed)).not.toContain("database-password");
  });

  it("keeps safe form feedback but never echoes arbitrary server details", async () => {
    respond({ error: "That VIN is already in inventory." }, 409);
    await expect(saveVehicle({})).rejects.toThrow(
      "That VIN is already in inventory.",
    );
    respond({ error: "token=super-secret" }, 400);
    await expect(mutate("/api/leads", "POST", {})).rejects.toThrow(
      "Please check the form fields and try again.",
    );
  });

  it("times out a request once without automatically resending it", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_path: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const failure = expect(
      mutate("/api/leads", "POST", { name: "Buyer" }),
    ).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    await failure;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("honors caller cancellation without sending a request", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      getPublicConfig({ signal: controller.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a usable Turnstile site key", async () => {
    respond({ turnstileSiteKey: " " });
    await expect(getPublicConfig()).rejects.toBeInstanceOf(ApiError);
    respond({ turnstileSiteKey: "public-site-key" });
    await expect(getPublicConfig()).resolves.toEqual({
      turnstileSiteKey: "public-site-key",
    });
  });

  it("requires a lead in notification retry responses and preserves delivery status", async () => {
    respond({});
    await expect(
      mutate("/api/admin/leads/test/email/retry", "POST", {}),
    ).rejects.toMatchObject({ code: "invalid_response" });
    const lead = {
      id: "test",
      name: "Buyer",
      leadType: "contact",
      createdAt: new Date().toISOString(),
      status: "new",
      phone: null,
      email: "buyer@example.com",
      preferredContact: "email",
      message: null,
      adminNotes: null,
      details: {},
      vehicle: null,
      emailStatus: "pending",
      notification: {
        status: "pending",
        recipient: "store@example.com",
        attempts: 0,
        nextAttemptAt: null,
        lastErrorCode: null,
        messageId: null,
        updatedAt: new Date().toISOString(),
      },
    };
    respond({ ok: true, lead }, 202);
    await expect(
      mutate("/api/admin/leads/test/email/retry", "POST", {}),
    ).resolves.toEqual({ ok: true, lead });
    respond({
      leads: [
        { ...lead, notification: { ...lead.notification, attempts: "two" } },
      ],
    });
    await expect(mutate("/api/admin/leads", "GET")).rejects.toMatchObject({
      code: "invalid_response",
    });
    respond({ settings: demoSettings, notificationRecipient: 42 });
    await expect(mutate("/api/admin/settings", "GET")).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("preserves mutation headers and lets the browser set multipart boundaries", async () => {
    const fetchMock = vi.fn(async (_path: unknown, _init?: RequestInit) =>
      Response.json({ ok: true }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await mutate(
      "/api/leads",
      "POST",
      { name: "Buyer" },
      { headers: { "Idempotency-Key": "stable-request-id" } },
    );
    const mutationInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(mutationInit.headers).get("Idempotency-Key")).toBe(
      "stable-request-id",
    );
    expect(new Headers(mutationInit.headers).get("Content-Type")).toBe(
      "application/json",
    );
    await requestJson("/api/admin/vehicles/test/images", {
      method: "POST",
      body: new FormData(),
      timeoutMs: 60_000,
    });
    const uploadInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(uploadInit.headers).has("Content-Type")).toBe(false);
  });
});
