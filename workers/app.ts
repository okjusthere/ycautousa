import type { D1Like } from "../lib/db";
import {
  addAudit,
  dashboardStats,
  ensureImageCover,
  getImageById,
  getLead,
  getSettings,
  getVehicleById,
  getVehicleBySlug,
  insertLead,
  listAdminVehicles,
  listAudit,
  listFeaturedVehicles,
  listImages,
  listLeads,
  listMakes,
  listPublicVehicles,
  listSitemapVehicles,
  recentLeads,
  recentVehicles,
  resolveRedirect,
  softDeleteImage,
  softDeleteVehicle,
  trackEvent,
  updateLead,
  updateLeadEmailStatus,
  updateSettings,
  updateVehicleStatus,
  upsertImage,
  upsertVehicle,
  normalizeImagePositions,
  getVinCache,
  touchVinCache,
  putVinCache,
} from "../lib/db";
import { decodeVin, normalizeVin } from "../lib/vin";
import {
  leadInputSchema,
  leadUpdateSchema,
  settingsSchema,
  vehicleInputSchema,
} from "../lib/validation";
import {
  escapeHtml,
  formatMileage,
  formatPrice,
  nowIso,
  stableHash,
  vehicleSlug,
} from "../lib/utils";
import type { VehicleStatus, LeadStatus, SiteSettings } from "../lib/types";
import type { Env, ExecutionContextLike } from "./env";
import {
  bodyWithinLimit,
  hashIp,
  isAdminRequest,
  sameOrigin,
  securityHeaders,
  rateLimitKey,
} from "./security";
import { sendLeadNotification } from "./email";
import { serveMedia, uploadVehicleImage } from "./media";
import { verifyTurnstile } from "./turnstile";
import { assertVehicleTransition } from "../lib/status";

type RequestOptions = {
  fetchImpl?: typeof fetch;
  turnstileImpl?: typeof verifyTurnstile;
};

const leadRate = new Map<string, { count: number; resetAt: number }>();
const allowedTrackEvents = new Set([
  "phone_click",
  "sms_click",
  "email_click",
  "availability_open",
  "lead_submitted",
]);

function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

function text(
  body: string,
  status = 200,
  contentType = "text/plain; charset=utf-8",
): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": contentType },
  });
}

function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function withSecurity(response: Response, env: Env): Response {
  return securityHeaders(response, env);
}

function parseJsonBody(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

function cleanNullable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = String(value).trim();
  return result || null;
}

async function adminGuard(
  request: Request,
  env: Env,
  fetchImpl: typeof fetch = fetch,
): Promise<{ email: string } | Response> {
  const result = await isAdminRequest(request, env, fetchImpl);
  return result.ok
    ? { email: result.email }
    : errorResponse(result.message, result.status);
}

function ensureMutation(request: Request, env: Env): Response | null {
  if (!sameOrigin(request, env))
    return errorResponse("Cross-origin mutation rejected", 403);
  return null;
}

function parseVehiclePayload(
  input: unknown,
): ReturnType<typeof vehicleInputSchema.parse> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const normalized = {
    ...raw,
    year: raw.year === "" || raw.year === undefined ? null : raw.year,
    priceCents:
      raw.priceCents === "" || raw.priceCents === undefined
        ? null
        : raw.priceCents,
    mileage:
      raw.mileage === "" || raw.mileage === undefined ? null : raw.mileage,
    vin: raw.vin === "" || raw.vin === undefined ? null : raw.vin,
    features: Array.isArray(raw.features)
      ? raw.features
      : typeof raw.features === "string"
        ? String(raw.features)
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
  };
  return vehicleInputSchema.parse(normalized);
}

function serializeSettings(settings: SiteSettings): SiteSettings {
  return settings;
}

async function uniqueVehicleSlug(
  db: D1Like,
  base: string,
  excludeId?: string,
): Promise<string> {
  const existing = await db
    .prepare(
      "SELECT id FROM vehicles WHERE slug = ? AND deleted_at IS NULL LIMIT 1",
    )
    .bind(base)
    .first<{ id: string }>();
  if (!existing || existing.id === excludeId) return base;
  return `${base}-${stableHash(`${base}:${excludeId ?? nowIso()}`).slice(0, 6)}`;
}

