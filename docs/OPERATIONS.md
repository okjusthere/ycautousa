# Operations

## Daily / weekly

- Review new leads and `failed`/`unknown` notification states in `/admin/leads`.
- Check Worker runtime logs without printing tokens, raw IPs, or customer secrets.
- Confirm the storefront and one vehicle page after inventory changes.

## Backups and recovery

- D1 Time Travel is the first recovery option. Record a bookmark before every schema migration.
- Export D1 quarterly (and before a cutover): `npx wrangler d1 export yc-auto-prod --remote --output=backup-YYYY-MM-DD.sql`.
- R2 keys are immutable. Periodically inventory objects with `npx wrangler r2 object list yc-auto-vehicle-images`; compare to `vehicle_images` rows and review orphan objects before cleanup.
- Normal UI deletes are soft/deferred. Clean orphan R2 objects only after an explicit review and backup.

## Incident actions

If email delivery fails, inquiries remain saved in D1. Review the lead's Email notification panel: rate/quota rejections retry automatically; `failed` needs configuration review and an explicit retry; `unknown` requires checking the mailbox before confirming a resend. Do not disable a working binding as a routine recovery step. See [notification recovery](LEAD_NOTIFICATIONS.md). If a bad Worker is deployed, roll back to the prior deployment through Wrangler. If media transforms fail, the Worker automatically serves the original private R2 object.
