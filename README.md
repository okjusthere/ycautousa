# YC Auto USA — Cloudflare dealer platform

YC Auto is a small, fast used-car showroom and inventory workspace for Your Choice Auto Group LLC in Flushing, New York. The repository contains the public React storefront, a Cloudflare Worker API, D1 migrations, private R2 media handling, Cloudflare Access defense-in-depth checks, Turnstile-protected lead capture, NHTSA vPIC VIN Smart Fill, and a repeatable legacy inventory migration utility.

## Quick start

Requirements: Node.js 22+, npm, and (for Cloudflare operations) Wrangler authentication.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run db:seed:local
npm run dev
```

Open <http://127.0.0.1:5173>. Local demo identity is `admin@example.com`; it is only used when the request is local and `DEV_ADMIN_EMAIL` is configured. Never copy local values to production.

## Quality commands

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run build
```

The Playwright suite starts a local D1-backed Worker session and covers public navigation, filtering, lead capture, admin editing, and mobile navigation.

## Cloudflare deployment

1. Authenticate Wrangler with `npx wrangler login`.
2. Run `npm run bootstrap:cloudflare` (or follow the idempotent commands in [Cloudflare setup](docs/CLOUDFLARE_SETUP.md)).
3. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.jsonc` with the D1 id returned by Wrangler.
4. Set production variables and secrets through Wrangler; do not commit them.
5. Apply migrations with `npm run db:migrate:remote`, build, and deploy with `npm run deploy`.

Cloudflare Access must protect `/admin*` and `/api/admin*`; the Worker verifies the Access JWT against the configured team JWKS and AUD tag, then checks the identity against the exact `ADMIN_EMAILS` allowlist. The public forms require a real Turnstile widget and server-side Siteverify secret in production.

See:

- [Architecture](docs/ARCHITECTURE.md)
- [Cloudflare setup](docs/CLOUDFLARE_SETUP.md)
- [Migration runbook](docs/MIGRATION.md)
- [DNS cutover](docs/CUTOVER.md)
- [Admin guide](docs/ADMIN_GUIDE.md)
- [Operations](docs/OPERATIONS.md)
- [Security](docs/SECURITY.md)

## Repository map

`src/` contains the React routes and design system; `workers/` contains the Worker request router and Cloudflare adapters; `lib/` contains typed data access, validation, VIN normalization, and migration parsing; `migrations/` contains versioned D1 SQL; `scripts/` contains Cloudflare bootstrap, migration, seed, and verification commands; `tests/` and `e2e/` contain automated coverage.

## Legacy migration

The migration utility is read-only until `apply` is explicitly confirmed:

```bash
npm run migrate:legacy:dry
npm run migrate:legacy:prepare
# review migration/output/audit.csv and manifests
npm run migrate:legacy:apply -- --yes
npm run migrate:legacy:verify
```

The source website and its files are never deleted by these commands. A full beta pass and a final delta pass are documented in [Migration](docs/MIGRATION.md).