async function publicApi(
  request: Request,
  env: Env,
  path: string,
  options: RequestOptions = {},
): Promise<Response | null> {
  if (path === "/api/public/home" && request.method === "GET") {
    const [settings, featured, makes] = await Promise.all([
      getSettings(env.DB),
      listFeaturedVehicles(env.DB),
      listMakes(env.DB),
    ]);
    return json({ settings: serializeSettings(settings), featured, makes });
  }
  if (path === "/api/public/config" && request.method === "GET") {
    return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? "" });
  }
  if (path === "/api/inventory" && request.method === "GET") {
    const url = new URL(request.url);
    const numberParam = (key: string): number | undefined => {
      const value = Number(url.searchParams.get(key));
      return Number.isFinite(value) &&
        url.searchParams.get(key) !== null &&
        value >= 0
        ? value
        : undefined;
    };
    const sort = url.searchParams.get("sort") as
      | "newest"
      | "price_asc"
      | "price_desc"
      | "mileage_asc"
      | "year_desc"
      | null;
    const result = await listPublicVehicles(env.DB, {
      make: cleanNullable(url.searchParams.get("make")) ?? undefined,
      model: cleanNullable(url.searchParams.get("model")) ?? undefined,
      minYear: numberParam("minYear"),
      maxYear: numberParam("maxYear"),
      minPrice: numberParam("minPrice"),
      maxPrice: numberParam("maxPrice"),
      maxMileage: numberParam("maxMileage"),
      bodyType: cleanNullable(url.searchParams.get("bodyType")) ?? undefined,
      drivetrain:
        cleanNullable(url.searchParams.get("drivetrain")) ?? undefined,
      sort: sort ?? "newest",
      page: numberParam("page"),
      perPage: numberParam("perPage"),
    });
    return json(result);
  }
  const vehicleMatch = path.match(/^\/api\/vehicles\/([^/]+)$/);
  if (vehicleMatch && request.method === "GET") {
    const vehicle = await getVehicleBySlug(
      env.DB,
      decodeURIComponent(vehicleMatch[1]),
      false,
    );
    return vehicle
      ? json({ vehicle })
      : errorResponse("Vehicle not found", 404);
  }
  if (path === "/api/leads" && request.method === "POST")
    return submitLead(request, env, options);
  if (path === "/api/track" && request.method === "POST") {
    if (!bodyWithinLimit(request, 4000))
      return errorResponse("Request is too large", 413);
    const body = await parseJsonBody(request);
    if (!body || typeof body !== "object")
      return errorResponse("Invalid event payload");
    const eventName = String((body as Record<string, unknown>).eventName ?? "");
    const vehicleId = cleanNullable(
      (body as Record<string, unknown>).vehicleId,
    );
    if (!allowedTrackEvents.has(eventName))
      return errorResponse("Unsupported event");
    await trackEvent(env.DB, eventName, vehicleId);
    return json({ ok: true });
  }
  return null;
}

