import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import type { SiteSettings } from "../lib/types";
import { demoSettings } from "../src/demo";
import { getHome } from "../src/api";
import { Icon } from "./Icon";

export function Wordmark({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      to="/"
      className={`wordmark ${inverse ? "wordmark--inverse" : ""}`}
      aria-label="YC Auto USA home"
    >
      <span className="wordmark-mark">YC</span>
      <span className="wordmark-copy">
        AUTO <em>USA</em>
      </span>
    </Link>
  );
}

export function PublicLayout() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SiteSettings>(demoSettings);
  const location = useLocation();
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
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Wordmark inverse />
          <button
            className="icon-button mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
          <nav
            className={`main-nav ${open ? "main-nav--open" : ""}`}
            aria-label="Main navigation"
          >
            <NavLink
              to="/inventory"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Inventory
            </NavLink>
            <NavLink
              to="/about"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Our story
            </NavLink>
            <NavLink
              to="/contact"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Contact
            </NavLink>
            <a
              className="nav-call"
              href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}
            >
              <Icon name="phone" size={16} /> Call us
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
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Wordmark inverse />
          <p className="footer-note">
            A considered way to find your next car in Flushing.
          </p>
        </div>
        <div className="footer-contact">
          <p className="eyebrow">Visit / call</p>
          <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}>
            {settings.phone}
          </a>
          <a href={`mailto:${settings.email}`}>{settings.email}</a>
          <span>{settings.address}</span>
        </div>
        <div className="footer-links">
          <p className="eyebrow">Explore</p>
          <Link to="/inventory">Inventory</Link>
          <Link to="/about">Our story</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} {settings.businessName}
        </span>
        <span>Built for the road ahead.</span>
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
          <Wordmark />
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
