# Staff directory

The public Contact page contains the company information, Our Story, Meet Our Staff, map, and existing contact form. `/about` and `/zh/about` permanently redirect to the corresponding Contact page at `#our-story`; retired URLs are excluded from the sitemap.

## Updating staff

Edit `src/staff.ts` for names, English/Chinese titles, bios, and contact details. The initial nine records and original photos were supplied in `Meet Our Staff.docx` in September 2026. Chinese bios are transcribed from that source; English bios are translations. Portraits are extracted originals in `public/staff/<id>.jpeg` and displayed without cropping. They are not generated portraits.

Telephone buttons use `tel:` and email buttons use `mailto:`. WeChat opens a selectable ID with a copy button and instructions to search within WeChat. No QR codes or undocumented WeChat deep links are fabricated. Clipboard failure leaves the ID available for manual copying.

Missing contact values are `null`; their buttons remain visible but disabled with a localized explanation. Never substitute another person's contact details. Pending source details:

- Kai and Vicky: phone, email, WeChat.
- Roy Ma, Daidai, Nana, Jackson Zhu: email.

Staff editing is currently code-based, not part of the admin Website Settings form. Company contact details and Our Story text continue to use the existing admin-managed site settings.

Regression coverage includes original image loading, bilingual roles and biographies, exact phone/email destinations, disabled missing fields, WeChat reveal/copy/manual fallback, legacy redirects, and responsive layouts. No test needs to call, email, or add a real staff member.
