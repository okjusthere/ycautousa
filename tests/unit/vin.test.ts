import { describe, expect, it } from "vitest";
import {
  decodeVin,
  mergeDecodedIntoVehicle,
  normalizeVin,
  normalizeVpicResponse,
} from "../../lib/vin";

const valid = "1HGCM82633A004352";

describe("VIN helpers", () => {
  it("normalizes valid VINs and rejects ambiguous characters", () => {
    expect(normalizeVin(valid.toLowerCase())).toBe(valid);
    expect(normalizeVin("1HGCM82633A00435I")).toBeNull();
    expect(normalizeVin("123")).toBeNull();
    expect(normalizeVin("11111111111111111")).toBeNull();
  });
  it("maps useful vPIC fields and composes engine details", () => {
    const result = normalizeVpicResponse({
      Results: [
        {
          ModelYear: "2022",
          Make: "Toyota",
          Model: "RAV4",
          Trim: "XLE",
          BodyClass: "Sport Utility Vehicle",
          DriveType: "All-Wheel Drive",
          TransmissionStyle: "Automatic",
          FuelTypePrimary: "Gasoline",
          DisplacementL: "2.5",
          EngineModel: "A25A-FKS",
          EngineCylinders: "4",
        },
      ],
    });
    expect(result).toEqual({
      year: 2022,
      make: "Toyota",
      model: "RAV4",
      trim: "XLE",
      bodyType: "Sport Utility Vehicle",
      drivetrain: "All-Wheel Drive",
      transmission: "Automatic",
      fuelType: "Gasoline",
      engine: "2.5L A25A-FKS 4-cyl",
    });
  });
  it("fills only blank fields", () => {
    const result = mergeDecodedIntoVehicle(
      { year: 2020, make: "", model: null, trim: "Custom" },
      {
        year: 2022,
        make: "Toyota",
        model: "RAV4",
        trim: "XLE",
        bodyType: null,
        drivetrain: null,
        transmission: null,
        fuelType: null,
        engine: null,
      },
    );
    expect(result.filled).toEqual(["make", "model"]);
    expect(result.merged).toMatchObject({
      year: 2020,
      make: "Toyota",
      model: "RAV4",
      trim: "Custom",
    });
  });
  it("uses cache and fails gracefully after a source outage", async () => {
    const cache = new Map<
      string,
      { normalizedJson: string; rawJson: string | null }
    >();
    let calls = 0;
    const store = {
      get: async (vin: string) => cache.get(vin) ?? null,
      touch: async () => undefined,
      put: async (vin: string, normalizedJson: string, rawJson: string) => {
        cache.set(vin, { normalizedJson, rawJson });
      },
    };
    const payload = {
      Results: [{ ModelYear: "2021", Make: "Honda", Model: "Civic" }],
    };
    const first = await decodeVin(valid, store, async () => {
      calls += 1;
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    const second = await decodeVin(valid, store, async () => {
      calls += 1;
      return new Response("unreachable", { status: 500 });
    });
    expect(first.ok && first.fromCache).toBe(false);
    expect(second.ok && second.fromCache).toBe(true);
    expect(calls).toBe(1);
    const failed = await decodeVin("1HGCM82633A004351", store, async () => {
      throw new Error("offline");
    });
    expect(failed).toMatchObject({ ok: false });
  });
});
