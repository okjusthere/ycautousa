# YC Auto delivery status

Updated: 2026-09-19

## 1. Implemented

- Responsive bilingual YC Auto USA public showroom: light editorial home, English and `/zh/*` routes, live Available-only make/year facets, inventory filters/sort/pagination, vehicle detail gallery, Trade/Sell form, shared Contact/Trade map, about, legal pages, localized sitemap/canonical/hreflang metadata, AutoDealer/Car JSON-LD, and legacy 301 redirects.
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
npm run test           PASS — 10 files, 39 tests
npm run test:e2e       PASS — 36 tests across Chromium + mobile
npm run build          PASS — client + Worker production bundle
npm audit (prod)       PASS — 0 vulnerabilities
npm run deploy         PASS — Worker and assets deployed to Cloudflare
verify:prod            PASS — public pages, six vehicle pages, four JSON APIs, media, redirects, sitemap, robots, and Cloudflare Access protection
```

`npm ci --ignore-scripts` was also run successfully from the lockfile before the final verification pass.

The UI was also visually smoke-checked with Playwright screenshots at desktop and phone widths. Local D1 migrations and seed commands completed successfully.

After domain cutover, an explicit Assets routing list containing only `/` and `/index.html` caused API requests to return the SPA HTML shell with status 200, leaving the React page blank. The routing now runs the Worker for all application paths and excludes only static assets. The live Chinese homepage, 35-vehicle inventory API, and transformed images were verified after the fix. Production verification now checks JSON content types and response structures, page canonical/language metadata, and protected admin API responses. Three regression tests reject the incident's HTML-200 response, invalid JSON structures, and missing page canonical metadata. Formatting, lint, TypeScript, all 39 tests, and the enhanced live checks passed for this repair; earlier E2E results above were not rerun for this configuration-only fix.

Contact now combines company information, Our Story, a nine-person bilingual staff directory, the map, and the existing contact form. Staff photos and details come from the supplied Meet Our Staff document. Phone/email links and WeChat ID reveal/copy are implemented; unspecified contact details remain disabled, not invented. The old About URLs permanently redirect to Contact's story section. Maintenance and missing-field notes are in `docs/staff-directory.md`.

The homepage now defaults to Chinese for first-time browser visits, remembers an explicit language choice, and provides a visible language switch on desktop and mobile. The hero heading is smaller, both primary action labels are larger, and migration `0005_homepage_intro.sql` updates the live English/Chinese hero subtitle. Layouts were checked at 1440px, 390px, and 320px without horizontal overflow.

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
Production URL: https://www.ycautousa.com
Redirecting hosts: ycautousa.com, yc-auto-web.okjusthere.workers.dev
Turnstile: production Managed widget for the temporary URL, apex, and www hostnames
Access app: yc-auto-admin (`/admin*` and `/api/admin*` on www and the temporary hostname)
Access login: email one-time PIN; 24-hour session
Access policy: only sophie@youxuancars.com and okjusthere@gmail.com
Email sender: leads@ycautousa.com (verified Email Sending domain)
Email destination: sophie@youxuancars.com (verified destination)
Email binding: EMAIL, restricted to the sender and destination above
Secrets: TURNSTILE_SECRET_KEY and a random IP_HASH_SALT are stored in Cloudflare, not git
Deployment history: Cloudflare Workers dashboard for yc-auto-web
```

The public site is now deployed at `https://www.ycautousa.com`. The apex hostname redirects to www with the path and query preserved. Both custom-domain bindings and the production canonical URL are managed in `wrangler.jsonc`, so subsequent main-branch deployments retain them. The existing Access application's AUD and exact two-email policy are preserved, with www admin paths added. Turnstile already permits both production hostnames. Remote migration inspection confirmed no pending D1 migrations through `0005_homepage_intro.sql`.

