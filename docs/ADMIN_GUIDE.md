# Admin guide

## Add or edit a vehicle

Open `/admin` through Cloudflare Access and choose **Add vehicle**. Enter a title and optional VIN. A valid 17-character VIN enables **Decode VIN**; the Worker checks the D1 cache first, then asks NHTSA vPIC. Returned values fill blank fields only and remain editable. If the service is unavailable, enter the details manually.

Save a draft while details are incomplete. After the first save, use the Photos section to choose multiple JPEG, PNG, or WebP files. The browser resizes large files to a 2560px long edge, uploads sequentially, shows progress, and lets you reorder, set a cover, retry, or remove an image. The server validates the real image signature and size before writing private R2.

Use **Publish/Update** when the listing has a title, price, mileage, and a cover image. Later, change status directly in the inventory table to Pending or Sold; sold pages stay public for SEO. Hide or soft-delete instead of permanently deleting.

## Leads and settings

The Leads inbox shows contact, availability, and test-drive inquiries. Open a lead, call/email from the detail panel, set its status, and add notes. Leads are saved before notification email is attempted. Website Settings controls public contact details, hero/about copy, SEO defaults, and the lead recipient.
