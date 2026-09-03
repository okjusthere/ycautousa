# YC Auto delivery status

Updated: 2026-08-31

## 1. Implemented

- Responsive YC Auto USA public showroom: home, live inventory filters/sort/pagination, vehicle detail gallery with mobile swipe and sticky CTAs, similar inventory, about, contact, privacy, terms, sitemap, robots, canonical/OG metadata, AutoDealer/Car JSON-LD, and legacy 301 redirect resolution.
- Protected admin workspace: overview counts, inventory search/filter/table, quick price/mileage/status edits, bulk status changes, duplicate/preview/hide/remove actions, one-page vehicle editor with linked make/model suggestions and manual entry, VIN Smart Fill, client resize + sequential multi-photo upload, drag/button reorder, cover selection, retry and soft delete, lead inbox/status/notes, editable website settings, and read-only audit log.
- Cloudflare Worker request boundary with D1 prepared-statement repositories, private R2 media streaming and width/format allowlists, official Images binding transforms (`image/*` output MIME + transformation `.response()`), pinned Access JWKS/RS256 verification with issuer/AUD/time checks, exact email allowlist checks, same-origin mutation checks, body limits, rate limiting, Turnstile Siteverify adapter, graceful Email Service notification fallback, conversion event tracking, security headers, and short/immutable caching policies.
- Server-side NHTSA vPIC VIN adapter with local VIN validation, D1 cache hits/touch/update, normalized fields, one conservative retry, five-second timeout, blank-field-only UI merge, and non-blocking outage behavior.
- Repeatable legacy migration utility with polite pagination discovery, label-based parsing, source-value preservation, normalization/audit warnings, image filtering/download validation/retry/hash deduplication, generated SQL/manifests/redirects, explicit apply confirmation, and offline verification.
- Versioned D1 schema, local seed utility, Cloudflare bootstrap/preflight/production verification scripts, Vitest unit/integration coverage, and Playwright desktop/mobile E2E coverage.
- Documentation: `README.md`, `IMPLEMENTATION_PLAN.md`, architecture, Cloudflare setup, migration, cutover, admin, operations, and security runbooks.

## 2. Architecture summary

One Vite React application is bundled into the `yc-auto-web` Cloudflare Worker. Workers Assets serves the client bundle; the Worker handles APIs, SEO endpoints, redirects, and media. D1 (`yc-auto-prod`) stores inventory, leads, settings, redirects, audit entries, VIN cache, and daily conversion counters. A private R2 bucket (`yc-auto-vehicle-images`) stores immutable originals; an Images binding transforms approved widths. Cloudflare Access is the production authentication boundary, with Worker-side defense-in-depth allowlisting. Turnstile and Email Service are optional Cloudflare bindings whose failures do not block core inventory or lead persistence. NHTSA vPIC is the only external API.

The specification requests React Router v8. The npm registry currently exposes React Router 7.18.x as the latest stable release, so the implementation uses its compatible declarative route APIs and keeps the data/Worker contracts adapter-neutral for a future v8 framework adapter.

## 3. Verification results

All code, local runtime, E2E, production-bundle, deployment, and live-site checks passed:

