import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "./ui";
import { StoreBadges } from "./AppPromo";
import { useConfig, useMe, useSignOut, isInternal, type Me } from "../lib/session";
import { IconHeart, IconMenu, IconClose, IconTicket, IconUser, IconBriefcase, IconLock } from "./Icons";

const PUBLIC_NAV = [
  { to: "/perks", label: "Culturosity Perks" },
  { to: "/affinity", label: "Affinity Programs" },
  { to: "/submit-perk", label: "Submit a Perk" },
  { to: "/services", label: "Services" },
];

/** Obvious current-workspace selector. Changing it only navigates; the server decides access. */
export function WorkspaceSwitcher({ me }: { me: Me }) {
  const nav = useNavigate();
  const loc = useLocation();
  const orgs = (me.memberships ?? []).filter((m) => m.org_kind === "client");
  if (!me.user || (!orgs.length && !(me.programs ?? []).length)) return null;
  const current = loc.pathname.startsWith("/app/") ? loc.pathname.split("/")[2] : "culturosity";
  return (
    <label className="workspace-select" title="Current program">
      <span className="sr-only">Current program or workspace</span>
      <IconBriefcase size={16} />
      <select value={current} onChange={(e) => nav(e.target.value === "culturosity" ? "/perks" : `/app/${e.target.value}`)}>
        <option value="culturosity">Culturosity Perks</option>
        {orgs.map((o) => (
          <option key={o.org_slug} value={o.org_slug}>
            {o.org_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function AccountMenu({ me }: { me: Me }) {
  const signOut = useSignOut();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);
  if (!me.user)
    return (
      <Link className="btn btn-primary btn-sm" to="/auth/signin">
        Sign In
      </Link>
    );
  const adminOrgs = (me.memberships ?? []).filter((m) => m.org_kind === "client" && ["owner", "admin", "provider_manager"].includes(m.role));
  return (
    <div style={{ position: "relative" }}>
      <button className="icon-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} aria-label="Account menu">
        <IconUser />
      </button>
      {open ? (
        <div
          role="menu"
          className="panel-dark"
          style={{ position: "absolute", right: 0, top: 52, width: 270, padding: 8, zIndex: 80, boxShadow: "var(--shadow-1)" }}
        >
          <div style={{ padding: "8px 12px 10px" }}>
            <div style={{ fontWeight: 600 }}>{me.user.display_name || "Your account"}</div>
            <div className="muted" style={{ fontSize: ".82rem", overflowWrap: "anywhere" }}>{me.user.email}</div>
          </div>
          <MenuLink to="/account">Account &amp; security</MenuLink>
          <MenuLink to="/saved">Saved perks</MenuLink>
          {adminOrgs.map((o) => (
            <MenuLink key={o.org_slug} to={`/app/${o.org_slug}/manage`}>
              Manage {o.org_name}
            </MenuLink>
          ))}
          {(me.providerAssignments ?? []).length || adminOrgs.length ? <MenuLink to="/provider/verify">Verify a redemption</MenuLink> : null}
          {me.grants?.includes("super_admin") ? <MenuLink to="/app/culturosity/manage">Manage Culturosity catalogue</MenuLink> : null}
          {isInternal(me) ? <MenuLink to="/culturosity/admin">Admin Research &amp; Sales</MenuLink> : null}
          <MenuLink to="/start">Create a company workspace</MenuLink>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 6 }} onClick={signOut}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
function MenuLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link role="menuitem" to={to} className="nav-btn" style={{ display: "flex", width: "100%" }}>
      {children}
    </Link>
  );
}

export function SiteHeader() {
  const { data: me } = useMe();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);
  return (
    <header className="site-header">
      <div className="container bar">
        <Link to="/" className="logo-link" aria-label="Culturosity home">
          <Logo height={38} />
        </Link>
        <nav className="main-nav" aria-label="Main">
          {PUBLIC_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "active" : "")}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          {me?.user ? <span className="hide-sm"><WorkspaceSwitcher me={me} /></span> : null}
          {me ? <AccountMenu me={me} /> : null}
          <button className="icon-btn menu-toggle" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-menu" className="container mobile-menu" aria-label="Mobile">
          {me?.user ? <div style={{ padding: "6px 0 10px" }}><WorkspaceSwitcher me={me} /></div> : null}
          {PUBLIC_NAV.map((n) => (
            <Link key={n.to} to={n.to}>
              {n.label}
            </Link>
          ))}
          <Link to="/demo">Product demo</Link>
          {me && isInternal(me) ? <Link to="/culturosity/admin">Admin Research &amp; Sales</Link> : null}
          {!me?.user ? <Link to="/auth/signin">Sign In</Link> : null}
        </nav>
      ) : null}
    </header>
  );
}

export function DemoBanner() {
  const { data: cfg } = useConfig();
  if (cfg?.mode !== "demo") return null;
  return (
    <div className="demo-banner" role="note">
      Demo environment<span className="long"> — sample organizations, offers and people are fictional.{cfg.integrations?.database === "pglite-local-demo" ? " Data is stored locally on this machine." : ""}</span><span className="short"> · fictional data</span>
    </div>
  );
}

export function BottomNav() {
  const { data: me } = useMe();
  const loc = useLocation();
  const inOrg = loc.pathname.startsWith("/app/") ? loc.pathname.split("/")[2] : null;
  const perksTo = inOrg ? `/app/${inOrg}/perks` : "/perks";
  return (
    <nav className="bottom-nav" aria-label="Quick">
      <NavLink to={perksTo} className={({ isActive }) => (isActive ? "active" : "")}>
        <IconTicket />
        Perks
      </NavLink>
      <NavLink to="/saved" className={({ isActive }) => (isActive ? "active" : "")}>
        <IconHeart />
        Saved
      </NavLink>
      <NavLink to={inOrg ? `/app/${inOrg}/submit-perk` : "/submit-perk"} className={({ isActive }) => (isActive ? "active" : "")}>
        <IconBriefcase />
        Submit
      </NavLink>
      <NavLink to={me?.user ? "/account" : "/auth/signin"} className={({ isActive }) => (isActive ? "active" : "")}>
        {me && isInternal(me) && loc.pathname.startsWith("/culturosity") ? <IconLock /> : <IconUser />}
        Account
      </NavLink>
    </nav>
  );
}

export function SiteFooter() {
  const { data: cfg } = useConfig();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="grid-3">
          <div className="stack">
            <Logo height={44} />
            <p>Better perks. Stronger connections.</p>
            <StoreBadges size="sm" />
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Platform</div>
            <div className="stack" style={{ display: "grid", gap: 8 }}>
              <Link to="/perks">Culturosity Perks</Link>
              <Link to="/affinity">Affinity Programs</Link>
              <Link to="/submit-perk">Submit a Perk</Link>
              <Link to="/demo">Product demo</Link>
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Work with us</div>
            <div style={{ display: "grid", gap: 8 }}>
              <Link to="/services">Culturosity Management Services</Link>
              <Link to="/services#request">Request a Proposal</Link>
              <a href={`mailto:${cfg?.contactEmail ?? "hello@culturosity.io"}`}>{cfg?.contactEmail ?? "hello@culturosity.io"}</a>
            </div>
          </div>
        </div>
        <p style={{ marginTop: 28, fontSize: ".8rem" }}>
          © {new Date().getFullYear()} Culturosity. Offers are provided by participating providers; availability and terms vary by program.
        </p>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <DemoBanner />
      <SiteHeader />
      <main id="main" key={loc.pathname} className="route-fade" tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />
      <BottomNav />
    </>
  );
}
