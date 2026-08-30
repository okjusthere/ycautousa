# Legacy migration runbook

`scripts/migrate-legacy.ts` crawls the public catalogue beginning at `https://www.ycautousa.com/products.html`, discovers pagination instead of assuming a page count, parses labels rather than brittle CSS classes, normalizes fields, filters gallery images, writes audit artifacts, and generates old-path redirects. Scraped HTML is treated as untrusted text; scripts are never executed.

## Modes

```bash
npm run migrate:legacy:dry       # crawl/parse only
npm run migrate:legacy:prepare   # crawl + download/validate images + manifests
npm run migrate:legacy:apply -- --yes
npm run migrate:legacy:verify
```

Set `MAX_PAGES` only if the source catalogue grows beyond the default crawl safety limit (200 pages).

After applying to Cloudflare, use `VERIFY_REMOTE=1 npm run migrate:legacy:verify` to query remote D1 counts for vehicles, images, redirects, and the R2 object listing as an additional consistency check. The normal verify mode remains useful offline and validates every prepared image manifest entry.

Review `migration/output/audit.csv`, `legacy-inventory.json`, `images-manifest.json`, and `redirects.json` before applying. `apply` requires `--yes` (or `CI=true`) and uses Wrangler D1/R2 commands. It is idempotent by `legacy_url` and deterministic image IDs/hashes; it never removes manually created vehicles.

Records without a title, price, mileage, or valid gallery image remain drafts and redirect to `/inventory`. Missing VIN is only a warning. `migration.sql` includes vehicle upserts, redirect upserts, and prepared image rows; successful R2 uploads use immutable `vehicles/{vehicle_id}/{image_id}/original.{ext}` keys. Legacy source images up to 25 MB are accepted during prepare so large originals are not silently lost; new admin uploads remain capped at 12 MB and should be resized before import when practical.

## Two-pass cutover

1. During beta, run a full `dry` and `prepare`, review every warning, then apply to the preview D1/R2 resources.
2. Immediately before DNS cutover, stop edits on the legacy site, run a fresh `dry`/`prepare` delta, review changed records, apply, and verify counts/redirects/media.
3. Keep the old host and a source backup available for at least seven days. Do not delete source HTML or images.

For a parser fixture run without network access:

```bash
LEGACY_FIXTURE=1 LEGACY_BASE_URL=http://legacy.test/ npm run migrate:legacy:dry
```

This repository includes only synthetic fixtures for automated parser tests; they are not production inventory.
