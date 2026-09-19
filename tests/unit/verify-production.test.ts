import { afterEach, describe, expect, it, vi } from "vitest";

const origin = "https://www.ycautousa.com";
// Essential shell from the production incident: API routes returned this as HTML 200.
const incidentHtml = `<!doctype html><html lang="en"><head>
<title>YC Auto USA | Quality pre-owned vehicles</title>
<script type="module" crossorigin src="/assets/index-w8j8G1D4.js"></script>
</head><body><div id="root"></div></body></html>`;
const apiBodies: Record<string, unknown> = {
  "/api/public/home": {
    settings: {
      businessName: "YC Auto USA",
      heroTitle: "Find your car",
      heroSubtitle: "Cars in New York",
      phone: "1234567890",
      email: "test@example.com",
    },
    featured: [],
    makes: [],
  },
  "/api/public/config": { turnstileSiteKey: "site-key" },
  "/api/inventory": { vehicles: [], total: 0, page: 1, perPage: 12 },
  "/api/inventory/facets": { makes: [], years: [] },
};

function healthyResponse(path: string): Response {
  if (path === "/admin" || path === "/api/admin/dashboard")
    return new Response(null, { status: 401 });
  if (path.endsWith("/about"))
    return new Response(null, {
      status: 301,
      headers: {
        Location: `${origin}${path.replace(/about$/, "contact")}#our-story`,
      },
    });
  if (path in apiBodies) return Response.json(apiBodies[path]);
  if (path === "/robots.txt")
    return new Response(`User-agent: *\nSitemap: ${origin}/sitemap.xml`, {
      headers: { "Content-Type": "text/plain" },
    });
  if (path === "/sitemap.xml")
    return new Response(
      `<urlset xmlns:xhtml="http://www.w3.org/1999/xhtml">
      <url><loc>${origin}/trade-sell</loc>
      <xhtml:link rel="alternate" hreflang="zh-CN" href="${origin}/zh/trade-sell" />
      </url></urlset>`,
      { headers: { "Content-Type": "application/xml" } },
    );
  const language = path === "/zh" || path.startsWith("/zh/") ? "zh-CN" : "en";
  return new Response(
    `<!doctype html><html lang="${language}"><head>
    <link rel="canonical" href="${origin}${path}">
    <script type="module" src="/assets/app.js"></script>
    </head><body><div id="root"></div></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

const previousExitCode = process.exitCode;
afterEach(() => {
  process.exitCode = previousExitCode;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function verify(overrides: Record<string, () => Response> = {}) {
  vi.resetModules();
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("LEGACY_PATH", "");
  vi.stubEnv("IMAGE_PATH", "");
  process.exitCode = 0;
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      return overrides[path]?.() ?? healthyResponse(path);
    }),
  );
  await import("../../scripts/verify-production");
  return JSON.parse(String(log.mock.calls[0][0])) as {
    results: Array<{ path: string; status: number | string; ok: boolean }>;
  };
}

describe("production smoke checks", () => {
  it("accepts valid pages, structured APIs, protected admin routes, and about redirects", async () => {
    const report = await verify();
    expect(report.results.every((result) => result.ok)).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it("rejects the incident's HTML 200 response for every public API and the admin API", async () => {
    const paths = [...Object.keys(apiBodies), "/api/admin/dashboard"];
    const report = await verify(
      Object.fromEntries(
        paths.map((path) => [
          path,
          () =>
            new Response(incidentHtml, {
              headers: { "Content-Type": "text/html" },
            }),
        ]),
      ),
    );
    expect(
      report.results
        .filter((result) => !result.ok)
        .map((result) => result.path),
    ).toEqual([
      ...Object.keys(apiBodies),
      "/api/admin/dashboard (unauthenticated)",
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("rejects JSON without the expected shape and pages without the canonical URL", async () => {
    const report = await verify({
      "/api/public/home": () => Response.json({}),
      "/zh": () =>
        new Response(incidentHtml, {
          headers: { "Content-Type": "text/html" },
        }),
    });
    expect(
      report.results.find((result) => result.path === "/api/public/home"),
    ).toMatchObject({
      ok: false,
      status: expect.stringContaining("invalid API response"),
    });
    expect(
      report.results.find((result) => result.path === "/zh"),
    ).toMatchObject({
      ok: false,
      status: expect.stringContaining("expected canonical"),
    });
    expect(process.exitCode).toBe(1);
  });
});
