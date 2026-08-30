import { describe, expect, it } from "vitest";
import {
  leadInputSchema,
  parseMileage,
  parseMoneyToCents,
  vehicleInputSchema,
} from "../../lib/validation";

describe("validation and normalization", () => {
  it("normalizes money and mileage", () => {
    expect(parseMoneyToCents("$31,500")).toBe(3150000);
    expect(parseMileage("45,200 mi")).toBe(45200);
    expect(parseMoneyToCents("nope")).toBeNull();
  });
  it("requires lead identity and a Turnstile token", () => {
    expect(
      leadInputSchema.safeParse({ name: "A", turnstileToken: "x" }).success,
    ).toBe(false);
    expect(
      leadInputSchema.safeParse({
        name: "Alex Buyer",
        email: "alex@example.com",
        turnstileToken: "x",
      }).success,
    ).toBe(true);
  });
  it("accepts VIN-less draft vehicles", () => {
    expect(
      vehicleInputSchema.safeParse({
        title: "Legacy vehicle",
        status: "draft",
        vin: "",
      }).success,
    ).toBe(true);
  });
});
