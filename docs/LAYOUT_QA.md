# Public layout and live inventory verification

Date: 2026-09-07 (America/New_York)

## Corrections

- Chinese headings now use CJK fonts, positive line spacing, normal letter spacing, and responsive sizes. This covers home, inventory, vehicle detail, About, Contact, Trade/Sell, legal pages, and the not-found page.
- Inventory explanatory text no longer inherits the large numeric counter style. The same descendant-selector mistake was corrected in the About page's YC caption.
- About becomes a single column on phones/tablets, and its English title scales down to avoid clipping on narrow phones.
- Contact email/address content can wrap within its grid. Business hours occupy their own row without negative margins.
- Homepage brand rows show counts on phones, allow long brand names to wrap, include every available make rather than only eight, and format row numbers correctly above nine.
- Restored Our Story / 关于我们 as previously requested; the prior Our Staff rename was an implementation mistake.

## Homepage inventory behavior

`GET /api/public/home` queries D1 on every request and returns `Cache-Control: no-store`. Its make counts include only available, non-deleted vehicles. Draft, hidden, pending, sold, and deleted vehicles do not contribute.

Adding inventory increases counts and introduces new brands. Selling or deleting the last available vehicle removes that brand. All brands are displayed, ordered by available count and then name. Case and surrounding whitespace variants are combined without rewriting vehicle records, and make filtering uses the same case/whitespace-insensitive matching. Production verification found 35 available vehicles across 15 distinct brands; Toyota and TOYOTA now appear together as Toyota with 7 vehicles.

Visitors see changes on refresh or re-entering the home page. An already open page does not poll or receive pushed updates. Featured vehicles remain a separate selection: available vehicles marked Featured in admin, up to four on the homepage.

## Verification

- 35 unit/integration tests, including create/increment/new-brand/sold/delete behavior and case/whitespace grouping.
- 26 browser tests, including existing public/admin workflows and new layout and brand-list regressions.
- Layout traversal: nine public page types × two languages × six viewport widths (320, 390, 768, 1024, 1440, 1920), totaling 108 combinations. Checks page overflow, heading placement, Chinese line spacing, and counter caption sizes; screenshots saved under ignored `test-results/`.
- Browsers: Chromium desktop and Chromium with phone emulation. This is not a claim of testing every browser engine or physical device.
- The layout traversal can be run read-only against production with `PLAYWRIGHT_BASE_URL=https://yc-auto-web.okjusthere.workers.dev npm run test:e2e -- e2e/layout.spec.ts`. The simulated inventory changes in the second test are browser response mocks, not production database writes.

Worker version: `22687e32-663b-439d-a465-2698556abe3a`.
