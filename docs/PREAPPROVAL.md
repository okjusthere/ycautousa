# Pre-approval operations

## Intake and review

The vehicle calculator opens a pre-approval request form with full name, phone, email, SSN, street/unit/city/state/ZIP, residence years/months and collection consent. An optional financing selection is recomputed on the server. The form collects a request for dealership follow-up; it does not query a credit bureau, send an application to a lender, or approve a loan.

The ordinary lead uses a placeholder name with null phone, email and message. Its metadata contains only receipt/deletion timestamps and status, plus an optional financing snapshot. No free-text message is accepted by this form. Attribution supplied by the client is discarded; the source is a server-generated vehicle link. Emails contain only a new-request receipt, vehicle, time and protected admin link.

Staff open the lead, select a review purpose and click **View full application (including SSN)**. This action is audited before decryption. The SSN is initially masked and can be shown separately. The view clears after 60 seconds or when the browser loses focus. Do not copy private details into ordinary admin notes, email or chat.

**Delete private application data** requires confirmation and deletes the active ciphertext, leaving a non-sensitive lead receipt and access audit. Historical D1 backups / Time Travel follow their own retention. Do not promise immediate erasure of all backups. No automatic deletion period is assumed by this feature; the dealership must define its retention process and carry out appropriate deletions.

## Keys and deployment

1. Apply `migrations/0008_secure_preapproval.sql` before deploying the feature.
2. Provision the `PREAPPROVAL_KEYS` production Worker secret. It is JSON with an `activeKeyId` and `keys` mapping key IDs to base64-encoded, cryptographically random 32-byte master keys. Never use the test fixture keys.
3. Keep a recovery copy in a restricted credential vault. The initial production recovery item is in the operator's macOS login Keychain, service `ycauto.preapproval.production`, account `encryption-keyring`. Do not export it into source control, CI logs, screenshots or shell history. Loss of every copy of a required key makes its applications unrecoverable.
4. Deploy code, verify public UI / HTTPS and unauthorized admin access, and use synthetic local tests for submissions. Do not generate real customer records merely to smoke-test deployment.

The production secret and recovery copy must remain in sync. Future rotation adds a new random key and changes `activeKeyId`, while retaining old key IDs for stored envelopes and retry fingerprints. New applications use the active key; existing payloads and idempotent retries use their original key ID. Never silently replace a key under an existing ID. Removing an old key without migrating all dependent data breaks reads and retries; plan backup restoration and retained keyed fingerprints as part of any retirement.

The encryption key never reaches the frontend. Local development may configure a separate test-only keyring in ignored `.dev.vars`; automated integration tests supply synthetic keys in memory. Missing, malformed, or mismatched keys produce a generic 503 without plaintext persistence or logs.

## Verification

`npm test` covers encryption, tampering, cross-lead isolation, key rotation, atomic writes, validation, notifications, authorization, access auditing and deletion rollback. `npm run test:e2e` covers public form validation, safe retries, input clearing, explicit admin reads, timed clearing, late responses and deletion. Browser test writes are intercepted and use synthetic identities.
