# YC Auto delivery status

Updated: 2026-08-29

## 1. Implemented

- Responsive YC Auto USA public showroom: home, live inventory filters/sort/pagination, vehicle detail gallery with mobile swipe and sticky CTAs, similar inventory, about, contact, privacy, terms, sitemap, robots, canonical/OG metadata, AutoDealer/Car JSON-LD, and legacy 301 redirect resolution.
- Protected admin workspace: overview counts, inventory search/filter/table, quick price/mileage/status edits, bulk status changes, duplicate/preview/hide actions, one-page vehicle editor, VIN Smart Fill, client resize + sequential multi-photo upload, drag/button reorder, cover selection, retry and soft delete, lead inbox/status/notes, editable website settings, and read-only audit log.
- Cloudflare Worker request boundary with D1 prepared-statement repositories, private R2 media streaming and width/format allowlists, official Images binding transforms (`image/*` output MIME + transformation `.response()`), pinned Access JWKS/RS256 verification with issuer/AUD/time checks, exact email allowlist checks, same-origin mutation checks, body limits, rate limiting, Turnstile Siteverify adapter, graceful Email Service notification fallback, conversion event tracking, security headers, and short/immutable caching policies.
- Server-side NHTSA vPIC VIN adapter with local VIN validation, D1 cache hits/touch/update, normalized fields, one conservative retry, five-second timeout, blank-field-only UI merge, and non-blocking outage behavior.
- Repeatable legacy migration utility with polite pagination discovery, label-based parsing, source-value preservation, normalization/audit warnings, image filtering/download validation/retry/hash deduplication, generated SQL/manifests/redirects, explicit apply confirmation, and offline verification.
- Versioned D1 schema, local seed utility, Cloudflare bootstrap/preflight/production verification scripts, Vitest unit/integration coverage, and Playwright desktop/mobile E2E coverage.
- Documentation: `README.md`, `IMPLEMENTATION_PLAN.md`, architecture, Cloudflare setup, migration, cutover, admin, operations, and security runbooks.

## 2. Architecture summary

One Vite React application is bundled into the `yc-auto-web` Cloudflare Worker. Workers Assets serves the client bundle; the Worker handles APIs, SEO endpoints, redirects, and media. D1 (`yc-auto-prod`) stores inventory, leads, settings, redirects, audit entries, VIN cache, and daily conversion counters. A private R2 bucket (`yc-auto-vehicle-images`) stores immutable originals; an Images binding transforms approved widths. Cloudflare Access is the production authentication boundary, with Worker-side defense-in-depth allowlisting. Turnstile and Email Service are optional Cloudflare bindings whose failures do not block core inventory or lead persistence. NHTSA vPIC is the only external API.

The specification requests React Router v8. The npm registry currently exposes React Router 7.18.x as the latest stable release, so the implementation uses its compatible declarative route APIs and keeps the data/Worker contracts adapter-neutral for a future v8 framework adapter.

## 3. Verification results

All code, local runtime, E2E, and production-bundle checks passed:

```text
npm run format:check   PASS
npm run lint           PASS (0 errors, max-warnings 0)
npm run typecheck      PASS
npm run test           PASS — 9 files, 25 tests
npm run test:e2e       PASS — 10 tests across Chromium + mobile
npm run build          PASS — client + Worker production bundle
npm audit (prod)       PASS previously — 0 vulnerabilities; current rerun was blocked by the environment's untrusted npm registry TLS certificate
npx wrangler deploy --dry-run  PASS — bindings/config compile (no upload)
```

`npm ci --ignore-scripts` was also run successfully from the lockfile before the final verification pass.

The UI was also visually smoke-checked with Playwright screenshots at desktop and phone widths. Local D1 migrations and seed commands completed successfully.

## 4. Migration status

The latest live-source `prepare` run is represented in `migration/output/`:

- 34 legacy vehicle records discovered;
- 34 records currently eligible for `available` based on parsed title/price/mileage/images;
- 309 source gallery image references;
- 305 unique prepared image objects after four same-vehicle SHA-256 duplicates;
- 0 image download/validation failures in the latest prepare;
- 34 redirect mappings;
- one record has a missing/invalid VIN warning (`2024 BMW X5`), which is intentionally not a publication blocker.

`npm run migrate:legacy:verify` passes offline artifact checks. The generated SQL was applied twice against an empty SQLite test database to confirm idempotent counts (34 vehicles, 305 image rows, 34 redirects). No remote D1/R2 apply was performed because this repository has no Cloudflare credentials or account access. The legacy site and its source data were not deleted or modified. The downloaded temporary originals are in ignored `migration/work/`; the portable manifest and all audit artifacts are retained in `migration/output/`.

