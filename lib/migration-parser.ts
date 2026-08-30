import { parseMileage, parseMoneyToCents } from "./validation";
import { stableHash, vehicleSlug } from "./utils";

export type LegacyRecord = {
  legacyUrl: string;
  originalTitle: string;
  original: {
    category: string | null;
    vin: string | null;
    mileage: string | null;
    price: string | null;
    exteriorColor: string | null;
    drivetrain: string | null;
    transmission: string | null;
    description: string | null;
  };
  title: string;
  year: number | null;
  category: string | null;
  model: string | null;
  vin: string | null;
  mileage: number | null;
  priceCents: number | null;
  exteriorColor: string | null;
  drivetrain: string | null;
  transmission: string | null;
  description: string | null;
  imageUrls: string[];
  slug: string;
  warnings: string[];
  normalizationChanges: string[];
  status: "available" | "draft";
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function clean(value: string | null | undefined): string {
  return decodeEntities(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function labelValue(html: string, labels: string[]): string | null {
  const labelPattern = labels
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const visible = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:li|div|p|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
  const pattern = new RegExp(
    `^\\s*(?:${labelPattern})\\s*[:：]?\\s*(.*?)\\s*$`,
    "i",
  );
  const lines = visible.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(pattern);
    if (match && clean(match[1])) return clean(match[1]);
    if (match && index + 1 < lines.length && !clean(match[1])) {
      const next = clean(lines[index + 1]);
      if (
        next &&
        !/whatsapp|wechat|copyright|facebook|sitemap|email\s*:/i.test(next) &&
        !new RegExp(`^(?:${labelPattern})\\s*[:：]`, "i").test(next)
      )
        return next.slice(0, 1000);
    }
  }
  return null;
}

function normalizeTitle(raw: string): { title: string; changes: string[] } {
  const changes: string[] = [];
  const before = clean(raw);
  let title = before
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word.length <= 3
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
    )
    .join(" ");
  for (const acronym of [
    "RAV4",
    "CR-V",
    "F-150",
    "GLC",
    "GLC300",
    "RX350",
    "GX460",
    "MDX",
    "X5",
    "XLE",
    "EX-L",
    "LX",
    "SV",
    "SX",
    "AWD",
    "4WD",
    "4MATIC",
    "MINIVAN",
    "SUV",
  ]) {
    const pattern = new RegExp(
      `\\b${acronym.replace(/[-]/g, "[- ]?")}\\b`,
      "i",
    );
    if (pattern.test(title)) title = title.replace(pattern, acronym);
  }
  for (const [alias, proper] of [
    ["Mercedes-benz", "Mercedes-Benz"],
    ["Bmw", "BMW"],
    ["Gmc", "GMC"],
    ["Cr-v", "CR-V"],
    ["F-150", "F-150"],
  ] as const) {
    const pattern = new RegExp(`\\b${alias.replace("-", "[- ]?")}\\b`, "i");
    if (pattern.test(title)) title = title.replace(pattern, proper);
  }
  if (/\bporche\b/i.test(title)) {
    title = title.replace(/\bporche\b/gi, "Porsche");
    changes.push("PORCHE normalized to Porsche");
  }
  return {
    title: title || "Pre-owned vehicle",
    changes:
      before !== title
        ? [...changes, "title capitalization normalized"]
        : changes,
  };
}

function categoryFromHtml(html: string): string | null {
  const linked = html.match(
    /Category\s*[:：]?\s*<a[^>]+href=["']\/([^/"']+?)(?:\.html)?["']/i,
  );
  if (linked?.[1])
    return decodeURIComponent(linked[1]).replace(/[-_]+/g, " ").trim();
  return labelValue(html, ["Category", "Make"]);
}

function normalizeMake(value: string | null, changes: string[]): string | null {
  if (!value) return null;
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
  const aliases: Record<string, string> = {
    nissan: "Nissan",
    honda: "Honda",
    toyota: "Toyota",
    lexus: "Lexus",
    porsche: "Porsche",
    porche: "Porsche",
    benz: "Mercedes-Benz",
    "mercedes benz": "Mercedes-Benz",
    "mercedes-benz": "Mercedes-Benz",
    bmw: "BMW",
    subaru: "Subaru",
    ford: "Ford",
    acura: "Acura",
    kia: "Kia",
    chevrolet: "Chevrolet",
    chevy: "Chevrolet",
    gmc: "GMC",
    chrysler: "Chrysler",
    volkswagen: "Volkswagen",
    mazda: "Mazda",
    infiniti: "Infiniti",
    hyundai: "Hyundai",
    jeep: "Jeep",
    volvo: "Volvo",
    audi: "Audi",
  };
  const normalized =
    aliases[key] ??
    value.trim().charAt(0).toUpperCase() + value.trim().slice(1).toLowerCase();
  if (normalized !== value.trim())
    changes.push(`${value.trim()} normalized to ${normalized}`);
  return normalized;
}

function deriveModel(title: string, make: string | null): string | null {
  const remainder = title
    .replace(/^\d{4}\s+/, "")
    .replace(
      make
        ? new RegExp(`^${make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i")
        : /^/,
      "",
    )
    .replace(
      /\b(?:AWD|FWD|RWD|4WD|4MATIC|4D|2D|SUV|SEDAN|MINIVAN|WAGON|COUPE|TRUCK)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!remainder) return null;
  return remainder.split(" ").slice(0, 3).join(" ");
}

export function isLikelyVehicleImage(url: string): boolean {
  try {
    const parsed = new URL(url, "https://www.ycautousa.com");
    const path = parsed.pathname.toLowerCase();
    if (!/\/uploads\/image\//.test(path)) return false;
    if (
      /(logo|captcha|qr|wechat|footer|header|team|news|icon|avatar)/i.test(path)
    )
      return false;
    return /\.(?:jpe?g|png|webp)(?:$|\?)/i.test(path);
  } catch {
    return false;
  }
}

export function parseLegacyProduct(
  html: string,
  legacyUrl: string,
): LegacyRecord {
  const titleMatch =
    html.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const rawTitle =
    clean(titleMatch?.[1]) ||
    labelValue(html, ["Product name", "Title"]) ||
    "Pre-owned vehicle";
  const titleResult = normalizeTitle(rawTitle);
  const title = titleResult.title;
  const changes = titleResult.changes;
  const yearMatch = title.match(/\b(19\d{2}|20\d{2}|21\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const vinRaw = labelValue(html, ["VIN"]);
  const vin =
    vinRaw && /^[A-HJ-NPR-Z0-9]{17}$/i.test(vinRaw.replace(/\s+/g, ""))
      ? vinRaw.replace(/\s+/g, "").toUpperCase()
      : null;
  const mileage = parseMileage(labelValue(html, ["MILEAGE", "Mileage"]));
  const priceCents = parseMoneyToCents(labelValue(html, ["PRICE", "Price"]));
  const category = categoryFromHtml(html);
  const normalizedCategory = normalizeMake(category, changes);
  const model = deriveModel(title, normalizedCategory);
  const exteriorColor = labelValue(html, ["COLOR", "Color", "Exterior color"]);
  const drivetrain = labelValue(html, [
    "DRIVE TRAIN",
    "Drivetrain",
    "Drive train",
  ]);
  const transmissionRaw = labelValue(html, ["TRANSMISSION", "Transmission"]);
  const transmission =
    transmissionRaw && /^auto$/i.test(transmissionRaw)
      ? "Automatic"
      : transmissionRaw;
  if (transmissionRaw && transmissionRaw !== transmission)
    changes.push("AUTO normalized to Automatic");
  const description =
    labelValue(html, ["Product description", "Description"]) || null;
  const imageUrls = [
    ...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi),
  ]
    .map((match) => new URL(match[1], legacyUrl))
    .filter((url) => url.host === new URL(legacyUrl).host)
    .map((url) => url.toString())
    .filter(isLikelyVehicleImage)
    .filter((url, index, all) => all.indexOf(url) === index);
  const warnings: string[] = [];
  if (!vin) warnings.push("VIN missing or invalid");
  if (priceCents === null) warnings.push("price missing");
  if (mileage === null) warnings.push("mileage missing");
  if (imageUrls.length === 0) warnings.push("no valid vehicle image");
  if (!rawTitle || title === "Pre-owned vehicle")
    warnings.push("title could not be normalized");
  const slug = vehicleSlug(title, vin, legacyUrl);
  return {
    legacyUrl,
    originalTitle: rawTitle,
    original: {
      category,
      vin: vinRaw,
      mileage: labelValue(html, ["MILEAGE", "Mileage"]),
      price: labelValue(html, ["PRICE", "Price"]),
      exteriorColor: labelValue(html, ["COLOR", "Color", "Exterior color"]),
      drivetrain: labelValue(html, [
        "DRIVE TRAIN",
        "Drivetrain",
        "Drive train",
      ]),
      transmission: transmissionRaw,
      description: labelValue(html, ["Product description", "Description"]),
    },
    title,
    year,
    category: normalizedCategory,
    model,
    vin,
    mileage,
    priceCents,
    exteriorColor,
    drivetrain,
    transmission,
    description,
    imageUrls,
    slug: `${slug}-${stableHash(legacyUrl).slice(0, 4)}`,
    warnings,
    normalizationChanges: changes,
    status:
      priceCents !== null &&
      mileage !== null &&
      imageUrls.length > 0 &&
      title !== "Pre-owned vehicle"
        ? "available"
        : "draft",
  };
}

export function discoverProductLinks(html: string, baseUrl: string): string[] {
  const baseOrigin = new URL(baseUrl).origin;
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => {
      try {
        const url = new URL(match[1], baseUrl);
        url.hash = "";
        return url.toString();
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value))
    .filter((url) => new URL(url).origin === baseOrigin)
    .filter((url) => /-p\.html(?:$|\?)/i.test(new URL(url).pathname));
  return [...new Set(links)];
}

export function discoverNextPages(html: string, baseUrl: string): string[] {
  const baseOrigin = new URL(baseUrl).origin;
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => {
      try {
        const url = new URL(match[1], baseUrl);
        url.hash = "";
        return url.toString();
      } catch {
        return null;
      }
    })
    .filter((value): value is string => Boolean(value));
  const sameOriginLinks = links.filter(
    (url) => new URL(url).origin === baseOrigin,
  );
  return [
    ...new Set(
      sameOriginLinks.filter((url) =>
        /products(?:_\d+)?\.html$/i.test(new URL(url).pathname),
      ),
    ),
  ];
}
