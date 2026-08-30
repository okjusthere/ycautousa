#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const configPath = resolve(root, "wrangler.jsonc");
const config = readFileSync(configPath, "utf8");
const dry = process.argv.includes("--dry-run");
const patchConfig = process.argv.includes("--patch");
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

function run(args: string[]): string {
  console.log(`$ npx wrangler ${args.join(" ")}`);
  if (dry) return "";
  return execFileSync("npx", ["wrangler", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
}

function listResources(args: string[]): unknown[] {
  if (dry) return [];
  try {
    const output = run(args);
    const parsed = JSON.parse(output) as unknown;
    return Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as Record<string, unknown>).result)
        ? ((parsed as Record<string, unknown>).result as unknown[])
        : [];
  } catch {
    return [];
  }
}

function resourceExists(args: string[], name: string): boolean {
  if (dry) return false;
  return listResources(args).some(
    (row) =>
      row &&
      typeof row === "object" &&
      Object.values(row as Record<string, unknown>).some(
        (value) => value === name,
      ),
  );
}

if (!accountId && !dry) {
  console.error(
    "CLOUDFLARE_ACCOUNT_ID is required. Run `npx wrangler login` first, then export the account id.",
  );
  process.exit(1);
}

let d1Output = "";
const d1Resources = listResources(["d1", "list", "--json"]);
const existingD1 = d1Resources.find(
  (row) =>
    row &&
    typeof row === "object" &&
    Object.values(row as Record<string, unknown>).some(
      (value) => value === "yc-auto-prod",
    ),
) as Record<string, unknown> | undefined;
if (existingD1)
  console.log("D1 yc-auto-prod already exists; leaving it unchanged.");
else d1Output = run(["d1", "create", "yc-auto-prod"]);
if (
  resourceExists(["r2", "bucket", "list", "--json"], "yc-auto-vehicle-images")
)
  console.log(
    "R2 yc-auto-vehicle-images already exists; leaving it unchanged.",
  );
else run(["r2", "bucket", "create", "yc-auto-vehicle-images"]);
console.log(
  "\nCloudflare resource bootstrap commands completed (or were printed in dry-run mode).",
);
const databaseId =
  d1Output.match(/database_id["']?\s*[:=]\s*["']?([a-zA-Z0-9-]+)/i)?.[1] ??
  (existingD1 &&
    (Object.entries(existingD1).find(([key]) =>
      /database.?id/i.test(key),
    )?.[1] as string | undefined));
if (patchConfig && databaseId && !dry) {
  writeFileSync(
    configPath,
    config.replaceAll("REPLACE_WITH_D1_DATABASE_ID", databaseId),
  );
  console.log(`Patched wrangler.jsonc with D1 database id ${databaseId}.`);
} else
  console.log(
    "If D1 output included a database_id, copy it into wrangler.jsonc in place of REPLACE_WITH_D1_DATABASE_ID (or rerun with --patch).",
  );
console.log(
  "Create an Images binding, Turnstile widget, Access application, and Email Service sender domain in the dashboard; exact steps are in docs/CLOUDFLARE_SETUP.md.",
);

if (config.includes("REPLACE_WITH_D1_DATABASE_ID"))
  console.warn(
    "wrangler.jsonc still contains a placeholder D1 id; deployment will fail until it is replaced.",
  );
if (!existsSync(resolve(root, ".dev.vars")))
  console.log(
    "Tip: copy .dev.vars.example to .dev.vars for local admin/VIN testing (never commit it).",
  );
// Keep this script intentionally non-destructive: it never deletes resources.
