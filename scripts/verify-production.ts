#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const origin = (process.env.APP_ORIGIN ?? "").replace(/\/$/, "");
if (!origin) {
  console.error(
    "Set APP_ORIGIN to the deployed https URL, for example APP_ORIGIN=https://preview.yc-auto.workers.dev",
  );
  process.exitCode = 1;
}

const checks = [
  "/",
  "/inventory",
  "/trade-sell",
  "/about",
  "/contact",
  "/zh",
  "/zh/inventory",
  "/zh/trade-sell",
  "/zh/contact",
  "/api/inventory/facets",
  "/sitemap.xml",
  "/robots.txt",
];
const results: Array<{ path: string; status: number | string; ok: boolean }> =
  [];
if (origin) {
  for (const path of checks) {
    try {
      const response = await fetch(`${origin}${path}`, { redirect: "manual" });
      results.push({
        path,
        status: response.status,
        ok: response.status >= 200 && response.status < 400,
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
        const response = await fetch(`${origin}${path}`);
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
  try {
    const admin = await fetch(`${origin}/admin`, { redirect: "manual" });
    results.push({
      path: "/admin (unauthenticated)",
      status: admin.status,
      ok: [401, 403, 302].includes(admin.status),
    });
  } catch (error) {
    results.push({
      path: "/admin (unauthenticated)",
      status: error instanceof Error ? error.message : "network error",
      ok: false,
    });
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