The Cloudflare zone was active with no DNS records immediately before the website deployment. Deployment created the two website bindings; no existing MX/TXT records were deleted or changed. Public-page, vehicle, original-image, sitemap, robots, legacy-redirect, and unauthenticated Access checks passed on the production hostname. The pre-cutover Worker version was `99e301ac-1d83-4617-9f36-0efaca97247c`; reverting its temporary canonical URL also requires retaining the workers.dev route.

On 2026-09-19, Email Sending was enabled for `ycautousa.com` (domain ID `679986f25521404c8cc2d148a1de127f`). Cloudflare added the `cf-bounce` MX/SPF, `cf-bounce._domainkey` DKIM, and `_dmarc` records; no incoming root-domain MX records were added or replaced. Sophie completed destination verification. The production `EMAIL` binding and `EMAIL_FROM` are configured in source, and the database notification recipient matches the verified destination. A single explicitly labeled configuration test was accepted through a real remote Worker email binding, without inserting a customer lead or sending historical notifications. See Email Sending Activity for delivery status. New successful inquiries now attempt a notification after saving the lead; notification errors still leave the lead accessible in admin.

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

1. Complete a real one-time-PIN login with each administrator account, then smoke-test VIN decode, vehicle create/edit, and R2 image upload from the live admin.
2. Review Email Service Activity logs for delivery failures when investigating a missing notification; historical skipped/failed notifications are not automatically resent.
3. Final business email confirmation in Website Settings. The business phone is confirmed as 718-799-0606 for voice calls only; SMS is intentionally disabled. Address and hours are confirmed.

No credentials were fabricated, committed, or printed by the implementation.

## 8. Known limitations

- The production Managed Turnstile widget is configured for the temporary, apex, and www hostnames.
- Cloudflare Access is active on the production www and temporary hostnames, but each administrator still needs to complete one real email-code login on the production domain. Public lead submissions persist in D1 before email notification is attempted.
- React Router v7.18.x is used because v8 is not currently published as a stable npm package.
- Email notifications are limited to the verified Sophie destination. Changing the admin notification recipient also requires verifying that address and updating the production binding. Customer acknowledgement emails and automatic notification retries are not enabled. Live R2 media delivery already passed remote and HTTP checks.
- The live legacy source contains one missing/invalid VIN (`2024 BMW X5`), retained as an audit-visible editable field.
- The migration script accepts legacy originals up to 25 MB; new admin uploads are limited to 12 MB and should be resized before import when practical.
- Local dev emits Cloudflare Vite-plugin certificate warnings in this environment; they do not affect the production bundle.

## 9. Concise production launch checklist

- [x] Replace deployment blockers and run `npm run preflight:deploy`.
- [x] Create/confirm D1, R2, Images binding, and production Turnstile configuration.
- [x] Set deployment secrets without committing them.
- [x] Apply D1 migrations and full legacy migration; review and remotely verify counts/media.
- [x] Deploy the workers.dev preview and verify public pages, inventory, legacy redirects, media, lead persistence, and admin denial.
- [x] Create the Zero Trust Access application, deploy its AUD/team domain, and verify the login redirect and exact two-email policy.
- [ ] Complete a real OTP login for both administrator accounts, then test VIN decode and image upload in the live admin.
- [x] Configure Email Service sender DNS, verify the destination, deploy the restricted email binding, and send an explicitly labeled service test through the real binding without creating a customer lead.
- [x] Inspect and preserve existing DNS state; bind `www` and apex, configure apex 301, and retain the Access allowlist. The zone contained no records before website binding.
- [x] Deploy the workers.dev production preview with `npm run deploy`; verify home, inventory, five vehicle pages, sitemap, robots, and Access redirect.
- [x] After custom-domain cutover, verify public pages, media, old URL 301s, and the Access redirect.
- [x] Submit the production contact form with its real Turnstile challenge, confirm the success message and matching D1 row, then remove the explicitly marked deployment-test lead. This form check preceded Email Service activation; email was tested separately after activation.
- [ ] Keep the old host read-only for seven days, monitor Worker/Email logs, and retain the rollback version and D1 bookmark.
