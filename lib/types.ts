export const VEHICLE_STATUSES = [
  "available",
  "pending",
  "sold",
  "draft",
  "hidden",
] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "closed",
  "spam",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Vehicle = {
  id: string;
  slug: string;
  status: VehicleStatus;
  featured: boolean;
  title: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vin: string | null;
  stockNumber: string | null;
  priceCents: number | null;
  mileage: number | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  bodyType: string | null;
  drivetrain: string | null;
  transmission: string | null;
  fuelType: string | null;
  engine: string | null;
  description: string | null;
  features: string[];
  legacyUrl: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  soldAt: string | null;
  deletedAt: string | null;
  images?: VehicleImage[];
};

export type VehicleImage = {
  id: string;
  vehicleId: string;
  r2Key: string;
  originalFilename: string | null;
  contentType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  position: number;
  isCover: boolean;
  createdAt: string;
  deletedAt: string | null;
};

export type Lead = {
  id: string;
  vehicleId: string | null;
  leadType: string;
  name: string;
  phone: string | null;
  email: string | null;
  preferredContact: string | null;
  message: string | null;
  details: {
    vin?: string;
    mileage?: number;
    wechat?: string;
  };
  status: LeadStatus;
  sourceUrl: string | null;
  referrer: string | null;
  utm: Record<string, string>;
  country: string | null;
  ipHash: string | null;
  adminNotes: string | null;
  emailStatus: string | null;
  createdAt: string;
  updatedAt: string;
  vehicle?: Pick<Vehicle, "id" | "slug" | "title" | "status"> | null;
};

export type SiteSettings = {
  businessName: string;
  shortName: string;
  phone: string;
  smsNumber: string;
  email: string;
  address: string;
  businessHours: string;
  heroTitle: string;
  heroSubtitle: string;
  heroTitleZh: string | null;
  heroSubtitleZh: string | null;
  aboutText: string;
  aboutTextZh: string | null;
  whyChooseText: string;
  whyChooseTextZh: string | null;
  leadNotificationRecipient: string;
  seoTitle: string;
  seoDescription: string;
  seoTitleZh: string | null;
  seoDescriptionZh: string | null;
  whatsappNumber: string | null;
  logoKey: string | null;
  faviconKey: string | null;
  updatedAt: string;
};

export type AuditLog = {
  id: string;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type Redirect = {
  oldPath: string;
  targetPath: string;
  statusCode: number;
  createdAt: string;
};

export type InventoryFilters = {
  make?: string;
  model?: string;
  minYear?: number;
  maxYear?: number;
  minPrice?: number;
  maxPrice?: number;
  maxMileage?: number;
  bodyType?: string;
  drivetrain?: string;
  sort?: "newest" | "price_asc" | "price_desc" | "mileage_asc" | "year_desc";
  page?: number;
  perPage?: number;
};

export type InventoryFacets = {
  makes: Array<{ make: string; count: number }>;
  years: number[];
};

export type DashboardStats = {
  available: number;
  pending: number;
  sold: number;
  draft: number;
  newLeads: number;
};
