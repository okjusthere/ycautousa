#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const origin = (process.env.APP_ORIGIN ?? "").replace(/\/$/, "");
if (!origin) {
  console.error(
    "Set APP_ORIGIN to the deployed https URL, for example APP_ORIGIN=https://preview.yc-auto.workers.dev",
  );
  process.exitCode = 1;
}

const pagePaths = [
  "/",
  "/inventory",
  "/trade-sell",
  "/contact",
  "/zh",
  "/zh/inventory",
  "/zh/trade-sell",
  "/zh/contact",
];
const vehicleSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(["available", "pending", "sold"]),
});
const makesSchema = z.array(
  z.object({ make: z.string(), count: z.number().int().nonnegative() }),
);
const apiSchemas: Record<string, z.ZodType> = {
  "/api/public/home": z.object({
    settings: z.object({
      businessName: z.string(),
      heroTitle: z.string(),
      heroSubtitle: z.string(),
      phone: z.string(),
      email: z.string(),
    }),
    featured: z.array(vehicleSchema),
    makes: makesSchema,
  }),
  "/api/public/config": z.object({ turnstileSiteKey: z.string() }),
  "/api/inventory": z.object({
    vehicles: z.array(vehicleSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    perPage: z.number().int().positive(),
  }),
  "/api/inventory/facets": z.object({
    makes: makesSchema,
    years: z.array(z.number().int()),
  }),
};
const checks = [
  ...pagePaths,
  ...Object.keys(apiSchemas),
  "/sitemap.xml",
  "/robots.txt",
];

async function validateHtml(response: Response, path: string): Promise<void> {
  if (response.status !== 200)
    throw new Error(`expected HTTP 200, received ${response.status}`);
  if (!response.headers.get("content-type")?.startsWith("text/html"))
    throw new Error("expected text/html");
  const html = await response.text();
  if (
    !/<div\b[^>]*\bid=["']root["']/.test(html) ||
    !/<script\b[^>]*\bsrc=["'][^"']+["']/.test(html)
  )
    throw new Error("HTML is missing the app root or JavaScript entry point");
  const canonicalTag = html.match(
    /<link\b[^>]*\brel=["']canonical["'][^>]*>/i,
  )?.[0];
  const canonical = canonicalTag?.match(/\bhref=["']([^"']+)["']/i)?.[1];
  if (canonical !== `${origin}${path}`)
    throw new Error(
      `expected canonical ${origin}${path}, received ${canonical ?? "none"}`,
    );
  const language = path === "/zh" || path.startsWith("/zh/") ? "zh-CN" : "en";
  if (!html.includes(`<html lang="${language}"`))
    throw new Error(`expected HTML language ${language}`);
}

const results: Array<{ path: string; status: number | string; ok: boolean }> =
  [];
if (origin) {
  for (const path of checks) {
    try {
      const response = await fetch(`${origin}${path}`, { redirect: "manual" });
      if (response.status !== 200)
        throw new Error(`expected HTTP 200, received ${response.status}`);
      const schema = apiSchemas[path];
      if (schema) {
        const contentType = response.headers.get("content-type") ?? "";
        if (contentType.split(";")[0].trim() !== "application/json")
          throw new Error(
            `expected application/json, received ${contentType || "none"}`,
          );
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success)
          throw new Error(
            `invalid API response: ${parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`,
          );
      } else if (pagePaths.includes(path)) {
        await validateHtml(response, path);
      } else if (path === "/robots.txt") {
        if (!response.headers.get("content-type")?.startsWith("text/plain"))
          throw new Error("expected text/plain robots.txt");
        if (!(await response.text()).includes(`Sitemap: ${origin}/sitemap.xml`))
          throw new Error("robots.txt is missing the canonical sitemap URL");
      }
      results.push({
        path,
        status: response.status,
        ok: true,
      });
    } catch (error) {
      results.push({
        path,
        status: error instanceof Error ? error.message : "network error",
        ok: false,
      });
    }
  }
  const sitemap = results.find((item) => item.path === "/sitemap.xml");
  if (sitemap?.ok) {
    const xml = await fetch(`${origin}/sitemap.xml`).then((response) =>
      response.text(),
    );
    if (!xml.includes("<urlset")) {
      sitemap.ok = false;
      sitemap.status = "invalid sitemap XML";
    }
    if (
      !xml.includes("/trade-sell") ||
      !xml.includes("/zh/trade-sell") ||
      !xml.includes('hreflang="zh-CN"')
    ) {
      sitemap.ok = false;
      sitemap.status = "localized routes missing from sitemap";
    }
    const vehiclePaths = [
      ...new Set(
        [
          ...xml.matchAll(
            /<loc>https?:\/\/[^/]+(\/(?:zh\/)?inventory\/[^<]+)<\/loc>/g,
          ),
        ].map((match) => match[1]),
      ),
    ].slice(0, 6);
    for (const path of vehiclePaths) {
      try {
        const response = await fetch(`${origin}${path}`, {
          redirect: "manual",
        });
        await validateHtml(response, path);
        results.push({
          path,
          status: response.status,
          ok: response.status === 200,
        });
      } catch (error) {
        results.push({
          path,
          status: error instanceof Error ? error.message : "network error",
          ok: false,
        });
      }
    }
  }
  for (const path of ["/admin", "/api/admin/dashboard"]) {
    try {
      const admin = await fetch(`${origin}${path}`, { redirect: "manual" });
      const location = admin.headers.get("location") ?? "";
      const accessLogin = location ? new URL(location, origin) : null;
      const protectedRedirect =
        admin.status === 302 &&
        accessLogin?.protocol === "https:" &&
        accessLogin.hostname.endsWith(".cloudflareaccess.com") &&
        accessLogin.pathname.startsWith("/cdn-cgi/access/login");
      results.push({
        path: `${path} (unauthenticated)`,
        status: admin.status,
        ok: [401, 403].includes(admin.status) || protectedRedirect,
      });
    } catch (error) {
      results.push({
        path: `${path} (unauthenticated)`,
        status: error instanceof Error ? error.message : "network error",
        ok: false,
      });
    }
  }
  for (const path of ["/about", "/zh/about"]) {
    try {
      const response = await fetch(`${origin}${path}`, { redirect: "manual" });
      results.push({
        path,
        status: response.status,
        ok:
          response.status === 301 &&
          response.headers.get("location") ===
            `${origin}${path.replace(/about$/, "contact")}#our-story`,
      });
    } catch (error) {
      results.push({
        path,
        status: error instanceof Error ? error.message : "network error",
        ok: false,
      });
    }
  }
  if (process.env.LEGACY_PATH) {
    try {
      const legacy = await fetch(`${origin}${process.env.LEGACY_PATH}`, {
        redirect: "manual",
      });
      results.push({
        path: process.env.LEGACY_PATH,
        status: legacy.status,
        ok: legacy.status === 301,
      });
    } catch (error) {
      results.push({
        path: process.env.LEGACY_PATH,
        status: error instanceof Error ? error.message : "network error",
        ok: false,
      });
    }
  }
  if (process.env.IMAGE_PATH) {
    try {
      const image = await fetch(`${origin}${process.env.IMAGE_PATH}`, {
        redirect: "manual",
      });
      const contentType = image.headers.get("content-type") ?? "";
      results.push({
        path: process.env.IMAGE_PATH,
        status: `${image.status} ${contentType}`,
        ok: image.status === 200 && contentType.startsWith("image/"),
      });
    } catch (error) {
      results.push({
        path: process.env.IMAGE_PATH,
        status: error instanceof Error ? error.message : "network error",
        ok: false,
      });
    }
  }
}
console.log(
  JSON.stringify(
    { origin: origin || null, checkedAt: new Date().toISOString(), results },
    null,
    2,
  ),
);
if (results.some((result) => !result.ok)) process.exitCode = 1;

try {
  const summary = JSON.parse(
    readFileSync(
      resolve(
        new URL("..", import.meta.url).pathname,
        "migration/output/run-summary.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
  console.log(
    `Latest migration summary: ${String(summary.recordCount ?? 0)} records, ${String(summary.imageCount ?? 0)} source images.`,
  );
} catch {
  console.log(
    "No local migration summary found; run npm run migrate:legacy:dry before cutover.",
  );
}
