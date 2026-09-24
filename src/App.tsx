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
  useLocation,
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
import {
  canUseLocalDemo,
  getAdminVehicles,
  getDashboard,
  getHome,
  getInventory,
  getInventoryFacets,
  getVehicle,
  isNotFoundError,
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
import { VehiclePaymentCalculator } from "../components/VehiclePaymentCalculator";
import { FinancingSettings } from "../components/FinancingSettings";
import { FinancingSummary } from "../components/FinancingSummary";
import { PreapprovalApplicationPanel } from "../components/PreapprovalApplicationPanel";
import {
  LeadNotificationPanel,
  notificationLabel,
} from "../components/LeadNotificationPanel";
import { StaffSection } from "../components/StaffSection";
import { modelsForMake, VEHICLE_MAKES } from "./vehicle-catalog";
import { requestJson } from "./http";
import {
  formatLocalizedMileage,
  formatLocalizedPrice,
  localizedPath,
  useLocale,
} from "./i18n";

function usePageMeta(
  title: string,
  description?: string,
  noIndex = false,
  image?: string,
) {
  const { locale } = useLocale();
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
    const barePath =
      window.location.pathname === "/zh"
        ? "/"
        : window.location.pathname.startsWith("/zh/")
          ? window.location.pathname.slice(3)
          : window.location.pathname;
    for (const [language, hrefLocale] of [
      ["en", "en"],
      ["zh-CN", "zh"],
      ["x-default", "en"],
    ] as const) {
      let alternate = document.querySelector<HTMLLinkElement>(
        `link[rel="alternate"][hreflang="${language}"]`,
      );
      if (!alternate) {
        alternate = document.createElement("link");
        alternate.rel = "alternate";
        alternate.hreflang = language;
        document.head.appendChild(alternate);
      }
      alternate.href = `${window.location.origin}${localizedPath(barePath || "/", hrefLocale)}`;
    }
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
  }, [title, description, noIndex, image, locale]);
}

function Loading({ label = "Loading" }: { label?: string }) {
  const { copy } = useLocale();
  return (
    <div className="loading-state" role="status">
      <span className="loading-orbit" />
      <span>{label === "Loading" ? copy.common.loading : label}…</span>
    </div>
  );
}
function NotFound({ label }: { label?: string }) {
  const { copy, path } = useLocale();
  return (
    <section className="empty-page container">
      <p className="eyebrow">{copy.notFound.eyebrow}</p>
      <h1>{label ?? copy.notFound.title}</h1>
      <p>{copy.notFound.copy}</p>
      <Link className="button button--dark" to={path("/inventory")}>
        {copy.notFound.browse} <Icon name="arrow" size={17} />
      </Link>
    </section>
  );
}
function ErrorBlock({
  message,
  onRetry,
  retrying = false,
}: {
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { copy, isZh } = useLocale();
  return (
    <div className="inline-error" role="alert">
      <Icon name="close" size={17} />{" "}
      <span>{message ?? copy.common.error}</span>
      {onRetry && (
        <button
          className="text-button"
          type="button"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? copy.common.loading : isZh ? "重试" : "Try again"}
        </button>
      )}
    </div>
  );
}

