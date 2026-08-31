-- Confirmed dealership address and showroom hours supplied on 2026-08-31.
UPDATE site_settings
SET
  address = '167-04 Northern Blvd, Flushing, NY 11358',
  business_hours = 'Mon–Fri 10:00 AM–6:00 PM · Sat–Sun 12:00 PM–5:00 PM',
  updated_at = datetime('now')
WHERE id = 1;