async function submitLead(
  request: Request,
  env: Env,
  options: RequestOptions = {},
): Promise<Response> {
  if (!bodyWithinLimit(request, 16 * 1024))
    return errorResponse("Request is too large", 413);
  const key = rateLimitKey(request);
  const current = leadRate.get(key);
  const now = Date.now();
  if (current && current.resetAt > now && current.count >= 8)
    return errorResponse("Too many requests. Please try again later.", 429);
  leadRate.set(
    key,
    current && current.resetAt > now
      ? { count: current.count + 1, resetAt: current.resetAt }
      : { count: 1, resetAt: now + 10 * 60_000 },
  );
  if (leadRate.size > 1000)
    for (const [keyName, entry] of leadRate)
      if (entry.resetAt <= now) leadRate.delete(keyName);
  const body = await parseJsonBody(request);
  const parsed = leadInputSchema.safeParse(body);
  if (!parsed.success)
    return errorResponse("Please check the form fields and try again.", 400);
  if (parsed.data.honeypot) return json({ ok: true });
  const verifier = options.turnstileImpl ?? verifyTurnstile;
  const tokenResult =
    !env.TURNSTILE_SECRET_KEY &&
    env.ENVIRONMENT !== "production" &&
    /localhost|127\.0\.0\.1/i.test(new URL(request.url).hostname) &&
    parsed.data.turnstileToken === "local-form-token"
      ? { success: true }
      : await verifier(
          parsed.data.turnstileToken,
          env.TURNSTILE_SECRET_KEY,
          request.headers.get("CF-Connecting-IP"),
          options.fetchImpl ?? fetch,
        );
  const origin = env.APP_ORIGIN ? new URL(env.APP_ORIGIN).hostname : null;
  const usesTurnstileTestKey =
    env.TURNSTILE_SITE_KEY === "1x00000000000000000000AA";
  if (!tokenResult.success)
    return errorResponse(
      "Please complete the verification and try again.",
      400,
    );
  if (tokenResult.action && tokenResult.action !== "lead")
    return errorResponse("Verification failed. Please try again.", 400);
  if (
    tokenResult.hostname &&
    origin &&
    !usesTurnstileTestKey &&
    tokenResult.hostname !== origin &&
    !tokenResult.hostname.endsWith(`.${origin}`)
  )
    return errorResponse("Verification failed. Please try again.", 400);
  let vehicle = null;
  if (parsed.data.vehicleId) {
    vehicle = await getVehicleById(env.DB, parsed.data.vehicleId, false);
    if (!vehicle || vehicle.status === "sold")
      return errorResponse("That vehicle is no longer available.", 409);
  }
  const leadId = await insertLead(env.DB, {
    vehicleId: vehicle?.id ?? null,
    leadType: parsed.data.leadType,
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    preferredContact: parsed.data.preferredContact,
    message: parsed.data.message ?? null,
    sourceUrl: parsed.data.sourceUrl ?? request.url,
    referrer: parsed.data.referrer ?? request.headers.get("Referer"),
    utm: parsed.data.utm,
    country: request.headers.get("CF-IPCountry"),
    ipHash: await hashIp(
      request.headers.get("CF-Connecting-IP"),
      env.IP_HASH_SALT,
    ),
  });
  const settings = await getSettings(env.DB);
  const saved = await getLead(env.DB, leadId);
  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  if (saved) emailStatus = await sendLeadNotification(env, settings, saved);
  await updateLeadEmailStatus(env.DB, leadId, emailStatus);
  await trackEvent(env.DB, "lead_submitted", vehicle?.id ?? null);
  return json({ ok: true, leadId });
}