The local environment required `NODE_TLS_REJECT_UNAUTHORIZED=0` for the live crawl because its proxy presented an untrusted certificate. Do not use that override in production; run the migration from a host with normal certificate validation and review the resulting audit again.

## 5. Cloudflare resources/configuration required

Preferred resources already represented in `wrangler.jsonc`:

```text
Worker: yc-auto-web
D1: yc-auto-prod
R2: yc-auto-vehicle-images
Images binding: IMAGES
Email binding: EMAIL (production remote binding)
Turnstile: production widget/site key still required
Access application: yc-auto-admin still required
Custom hostname: www.ycautousa.com still required
```

Replace the production placeholders in `wrangler.jsonc` for the D1 id, Turnstile site key, exact administrator email allowlist, Access team domain, and Access application AUD tag. Set `IP_HASH_SALT` and `TURNSTILE_SECRET_KEY` as production secrets. Configure/onboard the Email Service sender domain, verify the destination, enable Cloudflare Web Analytics, and preserve existing MX/SPF/DKIM/DMARC/TXT records before DNS changes. Web Analytics is a Cloudflare dashboard capability, not a code-level third-party dependency.

## 6. Exact commands to run

From the repository root:

```bash
npm install
npx wrangler login
export CLOUDFLARE_ACCOUNT_ID="<your-account-id>"
npm run bootstrap:cloudflare -- --patch
# review wrangler.jsonc and replace TURNSTILE_SITE_KEY / ADMIN_EMAILS / ACCESS_TEAM_DOMAIN / ACCESS_AUD_TAG
npx wrangler secret put TURNSTILE_SECRET_KEY --env production
npx wrangler secret put IP_HASH_SALT --env production
npm run db:migrate:remote

# beta/full migration: review before applying
npm run migrate:legacy:dry
npm run migrate:legacy:prepare
# inspect migration/output/audit.csv and manifests
npm run migrate:legacy:apply -- --yes
VERIFY_REMOTE=1 npm run migrate:legacy:verify

# production build/deploy (preflight blocks unresolved placeholders)
npm run deploy
APP_ORIGIN=https://<preview-or-production-origin> npm run verify:prod
```

Immediately before DNS cutover, run a fresh `dry` + `prepare` delta pass, review it, apply it, and verify again. Use `LEGACY_PATH` and `IMAGE_PATH` with `verify:prod` for known redirect/media smoke checks.

## 7. Credentials/dashboard actions still required

1. Wrangler login and Cloudflare account/zone permissions.
2. D1 database id and R2 bucket creation/confirmation.
3. Production Turnstile widget for `www.ycautousa.com` and its secret.
4. Cloudflare Access application covering `www.ycautousa.com/admin*` and `www.ycautousa.com/api/admin*`, with only the exact administrator email(s) allowed; copy its team domain and AUD tag into the production Worker vars.
5. Email Service sender-domain onboarding, DNS verification, remote `EMAIL` binding, and final lead recipient.
6. Final business phone/SMS/email/address/hours confirmation in Website Settings.
7. DNS custom-hostname binding and apex-to-`www` 301 while preserving mail records.

No credentials were fabricated, committed, or printed by the implementation.

## 8. Known limitations

- No Cloudflare preview or production deployment was attempted; account access is intentionally a manual launch step.
- React Router v7.18.x is used because v8 is not currently published as a stable npm package.
- Production Email Service and Images behavior needs one authenticated Cloudflare smoke test after bindings are attached. Local media tests use in-memory R2/Images-compatible fakes; the Images regression test asserts the official output MIME and response path.
- The live legacy source contains at least one missing VIN and may contain source values such as `SLIVE`; these are preserved as audit-visible editable data rather than guessed.
- The migration script accepts legacy originals up to 25 MB; new admin uploads are limited to 12 MB and should be resized before import when practical.
- Local dev emits Cloudflare Vite-plugin certificate warnings in this environment; they do not affect the production bundle.

## 9. Concise production launch checklist

- [ ] Replace all `wrangler.jsonc` production placeholders, including Access team domain/AUD; run `npm run preflight:deploy`.
- [ ] Create/confirm D1, R2, Images, Turnstile, Email Service, and Access resources.
- [ ] Set production secrets and exact Access email allowlist.
- [ ] Apply D1 migrations and run full + final delta migration; review `audit.csv`.
- [ ] Deploy preview, run `verify:prod`, test admin Access, VIN decode, image upload/transform, lead persistence, and notification email.
- [ ] Export/preserve DNS and mail records; bind `www`, configure apex 301, and do not break MX/SPF/DKIM/DMARC.
- [ ] Deploy production with `npm run deploy`; verify home, inventory, five vehicle pages, sitemap, robots, media, old URL 301s, and a real lead.
- [ ] Keep the old host read-only for seven days, monitor Worker/Email logs, and retain the rollback version and D1 bookmark.
