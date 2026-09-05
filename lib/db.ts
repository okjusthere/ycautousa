import type {
  AuditLog,
  DashboardStats,
  InventoryFilters,
  Lead,
  LeadStatus,
  Redirect,
  SiteSettings,
  Vehicle,
  VehicleImage,
  VehicleStatus,
  InventoryFacets,
} from "./types";
import { nowIso, uid } from "./utils";

export type D1Result<T = unknown> = {
  results: T[];
  success?: boolean;
  meta?: Record<string, unknown>;
};
export type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<{ success: boolean; meta?: Record<string, unknown> }>;
};
export type D1Like = {
  prepare(sql: string): D1Statement;
  batch?(statements: D1Statement[]): Promise<unknown>;
};

type VehicleRow = Record<string, unknown>;
type ImageRow = Record<string, unknown>;
type LeadRow = Record<string, unknown>;

const bool = (value: unknown): boolean =>
  value === true || value === 1 || value === "1";
const nullable = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);
const integer = (value: unknown): number | null =>
  value === null || value === undefined || value === "" ? null : Number(value);

export function rowToVehicle(
  row: VehicleRow,
  images?: VehicleImage[],
): Vehicle {
  let features: string[] = [];
  try {
    const parsed = JSON.parse(String(row.features_json ?? "[]"));
    if (Array.isArray(parsed))
      features = parsed.filter(
        (value): value is string => typeof value === "string",
      );
  } catch {
    features = [];
  }
  return {
    id: String(row.id),
    slug: String(row.slug),
    status: String(row.status) as VehicleStatus,
    featured: bool(row.featured),
    title: String(row.title),
    year: integer(row.year),
    make: nullable(row.make),
    model: nullable(row.model),
    trim: nullable(row.trim),
    vin: nullable(row.vin),
    stockNumber: nullable(row.stock_number),
    priceCents: integer(row.price_cents),
    mileage: integer(row.mileage),
    exteriorColor: nullable(row.exterior_color),
    interiorColor: nullable(row.interior_color),
    bodyType: nullable(row.body_type),
    drivetrain: nullable(row.drivetrain),
    transmission: nullable(row.transmission),
    fuelType: nullable(row.fuel_type),
    engine: nullable(row.engine),
    description: nullable(row.description),
    features,
    legacyUrl: nullable(row.legacy_url),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    publishedAt: nullable(row.published_at),
    soldAt: nullable(row.sold_at),
    deletedAt: nullable(row.deleted_at),
    ...(images ? { images } : {}),
  };
}

export function rowToImage(row: ImageRow): VehicleImage {
  return {
    id: String(row.id),
    vehicleId: String(row.vehicle_id),
    r2Key: String(row.r2_key),
    originalFilename: nullable(row.original_filename),
    contentType: nullable(row.content_type),
    byteSize: integer(row.byte_size),
    width: integer(row.width),
    height: integer(row.height),
    position: Number(row.position ?? 0),
    isCover: bool(row.is_cover),
    createdAt: String(row.created_at),
    deletedAt: nullable(row.deleted_at),
  };
}

