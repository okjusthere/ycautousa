import { z } from "zod";
import { LEAD_STATUSES, VEHICLE_STATUSES } from "./types";

export const vinSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => value.length === 0 || value.length === 17,
    "VIN must be exactly 17 characters",
  )
  .refine((value) => !/[IOQ]/.test(value), "VIN cannot contain I, O, or Q")
  .refine(
    (value) => value.length === 0 || !/^([A-Z0-9])\1+$/.test(value),
    "VIN cannot be a repeated character",
  );

export const vehicleInputSchema = z.object({
  status: z.enum(VEHICLE_STATUSES).default("draft"),
  featured: z
    .preprocess(
      (value) =>
        value === true || value === 1 || value === "1" || value === "true",
      z.boolean(),
    )
    .default(false),
  title: z.string().trim().min(1).max(180),
  year: z.coerce.number().int().min(1886).max(2100).nullable().optional(),
  make: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  trim: z.string().trim().max(120).nullable().optional(),
  vin: vinSchema.nullable().optional(),
  stockNumber: z.string().trim().max(80).nullable().optional(),
  priceCents: z.coerce
    .number()
    .int()
    .min(0)
    .max(100_000_000)
    .nullable()
    .optional(),
  mileage: z.coerce.number().int().min(0).max(2_000_000).nullable().optional(),
  exteriorColor: z.string().trim().max(80).nullable().optional(),
  interiorColor: z.string().trim().max(80).nullable().optional(),
  bodyType: z.string().trim().max(80).nullable().optional(),
  drivetrain: z.string().trim().max(80).nullable().optional(),
  transmission: z.string().trim().max(80).nullable().optional(),
  fuelType: z.string().trim().max(80).nullable().optional(),
  engine: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  features: z.array(z.string().trim().min(1).max(120)).max(60).default([]),
});

export const leadInputSchema = z
  .object({
    vehicleId: z.string().trim().max(80).nullable().optional(),
    leadType: z
      .enum(["availability", "test_drive", "contact"])
      .default("contact"),
    name: z.string().trim().min(2).max(100),
    phone: z.string().trim().max(40).nullable().optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
    preferredContact: z.enum(["phone", "text", "email"]).default("phone"),
    message: z.string().trim().max(3000).nullable().optional(),
    sourceUrl: z.string().url().max(2000).nullable().optional(),
    referrer: z.string().url().max(2000).nullable().optional(),
    utm: z.record(z.string().max(100)).optional().default({}),
    turnstileToken: z.string().trim().min(1).max(4096),
    honeypot: z.string().max(200).optional().default(""),
  })
  .refine((value) => Boolean(value.phone || value.email), {
    message: "Phone or email is required",
    path: ["phone"],
  });

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  adminNotes: z.string().trim().max(5000).optional(),
});

export const settingsSchema = z.object({
  businessName: z.string().trim().min(1).max(160),
  shortName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(3).max(40),
  smsNumber: z.string().trim().max(40),
  email: z.string().email().max(254),
  address: z.string().trim().min(1).max(300),
  businessHours: z.string().trim().max(300),
  heroTitle: z.string().trim().min(1).max(160),
  heroSubtitle: z.string().trim().min(1).max(300),
  aboutText: z.string().trim().max(5000),
  whyChooseText: z.string().trim().max(3000),
  leadNotificationRecipient: z.string().email().max(254),
  seoTitle: z.string().trim().max(180),
  seoDescription: z.string().trim().max(320),
  whatsappNumber: z.string().trim().max(40).nullable().optional(),
  logoKey: z.string().trim().max(300).nullable().optional(),
  faviconKey: z.string().trim().max(300).nullable().optional(),
});

export const imageMetaSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z
    .number()
    .int()
    .positive()
    .max(12 * 1024 * 1024),
  width: z.number().int().positive().max(12_000),
  height: z.number().int().positive().max(12_000),
});

export function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseMoneyToCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const normalized = String(value).replace(/[$,\s]/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function parseMileage(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value)
    .replace(/[,\smi.]+$/gi, "")
    .replace(/,/g, "");
  const mileage = Number.parseInt(normalized, 10);
  return Number.isFinite(mileage) && mileage >= 0 ? mileage : null;
}
