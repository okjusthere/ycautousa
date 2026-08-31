import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type {
  DashboardStats,
  Lead,
  SiteSettings,
  Vehicle,
  VehicleImage,
  VehicleStatus,
} from "../lib/types";
import { formatMileage, formatPrice } from "../lib/utils";
import {
  getAdminVehicles,
  getDashboard,
  getHome,
  getInventory,
  getVehicle,
  mutate,
  saveVehicle,
  trackEvent,
} from "./api";
import { demoSettings, demoVehicles } from "./demo";
import { AdminLayout, PublicLayout } from "../components/Layout";
import { Icon } from "../components/Icon";
import {
  StatusPill,
  VehicleCard,
  VehicleMiniRow,
  vehicleImage,
} from "../components/VehicleCard";
import { LeadForm } from "../components/LeadForm";

function usePageMeta(
  title: string,
  description?: string,
  noIndex = false,
  image?: string,
) {
  useEffect(() => {
    document.title = title;
    if (description)
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", description);
    const upsertMeta = (property: string, content: string) => {
      let node = document.querySelector(`meta[property="${property}"]`);
      if (!node) {
        node = document.createElement("meta");
        node.setAttribute("property", property);
        document.head.appendChild(node);
      }
      node.setAttribute("content", content);
    };
    upsertMeta("og:title", title);
    if (description) upsertMeta("og:description", description);
    upsertMeta("og:url", window.location.href);
    if (image)
      upsertMeta("og:image", new URL(image, window.location.origin).toString());
    upsertMeta("twitter:card", "summary_large_image");
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}${window.location.pathname}`;
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute(
      "content",
      noIndex ? "noindex,nofollow" : "index,follow",
    );
    return () => {
      robots?.setAttribute("content", "index,follow");
    };
  }, [title, description, noIndex, image]);
}

function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-orbit" />
      <span>{label}…</span>
    </div>
  );
}
function NotFound({
  label = "We couldn’t find that page.",
}: {
  label?: string;
}) {
  return (
    <section className="empty-page container">
      <p className="eyebrow">404 / Not found</p>
      <h1>{label}</h1>
      <p>Try browsing the current inventory or return home.</p>
      <Link className="button button--dark" to="/inventory">
        Browse inventory <Icon name="arrow" size={17} />
      </Link>
    </section>
  );
}
function ErrorBlock({
  message = "Something went wrong. Please try again.",
}: {
  message?: string;
}) {
  return (
    <div className="inline-error" role="alert">
      <Icon name="close" size={17} /> {message}
    </div>
  );
}

function HomePage() {
  const localDemo =
    typeof window !== "undefined" &&
    /localhost|127\.0\.0\.1/.test(window.location.hostname);
  const [data, setData] = useState<{
    settings: SiteSettings;
    featured: Vehicle[];
    makes: Array<{ make: string; count: number }>;
  }>({
    settings: demoSettings,
    featured: localDemo
      ? demoVehicles.filter((vehicle) => vehicle.featured)
      : [],
    makes: [],
  });
  const [make, setMake] = useState("");
  const [loadError, setLoadError] = useState("");
  const navigate = useNavigate();
  usePageMeta(data.settings.seoTitle, data.settings.seoDescription);
  useEffect(() => {
    getHome()
      .then(setData)
      .catch(() => setLoadError("Live inventory is temporarily unavailable."));
  }, []);
  const settings = data.settings;
  function browse(event: FormEvent) {
    event.preventDefault();
    navigate(`/inventory${make ? `?make=${encodeURIComponent(make)}` : ""}`);
  }
  return (
    <>
      {loadError && (
        <div className="container inline-error">
          <Icon name="close" size={17} />
          {loadError}
        </div>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "AutoDealer",
            name: settings.businessName,
            url: window.location.origin,
            logo: `${window.location.origin}/brand/logo-dark.png`,
            image: `${window.location.origin}/brand/team.jpg`,
            telephone: settings.phone,
            email: settings.email,
            address: {
              "@type": "PostalAddress",
              streetAddress: settings.address,
            },
          }),
        }}
      />
      <section className="hero">
        <div className="hero-sheen" />
        <div className="container hero-grid">
          <div className="hero-copy reveal">
            <p className="eyebrow eyebrow--light">
              <span className="eyebrow-dot" /> Flushing, New York · Est. local
            </p>
            <h1>{settings.heroTitle}</h1>
            <p className="hero-subtitle">{settings.heroSubtitle}</p>
            <form className="hero-search" onSubmit={browse}>
              <label className="sr-only" htmlFor="hero-make">
                Browse by make
              </label>
              <select
                id="hero-make"
                value={make}
                onChange={(event) => setMake(event.target.value)}
              >
                <option value="">I’m looking for…</option>
                {data.makes.map((item) => (
                  <option key={item.make} value={item.make}>
                    {item.make} ({item.count})
                  </option>
                ))}
              </select>
              <button className="button button--red" type="submit">
                Browse inventory <Icon name="arrow" size={17} />
              </button>
            </form>
            <div className="hero-proof">
              <span>
                <Icon name="shield" size={16} /> Curated local inventory
              </span>
              <span>
                <Icon name="pin" size={16} /> Visit us in Flushing
              </span>
            </div>
          </div>
          <div className="hero-mark reveal reveal-delay-2" aria-hidden="true">
            <span>YC</span>
            <small>
              AUTOMOTIVE
              <br />
              SELECTION
            </small>
            <i />
          </div>
        </div>
        <div className="hero-ticker">
          <div className="container">
            <span>Current inventory</span>
            <span className="ticker-line" />
            <span>Updated daily</span>
            <span className="ticker-arrow">↘</span>
          </div>
        </div>
      </section>
      <section className="section section--featured">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / Handpicked</p>
              <h2>Featured vehicles</h2>
            </div>
            <Link className="arrow-link" to="/inventory">
              View all inventory <Icon name="arrow" size={17} />
            </Link>
          </div>
          {data.featured.length ? (
            <div className="vehicle-grid vehicle-grid--featured">
              {data.featured.slice(0, 4).map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          ) : (
            <div className="empty-card">
              <Icon name="car" />
              <p>New vehicles are arriving soon.</p>
              <Link to="/inventory">See inventory</Link>
            </div>
          )}
        </div>
      </section>
      <section className="section section--makes">
        <div className="container makes-layout">
          <div className="makes-intro">
            <p className="eyebrow">02 / Find your fit</p>
            <h2>
              Browse by
              <br />
              <em>make.</em>
            </h2>
            <p>
              Start with a name you trust. Our live inventory changes as
              vehicles find new homes.
            </p>
            <Link className="arrow-link" to="/inventory">
              Explore all <Icon name="arrow" size={17} />
            </Link>
          </div>
          <div className="make-list">
            {(data.makes.length
              ? data.makes
              : localDemo
                ? [
                    { make: "Toyota", count: 2 },
                    { make: "Honda", count: 1 },
                    { make: "Mercedes-Benz", count: 1 },
                    { make: "Subaru", count: 1 },
                  ]
                : []
            )
              .slice(0, 8)
              .map((item, index) => (
                <Link
                  key={item.make}
                  to={`/inventory?make=${encodeURIComponent(item.make)}`}
                  className="make-row"
                >
                  <span className="make-number">0{index + 1}</span>
                  <strong>{item.make}</strong>
                  <span className="make-count">
                    {item.count} {item.count === 1 ? "vehicle" : "vehicles"}
                  </span>
                  <Icon name="arrow" size={18} />
                </Link>
              ))}
          </div>
        </div>
      </section>
      <section className="section section--why">
        <div className="container why-layout">
          <div className="why-stamp">
            <span>YC</span>
            <small>
              YOUR CHOICE
              <br />
              YOUR ROAD
            </small>
          </div>
          <div>
            <p className="eyebrow">03 / The YC way</p>
            <h2>
              A better way to
              <br />
              <em>shop local.</em>
            </h2>
            <p className="why-copy">{settings.whyChooseText}</p>
            <div className="why-points">
              <div>
                <span>01</span>
                <strong>Clear details</strong>
                <p>Useful specs and honest photos for every vehicle.</p>
              </div>
              <div>
                <span>02</span>
                <strong>Human help</strong>
                <p>Call, text, or send a note—no maze of forms.</p>
              </div>
              <div>
                <span>03</span>
                <strong>Local roots</strong>
                <p>Find us on Northern Boulevard in Flushing.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="cta-band">
        <div className="container cta-band-inner">
          <div>
            <p className="eyebrow eyebrow--light">Ready when you are</p>
            <h2>
              Let’s find the
              <br />
              <em>right one.</em>
            </h2>
          </div>
          <Link className="button button--cream" to="/contact">
            Talk to YC Auto <Icon name="arrow" size={17} />
          </Link>
        </div>
      </section>
    </>
  );
}

function InventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<{
    vehicles: Vehicle[];
    total: number;
    page: number;
    perPage: number;
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const query = searchParams.toString();
  usePageMeta(
    "Inventory | YC Auto USA",
    "Browse current pre-owned vehicles at YC Auto USA in Flushing, New York.",
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    getInventory(query)
      .then((result) => {
        if (active) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (active) {
          setLoadError(
            reason instanceof Error
              ? reason.message
              : "Unable to load inventory.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [query]);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setSearchParams(next);
  };
  const clear = () => setSearchParams({});
  return (
    <section className="inventory-page">
      <div className="container inventory-head">
        <div>
          <p className="eyebrow">Inventory / Live selection</p>
          <h1>
            Find your next
            <br />
            <em>everyday.</em>
          </h1>
        </div>
        <div className="inventory-count">
          <span>{data?.total ?? "—"}</span>
          <small>
            vehicles
            <br />
            to explore
          </small>
        </div>
      </div>
      <div className="container inventory-layout">
        <aside
          className={`filter-panel ${filterOpen ? "filter-panel--open" : ""}`}
        >
          <div className="filter-header">
            <span className="eyebrow">Filter inventory</span>
            <button
              className="icon-button filter-close"
              onClick={() => setFilterOpen(false)}
              aria-label="Close filters"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          <FilterControls params={searchParams} update={update} clear={clear} />
          <button
            className="button button--dark filter-done"
            onClick={() => setFilterOpen(false)}
          >
            Show vehicles <Icon name="arrow" size={16} />
          </button>
        </aside>
        {filterOpen && (
          <button
            className="filter-overlay"
            aria-label="Close filters"
            onClick={() => setFilterOpen(false)}
          />
        )}
        <div className="inventory-results">
          <div className="results-toolbar">
            <button
              className="filter-trigger"
              onClick={() => setFilterOpen(true)}
            >
              <Icon name="filter" size={17} /> Filters
              {searchParams.size > 0 && <span>{searchParams.size}</span>}
            </button>
            <label className="sort-control">
              <span>Sort</span>
              <select
                value={searchParams.get("sort") ?? "newest"}
                onChange={(event) => update("sort", event.target.value)}
              >
                <option value="newest">Newest added</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="mileage_asc">Mileage: low to high</option>
                <option value="year_desc">Year: newest</option>
              </select>
              <Icon name="chevron" size={14} />
            </label>
          </div>
          {loading ? (
            <Loading label="Loading inventory" />
          ) : loadError ? (
            <ErrorBlock message={loadError} />
          ) : data && data.vehicles.length > 0 ? (
            <>
              <div className="vehicle-grid">
                {data.vehicles.map((vehicle) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} />
                ))}
              </div>
              <Pagination
                page={data.page}
                perPage={data.perPage}
                total={data.total}
                onPage={(page) => update("page", String(page))}
              />
            </>
          ) : (
            <div className="empty-card empty-card--large">
              <span className="empty-icon">
                <Icon name="search" size={24} />
              </span>
              <h2>No vehicles match those filters.</h2>
              <p>
                Try widening your search or clear the filters to see the full
                selection.
              </p>
              <button className="button button--dark" onClick={clear}>
                Clear filters <Icon name="arrow" size={17} />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FilterControls({
  params,
  update,
  clear,
}: {
  params: URLSearchParams;
  update: (key: string, value: string) => void;
  clear: () => void;
}) {
  return (
    <div className="filter-controls">
      <label>
        <span>Make</span>
        <select
          value={params.get("make") ?? ""}
          onChange={(event) => update("make", event.target.value)}
        >
          <option value="">All makes</option>
          {[
            "Toyota",
            "Honda",
            "Mercedes-Benz",
            "Subaru",
            "Kia",
            "Ford",
            "Porsche",
          ].map((make) => (
            <option key={make}>{make}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Model</span>
        <input
          value={params.get("model") ?? ""}
          onChange={(event) => update("model", event.target.value)}
          placeholder="Any model"
        />
      </label>
      <div className="filter-two">
        <label>
          <span>Min year</span>
          <input
            inputMode="numeric"
            value={params.get("minYear") ?? ""}
            onChange={(event) =>
              update("minYear", event.target.value.replace(/\D/g, ""))
            }
            placeholder="2015"
          />
        </label>
        <label>
          <span>Max year</span>
          <input
            inputMode="numeric"
            value={params.get("maxYear") ?? ""}
            onChange={(event) =>
              update("maxYear", event.target.value.replace(/\D/g, ""))
            }
            placeholder="2025"
          />
        </label>
      </div>
      <div className="filter-two">
        <label>
          <span>Min price</span>
          <input
            inputMode="numeric"
            value={params.get("minPrice") ?? ""}
            onChange={(event) =>
              update("minPrice", event.target.value.replace(/\D/g, ""))
            }
            placeholder="$10,000"
          />
        </label>
        <label>
          <span>Max price</span>
          <input
            inputMode="numeric"
            value={params.get("maxPrice") ?? ""}
            onChange={(event) =>
              update("maxPrice", event.target.value.replace(/\D/g, ""))
            }
            placeholder="$50,000"
          />
        </label>
      </div>
      <label>
        <span>Max mileage</span>
        <select
          value={params.get("maxMileage") ?? ""}
          onChange={(event) => update("maxMileage", event.target.value)}
        >
          <option value="">Any mileage</option>
          <option value="30000">Under 30,000 mi</option>
          <option value="60000">Under 60,000 mi</option>
          <option value="90000">Under 90,000 mi</option>
          <option value="120000">Under 120,000 mi</option>
        </select>
      </label>
      <label>
        <span>Body type</span>
        <select
          value={params.get("bodyType") ?? ""}
          onChange={(event) => update("bodyType", event.target.value)}
        >
          <option value="">Any body type</option>
          <option>SUV</option>
          <option>Sedan</option>
          <option>Truck</option>
          <option>Wagon</option>
          <option>Coupe</option>
        </select>
      </label>
      <label>
        <span>Drivetrain</span>
        <select
          value={params.get("drivetrain") ?? ""}
          onChange={(event) => update("drivetrain", event.target.value)}
        >
          <option value="">Any drivetrain</option>
          <option>AWD</option>
          <option>4WD</option>
          <option>FWD</option>
          <option>RWD</option>
        </select>
      </label>
      <button className="clear-button" onClick={clear}>
        Clear all filters <Icon name="close" size={14} />
      </button>
    </div>
  );
}

function Pagination({
  page,
  perPage,
  total,
  onPage,
}: {
  page: number;
  perPage: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Inventory pages">
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        ←
      </button>
      {Array.from({ length: pages }, (_, index) => index + 1)
        .slice(0, 7)
        .map((number) => (
          <button
            key={number}
            className={number === page ? "active" : ""}
            onClick={() => onPage(number)}
          >
            {String(number).padStart(2, "0")}
          </button>
        ))}
      <button
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        →
      </button>
    </nav>
  );
}

function VehicleDetailPage() {
  const { slug = "" } = useParams();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [settings, setSettings] = useState<SiteSettings>(demoSettings);
  const [similar, setSimilar] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [formType, setFormType] = useState<
    "availability" | "test_drive" | null
  >(null);
  const [error, setError] = useState("");
  const touchStart = useRef<number | null>(null);
  usePageMeta(
    vehicle ? `${vehicle.title} | YC Auto USA` : "Vehicle | YC Auto USA",
    vehicle?.description ?? undefined,
    false,
    vehicle ? vehicleImage(vehicle) : undefined,
  );
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getVehicle(slug)
      .then((value) => {
        if (alive) {
          setVehicle(value);
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (alive) {
          setError(
            reason instanceof Error ? reason.message : "Vehicle not found",
          );
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  useEffect(() => {
    getHome()
      .then((data) => setSettings(data.settings))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!vehicle?.make) return;
    getInventory(`make=${encodeURIComponent(vehicle.make)}&perPage=12`)
      .then((result) =>
        setSimilar(
          result.vehicles
            .filter(
              (item) => item.id !== vehicle.id && item.status === "available",
            )
            .slice(0, 3),
        ),
      )
      .catch(() => setSimilar([]));
  }, [vehicle]);
  if (loading)
    return (
      <div className="container page-loading">
        <Loading label="Loading vehicle" />
      </div>
    );
  if (!vehicle || error)
    return <NotFound label={error || "Vehicle not found."} />;
  const images = vehicle.images?.length ? vehicle.images : [];
  const image = images[activeImage] ?? images[0];
  const imageSrc = image?.r2Key
    ? `/media/${image.r2Key}?w=1600&format=webp`
    : vehicleImage(vehicle);
  const sold = vehicle.status === "sold";
  const pending = vehicle.status === "pending";
  const specs = [
    ["Year", vehicle.year],
    ["Make", vehicle.make],
    ["Model", vehicle.model],
    ["Trim", vehicle.trim],
    ["Body type", vehicle.bodyType],
    ["Drivetrain", vehicle.drivetrain],
    ["Transmission", vehicle.transmission],
    ["Fuel type", vehicle.fuelType],
    ["Engine", vehicle.engine],
    ["Exterior", vehicle.exteriorColor],
    ["Interior", vehicle.interiorColor],
  ].filter(([, value]) => value);
  const structured = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: vehicle.title,
    vehicleIdentificationNumber: vehicle.vin ?? undefined,
    image: images.map((item) =>
      item.r2Key
        ? `/media/${item.r2Key}?w=1600&format=webp`
        : vehicleImage(vehicle),
    ),
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      price: vehicle.priceCents !== null ? vehicle.priceCents / 100 : undefined,
      availability: sold
        ? "https://schema.org/OutOfStock"
        : pending
          ? "https://schema.org/LimitedAvailability"
          : "https://schema.org/InStock",
    },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured) }}
      />
      <section className="detail-page">
        <div className="container detail-breadcrumb">
          <Link to="/inventory">Inventory</Link>
          <span>/</span>
          <span>{vehicle.title}</span>
        </div>
        <div className="container detail-layout">
          <div className="gallery">
            <div
              className="gallery-main"
              onTouchStart={(event) => {
                touchStart.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const start = touchStart.current;
                const end = event.changedTouches[0]?.clientX;
                if (
                  start !== null &&
                  end !== undefined &&
                  Math.abs(end - start) > 45 &&
                  images.length > 1
                )
                  setActiveImage((current) =>
                    end < start
                      ? (current + 1) % images.length
                      : (current - 1 + images.length) % images.length,
                  );
                touchStart.current = null;
              }}
            >
              <img
                src={imageSrc}
                alt={vehicle.title}
                decoding="async"
                width="1600"
                height="1067"
              />
              {(sold || pending) && <StatusPill status={vehicle.status} />}
              <span className="gallery-counter">
                {String(activeImage + 1).padStart(2, "0")} /{" "}
                {String(Math.max(images.length, 1)).padStart(2, "0")}
              </span>
            </div>
            {images.length > 1 && (
              <div className="gallery-thumbs">
                {images.map((item, index) => (
                  <button
                    key={item.id}
                    className={index === activeImage ? "active" : ""}
                    onClick={() => setActiveImage(index)}
                  >
                    <img
                      src={
                        item.r2Key
                          ? `/media/${item.r2Key}?w=320&format=webp`
                          : vehicleImage(vehicle)
                      }
                      alt={`${vehicle.title} view ${index + 1}`}
                      width="160"
                      height="108"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="detail-copy">
            <p className="eyebrow">
              {vehicle.year ?? "—"} / {vehicle.bodyType ?? "Pre-owned vehicle"}
            </p>
            <h1>{vehicle.title}</h1>
            <div className="detail-price">
              <strong>{formatPrice(vehicle.priceCents)}</strong>
              <span>{formatMileage(vehicle.mileage)}</span>
            </div>
            {(sold || pending) && (
              <div className={`detail-status detail-status--${vehicle.status}`}>
                <span />
                This vehicle is {vehicle.status}.{" "}
                {sold
                  ? "Explore similar available vehicles below."
                  : "Ask us about timing and alternatives."}
              </div>
            )}
            <div className="detail-actions">
              <a
                className="button button--red"
                href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}
                onClick={() => trackEvent("phone_click", vehicle.id)}
              >
                <Icon name="phone" size={17} /> Call about this car
              </a>
              {!sold && (
                <a
                  className="button button--outline"
                  href={`sms:${settings.smsNumber.replace(/[^\d+]/g, "")}`}
                  onClick={() => trackEvent("sms_click", vehicle.id)}
                >
                  <Icon name="message" size={17} /> Text us
                </a>
              )}
              {!sold && (
                <button
                  className="button button--outline"
                  onClick={() => {
                    trackEvent("availability_open", vehicle.id);
                    setFormType("availability");
                  }}
                >
                  <Icon name="message" size={17} /> Check availability
                </button>
              )}
              {!sold && (
                <button
                  className="button button--outline"
                  onClick={() => setFormType("test_drive")}
                >
                  <Icon name="calendar" size={17} /> Schedule a test drive
                </button>
              )}
            </div>
            <div className="detail-facts">
              {vehicle.vin && (
                <div>
                  <span>VIN</span>
                  <strong>{vehicle.vin}</strong>
                </div>
              )}
              {vehicle.stockNumber && (
                <div>
                  <span>Stock no.</span>
                  <strong>{vehicle.stockNumber}</strong>
                </div>
              )}
            </div>
            <div className="spec-grid">
              {specs.map(([label, value]) => (
                <div key={String(label)}>
                  <span>{label}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
            </div>
            <div className="detail-description">
              <p className="eyebrow">The details</p>
              <p>
                {vehicle.description ||
                  "Details available by request. Call or send a note and we’ll be happy to help."}
              </p>
            </div>
            {vehicle.features.length > 0 && (
              <div className="feature-list">
                <p className="eyebrow">Highlights</p>
                <ul>
                  {vehicle.features.map((feature) => (
                    <li key={feature}>
                      <Icon name="check" size={15} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>
      {similar.length > 0 && (
        <section className="section detail-similar">
          <div className="container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">More to consider</p>
                <h2>Similar vehicles</h2>
              </div>
              <Link
                className="arrow-link"
                to={`/inventory?make=${encodeURIComponent(vehicle.make ?? "")}`}
              >
                See all {vehicle.make} <Icon name="arrow" size={17} />
              </Link>
            </div>
            <div className="vehicle-grid">
              {similar.map((item) => (
                <VehicleCard key={item.id} vehicle={item} />
              ))}
            </div>
          </div>
        </section>
      )}
      <section className="detail-contact">
        <div className="container detail-contact-inner">
          <div>
            <p className="eyebrow eyebrow--light">Have a question?</p>
            <h2>
              Make it
              <br />
              <em>yours.</em>
            </h2>
            <p>
              Tell us what you’re looking for and we’ll get right back to you.
            </p>
          </div>
          {sold ? (
            <Link className="button button--cream" to="/inventory">
              Browse available inventory <Icon name="arrow" size={17} />
            </Link>
          ) : (
            <button
              className="button button--cream"
              onClick={() => {
                trackEvent("availability_open", vehicle.id);
                setFormType("availability");
              }}
            >
              Send a message <Icon name="arrow" size={17} />
            </button>
          )}
        </div>
      </section>
      {formType && (
        <Modal
          title={
            vehicle.status === "pending"
              ? "Ask about this vehicle"
              : "Check availability"
          }
          onClose={() => setFormType(null)}
        >
          <LeadForm vehicle={vehicle} type={formType} />
        </Modal>
      )}
      <div className="mobile-cta">
        <a
          href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}
          onClick={() => trackEvent("phone_click", vehicle.id)}
        >
          <Icon name="phone" size={17} /> Call
        </a>
        {!sold && (
          <button
            onClick={() => {
              trackEvent("availability_open", vehicle.id);
              setFormType("availability");
            }}
          >
            <Icon name="message" size={17} /> Message
          </button>
        )}
      </div>
    </>
  );
}

function AboutPage() {
  const [settings, setSettings] = useState(demoSettings);
  usePageMeta(
    "Our story | YC Auto USA",
    "Meet YC Auto USA, a local pre-owned vehicle dealer in Flushing, New York.",
  );
  useEffect(() => {
    getHome().then((data) => setSettings(data.settings));
  }, []);
  return (
    <section className="editorial-page">
      <div className="container editorial-hero">
        <p className="eyebrow">Our story / YC Auto USA</p>
        <h1>
          Local knowledge.
          <br />
          <em>Good cars.</em>
        </h1>
        <p className="editorial-lede">
          A straightforward place to find your next vehicle in Flushing, New
          York.
        </p>
      </div>
      <div className="container editorial-grid">
        <div className="editorial-rail">
          <span>YC</span>
          <small>
            ABOUT
            <br />
            THE SHOP
          </small>
        </div>
        <div className="editorial-body">
          <p>{settings.aboutText}</p>
          <figure className="about-team-photo">
            <img
              src="/brand/team.jpg"
              alt="The Your Choice Auto Group team at the Flushing showroom"
              width="1920"
              height="1435"
              loading="lazy"
              decoding="async"
            />
            <figcaption>Your Choice Auto Group · Flushing, New York</figcaption>
          </figure>
          <div className="about-notes">
            <div>
              <span>01</span>
              <strong>Browse at your pace</strong>
              <p>Start online, then visit when it feels right.</p>
            </div>
            <div>
              <span>02</span>
              <strong>Ask a real person</strong>
              <p>Call, text, or send a note—whatever is easiest.</p>
            </div>
            <div>
              <span>03</span>
              <strong>Find us locally</strong>
              <p>{settings.address}</p>
            </div>
          </div>
          <Link className="button button--dark" to="/inventory">
            See current inventory <Icon name="arrow" size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function ContactPage() {
  const [settings, setSettings] = useState(demoSettings);
  usePageMeta(
    "Contact | YC Auto USA",
    "Call, email, or send a message to YC Auto USA in Flushing, New York.",
  );
  useEffect(() => {
    getHome().then((data) => setSettings(data.settings));
  }, []);
  return (
    <section className="contact-page">
      <div className="container contact-head">
        <div>
          <p className="eyebrow">Contact / We’re here</p>
          <h1>
            Let’s talk
            <br />
            <em>cars.</em>
          </h1>
          <p>Tell us what caught your eye, or simply say hello.</p>
        </div>
        <div className="contact-direct">
          <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
            <span>Call</span>
            <strong>{settings.phone}</strong>
            <Icon name="arrow" size={17} />
          </a>
          <a
            href={`mailto:${settings.email}`}
            onClick={() => trackEvent("email_click")}
          >
            <span>Email</span>
            <strong>{settings.email}</strong>
            <Icon name="arrow" size={17} />
          </a>
          <div>
            <span>Visit</span>
            <strong>{settings.address}</strong>
            <small>{settings.businessHours}</small>
          </div>
        </div>
      </div>
      <div className="container contact-form-wrap">
        <div className="contact-form-intro">
          <p className="eyebrow">Send a note</p>
          <h2>
            We’ll get
            <br />
            <em>back to you.</em>
          </h2>
          <p>Usually within one business day.</p>
        </div>
        <LeadForm type="contact" />
      </div>
    </section>
  );
}

function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const privacy = kind === "privacy";
  usePageMeta(`${privacy ? "Privacy" : "Terms"} | YC Auto USA`, undefined);
  return (
    <section className="legal-page container">
      <p className="eyebrow">YC Auto USA / {privacy ? "Privacy" : "Terms"}</p>
      <h1>{privacy ? "Privacy policy" : "Terms of use"}</h1>
      <p className="legal-updated">Last updated August 29, 2026</p>
      {privacy ? (
        <>
          <h2>Information we receive</h2>
          <p>
            When you contact YC Auto USA, we receive the details you choose to
            share, such as your name, phone number, email address, and message.
            We use that information to respond to your request and help with
            vehicle availability.
          </p>
          <h2>How we use it</h2>
          <p>
            We use submitted information to communicate with you about your
            request, keep basic lead records, and improve the website. We do not
            sell lead information or send it to vehicle-data vendors.
          </p>
          <h2>Cookies and analytics</h2>
          <p>
            The site may use Cloudflare Web Analytics for aggregate traffic
            measurement. The website does not require an account or use
            advertising trackers to browse inventory.
          </p>
          <h2>Contact</h2>
          <p>
            Questions about this policy can be sent to{" "}
            <a href="mailto:sophie@youxuancars.com">sophie@youxuancars.com</a>.
          </p>
        </>
      ) : (
        <>
          <h2>Inventory information</h2>
          <p>
            Vehicle availability, pricing, mileage, and descriptions can change
            without notice. A vehicle shown as available is not reserved until
            confirmed by YC Auto USA.
          </p>
          <h2>Website use</h2>
          <p>
            Please use the website and contact forms for lawful purposes. We may
            decline messages that are abusive, automated, or unrelated to
            vehicle inquiries.
          </p>
          <h2>Accuracy</h2>
          <p>
            We work to keep information current, but the website may contain
            occasional errors. Contact us to confirm details before making a
            purchasing decision.
          </p>
          <h2>Questions</h2>
          <p>
            For questions about these terms, call{" "}
            <a href="tel:7187990606">718-799-0606</a>.
          </p>
        </>
      )}
    </section>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AdminDashboardPage() {
  const [data, setData] = useState<{
    stats: DashboardStats;
    vehicles: Vehicle[];
    leads: Lead[];
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  usePageMeta("Admin overview | YC Auto USA", undefined, true);
  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((reason) =>
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Unable to load workspace.",
        ),
      );
  }, []);
  if (loadError) return <ErrorBlock message={loadError} />;
  if (!data) return <Loading label="Loading workspace" />;
  const cards = [
    { label: "Available", value: data.stats.available, tone: "red" },
    { label: "Pending", value: data.stats.pending, tone: "amber" },
    { label: "Sold", value: data.stats.sold, tone: "ink" },
    { label: "Drafts", value: data.stats.draft, tone: "bone" },
  ];
  return (
    <div className="admin-dashboard">
      <div className="admin-page-intro">
        <div>
          <p className="eyebrow">Monday, keep it moving</p>
          <h1>Good morning.</h1>
          <p className="admin-subtitle">
            Here’s the pulse of your inventory and inquiries.
          </p>
        </div>
        <Link className="button button--red" to="/admin/vehicles/new">
          <Icon name="plus" size={17} /> Add vehicle
        </Link>
      </div>
      <div className="stat-grid">
        {cards.map((card) => (
          <div key={card.label} className={`stat-card stat-card--${card.tone}`}>
            <span>{card.label}</span>
            <strong>{String(card.value).padStart(2, "0")}</strong>
            <small>vehicles</small>
          </div>
        ))}
        <div className="stat-card stat-card--leads">
          <span>New leads</span>
          <strong>{String(data.stats.newLeads).padStart(2, "0")}</strong>
          <Link to="/admin/leads">
            Review inbox <Icon name="arrow" size={15} />
          </Link>
        </div>
      </div>
      <div className="admin-columns">
        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Inventory / Recently touched</p>
              <h2>Latest vehicles</h2>
            </div>
            <Link className="text-link" to="/admin/vehicles">
              View all <Icon name="arrow" size={15} />
            </Link>
          </div>
          <div className="mini-list">
            {data.vehicles.slice(0, 5).map((vehicle) => (
              <VehicleMiniRow key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        </section>
        <section className="admin-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Inbox / Newest first</p>
              <h2>Recent leads</h2>
            </div>
            <Link className="text-link" to="/admin/leads">
              Open inbox <Icon name="arrow" size={15} />
            </Link>
          </div>
          {data.leads.length ? (
            <div className="lead-mini-list">
              {data.leads.slice(0, 5).map((lead) => (
                <Link className="lead-mini-row" to="/admin/leads" key={lead.id}>
                  <span className="lead-avatar">
                    {lead.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{lead.name}</strong>
                    <small>{lead.vehicle?.title ?? "General inquiry"}</small>
                  </span>
                  <time>
                    {new Date(lead.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </time>
                </Link>
              ))}
            </div>
          ) : (
            <div className="panel-empty">
              <Icon name="inbox" size={22} />
              <p>No new leads yet.</p>
              <span>They’ll appear here as customers reach out.</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AdminVehiclesPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{
    vehicles: Vehicle[];
    total: number;
    page: number;
    perPage: number;
  } | null>(null);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<VehicleStatus>("available");
  const [loadError, setLoadError] = useState("");
  usePageMeta("Inventory admin | YC Auto USA", undefined, true);
  const query = params.toString();
  useEffect(() => {
    getAdminVehicles(query)
      .then((result) => {
        setData(result);
        setLoadError("");
      })
      .catch((reason) =>
        setLoadError(
          reason instanceof Error
            ? reason.message
            : "Unable to load inventory.",
        ),
      );
  }, [query]);
  const quickStatus = async (vehicle: Vehicle, status: VehicleStatus) => {
    setBusy(vehicle.id);
    setActionError("");
    try {
      await mutate(`/api/admin/vehicles/${vehicle.id}/status`, "POST", {
        status,
      });
      setData((old) =>
        old
          ? {
              ...old,
              vehicles: old.vehicles.map((item) =>
                item.id === vehicle.id ? { ...item, status } : item,
              ),
            }
          : old,
      );
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Unable to update status.",
      );
    } finally {
      setBusy("");
    }
  };
  const quickField = async (
    vehicle: Vehicle,
    field: "priceCents" | "mileage",
    value: string,
  ) => {
    const numeric = Number(value.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(numeric) || numeric < 0) return;
    const payload = {
      status: vehicle.status,
      featured: vehicle.featured,
      title: vehicle.title,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      vin: vehicle.vin,
      stockNumber: vehicle.stockNumber,
      priceCents:
        field === "priceCents" ? Math.round(numeric * 100) : vehicle.priceCents,
      mileage: field === "mileage" ? Math.round(numeric) : vehicle.mileage,
      exteriorColor: vehicle.exteriorColor,
      interiorColor: vehicle.interiorColor,
      bodyType: vehicle.bodyType,
      drivetrain: vehicle.drivetrain,
      transmission: vehicle.transmission,
      fuelType: vehicle.fuelType,
      engine: vehicle.engine,
      description: vehicle.description,
      features: vehicle.features,
    };
    setBusy(vehicle.id);
    setActionError("");
    try {
      await mutate(`/api/admin/vehicles/${vehicle.id}`, "PUT", payload);
      setData((old) =>
        old
          ? {
              ...old,
              vehicles: old.vehicles.map((item) =>
                item.id === vehicle.id
                  ? {
                      ...item,
                      [field]:
                        field === "priceCents"
                          ? Math.round(numeric * 100)
                          : Math.round(numeric),
                    }
                  : item,
              ),
            }
          : old,
      );
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Unable to save quick edit.",
      );
    } finally {
      setBusy("");
    }
  };
  const visibleIds = data?.vehicles.map((vehicle) => vehicle.id) ?? [];
  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((old) =>
      checked ? [...new Set([...old, id])] : old.filter((item) => item !== id),
    );
  const applyBulkStatus = async () => {
    if (!selectedIds.length) return;
    setBusy("bulk");
    setActionError("");
    try {
      await Promise.all(
        selectedIds.map((id) =>
          mutate(`/api/admin/vehicles/${id}/status`, "POST", {
            status: bulkStatus,
          }),
        ),
      );
      setData((old) =>
        old
          ? {
              ...old,
              vehicles: old.vehicles.map((vehicle) =>
                selectedIds.includes(vehicle.id)
                  ? { ...vehicle, status: bulkStatus }
                  : vehicle,
              ),
            }
          : old,
      );
      setSelectedIds([]);
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Unable to update selected vehicles.",
      );
    } finally {
      setBusy("");
    }
  };
  const duplicateVehicle = async (vehicle: Vehicle) => {
    setBusy(vehicle.id);
    setActionError("");
    try {
      await mutate(`/api/admin/vehicles/${vehicle.id}/duplicate`, "POST");
      const refreshed = await getAdminVehicles(query);
      setData(refreshed);
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : "Unable to duplicate vehicle.",
      );
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="admin-list-page">
      <div className="admin-page-intro">
        <div>
          <p className="eyebrow">Inventory / Control</p>
          <h1>Vehicles.</h1>
          <p className="admin-subtitle">
            Keep the storefront current in a few quick edits.
          </p>
        </div>
        <Link className="button button--red" to="/admin/vehicles/new">
          <Icon name="plus" size={17} /> Add vehicle
        </Link>
      </div>
      {(actionError || loadError) && (
        <ErrorBlock message={actionError || loadError} />
      )}
      <div className="admin-toolbar">
        <label className="admin-search">
          <Icon name="search" size={17} />
          <input
            value={params.get("search") ?? ""}
            onChange={(event) => {
              const next = new URLSearchParams(params);
              if (event.target.value) next.set("search", event.target.value);
              else next.delete("search");
              setParams(next);
            }}
            placeholder="Search title, VIN, stock no."
          />
        </label>
        <select
          value={params.get("status") ?? ""}
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set("status", event.target.value);
            else next.delete("status");
            setParams(next);
          }}
        >
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="pending">Pending</option>
          <option value="sold">Sold</option>
          <option value="draft">Draft</option>
          <option value="hidden">Hidden</option>
        </select>
        <select
          value={params.get("make") ?? ""}
          aria-label="Filter by make"
          onChange={(event) => {
            const next = new URLSearchParams(params);
            if (event.target.value) next.set("make", event.target.value);
            else next.delete("make");
            next.delete("page");
            setParams(next);
          }}
        >
          <option value="">All makes</option>
          {[
            "Toyota",
            "Honda",
            "Mercedes-Benz",
            "Subaru",
            "Kia",
            "Ford",
            "Porsche",
            "BMW",
            "Nissan",
          ].map((make) => (
            <option key={make} value={make}>
              {make}
            </option>
          ))}
        </select>
        <span className="toolbar-count">{data?.total ?? "—"} records</span>
      </div>
      {selectedIds.length > 0 && (
        <div className="bulk-toolbar">
          <strong>{selectedIds.length} selected</strong>
          <select
            value={bulkStatus}
            onChange={(event) =>
              setBulkStatus(event.target.value as VehicleStatus)
            }
          >
            <option value="available">Mark available</option>
            <option value="pending">Mark pending</option>
            <option value="sold">Mark sold</option>
            <option value="hidden">Hide</option>
          </select>
          <button
            className="button button--dark button--small"
            disabled={busy === "bulk"}
            onClick={applyBulkStatus}
          >
            {busy === "bulk" ? "Updating…" : "Apply"}
          </button>
          <button className="text-button" onClick={() => setSelectedIds([])}>
            Clear
          </button>
        </div>
      )}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  aria-label="Select all visible vehicles"
                  checked={
                    visibleIds.length > 0 &&
                    visibleIds.every((id) => selectedIds.includes(id))
                  }
                  onChange={(event) =>
                    setSelectedIds(event.target.checked ? visibleIds : [])
                  }
                />
              </th>
              <th>Vehicle</th>
              <th>Status</th>
              <th>Price</th>
              <th>Mileage</th>
              <th>Updated</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data?.vehicles.map((vehicle) => (
              <tr key={vehicle.id}>
                <td>
                  <input
                    className="row-check"
                    type="checkbox"
                    aria-label={`Select ${vehicle.title}`}
                    checked={selectedIds.includes(vehicle.id)}
                    onChange={(event) =>
                      toggleSelected(vehicle.id, event.target.checked)
                    }
                  />
                </td>
                <td>
                  <Link
                    className="table-vehicle"
                    to={`/admin/vehicles/${vehicle.id}`}
                  >
                    <img
                      src={vehicleImage(vehicle)}
                      alt=""
                      width="80"
                      height="52"
                    />
                    <span>
                      <strong>{vehicle.title}</strong>
                      <small>
                        {vehicle.stockNumber ??
                          vehicle.vin ??
                          "No stock number"}
                      </small>
                    </span>
                  </Link>
                </td>
                <td>
                  <select
                    className={`status-select status-select--${vehicle.status}`}
                    value={vehicle.status}
                    disabled={busy === vehicle.id}
                    onChange={(event) =>
                      quickStatus(vehicle, event.target.value as VehicleStatus)
                    }
                  >
                    <option value="available">Available</option>
                    <option value="pending">Pending</option>
                    <option value="sold">Sold</option>
                    <option value="draft">Draft</option>
                    <option value="hidden">Hidden</option>
                  </select>
                </td>
                <td>
                  <QuickEdit
                    value={
                      vehicle.priceCents !== null
                        ? String(vehicle.priceCents / 100)
                        : ""
                    }
                    prefix="$"
                    ariaLabel={`Edit price for ${vehicle.title}`}
                    onCommit={(value) =>
                      quickField(vehicle, "priceCents", value)
                    }
                  />
                </td>
                <td>
                  <QuickEdit
                    value={
                      vehicle.mileage !== null ? String(vehicle.mileage) : ""
                    }
                    suffix="mi"
                    ariaLabel={`Edit mileage for ${vehicle.title}`}
                    onCommit={(value) => quickField(vehicle, "mileage", value)}
                  />
                </td>
                <td>
                  {new Date(vehicle.updatedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </td>
                <td>
                  <div className="row-actions">
                    <Link
                      className="icon-button"
                      to={`/admin/vehicles/${vehicle.id}`}
                      aria-label={`Edit ${vehicle.title}`}
                    >
                      <Icon name="edit" size={17} />
                    </Link>
                    <Link
                      className="icon-button"
                      to={`/inventory/${vehicle.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Preview ${vehicle.title}`}
                    >
                      <Icon name="external" size={16} />
                    </Link>
                    <button
                      className="icon-button"
                      onClick={() => duplicateVehicle(vehicle)}
                      aria-label={`Duplicate ${vehicle.title}`}
                    >
                      <Icon name="plus" size={16} />
                    </button>
                    <button
                      className="icon-button"
                      onClick={() => quickStatus(vehicle, "hidden")}
                      aria-label={`Hide ${vehicle.title}`}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.vehicles.length && (
          <div className="panel-empty">
            <Icon name="car" size={24} />
            <p>No vehicles found.</p>
            <span>Try another search or add a vehicle.</span>
          </div>
        )}
      </div>
      {data && (
        <Pagination
          page={data.page}
          perPage={data.perPage}
          total={data.total}
          onPage={(page) => {
            const next = new URLSearchParams(params);
            next.set("page", String(page));
            setParams(next);
          }}
        />
      )}
    </div>
  );
}

function QuickEdit({
  value,
  prefix,
  suffix,
  ariaLabel,
  onCommit,
}: {
  value: string;
  prefix?: string;
  suffix?: string;
  ariaLabel: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="quick-edit">
      <span className="sr-only">{ariaLabel}</span>
      {prefix && <i>{prefix}</i>}
      <input
        value={draft}
        inputMode="decimal"
        aria-label={ariaLabel}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      {suffix && <i>{suffix}</i>}
    </label>
  );
}

type EditorState = {
  status: VehicleStatus;
  featured: boolean;
  title: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  vin: string;
  stockNumber: string;
  price: string;
  mileage: string;
  exteriorColor: string;
  interiorColor: string;
  bodyType: string;
  drivetrain: string;
  transmission: string;
  fuelType: string;
  engine: string;
  description: string;
  features: string;
  images: VehicleImage[];
};
const blankEditor: EditorState = {
  status: "draft",
  featured: false,
  title: "",
  year: "",
  make: "",
  model: "",
  trim: "",
  vin: "",
  stockNumber: "",
  price: "",
  mileage: "",
  exteriorColor: "",
  interiorColor: "",
  bodyType: "",
  drivetrain: "",
  transmission: "",
  fuelType: "",
  engine: "",
  description: "",
  features: "",
  images: [],
};
function editorFromVehicle(vehicle: Vehicle): EditorState {
  return {
    status: vehicle.status,
    featured: vehicle.featured,
    title: vehicle.title,
    year: vehicle.year?.toString() ?? "",
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    trim: vehicle.trim ?? "",
    vin: vehicle.vin ?? "",
    stockNumber: vehicle.stockNumber ?? "",
    price: vehicle.priceCents !== null ? String(vehicle.priceCents / 100) : "",
    mileage: vehicle.mileage?.toString() ?? "",
    exteriorColor: vehicle.exteriorColor ?? "",
    interiorColor: vehicle.interiorColor ?? "",
    bodyType: vehicle.bodyType ?? "",
    drivetrain: vehicle.drivetrain ?? "",
    transmission: vehicle.transmission ?? "",
    fuelType: vehicle.fuelType ?? "",
    engine: vehicle.engine ?? "",
    description: vehicle.description ?? "",
    features: vehicle.features.join("\n"),
    images: vehicle.images ?? [],
  };
}

async function resizeImageForUpload(file: File): Promise<File> {
  if (
    typeof createImageBitmap === "undefined" ||
    typeof document === "undefined"
  )
    return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 2560;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (scale === 1 && file.size <= 5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const type =
      file.type === "image/png"
        ? "image/png"
        : file.type === "image/webp"
          ? "image/webp"
          : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolveBlob) =>
      canvas.toBlob(resolveBlob, type, type === "image/png" ? undefined : 0.86),
    );
    return blob
      ? new File(
          [blob],
          file.name.replace(
            /\.[^.]+$/,
            type === "image/png"
              ? ".png"
              : type === "image/webp"
                ? ".webp"
                : ".jpg",
          ),
          { type },
        )
      : file;
  } catch {
    return file;
  }
}

function AdminVehicleEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const [state, setState] = useState<EditorState>(blankEditor);
  const [previewSlug, setPreviewSlug] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [failedUploads, setFailedUploads] = useState<File[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  usePageMeta(
    `${isNew ? "Add vehicle" : "Edit vehicle"} | YC Auto USA`,
    undefined,
    true,
  );
  useEffect(() => {
    if (!isNew && id)
      getVehicle(id, true)
        .then((vehicle) => {
          setState(editorFromVehicle(vehicle));
          setPreviewSlug(vehicle.slug);
          setLoading(false);
        })
        .catch(() => {
          setError("Vehicle not found");
          setLoading(false);
        });
  }, [id, isNew]);
  const set = (key: keyof EditorState, value: unknown) =>
    setState((old) => ({ ...old, [key]: value }));
  async function decode() {
    if (!state.vin || state.vin.length !== 17) {
      setError("Enter a valid 17-character VIN first.");
      return;
    }
    setDecoding(true);
    setError("");
    try {
      const result = await mutate("/api/admin/vin/decode", "POST", {
        vin: state.vin,
        vehicleId: isNew ? null : id,
      });
      if (result.ok && result.decoded) {
        const decoded = result.decoded as Record<string, unknown>;
        setState((old) => ({
          ...old,
          year: old.year || String(decoded.year ?? ""),
          make: old.make || String(decoded.make ?? ""),
          model: old.model || String(decoded.model ?? ""),
          trim: old.trim || String(decoded.trim ?? ""),
          bodyType: old.bodyType || String(decoded.bodyType ?? ""),
          drivetrain: old.drivetrain || String(decoded.drivetrain ?? ""),
          transmission: old.transmission || String(decoded.transmission ?? ""),
          fuelType: old.fuelType || String(decoded.fuelType ?? ""),
          engine: old.engine || String(decoded.engine ?? ""),
        }));
        setMessage(
          `Auto-filled ${result.fromCache ? "from cache" : "from NHTSA"}. Existing fields were kept.`,
        );
      } else
        setMessage(
          result.message ||
            "VIN auto-fill unavailable — enter details manually",
        );
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "VIN auto-fill unavailable — enter details manually",
      );
    } finally {
      setDecoding(false);
    }
  }
  async function save(event: FormEvent, publish = false) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const payload = {
      status:
        publish && (isNew || state.status === "draft")
          ? "available"
          : state.status,
      featured: state.featured,
      title: state.title,
      year: state.year || null,
      make: state.make || null,
      model: state.model || null,
      trim: state.trim || null,
      vin: state.vin || null,
      stockNumber: state.stockNumber || null,
      priceCents: state.price
        ? Math.round(Number(state.price.replace(/[$,\s]/g, "")) * 100)
        : null,
      mileage: state.mileage || null,
      exteriorColor: state.exteriorColor || null,
      interiorColor: state.interiorColor || null,
      bodyType: state.bodyType || null,
      drivetrain: state.drivetrain || null,
      transmission: state.transmission || null,
      fuelType: state.fuelType || null,
      engine: state.engine || null,
      description: state.description || null,
      features: state.features
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean),
    };
    try {
      const result = await saveVehicle(payload, isNew ? undefined : id);
      setMessage(publish ? "Vehicle published." : "Draft saved.");
      if (result.vehicle?.slug) setPreviewSlug(result.vehicle.slug);
      if (isNew && result.id)
        navigate(`/admin/vehicles/${result.id}`, { replace: true });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save vehicle.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function uploadOne(file: File): Promise<void> {
    if (!id || isNew) return;
    const prepared = await resizeImageForUpload(file);
    const form = new FormData();
    form.append("file", prepared);
    const response = await fetch(`/api/admin/vehicles/${id}/images`, {
      method: "POST",
      body: form,
    });
    const result = (await response.json()) as {
      error?: string;
      image?: VehicleImage;
    };
    if (!response.ok) throw new Error(result.error || "Image upload failed.");
    if (result.image)
      setState((old) => ({
        ...old,
        images: [...old.images, result.image as VehicleImage],
      }));
  }
  async function uploadFiles(files: File[]) {
    if (!files.length || !id || isNew) return;
    const failures: File[] = [];
    setUploading(0);
    for (let index = 0; index < files.length; index += 1) {
      try {
        await uploadOne(files[index]);
      } catch (reason) {
        failures.push(files[index]);
        setError(
          reason instanceof Error ? reason.message : "Image upload failed.",
        );
      } finally {
        setUploading(Math.round(((index + 1) / files.length) * 100));
      }
    }
    setFailedUploads(failures);
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    await uploadFiles(event.target.files ? Array.from(event.target.files) : []);
    event.target.value = "";
  }
  async function dropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    await uploadFiles(Array.from(event.dataTransfer.files));
  }
  async function retryUpload(file: File) {
    try {
      await uploadOne(file);
      setFailedUploads((old) => old.filter((item) => item !== file));
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Image upload failed.",
      );
    }
  }
  async function removeImage(image: VehicleImage) {
    if (!window.confirm("Remove this image from the vehicle?")) return;
    try {
      await mutate(`/api/admin/images/${image.id}`, "DELETE");
      set(
        "images",
        state.images.filter((item) => item.id !== image.id),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to remove image.",
      );
    }
  }
  async function reorder(index: number, direction: -1 | 1) {
    const next = [...state.images];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length || !id) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    set("images", next);
    try {
      await mutate(`/api/admin/vehicles/${id}/images`, "PUT", {
        order: next.map((item) => item.id),
        coverId: next.find((item) => item.isCover)?.id ?? next[0]?.id,
      });
    } catch {
      setMessage("Order will sync when the vehicle is saved.");
    }
  }
  async function setCover(image: VehicleImage) {
    if (!id) return;
    const next = state.images.map((item) => ({
      ...item,
      isCover: item.id === image.id,
    }));
    set("images", next);
    try {
      await mutate(`/api/admin/vehicles/${id}/images`, "PUT", {
        order: next.map((item) => item.id),
        coverId: image.id,
      });
    } catch {
      setError("Unable to set cover image.");
    }
  }
  async function dropImage(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex || !id) return;
    const next = [...state.images];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, moved);
    set("images", next);
    setDragIndex(null);
    try {
      await mutate(`/api/admin/vehicles/${id}/images`, "PUT", {
        order: next.map((item) => item.id),
        coverId: next.find((item) => item.isCover)?.id ?? next[0]?.id,
      });
    } catch {
      setMessage("Order will sync when the vehicle is saved.");
    }
  }
  if (loading) return <Loading label="Loading vehicle" />;
  return (
    <div className="editor-page">
      <div className="editor-top">
        <div>
          <Link className="back-link" to="/admin/vehicles">
            ← Inventory
          </Link>
          <p className="eyebrow">{isNew ? "New listing" : "Edit listing"}</p>
          <h1>{isNew ? "Add a vehicle." : "Tune the details."}</h1>
        </div>
        <div className="editor-actions">
          <Link
            className="button button--ghost"
            to={
              isNew || !previewSlug
                ? "/admin/vehicles"
                : `/inventory/${previewSlug}`
            }
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="external" size={16} /> Preview
          </Link>
          <button
            className="button button--dark"
            disabled={saving}
            onClick={(event) => save(event, false)}
          >
            Save draft
          </button>
          <button
            className="button button--red"
            disabled={saving}
            onClick={(event) => save(event, true)}
          >
            {saving ? "Saving…" : isNew ? "Publish" : "Update"}{" "}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
      {message && (
        <div className="notice notice--success">
          <Icon name="check" size={17} />
          {message}
          {uploading > 0 && uploading < 100 ? ` Uploading ${uploading}%` : ""}
        </div>
      )}
      {error && (
        <div className="notice notice--error">
          <Icon name="close" size={17} />
          {error}
        </div>
      )}
      <form className="editor-form" onSubmit={(event) => save(event, false)}>
        <section className="form-section">
          <div className="form-section-heading">
            <span>01</span>
            <div>
              <h2>Basic information</h2>
              <p>Give customers the details they need first.</p>
            </div>
          </div>
          <div className="editor-fields">
            <Field label="Listing title" required>
              <input
                value={state.title}
                onChange={(event) => set("title", event.target.value)}
                placeholder="e.g. 2022 Toyota RAV4 XLE"
                required
              />
            </Field>
            <Field label="VIN">
              <div className="vin-field">
                <input
                  value={state.vin}
                  maxLength={17}
                  onChange={(event) =>
                    set(
                      "vin",
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-HJ-NPR-Z0-9]/g, ""),
                    )
                  }
                  placeholder="17-character VIN"
                />
                <button
                  type="button"
                  className="decode-button"
                  onClick={decode}
                  disabled={decoding || state.vin.length !== 17}
                >
                  <Icon name="spark" size={15} />
                  {decoding ? "Decoding…" : "Decode VIN"}
                </button>
              </div>
            </Field>
            <Field label="Year">
              <input
                inputMode="numeric"
                value={state.year}
                onChange={(event) =>
                  set("year", event.target.value.replace(/\D/g, ""))
                }
                placeholder="2022"
              />
            </Field>
            <Field label="Make">
              <input
                value={state.make}
                onChange={(event) => set("make", event.target.value)}
                placeholder="Toyota"
              />
            </Field>
            <Field label="Model">
              <input
                value={state.model}
                onChange={(event) => set("model", event.target.value)}
                placeholder="RAV4"
              />
            </Field>
            <Field label="Trim">
              <input
                value={state.trim}
                onChange={(event) => set("trim", event.target.value)}
                placeholder="XLE"
              />
            </Field>
            <Field label="Stock number">
              <input
                value={state.stockNumber}
                onChange={(event) => set("stockNumber", event.target.value)}
                placeholder="YC-2401"
              />
            </Field>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-heading">
            <span>02</span>
            <div>
              <h2>Pricing & mileage</h2>
              <p>Keep the numbers clear and current.</p>
            </div>
          </div>
          <div className="editor-fields editor-fields--three">
            <Field label="Price">
              <div className="prefix-input">
                <span>$</span>
                <input
                  inputMode="decimal"
                  value={state.price}
                  onChange={(event) => set("price", event.target.value)}
                  placeholder="24,900"
                />
              </div>
            </Field>
            <Field label="Mileage">
              <div className="suffix-input">
                <input
                  inputMode="numeric"
                  value={state.mileage}
                  onChange={(event) =>
                    set("mileage", event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="31,800"
                />
                <span>mi</span>
              </div>
            </Field>
            <Field label="Status">
              <select
                value={state.status}
                onChange={(event) =>
                  set("status", event.target.value as VehicleStatus)
                }
              >
                <option value="draft">Draft</option>
                <option value="available">Available</option>
                <option value="pending">Pending</option>
                <option value="sold">Sold</option>
                <option value="hidden">Hidden</option>
              </select>
            </Field>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-heading">
            <span>03</span>
            <div>
              <h2>Specifications</h2>
              <p>Optional fields can be filled in later.</p>
            </div>
          </div>
          <div className="editor-fields editor-fields--three">
            <Field label="Body type">
              <input
                value={state.bodyType}
                onChange={(event) => set("bodyType", event.target.value)}
                placeholder="SUV"
              />
            </Field>
            <Field label="Drivetrain">
              <input
                value={state.drivetrain}
                onChange={(event) => set("drivetrain", event.target.value)}
                placeholder="AWD"
              />
            </Field>
            <Field label="Transmission">
              <input
                value={state.transmission}
                onChange={(event) => set("transmission", event.target.value)}
                placeholder="Automatic"
              />
            </Field>
            <Field label="Fuel type">
              <input
                value={state.fuelType}
                onChange={(event) => set("fuelType", event.target.value)}
                placeholder="Gasoline"
              />
            </Field>
            <Field label="Engine">
              <input
                value={state.engine}
                onChange={(event) => set("engine", event.target.value)}
                placeholder="2.5L 4-cyl"
              />
            </Field>
            <Field label="Exterior color">
              <input
                value={state.exteriorColor}
                onChange={(event) => set("exteriorColor", event.target.value)}
                placeholder="Lunar Rock"
              />
            </Field>
            <Field label="Interior color">
              <input
                value={state.interiorColor}
                onChange={(event) => set("interiorColor", event.target.value)}
                placeholder="Black"
              />
            </Field>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-heading">
            <span>04</span>
            <div>
              <h2>Description & features</h2>
              <p>Plain text keeps the listing fast, readable, and safe.</p>
            </div>
          </div>
          <Field label="Description">
            <textarea
              rows={6}
              value={state.description}
              onChange={(event) => set("description", event.target.value)}
              placeholder="Tell shoppers what stands out about this vehicle."
            />
          </Field>
          <Field label="Features (one per line)">
            <textarea
              rows={5}
              value={state.features}
              onChange={(event) => set("features", event.target.value)}
              placeholder={"Backup camera\nBluetooth\nHeated seats"}
            />
          </Field>
        </section>
        <section className="form-section">
          <div className="form-section-heading">
            <span>05</span>
            <div>
              <h2>Photos</h2>
              <p>
                Lead with a clear cover image. JPEG, PNG, or WebP up to 12 MB.
              </p>
            </div>
          </div>
          {isNew ? (
            <div className="upload-locked">
              <Icon name="upload" size={24} />
              <p>Save this vehicle as a draft first, then add photos.</p>
            </div>
          ) : (
            <>
              <label
                className="upload-drop"
                onDragOver={(event) => event.preventDefault()}
                onDrop={dropFiles}
              >
                <Icon name="upload" size={24} />
                <strong>Drop photos here or choose files</strong>
                <span>
                  {uploading > 0 && uploading < 100
                    ? `Uploading ${uploading}%…`
                    : "We’ll resize and upload them one at a time."}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={upload}
                />
              </label>
              {failedUploads.length > 0 && (
                <div className="upload-retry-list" role="status">
                  <strong>
                    {failedUploads.length} photo
                    {failedUploads.length === 1 ? "" : "s"} need attention
                  </strong>
                  {failedUploads.map((file) => (
                    <button
                      type="button"
                      key={`${file.name}-${file.lastModified}`}
                      onClick={() => retryUpload(file)}
                    >
                      Retry {file.name} <Icon name="arrow" size={14} />
                    </button>
                  ))}
                </div>
              )}
              {state.images.length > 0 && (
                <div className="image-manager">
                  {state.images.map((image, index) => (
                    <div
                      className={`image-manager-item ${image.isCover ? "is-cover" : ""}`}
                      key={image.id}
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => dropImage(index)}
                    >
                      <img
                        src={
                          image.r2Key
                            ? `/media/${image.r2Key}?w=320&format=webp`
                            : "/vehicle-placeholder.svg"
                        }
                        alt={`${state.title} view ${index + 1}`}
                        width="160"
                        height="108"
                      />
                      <span className="drag-handle">
                        <Icon name="grip" size={17} />
                      </span>
                      <div className="image-manager-meta">
                        <strong>
                          {image.isCover ? "Cover image" : `Photo ${index + 1}`}
                        </strong>
                        <small>
                          {image.originalFilename ?? "Uploaded image"}
                        </small>
                      </div>
                      <div className="image-manager-actions">
                        <button
                          type="button"
                          onClick={() => setCover(image)}
                          disabled={image.isCover}
                        >
                          {image.isCover ? "Cover" : "Set cover"}
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => reorder(index, -1)}
                          disabled={index === 0}
                          aria-label="Move image up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => reorder(index, 1)}
                          disabled={index === state.images.length - 1}
                          aria-label="Move image down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => removeImage(image)}
                          aria-label="Remove image"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
        <section className="form-section form-section--publish">
          <div className="form-section-heading">
            <span>06</span>
            <div>
              <h2>Publishing</h2>
              <p>Choose where this listing appears.</p>
            </div>
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={state.featured}
              onChange={(event) => set("featured", event.target.checked)}
            />
            <span className="toggle" />
            <span>
              <strong>Feature on home page</strong>
              <small>Place this vehicle in the featured selection.</small>
            </span>
          </label>
        </section>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && " *"}
      </span>
      {children}
    </label>
  );
}

function AdminLeadsPage() {
  const { id: leadId } = useParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  usePageMeta("Leads | YC Auto USA", undefined, true);
  const load = () => {
    setLoading(true);
    mutate(`/api/admin/leads${filter ? `?status=${filter}` : ""}`, "GET")
      .then((result) => {
        const nextLeads = result.leads ?? [];
        setLeads(nextLeads);
        if (leadId)
          setSelected(
            nextLeads.find((lead: Lead) => lead.id === leadId) ?? null,
          );
        setLoading(false);
      })
      .catch((reason) => {
        setError(
          reason instanceof Error ? reason.message : "Unable to load leads.",
        );
        setLoading(false);
      });
  };
  useEffect(load, [filter, leadId]);
  async function saveLead(next: Lead) {
    try {
      const result = await mutate(`/api/admin/leads/${next.id}`, "PATCH", {
        status: next.status,
        adminNotes: next.adminNotes ?? "",
      });
      const updated = result.lead ?? next;
      setLeads((old) =>
        old.map((lead) => (lead.id === next.id ? updated : lead)),
      );
      setSelected(updated);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save lead.",
      );
    }
  }
  return (
    <div className="admin-list-page">
      <div className="admin-page-intro">
        <div>
          <p className="eyebrow">Leads / Inbox</p>
          <h1>Conversations.</h1>
          <p className="admin-subtitle">Every inquiry, one simple next step.</p>
        </div>
      </div>
      <div className="admin-toolbar">
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="">All leads</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="closed">Closed</option>
          <option value="spam">Spam</option>
        </select>
        <span className="toolbar-count">{leads.length} messages</span>
      </div>
      {error && <ErrorBlock message={error} />}
      {loading ? (
        <Loading label="Loading leads" />
      ) : leads.length ? (
        <div className="lead-grid">
          <div className="lead-list">
            {leads.map((lead) => (
              <button
                key={lead.id}
                className={`lead-row ${selected?.id === lead.id ? "active" : ""}`}
                onClick={() => setSelected(lead)}
              >
                <span className="lead-avatar">
                  {lead.name.charAt(0).toUpperCase()}
                </span>
                <span className="lead-row-copy">
                  <strong>{lead.name}</strong>
                  <small>{lead.vehicle?.title ?? "General inquiry"}</small>
                  <p>{lead.message || "No message provided."}</p>
                </span>
                <span className={`lead-status lead-status--${lead.status}`}>
                  {lead.status}
                </span>
                <time>
                  {new Date(lead.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              </button>
            ))}
          </div>
          <div className="lead-detail">
            {selected ? (
              <LeadDetail lead={selected} onSave={saveLead} />
            ) : (
              <div className="panel-empty">
                <Icon name="message" size={24} />
                <p>Select a lead to open it.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="panel-empty panel-empty--page">
          <Icon name="inbox" size={28} />
          <p>Your inbox is clear.</p>
          <span>
            New inquiries will appear here after they’re safely stored.
          </span>
        </div>
      )}
    </div>
  );
}

function LeadDetail({
  lead,
  onSave,
}: {
  lead: Lead;
  onSave: (lead: Lead) => void;
}) {
  const [draft, setDraft] = useState(lead);
  useEffect(() => setDraft(lead), [lead]);
  return (
    <div>
      <div className="lead-detail-head">
        <div>
          <p className="eyebrow">Lead / {lead.leadType.replace("_", " ")}</p>
          <h2>{lead.name}</h2>
        </div>
      </div>
      {lead.vehicle && (
        <Link
          className="lead-vehicle-context"
          to={`/admin/vehicles/${lead.vehicle.id}`}
        >
          <Icon name="car" size={17} />
          <span>
            <small>Vehicle</small>
            <strong>{lead.vehicle.title}</strong>
          </span>
          <Icon name="arrow" size={16} />
        </Link>
      )}
      <div className="lead-contact-grid">
        <a
          href={
            lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, "")}` : undefined
          }
        >
          <span>Phone</span>
          <strong>{lead.phone ?? "Not provided"}</strong>
        </a>
        <a href={lead.email ? `mailto:${lead.email}` : undefined}>
          <span>Email</span>
          <strong>{lead.email ?? "Not provided"}</strong>
        </a>
        <div>
          <span>Prefers</span>
          <strong>{lead.preferredContact ?? "Not specified"}</strong>
        </div>
        <div>
          <span>Received</span>
          <strong>{new Date(lead.createdAt).toLocaleString()}</strong>
        </div>
      </div>
      <div className="lead-message">
        <span>Message</span>
        <p>{lead.message || "No message provided."}</p>
      </div>
      <Field label="Lead status">
        <select
          value={draft.status}
          onChange={(event) =>
            setDraft({ ...draft, status: event.target.value as Lead["status"] })
          }
        >
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="closed">Closed</option>
          <option value="spam">Spam</option>
        </select>
      </Field>
      <Field label="Admin notes">
        <textarea
          rows={5}
          value={draft.adminNotes ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, adminNotes: event.target.value })
          }
          placeholder="Add follow-up details…"
        />
      </Field>
      <button className="button button--dark" onClick={() => onSave(draft)}>
        Save lead <Icon name="arrow" size={16} />
      </button>
    </div>
  );
}