export function rowToLead(row: LeadRow, vehicle?: Lead["vehicle"]): Lead {
  let utm: Record<string, string> = {};
  let details: Lead["details"] = {};
  try {
    const parsed = JSON.parse(String(row.utm_json ?? "{}"));
    if (parsed && typeof parsed === "object")
      utm = Object.fromEntries(
        Object.entries(parsed)
          .filter(([, value]) => typeof value === "string")
          .map(([key, value]) => [key, String(value)]),
      );
  } catch {
    utm = {};
  }
  try {
    const parsed = JSON.parse(String(row.details_json ?? "{}"));
    if (parsed && typeof parsed === "object") {
      const candidate = parsed as Record<string, unknown>;
      details = {
        ...(typeof candidate.vin === "string" ? { vin: candidate.vin } : {}),
        ...(typeof candidate.mileage === "number"
          ? { mileage: candidate.mileage }
          : {}),
        ...(typeof candidate.wechat === "string"
          ? { wechat: candidate.wechat }
          : {}),
      };
    }
  } catch {
    details = {};
  }
  return {
    id: String(row.id),
    vehicleId: nullable(row.vehicle_id),
    leadType: String(row.lead_type),
    name: String(row.name),
    phone: nullable(row.phone),
    email: nullable(row.email),
    preferredContact: nullable(row.preferred_contact),
    message: nullable(row.message),
    details,
    status: String(row.status) as LeadStatus,
    sourceUrl: nullable(row.source_url),
    referrer: nullable(row.referrer),
    utm,
    country: nullable(row.cf_country),
    ipHash: nullable(row.ip_hash),
    adminNotes: nullable(row.admin_notes),
    emailStatus: nullable(row.email_status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    vehicle: vehicle ?? null,
  };
}

export function rowToSettings(row: Record<string, unknown>): SiteSettings {
  return {
    businessName: String(row.business_name ?? ""),
    shortName: String(row.short_name ?? ""),
    phone: String(row.phone ?? ""),
    smsNumber: String(row.sms_number ?? ""),
    email: String(row.email ?? ""),
    address: String(row.address ?? ""),
    businessHours: String(row.business_hours ?? ""),
    heroTitle: String(row.hero_title ?? ""),
    heroSubtitle: String(row.hero_subtitle ?? ""),
    heroTitleZh: nullable(row.hero_title_zh),
    heroSubtitleZh: nullable(row.hero_subtitle_zh),
    aboutText: String(row.about_text ?? ""),
    aboutTextZh: nullable(row.about_text_zh),
    whyChooseText: String(row.why_choose_text ?? ""),
    whyChooseTextZh: nullable(row.why_choose_text_zh),
    leadNotificationRecipient: String(row.lead_notification_recipient ?? ""),
    seoTitle: String(row.seo_title ?? ""),
    seoDescription: String(row.seo_description ?? ""),
    seoTitleZh: nullable(row.seo_title_zh),
    seoDescriptionZh: nullable(row.seo_description_zh),
    whatsappNumber: nullable(row.whatsapp_number),
    logoKey: nullable(row.logo_key),
    faviconKey: nullable(row.favicon_key),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function getSettings(db: D1Like): Promise<SiteSettings> {
  const row = await db
    .prepare("SELECT * FROM site_settings WHERE id = 1")
    .first<Record<string, unknown>>();
  if (!row)
    throw new Error("site_settings row is missing; apply migrations first");
  return rowToSettings(row);
}

export async function listImages(
  db: D1Like,
  vehicleId: string,
  includeDeleted = false,
): Promise<VehicleImage[]> {
  const statement = includeDeleted
    ? db
        .prepare(
          "SELECT * FROM vehicle_images WHERE vehicle_id = ? ORDER BY position ASC, created_at ASC",
        )
        .bind(vehicleId)
    : db
        .prepare(
          "SELECT * FROM vehicle_images WHERE vehicle_id = ? AND deleted_at IS NULL ORDER BY position ASC, created_at ASC",
        )
        .bind(vehicleId);
  const { results } = await statement.all<ImageRow>();
  return results.map(rowToImage);
}

export async function getVehicleById(
  db: D1Like,
  id: string,
  includeHidden = false,
): Promise<Vehicle | null> {
  const sql = includeHidden
    ? "SELECT * FROM vehicles WHERE id = ? AND deleted_at IS NULL LIMIT 1"
    : "SELECT * FROM vehicles WHERE id = ? AND deleted_at IS NULL AND status NOT IN ('draft','hidden') LIMIT 1";
  const row = await db.prepare(sql).bind(id).first<VehicleRow>();
  return row ? rowToVehicle(row, await listImages(db, id)) : null;
}

export async function getVehicleBySlug(
  db: D1Like,
  slug: string,
  includeHidden = false,
): Promise<Vehicle | null> {
  const sql = includeHidden
    ? "SELECT * FROM vehicles WHERE slug = ? AND deleted_at IS NULL LIMIT 1"
    : "SELECT * FROM vehicles WHERE slug = ? AND deleted_at IS NULL AND status NOT IN ('draft','hidden') LIMIT 1";
  const row = await db.prepare(sql).bind(slug).first<VehicleRow>();
  return row ? rowToVehicle(row, await listImages(db, String(row.id))) : null;
}

function publicWhere(filters: InventoryFilters): {
  sql: string;
  params: unknown[];
} {
  const clauses = [
    "v.deleted_at IS NULL",
    "v.status IN ('available','pending','sold')",
  ];
  const params: unknown[] = [];
  if (filters.make) {
    clauses.push("LOWER(v.make) = LOWER(?)");
    params.push(filters.make);
  }
  if (filters.model) {
    clauses.push("LOWER(v.model) = LOWER(?)");
    params.push(filters.model);
  }
  if (filters.minYear !== undefined) {
    clauses.push("v.year >= ?");
    params.push(filters.minYear);
  }
  if (filters.maxYear !== undefined) {
    clauses.push("v.year <= ?");
    params.push(filters.maxYear);
  }
  if (filters.minPrice !== undefined) {
    clauses.push("v.price_cents >= ?");
    params.push(filters.minPrice * 100);
  }
  if (filters.maxPrice !== undefined) {
    clauses.push("v.price_cents <= ?");
    params.push(filters.maxPrice * 100);
  }
  if (filters.maxMileage !== undefined) {
    clauses.push("v.mileage <= ?");
    params.push(filters.maxMileage);
  }
  if (filters.bodyType) {
    clauses.push("LOWER(v.body_type) = LOWER(?)");
    params.push(filters.bodyType);
  }
  if (filters.drivetrain) {
    clauses.push("LOWER(v.drivetrain) = LOWER(?)");
    params.push(filters.drivetrain);
  }
  return { sql: clauses.join(" AND "), params };
}

export async function listPublicVehicles(
  db: D1Like,
  filters: InventoryFilters = {},
): Promise<{
  vehicles: Vehicle[];
  total: number;
  page: number;
  perPage: number;
}> {
  const { sql, params } = publicWhere(filters);
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const requestedPerPage = filters.perPage ?? 12;
  const perPage = [12, 24].includes(requestedPerPage) ? requestedPerPage : 12;
  const order =
    (
      {
        newest: "v.created_at DESC",
        price_asc: "v.price_cents IS NULL, v.price_cents ASC",
        price_desc: "v.price_cents IS NULL, v.price_cents DESC",
        mileage_asc: "v.mileage IS NULL, v.mileage ASC",
        year_desc: "v.year IS NULL, v.year DESC",
      } as Record<string, string>
    )[filters.sort ?? "newest"] ?? "v.created_at DESC";
  const countRow = await db
    .prepare(`SELECT COUNT(*) AS count FROM vehicles v WHERE ${sql}`)
    .bind(...params)
    .first<{ count: number }>();
  const rows = await db
    .prepare(
      `SELECT v.* FROM vehicles v WHERE ${sql} ORDER BY ${order}, v.id ASC LIMIT ? OFFSET ?`,
    )
    .bind(...params, perPage, (page - 1) * perPage)
    .all<VehicleRow>();
  const vehicles = await Promise.all(
    rows.results.map(async (row) =>
      rowToVehicle(row, await listImages(db, String(row.id))),
    ),
  );
  return { vehicles, total: Number(countRow?.count ?? 0), page, perPage };
}

export async function listFeaturedVehicles(
  db: D1Like,
  limit = 4,
): Promise<Vehicle[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM vehicles WHERE status = 'available' AND deleted_at IS NULL AND featured = 1 ORDER BY created_at DESC LIMIT ?",
    )
    .bind(limit)
    .all<VehicleRow>();
  return Promise.all(
    rows.results.map(async (row) =>
      rowToVehicle(row, await listImages(db, String(row.id))),
    ),
  );
}

export async function listMakes(
  db: D1Like,
): Promise<Array<{ make: string; count: number }>> {
  const { results } = await db
    .prepare(
      "SELECT make, COUNT(*) AS count FROM vehicles WHERE status = 'available' AND deleted_at IS NULL AND make IS NOT NULL AND make <> '' GROUP BY make ORDER BY count DESC, make ASC",
    )
    .all<{ make: string; count: number }>();
  return results.map((row) => ({ make: row.make, count: Number(row.count) }));
}

export async function listInventoryFacets(
  db: D1Like,
): Promise<InventoryFacets> {
  const [makes, yearRows] = await Promise.all([
    listMakes(db),
    db
      .prepare(
        "SELECT DISTINCT year FROM vehicles WHERE status = 'available' AND deleted_at IS NULL AND year IS NOT NULL ORDER BY year DESC",
      )
      .all<{ year: number }>(),
  ]);
  return {
    makes,
    years: yearRows.results
      .map((row) => Number(row.year))
      .filter((year) => Number.isInteger(year)),
  };
}

export async function listAdminVehicles(
  db: D1Like,
  options: {
    search?: string;
    status?: VehicleStatus;
    make?: string;
    page?: number;
    perPage?: number;
  } = {},
): Promise<{
  vehicles: Vehicle[];
  total: number;
  page: number;
  perPage: number;
}> {
  const clauses = ["deleted_at IS NULL"];
  const params: unknown[] = [];
  if (options.search) {
    clauses.push(
      "(LOWER(title) LIKE LOWER(?) OR LOWER(COALESCE(vin,'')) LIKE LOWER(?) OR LOWER(COALESCE(stock_number,'')) LIKE LOWER(?))",
    );
    const term = `%${options.search}%`;
    params.push(term, term, term);
  }
  if (options.status) {
    clauses.push("status = ?");
    params.push(options.status);
  }
  if (options.make) {
    clauses.push("LOWER(make) = LOWER(?)");
    params.push(options.make);
  }
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const perPage = options.perPage === 50 ? 50 : 25;
  const where = clauses.join(" AND ");
  const count = await db
    .prepare(`SELECT COUNT(*) AS count FROM vehicles WHERE ${where}`)
    .bind(...params)
    .first<{ count: number }>();
  const rows = await db
    .prepare(
      `SELECT * FROM vehicles WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(...params, perPage, (page - 1) * perPage)
    .all<VehicleRow>();
  return {
    vehicles: await Promise.all(
      rows.results.map(async (row) =>
        rowToVehicle(row, await listImages(db, String(row.id))),
      ),
    ),
    total: Number(count?.count ?? 0),
    page,
    perPage,
  };
}

export async function dashboardStats(db: D1Like): Promise<DashboardStats> {
  const rows = await db
    .prepare(
      "SELECT status, COUNT(*) AS count FROM vehicles WHERE deleted_at IS NULL GROUP BY status",
    )
    .all<{ status: string; count: number }>();
  const stats: DashboardStats = {
    available: 0,
    pending: 0,
    sold: 0,
    draft: 0,
    newLeads: 0,
  };
  for (const row of rows.results)
    if (row.status in stats)
      (stats as Record<string, number>)[row.status] = Number(row.count);
  const leadCount = await db
    .prepare("SELECT COUNT(*) AS count FROM leads WHERE status = 'new'")
    .first<{ count: number }>();
  stats.newLeads = Number(leadCount?.count ?? 0);
  return stats;
}

export async function recentVehicles(
  db: D1Like,
  limit = 6,
): Promise<Vehicle[]> {
  const rows = await db
    .prepare(
      "SELECT * FROM vehicles WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?",
    )
    .bind(limit)
    .all<VehicleRow>();
  return Promise.all(
    rows.results.map(async (row) =>
      rowToVehicle(row, await listImages(db, String(row.id))),
    ),
  );
}

export async function recentLeads(db: D1Like, limit = 8): Promise<Lead[]> {
  const rows = await db
    .prepare(
      "SELECT l.*, v.id AS v_id, v.slug AS v_slug, v.title AS v_title, v.status AS v_status FROM leads l LEFT JOIN vehicles v ON v.id = l.vehicle_id ORDER BY l.created_at DESC LIMIT ?",
    )
    .bind(limit)
    .all<LeadRow>();
  return rows.results.map((row) =>
    rowToLead(
      row,
      row.v_id
        ? {
            id: String(row.v_id),
            slug: String(row.v_slug),
            title: String(row.v_title),
            status: String(row.v_status) as VehicleStatus,
          }
        : null,
    ),
  );
}

export async function getLead(db: D1Like, id: string): Promise<Lead | null> {
  const row = await db
    .prepare(
      "SELECT l.*, v.id AS v_id, v.slug AS v_slug, v.title AS v_title, v.status AS v_status FROM leads l LEFT JOIN vehicles v ON v.id = l.vehicle_id WHERE l.id = ?",
    )
    .bind(id)
    .first<LeadRow>();
  return row
    ? rowToLead(
        row,
        row.v_id
          ? {
              id: String(row.v_id),
              slug: String(row.v_slug),
              title: String(row.v_title),
              status: String(row.v_status) as VehicleStatus,
            }
          : null,
      )
    : null;
}

export async function listLeads(
  db: D1Like,
  status?: LeadStatus,
): Promise<Lead[]> {
  const statement = status
    ? db
        .prepare(
          "SELECT l.*, v.id AS v_id, v.slug AS v_slug, v.title AS v_title, v.status AS v_status FROM leads l LEFT JOIN vehicles v ON v.id = l.vehicle_id WHERE l.status = ? ORDER BY l.created_at DESC",
        )
        .bind(status)
    : db.prepare(
        "SELECT l.*, v.id AS v_id, v.slug AS v_slug, v.title AS v_title, v.status AS v_status FROM leads l LEFT JOIN vehicles v ON v.id = l.vehicle_id ORDER BY l.created_at DESC",
      );
  const rows = await statement.all<LeadRow>();
  return rows.results.map((row) =>
    rowToLead(
      row,
      row.v_id
        ? {
            id: String(row.v_id),
            slug: String(row.v_slug),
            title: String(row.v_title),
            status: String(row.v_status) as VehicleStatus,
          }
        : null,
    ),
  );
}

export type VehicleWrite = {
  id?: string;
  slug: string;
  status: VehicleStatus;
  featured: boolean;
  title: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  vin?: string | null;
  stockNumber?: string | null;
  priceCents?: number | null;
  mileage?: number | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  bodyType?: string | null;
  drivetrain?: string | null;
  transmission?: string | null;
  fuelType?: string | null;
  engine?: string | null;
  description?: string | null;
  features: string[];
  legacyUrl?: string | null;
};

export async function upsertVehicle(
  db: D1Like,
  input: VehicleWrite,
): Promise<string> {
  const id = input.id ?? uid("veh");
  const existing = input.id
    ? await db
        .prepare(
          "SELECT id, created_at, published_at FROM vehicles WHERE id = ?",
        )
        .bind(input.id)
        .first<{
          id: string;
          created_at: string;
          published_at: string | null;
        }>()
    : null;
  const createdAt = existing?.created_at ?? nowIso();
  const updatedAt = nowIso();
  const publishedAt =
    input.status === "draft" || input.status === "hidden"
      ? null
      : (existing?.published_at ?? updatedAt);
  const soldAt = input.status === "sold" ? updatedAt : null;
  const sql = existing
    ? `UPDATE vehicles SET slug=?, status=?, featured=?, title=?, year=?, make=?, model=?, trim=?, vin=?, stock_number=?, price_cents=?, mileage=?, exterior_color=?, interior_color=?, body_type=?, drivetrain=?, transmission=?, fuel_type=?, engine=?, description=?, features_json=?, legacy_url=?, updated_at=?, published_at=CASE WHEN ? IN ('draft','hidden') THEN NULL WHEN ? IS NOT NULL THEN ? ELSE published_at END, sold_at=? WHERE id=?`
    : `INSERT INTO vehicles (id,slug,status,featured,title,year,make,model,trim,vin,stock_number,price_cents,mileage,exterior_color,interior_color,body_type,drivetrain,transmission,fuel_type,engine,description,features_json,legacy_url,created_at,updated_at,published_at,sold_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
  const vehicleValues = [
    input.slug,
    input.status,
    input.featured ? 1 : 0,
    input.title,
    input.year ?? null,
    input.make ?? null,
    input.model ?? null,
    input.trim ?? null,
    input.vin ?? null,
    input.stockNumber ?? null,
    input.priceCents ?? null,
    input.mileage ?? null,
    input.exteriorColor ?? null,
    input.interiorColor ?? null,
    input.bodyType ?? null,
    input.drivetrain ?? null,
    input.transmission ?? null,
    input.fuelType ?? null,
    input.engine ?? null,
    input.description ?? null,
    JSON.stringify(input.features),
    input.legacyUrl ?? null,
  ];
  const values = existing
    ? [
        ...vehicleValues,
        updatedAt,
        input.status,
        publishedAt,
        publishedAt,
        soldAt,
        id,
      ]
    : [id, ...vehicleValues, createdAt, updatedAt, publishedAt, soldAt];
  await db
    .prepare(sql)
    .bind(...values)
    .run();
  return id;
}

export async function updateVehicleStatus(
  db: D1Like,
  id: string,
  status: VehicleStatus,
): Promise<void> {
  const at = nowIso();
  await db
    .prepare(
      "UPDATE vehicles SET status=?, updated_at=?, published_at=CASE WHEN ? IN ('available','pending','sold') AND published_at IS NULL THEN ? ELSE published_at END, sold_at=CASE WHEN ?='sold' THEN ? ELSE NULL END WHERE id=? AND deleted_at IS NULL",
    )
    .bind(status, at, status, at, status, at, id)
    .run();
}

export async function softDeleteVehicle(db: D1Like, id: string): Promise<void> {
  const at = nowIso();
  await db
    .prepare(
      "UPDATE vehicles SET deleted_at=?, updated_at=?, status='hidden' WHERE id=?",
    )
    .bind(at, at, id)
    .run();
}

export async function getVinCache(
  db: D1Like,
  vin: string,
): Promise<{ normalizedJson: string; rawJson: string | null } | null> {
  return db
    .prepare(
      "SELECT normalized_json AS normalizedJson, raw_json AS rawJson FROM vin_decode_cache WHERE vin = ?",
    )
    .bind(vin)
    .first<{ normalizedJson: string; rawJson: string | null }>();
}
export async function touchVinCache(
  db: D1Like,
  vin: string,
  at: string,
): Promise<void> {
  await db
    .prepare("UPDATE vin_decode_cache SET last_used_at=? WHERE vin=?")
    .bind(at, vin)
    .run();
}
export async function putVinCache(
  db: D1Like,
  vin: string,
  normalizedJson: string,
  rawJson: string,
  at: string,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO vin_decode_cache (vin, normalized_json, raw_json, fetched_at, last_used_at) VALUES (?,?,?,?,?) ON CONFLICT(vin) DO UPDATE SET normalized_json=excluded.normalized_json, raw_json=excluded.raw_json, fetched_at=excluded.fetched_at, last_used_at=excluded.last_used_at",
    )
    .bind(vin, normalizedJson, rawJson, at, at)
    .run();
}

export async function insertLead(
  db: D1Like,
  lead: {
    id?: string;
    vehicleId?: string | null;
    leadType: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    preferredContact?: string | null;
    message?: string | null;
    details?: Lead["details"];
    sourceUrl?: string | null;
    referrer?: string | null;
    utm?: Record<string, string>;
    country?: string | null;
    ipHash?: string | null;
  },
): Promise<string> {
  const id = lead.id ?? uid("lead");
  const at = nowIso();
  await db
    .prepare(
      "INSERT INTO leads (id,vehicle_id,lead_type,name,phone,email,preferred_contact,message,details_json,status,source_url,referrer,utm_json,cf_country,ip_hash,created_at,updated_at,email_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      id,
      lead.vehicleId ?? null,
      lead.leadType,
      lead.name,
      lead.phone ?? null,
      lead.email ?? null,
      lead.preferredContact ?? null,
      lead.message ?? null,
      JSON.stringify(lead.details ?? {}),
      "new",
      lead.sourceUrl ?? null,
      lead.referrer ?? null,
      JSON.stringify(lead.utm ?? {}),
      lead.country ?? null,
      lead.ipHash ?? null,
      at,
      at,
      "pending",
    )
    .run();
  return id;
}
export async function updateLead(
  db: D1Like,
  id: string,
  status?: LeadStatus,
  adminNotes?: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE leads SET status=COALESCE(?,status), admin_notes=COALESCE(?,admin_notes), updated_at=? WHERE id=?",
    )
    .bind(status ?? null, adminNotes ?? null, nowIso(), id)
    .run();
}
export async function updateLeadEmailStatus(
  db: D1Like,
  id: string,
  status: string,
): Promise<void> {
  await db
    .prepare("UPDATE leads SET email_status=?, updated_at=? WHERE id=?")
    .bind(status, nowIso(), id)
    .run();
}

export async function addAudit(
  db: D1Like,
  adminEmail: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit_logs (id,admin_email,action,entity_type,entity_id,details_json,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      uid("audit"),
      adminEmail,
      action,
      entityType,
      entityId,
      JSON.stringify(details),
      nowIso(),
    )
    .run();
}
export async function listAudit(db: D1Like, limit = 100): Promise<AuditLog[]> {
  const rows = await db
    .prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?")
    .bind(limit)
    .all<Record<string, unknown>>();
  return rows.results.map((row) => {
    let details: Record<string, unknown> = {};
    try {
      details = JSON.parse(String(row.details_json ?? "{}"));
    } catch {
      /* ignore */
    }
    return {
      id: String(row.id),
      adminEmail: String(row.admin_email),
      action: String(row.action),
      entityType: String(row.entity_type),
      entityId: nullable(row.entity_id),
      details,
      createdAt: String(row.created_at),
    };
  });
}

export async function upsertImage(
  db: D1Like,
  image: Omit<VehicleImage, "deletedAt">,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO vehicle_images (id,vehicle_id,r2_key,original_filename,content_type,byte_size,width,height,position,is_cover,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET position=excluded.position,is_cover=excluded.is_cover WHERE deleted_at IS NULL",
    )
    .bind(
      image.id,
      image.vehicleId,
      image.r2Key,
      image.originalFilename,
      image.contentType,
      image.byteSize,
      image.width,
      image.height,
      image.position,
      image.isCover ? 1 : 0,
      image.createdAt,
    )
    .run();
}
export async function normalizeImagePositions(
  db: D1Like,
  vehicleId: string,
  orderedIds: string[],
  coverId?: string,
): Promise<void> {
  const statements = orderedIds.map((imageId, index) =>
    db
      .prepare(
        "UPDATE vehicle_images SET position=?, is_cover=? WHERE id=? AND vehicle_id=? AND deleted_at IS NULL",
      )
      .bind(
        index,
        coverId ? (imageId === coverId ? 1 : 0) : index === 0 ? 1 : 0,
        imageId,
        vehicleId,
      ),
  );
  if (db.batch) await db.batch(statements);
  else for (const statement of statements) await statement.run();
}
export async function softDeleteImage(
  db: D1Like,
  imageId: string,
): Promise<void> {
  await db
    .prepare("UPDATE vehicle_images SET deleted_at=?, is_cover=0 WHERE id=?")
    .bind(nowIso(), imageId)
    .run();
}
export async function ensureImageCover(
  db: D1Like,
  vehicleId: string,
): Promise<void> {
  const current = await listImages(db, vehicleId);
  if (!current.length || current.some((image) => image.isCover)) return;
  await db
    .prepare(
      "UPDATE vehicle_images SET is_cover=CASE WHEN id=? THEN 1 ELSE 0 END WHERE vehicle_id=? AND deleted_at IS NULL",
    )
    .bind(current[0].id, vehicleId)
    .run();
}
export async function getImageById(
  db: D1Like,
  imageId: string,
): Promise<VehicleImage | null> {
  const row = await db
    .prepare("SELECT * FROM vehicle_images WHERE id=? AND deleted_at IS NULL")
    .bind(imageId)
    .first<ImageRow>();
  return row ? rowToImage(row) : null;
}

export async function resolveRedirect(
  db: D1Like,
  path: string,
): Promise<Redirect | null> {
  const row = await db
    .prepare("SELECT * FROM legacy_redirects WHERE old_path=?")
    .bind(path)
    .first<Record<string, unknown>>();
  return row
    ? {
        oldPath: String(row.old_path),
        targetPath: String(row.target_path),
        statusCode: Number(row.status_code),
        createdAt: String(row.created_at),
      }
    : null;
}
export async function upsertRedirect(
  db: D1Like,
  redirect: Omit<Redirect, "createdAt">,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO legacy_redirects (old_path,target_path,status_code,created_at) VALUES (?,?,?,?) ON CONFLICT(old_path) DO UPDATE SET target_path=excluded.target_path,status_code=excluded.status_code",
    )
    .bind(redirect.oldPath, redirect.targetPath, redirect.statusCode, nowIso())
    .run();
}
export async function trackEvent(
  db: D1Like,
  eventName: string,
  vehicleId: string | null,
): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  await db
    .prepare(
      "INSERT INTO analytics_daily (date,event_name,vehicle_id,event_count) VALUES (?,?,?,1) ON CONFLICT(date,event_name,vehicle_id) DO UPDATE SET event_count=event_count+1",
    )
    .bind(date, eventName, vehicleId ?? "")
    .run();
}

