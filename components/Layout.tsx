import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import type { SiteSettings } from "../lib/types";
import { demoSettings } from "../src/demo";
import { getHome } from "../src/api";
import { Icon } from "./Icon";
import { useLocale } from "../src/i18n";

export function Wordmark({ inverse = false }: { inverse?: boolean }) {
  const { path } = useLocale();
  const logo = inverse
    ? { src: "/brand/logo-light.png", width: 838, height: 219 }
    : { src: "/brand/logo-dark.png", width: 1026, height: 210 };
  return (
    <Link
      to={path("/")}
      className={`wordmark ${inverse ? "wordmark--inverse" : ""}`}
      aria-label="YC Auto USA home"
    >
      <img
        className="wordmark-logo"
        src={logo.src}
        alt=""
        width={logo.width}
        height={logo.height}
        decoding="async"
      />
    </Link>
  );
}

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(demoSettings);
  const location = useLocation();
  const { copy, path, switchPath, locale } = useLocale();
  useEffect(() => {
    let alive = true;
    getHome().then((data) => {
      if (alive) setSettings(data.settings);
    });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.documentElement.dataset.route = location.pathname;
  }, [location.pathname]);
  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        {copy.nav.skip}
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Wordmark inverse />
          <button
            className="icon-button mobile-menu"
            aria-label={open ? copy.nav.closeMenu : copy.nav.menu}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
          <nav
            className={`main-nav ${open ? "main-nav--open" : ""}`}
            aria-label={copy.nav.main}
          >
            <NavLink
              to={path("/inventory")}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {copy.nav.inventory}
            </NavLink>
            <NavLink
              to={path("/trade-sell")}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {copy.nav.trade}
            </NavLink>
            <NavLink
              to={path("/about")}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {copy.nav.story}
            </NavLink>
            <NavLink
              to={path("/contact")}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {copy.nav.contact}
            </NavLink>
            <Link
              className="language-switch"
              to={switchPath}
              lang={locale === "zh" ? "en" : "zh-CN"}
              aria-label={locale === "zh" ? "Switch to English" : "切换到中文"}
            >
              {copy.nav.language}
            </Link>
            <a
              className="nav-call"
              href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}
            >
              <Icon name="phone" size={16} /> {copy.nav.call}
            </a>
          </nav>
        </div>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <PublicFooter settings={settings} />
    </div>
  );
}

export function PublicFooter({
  settings = demoSettings,
}: {
  settings?: SiteSettings;
}) {
  const { copy, path } = useLocale();
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Wordmark inverse />
          <p className="footer-note">{copy.nav.footerNote}</p>
        </div>
        <div className="footer-contact">
          <p className="eyebrow">{copy.nav.visitCall}</p>
          <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
            {settings.phone}
          </a>
          <a href={`mailto:${settings.email}`}>{settings.email}</a>
          <span>{settings.address}</span>
        </div>
        <div className="footer-links">
          <p className="eyebrow">{copy.nav.explore}</p>
          <Link to={path("/inventory")}>{copy.nav.inventory}</Link>
          <Link to={path("/trade-sell")}>{copy.nav.trade}</Link>
          <Link to={path("/about")}>{copy.nav.story}</Link>
          <Link to={path("/contact")}>{copy.nav.contact}</Link>
          <Link to={path("/privacy")}>{copy.nav.privacy}</Link>
          <Link to={path("/terms")}>{copy.nav.terms}</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} {settings.businessName}
        </span>
        <span>{copy.nav.roadAhead}</span>
      </div>
    </footer>
  );
}

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const nav = [
    { to: "/admin", label: "Overview", icon: "dashboard" as const, end: true },
    { to: "/admin/vehicles", label: "Inventory", icon: "car" as const },
    { to: "/admin/leads", label: "Leads", icon: "inbox" as const },
    {
      to: "/admin/settings",
      label: "Website settings",
      icon: "settings" as const,
    },
    { to: "/admin/audit", label: "Audit log", icon: "shield" as const },
  ];
  return (
    <div className="admin-shell">
      <a className="skip-link" href="#admin-content">
        Skip to content
      </a>
      <aside className={`admin-sidebar ${open ? "admin-sidebar--open" : ""}`}>
        <div className="admin-brand">
          <Wordmark inverse />
          <span className="admin-label">CONTROL ROOM</span>
        </div>
        <nav className="admin-nav" aria-label="Admin navigation">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "active" : "")}
              onClick={() => setOpen(false)}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar-foot">
          <Link to="/" target="_blank" rel="noreferrer">
            <Icon name="external" size={16} /> View public site
          </Link>
          <span className="access-badge">
            <span /> Access protected
          </span>
        </div>
      </aside>
      {open && (
        <button
          className="admin-overlay"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="admin-main">
        <header className="admin-topbar">
          <button
            className="icon-button admin-menu"
            aria-label="Open admin navigation"
            onClick={() => setOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <div>
            <span className="admin-top-kicker">YC AUTO USA / ADMIN</span>
            <strong>
              {location.pathname === "/admin"
                ? "Overview"
                : (nav.find(
                    (item) =>
                      location.pathname.startsWith(item.to) &&
                      item.to !== "/admin",
                  )?.label ?? "Workspace")}
            </strong>
          </div>
          <Link
            to="/admin/vehicles/new"
            className="button button--red button--small"
          >
            <Icon name="plus" size={16} /> Add vehicle
          </Link>
        </header>
        <div className="admin-content" id="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
