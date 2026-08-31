# Admin guide

## Add or edit a vehicle

Open `/admin` through Cloudflare Access and choose **Add vehicle**. Enter a title and optional VIN. A valid 17-character VIN enables **Decode VIN**; the Worker checks the D1 cache first, then asks NHTSA vPIC. Returned values fill blank fields only and remain editable. If the service is unavailable, enter the details manually.

The Make and Model fields provide linked suggestions for common US-market vehicles. Choose a make to narrow the model suggestions. Both fields remain editable, so uncommon, classic, or newly released vehicles can still be entered manually.

Save a draft while details are incomplete. After the first save, use the Photos section to choose multiple JPEG, PNG, or WebP files. The browser resizes large files to a 2560px long edge, uploads sequentially, shows progress, and lets you reorder, set a cover, retry, or remove an image. The server validates the real image signature and size before writing private R2.

Use **Publish/Update** when the listing has a title, price, mileage, and a cover image. Later, change status directly in the inventory table to Pending or Sold; sold pages stay public for SEO. **Hide** temporarily removes a listing from the storefront. **Remove vehicle** soft-deletes it from the storefront and normal admin inventory while retaining its audit history; it is available from both the inventory row actions and the bottom of the vehicle editor.

## Leads and settings

The Leads inbox shows contact, availability, and test-drive inquiries. Open a lead, call/email from the detail panel, set its status, and add notes. Leads are saved before notification email is attempted. Website Settings controls public contact details, hero/about copy, SEO defaults, and the lead recipient.
