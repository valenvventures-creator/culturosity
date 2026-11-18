import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useConfig, useMe, isInternal } from "../lib/session";
import { SERVICE_NEEDS } from "@shared/schemas";
import { CatalogueView, PerkCard, type ListingPerk } from "../components/Catalogue";
import { PerkDetailPage } from "../components/PerkDetail";
import { PerkForm } from "../components/PerkForm";
import { DotField, EmptyState, ErrorAlert, Spinner, TextArea, TextField, SelectField, Checkbox, useDocumentTitle } from "../components/ui";
import { IconArrow, IconBriefcase, IconChart, IconLock, IconSparkle, IconStore, IconTicket, IconUsers, IconCheck } from "../components/Icons";

export function HomePage() {
  useDocumentTitle("");
  const { data } = useQuery<{ perks: ListingPerk[] }>({ queryKey: ["public-teaser"], queryFn: () => api.get("/public/perks?sort=new") });
  const featured = (data?.perks ?? []).slice(0, 3);
  return (
    <>
      <section className="hero">
        <DotField density={26} />
        <div className="hero-glow" aria-hidden />
        <div className="container hero-content">
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
          <div className="panel">
            <h3>Choose how you work with us</h3>
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {[
                ["Self-Service", "Run the platform yourself."],
                ["Launch with Culturosity", "We set up, populate and launch with you."],
                ["Fully Managed by Culturosity", "We run the program and keep it current."],
              ].map(([t, d]) => (
                <div key={t} className="row" style={{ alignItems: "flex-start", gap: 12 }}>
                  <span style={{ color: "#0a6b51", marginTop: 2 }}><IconCheck /></span>
                  <div>
                    <strong>{t}</strong>
                    <div className="muted">{d}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 18 }}>
              <Link className="btn btn-dark" to="/services#request">Request a Proposal</Link>
              <Link className="btn btn-ghost" to="/start">Start self-service</Link>
            </div>
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
              <Link className="btn btn-primary btn-lg" to={me?.user ? "/start" : "/auth/signin?next=/start"}>
                Manage Your Program
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
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Build your program with Culturosity.</h2>
            <p className="muted">Manage it yourself, or let our team take care of it.</p>
            <ApproachCards />
          </div>
        </div>
      </section>
    </>
  );
}

function ApproachCards() {
  return (
    <div className="grid-3" style={{ marginTop: 16 }}>
      {[
        ["Self-Service", "Your team runs the platform with our tools and guides.", ["Branded program portal", "Submit a Perk and bulk import", "Member invitations and reporting"], "/start", "Start self-service"],
        ["Launch with Culturosity", "We plan, build and launch the program with you, then hand it over.", ["Program strategy and planning", "Portal setup and offer population", "Launch materials for members"], "/services#request", "Request a Proposal"],
        ["Fully Managed by Culturosity", "We run the program day to day and keep it current.", ["Provider discovery and coordination", "Perk maintenance and renewals", "Ongoing reporting and improvement"], "/services#request", "Request a Proposal"],
      ].map(([t, d, items, to, cta], i) => (
        <div key={t as string} className={`approach-card ${i === 2 ? "featured" : ""}`}>
          <h3>{t as string}</h3>
          <p className="muted" style={{ margin: 0 }}>{d as string}</p>
          <ul className="checklist" style={{ margin: "8px 0 12px" }}>
            {(items as string[]).map((x) => <li key={x}>{x}</li>)}
          </ul>
          <Link className={`btn ${i === 2 ? "btn-dark" : "btn-ghost"}`} style={{ marginTop: "auto" }} to={to as string}>
            {cta as string}
          </Link>
        </div>
      ))}
    </div>
  );
}

export function ServicesPage() {
  useDocumentTitle("Culturosity Management Services");
  const { data: cfg } = useConfig();
  return (
    <>
      <section className="hero" style={{ paddingBottom: 40 }}>
        <DotField density={16} seed={11} />
        <div className="container hero-content">
          <div className="eyebrow">Services</div>
          <h1>Culturosity Management Services</h1>
          <p className="lede">Build your program with Culturosity. Manage it yourself, or let our team take care of it.</p>
          <div className="row" style={{ marginTop: 20 }}>
            <a className="btn btn-primary btn-lg" href="#request">Request a Proposal</a>
            {cfg?.demoBookingUrl ? (
              <a className="btn btn-ghost btn-lg" href={cfg.demoBookingUrl} target="_blank" rel="noopener noreferrer">
                Book a Demo
              </a>
            ) : null}
          </div>
        </div>
      </section>
      <section className="section section-light">
        <div className="container">
          <div className="grid-3">
            {SERVICE_NEEDS.map((s) => (
              <div key={s} className="panel">
                <div style={{ color: "#0a6b51" }}><IconCheck /></div>
                <h3 style={{ marginTop: 8, fontSize: "1.05rem" }}>{s}</h3>
              </div>
            ))}
          </div>
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Service approaches</h2>
            <p className="muted">Pricing depends on your organization, coverage and the support you need — request a proposal and we will scope it with you.</p>
            <ApproachCards />
          </div>
          <div id="request" style={{ marginTop: 24, scrollMarginTop: 90 }}>
            <ServiceRequestForm />
          </div>
        </div>
      </section>
    </>
  );
}

export function ServiceRequestForm({ orgSlug, compact }: { orgSlug?: string; compact?: boolean }) {
  const { data: me } = useMe();
  const [f, setF] = useState({
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
        <h2>Thank you — your request is saved.</h2>
        <p className="muted">The Culturosity team will follow up by email. Your request is recorded in our service queue whether or not email notifications are configured.</p>
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
