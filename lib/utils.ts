export function nowIso(): string {
  return new Date().toISOString();
}

export function uid(prefix = ""): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prefix ? `${prefix}_${random}` : random;
}

/** A deterministic, dependency-free hash suitable for slugs and audit correlation (not cryptography). */
export function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function slugify(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 90) || "vehicle"
  );
}

export function vehicleSlug(
  title: string,
  vin: string | null,
  legacyUrl: string | null,
): string {
  const suffix = vin
    ? vin.slice(-6).toLowerCase()
    : stableHash(legacyUrl ?? title).slice(0, 8);
  return `${slugify(title)}-${suffix}`;
}

export function formatPrice(priceCents: number | null): string {
  if (priceCents === null || !Number.isFinite(priceCents))
    return "Call for price";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

export function formatMileage(mileage: number | null): string {
  if (mileage === null || !Number.isFinite(mileage))
    return "Mileage on request";
  return `${new Intl.NumberFormat("en-US").format(mileage)} mi`;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

export function safeUrl(value: string, fallback = "#"): string {
  try {
    const url = new URL(value, "https://example.invalid");
    if (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      url.protocol === "tel:" ||
      url.protocol === "sms:" ||
      url.protocol === "mailto:"
    )
      return value;
  } catch {
    // fall through
  }
  return fallback;
}

export function isProductionOrigin(origin: string): boolean {
  return /^https:\/\//i.test(origin) && !/localhost|127\.0\.0\.1/i.test(origin);
}
