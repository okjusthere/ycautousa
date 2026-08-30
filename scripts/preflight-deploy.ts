#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const config = readFileSync(
  resolve(new URL("..", import.meta.url).pathname, "wrangler.jsonc"),
  "utf8",
);
const missing: string[] = [];
for (const marker of [
  "REPLACE_WITH_D1_DATABASE_ID",
  "REPLACE_WITH_TURNSTILE_SITE_KEY",
  "REPLACE_WITH_ADMIN_EMAILS",
  "REPLACE_WITH_ACCESS_TEAM_DOMAIN",
  "REPLACE_WITH_ACCESS_AUD_TAG",
])
  if (config.includes(marker)) missing.push(marker);
if (missing.length) {
  console.error(
    "Production deploy is blocked until wrangler.jsonc placeholders are replaced:",
  );
  for (const marker of missing) console.error(`- ${marker}`);
  console.error(
    "Create resources with npm run bootstrap:cloudflare, then configure the production vars documented in docs/CLOUDFLARE_SETUP.md.",
  );
  process.exit(1);
}
console.log(
  "Production configuration contains no known placeholders. Wrangler authentication and account permissions are checked by the deploy command.",
);
