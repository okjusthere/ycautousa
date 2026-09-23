# Admin guide

## Add or edit a vehicle

Open `/admin` through Cloudflare Access and choose **Add vehicle**. Enter a title and optional VIN. A valid 17-character VIN enables **Decode VIN**; the Worker checks the D1 cache first, then asks NHTSA vPIC. Returned values fill blank fields only and remain editable. If the service is unavailable, enter the details manually.

The Make and Model fields provide linked suggestions for common US-market vehicles. Choose a make to narrow the model suggestions. Both fields remain editable, so uncommon, classic, or newly released vehicles can still be entered manually.

Save a draft while details are incomplete. After the first save, use the Photos section to choose multiple JPEG, PNG, or WebP files. The browser resizes large files to a 2560px long edge, uploads sequentially, shows progress, and lets you reorder, set a cover, retry, or remove an image. The server validates the real image signature and size before writing private R2.

Use **Publish/Update** when the listing has a title, price, mileage, and a cover image. Later, change status directly in the inventory table to Pending or Sold; sold pages stay public for SEO. **Hide** temporarily removes a listing from the storefront. **Remove vehicle** soft-deletes it from the storefront and normal admin inventory while retaining its audit history; it is available from both the inventory row actions and the bottom of the vehicle editor.

## Leads and settings

The Leads inbox shows contact, availability, test-drive, trade/sell, and financing inquiries. Open a lead, call/email from the detail panel, set its status, and add notes. Leads are saved before notification email is attempted. The Email notification panel shows delivery processing status and offers refresh/retry when appropriate. For uncertain delivery, check the mailbox and confirm before resending. See [notification recovery](LEAD_NOTIFICATIONS.md). Website Settings controls public contact details, hero/about copy, and SEO defaults; the verified notification recipient is read-only.

## Financing estimates

Open **Website Settings → Financing estimates** to edit the APR for each credit range and 36, 48, 60, or 72 months. The initial assumptions are 5.99% for 740+, 6.99% for 680–739, and 7.99% for 620–679 across all four terms. These are illustrative estimates, not approved lender offers. Keep the illustrative-rate label enabled while using assumptions; change it only after replacing the rates with the store's approved estimation rates. Blank APR means no automatic estimate for that selection; 0 means an intentional 0% APR.

Save changes, then refresh a vehicle page to verify the new estimate. Saving unrelated business details preserves the existing APR table. Financing changes are recorded with the administrator and previous/new configuration in the audit log.

The calculator uses the listed vehicle price minus down payment. It excludes taxes, registration, documentation fees, and trade-in credit. Visitors start with $5,000 down (capped at the vehicle price) and 72 months, then choose their own credit range. Sold vehicles and listings without a positive price do not show the calculator.

The 619-or-below option always offers a contact form instead of a monthly payment; it is not a credit rejection. Only an explicit form submission creates a financing inquiry and queues the store email. The Leads inbox and notification include the vehicle, selected range, down payment, term, and the estimate snapshot when available. Credit selections are self-reported; the website does not run credit checks or submit loan applications.
