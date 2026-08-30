import type { VehicleStatus } from "./types";

const transitions: Record<VehicleStatus, readonly VehicleStatus[]> = {
  available: ["available", "pending", "sold", "draft", "hidden"],
  pending: ["pending", "available", "sold", "draft", "hidden"],
  sold: ["sold", "available", "draft", "hidden"],
  draft: ["draft", "available", "hidden"],
  hidden: ["hidden", "draft", "available", "pending", "sold"],
};

export function canTransitionVehicle(
  from: VehicleStatus,
  to: VehicleStatus,
): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function assertVehicleTransition(
  from: VehicleStatus,
  to: VehicleStatus,
): void {
  if (!canTransitionVehicle(from, to))
    throw new Error(`Vehicle cannot transition from ${from} to ${to}`);
}
