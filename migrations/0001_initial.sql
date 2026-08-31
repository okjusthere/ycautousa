-- YC Auto initial schema. Safe to apply to a new D1 database.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('available','pending','sold','draft','hidden')),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0,1)),
  title TEXT NOT NULL,
  year INTEGER,
  make TEXT,
  model TEXT,
  trim TEXT,
  vin TEXT UNIQUE,
  stock_number TEXT,
  price_cents INTEGER,
  mileage INTEGER,
  exterior_color TEXT,
  interior_color TEXT,
  body_type TEXT,
  drivetrain TEXT,
  transmission TEXT,
  fuel_type TEXT,
  engine TEXT,
  description TEXT,
  features_json TEXT NOT NULL DEFAULT '[]',
  legacy_url TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT,
  sold_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehicles_public ON vehicles(status, deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_filters ON vehicles(make, model, year, price_cents, mileage, body_type, drivetrain);
CREATE INDEX IF NOT EXISTS idx_vehicles_admin_search ON vehicles(title, vin, stock_number, status);

CREATE TABLE IF NOT EXISTS vin_decode_cache (
  vin TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'nhtsa_vpic',
  normalized_json TEXT NOT NULL,
  raw_json TEXT,
  fetched_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vehicle_images (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT,
  content_type TEXT,
  byte_size INTEGER,
  width INTEGER,
  height INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  is_cover INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0,1)),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_vehicle_images_vehicle ON vehicle_images(vehicle_id, deleted_at, position);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  lead_type TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  preferred_contact TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed','spam')),
  source_url TEXT,
  referrer TEXT,
  utm_json TEXT,
  cf_country TEXT,
  ip_hash TEXT,
  admin_notes TEXT,
  email_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_vehicle ON leads(vehicle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  sms_number TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  business_hours TEXT NOT NULL,
  hero_title TEXT NOT NULL,
  hero_subtitle TEXT NOT NULL,
  about_text TEXT NOT NULL,
  why_choose_text TEXT NOT NULL,
  lead_notification_recipient TEXT NOT NULL,
  seo_title TEXT NOT NULL,
  seo_description TEXT NOT NULL,
  whatsapp_number TEXT,
  logo_key TEXT,
  favicon_key TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legacy_redirects (
  old_path TEXT PRIMARY KEY,
  target_path TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301,302,307,308)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_daily (
  date TEXT NOT NULL,
  event_name TEXT NOT NULL,
  vehicle_id TEXT NOT NULL DEFAULT '',
  event_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, event_name, vehicle_id)
);

INSERT OR IGNORE INTO site_settings (
  id, business_name, short_name, phone, sms_number, email, address, business_hours,
  hero_title, hero_subtitle, about_text, why_choose_text, lead_notification_recipient,
  seo_title, seo_description, whatsapp_number, logo_key, favicon_key, updated_at
) VALUES (
  1,
  'Your Choice Auto Group LLC',
  'YC Auto USA',
  '718-799-0606',
  '718-799-0606',
  'sophie@youxuancars.com',
  '167-04 Northern Blvd, Flushing, NY 11358',
  'Mon–Fri 10:00 AM–6:00 PM · Sat–Sun 12:00 PM–5:00 PM',
  'Find Your Next Car',
  'Quality pre-owned vehicles in Flushing, New York.',
  'YC Auto USA is a neighborhood pre-owned vehicle dealer serving drivers in Flushing and the surrounding New York area. Browse our current inventory online, then call or send a note to arrange a visit.',
  'Straightforward inventory, clear details, and a local team ready to help you choose with confidence.',
  'sophie@youxuancars.com',
  'YC Auto USA | Quality pre-owned vehicles in Flushing, NY',
  'Browse quality pre-owned cars, SUVs, and trucks from YC Auto USA in Flushing, New York.',
  NULL,
  NULL,
  NULL,
  datetime('now')
);