function useStoreSettings() {
  const [settings, setSettings] = useState<SiteSettings>(demoSettings);
  const [settingsError, setSettingsError] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setSettingsLoading(true);
    getHome()
      .then((data) => {
        if (!active) return;
        setSettings(data.settings);
        setSettingsError(false);
      })
      .catch(() => {
        if (active) setSettingsError(true);
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return {
    settings,
    settingsError,
    settingsLoading,
    retrySettings: () => setAttempt((value) => value + 1),
  };
}

function HomePage() {
  const { copy, isZh, path } = useLocale();
  const localDemo = canUseLocalDemo();
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
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  usePageMeta(
    isZh ? data.settings.seoTitleZh || "YC Auto USA" : data.settings.seoTitle,
    isZh
      ? data.settings.seoDescriptionZh || copy.home.subtitle
      : data.settings.seoDescription,
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    getHome()
      .then((result) => {
        if (!active) return;
        setData(result);
        setLoadError("");
      })
      .catch(() => {
        if (active) setLoadError(copy.home.unavailable);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [copy.home.unavailable, attempt]);
  const settings = data.settings;
  const heroTitle = isZh
    ? settings.heroTitleZh || copy.home.title
    : settings.heroTitle;
  const heroSubtitle = isZh
    ? settings.heroSubtitleZh || copy.home.subtitle
    : settings.heroSubtitle;
  const whyCopy = isZh
    ? settings.whyChooseTextZh || copy.home.whyFallback
    : settings.whyChooseText;
  return (
    <>
      {loadError && (
        <div className="container">
          <ErrorBlock
            message={loadError}
            onRetry={() => setAttempt((value) => value + 1)}
            retrying={loading}
          />
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
      <section className="hero hero--light">
        <div className="hero-sheen" />
        <div className="container hero-grid">
          <div className="hero-copy reveal">
            <p className="eyebrow">
              <span className="eyebrow-dot" /> {copy.home.location}
            </p>
            <h1>{heroTitle}</h1>
            <p className="hero-subtitle">{heroSubtitle}</p>
            <div className="hero-actions">
              <Link className="button button--red" to={path("/inventory")}>
                {copy.home.browse} <Icon name="arrow" size={17} />
              </Link>
              <Link className="button button--outline" to={path("/trade-sell")}>
                {copy.home.trade} <Icon name="arrow" size={17} />
              </Link>
            </div>
            <div className="hero-proof">
              <span>
                <Icon name="shield" size={16} /> {copy.home.proofInventory}
              </span>
              <span>
                <Icon name="pin" size={16} /> {copy.home.proofVisit}
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
      </section>
      <section className="section section--featured">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{copy.home.handpicked}</p>
              <h2>{copy.home.featured}</h2>
            </div>
            <Link className="arrow-link" to={path("/inventory")}>
              {copy.home.viewAll} <Icon name="arrow" size={17} />
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
              <p>{copy.home.arriving}</p>
              <Link to={path("/inventory")}>{copy.home.seeInventory}</Link>
            </div>
          )}
        </div>
      </section>
      <section className="section section--makes">
        <div className="container makes-layout">
          <div className="makes-intro">
            <p className="eyebrow">{copy.home.findFit}</p>
            <h2>
              {copy.home.browseBy}
              <br />
              <em>{copy.home.make}</em>
            </h2>
            <p>{copy.home.makeIntro}</p>
            <Link className="arrow-link" to={path("/inventory")}>
              {copy.home.exploreAll} <Icon name="arrow" size={17} />
            </Link>
          </div>
          <div className="make-list">
            {data.makes.map((item, index) => (
              <Link
                key={item.make}
                to={path(`/inventory?make=${encodeURIComponent(item.make)}`)}
                className="make-row"
              >
                <span className="make-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <strong>{item.make}</strong>
                <span className="make-count">
                  {item.count}{" "}
                  {item.count === 1 ? copy.home.vehicle : copy.home.vehicles}
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
            <p className="eyebrow">{copy.home.ycWay}</p>
            <h2>
              {copy.home.betterWay}
              <br />
              <em>{copy.home.shopLocal}</em>
            </h2>
            <p className="why-copy">{whyCopy}</p>
            <div className="why-points">
              <div>
                <span>01</span>
                <strong>{copy.home.clearTitle}</strong>
                <p>{copy.home.clearCopy}</p>
              </div>
              <div>
                <span>02</span>
                <strong>{copy.home.humanTitle}</strong>
                <p>{copy.home.humanCopy}</p>
              </div>
              <div>
                <span>03</span>
                <strong>{copy.home.localTitle}</strong>
                <p>{copy.home.localCopy}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="cta-band">
        <div className="container cta-band-inner">
          <div>
            <p className="eyebrow eyebrow--light">{copy.home.ready}</p>
            <h2>
              {copy.home.findRight}
              <br />
              <em>{copy.home.rightOne}</em>
            </h2>
          </div>
          <Link className="button button--cream" to={path("/contact")}>
            {copy.home.talk} <Icon name="arrow" size={17} />
          </Link>
        </div>
      </section>
    </>
  );
}

function InventoryPage() {
  const { copy, isZh } = useLocale();
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
  const [attempt, setAttempt] = useState(0);
  const [facetsError, setFacetsError] = useState(false);
  const [facets, setFacets] = useState<{
    makes: Array<{ make: string; count: number }>;
    years: number[];
  }>({ makes: [], years: [] });
  const normalizedParams = new URLSearchParams(searchParams);
  normalizedParams.delete("model");
  const query = normalizedParams.toString();
  usePageMeta(copy.inventory.metaTitle, copy.inventory.metaDescription);
  useEffect(() => {
    let active = true;
    getInventoryFacets()
      .then((result) => {
        if (!active) return;
        setFacets(result);
        setFacetsError(false);
      })
      .catch(() => {
        if (active) setFacetsError(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!searchParams.has("model")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("model");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
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
            !isZh && reason instanceof Error
              ? reason.message
              : copy.inventory.loadError,
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [query, copy.inventory.loadError, isZh, attempt]);
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
          <p className="eyebrow">{copy.inventory.eyebrow}</p>
          <h1>
            {copy.inventory.title}
            <br />
            <em>{copy.inventory.titleAccent}</em>
          </h1>
        </div>
        <div className="inventory-count">
          <span>{data?.total ?? "—"}</span>
          <small>
            {copy.inventory.vehiclesExplore.split("\n").map((line) => (
              <span key={line}>{line}</span>
            ))}
          </small>
        </div>
      </div>
      <div className="container inventory-layout">
        <aside
          className={`filter-panel ${filterOpen ? "filter-panel--open" : ""}`}
        >
          <div className="filter-header">
            <span className="eyebrow">{copy.inventory.filter}</span>
            <button
              className="icon-button filter-close"
              onClick={() => setFilterOpen(false)}
              aria-label={copy.inventory.closeFilters}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          {facetsError && (
            <ErrorBlock
              message={
                isZh
                  ? "部分筛选条件暂时无法加载。"
                  : "Some filters could not be loaded."
              }
              onRetry={() => setAttempt((value) => value + 1)}
              retrying={loading}
            />
          )}
          <FilterControls
            params={searchParams}
            update={update}
            clear={clear}
            facets={facets}
          />
          <button
            className="button button--dark filter-done"
            onClick={() => setFilterOpen(false)}
          >
            {copy.inventory.show} <Icon name="arrow" size={16} />
          </button>
        </aside>
        {filterOpen && (
          <button
            className="filter-overlay"
            aria-label={copy.inventory.closeFilters}
            onClick={() => setFilterOpen(false)}
          />
        )}
        <div className="inventory-results">
          <div className="results-toolbar">
            <button
              className="filter-trigger"
              onClick={() => setFilterOpen(true)}
            >
              <Icon name="filter" size={17} /> {copy.inventory.filters}
              {searchParams.size > 0 && <span>{searchParams.size}</span>}
            </button>
            <label className="sort-control">
              <span>{copy.inventory.sort}</span>
              <select
                value={searchParams.get("sort") ?? "newest"}
                onChange={(event) => update("sort", event.target.value)}
              >
                <option value="newest">{copy.inventory.newest}</option>
                <option value="price_asc">{copy.inventory.priceLow}</option>
                <option value="price_desc">{copy.inventory.priceHigh}</option>
                <option value="mileage_asc">{copy.inventory.mileageLow}</option>
                <option value="year_desc">{copy.inventory.yearNew}</option>
              </select>
              <Icon name="chevron" size={14} />
            </label>
          </div>
          {loading ? (
            <Loading label={copy.inventory.loading} />
          ) : loadError ? (
            <ErrorBlock
              message={loadError}
              onRetry={() => setAttempt((value) => value + 1)}
            />
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
              <h2>{copy.inventory.none}</h2>
              <p>{copy.inventory.noneCopy}</p>
              <button className="button button--dark" onClick={clear}>
                {copy.inventory.clear} <Icon name="arrow" size={17} />
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
  facets,
}: {
  params: URLSearchParams;
  update: (key: string, value: string) => void;
  clear: () => void;
  facets: {
    makes: Array<{ make: string; count: number }>;
    years: number[];
  };
}) {
  const { copy } = useLocale();
  return (
    <div className="filter-controls">
      <label>
        <span>{copy.inventory.make}</span>
        <select
          value={params.get("make") ?? ""}
          onChange={(event) => update("make", event.target.value)}
        >
          <option value="">{copy.inventory.allMakes}</option>
          {facets.makes.map(({ make, count }) => (
            <option key={make} value={make}>
              {make} ({count})
            </option>
          ))}
        </select>
      </label>
      <div className="filter-two">
        <label>
          <span>{copy.inventory.minYear}</span>
          <select
            value={params.get("minYear") ?? ""}
            onChange={(event) => update("minYear", event.target.value)}
          >
            <option value="">{copy.inventory.anyYear}</option>
            {[...facets.years]
              .sort((a, b) => a - b)
              .map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>{copy.inventory.maxYear}</span>
          <select
            value={params.get("maxYear") ?? ""}
            onChange={(event) => update("maxYear", event.target.value)}
          >
            <option value="">{copy.inventory.anyYear}</option>
            {facets.years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filter-two">
        <label>
          <span>{copy.inventory.minPrice}</span>
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
          <span>{copy.inventory.maxPrice}</span>
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
        <span>{copy.inventory.maxMileage}</span>
        <select
          value={params.get("maxMileage") ?? ""}
          onChange={(event) => update("maxMileage", event.target.value)}
        >
          <option value="">{copy.inventory.anyMileage}</option>
          <option value="30000">{copy.inventory.under} 30,000 mi</option>
          <option value="60000">{copy.inventory.under} 60,000 mi</option>
          <option value="90000">{copy.inventory.under} 90,000 mi</option>
          <option value="120000">{copy.inventory.under} 120,000 mi</option>
        </select>
      </label>
      <label>
        <span>{copy.inventory.body}</span>
        <select
          value={params.get("bodyType") ?? ""}
          onChange={(event) => update("bodyType", event.target.value)}
        >
          <option value="">{copy.inventory.anyBody}</option>
          <option>SUV</option>
          <option value="Sedan">{copy.inventory.sedan}</option>
          <option value="Truck">{copy.inventory.truck}</option>
          <option value="Wagon">{copy.inventory.wagon}</option>
          <option value="Coupe">{copy.inventory.coupe}</option>
        </select>
      </label>
      <label>
        <span>{copy.inventory.drivetrain}</span>
        <select
          value={params.get("drivetrain") ?? ""}
          onChange={(event) => update("drivetrain", event.target.value)}
        >
          <option value="">{copy.inventory.anyDrive}</option>
          <option>AWD</option>
          <option>4WD</option>
          <option>FWD</option>
          <option>RWD</option>
        </select>
      </label>
      <button className="clear-button" onClick={clear}>
        {copy.inventory.clearAll} <Icon name="close" size={14} />
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
  const { copy } = useLocale();
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) return null;
  return (
    <nav className="pagination" aria-label={copy.inventory.pages}>
      <button
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label={copy.inventory.previous}
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
        aria-label={copy.inventory.next}
      >
        →
      </button>
    </nav>
  );
}

function VehicleDetailPage() {
  const { copy, isZh, locale, path } = useLocale();
  const { slug = "" } = useParams();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const { settings, settingsError, settingsLoading, retrySettings } =
    useStoreSettings();
  const [similar, setSimilar] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [formType, setFormType] = useState<
    "availability" | "test_drive" | null
  >(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  usePageMeta(
    vehicle
      ? `${vehicle.title} | YC Auto USA`
      : `${copy.common.vehicle} | YC Auto USA`,
    vehicle?.description ?? undefined,
    false,
    vehicle ? vehicleImage(vehicle) : undefined,
  );
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    setNotFound(false);
    setVehicle(null);
    setSimilar([]);
    setFormType(null);
    getVehicle(slug)
      .then((value) => {
        if (alive) {
          setVehicle(value);
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (alive) {
          setNotFound(isNotFoundError(reason));
          setError(
            !isZh && reason instanceof Error
              ? reason.message
              : copy.common.error,
          );
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [slug, copy.common.error, isZh, attempt]);
  useEffect(() => {
    if (!vehicle?.make) return;
    let active = true;
    getInventory(`make=${encodeURIComponent(vehicle.make)}&perPage=12`)
      .then((result) => {
        if (active)
          setSimilar(
            result.vehicles
              .filter(
                (item) => item.id !== vehicle.id && item.status === "available",
              )
              .slice(0, 3),
          );
      })
      .catch(() => {
        if (active) setSimilar([]);
      });
    return () => {
      active = false;
    };
  }, [vehicle]);
  if (loading)
    return (
      <div className="container page-loading">
        <Loading label={copy.detail.loading} />
      </div>
    );
  if (notFound) return <NotFound label={copy.detail.notFound} />;
  if (!vehicle || error)
    return (
      <section className="container empty-page">
        <ErrorBlock
          message={error || copy.common.error}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      </section>
    );
  const images = vehicle.images?.length ? vehicle.images : [];
  const galleryImages = images.length ? images : [null];
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
  const galleryPhotos = galleryImages.map((image, index) => (
    <figure className="gallery-photo" key={image?.id ?? "placeholder"}>
      <img
        src={
          image?.r2Key
            ? `/media/${image.r2Key}?w=1600&format=webp`
            : vehicleImage(vehicle)
        }
        srcSet={
          image?.r2Key
            ? [640, 960, 1600]
                .map(
                  (width) =>
                    `/media/${image.r2Key}?w=${width}&format=webp ${width}w`,
                )
                .join(", ")
            : undefined
        }
        sizes="(max-width: 820px) calc(100vw - 40px), (max-width: 1440px) 50vw, 680px"
        alt={`${vehicle.title} ${copy.detail.imageView} ${index + 1}`}
        loading={index === 0 ? "eager" : "lazy"}
        fetchPriority={index === 0 ? "high" : "auto"}
        decoding="async"
        width={image?.width ?? 1600}
        height={image?.height ?? 1067}
      />
      {index === 0 && (sold || pending) && (
        <StatusPill status={vehicle.status} />
      )}
      <figcaption className="gallery-counter">
        {String(index + 1).padStart(2, "0")} /{" "}
        {String(galleryImages.length).padStart(2, "0")}
      </figcaption>
    </figure>
  ));
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
        {settingsError && (
          <div className="container">
            <ErrorBlock onRetry={retrySettings} retrying={settingsLoading} />
          </div>
        )}
        <div className="container detail-breadcrumb">
          <Link to={path("/inventory")}>{copy.detail.inventory}</Link>
          <span>/</span>
          <span>{vehicle.title}</span>
        </div>
        <div className="container detail-layout">
          <div className="gallery">{galleryPhotos.slice(0, 3)}</div>
          <div className="detail-copy">
            <p className="eyebrow">
              {vehicle.year ?? "—"} /{" "}
              {vehicle.bodyType ?? copy.detail.preownedVehicle}
            </p>
            <h1>{vehicle.title}</h1>
            {!sold && vehicle.priceCents !== null && vehicle.priceCents > 0 ? (
              <VehiclePaymentCalculator
                key={vehicle.id}
                vehicle={vehicle}
                config={
                  settingsError || settingsLoading
                    ? null
                    : (settings.financing ?? null)
                }
                configLoading={settingsLoading}
              />
            ) : (
              <div className="detail-price">
                <strong>
                  {formatLocalizedPrice(vehicle.priceCents, locale)}
                </strong>
                <span>{formatLocalizedMileage(vehicle.mileage, locale)}</span>
              </div>
            )}
            {(sold || pending) && (
              <div className={`detail-status detail-status--${vehicle.status}`}>
                <span />
                {sold ? copy.detail.statusSold : copy.detail.statusPending}
              </div>
            )}
            <div className="detail-actions">
              <a
                className="button button--red"
                href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}
                onClick={() => trackEvent("phone_click", vehicle.id)}
              >
                <Icon name="phone" size={17} /> {copy.detail.call}
              </a>
              {!sold && settings.smsNumber.trim() && (
                <a
                  className="button button--outline"
                  href={`sms:${settings.smsNumber.replace(/[^\d+]/g, "")}`}
                  onClick={() => trackEvent("sms_click", vehicle.id)}
                >
                  <Icon name="message" size={17} /> {copy.detail.text}
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
                  <Icon name="message" size={17} /> {copy.detail.availability}
                </button>
              )}
              {!sold && (
                <button
                  className="button button--outline"
                  onClick={() => setFormType("test_drive")}
                >
                  <Icon name="calendar" size={17} /> {copy.detail.testDrive}
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
                  <span>{copy.detail.stock}</span>
                  <strong>{vehicle.stockNumber}</strong>
                </div>
              )}
            </div>
            <div className="spec-grid">
              {specs.map(([label, value]) => (
                <div key={String(label)}>
                  <span>
                    {copy.detail.specs[label as keyof typeof copy.detail.specs]}
                  </span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
            </div>
            {vehicle.features.length > 0 && (
              <div className="feature-list">
                <p className="eyebrow">{copy.detail.highlights}</p>
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
        {galleryPhotos.length > 3 && (
          <div className="container detail-gallery-more">
            {galleryPhotos.slice(3)}
          </div>
        )}
      </section>
      {similar.length > 0 && (
        <section className="section detail-similar">
          <div className="container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{copy.detail.more}</p>
                <h2>{copy.detail.similar}</h2>
              </div>
              <Link
                className="arrow-link"
                to={path(
                  `/inventory?make=${encodeURIComponent(vehicle.make ?? "")}`,
                )}
              >
                {copy.detail.seeAll} {vehicle.make}{" "}
                <Icon name="arrow" size={17} />
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
            <p className="eyebrow eyebrow--light">{copy.detail.question}</p>
            <h2>
              {copy.detail.makeIt}
              <br />
              <em>{copy.detail.yours}</em>
            </h2>
            <p>{copy.detail.questionCopy}</p>
          </div>
          {sold ? (
            <Link className="button button--cream" to={path("/inventory")}>
              {copy.detail.browseAvailable} <Icon name="arrow" size={17} />
            </Link>
          ) : (
            <button
              className="button button--cream"
              onClick={() => {
                trackEvent("availability_open", vehicle.id);
                setFormType("availability");
              }}
            >
              {copy.detail.send} <Icon name="arrow" size={17} />
            </button>
          )}
        </div>
      </section>
      {formType && (
        <Modal
          title={
            vehicle.status === "pending"
              ? copy.detail.ask
              : copy.detail.availability
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
          <Icon name="phone" size={17} /> {copy.detail.callShort}
        </a>
        {!sold && (
          <button
            onClick={() => {
              trackEvent("availability_open", vehicle.id);
              setFormType("availability");
            }}
          >
            <Icon name="message" size={17} /> {copy.detail.messageShort}
          </button>
        )}
      </div>
    </>
  );
}

function AboutRedirect() {
  const { path } = useLocale();
  const location = useLocation();
  return (
    <Navigate replace to={`${path("/contact")}${location.search}#our-story`} />
  );
}

function StorySection({ settings }: { settings: SiteSettings }) {
  const { copy, isZh, path } = useLocale();
  return (
    <section
      className="editorial-page"
      id="our-story"
      aria-labelledby="story-heading"
    >
      <div className="container editorial-grid">
        <div className="editorial-rail">
          <span>YC</span>
          <small>
            {copy.about.rail.split("\n").map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </small>
          <div className="about-intro">
            <p className="eyebrow">{copy.about.eyebrow}</p>
            <h2 id="story-heading">
              {copy.about.title}
              <br />
              <em>{copy.about.accent}</em>
            </h2>
            <p className="editorial-lede">{copy.about.lede}</p>
          </div>
        </div>
        <div className="editorial-body">
          <p>
            {isZh
              ? settings.aboutTextZh || copy.about.lede
              : settings.aboutText}
          </p>
          <figure className="about-team-photo">
            <img
              src="/brand/team.jpg"
              alt={copy.about.photoAlt}
              width="1920"
              height="1435"
              loading="lazy"
              decoding="async"
            />
            <figcaption>{copy.about.caption}</figcaption>
          </figure>
          <div className="about-notes">
            <div>
              <span>01</span>
              <strong>{copy.about.pace}</strong>
              <p>{copy.about.paceCopy}</p>
            </div>
            <div>
              <span>02</span>
              <strong>{copy.about.person}</strong>
              <p>{copy.about.personCopy}</p>
            </div>
            <div>
              <span>03</span>
              <strong>{copy.about.local}</strong>
              <p>{settings.address}</p>
            </div>
          </div>
          <Link className="button button--dark" to={path("/inventory")}>
            {copy.about.inventory} <Icon name="arrow" size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function LocationMap({ settings }: { settings: SiteSettings }) {
  const { copy, isZh } = useLocale();
  const query = encodeURIComponent(settings.address);
  return (
    <section className="location-section" id="visit-us">
      <div className="container location-grid">
        <div className="location-copy">
          <p className="eyebrow">{copy.map.eyebrow}</p>
          <h2>{copy.map.title}</h2>
          <p>{settings.address}</p>
          <p>{isZh ? copy.contact.hours : settings.businessHours}</p>
          <a
            className="button button--dark"
            href={`https://www.google.com/maps/dir/?api=1&destination=${query}`}
            target="_blank"
            rel="noreferrer"
          >
            {copy.map.directions} <Icon name="arrow" size={17} />
          </a>
        </div>
        <div className="location-map">
          <iframe
            title={copy.map.frameTitle}
            src={`https://www.google.com/maps?q=${query}&output=embed`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </section>
  );
}

function ContactPage() {
  const { copy, isZh } = useLocale();
  const { hash } = useLocation();
  const { settings, settingsError, settingsLoading, retrySettings } =
    useStoreSettings();
  usePageMeta(copy.contact.metaTitle, copy.contact.metaDescription);
  useEffect(() => {
    if (
      ![
        "#our-story",
        "#company-info",
        "#meet-our-staff",
        "#visit-us",
        "#send-a-note",
      ].includes(hash)
    )
      return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(hash.slice(1))?.scrollIntoView(),
    );
    return () => cancelAnimationFrame(frame);
  }, [hash]);
  return (
    <>
      <section className="contact-page contact-page--combined">
        {settingsError && (
          <div className="container">
            <ErrorBlock onRetry={retrySettings} retrying={settingsLoading} />
          </div>
        )}
        <div className="container contact-head">
          <div>
            <p className="eyebrow">{copy.contact.eyebrow}</p>
            <h1>
              {copy.contact.heading}
              <em>.</em>
            </h1>
            <p>{copy.contact.intro}</p>
            <nav
              className="contact-sections"
              aria-label={copy.contact.sections}
            >
              <a href="#our-story">{copy.contact.story}</a>
              <a href="#company-info">{copy.contact.company}</a>
              <a href="#meet-our-staff">{copy.contact.staff}</a>
              <a href="#visit-us">{copy.contact.directions}</a>
              <a href="#send-a-note">{copy.contact.note}</a>
            </nav>
          </div>
          <div
            className="contact-direct"
            id="company-info"
            role="region"
            aria-label={copy.contact.company}
          >
            <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
              <span>{copy.contact.call}</span>
              <strong>{settings.phone}</strong>
              <Icon name="arrow" size={17} />
            </a>
            <a
              href={`mailto:${settings.email}`}
              onClick={() => trackEvent("email_click")}
            >
              <span>{copy.lead.email}</span>
              <strong>{settings.email}</strong>
              <Icon name="arrow" size={17} />
            </a>
            <div>
              <span>{copy.contact.visit}</span>
              <strong>{settings.address}</strong>
              <small>
                {isZh ? copy.contact.hours : settings.businessHours}
              </small>
            </div>
          </div>
        </div>
      </section>
      <StorySection settings={settings} />
      <StaffSection />
      <LocationMap settings={settings} />
      <section className="contact-note-section" id="send-a-note">
        <div className="container contact-form-wrap">
          <div className="contact-form-intro">
            <p className="eyebrow">{copy.contact.note}</p>
            <h2>
              {copy.contact.getBack}
              <br />
              <em>{copy.contact.getBackAccent}</em>
            </h2>
            <p>{copy.contact.timing}</p>
          </div>
          <LeadForm type="contact" />
        </div>
      </section>
    </>
  );
}

function TradeSellPage() {
  const { copy } = useLocale();
  const { settings, settingsError, settingsLoading, retrySettings } =
    useStoreSettings();
  usePageMeta(copy.trade.metaTitle, copy.trade.metaDescription);
  const steps = [
    ["01", copy.trade.step1, copy.trade.step1Copy],
    ["02", copy.trade.step2, copy.trade.step2Copy],
    ["03", copy.trade.step3, copy.trade.step3Copy],
  ];
  return (
    <>
      <section className="trade-page">
        {settingsError && (
          <div className="container">
            <ErrorBlock onRetry={retrySettings} retrying={settingsLoading} />
          </div>
        )}
        <div className="container trade-hero">
          <div>
            <p className="eyebrow">{copy.trade.eyebrow}</p>
            <h1>
              {copy.trade.title}
              <br />
              <em>{copy.trade.accent}</em>
            </h1>
            <p className="trade-lede">{copy.trade.intro}</p>
          </div>
          <div className="trade-content">
            <div className="trade-steps">
              {steps.map(([number, title, body]) => (
                <div key={number}>
                  <span>{number}</span>
                  <strong>{title}</strong>
                  <p>{body}</p>
                </div>
              ))}
            </div>
            <section
              className="trade-form-wrap"
              aria-label={copy.trade.formEyebrow}
            >
              <LeadForm type="trade_sell" compact />
            </section>
          </div>
        </div>
      </section>
      <LocationMap settings={settings} />
    </>
  );
}

function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { copy } = useLocale();
  const privacy = kind === "privacy";
  usePageMeta(
    `${privacy ? copy.legal.privacy : copy.legal.terms} | YC Auto USA`,
    undefined,
  );
  return (
    <section className="legal-page container">
      <p className="eyebrow">
        YC Auto USA / {privacy ? copy.legal.privacy : copy.legal.terms}
      </p>
      <h1>{privacy ? copy.legal.privacy : copy.legal.terms}</h1>
      <p className="legal-updated">{copy.legal.updated}</p>
      {privacy ? (
        <>
          <h2>{copy.legal.infoTitle}</h2>
          <p>{copy.legal.info}</p>
          <h2>{copy.legal.useTitle}</h2>
          <p>{copy.legal.use}</p>
          <h2>{copy.legal.analyticsTitle}</h2>
          <p>{copy.legal.analytics}</p>
          <h2>{copy.legal.contactTitle}</h2>
          <p>
            {copy.legal.contact}{" "}
            <a href="mailto:sophie@youxuancars.com">sophie@youxuancars.com</a>.
          </p>
        </>
      ) : (
        <>
          <h2>{copy.legal.inventoryTitle}</h2>
          <p>{copy.legal.inventory}</p>
          <h2>{copy.legal.websiteTitle}</h2>
          <p>{copy.legal.website}</p>
          <h2>{copy.legal.accuracyTitle}</h2>
          <p>{copy.legal.accuracy}</p>
          <h2>{copy.legal.questionsTitle}</h2>
          <p>
            {copy.legal.questions} <a href="tel:7187990606">718-799-0606</a>.
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
  const { copy } = useLocale();
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
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={copy.common.close}
          >
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
  const removeVehicle = async (vehicle: Vehicle) => {
    if (
      !window.confirm(
        `Remove ${vehicle.title} from inventory? This keeps its audit history but removes it from the storefront and admin inventory.`,
      )
    )
      return;
    setBusy(vehicle.id);
    setActionError("");
    try {
      await mutate(`/api/admin/vehicles/${vehicle.id}/delete`, "POST");
      setData((old) =>
        old
          ? {
              ...old,
              vehicles: old.vehicles.filter((item) => item.id !== vehicle.id),
              total: Math.max(0, old.total - 1),
            }
          : old,
      );
      setSelectedIds((old) => old.filter((item) => item !== vehicle.id));
    } catch (reason) {
      setActionError(
        reason instanceof Error ? reason.message : "Unable to remove vehicle.",
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
          {VEHICLE_MAKES.map((make) => (
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
                    <button
                      className="icon-button danger"
                      disabled={busy === vehicle.id}
                      onClick={() => removeVehicle(vehicle)}
                      aria-label={`Remove ${vehicle.title}`}
                    >
                      <Icon name="trash" size={16} />
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

type FailedUpload = {
  file: File;
  reason: string;
};

const PUBLISHING_OPTIONS: Array<{
  value: VehicleStatus;
  label: string;
  description: string;
  isPublic: boolean;
}> = [
  {
    value: "draft",
    label: "Draft",
    description: "Private to admins while you finish the listing.",
    isPublic: false,
  },
  {
    value: "available",
    label: "Available",
    description: "Live in inventory and ready for customer inquiries.",
    isPublic: true,
  },
  {
    value: "pending",
    label: "Pending",
    description: "Still visible, marked as pending for shoppers.",
    isPublic: true,
  },
  {
    value: "sold",
    label: "Sold",
    description: "Still visible as sold so existing links keep working.",
    isPublic: true,
  },
  {
    value: "hidden",
    label: "Hidden",
    description: "Removed from the public site without deleting it.",
    isPublic: false,
  },
];

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

type PhotoChange = { order: string[]; coverId: string };

async function photoRequest(
  path: string,
  init?: RequestInit,
): Promise<{ images?: VehicleImage[]; image?: VehicleImage }> {
  return requestJson<{ images?: VehicleImage[]; image?: VehicleImage }>(path, {
    ...init,
    timeoutMs: 30_000,
  });
}

function savedPhotoList(result: { images?: VehicleImage[] }): VehicleImage[] {
  if (!Array.isArray(result.images))
    throw new Error("The saved photo list could not be confirmed.");
  return result.images;
}

function matchesPhotoChange(images: VehicleImage[], change: PhotoChange) {
  return (
    images.length === change.order.length &&
    images.every((image, index) => image.id === change.order[index]) &&
    images.find((image) => image.isCover)?.id === change.coverId
  );
}

function AdminVehicleEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const [state, setState] = useState<EditorState>(blankEditor);
  const [previewSlug, setPreviewSlug] = useState("");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [failedUploads, setFailedUploads] = useState<FailedUpload[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [photosBusy, setPhotosBusy] = useState(false);
  const [photoSyncRequired, setPhotoSyncRequired] = useState(false);
  const [pendingPhotoChange, setPendingPhotoChange] =
    useState<PhotoChange | null>(null);
  const photoLock = useRef(false);
  const photosRef = useRef<VehicleImage[]>([]);
  const photosDisabled = photosBusy || photoSyncRequired || saving || deleting;
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
          photosRef.current = vehicle.images ?? [];
          setPhotoSyncRequired(false);
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
  const setPublishingStatus = (status: VehicleStatus) =>
    setState((old) => ({
      ...old,
      status,
      featured: status === "available" ? old.featured : false,
    }));
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
  function vehiclePayload(status: VehicleStatus = state.status) {
    return {
      status,
      featured: status === "available" ? state.featured : false,
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
  }
  async function save(event: FormEvent, statusOverride?: VehicleStatus) {
    event.preventDefault();
    if (photoLock.current || photoSyncRequired || saving || deleting) return;
    const targetStatus = statusOverride ?? state.status;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await saveVehicle(
        vehiclePayload(targetStatus),
        isNew ? undefined : id,
      );
      setState((old) => ({
        ...old,
        status: targetStatus,
        featured: targetStatus === "available" ? old.featured : false,
      }));
      setMessage(
        targetStatus === "draft"
          ? "Draft saved."
          : targetStatus === "available"
            ? "Listing is live and available."
            : `Listing saved as ${targetStatus}.`,
      );
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

  async function ensureVehicleForUpload(): Promise<{
    vehicleId: string;
    created: boolean;
  }> {
    if (!isNew && id) return { vehicleId: id, created: false };
    if (!state.title.trim())
      throw new Error("Add a listing title before uploading photos.");
    setSaving(true);
    try {
      const result = await saveVehicle(vehiclePayload("draft"));
      if (!result.id) throw new Error("Unable to create the vehicle draft.");
      setState((old) => ({ ...old, status: "draft", featured: false }));
      setMessage("Private draft created. Uploading photos…");
      return { vehicleId: result.id, created: true };
    } finally {
      setSaving(false);
    }
  }
  async function removeVehicle() {
    if (isNew || !id || photoLock.current || saving || deleting) return;
    if (
      !window.confirm(
        `Remove ${state.title || "this vehicle"} from inventory? This keeps its audit history but removes it from the storefront and admin inventory.`,
      )
    )
      return;
    setDeleting(true);
    setError("");
    try {
      await mutate(`/api/admin/vehicles/${id}/delete`, "POST");
      navigate("/admin/vehicles", { replace: true });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to remove vehicle.",
      );
      setDeleting(false);
    }
  }
  function applySavedPhotos(images: VehicleImage[]) {
    photosRef.current = images;
    setState((old) => ({ ...old, images }));
  }
  function beginPhotoOperation(allowReload = false) {
    if (
      photoLock.current ||
      saving ||
      deleting ||
      (photoSyncRequired && !allowReload)
    )
      return false;
    photoLock.current = true;
    setPhotosBusy(true);
    setDragIndex(null);
    setPhotoError("");
    setMessage("");
    return true;
  }
  function endPhotoOperation() {
    photoLock.current = false;
    setPhotosBusy(false);
    setUploading(0);
  }
  async function loadSavedPhotos(vehicleId: string) {
    const images = savedPhotoList(
      await photoRequest(`/api/admin/vehicles/${vehicleId}/images`),
    );
    applySavedPhotos(images);
    setPhotoSyncRequired(false);
    return images;
  }
  async function recoverPhotos(
    vehicleId: string,
    detail: string,
    change: PhotoChange | null = null,
  ) {
    setPendingPhotoChange(change);
    try {
      const images = await loadSavedPhotos(vehicleId);
      if (change && matchesPhotoChange(images, change)) {
        setPendingPhotoChange(null);
        setPhotoError("");
        setMessage("Photo changes saved and verified.");
        return;
      }
      setPhotoError(
        `${detail} Saved photos have been reloaded. You can retry.`,
      );
    } catch {
      setPhotoSyncRequired(true);
      setPhotoError(
        `${detail} Reload saved photos before making another photo change.`,
      );
    }
  }
  async function reloadPhotos() {
    if (!id || !beginPhotoOperation(true)) return;
    try {
      const images = await loadSavedPhotos(id);
      if (pendingPhotoChange && matchesPhotoChange(images, pendingPhotoChange))
        setPendingPhotoChange(null);
      setMessage("Saved photos reloaded. Review them before retrying.");
    } catch (reason) {
      setPhotoSyncRequired(true);
      setPhotoError(
        reason instanceof Error ? reason.message : "Unable to reload photos.",
      );
    } finally {
      endPhotoOperation();
    }
  }
  async function persistPhotoChange(change: PhotoChange) {
    if (!id || !beginPhotoOperation()) return;
    setPendingPhotoChange(null);
    const previous: PhotoChange = {
      order: photosRef.current.map((image) => image.id),
      coverId: photosRef.current.find((image) => image.isCover)?.id ?? "",
    };
    try {
      // Retry only against a current list so deleted/new photos cannot be lost.
      const current = await loadSavedPhotos(id);
      if (matchesPhotoChange(current, change)) {
        setMessage("Photo changes saved and verified.");
        return;
      }
      if (
        !matchesPhotoChange(current, previous) ||
        current.length !== change.order.length ||
        current.some((image) => !change.order.includes(image.id))
      ) {
        setPhotoError(
          "The photo list changed. Review the saved photos and try again.",
        );
        return;
      }
      const images = savedPhotoList(
        await photoRequest(`/api/admin/vehicles/${id}/images`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(change),
        }),
      );
      applySavedPhotos(images);
      setMessage("Photo changes saved.");
    } catch (reason) {
      await recoverPhotos(
        id,
        reason instanceof Error
          ? reason.message
          : "Unable to save photo changes.",
        change,
      );
    } finally {
      endPhotoOperation();
    }
  }
  async function uploadOne(file: File, vehicleId: string): Promise<void> {
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type))
      throw new Error("Use a JPEG, PNG, or WebP image.");
    const prepared = await resizeImageForUpload(file);
    if (prepared.size > 12 * 1024 * 1024)
      throw new Error("The resized image is still over the 12 MB limit.");
    const form = new FormData();
    form.append("file", prepared);
    const result = await photoRequest(
      `/api/admin/vehicles/${vehicleId}/images`,
      {
        method: "POST",
        body: form,
      },
    );
    if (!result.image) throw new Error("The upload finished without an image.");
  }
  async function uploadFiles(files: File[]) {
    if (!files.length || !beginPhotoOperation()) return;
    const failures: FailedUpload[] = [];
    setPendingPhotoChange(null);
    setError("");
    setUploading(1);
    let target: { vehicleId: string; created: boolean };
    try {
      target = await ensureVehicleForUpload();
    } catch (reason) {
      const detail =
        reason instanceof Error
          ? reason.message
          : "Unable to prepare this listing for photos.";
      setPhotoError(detail);
      setError(detail);
      endPhotoOperation();
      return;
    }
    for (let index = 0; index < files.length; index += 1) {
      try {
        await uploadOne(files[index], target.vehicleId);
      } catch (reason) {
        failures.push({
          file: files[index],
          reason:
            reason instanceof Error ? reason.message : "Image upload failed.",
        });
      } finally {
        setUploading(Math.round(((index + 1) / files.length) * 100));
      }
    }
    setFailedUploads((old) => [...old, ...failures]);
    if (failures.length) {
      setPhotoError(
        `${failures.length} photo${failures.length === 1 ? "" : "s"} could not be confirmed. Check the saved photos before retrying below.`,
      );
    } else {
      setPhotoError("");
      setMessage(
        `${files.length} photo${files.length === 1 ? "" : "s"} uploaded successfully.`,
      );
    }
    try {
      await loadSavedPhotos(target.vehicleId);
    } catch {
      setPhotoSyncRequired(true);
      setPhotoError(
        "Uploads finished, but the photo list could not be confirmed. Reload saved photos before continuing.",
      );
      setMessage("");
    } finally {
      endPhotoOperation();
    }
    if (target.created)
      navigate(`/admin/vehicles/${target.vehicleId}`, { replace: true });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = input.files ? Array.from(input.files) : [];
    input.value = "";
    await uploadFiles(files);
  }
  async function dropFiles(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    await uploadFiles(Array.from(event.dataTransfer.files));
  }
  async function retryUpload(failure: FailedUpload) {
    if (!id || isNew || !beginPhotoOperation()) return;
    setPendingPhotoChange(null);
    setUploading(1);
    try {
      await uploadOne(failure.file, id);
      setFailedUploads((old) => old.filter((item) => item !== failure));
      await loadSavedPhotos(id);
      setError("");
      setMessage("Photo uploaded successfully.");
    } catch (reason) {
      const detail =
        reason instanceof Error ? reason.message : "Image upload failed.";
      await recoverPhotos(
        id,
        `${detail} Check saved photos before retrying the upload.`,
      );
      setFailedUploads((old) =>
        old.map((item) =>
          item === failure ? { ...item, reason: detail } : item,
        ),
      );
    } finally {
      endPhotoOperation();
    }
  }
  async function removeImage(image: VehicleImage) {
    if (!id || photoLock.current || photosDisabled) return;
    if (!window.confirm("Remove this image from the vehicle?")) return;
    if (!beginPhotoOperation()) return;
    setPendingPhotoChange(null);
    try {
      await photoRequest(`/api/admin/images/${image.id}`, { method: "DELETE" });
      await loadSavedPhotos(id);
      setMessage("Photo removed. Saved order and cover updated.");
    } catch (reason) {
      await recoverPhotos(
        id,
        reason instanceof Error ? reason.message : "Unable to remove image.",
      );
    } finally {
      endPhotoOperation();
    }
  }
  async function reorder(index: number, direction: -1 | 1) {
    if (photoLock.current || photosDisabled) return;
    const next = [...photosRef.current];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length || !id) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    await persistPhotoChange({
      order: next.map((item) => item.id),
      coverId: next.find((item) => item.isCover)?.id ?? next[0].id,
    });
  }
  async function setCover(image: VehicleImage) {
    if (photoLock.current || photosDisabled) return;
    await persistPhotoChange({
      order: photosRef.current.map((item) => item.id),
      coverId: image.id,
    });
  }
  async function dropImage(targetIndex: number) {
    if (
      photoLock.current ||
      photosDisabled ||
      dragIndex === null ||
      dragIndex === targetIndex ||
      !id
    )
      return;
    const next = [...photosRef.current];
    const [moved] = next.splice(dragIndex, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    setDragIndex(null);
    await persistPhotoChange({
      order: next.map((item) => item.id),
      coverId: next.find((item) => item.isCover)?.id ?? next[0].id,
    });
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
            disabled={photosDisabled}
            onClick={(event) => save(event, "draft")}
          >
            Save draft
          </button>
          <button
            className="button button--red"
            disabled={photosDisabled}
            onClick={(event) =>
              save(event, state.status === "draft" ? "available" : undefined)
            }
          >
            {saving
              ? "Saving…"
              : state.status === "draft"
                ? "Publish listing"
                : "Save changes"}{" "}
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
      <form className="editor-form" onSubmit={(event) => save(event)}>
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
                list="vehicle-makes"
                value={state.make}
                onChange={(event) => set("make", event.target.value)}
                placeholder="Choose or type a make"
              />
              <datalist id="vehicle-makes">
                {VEHICLE_MAKES.map((make) => (
                  <option key={make} value={make} />
                ))}
              </datalist>
            </Field>
            <Field label="Model">
              <input
                list="vehicle-models"
                value={state.model}
                onChange={(event) => set("model", event.target.value)}
                placeholder={
                  state.make ? "Choose or type a model" : "Choose a make first"
                }
              />
              <datalist id="vehicle-models">
                {modelsForMake(state.make).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
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
          <div className="editor-fields editor-fields--two-equal">
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
          <label
            className="upload-drop"
            aria-disabled={photosDisabled}
            onDragOver={(event) => event.preventDefault()}
            onDrop={dropFiles}
          >
            <Icon name="upload" size={24} />
            <strong>Drop photos here or choose files</strong>
            <span>
              {uploading > 0
                ? `Uploading ${uploading}%…`
                : isNew
                  ? "Your first upload will create a private draft automatically."
                  : "We’ll resize and upload them one at a time."}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              disabled={photosDisabled}
              onChange={upload}
            />
          </label>
          {photoError && (
            <p className="upload-inline-error" role="alert">
              {photoError}
            </p>
          )}
          {photosBusy && (
            <p role="status">
              {uploading
                ? "Uploading and checking saved photos…"
                : "Saving and checking photos…"}
            </p>
          )}
          {photoSyncRequired && (
            <button
              type="button"
              className="button button--ghost"
              disabled={photosBusy || saving || deleting}
              onClick={reloadPhotos}
            >
              Reload saved photos
            </button>
          )}
          {pendingPhotoChange && !photoSyncRequired && (
            <button
              type="button"
              className="button button--ghost"
              disabled={photosDisabled}
              onClick={() => persistPhotoChange(pendingPhotoChange)}
            >
              Retry photo change
            </button>
          )}
          {failedUploads.length > 0 && (
            <div className="upload-retry-list" role="status">
              <strong>
                {failedUploads.length} photo
                {failedUploads.length === 1 ? "" : "s"} need attention
              </strong>
              {failedUploads.map((failure) => (
                <div
                  className="upload-retry-item"
                  key={`${failure.file.name}-${failure.file.lastModified}`}
                >
                  <span>
                    {failure.file.name}: {failure.reason}
                  </span>
                  <button
                    type="button"
                    disabled={photosDisabled}
                    onClick={() => retryUpload(failure)}
                  >
                    Retry <Icon name="arrow" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {state.images.length > 0 && (
            <div className="image-manager" aria-busy={photosBusy}>
              {state.images.map((image, index) => (
                <div
                  className={`image-manager-item ${image.isCover ? "is-cover" : ""}`}
                  key={image.id}
                  draggable={!photosDisabled}
                  onDragStart={() => {
                    if (!photoLock.current && !photosDisabled)
                      setDragIndex(index);
                  }}
                  onDragEnd={() => setDragIndex(null)}
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
                    <small>{image.originalFilename ?? "Uploaded image"}</small>
                  </div>
                  <div className="image-manager-actions">
                    <button
                      type="button"
                      onClick={() => setCover(image)}
                      disabled={photosDisabled || image.isCover}
                    >
                      {image.isCover ? "Cover" : "Set cover"}
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => reorder(index, -1)}
                      disabled={photosDisabled || index === 0}
                      aria-label="Move image up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => reorder(index, 1)}
                      disabled={
                        photosDisabled || index === state.images.length - 1
                      }
                      aria-label="Move image down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      disabled={photosDisabled}
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
        </section>
        <section className="form-section form-section--publish">
          <div className="form-section-heading">
            <span>06</span>
            <div>
              <h2>Publishing</h2>
              <p>Choose where this listing appears.</p>
            </div>
          </div>
          <fieldset className="publishing-statuses">
            <legend>Listing status</legend>
            {PUBLISHING_OPTIONS.map((option) => (
              <label
                className={`publishing-status ${state.status === option.value ? "is-selected" : ""}`}
                key={option.value}
              >
                <input
                  type="radio"
                  name="vehicle-status"
                  value={option.value}
                  checked={state.status === option.value}
                  onChange={() => setPublishingStatus(option.value)}
                />
                <span className="publishing-status-dot" />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                <em>{option.isPublic ? "Public" : "Private"}</em>
              </label>
            ))}
          </fieldset>
          <label
            className={`toggle-row ${state.status !== "available" ? "is-disabled" : ""}`}
          >
            <input
              type="checkbox"
              checked={state.featured}
              disabled={state.status !== "available"}
              onChange={(event) => set("featured", event.target.checked)}
            />
            <span className="toggle" />
            <span>
              <strong>Feature on home page</strong>
              <small>
                {state.status === "available"
                  ? "Place this vehicle in the featured selection."
                  : "Set the listing to Available before featuring it."}
              </small>
            </span>
          </label>
          <div className="publishing-actions">
            <div>
              <span>Selected status</span>
              <strong>
                {
                  PUBLISHING_OPTIONS.find(
                    (option) => option.value === state.status,
                  )?.label
                }
              </strong>
            </div>
            <div>
              <button
                type="button"
                className="button button--dark"
                disabled={photosDisabled}
                onClick={(event) => save(event, "draft")}
              >
                Save as draft
              </button>
              <button
                type="button"
                className="button button--red"
                disabled={photosDisabled}
                onClick={(event) =>
                  save(
                    event,
                    state.status === "draft" ? "available" : undefined,
                  )
                }
              >
                {saving
                  ? "Saving…"
                  : state.status === "draft"
                    ? "Publish listing"
                    : "Save changes"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </div>
        </section>
        {!isNew && (
          <section className="form-section form-section--danger">
            <div>
              <p className="eyebrow">Inventory removal</p>
              <h2>Remove this vehicle</h2>
              <p>
                The listing disappears from the storefront and inventory list.
                Its audit history is retained for recovery and reporting.
              </p>
            </div>
            <button
              type="button"
              className="button button--danger"
              disabled={deleting || saving || photosBusy}
              onClick={removeVehicle}
            >
              <Icon name="trash" size={16} />
              {deleting ? "Removing…" : "Remove vehicle"}
            </button>
          </section>
        )}
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
  function updateNotification(updated: Lead) {
    const merge = (lead: Lead) =>
      lead.id === updated.id
        ? {
            ...lead,
            emailStatus: updated.emailStatus,
            notification: updated.notification,
            details: updated.details,
          }
        : lead;
    setLeads((old) => old.map(merge));
    setSelected((old) => (old ? merge(old) : null));
  }
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
                  <small>
                    {lead.vehicle?.title ??
                      (lead.leadType === "trade_sell"
                        ? "Trade/Sell request"
                        : "General inquiry")}
                  </small>
                  <p>
                    {lead.details.preapproval
                      ? lead.details.preapproval.status === "deleted"
                        ? "Private application removed."
                        : "Private application received. Open to review."
                      : lead.message ||
                        (lead.details.vin
                          ? `VIN ${lead.details.vin}`
                          : "No message provided.")}
                  </p>
                  <small>Email: {notificationLabel(lead.emailStatus)}</small>
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
              <LeadDetail
                key={selected.id}
                lead={selected}
                onSave={saveLead}
                onNotificationUpdate={updateNotification}
              />
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
  onNotificationUpdate,
}: {
  lead: Lead;
  onSave: (lead: Lead) => void;
  onNotificationUpdate: (lead: Lead) => void;
}) {
  const [draft, setDraft] = useState(lead);
  const { status: savedStatus, adminNotes: savedNotes } = lead;
  // Mail polling must not overwrite an administrator's unsaved notes or status.
  useEffect(
    () =>
      setDraft((old) => ({
        ...old,
        status: savedStatus,
        adminNotes: savedNotes,
      })),
    [savedStatus, savedNotes],
  );
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
      {!lead.details.preapproval && (
        <div className="lead-contact-grid">
          <a
            href={
              lead.phone
                ? `tel:${lead.phone.replace(/[^\d+]/g, "")}`
                : undefined
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
      )}
      {lead.leadType === "trade_sell" && (
        <div className="lead-contact-grid lead-trade-details">
          <div>
            <span>VIN / chassis number</span>
            <strong>{lead.details.vin ?? "Not provided"}</strong>
          </div>
          <div>
            <span>Mileage</span>
            <strong>
              {lead.details.mileage !== undefined
                ? `${lead.details.mileage.toLocaleString("en-US")} mi`
                : "Not provided"}
            </strong>
          </div>
          <div>
            <span>WeChat</span>
            <strong>{lead.details.wechat ?? "Not provided"}</strong>
          </div>
        </div>
      )}
      {!lead.details.preapproval && (
        <div className="lead-message">
          <span>Message</span>
          <p>{lead.message || "No message provided."}</p>
        </div>
      )}
      {lead.details.preapproval && (
        <PreapprovalApplicationPanel
          leadId={lead.id}
          metadata={lead.details.preapproval}
          onDeleted={(metadata) => {
            const next = {
              ...lead,
              details: { ...lead.details, preapproval: metadata },
            };
            setDraft((old) => ({ ...old, details: next.details }));
            onNotificationUpdate(next);
          }}
        />
      )}
      {lead.details.financing && (
        <FinancingSummary snapshot={lead.details.financing} />
      )}
      <LeadNotificationPanel lead={lead} onUpdate={onNotificationUpdate} />
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
  const [financingDirty, setFinancingDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [notificationRecipient, setNotificationRecipient] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  usePageMeta("Website settings | YC Auto USA", undefined, true);
  useEffect(() => {
    mutate("/api/admin/settings", "GET")
      .then((result) => {
        setSettings(result.settings ?? demoSettings);
        setNotificationRecipient(result.notificationRecipient ?? null);
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
  const set = (
    key: Exclude<keyof SiteSettings, "financing">,
    value: string | null,
  ) => setSettings((old) => ({ ...old, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      // Saving unrelated business details must not overwrite newer APR settings.
      const { financing, ...businessSettings } = settings;
      const result = await mutate("/api/admin/settings", "PUT", {
        ...businessSettings,
        ...(financingDirty ? { financing } : {}),
      });
      setSettings(result.settings ?? settings);
      setFinancingDirty(false);
      setMessage("Website settings saved.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save settings.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
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
        <button
          className="button button--red"
          form="settings-form"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save changes"} <Icon name="arrow" size={16} />
        </button>
      </div>
      {message && (
        <div className="notice notice--success">
          <Icon name="check" size={17} />
          {message}
        </div>
      )}
      {error && <ErrorBlock message={error} />}
      <form id="settings-form" onSubmit={submit} aria-busy={saving}>
        <fieldset className="editor-form settings-fields" disabled={saving}>
          <FinancingSettings
            value={settings.financing ?? null}
            onChange={(financing) => {
              setSettings((old) => ({ ...old, financing }));
              setFinancingDirty(true);
            }}
          />
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
                  readOnly={!!notificationRecipient}
                  aria-describedby="notification-recipient-help"
                  onChange={(event) =>
                    set("leadNotificationRecipient", event.target.value)
                  }
                  required
                />
                <small id="notification-recipient-help">
                  {notificationRecipient
                    ? "Verified delivery address. Changing it requires updating the mail service recipient and deployment configuration."
                    : "Use the verified recipient configured for the mail service."}
                </small>
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
                  onChange={(event) =>
                    set("logoKey", event.target.value || null)
                  }
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
              <Field label="Hero title — Chinese">
                <input
                  value={settings.heroTitleZh ?? ""}
                  onChange={(event) =>
                    set("heroTitleZh", event.target.value || null)
                  }
                  placeholder="找到你的下一辆车"
                />
              </Field>
              <Field label="Hero subtitle — Chinese">
                <input
                  value={settings.heroSubtitleZh ?? ""}
                  onChange={(event) =>
                    set("heroSubtitleZh", event.target.value || null)
                  }
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
            <Field label="About text — Chinese">
              <textarea
                rows={5}
                value={settings.aboutTextZh ?? ""}
                onChange={(event) =>
                  set("aboutTextZh", event.target.value || null)
                }
              />
            </Field>
            <Field label="Why choose YC Auto">
              <textarea
                rows={4}
                value={settings.whyChooseText}
                onChange={(event) => set("whyChooseText", event.target.value)}
              />
            </Field>
            <Field label="Why choose YC Auto — Chinese">
              <textarea
                rows={4}
                value={settings.whyChooseTextZh ?? ""}
                onChange={(event) =>
                  set("whyChooseTextZh", event.target.value || null)
                }
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
            <Field label="SEO title — Chinese">
              <input
                value={settings.seoTitleZh ?? ""}
                onChange={(event) =>
                  set("seoTitleZh", event.target.value || null)
                }
              />
            </Field>
            <Field label="SEO description — Chinese">
              <textarea
                rows={3}
                value={settings.seoDescriptionZh ?? ""}
                onChange={(event) =>
                  set("seoDescriptionZh", event.target.value || null)
                }
              />
            </Field>
          </section>
        </fieldset>
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
        <Route path="trade-sell" element={<TradeSellPage />} />
        <Route path="about" element={<AboutRedirect />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="privacy" element={<LegalPage kind="privacy" />} />
        <Route path="terms" element={<LegalPage kind="terms" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="zh" element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/:slug" element={<VehicleDetailPage />} />
        <Route path="trade-sell" element={<TradeSellPage />} />
        <Route path="about" element={<AboutRedirect />} />
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