function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>(demoSettings);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  usePageMeta("Website settings | YC Auto USA", undefined, true);
  useEffect(() => {
    mutate("/api/admin/settings", "GET")
      .then((result) => {
        setSettings(result.settings ?? demoSettings);
        setLoadError("");
        setLoading(false);
      })
      .catch((reason) => {
        setLoadError(
          reason instanceof Error ? reason.message : "Unable to load settings.",
        );
        setLoading(false);
      });
  }, []);
  const set = (key: keyof SiteSettings, value: string | null) =>
    setSettings((old) => ({ ...old, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    try {
      const result = await mutate("/api/admin/settings", "PUT", settings);
      setSettings(result.settings ?? settings);
      setMessage("Website settings saved.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save settings.",
      );
    }
  }
  if (loading) return <Loading label="Loading settings" />;
  if (loadError) return <ErrorBlock message={loadError} />;
  return (
    <div className="settings-page">
      <div className="admin-page-intro">
        <div>
          <p className="eyebrow">Website / Settings</p>
          <h1>The essentials.</h1>
          <p className="admin-subtitle">
            Update public business details without touching code.
          </p>
        </div>
        <button className="button button--red" form="settings-form">
          Save changes <Icon name="arrow" size={16} />
        </button>
      </div>
      {message && (
        <div className="notice notice--success">
          <Icon name="check" size={17} />
          {message}
        </div>
      )}
      {error && <ErrorBlock message={error} />}
      <form id="settings-form" className="editor-form" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-heading">
            <span>01</span>
            <div>
              <h2>Business details</h2>
              <p>Shown in the header, footer, and contact page.</p>
            </div>
          </div>
          <div className="editor-fields">
            <Field label="Business name" required>
              <input
                value={settings.businessName}
                onChange={(event) => set("businessName", event.target.value)}
                required
              />
            </Field>
            <Field label="Short name" required>
              <input
                value={settings.shortName}
                onChange={(event) => set("shortName", event.target.value)}
                required
              />
            </Field>
            <Field label="Phone" required>
              <input
                value={settings.phone}
                onChange={(event) => set("phone", event.target.value)}
                required
              />
            </Field>
            <Field label="SMS number">
              <input
                value={settings.smsNumber}
                onChange={(event) => set("smsNumber", event.target.value)}
              />
            </Field>
            <Field label="Public email" required>
              <input
                type="email"
                value={settings.email}
                onChange={(event) => set("email", event.target.value)}
                required
              />
            </Field>
            <Field label="Lead notification email" required>
              <input
                type="email"
                value={settings.leadNotificationRecipient}
                onChange={(event) =>
                  set("leadNotificationRecipient", event.target.value)
                }
                required
              />
            </Field>
            <Field label="Address" required>
              <input
                value={settings.address}
                onChange={(event) => set("address", event.target.value)}
                required
              />
            </Field>
            <Field label="Business hours">
              <input
                value={settings.businessHours}
                onChange={(event) => set("businessHours", event.target.value)}
              />
            </Field>
            <Field label="Verified WhatsApp number (optional)">
              <input
                value={settings.whatsappNumber ?? ""}
                onChange={(event) =>
                  set("whatsappNumber", event.target.value || null)
                }
                placeholder="Leave blank unless verified"
              />
            </Field>
            <Field label="Logo R2 key (optional)">
              <input
                value={settings.logoKey ?? ""}
                onChange={(event) => set("logoKey", event.target.value || null)}
                placeholder="branding/logo.svg"
              />
            </Field>
            <Field label="Favicon R2 key (optional)">
              <input
                value={settings.faviconKey ?? ""}
                onChange={(event) =>
                  set("faviconKey", event.target.value || null)
                }
                placeholder="branding/favicon.svg"
              />
            </Field>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-heading">
            <span>02</span>
            <div>
              <h2>Home & about</h2>
              <p>Keep these statements factual and concise.</p>
            </div>
          </div>
          <div className="editor-fields">
            <Field label="Hero title" required>
              <input
                value={settings.heroTitle}
                onChange={(event) => set("heroTitle", event.target.value)}
                required
              />
            </Field>
            <Field label="Hero subtitle" required>
              <input
                value={settings.heroSubtitle}
                onChange={(event) => set("heroSubtitle", event.target.value)}
                required
              />
            </Field>
          </div>
          <Field label="About text">
            <textarea
              rows={5}
              value={settings.aboutText}
              onChange={(event) => set("aboutText", event.target.value)}
            />
          </Field>
          <Field label="Why choose YC Auto">
            <textarea
              rows={4}
              value={settings.whyChooseText}
              onChange={(event) => set("whyChooseText", event.target.value)}
            />
          </Field>
        </section>
        <section className="form-section">
          <div className="form-section-heading">
            <span>03</span>
            <div>
              <h2>Search appearance</h2>
              <p>Used as the default title and summary in search results.</p>
            </div>
          </div>
          <Field label="SEO title">
            <input
              value={settings.seoTitle}
              onChange={(event) => set("seoTitle", event.target.value)}
            />
          </Field>
          <Field label="SEO description">
            <textarea
              rows={3}
              value={settings.seoDescription}
              onChange={(event) => set("seoDescription", event.target.value)}
            />
          </Field>
        </section>
      </form>
    </div>
  );
}

type AuditItem = {
  id: string;
  adminEmail: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};
function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  usePageMeta("Audit log | YC Auto USA", undefined, true);
  useEffect(() => {
    mutate("/api/admin/audit", "GET")
      .then((result) => {
        setLogs(result.logs ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);
  return (
    <div className="admin-list-page">
      <div className="admin-page-intro">
        <div>
          <p className="eyebrow">Security / Record</p>
          <h1>Audit log.</h1>
          <p className="admin-subtitle">
            A read-only trail of important admin changes.
          </p>
        </div>
      </div>
      {loading ? (
        <Loading label="Loading audit log" />
      ) : logs.length ? (
        <div className="audit-list">
          {logs.map((log) => (
            <div className="audit-row" key={log.id}>
              <span className="audit-mark">
                <Icon name="shield" size={16} />
              </span>
              <div>
                <strong>{log.action.replaceAll("_", " ")}</strong>
                <p>
                  {log.entityType}
                  {log.entityId ? ` · ${log.entityId}` : ""}
                </p>
              </div>
              <span>{log.adminEmail}</span>
              <time>{new Date(log.createdAt).toLocaleString()}</time>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-empty panel-empty--page">
          <Icon name="shield" size={26} />
          <p>No audit entries yet.</p>
          <span>Important admin actions will be recorded here.</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/:slug" element={<VehicleDetailPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="privacy" element={<LegalPage kind="privacy" />} />
        <Route path="terms" element={<LegalPage kind="terms" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="vehicles" element={<AdminVehiclesPage />} />
        <Route path="vehicles/new" element={<AdminVehicleEditorPage />} />
        <Route path="vehicles/:id" element={<AdminVehicleEditorPage />} />
        <Route path="leads" element={<AdminLeadsPage />} />
        <Route path="leads/:id" element={<AdminLeadsPage />} />
        <Route path="settings" element={<AdminSettingsPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  );
}
