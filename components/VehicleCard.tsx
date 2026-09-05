import { Link } from "react-router-dom";
import type { Vehicle } from "../lib/types";
import { demoImage } from "../src/demo";
import { Icon } from "./Icon";
import {
  formatLocalizedMileage,
  formatLocalizedPrice,
  useLocale,
} from "../src/i18n";

export function vehicleImage(vehicle: Vehicle): string {
  const cover =
    vehicle.images?.find((image) => image.isCover) ?? vehicle.images?.[0];
  return cover?.r2Key
    ? `/media/${cover.r2Key}?w=960&format=webp`
    : demoImage(vehicle);
}

export function StatusPill({ status }: { status: Vehicle["status"] }) {
  const { copy } = useLocale();
  return (
    <span className={`status-pill status-pill--${status}`}>
      {status === "available"
        ? copy.common.available
        : status === "pending"
          ? copy.common.pending
          : status === "sold"
            ? copy.common.sold
            : status === "hidden"
              ? copy.common.hidden
              : copy.common.draft}
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
  const { copy, locale, path } = useLocale();
  const destination = admin
    ? `/admin/vehicles/${vehicle.id}`
    : path(`/inventory/${vehicle.slug}`);
  return (
    <article className={`vehicle-card ${admin ? "vehicle-card--admin" : ""}`}>
      <Link to={destination} className="vehicle-card-media">
        <img
          src={vehicleImage(vehicle)}
          alt={vehicle.title}
          loading="lazy"
          decoding="async"
          width="960"
          height="640"
        />
        <span className="vehicle-card-index">
          {vehicle.year ?? "—"} / {vehicle.bodyType ?? copy.common.vehicle}
        </span>
        {vehicle.status !== "available" && (
          <StatusPill status={vehicle.status} />
        )}
      </Link>
      <div className="vehicle-card-body">
        <div className="vehicle-card-top">
          <div>
            <p className="vehicle-card-make">
              {vehicle.make ?? copy.common.preowned}
              {vehicle.trim ? ` · ${vehicle.trim}` : ""}
            </p>
            <h3>
              <Link to={destination}>{vehicle.title}</Link>
            </h3>
          </div>
          <span className="vehicle-card-arrow">
            <Icon name="arrow" size={18} />
          </span>
        </div>
        <div className="vehicle-card-meta">
          <strong>{formatLocalizedPrice(vehicle.priceCents, locale)}</strong>
          <span>{formatLocalizedMileage(vehicle.mileage, locale)}</span>
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
