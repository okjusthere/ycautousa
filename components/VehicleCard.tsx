import { Link } from "react-router-dom";
import type { Vehicle } from "../lib/types";
import { demoImage } from "../src/demo";
import { formatMileage, formatPrice } from "../lib/utils";
import { Icon } from "./Icon";

export function vehicleImage(vehicle: Vehicle): string {
  const cover =
    vehicle.images?.find((image) => image.isCover) ?? vehicle.images?.[0];
  return cover?.r2Key
    ? `/media/${cover.r2Key}?w=960&format=webp`
    : demoImage(vehicle);
}

export function StatusPill({ status }: { status: Vehicle["status"] }) {
  return (
    <span className={`status-pill status-pill--${status}`}>
      {status === "available"
        ? "Available"
        : status === "pending"
          ? "Pending"
          : status === "sold"
            ? "Sold"
            : status === "hidden"
              ? "Hidden"
              : "Draft"}
    </span>
  );
}

export function VehicleCard({
  vehicle,
  admin = false,
}: {
  vehicle: Vehicle;
  admin?: boolean;
}) {
  return (
    <article className={`vehicle-card ${admin ? "vehicle-card--admin" : ""}`}>
      <Link
        to={
          admin ? `/admin/vehicles/${vehicle.id}` : `/inventory/${vehicle.slug}`
        }
        className="vehicle-card-media"
      >
        <img
          src={vehicleImage(vehicle)}
          alt={vehicle.title}
          loading="lazy"
          decoding="async"
          width="960"
          height="640"
        />
        <span className="vehicle-card-index">
          {vehicle.year ?? "—"} / {vehicle.bodyType ?? "Vehicle"}
        </span>
        {vehicle.status !== "available" && (
          <StatusPill status={vehicle.status} />
        )}
      </Link>
      <div className="vehicle-card-body">
        <div className="vehicle-card-top">
          <div>
            <p className="vehicle-card-make">
              {vehicle.make ?? "Pre-owned"}
              {vehicle.trim ? ` · ${vehicle.trim}` : ""}
            </p>
            <h3>
              <Link
                to={
                  admin
                    ? `/admin/vehicles/${vehicle.id}`
                    : `/inventory/${vehicle.slug}`
                }
              >
                {vehicle.title}
              </Link>
            </h3>
          </div>
          <span className="vehicle-card-arrow">
            <Icon name="arrow" size={18} />
          </span>
        </div>
        <div className="vehicle-card-meta">
          <strong>{formatPrice(vehicle.priceCents)}</strong>
          <span>{formatMileage(vehicle.mileage)}</span>
        </div>
      </div>
    </article>
  );
}

export function VehicleMiniRow({ vehicle }: { vehicle: Vehicle }) {
  return (
    <Link className="vehicle-mini-row" to={`/admin/vehicles/${vehicle.id}`}>
      <img src={vehicleImage(vehicle)} alt="" width="64" height="48" />
      <span>
        <strong>{vehicle.title}</strong>
        <small>{vehicle.stockNumber ?? vehicle.slug}</small>
      </span>
      <StatusPill status={vehicle.status} />
    </Link>
  );
}
