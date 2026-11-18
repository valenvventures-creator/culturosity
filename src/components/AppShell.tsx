import { useEffect, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { DemoBanner, SiteHeader, BottomNav } from "./Layout";

export interface NavSection {
  title: string;
  items: { to: string; label: string; end?: boolean }[];
}

/** Dashboard layout: collapsible desktop sidebar, scrollable pill nav on mobile. */
export function AppShell({ sections, header }: { sections: NavSection[]; header?: ReactNode }) {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  const flat = sections.flatMap((s) => s.items);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <DemoBanner />
      <SiteHeader />
      <div className="shell">
        <aside className="sidebar" aria-label="Section navigation">
          {header}
          {sections.map((s) => (
            <details key={s.title} open>
              <summary>{s.title}</summary>
              {s.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? "active" : "")}>
                  {i.label}
                </NavLink>
              ))}
            </details>
          ))}
        </aside>
        <div className="shell-main">
          <nav className="shell-mobile-nav" aria-label="Section navigation">
            {flat.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? "active" : "")}>
                {i.label}
              </NavLink>
            ))}
          </nav>
          <main id="main" tabIndex={-1} key={loc.pathname} className="route-fade surface-light">
            <Outlet />
          </main>
        </div>
      </div>
      <BottomNav />
    </>
  );
}

export function PageHeader({ title, eyebrow, children, back }: { title: ReactNode; eyebrow?: ReactNode; children?: ReactNode; back?: { to: string; label: string } }) {
  return (
    <div className="spread" style={{ marginBottom: 20, alignItems: "flex-end" }}>
      <div>
        {back ? (
          <Link to={back.to} className="muted" style={{ fontSize: ".88rem", textDecoration: "none" }}>
            ← {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1 style={{ fontSize: "clamp(1.6rem, 3vw, 2.2rem)", margin: "4px 0 0" }}>{title}</h1>
      </div>
      {children ? <div className="row">{children}</div> : null}
    </div>
  );
}