async function adminApi(
  request: Request,
  env: Env,
  path: string,
  ctx: ExecutionContextLike,
  options: RequestOptions = {},
): Promise<Response | null> {
  if (!path.startsWith("/api/admin/")) return null;
  const guard = await adminGuard(request, env, options.fetchImpl);
  if (guard instanceof Response) return guard;
  const email = guard.email;
  const mutation = request.method !== "GET" && request.method !== "HEAD";
  if (mutation) {
    const rejected = ensureMutation(request, env);
    if (rejected) return rejected;
    if (!bodyWithinLimit(request, 64 * 1024))
      return errorResponse("Request is too large", 413);
  }

  if (path === "/api/admin/dashboard" && request.method === "GET") {
    const [stats, vehicles, leads] = await Promise.all([
      dashboardStats(env.DB),
      recentVehicles(env.DB),
      recentLeads(env.DB),
    ]);
    return json({ stats, vehicles, leads });
  }
  if (path === "/api/admin/vehicles" && request.method === "GET") {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const result = await listAdminVehicles(env.DB, {
      search: cleanNullable(url.searchParams.get("search")) ?? undefined,
      status:
        (cleanNullable(
          url.searchParams.get("status"),
        ) as VehicleStatus | null) ?? undefined,
      make: cleanNullable(url.searchParams.get("make")) ?? undefined,
      page: Number.isFinite(page) ? page : 1,
      perPage: Number(url.searchParams.get("perPage")) === 50 ? 50 : 25,
    });
    return json(result);
  }
  if (path === "/api/admin/vehicles" && request.method === "POST") {
    if (!bodyWithinLimit(request, 32 * 1024))
      return errorResponse("Request is too large", 413);
    try {
      const parsed = parseVehiclePayload(await parseJsonBody(request));
      const vin = parsed.vin || null;
      if (vin) {
        const duplicate = await env.DB.prepare(
          "SELECT id FROM vehicles WHERE vin = ? AND deleted_at IS NULL",
        )
          .bind(vin)
          .first<{ id: string }>();
        if (duplicate)
          return errorResponse("That VIN is already in inventory.", 409);
      }
      const slug = await uniqueVehicleSlug(
        env.DB,
        vehicleSlug(parsed.title, vin, null),
      );
      const id = await upsertVehicle(env.DB, {
        ...parsed,
        slug,
        vin,
        id: undefined,
      });
      await addAudit(env.DB, email, "vehicle_created", "vehicle", id, {
        status: parsed.status,
      });
      return json({ ok: true, id }, 201);
    } catch (error) {
      return error instanceof Error && error.name === "ZodError"
        ? errorResponse("Please check the vehicle fields.")
        : errorResponse("Unable to save vehicle.", 500);
    }
  }
  const vehicleMatch = path.match(
    /^\/api\/admin\/vehicles\/([^/]+)(?:\/(.+))?$/,
  );
  if (vehicleMatch) {
    const id = decodeURIComponent(vehicleMatch[1]);
    const action = vehicleMatch[2];
    if (!action && request.method === "GET") {
      const vehicle = await getVehicleById(env.DB, id, true);
      return vehicle
        ? json({ vehicle })
        : errorResponse("Vehicle not found", 404);
    }
    if (!action && (request.method === "PUT" || request.method === "PATCH")) {
      try {
        const existing = await getVehicleById(env.DB, id, true);
        if (!existing) return errorResponse("Vehicle not found", 404);
        const parsed = parseVehiclePayload(await parseJsonBody(request));
        if (parsed.vin) {
          const duplicate = await env.DB.prepare(
            "SELECT id FROM vehicles WHERE vin = ? AND id <> ? AND deleted_at IS NULL",
          )
            .bind(parsed.vin, id)
            .first<{ id: string }>();
          if (duplicate)
            return errorResponse("That VIN is already in inventory.", 409);
        }
        const slug = await uniqueVehicleSlug(
          env.DB,
          vehicleSlug(parsed.title, parsed.vin || null, existing.legacyUrl),
          id,
        );
        await upsertVehicle(env.DB, {
          ...parsed,
          id,
          slug,
          legacyUrl: existing.legacyUrl,
        });
        await addAudit(env.DB, email, "vehicle_updated", "vehicle", id, {
          status: parsed.status,
        });
        return json({
          ok: true,
          vehicle: await getVehicleById(env.DB, id, true),
        });
      } catch (error) {
        return error instanceof Error && error.name === "ZodError"
          ? errorResponse("Please check the vehicle fields.")
          : errorResponse("Unable to update vehicle.", 500);
      }
    }
    if (action === "status" && request.method === "POST") {
      const body = await parseJsonBody(request);
      const status = (
        body && typeof body === "object"
          ? (body as Record<string, unknown>).status
          : null
      ) as VehicleStatus | null;
      if (
        !status ||
        !["available", "pending", "sold", "draft", "hidden"].includes(status)
      )
        return errorResponse("Invalid status");
      const current = await getVehicleById(env.DB, id, true);
      if (!current) return errorResponse("Vehicle not found", 404);
      try {
        assertVehicleTransition(current.status, status);
      } catch {
        return errorResponse("That status change is not allowed.", 409);
      }
      await updateVehicleStatus(env.DB, id, status);
      await addAudit(env.DB, email, `vehicle_marked_${status}`, "vehicle", id);
      return json({ ok: true });
    }
    if (action === "duplicate" && request.method === "POST") {
      const source = await getVehicleById(env.DB, id, true);
      if (!source) return errorResponse("Vehicle not found", 404);
      const duplicateId = await upsertVehicle(env.DB, {
        ...source,
        id: undefined,
        slug: vehicleSlug(
          `${source.title} copy`,
          null,
          `${source.slug}-${Date.now()}`,
        ),
        status: "draft",
        featured: false,
        vin: null,
        stockNumber: null,
        legacyUrl: null,
      });
      await addAudit(
        env.DB,
        email,
        "vehicle_duplicated",
        "vehicle",
        duplicateId,
        { sourceId: id },
      );
      return json({ ok: true, id: duplicateId }, 201);
    }
    if (action === "delete" && request.method === "POST") {
      await softDeleteVehicle(env.DB, id);
      await addAudit(env.DB, email, "vehicle_soft_deleted", "vehicle", id);
      return json({ ok: true });
    }
    if (action === "images" && request.method === "GET")
      return json({ images: await listImages(env.DB, id) });
    if (action === "images" && request.method === "POST") {
      if (!bodyWithinLimit(request, 15 * 1024 * 1024))
        return errorResponse("Image upload is too large", 413);
      try {
        const form = await request.formData();
        const uploaded = await uploadVehicleImage(env, id, form);
        const current = await listImages(env.DB, id);
        const position = current.length;
        try {
          await upsertImage(env.DB, {
            id: uploaded.id,
            vehicleId: id,
            r2Key: uploaded.key,
            originalFilename: uploaded.meta.filename,
            contentType: uploaded.meta.contentType,
            byteSize: uploaded.meta.byteSize,
            width: uploaded.meta.width,
            height: uploaded.meta.height,
            position,
            isCover: current.length === 0,
            createdAt: nowIso(),
          });
        } catch (error) {
          await env.VEHICLE_IMAGES?.delete(uploaded.key).catch(() => undefined);
          throw error;
        }
        await addAudit(
          env.DB,
          email,
          "image_uploaded",
          "vehicle_image",
          uploaded.id,
          { vehicleId: id },
        );
        return json(
          { ok: true, image: await getImageById(env.DB, uploaded.id) },
          201,
        );
      } catch (error) {
        return errorResponse(
          error instanceof Error ? error.message : "Unable to upload image.",
          400,
        );
      }
    }
    if (action === "images" && request.method === "PUT") {
      const body = await parseJsonBody(request);
      const rawOrder =
        body && typeof body === "object"
          ? (body as Record<string, unknown>).order
          : undefined;
      const order = Array.isArray(rawOrder)
        ? rawOrder.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : [];
      const coverId =
        body &&
        typeof body === "object" &&
        typeof (body as Record<string, unknown>).coverId === "string"
          ? ((body as Record<string, unknown>).coverId as string)
          : undefined;
      if (!order.length) return errorResponse("Image order is required");
      const currentImages = await listImages(env.DB, id);
      const currentIds = new Set(currentImages.map((image) => image.id));
      if (
        order.length !== currentIds.size ||
        new Set(order).size !== currentIds.size ||
        order.some((imageId) => !currentIds.has(imageId))
      )
        return errorResponse("Image order does not match this vehicle.", 400);
      if (coverId && !currentIds.has(coverId))
        return errorResponse(
          "Cover image does not belong to this vehicle.",
          400,
        );
      await normalizeImagePositions(env.DB, id, order, coverId);
      await addAudit(env.DB, email, "images_reordered", "vehicle", id, {
        coverId,
      });
      return json({ ok: true, images: await listImages(env.DB, id) });
    }
  }
  const imageMatch = path.match(/^\/api\/admin\/images\/([^/]+)$/);
  if (imageMatch && request.method === "DELETE") {
    const image = await getImageById(env.DB, decodeURIComponent(imageMatch[1]));
    if (!image) return errorResponse("Image not found", 404);
    await softDeleteImage(env.DB, image.id);
    const remainingImages = await listImages(env.DB, image.vehicleId);
    if (remainingImages.length)
      await normalizeImagePositions(
        env.DB,
        image.vehicleId,
        remainingImages.map((item) => item.id),
      );
    await ensureImageCover(env.DB, image.vehicleId);
    await addAudit(
      env.DB,
      email,
      "image_soft_deleted",
      "vehicle_image",
      image.id,
      {
        vehicleId: image.vehicleId,
        r2Key: image.r2Key,
      },
    );
    return json({ ok: true });
  }
  if (path === "/api/admin/leads" && request.method === "GET") {
    const status = cleanNullable(
      new URL(request.url).searchParams.get("status"),
    ) as LeadStatus | null;
    return json({ leads: await listLeads(env.DB, status ?? undefined) });
  }
  const leadMatch = path.match(/^\/api\/admin\/leads\/([^/]+)$/);
  if (leadMatch && request.method === "GET") {
    const lead = await getLead(env.DB, decodeURIComponent(leadMatch[1]));
    return lead ? json({ lead }) : errorResponse("Lead not found", 404);
  }
  if (leadMatch && request.method === "PATCH") {
    const id = decodeURIComponent(leadMatch[1]);
    const parsed = leadUpdateSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success) return errorResponse("Invalid lead update");
    await updateLead(env.DB, id, parsed.data.status, parsed.data.adminNotes);
    await addAudit(env.DB, email, "lead_updated", "lead", id, {
      status: parsed.data.status,
    });
    return json({ ok: true, lead: await getLead(env.DB, id) });
  }
  if (path === "/api/admin/settings" && request.method === "GET")
    return json({ settings: await getSettings(env.DB) });
  if (
    path === "/api/admin/settings" &&
    (request.method === "PUT" || request.method === "PATCH")
  ) {
    const parsed = settingsSchema.safeParse(await parseJsonBody(request));
    if (!parsed.success)
      return errorResponse("Please check the settings fields.");
    await updateSettings(env.DB, parsed.data as SiteSettings);
    await addAudit(env.DB, email, "settings_updated", "settings", "1");
    return json({ ok: true, settings: await getSettings(env.DB) });
  }
  if (path === "/api/admin/audit" && request.method === "GET")
    return json({ logs: await listAudit(env.DB) });
  if (path === "/api/admin/vin/decode" && request.method === "POST") {
    if (!bodyWithinLimit(request, 4000))
      return errorResponse("Request is too large", 413);
    const body = await parseJsonBody(request);
    const vin =
      body && typeof body === "object"
        ? String((body as Record<string, unknown>).vin ?? "")
        : "";
    const vehicleId =
      body && typeof body === "object"
        ? cleanNullable((body as Record<string, unknown>).vehicleId)
        : null;
    const normalized = normalizeVin(vin);
    if (!normalized)
      return errorResponse("Enter a valid 17-character VIN before decoding.");
    const duplicate = await env.DB.prepare(
      "SELECT id FROM vehicles WHERE vin = ? AND deleted_at IS NULL AND (? IS NULL OR id <> ?) LIMIT 1",
    )
      .bind(normalized, vehicleId, vehicleId)
      .first<{ id: string }>();
    if (duplicate)
      return errorResponse("That VIN is already in inventory.", 409);
    const result = await decodeVin(
      normalized,
      {
        get: (value) => getVinCache(env.DB, value),
        touch: (value, at) => touchVinCache(env.DB, value, at),
        put: (value, normalizedJson, rawJson, at) =>
          putVinCache(env.DB, value, normalizedJson, rawJson, at),
      },
      options.fetchImpl ?? fetch,
    );
    return result.ok
      ? json({ ok: true, decoded: result.decoded, fromCache: result.fromCache })
      : json({ ok: false, message: result.message }, 200);
  }
  return errorResponse("Admin route not found", 404);
}

