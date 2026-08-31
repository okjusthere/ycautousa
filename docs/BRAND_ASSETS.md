# YC Auto brand assets

The public site uses dealership-owned brand material rather than generated branding:

- `public/brand/logo-light.png` — white-on-transparent logo supplied by the dealership for dark surfaces.
- `public/brand/logo-dark.png` — black-on-transparent logo retrieved from the public legacy site at `/Uploads/flash/68e8b82f75145.png`.
- `public/brand/team.jpg` — dealership team photo retrieved from the public legacy site at `/Uploads/flash/68ef021a86291.jpg`.

The legacy site's generic news photos, watermarked concept-car image, placeholder social links, and inconsistent WhatsApp values are intentionally not carried into the new site.

Vehicle photography is tracked separately by `migration/output/images-manifest.json` and is uploaded to private R2 by the legacy migration workflow.
