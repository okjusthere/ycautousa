import { vinSchema } from "./validation";

export type VinDecoded = {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyType: string | null;
  drivetrain: string | null;
  transmission: string | null;
  fuelType: string | null;
  engine: string | null;
};

export type VpicResponse = {
  Results?: Array<Record<string, unknown>>;
  Message?: string;
  SearchCriteria?: string;
};

export function normalizeVin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = vinSchema.safeParse(value);
  if (!parsed.success || parsed.data.length !== 17) return null;
  return parsed.data;
}

function text(result: Record<string, unknown>, key: string): string | null {
  const value = result[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (
    !trimmed ||
    /^not applicable$/i.test(trimmed) ||
    /^0$/.test(trimmed) ||
    /^null$/i.test(trimmed)
  )
    return null;
  return trimmed;
}

export function normalizeVpicResponse(payload: unknown): VinDecoded | null {
  if (!payload || typeof payload !== "object") return null;
  const result = Array.isArray((payload as VpicResponse).Results)
    ? (payload as VpicResponse).Results?.find(
        (candidate) =>
          typeof candidate === "object" &&
          (candidate.Make || candidate.Model || candidate.ModelYear),
      )
    : undefined;
  if (!result) return null;
  const yearValue = text(result, "ModelYear");
  const parsedYear = yearValue ? Number.parseInt(yearValue, 10) : NaN;
  const displacement = text(result, "DisplacementL");
  const engineModel = text(result, "EngineModel");
  const cylinders = text(result, "EngineCylinders");
  const engineParts = [
    displacement ? `${displacement}L` : null,
    engineModel,
    cylinders ? `${cylinders}-cyl` : null,
  ].filter(Boolean);
  return {
    year: Number.isFinite(parsedYear) ? parsedYear : null,
    make: text(result, "Make"),
    model: text(result, "Model"),
    trim: text(result, "Trim"),
    bodyType: text(result, "BodyClass"),
    drivetrain: text(result, "DriveType"),
    transmission: text(result, "TransmissionStyle"),
    fuelType: text(result, "FuelTypePrimary"),
    engine: engineParts.length ? engineParts.join(" ") : null,
  };
}

export function mergeDecodedIntoVehicle<T extends Record<string, unknown>>(
  vehicle: T,
  decoded: VinDecoded,
): { merged: T; filled: string[] } {
  const fieldMap: Array<[keyof VinDecoded, string]> = [
    ["year", "year"],
    ["make", "make"],
    ["model", "model"],
    ["trim", "trim"],
    ["bodyType", "bodyType"],
    ["drivetrain", "drivetrain"],
    ["transmission", "transmission"],
    ["fuelType", "fuelType"],
    ["engine", "engine"],
  ];
  const merged = { ...vehicle };
  const filled: string[] = [];
  for (const [source, target] of fieldMap) {
    const next = decoded[source];
    const current = merged[target];
    if (
      (current === null || current === undefined || current === "") &&
      next !== null &&
      next !== undefined &&
      next !== ""
    ) {
      (merged as Record<string, unknown>)[target] = next;
      filled.push(target);
    }
  }
  return { merged, filled };
}

export type VinFetchResult =
  | { ok: true; decoded: VinDecoded; fromCache: boolean }
  | { ok: false; message: string; fromCache: false };

export interface VinCacheStore {
  get(
    vin: string,
  ): Promise<{ normalizedJson: string; rawJson: string | null } | null>;
  touch(vin: string, at: string): Promise<void>;
  put(
    vin: string,
    normalizedJson: string,
    rawJson: string,
    at: string,
  ): Promise<void>;
}

export async function decodeVin(
  vin: string,
  cache: VinCacheStore,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<VinFetchResult> {
  const normalizedVin = normalizeVin(vin);
  if (!normalizedVin)
    return {
      ok: false,
      message: "Enter a valid 17-character VIN before decoding.",
      fromCache: false,
    };
  const nowIso = now.toISOString();
  const cached = await cache.get(normalizedVin);
  if (cached) {
    try {
      const decoded = JSON.parse(cached.normalizedJson) as VinDecoded;
      await cache.touch(normalizedVin, nowIso);
      return { ok: true, decoded, fromCache: true };
    } catch {
      // Ignore malformed stale cache and refresh from source.
    }
  }
  const endpoint = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(normalizedVin)}?format=json`;
  let response: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      response = await fetchImpl(endpoint, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (response.ok) break;
    } catch {
      clearTimeout(timeout);
      response = null;
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!response?.ok)
    return {
      ok: false,
      message: "VIN auto-fill unavailable — enter details manually",
      fromCache: false,
    };
  try {
    const raw = (await response.json()) as VpicResponse;
    const decoded = normalizeVpicResponse(raw);
    if (!decoded)
      return {
        ok: false,
        message: "VIN auto-fill unavailable — enter details manually",
        fromCache: false,
      };
    await cache.put(
      normalizedVin,
      JSON.stringify(decoded),
      JSON.stringify(raw),
      nowIso,
    );
    return { ok: true, decoded, fromCache: false };
  } catch {
    return {
      ok: false,
      message: "VIN auto-fill unavailable — enter details manually",
      fromCache: false,
    };
  }
}
