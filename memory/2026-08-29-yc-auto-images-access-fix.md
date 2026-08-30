# Debug report: Images and Cloudflare Access

Date: 2026-08-29

## Symptom

The media route could silently serve original R2 images when the Cloudflare Images transform call drifted from the binding API. Production admin authorization only decoded the Access JWT payload and did not verify its signature or application audience.

## Root cause

The media adapter previously used a hand-written Images binding signature, which allowed a bare format value and treated `output()` as a response. The Cloudflare Workers API requires an `image/*` output format, returns a transformation result, and exposes the response through `.response()`.

The Access guard was synchronous, so it could not retrieve the team's rotating JWKS. It preferred the forwarded email header and only decoded the JWT payload, meaning a forged assertion could pass if the edge policy was misconfigured.

## Fix

- `workers/env.ts` now derives the Images binding shape from the official `ImagesBinding` type.
- `workers/media.ts` requests `image/webp`/`image/avif`/`image/jpeg`, calls `.response()`, and keeps the safe original fallback for outages.
- `workers/security.ts` now verifies RS256 against the pinned `ACCESS_TEAM_DOMAIN` JWKS, checks `ACCESS_AUD_TAG`, issuer, expiration, not-before/issued-at windows, and caches keys briefly with a rotation refresh.
- Production identity comes only from the verified JWT; the direct identity header remains development-only.
- `workers/app.ts` passes the request fetch implementation through the async admin guard for testable JWKS retrieval.
- `wrangler.jsonc`, deploy preflight, and Cloudflare runbooks now require the Access team domain and AUD tag.

## Evidence

- Media regression test asserts the Images binding receives `{ format: "image/webp", quality }`, the approved width, and that the transformed response body is returned.
- Security tests cover valid signed JWTs, JWKS caching, payload tampering despite a direct identity header, and an incorrect application audience.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run test` (25 tests), `npm run test:e2e` (10 tests), `npm run build`, production `wrangler deploy --dry-run`, and offline migration verification passed.
- The current environment could not re-run `npm audit` because the npm registry endpoint presented an untrusted TLS certificate; the prior recorded audit result was zero production vulnerabilities.

## Status

DONE_WITH_CONCERNS: code and local verification are complete; a real Cloudflare preview smoke test is still required for the account's Images binding and Access policy/JWKS configuration.