function sitemapXml(
  origin: string,
  vehicles: Array<{ slug: string; updatedAt: string }>,
): string {
  const urls = [
    "",
    "/inventory",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    ...vehicles.map(
      (vehicle) => `/inventory/${encodeURIComponent(vehicle.slug)}`,
    ),
  ];
  const entries = urls
    .map(
      (path) =>
        `<url><loc>${escapeHtml(`${origin}${path}`)}</loc>${path.startsWith("/inventory/") ? `<lastmod>${escapeHtml(new Date(vehicles.find((vehicle) => `/inventory/${vehicle.slug}` === path)?.updatedAt ?? nowIso()).toISOString())}</lastmod>` : ""}</url>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}

async function staticOrShell(request: Request, env: Env): Promise<Response> {
  if (env.ASSETS) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      const headers = new Headers(asset.headers);
      if (headers.get("Content-Type")?.includes("text/html"))
        headers.set(
          "Cache-Control",
          "public, max-age=0, s-maxage=60, stale-while-revalidate=30",
        );
      return new Response(asset.body, {
        status: asset.status,
        statusText: asset.statusText,
        headers,
      });
    }
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YC Auto USA</title></head><body><div id="root"></div><p style="font-family:sans-serif;padding:2rem">YC Auto is starting…</p></body></html>`;
  return text(html, 200, "text/html; charset=utf-8");
}

async function decoratePublicHtml(
  response: Response,
  request: Request,
  env: Env,
): Promise<Response> {
  if (
    response.status !== 200 ||
    !response.headers.get("Content-Type")?.includes("text/html")
  )
    return response;
  const url = new URL(request.url);
  const origin = env.APP_ORIGIN ?? url.origin;
  let title = "YC Auto USA | Quality pre-owned vehicles";
  let description = "Quality pre-owned vehicles in Flushing, New York.";
  let snippet = "Find your next car at YC Auto USA in Flushing, New York.";
  let socialImage = `${origin}/brand/team.jpg`;
  let structured: Record<string, unknown> | null = null;
  if (url.pathname === "/") {
    try {
      const settings = await getSettings(env.DB);
      title = settings.seoTitle;
      description = settings.seoDescription;
      snippet = `${settings.heroTitle}. ${settings.heroSubtitle}`;
      structured = {
        "@context": "https://schema.org",
        "@type": "AutoDealer",
        name: settings.businessName,
        url: origin,
        logo: `${origin}/brand/logo-dark.png`,
        image: `${origin}/brand/team.jpg`,
        telephone: settings.phone,
        email: settings.email,
        address: { "@type": "PostalAddress", streetAddress: settings.address },
      };
    } catch {
      /* static shell remains useful while D1 is being configured */
    }
  } else if (url.pathname === "/inventory") {
    title = "Inventory | YC Auto USA";
    description =
      "Browse current pre-owned vehicles at YC Auto USA in Flushing, New York.";
    snippet =
      "Browse current vehicles, filter by make, price, mileage, and body type.";
  } else if (url.pathname === "/about") {
    title = "Our story | YC Auto USA";
    description =
      "Meet YC Auto USA, a local pre-owned vehicle dealer in Flushing, New York.";
    snippet =
      "Local knowledge. Good cars. A straightforward place to find your next vehicle.";
  } else if (url.pathname === "/contact") {
    title = "Contact | YC Auto USA";
    description =
      "Call, email, or send a message to YC Auto USA in Flushing, New York.";
    snippet = "Let’s talk cars. Call, email, or send a note to YC Auto USA.";
  } else if (url.pathname === "/privacy" || url.pathname === "/terms") {
    title = `${url.pathname === "/privacy" ? "Privacy" : "Terms"} | YC Auto USA`;
    snippet =
      url.pathname === "/privacy"
        ? "How YC Auto USA handles contact information."
        : "Terms for using the YC Auto USA website.";
  } else {
    const detailPath = url.pathname.match(/^\/inventory\/([^/]+)$/);
    if (detailPath) {
      const vehicle = await getVehicleBySlug(
        env.DB,
        decodeURIComponent(detailPath[1]),
        false,
      );
      if (vehicle) {
        title = `${vehicle.title} | YC Auto USA`;
        description =
          vehicle.description?.slice(0, 300) ||
          `${vehicle.title} at YC Auto USA in Flushing, New York.`;
        snippet = `${vehicle.title}. ${vehicle.priceCents !== null ? formatPrice(vehicle.priceCents) : "Price on request"} · ${vehicle.mileage !== null ? formatMileage(vehicle.mileage) : "Mileage on request"}.`;
        const cover =
          vehicle.images?.find((image) => image.isCover) ?? vehicle.images?.[0];
        if (cover?.r2Key)
          socialImage = `${origin}/media/${cover.r2Key}?w=1600&format=webp`;
        structured = {
          "@context": "https://schema.org",
          "@type": "Car",
          name: vehicle.title,
          image:
            vehicle.images?.map(
              (image) => `${origin}/media/${image.r2Key}?w=1600&format=webp`,
            ) ?? [],
          offers: {
            "@type": "Offer",
            priceCurrency: "USD",
            price:
              vehicle.priceCents !== null
                ? vehicle.priceCents / 100
                : undefined,
            availability:
              vehicle.status === "sold"
                ? "https://schema.org/OutOfStock"
                : vehicle.status === "pending"
                  ? "https://schema.org/LimitedAvailability"
                  : "https://schema.org/InStock",
          },
        };
      }
    }
  }
  const jsonLd = structured
    ? `<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, "\\u003c")}</script>`
    : "";
  const robots =
    env.ENVIRONMENT !== "production"
      ? '<meta name="robots" content="noindex,nofollow">'
      : '<meta name="robots" content="index,follow">';
  const head = `${robots}<meta name="description" content="${escapeHtml(description)}"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:url" content="${escapeHtml(`${origin}${url.pathname}`)}"><meta property="og:image" content="${escapeHtml(socialImage)}"><link rel="canonical" href="${escapeHtml(`${origin}${url.pathname}`)}">${jsonLd}`;
  const body = await response.text();
  const enhanced = body
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /<meta name="description"[^>]*>/i,
      `<meta name="description" content="${escapeHtml(description)}">`,
    )
    .replace("</head>", `${head}</head>`)
    .replace(
      '<div id="root"></div>',
      `<div id="root"></div><noscript><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(snippet)}</p><p><a href="${escapeHtml(`${origin}/inventory`)}">Browse inventory</a></p></main></noscript>`,
    );
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=60, stale-while-revalidate=30",
  );
  return new Response(enhanced, { status: response.status, headers });
}

