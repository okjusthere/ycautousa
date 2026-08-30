# DNS cutover and rollback

Before any DNS edit, export the entire existing zone and preserve MX, SPF, DKIM, DMARC, and all TXT records. Website cutover must not change mail routing.

1. Verify preview pages, admin Access, Turnstile, email binding, D1 counts, R2 objects, sitemap, and a sample of old URLs.
2. Run the final delta migration and `npm run migrate:legacy:verify`.
3. Deploy the reviewed Worker and bind `www.ycautousa.com`.
4. Configure `ycautousa.com` (apex) as a 301 to `https://www.ycautousa.com`, retaining mail records.
5. Run `APP_ORIGIN=https://www.ycautousa.com npm run verify:prod`; optionally add `LEGACY_PATH=/old-product-p.html` and `IMAGE_PATH=/media/<key>` to check a known redirect and image.
6. Keep the legacy host online/read-only for seven days, then disable legacy writes.

Rollback is a Worker-version rollback (`npx wrangler deployments list` then `npx wrangler rollback`) plus restoring the prior web DNS record. Do not roll back mail records. D1 changes are additive/upsert-based; use a Time Travel bookmark and documented restore procedure before destructive recovery.