export async function updateSettings(
  db: D1Like,
  settings: SiteSettings,
): Promise<void> {
  await db
    .prepare(
      "UPDATE site_settings SET business_name=?,short_name=?,phone=?,sms_number=?,email=?,address=?,business_hours=?,hero_title=?,hero_subtitle=?,hero_title_zh=?,hero_subtitle_zh=?,about_text=?,about_text_zh=?,why_choose_text=?,why_choose_text_zh=?,lead_notification_recipient=?,seo_title=?,seo_description=?,seo_title_zh=?,seo_description_zh=?,whatsapp_number=?,logo_key=?,favicon_key=?,updated_at=? WHERE id=1",
    )
    .bind(
      settings.businessName,
      settings.shortName,
      settings.phone,
      settings.smsNumber,
      settings.email,
      settings.address,
      settings.businessHours,
      settings.heroTitle,
      settings.heroSubtitle,
      settings.heroTitleZh,
      settings.heroSubtitleZh,
      settings.aboutText,
      settings.aboutTextZh,
      settings.whyChooseText,
      settings.whyChooseTextZh,
      settings.leadNotificationRecipient,
      settings.seoTitle,
      settings.seoDescription,
      settings.seoTitleZh,
      settings.seoDescriptionZh,
      settings.whatsappNumber,
      settings.logoKey,
      settings.faviconKey,
      nowIso(),
    )
    .run();
}

export async function listSitemapVehicles(
  db: D1Like,
): Promise<Array<Pick<Vehicle, "slug" | "updatedAt">>> {
  const rows = await db
    .prepare(
      "SELECT slug,updated_at FROM vehicles WHERE status IN ('available','pending','sold') AND deleted_at IS NULL ORDER BY updated_at DESC",
    )
    .all<{ slug: string; updated_at: string }>();
  return rows.results.map((row) => ({
    slug: row.slug,
    updatedAt: row.updated_at,
  }));
}
