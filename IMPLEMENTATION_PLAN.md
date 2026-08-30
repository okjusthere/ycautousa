# YC Auto implementation plan

## Delivery checklist

- [ ] Scaffold a strict TypeScript React Router/Cloudflare Workers app with Vite and Wrangler.
- [ ] Add typed D1 schema, migrations, repositories, and seedable local development data.
- [ ] Build the public YC Auto site: responsive home, inventory search, vehicle details, contact/about/legal, SEO, sitemap, robots, and legacy redirects.
- [ ] Build the protected admin area: dashboard, vehicle CRUD, status changes, image workflow, leads, settings, and audit log.
- [ ] Add server-side Access identity checks, admin allowlisting, same-origin protection, Zod validation, Turnstile verification, rate limits, and security headers.
- [ ] Add server-side NHTSA vPIC VIN Smart Fill with D1 caching and graceful fallback.
- [ ] Add private R2 media routes with validation, ordering, cover selection, and Images transformation fallback.
- [ ] Implement idempotent legacy crawler/parser/prepare/apply/verify commands and generate migration artifacts.
- [ ] Add unit, integration, and Playwright E2E coverage plus formatting, lint, typecheck, build, and production verification scripts.
- [ ] Write Cloudflare setup, migration, cutover, admin, operations, and security documentation.
- [ ] Run all checks, fix failures, and record exact results in `FINAL_STATUS.md`.

## Architecture decisions

- One React Router application runs in a Cloudflare Worker with Workers Assets; server loaders/actions are represented by a small route/API adapter so the same code runs in local dev and Wrangler.
- D1 access is isolated behind prepared-statement repository functions. R2 is private and media is streamed through `/media/*` with a strict key and width allowlist.
- Cloudflare Access is the production authentication boundary; the Worker verifies `CF-Access-Authenticated-User-Email` (and JWT context when available) against `ADMIN_EMAILS` for defense in depth. Local development uses an explicit `DEV_ADMIN_EMAIL` only when `NODE_ENV` is not production.
- Public lead capture always persists to D1 before attempting optional Cloudflare Email Service delivery. Turnstile is verified through a dependency-injected server adapter and can use test keys locally.
- NHTSA vPIC is the only external API. Its normalized, vehicle-only response is cached in D1 and never blocks CRUD or publishing.
- The UI uses a warm editorial/industrial dealer aesthetic: ink black, bone white, signal red, and amber accents; typography is repository-owned via CSS fallbacks with no remote font dependency.

## Verification order

1. `npm run format`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test`
5. `npm run test:e2e`
6. `npm run build`
7. `npm run verify:prod` (requires a deployed URL; local mode validates configuration and reports missing credentials)
