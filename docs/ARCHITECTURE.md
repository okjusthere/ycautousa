# Architecture

## Runtime

The specification names React Router v8; at implementation time the public npm registry exposes React Router 7 as the latest stable release (7.18.x), so this project uses its compatible declarative routing APIs. The route/data boundaries are kept framework-neutral so the v8 framework adapter can be adopted when it is released without changing the Worker or D1 contracts.

One React/Vite application is bundled into one Cloudflare Worker (`yc-auto-web`). Workers Assets serves the hashed client bundle. The Worker handles JSON APIs, redirects, bilingual sitemap/robots metadata, and private media. English public routes remain unprefixed and their Chinese equivalents use `/zh/*`; centralized copy and locale-aware links keep the same page and query string during language switches. Tailwind CSS is wired through the Vite plugin for repository-owned utility composition; the design system’s calibrated tokens and responsive components live in `src/styles/global.css`.

| Concern                  | Cloudflare component                 | Code                                     |
| ------------------------ | ------------------------------------ | ---------------------------------------- |
| Relational data          | D1 `yc-auto-prod`                    | `lib/db.ts`, `migrations/`               |
| Original photos          | Private R2 `yc-auto-vehicle-images`  | `workers/media.ts`                       |
| Resize/format            | Images binding (optional locally)    | `workers/media.ts`                       |
| Admin auth               | Access + Worker allowlist            | `workers/security.ts`                    |
| Form abuse               | Turnstile Siteverify                 | `workers/turnstile.ts`                   |
| Lead notification        | Email Service binding                | `workers/email.ts`                       |
| Aggregate traffic        | Cloudflare Web Analytics (dashboard) | first-party `/api/track` for conversions |
| Optional VIN convenience | NHTSA vPIC (only external API)       | `lib/vin.ts`                             |

## Request flow

Public requests are served by the SPA, while `/api/*`, `/media/*`, `sitemap.xml`, `robots.txt`, and legacy paths are handled in the Worker. Mutable APIs return `no-store`; immutable R2 keys return long-lived cache headers. Public vehicle queries use prepared D1 statements and only expose available, pending, and sold records. Draft/hidden records are excluded from public APIs and sitemap.

Admin mutations pass pinned Cloudflare Access JWT/JWKS validation (issuer, AUD, and time claims), exact email allowlisting, same-origin validation, body limits, and Zod parsing before D1 writes. Each material mutation adds an `audit_logs` row. Vehicle and image deletion is soft/deferred in the normal UI.

Lead flow is `validate → Siteverify Turnstile → D1 insert → optional email → email_status update`. Trade/Sell requests use the same guarded flow and store VIN, mileage, and WeChat in `details_json`, while the common contact fields remain queryable columns. An email outage cannot lose a lead. IP addresses are never stored; an optional salted SHA-256 hash is used for abuse correlation.

## Local mode

The Cloudflare Vite plugin provides local Worker bindings. `npm run db:migrate:local` initializes D1, and `npm run db:seed:local` adds clearly marked sample rows. Local admin identity is explicit in `wrangler.jsonc`; production has no authentication bypass. `src/api.ts` only falls back to demo values on localhost, never on a deployed origin.