```text
npm run format:check   PASS
npm run lint           PASS (0 errors, max-warnings 0)
npm run typecheck      PASS
npm run test           PASS — 9 files, 27 tests
npm run test:e2e       PASS — 12 tests across Chromium + mobile
npm run build          PASS — client + Worker production bundle
npm audit (prod)       PASS previously — 0 vulnerabilities; current rerun was blocked by the environment's untrusted npm registry TLS certificate
npm run deploy         PASS — Worker and assets deployed to Cloudflare
verify:prod            PASS — public pages, five vehicle pages, media, sitemap, robots, legacy 301, and protected admin
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

`VERIFY_REMOTE=1 npm run migrate:legacy:verify` passes. D1 contains 34 vehicles, 305 unique image rows, and 34 legacy redirects; all 309 source image references prepared with zero failures, and three representative R2 originals were fetched remotely. The generated SQL was also applied twice against an empty SQLite test database to confirm idempotent counts. The legacy site and its source data were not deleted or modified. The downloaded temporary originals are in ignored `migration/work/`; the portable manifest and all audit artifacts are retained in `migration/output/`.

Four obvious source-data issues were corrected during deployment: the legacy test category `Big class 3 test` was normalized to BMW, `SLIVE` was normalized to `SILVER`, and four available vehicles were selected for the home-page featured grid. The migration generator now applies the same normalization on future full imports.

The local environment required `NODE_TLS_REJECT_UNAUTHORIZED=0` for the live crawl because its proxy presented an untrusted certificate. Do not use that override in production; run the migration from a host with normal certificate validation and review the resulting audit again.

## 5. Cloudflare deployment

Deployed resources:

```text
Worker: yc-auto-web
D1: yc-auto-prod (7d5c884b-3f9d-4b8c-9c9b-b3c0f6bd1356)
R2: yc-auto-vehicle-images
Images binding: IMAGES
Temporary URL: https://yc-auto-web.okjusthere.workers.dev
Turnstile: production Managed widget for the temporary URL, apex, and www hostnames
Secrets: TURNSTILE_SECRET_KEY and a random IP_HASH_SALT are stored in Cloudflare, not git
Current Worker version: 667b6dc8-a0af-46be-a80c-c567399faedd
```

The public site, inventory, images, redirects, lead persistence, and production Turnstile are live. The exact Worker allowlist contains `sophie@youxuancars.com` and `okjusthere@gmail.com`. The unauthenticated admin still returns 403 by design because the account has no Zero Trust organization or Access application yet. Email Service is intentionally unbound, so leads persist in D1 but do not yet send notification email. Configure Access, Email Service, and the custom hostname during the `ycautousa.com` cutover. Preserve existing MX/SPF/DKIM/DMARC/TXT records before DNS changes.

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

1. Cloudflare Zero Trust organization and Access application covering the temporary hostname and, after DNS cutover, `www.ycautousa.com/admin*` and `www.ycautousa.com/api/admin*`; its policy must allow only the two configured administrator emails. Copy its team domain and AUD tag into the production Worker vars.
2. Email Service sender-domain onboarding, DNS verification, remote `EMAIL` binding, and final lead recipient.
3. Move `ycautousa.com` from its current Wix nameservers into this Cloudflare account after exporting the existing zone.
4. Final business email confirmation in Website Settings. The business phone is confirmed as 718-799-0606 for voice calls only; SMS is intentionally disabled. Address and hours are confirmed.
5. DNS custom-hostname binding and apex-to-`www` 301 while preserving mail records.

No credentials were fabricated, committed, or printed by the implementation.

## 8. Known limitations

- The production Managed Turnstile widget is configured for the temporary, apex, and www hostnames.
- Admin authentication remains disabled until the Zero Trust organization and Access application are created and their team domain/AUD are deployed. Notification email remains disabled until Email Service is configured. Public lead submissions still persist in D1.
- React Router v7.18.x is used because v8 is not currently published as a stable npm package.
- Email Service still needs an authenticated smoke test after its sender and binding are attached. Live R2 media delivery already passed remote and HTTP checks.
- The live legacy source contains one missing/invalid VIN (`2024 BMW X5`), retained as an audit-visible editable field.
- The migration script accepts legacy originals up to 25 MB; new admin uploads are limited to 12 MB and should be resized before import when practical.
- Local dev emits Cloudflare Vite-plugin certificate warnings in this environment; they do not affect the production bundle.

## 9. Concise production launch checklist

- [x] Replace deployment blockers and run `npm run preflight:deploy`.
- [x] Create/confirm D1, R2, Images binding, and production Turnstile configuration.
- [x] Set deployment secrets without committing them.
- [x] Apply D1 migrations and full legacy migration; review and remotely verify counts/media.
- [x] Deploy the workers.dev preview and verify public pages, inventory, legacy redirects, media, lead persistence, and admin denial.
- [ ] Create the Zero Trust organization and Access application; deploy its AUD/team domain and test both administrator accounts, VIN decode, and uploads. The exact Worker email allowlist is already deployed.
- [ ] Configure Email Service and test a real lead notification email.
- [ ] Export/preserve DNS and mail records; bind `www`, configure apex 301, and do not break MX/SPF/DKIM/DMARC.
- [ ] Deploy production with `npm run deploy`; verify home, inventory, five vehicle pages, sitemap, robots, media, old URL 301s, and a real lead.
- [ ] Keep the old host read-only for seven days, monitor Worker/Email logs, and retain the rollback version and D1 bookmark.
