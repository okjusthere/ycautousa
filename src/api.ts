import type { DashboardStats, Lead, SiteSettings, Vehicle } from "../lib/types";
import { demoLeads, demoSettings, demoStats, demoVehicles } from "./demo";

export type InventoryResponse = {
  vehicles: Vehicle[];
  total: number;
  page: number;
  perPage: number;
};

const canUseLocalDemo = () =>
  typeof window !== "undefined" &&
  /localhost|127\.0\.0\.1/.test(window.location.hostname);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

export async function getHome(): Promise<{
  settings: SiteSettings;
  featured: Vehicle[];
  makes: Array<{ make: string; count: number }>;
}> {
  try {
    return await request("/api/public/home");
  } catch (error) {
    if (!canUseLocalDemo()) throw error;
    return {
      settings: demoSettings,
      featured: demoVehicles.filter((vehicle) => vehicle.featured),
      makes: makeCounts(demoVehicles),
    };
  }
}

export async function getInventory(query = ""): Promise<InventoryResponse> {
  try {
    return await request(`/api/inventory${query ? `?${query}` : ""}`);
  } catch (error) {
    if (!canUseLocalDemo()) throw error;
    const params = new URLSearchParams(query);
    let rows = demoVehicles.filter(
      (vehicle) => vehicle.status !== "draft" && vehicle.status !== "hidden",
    );
    const text = (key: string) => params.get(key)?.toLowerCase() || "";
    if (text("make"))
      rows = rows.filter(
        (vehicle) => vehicle.make?.toLowerCase() === text("make"),
      );
    if (text("model"))
      rows = rows.filter(
        (vehicle) => vehicle.model?.toLowerCase() === text("model"),
      );
    const minYear = Number(params.get("minYear"));
    if (minYear)
      rows = rows.filter((vehicle) => (vehicle.year ?? 0) >= minYear);
    const maxYear = Number(params.get("maxYear"));
    if (maxYear)
      rows = rows.filter((vehicle) => (vehicle.year ?? 0) <= maxYear);
    const minPrice = Number(params.get("minPrice"));
    if (minPrice)
      rows = rows.filter(
        (vehicle) => (vehicle.priceCents ?? 0) >= minPrice * 100,
      );
    const maxPrice = Number(params.get("maxPrice"));
    if (maxPrice)
      rows = rows.filter(
        (vehicle) => (vehicle.priceCents ?? Infinity) <= maxPrice * 100,
      );
    const maxMileage = Number(params.get("maxMileage"));
    if (maxMileage)
      rows = rows.filter(
        (vehicle) => (vehicle.mileage ?? Infinity) <= maxMileage,
      );
    const sort = params.get("sort");
    rows = [...rows].sort((a, b) =>
      sort === "price_asc"
        ? (a.priceCents ?? Infinity) - (b.priceCents ?? Infinity)
        : sort === "price_desc"
          ? (b.priceCents ?? -Infinity) - (a.priceCents ?? -Infinity)
          : sort === "mileage_asc"
            ? (a.mileage ?? Infinity) - (b.mileage ?? Infinity)
            : (b.year ?? 0) - (a.year ?? 0),
    );
    return { vehicles: rows, total: rows.length, page: 1, perPage: 12 };
  }
}

export async function getVehicle(
  slug: string,
  admin = false,
): Promise<Vehicle> {
  try {
    return (
      await request<{ vehicle: Vehicle }>(
        admin
          ? `/api/admin/vehicles/${encodeURIComponent(slug)}`
          : `/api/vehicles/${encodeURIComponent(slug)}`,
      )
    ).vehicle;
  } catch (error) {
    if (!canUseLocalDemo()) throw error;
    const found = demoVehicles.find(
      (vehicle) => vehicle.slug === slug || vehicle.id === slug,
    );
    if (!found) throw new Error("Vehicle not found");
    return found;
  }
}

export async function getDashboard(): Promise<{
  stats: DashboardStats;
  vehicles: Vehicle[];
  leads: Lead[];
}> {
  try {
    return await request("/api/admin/dashboard");
  } catch (error) {
    if (!canUseLocalDemo()) throw error;
    return { stats: demoStats, vehicles: demoVehicles, leads: demoLeads };
  }
}

export async function getAdminVehicles(query = ""): Promise<InventoryResponse> {
  try {
    return await request(`/api/admin/vehicles${query ? `?${query}` : ""}`);
  } catch (error) {
    if (!canUseLocalDemo()) throw error;
    return {
      vehicles: demoVehicles,
      total: demoVehicles.length,
      page: 1,
      perPage: 25,
    };
  }
}

export async function saveVehicle(
  payload: Record<string, unknown>,
  id?: string,
): Promise<{ id: string; vehicle?: Vehicle }> {
  try {
    return await request(
      id
        ? `/api/admin/vehicles/${encodeURIComponent(id)}`
        : "/api/admin/vehicles",
      { method: id ? "PUT" : "POST", body: JSON.stringify(payload) },
    );
  } catch (error) {
    if (!canUseLocalDemo()) throw error;
    const local = {
      ...(demoVehicles.find((vehicle) => vehicle.id === id) ?? demoVehicles[0]),
      ...payload,
      id: id ?? `local-${Date.now()}`,
      slug: String(payload.title ?? "vehicle")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-"),
      features: Array.isArray(payload.features)
        ? (payload.features as string[])
        : [],
    } as Vehicle;
    return { id: local.id, vehicle: local };
  }
}

export async function mutate(
  path: string,
  method: string,
  body?: unknown,
): Promise<any> {
  return request(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function trackEvent(
  eventName: "phone_click" | "sms_click" | "email_click" | "availability_open",
  vehicleId?: string | null,
): void {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({ eventName, vehicleId: vehicleId ?? null });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
  } catch {
    /* fall back to fetch */
  }
  void fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

function makeCounts(
  vehicles: Vehicle[],
): Array<{ make: string; count: number }> {
  const map = new Map<string, number>();
  for (const vehicle of vehicles.filter((item) => item.status === "available"))
    if (vehicle.make) map.set(vehicle.make, (map.get(vehicle.make) ?? 0) + 1);
  return [...map.entries()]
    .map(([make, count]) => ({ make, count }))
    .sort((a, b) => b.count - a.count);
}
