#!/usr/bin/env node
/**
 * Polite, repeatable migration utility for the legacy YC Auto catalogue.
 * It never deletes source data. `dry` and `prepare` are safe read/download operations;
 * `apply` requires an explicit --yes (or CI=true) before it invokes Wrangler.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import {
  parseLegacyProduct,
  discoverNextPages,
  discoverProductLinks,
  type LegacyRecord,
} from "../lib/migration-parser.js";
import { formatPrice } from "../lib/utils.js";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUTPUT = join(ROOT, "migration", "output");
const WORK = join(ROOT, "migration", "work");
const configuredLegacyBase =
  process.env.LEGACY_BASE_URL ?? "https://www.ycautousa.com/";
const LEGACY_BASE = /products(?:_\d+)?\.html(?:$|\?)/i.test(
  configuredLegacyBase,
)
  ? new URL(".", configuredLegacyBase).toString()
  : new URL(configuredLegacyBase).toString();
const START = /products(?:_\d+)?\.html(?:$|\?)/i.test(configuredLegacyBase)
  ? new URL(configuredLegacyBase).toString()
  : new URL("products.html", LEGACY_BASE).toString();
const USER_AGENT =
  "YC-Auto-Migration/1.0 (+https://www.ycautousa.com; polite inventory migration)";
const mode = process.argv[2] ?? "dry";
const isTestFixture = process.env.LEGACY_FIXTURE === "1";
const requestedMaxPages = Number(process.env.MAX_PAGES ?? 200);
const maxPages = Number.isFinite(requestedMaxPages)
  ? Math.min(500, Math.max(1, requestedMaxPages))
  : 200;

mkdirSync(OUTPUT, { recursive: true });

const sleep = (ms: number) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function fetchImageWithRetry(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "image/avif,image/webp,image/jpeg,image/png;q=0.9,*/*;q=0.1",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok || attempt === 2) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt === 2) throw error;
    }
    await sleep(350 * (attempt + 1));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("image fetch failed");
}

