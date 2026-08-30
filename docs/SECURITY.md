# Security notes

- Cloudflare Access protects admin paths, and Worker code re-checks the Access identity against a normalized exact-email allowlist. Production admin requests must arrive on the canonical host with an Access JWT assertion; Access validates the JWT at the edge before forwarding it.
- State-changing admin requests require same-origin headers, prepared D1 statements, body limits, and Zod schemas.
- Turnstile is verified server-side; the local token is accepted only on localhost with non-production configuration.
- Lead/customer IPs are never stored raw. Optional abuse correlation uses a secret-salted SHA-256 hash.
- R2 remains private. Media keys reject traversal, unsupported extensions, and unknown paths; image bytes are signature-checked.
- User descriptions/features are plain text, never arbitrary HTML. Notification HTML escapes all lead values.
- Security headers include CSP, HSTS in production, frame protection, `nosniff`, restrictive referrer policy, and Permissions-Policy.
- Production admin requests require a valid RS256 `CF-Access-Jwt-Assertion`; the Worker pins `ACCESS_TEAM_DOMAIN`, checks `ACCESS_AUD_TAG`, validates time claims, caches the team's JWKS briefly, and then applies the exact email allowlist. The unverified direct identity header is not accepted in production.
- Secrets belong in Wrangler/Cloudflare configuration, never in source, migration output, or logs.

Before production, verify the Access policy is not Everyone, replace all local variables and Access placeholders, set a random IP hash salt, configure a real Turnstile widget/secret, and review `npm audit` output.
