import { isRecord } from "./http";
import {
  financingConfigSchema,
  financingSnapshotSchema,
} from "../lib/financing";

const strings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => typeof value[key] === "string");
const nullableStrings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => value[key] === null || typeof value[key] === "string");
const number = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const integer = (value: unknown, min = 0) =>
  number(value) && Number.isInteger(value) && value >= min;

export function validSettings(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.financing == null ||
      financingConfigSchema.safeParse(value.financing).success) &&
    strings(value, [
      "businessName",
      "shortName",
      "phone",
      "smsNumber",
      "email",
      "address",
      "businessHours",
      "heroTitle",
      "heroSubtitle",
      "aboutText",
      "whyChooseText",
      "leadNotificationRecipient",
      "seoTitle",
      "seoDescription",
      "updatedAt",
    ]) &&
    nullableStrings(value, [
      "heroTitleZh",
      "heroSubtitleZh",
      "aboutTextZh",
      "whyChooseTextZh",
      "seoTitleZh",
      "seoDescriptionZh",
      "whatsappNumber",
      "logoKey",
      "faviconKey",
    ])
  );
}

export function validVehicle(value: unknown): boolean {
  return (
    isRecord(value) &&
    strings(value, ["id", "slug", "title", "createdAt", "updatedAt"]) &&
    ["available", "pending", "sold", "draft", "hidden"].includes(
      String(value.status),
    ) &&
    typeof value.featured === "boolean" &&
    ["year", "priceCents", "mileage"].every(
      (key) => value[key] === null || number(value[key]),
    ) &&
    nullableStrings(value, [
      "make",
      "model",
      "trim",
      "vin",
      "stockNumber",
      "exteriorColor",
      "interiorColor",
      "bodyType",
      "drivetrain",
      "transmission",
      "fuelType",
      "engine",
      "description",
      "legacyUrl",
      "publishedAt",
      "soldAt",
      "deletedAt",
    ]) &&
    Array.isArray(value.features) &&
    value.features.every((feature) => typeof feature === "string") &&
    (value.images === undefined ||
      (Array.isArray(value.images) &&
        value.images.every(
          (image) =>
            isRecord(image) &&
            strings(image, ["id", "vehicleId", "r2Key"]) &&
            typeof image.isCover === "boolean" &&
            integer(image.position),
        )))
  );
}

const validMakes = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isRecord(item) && typeof item.make === "string" && integer(item.count),
  );

export function validHome(value: unknown): boolean {
  return (
    isRecord(value) &&
    validSettings(value.settings) &&
    Array.isArray(value.featured) &&
    value.featured.every(validVehicle) &&
    validMakes(value.makes)
  );
}

export function validInventory(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.vehicles) &&
    value.vehicles.every(validVehicle) &&
    integer(value.total) &&
    integer(value.page, 1) &&
    integer(value.perPage, 1)
  );
}

export function validFacets(value: unknown): boolean {
  return (
    isRecord(value) &&
    validMakes(value.makes) &&
    Array.isArray(value.years) &&
    value.years.every((year) => integer(year))
  );
}

export function validLead(value: unknown): boolean {
  return (
    isRecord(value) &&
    strings(value, ["id", "name", "leadType", "createdAt"]) &&
    ["new", "contacted", "qualified", "closed", "spam"].includes(
      String(value.status),
    ) &&
    nullableStrings(value, [
      "phone",
      "email",
      "preferredContact",
      "message",
      "adminNotes",
      "emailStatus",
    ]) &&
    (value.notification == null || validNotification(value.notification)) &&
    isRecord(value.details) &&
    (value.details.financing === undefined ||
      financingSnapshotSchema.safeParse(value.details.financing).success) &&
    (value.details.vin === undefined ||
      typeof value.details.vin === "string") &&
    (value.details.wechat === undefined ||
      typeof value.details.wechat === "string") &&
    (value.details.mileage === undefined || number(value.details.mileage)) &&
    (value.vehicle == null ||
      (isRecord(value.vehicle) &&
        strings(value.vehicle, ["id", "slug", "title", "status"])))
  );
}

function validNotification(value: unknown): boolean {
  return (
    isRecord(value) &&
    ["pending", "sending", "retrying", "sent", "failed", "unknown"].includes(
      String(value.status),
    ) &&
    strings(value, ["recipient", "updatedAt"]) &&
    integer(value.attempts) &&
    nullableStrings(value, ["nextAttemptAt", "lastErrorCode", "messageId"])
  );
}

export function validDashboard(value: unknown): boolean {
  return (
    isRecord(value) &&
    isRecord(value.stats) &&
    ["available", "pending", "sold", "draft", "newLeads"].every((key) =>
      integer((value.stats as Record<string, unknown>)[key]),
    ) &&
    Array.isArray(value.vehicles) &&
    value.vehicles.every(validVehicle) &&
    Array.isArray(value.leads) &&
    value.leads.every(validLead)
  );
}

/** Generic callers still get contract checks for the resources rendered by admin. */
export function validMutationResponse(
  path: string,
  method: string,
  value: unknown,
): boolean {
  if (!isRecord(value)) return false;
  const pathname = path.split("?")[0];
  if (pathname === "/api/admin/settings")
    return (
      validSettings(value.settings) &&
      (value.notificationRecipient == null ||
        typeof value.notificationRecipient === "string")
    );
  if (pathname === "/api/admin/leads" && method === "GET")
    return Array.isArray(value.leads) && value.leads.every(validLead);
  if (/^\/api\/admin\/leads\/[^/]+(?:\/email\/retry)?$/.test(pathname))
    return validLead(value.lead);
  if (pathname === "/api/admin/audit" && method === "GET")
    return (
      Array.isArray(value.logs) &&
      value.logs.every(
        (log) =>
          isRecord(log) &&
          strings(log, [
            "id",
            "adminEmail",
            "action",
            "entityType",
            "createdAt",
          ]),
      )
    );
  if (pathname === "/api/leads") return value.ok === true;
  return true;
}