async function fetchText(
  url: string,
  attempt = 0,
): Promise<{ status: number; body: string }> {
  if (isTestFixture && url.startsWith(LEGACY_BASE)) {
    const localPath = join(
      ROOT,
      "migration",
      "fixtures",
      new URL(url).pathname.replace(/^\//, ""),
    );
    if (existsSync(localPath))
      return { status: 200, body: readFileSync(localPath, "utf8") };
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await response.text();
    clearTimeout(timeout);
    if (!response.ok && attempt < 2) {
      await sleep(400 * (attempt + 1));
      return fetchText(url, attempt + 1);
    }
    return { status: response.status, body };
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    if (attempt < 2) {
      await sleep(500 * (attempt + 1));
      return fetchText(url, attempt + 1);
    }
    throw error;
  }
}

async function crawl(): Promise<{
  records: LegacyRecord[];
  crawlWarnings: string[];
  pages: string[];
}> {
  const queue = [START];
  const visitedPages = new Set<string>();
  const productUrls = new Set<string>();
  const crawlWarnings: string[] = [];
  while (queue.length && visitedPages.size < maxPages) {
    const page = queue.shift() as string;
    if (visitedPages.has(page)) continue;
    visitedPages.add(page);
    let fetched: { status: number; body: string };
    try {
      fetched = await fetchText(page);
    } catch (error) {
      crawlWarnings.push(
        `fetch failed: ${page} (${error instanceof Error ? error.message : "unknown error"})`,
      );
      continue;
    }
    if (fetched.status === 404) continue;
    if (fetched.status < 200 || fetched.status >= 300) {
      crawlWarnings.push(`HTTP ${fetched.status}: ${page}`);
      continue;
    }
    const discoveredProducts = discoverProductLinks(fetched.body, page);
    for (const link of discoveredProducts) productUrls.add(link);
    for (const next of discoverNextPages(fetched.body, page))
      if (!visitedPages.has(next)) queue.push(next);
    // Some legacy templates omit a rel=next link. Probe the known naming convention,
    // but stop after a missing page or a page with no product links.
    const path = new URL(page).pathname;
    const match = path.match(/products(?:_(\d+))?\.html$/i);
    if (match) {
      const nextNumber = match[1] ? Number(match[1]) + 1 : 2;
      const inferred = new URL(
        `products_${nextNumber}.html`,
        new URL(page).origin,
      ).toString();
      if (
        discoveredProducts.length > 0 &&
        !visitedPages.has(inferred) &&
        nextNumber <= 12
      )
        queue.push(inferred);
    }
    await sleep(180);
  }
  const records: LegacyRecord[] = [];
  if (productUrls.size === 0)
    crawlWarnings.push(
      "No product detail links discovered; verify source availability and TLS before treating the catalogue as empty.",
    );
  for (const url of productUrls) {
    try {
      const fetched = await fetchText(url);
      if (fetched.status >= 200 && fetched.status < 300)
        records.push(parseLegacyProduct(fetched.body, url));
      else
        records.push({
          ...parseLegacyProduct("", url),
          warnings: [
            `HTTP ${fetched.status}`,
            "product page could not be parsed",
          ],
          status: "draft",
        });
    } catch (error) {
      records.push({
        ...parseLegacyProduct("", url),
        warnings: [
          `fetch failed: ${error instanceof Error ? error.message : "unknown error"}`,
          "product page could not be parsed",
        ],
        status: "draft",
      });
    }
    await sleep(180);
  }
  const byVin = new Map<string, LegacyRecord[]>();
  for (const record of records)
    if (record.vin)
      byVin.set(record.vin, [...(byVin.get(record.vin) ?? []), record]);
  for (const [vin, matches] of byVin) {
    if (matches.length < 2) continue;
    for (const record of matches) {
      record.status = "draft";
      record.warnings.push(`duplicate VIN ${vin} requires manual review`);
    }
  }
  if (queue.length > 0 && visitedPages.size >= maxPages)
    crawlWarnings.push(
      `page limit ${maxPages} reached; rerun with MAX_PAGES to continue`,
    );
  return { records, crawlWarnings, pages: [...visitedPages] };
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}
function auditCsv(records: LegacyRecord[]): string {
  const header = [
    "legacy URL",
    "title",
    "year",
    "parsed VIN",
    "price",
    "mileage",
    "image count",
    "target status",
    "warnings",
    "normalized fields",
    "normalization changes",
  ];
  const rows = records.map((record) =>
    [
      record.legacyUrl,
      record.title,
      record.year ?? "",
      record.vin ?? "",
      record.priceCents === null ? "" : formatPrice(record.priceCents),
      record.mileage ?? "",
      record.imageUrls.length,
      record.status,
      record.warnings,
      [
        record.category,
        record.model,
        record.exteriorColor,
        record.drivetrain,
        record.transmission,
      ],
      record.normalizationChanges,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.map(csvCell).join(","), ...rows].join("\n") + "\n";
}

function migrationSql(
  records: LegacyRecord[],
  imageManifest: Array<Record<string, unknown>> = [],
): string {
  const quote = (value: string | number | null) =>
    value === null
      ? "NULL"
      : typeof value === "number"
        ? String(value)
        : `'${String(value).replace(/'/g, "''")}'`;
  const statements: string[] = [
    "-- Generated by migrate-legacy.ts. Review audit.csv before applying.",
  ];
  for (const record of records) {
    const id = `legacy_${createHash("sha256").update(record.legacyUrl).digest("hex").slice(0, 24)}`;
    const title = quote(record.title);
    const slug = quote(record.slug);
    const status = quote(record.status);
    const ambiguousVin = record.warnings.some((warning) =>
      warning.startsWith("duplicate VIN "),
    );
    const vin = ambiguousVin ? "NULL" : quote(record.vin);
    const price =
      record.priceCents === null ? "NULL" : String(record.priceCents);
    const mileage = record.mileage === null ? "NULL" : String(record.mileage);
    statements.push(
      `INSERT INTO vehicles (id,slug,status,featured,title,year,make,model,trim,vin,stock_number,price_cents,mileage,exterior_color,drivetrain,transmission,description,features_json,legacy_url,created_at,updated_at,published_at) VALUES (${quote(id)},${slug},${status},0,${title},${record.year === null ? "NULL" : record.year},${quote(record.category)},${quote(record.model)},NULL,${vin},NULL,${price},${mileage},${quote(record.exteriorColor)},${quote(record.drivetrain)},${quote(record.transmission)},${quote(record.description)},'[]',${quote(record.legacyUrl)},datetime('now'),datetime('now'),CASE WHEN ${status}='available' THEN datetime('now') ELSE NULL END) ON CONFLICT(legacy_url) DO UPDATE SET slug=excluded.slug,title=excluded.title,status=excluded.status,price_cents=excluded.price_cents,mileage=excluded.mileage,make=excluded.make,model=excluded.model,year=excluded.year,vin=excluded.vin,exterior_color=excluded.exterior_color,drivetrain=excluded.drivetrain,transmission=excluded.transmission,description=excluded.description,published_at=CASE WHEN excluded.status='available' THEN COALESCE(vehicles.published_at,datetime('now')) ELSE NULL END,updated_at=datetime('now');`,
    );
    const oldPath = new URL(record.legacyUrl).pathname;
    const target =
      record.status === "available"
        ? `/inventory/${record.slug}`
        : "/inventory";
    statements.push(
      `INSERT INTO legacy_redirects (old_path,target_path,status_code,created_at) VALUES (${quote(oldPath)},${quote(target)},301,datetime('now')) ON CONFLICT(old_path) DO UPDATE SET target_path=excluded.target_path;`,
    );
    const vehicleImages = imageManifest.filter(
      (item) =>
        item.vehicleId === id && item.ok === true && item.duplicateOf == null,
    );
    for (const [position, image] of vehicleImages.entries()) {
      const imageId = String(image.imageId);
      const key = String(image.key);
      const filename =
        String(image.sourceUrl).split("/").pop() ?? `photo-${position + 1}`;
      statements.push(
        `INSERT INTO vehicle_images (id,vehicle_id,r2_key,original_filename,content_type,byte_size,width,height,position,is_cover,created_at) VALUES (${quote(imageId)},${quote(id)},${quote(key)},${quote(filename)},${quote(String(image.contentType ?? "image/webp"))},${Number(image.byteSize ?? 0)},NULL,NULL,${position},${position === 0 ? 1 : 0},datetime('now')) ON CONFLICT(id) DO UPDATE SET r2_key=excluded.r2_key,position=excluded.position,is_cover=excluded.is_cover;`,
      );
    }
  }
  return statements.join("\n") + "\n";
}

async function prepareImages(
  records: LegacyRecord[],
): Promise<Array<Record<string, unknown>>> {
  const manifest: Array<Record<string, unknown>> = [];
  mkdirSync(WORK, { recursive: true });
  for (const record of records) {
    const vehicleId = `legacy_${createHash("sha256").update(record.legacyUrl).digest("hex").slice(0, 24)}`;
    const seenHashes = new Map<
      string,
      { key: string; localPath: string; contentType: string; byteSize: number }
    >();
    for (let index = 0; index < record.imageUrls.length; index += 1) {
      const url = record.imageUrls[index];
      const imageId = createHash("sha256")
        .update(`${record.legacyUrl}:${url}`)
        .digest("hex")
        .slice(0, 24);
      const target = join(WORK, `${imageId}.bin`);
      let state: Record<string, unknown> = {
        vehicleId,
        imageId,
        sourceUrl: url,
        key: `vehicles/${vehicleId}/${imageId}/original`,
        position: index,
        ok: false,
      };
      try {
        const response = await fetchImageWithRetry(url);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const type = response.headers.get("content-type") ?? "";
        const validMagic =
          (bytes[0] === 0xff && bytes[1] === 0xd8) ||
          (bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47) ||
          (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
        if (
          !response.ok ||
          !/^image\/(?:jpe?g|png|webp)/i.test(type) ||
          !validMagic ||
          bytes.byteLength > 25 * 1024 * 1024
        )
          throw new Error(
            `invalid response (${response.status}, ${type}, ${bytes.byteLength} bytes)`,
          );
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const extension = type.toLowerCase().includes("png")
          ? "png"
          : type.toLowerCase().includes("webp")
            ? "webp"
            : "jpg";
        state = {
          ...state,
          ok: true,
          localPath: relative(ROOT, target),
          contentType: type.split(";")[0],
          byteSize: bytes.byteLength,
          sha256,
          key: `${String(state.key)}.${extension}`,
        };
        const duplicate = seenHashes.get(sha256);
        if (duplicate) {
          state = {
            ...state,
            localPath: duplicate.localPath,
            key: duplicate.key,
            contentType: duplicate.contentType,
            byteSize: duplicate.byteSize,
            duplicateOf: sha256,
          };
        } else {
          writeFileSync(target, bytes);
          seenHashes.set(sha256, {
            key: String(state.key),
            localPath: relative(ROOT, target),
            contentType: String(state.contentType),
            byteSize: Number(state.byteSize),
          });
        }
      } catch (error) {
        state = {
          ...state,
          error: error instanceof Error ? error.message : "unknown error",
        };
      }
      manifest.push(state);
      await sleep(130);
    }
  }
  return manifest;
}

function writeOutputs(
  records: LegacyRecord[],
  metadata: {
    crawlWarnings: string[];
    pages: string[];
    imageManifest?: Array<Record<string, unknown>>;
    mode: string;
  },
): void {
  const redirects = records.map((record) => ({
    oldPath: new URL(record.legacyUrl).pathname,
    targetPath:
      record.status === "available"
        ? `/inventory/${record.slug}`
        : "/inventory",
    statusCode: 301,
  }));
  writeFileSync(
    join(OUTPUT, "legacy-inventory.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), source: LEGACY_BASE, records },
      null,
      2,
    ),
  );
  writeFileSync(join(OUTPUT, "audit.csv"), auditCsv(records));
  writeFileSync(
    join(OUTPUT, "redirects.json"),
    JSON.stringify(redirects, null, 2),
  );
  writeFileSync(
    join(OUTPUT, "migration.sql"),
    migrationSql(records, metadata.imageManifest ?? []),
  );
  writeFileSync(
    join(OUTPUT, "images-manifest.json"),
    JSON.stringify(metadata.imageManifest ?? [], null, 2),
  );
  writeFileSync(
    join(OUTPUT, "run-summary.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: metadata.mode,
        source: LEGACY_BASE,
        pagesVisited: metadata.pages,
        recordCount: records.length,
        availableCount: records.filter(
          (record) => record.status === "available",
        ).length,
        draftCount: records.filter((record) => record.status === "draft")
          .length,
        imageCount: records.reduce(
          (sum, record) => sum + record.imageUrls.length,
          0,
        ),
        preparedImageCount: (metadata.imageManifest ?? []).filter(
          (item) => item.ok === true && item.duplicateOf == null,
        ).length,
        imageFailureCount: (metadata.imageManifest ?? []).filter(
          (item) => item.ok !== true,
        ).length,
        duplicateImageCount: (metadata.imageManifest ?? []).filter(
          (item) => item.duplicateOf != null,
        ).length,
        crawlWarnings: metadata.crawlWarnings,
      },
      null,
      2,
    ),
  );
}

async function run(): Promise<void> {
  if (!["dry", "prepare", "apply", "verify"].includes(mode))
    throw new Error("Usage: npm run migrate:legacy:{dry|prepare|apply|verify}");
  if (mode === "verify") {
    const summaryPath = join(OUTPUT, "run-summary.json");
    if (!existsSync(summaryPath))
      throw new Error(
        "No migration output found. Run migrate:legacy:dry first.",
      );
    const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as Record<
      string,
      unknown
    >;
    const records = JSON.parse(
      readFileSync(join(OUTPUT, "legacy-inventory.json"), "utf8"),
    ) as { records: LegacyRecord[] };
    const manifest = existsSync(join(OUTPUT, "images-manifest.json"))
      ? (JSON.parse(
          readFileSync(join(OUTPUT, "images-manifest.json"), "utf8"),
        ) as Array<Record<string, unknown>>)
      : [];
    const failures = manifest.filter((item) => item.ok !== true);
    const result: Record<string, unknown> = {
      ok:
        failures.length === 0 &&
        !(
          Array.isArray((summary as Record<string, unknown>).crawlWarnings) &&
          ((summary as Record<string, unknown>).crawlWarnings as unknown[])
            .length > 0
        ),
      recordCount: records.records.length,
      imageCount: manifest.length,
      preparedImageCount: manifest.filter(
        (item) => item.ok === true && item.duplicateOf == null,
      ).length,
      imageFailures: failures.length,
      previousRun: summary.generatedAt,
    };
    const expectedSourceImages = records.records.reduce(
      (sum, record) => sum + record.imageUrls.length,
      0,
    );
    const redirects = existsSync(join(OUTPUT, "redirects.json"))
      ? (JSON.parse(
          readFileSync(join(OUTPUT, "redirects.json"), "utf8"),
        ) as unknown[])
      : [];
    if (
      manifest.length !== expectedSourceImages ||
      redirects.length !== records.records.length
    )
      result.ok = false;
    result.expectedSourceImages = expectedSourceImages;
    result.redirectCount = redirects.length;
    if (process.env.VERIFY_REMOTE === "1") {
      const database = process.env.CLOUDFLARE_D1_NAME ?? "yc-auto-prod";
      try {
        const raw = execFileSync(
          "npx",
          [
            "wrangler",
            "d1",
            "execute",
            database,
            "--remote",
            "--env",
            "production",
            "--command",
            "SELECT (SELECT COUNT(*) FROM vehicles) AS vehicles, (SELECT COUNT(*) FROM vehicle_images) AS images, (SELECT COUNT(*) FROM legacy_redirects) AS redirects",
            "--json",
          ],
          { cwd: ROOT, encoding: "utf8" },
        );
        const parsed = JSON.parse(raw) as Array<{
          results?: Array<Record<string, unknown>>;
        }>;
        const remote = parsed.flatMap((item) => item.results ?? [])[0] ?? {};
        result.remote = remote;
        const expectedImages = manifest.filter(
          (item) => item.ok === true && item.duplicateOf == null,
        ).length;
        if (
          Number(remote.vehicles) !== records.records.length ||
          Number(remote.images) < expectedImages ||
          Number(remote.redirects) < records.records.length
        )
          result.ok = false;
        try {
          const bucket =
            process.env.CLOUDFLARE_R2_BUCKET ?? "yc-auto-vehicle-images";
          const objectsRaw = execFileSync(
            "npx",
            ["wrangler", "r2", "object", "list", bucket, "--json"],
            { cwd: ROOT, encoding: "utf8" },
          );
          const objectsParsed = JSON.parse(objectsRaw) as unknown;
          const objects: unknown[] = Array.isArray(objectsParsed)
            ? objectsParsed
            : objectsParsed &&
                typeof objectsParsed === "object" &&
                Array.isArray(
                  (objectsParsed as Record<string, unknown>).objects,
                )
              ? ((objectsParsed as Record<string, unknown>)
                  .objects as unknown[])
              : [];
          result.remoteR2ObjectCount = objects.length;
          if (objects.length < expectedImages) result.ok = false;
        } catch (error) {
          result.remoteR2Error =
            error instanceof Error ? error.message : "R2 verification failed";
          result.ok = false;
        }
      } catch (error) {
        result.remoteError =
          error instanceof Error ? error.message : "remote verification failed";
        result.ok = false;
      }
    }
    console.log(JSON.stringify(result, null, 2));
    if (result.ok !== true) process.exitCode = 1;
    return;
  }
  let result: {
    records: LegacyRecord[];
    crawlWarnings: string[];
    pages: string[];
  };
  let imageManifest: Array<Record<string, unknown>> = [];
  if (mode === "apply") {
    const inventoryPath = join(OUTPUT, "legacy-inventory.json");
    const manifestPath = join(OUTPUT, "images-manifest.json");
    if (!existsSync(inventoryPath) || !existsSync(manifestPath)) {
      throw new Error(
        "Apply requires prepared artifacts. Run npm run migrate:legacy:prepare, review audit.csv, then retry.",
      );
    }
    const prepared = JSON.parse(readFileSync(inventoryPath, "utf8")) as {
      records: LegacyRecord[];
    };
    imageManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Array<
      Record<string, unknown>
    >;
    const preparedSummary = existsSync(join(OUTPUT, "run-summary.json"))
      ? (JSON.parse(readFileSync(join(OUTPUT, "run-summary.json"), "utf8")) as {
          mode?: string;
        })
      : {};
    if (preparedSummary.mode !== "prepare" || !imageManifest.length)
      throw new Error(
        "Apply requires a non-empty prepare run. Run npm run migrate:legacy:prepare, review audit.csv, then retry.",
      );
    result = { records: prepared.records, crawlWarnings: [], pages: [] };
  } else {
    result = await crawl();
    if (mode === "prepare") {
      imageManifest = await prepareImages(result.records);
      // A record may look publishable in HTML but have every source image fail
      // validation/download. Keep it private until an operator resolves the audit.
      result.records = result.records.map((record) => {
        const vehicleId = `legacy_${createHash("sha256").update(record.legacyUrl).digest("hex").slice(0, 24)}`;
        const related = imageManifest.filter(
          (item) => item.vehicleId === vehicleId,
        );
        const successes = related.filter((item) => item.ok === true).length;
        const failures = related.length - successes;
        if (failures > 0)
          record = {
            ...record,
            warnings: [
              ...record.warnings,
              `${failures} image download/validation failure(s)`,
            ],
          };
        if (record.status === "available" && successes === 0)
          record = {
            ...record,
            status: "draft",
            warnings: [...record.warnings, "no successfully prepared image"],
          };
        return record;
      });
    }
  }
  if (mode !== "apply")
    writeOutputs(result.records, { ...result, imageManifest, mode });
  console.log(
    `Legacy crawl complete: ${result.records.length} records (${result.records.filter((record) => record.status === "available").length} available, ${result.records.filter((record) => record.status === "draft").length} draft).`,
  );
  console.log(`Outputs written to ${OUTPUT}`);
  if (result.crawlWarnings.length)
    console.warn(
      `${result.crawlWarnings.length} crawl warning(s) recorded in run-summary.json`,
    );
  if (result.records.length === 0 && result.crawlWarnings.length > 0) {
    console.error(
      "No legacy records were imported because the source crawl failed; review crawlWarnings and retry before applying.",
    );
    process.exitCode = 1;
    return;
  }
  if (mode === "apply") {
    if (process.env.CI !== "true" && !process.argv.includes("--yes"))
      throw new Error(
        "Apply is protected. Review migration/output/audit.csv, then rerun with --yes or CI=true.",
      );
    const database = process.env.CLOUDFLARE_D1_NAME ?? "yc-auto-prod";
    const sqlPath = join(OUTPUT, "migration.sql");
    const manifest = imageManifest.length
      ? imageManifest
      : existsSync(join(OUTPUT, "images-manifest.json"))
        ? (JSON.parse(
            readFileSync(join(OUTPUT, "images-manifest.json"), "utf8"),
          ) as Array<Record<string, unknown>>)
        : [];
    const bucket = process.env.CLOUDFLARE_R2_BUCKET ?? "yc-auto-vehicle-images";
    const uploadedKeys = new Set<string>();
    console.log(
      `Uploading and verifying ${manifest.filter((entry) => entry.ok === true).length} prepared R2 image(s)…`,
    );
    for (const item of manifest.filter((entry) => entry.ok === true)) {
      const localPath = resolve(ROOT, String(item.localPath));
      const key = String(item.key);
      if (uploadedKeys.has(key)) continue;
      uploadedKeys.add(key);
      execFileSync(
        "npx",
        [
          "wrangler",
          "r2",
          "object",
          "put",
          `${bucket}/${key}`,
          "--file",
          localPath,
          "--content-type",
          String(item.contentType),
        ],
        { cwd: ROOT, stdio: "inherit" },
      );
    }
    console.log(`Applying D1 upserts to ${database}…`);
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "execute",
        database,
        "--remote",
        "--env",
        "production",
        "--file",
        sqlPath,
      ],
      { cwd: ROOT, stdio: "inherit" },
    );
    console.log(
      "D1 and R2 apply complete. Run migrate:legacy:verify after checking counts.",
    );
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