export async function handleRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContextLike = { waitUntil: () => undefined },
  options: RequestOptions = {},
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const host = request.headers.get("Host") ?? url.host;
    const requestHost = host.split(":")[0].toLowerCase();
    const canonicalHost = env.CANONICAL_HOST?.trim().toLowerCase();
    if (
      canonicalHost &&
      (requestHost !== canonicalHost || url.protocol === "http:") &&
      /^https:/i.test(env.APP_ORIGIN ?? "")
    )
      return withSecurity(
        Response.redirect(`${env.APP_ORIGIN}${url.pathname}${url.search}`, 301),
        env,
      );
    if (url.pathname.startsWith("/media/"))
      return withSecurity(
        await serveMedia(
          request,
          env,
          decodeURIComponent(url.pathname.slice("/media/".length)),
        ),
        env,
      );
    if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) {
      const guard = await adminGuard(request, env, options.fetchImpl);
      if (guard instanceof Response) return withSecurity(guard, env);
    }
    const publicResult = await publicApi(request, env, url.pathname, options);
    if (publicResult) return withSecurity(publicResult, env);
    const adminResult = await adminApi(
      request,
      env,
      url.pathname,
      ctx,
      options,
    );
    if (adminResult) return withSecurity(adminResult, env);
    if (
      url.pathname === "/sitemap.xml" &&
      (request.method === "GET" || request.method === "HEAD")
    ) {
      const sitemapResponse = text(
        sitemapXml(
          env.APP_ORIGIN ?? `${url.protocol}//${url.host}`,
          await listSitemapVehicles(env.DB),
        ),
        200,
        "application/xml; charset=utf-8",
      );
      sitemapResponse.headers.set(
        "Cache-Control",
        "public, max-age=60, s-maxage=60",
      );
      return withSecurity(sitemapResponse, env);
    }
    if (
      url.pathname === "/robots.txt" &&
      (request.method === "GET" || request.method === "HEAD")
    )
      return withSecurity(
        text(
          env.ENVIRONMENT !== "production"
            ? `User-agent: *\nDisallow: /\n`
            : `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${env.APP_ORIGIN ?? `${url.protocol}//${url.host}`}/sitemap.xml\n`,
        ),
        env,
      );
    if (request.method === "GET" || request.method === "HEAD") {
      const redirect = await resolveRedirect(env.DB, url.pathname);
      if (redirect)
        return withSecurity(
          Response.redirect(
            new URL(
              redirect.targetPath,
              env.APP_ORIGIN ?? url.origin,
            ).toString(),
            redirect.statusCode,
          ),
          env,
        );
      const detailPath = url.pathname.match(/^\/inventory\/([^/]+)$/);
      if (detailPath) {
        const vehicle = await getVehicleBySlug(
          env.DB,
          decodeURIComponent(detailPath[1]),
          false,
        );
        if (!vehicle)
          return withSecurity(
            text(
              "<!doctype html><title>Vehicle not found | YC Auto USA</title><h1>Vehicle not found</h1>",
              404,
              "text/html; charset=utf-8",
            ),
            env,
          );
      }
    }
    const shell = await staticOrShell(request, env);
    return withSecurity(await decoratePublicHtml(shell, request, env), env);
  } catch (error) {
    console.error(
      "request failed",
      error instanceof Error ? error.name : "unknown",
    );
    return withSecurity(
      errorResponse("Something went wrong. Please try again.", 500),
      env,
    );
  }
}

export type { D1Like };
