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

## Private pre-approval requests

- Identity, SSN, address, residence duration and contact details are stored only in `preapproval_applications` as AES-256-GCM ciphertext. A random 96-bit nonce is generated for each application; authenticated additional data binds it to the server-generated lead ID.
- `PREAPPROVAL_KEYS` is a Worker secret containing a versioned 256-bit master keyring. HKDF derives separate encryption and HMAC keys. Neither keys nor application plaintext may appear in source, logs, audit details, ordinary lead columns, email, analytics, URLs, or browser persistent storage.
- Public submission requires validated fields, explicit collection consent, server-verified Turnstile, and the existing request limits. The lead receipt, ciphertext and notification job are one atomic database operation; missing keys fail closed before any write. A keyed fingerprint supports retry deduplication without an offline SSN-guessing oracle.
- Private reads use same-origin POST under Cloudflare Access and the administrator allowlist. A fixed-purpose audit entry must be saved before decryption. Responses use `Cache-Control: no-store`. Lists and dashboards never fetch private payloads.
- The admin UI requests private data only after an explicit action, masks SSN by default, and clears the displayed payload after 60 seconds, on blur/tab hiding, or on unmount. An aborted or stale response cannot reopen the private view. Browser memory clearing is best-effort; authorized users can still inspect a response they have permission to retrieve.
- Confirmed deletion atomically removes the active ciphertext, marks the receipt deleted, and records the administrator. It does not instantly erase historical backups or remove the keyed retry digest. See [pre-approval operations](PREAPPROVAL.md).
