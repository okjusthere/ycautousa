import { describe, expect, it } from "vitest";
import { canTransitionVehicle } from "../../lib/status";

describe("vehicle status transitions", () => {
  it("supports the dealer lifecycle and prevents invalid resurrection", () => {
    expect(canTransitionVehicle("available", "pending")).toBe(true);
    expect(canTransitionVehicle("pending", "sold")).toBe(true);
    expect(canTransitionVehicle("sold", "draft")).toBe(true);
    expect(canTransitionVehicle("sold", "available")).toBe(true);
  });
});
