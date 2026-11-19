import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useConfig, useMe, isInternal } from "../lib/session";
import { SERVICE_NEEDS } from "@shared/schemas";
import { CatalogueView, PerkCard, type ListingPerk } from "../components/Catalogue";
import { PerkDetailPage } from "../components/PerkDetail";
import { PerkForm } from "../components/PerkForm";
import { AppPromo } from "../components/AppPromo";
import { DotField, EmptyState, ErrorAlert, Spinner, TextArea, TextField, SelectField, Checkbox, useDocumentTitle } from "../components/ui";
import { IconArrow, IconBriefcase, IconChart, IconLock, IconSparkle, IconStore, IconTicket, IconUsers, IconCheck } from "../components/Icons";

export function HomePage() {
  useDocumentTitle("");
  const { data } = useQuery<{ perks: ListingPerk[] }>({ queryKey: ["public-teaser"], queryFn: () => api.get("/public/perks?sort=new") });
  const featured = (data?.perks ?? []).slice(0, 3);
  return (
    <>
      <section className="hero">
        <DotField density={26} edgeOnly />
        <div className="hero-glow" aria-hidden />
        <div className="container hero-content hero-grid">
          <div>
          <div className="eyebrow">Culturosity</div>
          <h1 style={{ maxWidth: 820 }}>
            Better perks. <span style={{ color: "var(--brand-mint)" }}>Stronger connections.</span>
          </h1>
          <p className="lede">One platform for Culturosity experiences and your company's affinity program.</p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link className="btn btn-primary btn-lg" to="/perks">
              Explore Perks <IconArrow size={18} />
            </Link>
            <Link className="btn btn-lime btn-lg" to="/affinity">
              Manage Your Program
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/demo">
              Book a Demo
            </Link>
          </div>
          </div>
          <AppPromo perks={(data?.perks ?? []).filter((p) => !p.is_demo).concat((data?.perks ?? []).filter((p) => p.is_demo))} />
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="grid-3">
            <div className="feature-card">
              <div className="icon"><IconTicket /></div>
              <h3>Culturosity Perks</h3>
              <p className="muted">Our own curated offers rooted in culture, local experiences, community and life beyond work.</p>
              <Link to="/perks" style={{ marginTop: "auto" }}>Explore Perks →</Link>
            </div>
            <div className="feature-card">
              <div className="icon"><IconBriefcase /></div>
              <h3>Your affinity program</h3>
              <p className="muted">Give your people more to enjoy beyond work. Run a private, branded program with your own offers and members.</p>
              <Link to="/affinity" style={{ marginTop: "auto" }}>Manage Your Program →</Link>
            </div>
            <div className="feature-card">
              <div className="icon"><IconSparkle /></div>
              <h3>Culturosity Management Services</h3>
              <p className="muted">Build your program with Culturosity. Manage it yourself, or let our team take care of it.</p>
              <Link to="/services" style={{ marginTop: "auto" }}>Have Culturosity Manage It →</Link>
            </div>
          </div>
        </div>
      </section>

      {featured.length ? (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="container">
            <div className="spread" style={{ marginBottom: 18 }}>
              <h2 style={{ margin: 0 }}>Recently added</h2>
              <Link to="/perks">See all perks →</Link>
            </div>
            <div className="perk-grid">
              {featured.map((p, i) => <PerkCard key={p.id} perk={p} index={i} href={`/perks/${p.id}`} />)}
            </div>
          </div>
        </section>
      ) : null}

      <section className="section section-light">
        <div className="container grid-2" style={{ alignItems: "center" }}>
          <div>
            <div className="eyebrow">For employers, unions and associations</div>
            <h2>Give your people more to enjoy beyond work.</h2>
            <p className="muted">
              Upload and organize offers from the providers you work with, invite members, and see what is actually being used. Offers appear in your
              catalogue the moment you publish them.
            </p>
            <ul className="checklist">
              <li>Private company catalogue with your branding</li>
              <li>Dedicated Submit a Perk flow with automatic publication</li>
              <li>Member cards with server-verified, single-use redemption codes</li>
              <li>Measured reporting: views, clicks, and verified redemptions</li>
            </ul>
          </div>
          <div className="svc-mini">
            <div className="eyebrow">Three ways to work with us</div>
            <h3>Choose how hands-on Culturosity should be</h3>
            <div className="svc-scale" aria-hidden>
              <span>Your team</span>
              <span className="svc-scale-bar" />
              <span>Culturosity</span>
            </div>
            <div className="svc-mini-list">
              {TIERS.map((t) => (
                <Link key={t.key} className="svc-mini-tier" to={`/services?approach=${t.key}#request`}>
                  <span className="svc-tier-level" aria-label={`Culturosity involvement ${t.level} of 3`}>
                    {[1, 2, 3].map((d) => <i key={d} className={d <= t.level ? "lit" : ""} />)}
                  </span>
                  <span>
                    <strong>{t.name}</strong>
                    <span>{t.tagline}</span>
                  </span>
                  <span className="svc-mini-arrow" aria-hidden>→</span>
                </Link>
              ))}
            </div>
            <Link className="btn btn-primary btn-lg" to="/services#request" style={{ marginTop: 16 }}>
              Request a Proposal <IconArrow size={18} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export function PerksPage() {
  useDocumentTitle("Culturosity Perks");
  const { data: me, isLoading } = useMe();
  const signedIn = Boolean(me?.user);
  const culturosityPrograms = (me?.programs ?? []).filter((p) => p.org_kind === "culturosity");
  const member = culturosityPrograms.length > 0;
  return (
    <div className="container page">
      <div className="spread" style={{ alignItems: "flex-end", marginBottom: 18 }}>
        <div>
          <div className="eyebrow">Culturosity Perks</div>
          <h1 style={{ fontSize: "clamp(1.8rem,3.6vw,2.8rem)" }}>Experiences beyond work</h1>
          <p className="muted" style={{ maxWidth: 640, margin: 0 }}>
            {member ? "Curated offers available through your Culturosity membership." : "A preview of Culturosity's curated offers. Eligible members see full details, codes and their member card."}
          </p>
        </div>
        {me && isInternal(me) ? (
          <Link className="btn btn-ghost" to="/culturosity/admin">
            <IconLock size={18} /> Admin Research &amp; Sales
          </Link>
        ) : null}
      </div>
      {!isLoading && !member ? (
        <div className="alert alert-info" style={{ marginBottom: 18 }}>
          {signedIn ? "Your account is not currently in a Culturosity Perks program. " : ""}
          {signedIn ? (
            <>Company program offers are in your workspace — use the program selector above.</>
          ) : (
            <>
              <Link to="/auth/signin?next=/perks">Sign in</Link> to see full details and redeem.
            </>
          )}
        </div>
      ) : null}
      {isLoading ? (
        <Spinner />
      ) : (
        <CatalogueView
          endpoint={member ? "/catalogue" : "/public/perks"}
          scope={member ? "culturosity" : undefined}
          signedIn={member}
          heading="Culturosity perks"
          detailHref={(p) => `/perks/${p.id}${p.program_id ? `?programId=${p.program_id}` : ""}`}
        />
      )}
    </div>
  );
}

export function PerkRoute() {
  const { perkId = "" } = useParams();
  const [sp] = useSearchParams();
  return <PerkDetailPage perkId={perkId} programId={sp.get("programId") ?? undefined} backTo="/perks" backLabel="All perks" />;
}

export function SavedPage() {
  useDocumentTitle("Saved perks");
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery<{ perks: ListingPerk[] }>({ queryKey: ["favourites"], queryFn: () => api.get("/favourites"), enabled: Boolean(me?.user) });
  if (me && !me.user)
    return (
      <div className="container page">
        <EmptyState title="Sign in to see your saved perks" action={<Link className="btn btn-primary" to="/auth/signin?next=/saved">Sign In</Link>} />
      </div>
    );
  return (
    <div className="container page">
      <h1 style={{ fontSize: "2rem" }}>Saved perks</h1>
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}
      {data && !data.perks.length ? <EmptyState title="Nothing saved yet">Tap the heart on any perk to keep it here.</EmptyState> : null}
      <div className="perk-grid">
        {(data?.perks ?? []).map((p, i) => {
          const prog = me?.programs?.find((x) => x.program_id === p.program_id);
          const href = prog?.org_kind === "culturosity" ? `/perks/${p.id}?programId=${p.program_id}` : `/app/${prog?.org_slug}/perks/${p.id}`;
          return <PerkCard key={`${p.program_id}-${p.id}`} perk={p} index={i} href={href} />;
        })}
      </div>
    </div>
  );
}

export function AffinityPage() {
  useDocumentTitle("Affinity Programs");
  const nav = useNavigate();
  const { data: me } = useMe();
  const orgs = (me?.memberships ?? []).filter((m) => m.org_kind === "client");
  return (
    <>
      <section className="hero" style={{ paddingBottom: 40 }}>
        <DotField density={18} seed={3} />
        <div className="container hero-content">
          <div className="eyebrow">Affinity Program Management</div>
          <h1 style={{ maxWidth: 820 }}>Give your people more to enjoy beyond work.</h1>
          <p className="lede">
            An affinity program connects your employees or members with exclusive benefits, group rates and experiences from outside brands. Culturosity gives each
            organization its own private, branded program — and a team that can run it for you.
          </p>
          <div className="row" style={{ marginTop: 24 }}>
            {orgs.length ? (
              orgs.map((o) => (
                <Link key={o.org_slug} className="btn btn-primary btn-lg" to={`/app/${o.org_slug}`}>
                  Open {o.org_name}
                </Link>
              ))
            ) : (
              <Link className="btn btn-primary btn-lg" to="/services#request">
                Start Your Program
              </Link>
            )}
            <Link className="btn btn-lime btn-lg" to="/services#request">
              Have Culturosity Manage It
            </Link>
            <Link className="btn btn-ghost btn-lg" to="/demo">
              Book a Demo
            </Link>
          </div>
        </div>
      </section>
      <section className="section section-light">
        <div className="container">
          <div className="grid-3">
            {[
              [IconStore, "Your own catalogue", "Upload, organize, schedule and pause offers. Each workspace is fully separate from every other organization."],
              [IconUsers, "Members & eligibility", "Invitations, bulk import, domain enrollment for members, and role management for admins and provider managers."],
              [IconChart, "Measured reporting", "Views, Use Perk clicks and verified redemptions — with definitions. No estimated figures dressed up as facts."],
            ].map(([I, t, d]: any) => (
              <div key={t} className="panel">
                <div style={{ color: "#0a6b51" }}><I /></div>
                <h3 style={{ marginTop: 10 }}>{t}</h3>
                <p className="muted" style={{ margin: 0 }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="svc-tiers-section" aria-labelledby="aff-tiers-h">
        <div className="container">
          <div className="svc-head">
            <div className="svc-num" aria-hidden>
              <IconSparkle />
            </div>
            <div>
              <div className="eyebrow">Three ways to work with us</div>
              <h2 id="aff-tiers-h">Build your program with Culturosity.</h2>
              <p className="svc-sub">Manage it yourself, or let our team take care of it. Tap the approach that suits you to start your proposal with it.</p>
            </div>
          </div>
          <TierCards approach="unsure" onSelect={(k) => nav(`/services?approach=${k}#request`)} actionLabel="Start my proposal with this →" />
          <div className="svc-band-cta">
            <Link className="btn btn-primary btn-lg" to="/services#request">
              Request a Proposal <IconArrow size={18} />
            </Link>
            <span>Pricing is scoped to your organization — no obligation.</span>
          </div>
        </div>
      </section>
    </>
  );
}

const SERVICE_INFO: Record<string, { icon: JSX.Element; blurb: string; ongoing?: boolean }> = {
  "Program strategy and benefits planning": { icon: <IconSparkle />, blurb: "Shape a perks program around your people, your goals and your budget." },
  "Branded portal setup and launch": { icon: <IconBriefcase />, blurb: "Your own branded perks portal and app experience, set up and ready to launch." },
  "Provider discovery and relationship coordination": { icon: <IconStore />, blurb: "We find local businesses and cultural partners and coordinate their offers.", ongoing: true },
  "Perk entry, cataloguing, maintenance and renewals": { icon: <IconTicket />, blurb: "Offers entered, kept current and renewed so nothing goes stale.", ongoing: true },
  "Employee/member onboarding and engagement materials": { icon: <IconUsers />, blurb: "Announcements and guides that get your people using their perks.", ongoing: true },
  "Reporting, ongoing updates and program improvement": { icon: <IconChart />, blurb: "Clear reporting on how perks are used, and steady improvements.", ongoing: true },
};

const TIERS: { key: "self_service" | "launch" | "managed"; name: string; tagline: string; level: number; you: string; us: string; items: string[] }[] = [
  {
    key: "self_service",
    name: "Self-Service",
    tagline: "Your team runs the platform with our tools and guides.",
    level: 1,
    you: "Run the program day to day",
    us: "Provide the platform, tools and guides",
    items: ["Branded program portal", "Submit a Perk and bulk import", "Member invitations and reporting"],
  },
  {
    key: "launch",
    name: "Launch with Culturosity",
    tagline: "We plan, build and launch the program with you, then hand it over.",
    level: 2,
    you: "Take over after launch",
    us: "Plan, build, populate and launch it with you",
    items: ["Program strategy and planning", "Portal setup and offer population", "Launch materials for members"],
  },
  {
    key: "managed",
    name: "Fully Managed by Culturosity",
    tagline: "We run the program day to day and keep it current.",
    level: 3,
    you: "Enjoy the program with your people",
    us: "Run it day to day and keep it current",
    items: ["Provider discovery and coordination", "Perk maintenance and renewals", "Ongoing reporting and improvement"],
  },
];

const APPROACH_NAME: Record<string, string> = { self_service: "Self-Service", launch: "Launch with Culturosity", managed: "Fully Managed by Culturosity", unsure: "Not sure yet" };

/** The three approaches on a "your team leads → Culturosity leads" scale. Shared by Services and Affinity. */
function TierCards({
  approach,
  suggested,
  onSelect,
  actionLabel = "Tap to choose",
}: {
  approach: string;
  suggested?: string | null;
  onSelect: (key: string) => void;
  actionLabel?: string;
}) {
  return (
    <>
      <div className="svc-scale" aria-hidden>
        <span>Your team leads</span>
        <span className="svc-scale-bar" />
        <span>Culturosity leads</span>
      </div>
      <div className="svc-tiers" role="radiogroup" aria-label="Preferred approach">
        {TIERS.map((t) => {
          const on = approach === t.key;
          return (
            <div
              key={t.key}
              role="radio"
              aria-checked={on}
              tabIndex={0}
              className={`svc-tier lvl-${t.level} ${on ? "on" : ""}`}
              onClick={() => onSelect(t.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(t.key);
                }
              }}
            >
              {suggested === t.key ? <span className="svc-suggest">Suggested for what you picked</span> : null}
              <div className="svc-tier-level" aria-label={`Culturosity involvement ${t.level} of 3`}>
                {[1, 2, 3].map((d) => <i key={d} className={d <= t.level ? "lit" : ""} />)}
              </div>
              <h3>{t.name}</h3>
              <p className="svc-tagline">{t.tagline}</p>
              <div className="svc-who">
                <div><small>Your team</small>{t.you}</div>
                <div><small>Culturosity</small>{t.us}</div>
              </div>
              <ul className="checklist">
                {t.items.map((x) => <li key={x}>{x}</li>)}
              </ul>
              <div className="svc-tier-state" aria-hidden>{on ? "✓ Your preference" : actionLabel}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ServicesPage() {
  useDocumentTitle("Culturosity Management Services");
  const { data: cfg } = useConfig();
  const [sp] = useSearchParams();
  const [needs, setNeeds] = useState<string[]>([]);
  const [approach, setApproach] = useState<string>(() => (["self_service", "launch", "managed"].includes(sp.get("approach") ?? "") ? sp.get("approach")! : "unsure"));
  // Arriving with #request (e.g. from the Affinity page): bring the form into view.
  useEffect(() => {
    if (window.location.hash === "#request") setTimeout(() => document.getElementById("request")?.scrollIntoView({ block: "start" }), 120);
  }, []);
  const [formInView, setFormInView] = useState(false);
  const [pastHero, setPastHero] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => es.forEach((e) => (e.target === formRef.current ? setFormInView(e.isIntersecting) : e.isIntersecting && setPastHero(true))), { threshold: 0.15 });
    if (formRef.current) io.observe(formRef.current);
    if (stepsRef.current) io.observe(stepsRef.current);
    return () => io.disconnect();
  }, []);
  const toggle = (n: string) => setNeeds((x) => (x.includes(n) ? x.filter((y) => y !== n) : [...x, n]));
  // A gentle suggestion from what they picked: lots of ongoing work → Fully Managed; otherwise Launch.
  const ongoing = needs.filter((n) => SERVICE_INFO[n]?.ongoing).length;
  const suggested = !needs.length ? null : ongoing >= 2 ? "managed" : "launch";
  const goToForm = () => document.getElementById("request")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const showBar = (pastHero || needs.length > 0 || approach !== "unsure") && !formInView;

  return (
    <>
      <section className="hero" style={{ paddingBottom: 48 }}>
        <DotField density={16} seed={11} />
        <div className="container hero-content">
          <div className="eyebrow">Services</div>
          <h1>Culturosity Management Services</h1>
          <p className="lede">Build your program with Culturosity. Manage it yourself, or let our team take care of it.</p>
          <div className="row" style={{ marginTop: 20 }}>
            <a className="btn btn-primary btn-lg" href="#request">
              Request a Proposal <IconArrow size={18} />
            </a>
            {cfg?.demoBookingUrl ? (
              <a className="btn btn-ghost btn-lg" href={cfg.demoBookingUrl} target="_blank" rel="noopener noreferrer">
                Book a Demo
              </a>
            ) : null}
          </div>
          <ol className="svc-steps" aria-label="How it works">
            <li className={needs.length ? "done" : ""}><span>1</span> Pick what you need</li>
            <li className={approach !== "unsure" ? "done" : ""}><span>2</span> Choose how hands-on we are</li>
            <li><span>3</span> Request your proposal</li>
          </ol>
        </div>
      </section>

      {/* Step 1 — services */}
      <section className="section section-light svc-step" ref={stepsRef} aria-labelledby="svc-needs-h">
        <div className="container">
          <div className="svc-head">
            <div className="svc-num">1</div>
            <div>
              <div className="eyebrow">Step 1</div>
              <h2 id="svc-needs-h">What would you like help with?</h2>
              <p className="muted">Tap everything that applies — we'll add it to your proposal request.</p>
            </div>
          </div>
          <div className="svc-needs" role="group" aria-label="Services you need">
            {SERVICE_NEEDS.map((n, i) => {
              const on = needs.includes(n);
              return (
                <button key={n} type="button" className={`svc-need ${on ? "on" : ""}`} aria-pressed={on} onClick={() => toggle(n)} style={{ animationDelay: `${i * 60}ms` }}>
                  <span className="svc-need-icon" aria-hidden>{SERVICE_INFO[n]?.icon}</span>
                  <span className="svc-need-text">
                    <strong>{n}</strong>
                    <span>{SERVICE_INFO[n]?.blurb}</span>
                  </span>
                  <span className="svc-need-check" aria-hidden><IconCheck size={16} /></span>
                </button>
              );
            })}
          </div>
          <div className="svc-under">
            {needs.length ? (
              <span><strong>{needs.length}</strong> selected — next, choose how hands-on you'd like us to be.</span>
            ) : (
              <span className="muted">Not sure yet? Skip ahead — we'll help you decide.</span>
            )}
          </div>
        </div>
      </section>

      {/* Step 2 — approaches (explanation, no buttons) */}
      <section className="svc-tiers-section" aria-labelledby="svc-tiers-h">
        <div className="container">
          <div className="svc-head">
            <div className="svc-num">2</div>
            <div>
              <div className="eyebrow">Step 2 · Three ways to work with us</div>
              <h2 id="svc-tiers-h">How hands-on should Culturosity be?</h2>
              <p className="svc-sub">From your team running everything, to us running it for you. Pricing depends on your organization and the support you need — your proposal is scoped to you.</p>
            </div>
          </div>
          <TierCards approach={approach} suggested={suggested} onSelect={(k) => setApproach(approach === k ? "unsure" : k)} />
        </div>
      </section>

      {/* Step 3 — the form */}
      <section className="section section-light" aria-labelledby="svc-form-h">
        <div className="container">
          <div className="svc-head">
            <div className="svc-num">3</div>
            <div>
              <div className="eyebrow">Step 3</div>
              <h2 id="svc-form-h">Request your proposal</h2>
              <p className="muted">Tell us a little about your organization. We'll come back with a proposal scoped to you — no obligation.</p>
            </div>
          </div>
          <div className="svc-form-layout">
            <aside className="svc-summary" aria-label="Your selections">
              <div className="eyebrow">Your selections</div>
              <div className="svc-summary-block">
                <small>Services</small>
                {needs.length ? (
                  <ul>{needs.map((n) => <li key={n}>{n}</li>)}</ul>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>None yet — pick them in step 1 or below.</p>
                )}
              </div>
              <div className="svc-summary-block">
                <small>Approach</small>
                <p style={{ margin: 0 }}><strong>{APPROACH_NAME[approach]}</strong></p>
              </div>
              <p className="muted" style={{ fontSize: ".85rem", margin: 0 }}>You can change these in the form too.</p>
            </aside>
            <div id="request" ref={formRef} style={{ scrollMarginTop: 90 }}>
              <ServiceRequestForm needs={needs} onNeedsChange={setNeeds} approach={approach} onApproachChange={setApproach} />
            </div>
          </div>
        </div>
      </section>

      <div className={`svc-bar ${showBar ? "show" : ""}`} aria-hidden={!showBar}>
        <div className="svc-bar-inner">
          <span className="svc-bar-text">
            {needs.length || approach !== "unsure" ? (
              <>
                {needs.length ? <><strong>{needs.length}</strong> service{needs.length === 1 ? "" : "s"}</> : null}
                {needs.length && approach !== "unsure" ? " · " : ""}
                {approach !== "unsure" ? APPROACH_NAME[approach] : ""}
              </>
            ) : (
              "Ready when you are"
            )}
          </span>
          <button type="button" className="btn btn-primary" onClick={goToForm} tabIndex={showBar ? 0 : -1}>
            Request a Proposal <IconArrow size={16} />
          </button>
        </div>
      </div>
    </>
  );
}

export function ServiceRequestForm({
  orgSlug,
  compact,
  needs,
  onNeedsChange,
  approach,
  onApproachChange,
}: {
  orgSlug?: string;
  compact?: boolean;
  /** Optional: services and approach controlled by the page (the Services page pre-fills them). */
  needs?: string[];
  onNeedsChange?: (v: string[]) => void;
  approach?: string;
  onApproachChange?: (v: string) => void;
}) {
  const { data: me } = useMe();
  const { data: cfg } = useConfig();
  const [local, setLocal] = useState({
    organizationName: "",
    contactName: me?.user?.display_name ?? "",
    contactEmail: me?.user?.email ?? "",
    approxMemberCount: "",
    serviceNeeds: [] as string[],
    approach: "managed",
    coverage: "",
    targetLaunch: "",
    message: "",
    website: "",
  });
  // Services and approach can be controlled from outside; everything else is local.
  const f = { ...local, serviceNeeds: needs ?? local.serviceNeeds, approach: approach ?? local.approach };
  const setF = (next: typeof f) => {
    setLocal(next);
    if (onNeedsChange && next.serviceNeeds !== f.serviceNeeds) onNeedsChange(next.serviceNeeds);
    if (onApproachChange && next.approach !== f.approach) onApproachChange(next.approach);
  };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post("/service-requests", { ...f, approxMemberCount: f.approxMemberCount || undefined, orgSlug });
      setDone(true);
    } catch (x) {
      setErr(x);
      setErrors((x as ApiError).fields ?? {});
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="panel" role="status">
        <h2>Thank you — we’ve received your request.</h2>
        <p className="muted">
          A member of the Culturosity team will be in touch soon.{" "}
          {cfg?.integrations?.email === "resend" ? <>We’ve also sent a confirmation to <strong>{f.contactEmail}</strong>.</> : null}
        </p>
      </div>
    );
  return (
    <form className="panel" onSubmit={submit} noValidate>
      <h2>{compact ? "Request Culturosity Management Services" : "Request a Proposal"}</h2>
      {err ? <ErrorAlert error={err} title="Not sent." /> : null}
      <div className="grid-2" style={{ marginTop: 12 }}>
        <TextField label="Organization" required value={f.organizationName} error={errors.organizationName} onChange={(e) => setF({ ...f, organizationName: e.target.value })} />
        <TextField label="Approximate members / employees" type="number" min={1} value={f.approxMemberCount} error={errors.approxMemberCount} onChange={(e) => setF({ ...f, approxMemberCount: e.target.value })} />
        <TextField label="Contact name" required value={f.contactName} error={errors.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
        <TextField label="Business email" required type="email" value={f.contactEmail} error={errors.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />
        <TextField label="Location / coverage" value={f.coverage} onChange={(e) => setF({ ...f, coverage: e.target.value })} placeholder="e.g. Ontario and Quebec" />
        <TextField label="Target launch" value={f.targetLaunch} onChange={(e) => setF({ ...f, targetLaunch: e.target.value })} placeholder="e.g. Spring 2027" />
      </div>
      <SelectField label="Preferred approach" value={f.approach} onChange={(e) => setF({ ...f, approach: e.target.value })}>
        <option value="self_service">Self-Service</option>
        <option value="launch">Launch with Culturosity</option>
        <option value="managed">Fully Managed by Culturosity</option>
        <option value="unsure">Not sure yet</option>
      </SelectField>
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
        <legend style={{ fontWeight: 600 }}>Services you need</legend>
        {SERVICE_NEEDS.map((s) => (
          <Checkbox key={s} label={s} checked={f.serviceNeeds.includes(s)} onChange={(v) => setF({ ...f, serviceNeeds: v ? [...f.serviceNeeds, s] : f.serviceNeeds.filter((x) => x !== s) })} />
        ))}
        {errors.serviceNeeds ? <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: ".85rem" }}>{errors.serviceNeeds}</div> : null}
      </fieldset>
      <TextArea label="Message" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} rows={4} />
      <div aria-hidden style={{ position: "absolute", left: -9999 }}>
        <label>
          Website <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} />
        </label>
      </div>
      <button className="btn btn-primary btn-lg" disabled={busy}>
        {busy ? "Sending…" : "Request a Proposal"}
      </button>
    </form>
  );
}

export function SubmitPerkPage() {
  useDocumentTitle("Submit a Perk");
  return (
    <div className="page page-light surface-light">
      <div className="container" style={{ maxWidth: 980 }}>
        <div className="eyebrow">Submit a Perk</div>
        <h1 style={{ fontSize: "clamp(1.8rem,3.6vw,2.6rem)" }}>Share an offer with members</h1>
        <p className="muted" style={{ maxWidth: 720 }}>
          Providers and company program admins can add offers here. Authorised publishers go live immediately; other submissions are reviewed and then published
          automatically.
        </p>
        <PerkForm />
      </div>
    </div>
  );
}

export function DemoPage() {
  useDocumentTitle("Product demo");
  const { data: cfg } = useConfig();
  const nav = useNavigate();
  const [err, setErr] = useState<unknown>(null);
  async function enter(persona: string, to: string) {
    setErr(null);
    try {
      await api.post("/demo/session", { persona });
      window.location.assign(to);
    } catch (e) {
      setErr(e);
    }
  }
  return (
    <div className="container page">
      <div className="eyebrow">Demo</div>
      <h1>See Culturosity in action</h1>
      <p className="muted" style={{ maxWidth: 680 }}>
        The demonstration uses isolated, fictional organizations, providers and members. Demo offers are labelled <span className="badge badge-demo">Demo</span> and
        never grant access to a real merchant benefit.
      </p>
      <div className="row" style={{ margin: "16px 0 28px" }}>
        {cfg?.demoBookingUrl ? (
          <a className="btn btn-primary btn-lg" href={cfg.demoBookingUrl} target="_blank" rel="noopener noreferrer">
            Book a Demo with our team
          </a>
        ) : null}
        <button className="btn btn-ghost btn-lg" onClick={() => nav("/services#request")}>
          Request a Proposal
        </button>
      </div>
      {cfg?.mode === "demo" ? (
        <>
          <h2>Explore the demo workspace</h2>
          {err ? <ErrorAlert error={err} /> : null}
          <div className="grid-3" style={{ marginTop: 12 }}>
            <div className="feature-card">
              <h3>As a member</h3>
              <p className="muted">Browse Culturosity Perks and the Northwind company program, save favourites and open your member card.</p>
              <button className="btn btn-primary" onClick={() => enter("member", "/perks")}>Enter as member</button>
            </div>
            <div className="feature-card">
              <h3>As a company admin</h3>
              <p className="muted">Manage Northwind's program: publish an offer, invite members and read measured reporting.</p>
              <button className="btn btn-primary" onClick={() => enter("company_admin", "/app/northwind-demo/manage")}>Enter as admin</button>
            </div>
            <div className="feature-card">
              <h3>As a provider</h3>
              <p className="muted">Verify a member's redemption code by camera scan or manual entry.</p>
              <button className="btn btn-primary" onClick={() => enter("provider", "/provider/verify")}>Enter as provider</button>
            </div>
          </div>
        </>
      ) : (
        <div className="alert alert-info">The interactive demo workspace is available in demo deployments. Book a demo and our team will walk you through it.</div>
      )}
    </div>
  );
}

export function NotFoundPage() {
  useDocumentTitle("Not found");
  return (
    <div className="container page">
      <EmptyState title="We couldn't find that page" action={<Link className="btn btn-primary" to="/">Go home</Link>}>
        The link may be out of date, or you may need to sign in with an account that has access.
      </EmptyState>
    </div>
  );
}
