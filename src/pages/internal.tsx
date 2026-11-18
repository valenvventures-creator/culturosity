import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, qs } from "../lib/api";
import { useMe, isInternal } from "../lib/session";
import { AppShell, PageHeader } from "../components/AppShell";
import { Checkbox, Drawer, EmptyState, ErrorAlert, SelectField, Spinner, Stat, TextArea, TextField, useDocumentTitle, useToast, DotField, Logo } from "../components/ui";
import { IconExternal, IconLock } from "../components/Icons";
import { ColourField, DEFAULT_BRAND, DevicePreview, PRESETS, Swatches, coloursFromLogo, readLogo, type BrandState } from "../components/BrandPreview";
import { BottomNav, DemoBanner, SiteHeader } from "../components/Layout";
import {
  OUTREACH_CHANNELS,
  OUTREACH_OBJECTIVES,
  PIPELINE_LABELS,
  PIPELINE_STAGES,
  PROSPECT_TYPES,
  PROSPECT_TYPE_LABELS,
} from "@shared/schemas";

const B = "/culturosity/admin";

function useGate() {
  return useQuery<any>({ queryKey: ["gate"], queryFn: () => api.get("/internal/gate"), retry: false, refetchInterval: 60_000 });
}

/** Internal shell: only for internal grants, and only after the numerical unlock. */
export function InternalLayout() {
  const { data: me, isLoading } = useMe();
  const gate = useGate();
  const qc = useQueryClient();
  if (isLoading || gate.isLoading) return <div className="container page"><Spinner /></div>;
  if (!me?.user) return <Navigate to={`/auth/signin?next=${B}`} replace />;
  if (!isInternal(me) || gate.error) return <Navigate to="/perks" replace />;
  if (!gate.data?.unlocked)
    return (
      <>
        <DemoBanner />
        <SiteHeader />
        <main id="main" className="theme-area">
          <GatePage onUnlocked={() => { qc.invalidateQueries({ queryKey: ["gate"] }); qc.invalidateQueries({ queryKey: ["me"] }); }} configured={gate.data?.configured} />
        </main>
        <BottomNav />
      </>
    );
  return (
    <AppShell
      sections={[
        { title: "Internal", items: [{ to: `${B}/overview`, label: "Overview" }, { to: `${B}/research`, label: "Research Directory" }, { to: `${B}/outreach`, label: "Sales Outreach" }, { to: `${B}/pipeline`, label: "Pipeline" }, { to: `${B}/demo-guide`, label: "Demo Guide" }, { to: `${B}/preview`, label: "Preview" }, { to: `${B}/tutorial`, label: "Tutorial" }] },
        // Salespeople see research and sales only; the rest is for super admins.
        me.grants?.includes("super_admin")
          ? { title: "Operations", items: [{ to: `${B}/services`, label: "Service queue" }, { to: `${B}/workspaces`, label: "Client workspaces" }, { to: `/app/culturosity/manage`, label: "Culturosity catalogue" }, { to: `${B}/team`, label: "Sales team" }, { to: `${B}/settings`, label: "Access settings" }] }
          : { title: "Operations", items: [{ to: `${B}/services`, label: "Service queue" }] },
      ]}
      header={<LockBar expiresAt={gate.data.expiresAt} idle={gate.data.idleMinutes} />}
    />
  );
}

function LockBar({ expiresAt, idle }: { expiresAt: string; idle: number }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  return (
    <div style={{ padding: "0 12px 16px" }}>
      <div className="eyebrow">Admin Research &amp; Sales</div>
      <div className="muted" style={{ fontSize: ".8rem" }}>
        Unlocked · locks after {idle} min idle or at {new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
      </div>
      <button
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 10 }}
        onClick={async () => {
          await api.post("/internal/gate/lock");
          qc.removeQueries({ queryKey: ["internal"] });
          await qc.invalidateQueries({ queryKey: ["gate"] });
          nav(B);
        }}
      >
        <IconLock size={16} /> Lock Portal
      </button>
    </div>
  );
}

export function GatePage({ onUnlocked, configured }: { onUnlocked: () => void; configured: boolean }) {
  useDocumentTitle("Admin Research & Sales");
  const [digits, setDigits] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const press = (d: string) => setDigits((x) => (x.length < 20 ? x + d : x));
  async function submit() {
    if (!digits) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post("/internal/gate/unlock", { code: digits });
      setDigits("");
      onUnlocked();
      nav(`${B}/overview`);
    } catch (e) {
      setErr((e as ApiError).message);
      setShake(true);
      setTimeout(() => setShake(false), 400);
      setDigits("");
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }
  return (
    <div style={{ position: "relative", minHeight: "70vh" }}>
      <DotField density={14} seed={5} edgeOnly />
      <div className="container page" style={{ position: "relative" }}>
        <div className="keypad-wrap">
          <Logo height={56} className="logo-on-page" />
          <h1 style={{ fontSize: "1.6rem", marginTop: 16 }}>Admin Research &amp; Sales</h1>
          <p className="muted">Enter the numerical access code to unlock this session.</p>
          {!configured ? <div className="alert alert-warning">The access code has not been initialised on the server. See README → Numerical gate.</div> : null}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="gate-code" className="sr-only">Access code (digits only)</label>
            <input
              id="gate-code"
              ref={inputRef}
              className="input dark-input"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]*"
              value={digits}
              onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 20))}
              style={{ textAlign: "center", letterSpacing: ".4em", fontSize: "1.3rem" }}
              aria-describedby={err ? "gate-err" : undefined}
              autoFocus
            />
            <div className={`keypad-dots ${shake ? "shake" : ""}`} aria-hidden>
              {Array.from({ length: Math.max(10, digits.length) }).map((_, i) => <span key={i} className={i < digits.length ? "on" : ""} />)}
            </div>
            <div aria-live="assertive" id="gate-err" style={{ minHeight: 24, color: "#ff9aa2", fontWeight: 600 }}>{err}</div>
            <div className="keypad" role="group" aria-label="Numeric keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button type="button" key={d} onClick={() => press(d)} aria-label={`Digit ${d}`}>{d}</button>
              ))}
              <button type="button" className="aux" onClick={() => setDigits("")}>Clear</button>
              <button type="button" onClick={() => press("0")} aria-label="Digit 0">0</button>
              <button type="button" className="aux" onClick={() => setDigits((x) => x.slice(0, -1))} aria-label="Backspace">⌫</button>
            </div>
            <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 16 }} disabled={busy || !digits}>
              {busy ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="container page">{children}</div>;
}

// ======================= Overview =======================
export function InternalOverview() {
  useDocumentTitle("Internal overview");
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["internal", "overview"], queryFn: () => api.get("/internal/overview") });
  if (isLoading) return <Wrap><Spinner /></Wrap>;
  if (error) return <Wrap><ErrorAlert error={error} /></Wrap>;
  const stage = (s: string) => data.pipeline.find((p: any) => p.stage === s)?.n ?? 0;
  return (
    <Wrap>
      <PageHeader title="Overview" eyebrow="Admin Research & Sales" />
      <div className="stats">
        <Stat label="Research records" value={data.research.n} hint={`${data.research.verified} with reviewed sources`} />
        <Stat label="Last research date" value={data.research.last_checked ? new Date(data.research.last_checked).toLocaleDateString() : "—"} />
        <Stat label="Qualified" value={stage("qualified")} />
        <Stat label="Contacted" value={stage("contacted")} />
        <Stat label="Demo booked" value={stage("demo_booked")} />
        <Stat label="Open service requests" value={data.services.filter((s: any) => !["won", "closed"].includes(s.status)).reduce((a: number, s: any) => a + s.n, 0)} />
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        {[
          [`${B}/research`, "Research Directory", "Canada & USA affinity, employee-discount and member-benefit programs, with sources."],
          [`${B}/outreach`, "Sales Outreach", "Drafts for email, text, phone and demos — grounded in stored sources. Nothing is sent automatically."],
          [`${B}/pipeline`, "Pipeline", "Stages from Researching to Won, with owners, next actions and logged activity."],
          [`${B}/demo-guide`, "Demo Guide", "A step-by-step sales demo using the live site's real pages."],
        ].map(([to, t, d]) => (
          <Link key={to} to={to} className="panel" style={{ textDecoration: "none", color: "inherit" }}>
            <h2 style={{ fontSize: "1.15rem" }}>{t} →</h2>
            <p className="muted" style={{ margin: 0 }}>{d}</p>
          </Link>
        ))}
      </div>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: "1.1rem" }}>Recent activity</h2>
        {data.recentActivity.length ? (
          <ul>{data.recentActivity.map((a: any, i: number) => <li key={i}>{new Date(a.occurred_at).toLocaleDateString()} · {a.display_name} · {a.kind}: {a.summary}</li>)}</ul>
        ) : (
          <p className="muted">No logged activity yet.</p>
        )}
      </section>
    </Wrap>
  );
}

// ======================= Research directory =======================
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");

export function ResearchPage() {
  useDocumentTitle("Research Directory");
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [view, setView] = useState<"table" | "cards">("table");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const params = Object.fromEntries(sp.entries());
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["internal", "research", params], queryFn: () => api.get(`/internal/research${qs(params)}`), placeholderData: (p: any) => p });
  const { data: connector } = useQuery<any>({ queryKey: ["internal", "connector"], queryFn: () => api.get("/internal/research/connector") });
  const openId = sp.get("open");
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v);
    else n.delete(k);
    if (k !== "open") n.delete("page");
    setSp(n, { replace: true });
  };
  useEffect(() => {
    const t = setTimeout(() => q !== (sp.get("q") ?? "") && setParam("q", q), 300);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line
  const stats = data?.stats;
  return (
    <Wrap>
      <PageHeader title="Research Directory" eyebrow="Canada & USA affinity programs">
        <button className="btn btn-ghost" onClick={() => setImporting(true)}>Import CSV</button>
        <a className="btn btn-ghost" href={`/api/internal/research/export.csv${qs(params)}`}>Export CSV</a>
        <button className="btn btn-primary" onClick={() => setAdding(true)}>Add record</button>
      </PageHeader>
      {stats ? (
        <div className="stats" style={{ marginBottom: 14 }}>
          <Stat label="Records" value={stats.total} hint="A growing directory — not all programs" />
          <Stat label="With reviewed sources" value={stats.verified} />
          <Stat label="Canada · USA" value={`${stats.canada} · ${stats.usa}`} />
          <Stat label="Last research" value={stats.last_research ? new Date(stats.last_research).toLocaleDateString() : "—"} />
        </div>
      ) : null}
      <div className="alert alert-info" style={{ marginBottom: 14, fontSize: ".88rem" }}>
        {connector?.note ?? "Loading connector status…"} Many programs are private or not described online; this directory is never a complete list.
      </div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <div className="grid-3">
          <TextField label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Organization, program, domain" />
          <SelectField label="Country" value={params.country ?? ""} onChange={(e) => setParam("country", e.target.value)}>
            <option value="">Canada and USA</option>
            <option value="CA">Canada</option>
            <option value="US">USA</option>
          </SelectField>
          <SelectField label="Prospect type" value={params.type ?? ""} onChange={(e) => setParam("type", e.target.value)}>
            <option value="">All types</option>
            {PROSPECT_TYPES.map((t) => <option key={t} value={t}>{PROSPECT_TYPE_LABELS[t]}</option>)}
          </SelectField>
          <TextField label="Province / state" value={params.region ?? ""} onChange={(e) => setParam("region", e.target.value)} />
          <TextField label="Sector / industry" value={params.industry ?? ""} onChange={(e) => setParam("industry", e.target.value)} />
          <TextField label="Operator" value={params.operator ?? ""} onChange={(e) => setParam("operator", e.target.value)} placeholder="e.g. BenefitHub" />
          <SelectField label="Verification freshness" value={params.freshness ?? ""} onChange={(e) => setParam("freshness", e.target.value)}>
            <option value="">Any</option>
            <option value="fresh">Checked in last 90 days</option>
            <option value="stale">Older than 90 days / never</option>
          </SelectField>
          <SelectField label="Outreach status" value={params.stage ?? ""} onChange={(e) => setParam("stage", e.target.value)}>
            <option value="">Any stage</option>
            {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{PIPELINE_LABELS[s]}</option>)}
          </SelectField>
          <TextField label="Perk category" value={params.category ?? ""} onChange={(e) => setParam("category", e.target.value)} />
        </div>
        <div className="spread">
          <div className="alpha-jump" role="group" aria-label="Jump to letter">
            {LETTERS.map((l) => (
              <button key={l} aria-pressed={params.letter === l} onClick={() => setParam("letter", params.letter === l ? "" : l)}>{l}</button>
            ))}
          </div>
          <div className="segmented" role="group" aria-label="View">
            <button aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
            <button aria-pressed={view === "cards"} onClick={() => setView("cards")}>Cards</button>
          </div>
        </div>
      </div>
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}
      {data && !data.records.length ? <EmptyState title="No records match">Try clearing filters or add a record.</EmptyState> : null}
      {data?.records.length ? (
        view === "table" ? (
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Organization (A–Z)</th><th>Program</th><th>Type</th><th>Country</th><th>Verification</th><th>Stage</th></tr></thead>
              <tbody>
                {data.records.map((r: any) => (
                  <tr key={r.id} className="clickable" onClick={() => setParam("open", r.id)}>
                    <td><button className="btn btn-ghost btn-sm" style={{ border: 0, padding: 0, fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); setParam("open", r.id); }}>{r.display_name}</button></td>
                    <td>{(r.programs ?? []).map((p: any) => <div key={p.id}>{p.name}{p.operator ? <span className="muted"> · via {p.operator}</span> : null}</div>)}</td>
                    <td>{r.prospect_types.map((t: string) => <span key={t} className="badge" style={{ marginRight: 4 }}>{t}</span>)}</td>
                    <td>{r.country.join(", ")}</td>
                    <td><span className="muted" style={{ fontSize: ".82rem" }}>{r.verification_status.replace("_", " ")}{r.last_checked_at ? ` · ${new Date(r.last_checked_at).toLocaleDateString()}` : ""}</span></td>
                    <td>{PIPELINE_LABELS[r.stage as keyof typeof PIPELINE_LABELS]}{r.do_not_contact ? " · DNC" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid-3">
            {data.records.map((r: any) => (
              <button key={r.id} className="panel" style={{ textAlign: "left", font: "inherit", cursor: "pointer" }} onClick={() => setParam("open", r.id)}>
                <div className="eyebrow">{r.prospect_types.join(" · ")}</div>
                <h3>{r.display_name}</h3>
                <p className="muted" style={{ fontSize: ".88rem" }}>{(r.programs ?? []).map((p: any) => p.name).join(", ")}</p>
                <span className="badge">{r.country.join(" / ")}</span>
              </button>
            ))}
          </div>
        )
      ) : null}
      {data && data.total > data.pageSize ? (
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost btn-sm" disabled={data.page <= 1} onClick={() => setParam("page", String(data.page - 1))}>Previous</button>
          <span className="muted">Page {data.page}</span>
          <button className="btn btn-ghost btn-sm" disabled={data.page * data.pageSize >= data.total} onClick={() => setParam("page", String(data.page + 1))}>Next</button>
        </div>
      ) : null}
      <Drawer open={Boolean(openId)} onClose={() => setParam("open", "")} title="Research record">
        {openId ? <ResearchDetail id={openId} /> : null}
      </Drawer>
      <Drawer open={adding} onClose={() => setAdding(false)} title="Add research record">
        <AddResearch onDone={(id) => { setAdding(false); setParam("open", id); }} />
      </Drawer>
      <Drawer open={importing} onClose={() => setImporting(false)} title="Import research CSV">
        <ImportResearch />
      </Drawer>
    </Wrap>
  );
}

function ResearchDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["internal", "research-detail", id], queryFn: () => api.get(`/internal/research/${id}`) });
  const [note, setNote] = useState<string | null>(null);
  const [activity, setActivity] = useState({ kind: "note", summary: "", advanceToContacted: true });
  const [src, setSrc] = useState({ url: "", title: "", reviewedAt: new Date().toISOString().slice(0, 10), note: "" });
  const [contact, setContact] = useState({ name: "", title: "", email: "", phone: "", provenance: "", sourceUrl: "", emailPermission: "unknown", smsPermission: "unknown", phonePermission: "unknown" });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["internal", "research-detail", id] });
    qc.invalidateQueries({ queryKey: ["internal", "research"] });
  };
  const recheck = useMutation({
    mutationFn: (sourceId: string) => api.post(`/internal/research/${id}/sources/${sourceId}/recheck`),
    onSuccess: (r: any) => {
      toast(r.result.ok ? (r.crossDomain ? "Reachable but redirected to another domain — review needed" : "URL reachable (page claims not re-verified)") : `Recheck failed: ${r.result.error ?? r.result.status}`, r.result.ok && !r.crossDomain ? "ok" : "error");
      refresh();
    },
    onError: (e: any) => toast(e.message, "error"),
  });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorAlert error={error} />;
  const r = data.record;
  const p = data.prospect;
  const notConfirmed = <span className="muted">Not publicly confirmed</span>;
  return (
    <div className="stack">
      <div>
        <div className="eyebrow">{r.prospect_types.map((t: string) => PROSPECT_TYPE_LABELS[t as keyof typeof PROSPECT_TYPE_LABELS]).join(" · ")}</div>
        <h2 style={{ margin: "4px 0" }}>{r.display_name}</h2>
        {r.aliases.length ? <div className="muted">Also known as: {r.aliases.join(", ")}</div> : null}
        {r.legacy_of_name ? <div className="alert alert-warning">Legacy alias of <strong>{r.legacy_of_name}</strong>. Not counted as an independent current operator.</div> : null}
        <div className="row" style={{ marginTop: 8 }}>
          <span className="badge">{r.country.join(" / ")}</span>
          <span className="badge">{r.verification_status.replace("_", " ")}</span>
          {r.last_checked_at ? <span className="badge">Checked {new Date(r.last_checked_at).toLocaleDateString()}</span> : null}
        </div>
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={() => nav(`${B}/outreach?org=${id}`)} disabled={p?.do_not_contact}>Generate outreach</button>
        {data.programs[0]?.official_website ? <a className="btn btn-ghost" href={data.programs[0].official_website} target="_blank" rel="noopener noreferrer">Official website</a> : null}
        {data.programs[0]?.program_url ? <a className="btn btn-ghost" href={data.programs[0].program_url} target="_blank" rel="noopener noreferrer">Program page</a> : null}
        {data.programs[0]?.contact_url ? <a className="btn btn-ghost" href={data.programs[0].contact_url} target="_blank" rel="noopener noreferrer">Contact route</a> : null}
      </div>

      <section className="panel">
        <h3 style={{ fontSize: "1rem" }}>Verified facts</h3>
        <dl style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "6px 12px", margin: 0, fontSize: ".92rem" }}>
          <dt>Research focus</dt><dd style={{ margin: 0 }}>{r.research_focus || notConfirmed}</dd>
          <dt>Industry</dt><dd style={{ margin: 0 }}>{r.industry || notConfirmed}</dd>
          <dt>Region</dt><dd style={{ margin: 0 }}>{r.region || notConfirmed}</dd>
          <dt>Audience</dt><dd style={{ margin: 0 }}>{r.audience || notConfirmed}</dd>
          <dt>Domain</dt><dd style={{ margin: 0 }}>{r.primary_domain || notConfirmed}</dd>
        </dl>
        {data.programs.map((pr: any) => (
          <div key={pr.id} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #eee" }}>
            <strong>{pr.name}</strong>{pr.operator_name ? <span className="muted"> · operated by {pr.operator_name}</span> : null}
            <p style={{ margin: "4px 0" }}>{pr.summary || notConfirmed}</p>
            <div className="muted" style={{ fontSize: ".86rem" }}>
              Coverage: {pr.coverage || "Not publicly confirmed"} · Eligibility: {pr.eligibility || "Not publicly confirmed"} · Pricing: {pr.pricing || "Not publicly confirmed"}
            </div>
            <div className="muted" style={{ fontSize: ".86rem" }}>
              Public email: {pr.public_email || "Not publicly confirmed"} · Public phone: {pr.public_phone || "Not publicly confirmed"}
            </div>
          </div>
        ))}
        {data.operatedPrograms.length ? (
          <div style={{ marginTop: 12 }}>
            <strong>Operates programs for:</strong>{" "}
            {data.operatedPrograms.map((o: any) => <button key={o.id} className="btn btn-ghost btn-sm" onClick={() => nav(`${B}/research?open=${o.organization_id}`)}>{o.organization}</button>)}
          </div>
        ) : null}
        {data.legacyAliases.length ? <p className="muted">Legacy aliases: {data.legacyAliases.map((a: any) => `${a.display_name} (${a.primary_domain})`).join(", ")}</p> : null}
      </section>

      <section className="panel">
        <h3 style={{ fontSize: "1rem" }}>Sources &amp; evidence</h3>
        {data.sources.map((s: any) => (
          <div key={s.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee", fontSize: ".9rem" }}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ overflowWrap: "anywhere" }}>{s.url}</a>
            <div className="muted">
              {s.review_level === "page_reviewed" ? "Page reviewed" : s.review_level === "url_rechecked" ? "URL rechecked (reachability only)" : "Imported — needs review"} ·{" "}
              {new Date(s.reviewed_at).toLocaleDateString()}
              {s.http_status ? ` · HTTP ${s.http_status}` : ""}
              {s.redirected_to ? ` · redirected to ${s.redirected_to}` : ""}
            </div>
            {s.note ? <div className="muted">{s.note}</div> : null}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} disabled={recheck.isPending} onClick={() => recheck.mutate(s.id)}>Recheck URL</button>
          </div>
        ))}
        <form
          style={{ marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post(`/internal/research/${id}/sources`, src);
              setSrc({ ...src, url: "", title: "", note: "" });
              refresh();
              toast("Source added");
            } catch (x: any) {
              toast(x.message, "error");
            }
          }}
        >
          <div className="grid-2">
            <TextField label="Source URL" type="url" required value={src.url} onChange={(e) => setSrc({ ...src, url: e.target.value })} />
            <TextField label="Reviewed on" type="date" value={src.reviewedAt} onChange={(e) => setSrc({ ...src, reviewedAt: e.target.value })} />
          </div>
          <TextField label="What this page establishes" value={src.note} onChange={(e) => setSrc({ ...src, note: e.target.value })} />
          <button className="btn btn-ghost btn-sm">Add reviewed source</button>
        </form>
      </section>

      <section className="panel">
        <h3 style={{ fontSize: "1rem" }}>Pipeline</h3>
        <ProspectEditor id={id} prospect={p} onSaved={refresh} />
      </section>

      <section className="panel">
        <h3 style={{ fontSize: "1rem" }}>Internal analysis</h3>
        <p className="muted" style={{ fontSize: ".85rem" }}>Assessments here are internal opinions, not verified facts.</p>
        <TextArea label="Potential fit (internal)" value={note ?? r.fit_assessment} onChange={(e) => setNote(e.target.value)} rows={3} />
        <button className="btn btn-ghost btn-sm" onClick={async () => { await api.patch(`/internal/research/${id}`, { fitAssessment: note ?? r.fit_assessment }); toast("Saved"); refresh(); }}>Save analysis</button>
      </section>

      <section className="panel">
        <h3 style={{ fontSize: "1rem" }}>Business contacts</h3>
        <p className="muted" style={{ fontSize: ".85rem" }}>Record only contacts actually published or provided, with provenance. A public contact page is not consent to text marketing.</p>
        {data.contacts.map((ct: any) => (
          <div key={ct.id} style={{ padding: "8px 0", borderBottom: "1px solid #eee", fontSize: ".9rem" }}>
            <strong>{ct.name || "(no name)"}</strong> {ct.title} · {ct.email ?? ""} {ct.phone ?? ""}
            <div className="muted">Source: {ct.provenance} · email {ct.email_permission} · SMS {ct.sms_permission} · phone {ct.phone_permission}{ct.do_not_contact ? " · DO NOT CONTACT" : ""}</div>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await api.patch(`/internal/contacts/${ct.id}`, { doNotContact: !ct.do_not_contact }); refresh(); }}>
              {ct.do_not_contact ? "Remove suppression" : "Mark do not contact"}
            </button>
          </div>
        ))}
        <form
          style={{ marginTop: 10 }}
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post(`/internal/research/${id}/contacts`, contact);
              setContact({ ...contact, name: "", title: "", email: "", phone: "", provenance: "", sourceUrl: "" });
              refresh();
              toast("Contact added");
            } catch (x: any) {
              toast(x.message, "error");
            }
          }}
        >
          <div className="grid-2">
            <TextField label="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            <TextField label="Title" value={contact.title} onChange={(e) => setContact({ ...contact, title: e.target.value })} />
            <TextField label="Email" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            <TextField label="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          </div>
          <TextField label="Provenance (required)" required value={contact.provenance} onChange={(e) => setContact({ ...contact, provenance: e.target.value })} hint="e.g. “Published on official partnerships page, reviewed 2026-11-17”" />
          <div className="grid-3">
            {(["emailPermission", "smsPermission", "phonePermission"] as const).map((k) => (
              <SelectField key={k} label={k.replace("Permission", "").toUpperCase() + " permission"} value={(contact as any)[k]} onChange={(e) => setContact({ ...contact, [k]: e.target.value })}>
                <option value="unknown">Unknown</option>
                <option value="permitted">Permitted (recorded)</option>
                <option value="opted_out">Opted out</option>
              </SelectField>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm">Add contact</button>
        </form>
      </section>

      <section className="panel">
        <h3 style={{ fontSize: "1rem" }}>Activity</h3>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post(`/internal/research/${id}/activities`, activity);
              setActivity({ ...activity, summary: "" });
              refresh();
              toast("Activity logged");
            } catch (x: any) {
              toast(x.message, "error");
            }
          }}
        >
          <div className="grid-2">
            <SelectField label="Type" value={activity.kind} onChange={(e) => setActivity({ ...activity, kind: e.target.value })}>
              {["note", "email", "call", "sms", "meeting", "demo"].map((k) => <option key={k}>{k}</option>)}
            </SelectField>
            <TextField label="What happened" required value={activity.summary} onChange={(e) => setActivity({ ...activity, summary: e.target.value })} />
          </div>
          {activity.kind !== "note" ? <Checkbox label="Move to Contacted (if earlier stage)" checked={activity.advanceToContacted} onChange={(v) => setActivity({ ...activity, advanceToContacted: v })} /> : null}
          <button className="btn btn-dark btn-sm">Mark activity</button>
        </form>
        <ul style={{ marginTop: 12 }}>
          {data.activities.map((a: any) => <li key={a.id} style={{ fontSize: ".9rem" }}>{new Date(a.occurred_at).toLocaleString()} · {a.kind} · {a.summary} <span className="muted">({a.user_email})</span></li>)}
        </ul>
        {data.drafts.length ? (
          <>
            <h4 style={{ fontSize: ".95rem", marginTop: 12 }}>Saved drafts</h4>
            <ul>{data.drafts.map((d: any) => <li key={d.id} style={{ fontSize: ".9rem" }}>v{d.version} · {d.channel} · {OUTREACH_OBJECTIVES[d.objective as keyof typeof OUTREACH_OBJECTIVES] ?? d.objective} · {d.generator === "ai" ? `AI (${d.model})` : "Example template"} · {new Date(d.created_at).toLocaleDateString()}</li>)}</ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

function ProspectEditor({ id, prospect, onSaved }: { id: string; prospect: any; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ stage: prospect?.stage ?? "researching", nextAction: prospect?.next_action ?? "", dueDate: prospect?.due_date?.slice(0, 10) ?? "", notes: prospect?.notes ?? "", ownerEmail: prospect?.owner_email ?? "" });
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.put(`/internal/prospects/${id}`, f);
          toast("Pipeline updated");
          onSaved();
        } catch (x: any) {
          toast(x.message, "error");
        }
      }}
    >
      <div className="grid-2">
        <SelectField label="Stage" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
          {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{PIPELINE_LABELS[s]}</option>)}
        </SelectField>
        <TextField label="Owner (admin email)" value={f.ownerEmail} onChange={(e) => setF({ ...f, ownerEmail: e.target.value })} />
        <TextField label="Next action" value={f.nextAction} onChange={(e) => setF({ ...f, nextAction: e.target.value })} />
        <TextField label="Due date" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
      </div>
      <TextArea label="Notes" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      {f.stage === "do_not_contact" ? <div className="alert alert-warning" style={{ marginBottom: 10 }}>Do Not Contact suppresses outreach drafting for the whole organization.</div> : null}
      <button className="btn btn-dark btn-sm">Save pipeline</button>
    </form>
  );
}

function AddResearch({ onDone }: { onDone: (id: string) => void }) {
  const [f, setF] = useState<any>({ displayName: "", primaryDomain: "", country: ["CA"], prospectTypes: ["employer"], region: "", industry: "", audience: "", programName: "", summary: "", programUrl: "", officialWebsite: "", sourceUrl: "", reviewedAt: new Date().toISOString().slice(0, 10) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<unknown>(null);
  const toggle = (k: string, v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x: string) => x !== v) : [...f[k], v] });
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        try {
          const r = await api.post("/internal/research", {
            displayName: f.displayName,
            primaryDomain: f.primaryDomain || undefined,
            country: f.country,
            prospectTypes: f.prospectTypes,
            region: f.region,
            industry: f.industry,
            audience: f.audience,
            program: f.programName ? { name: f.programName, summary: f.summary, programUrl: f.programUrl || undefined, officialWebsite: f.officialWebsite || undefined } : undefined,
            source: f.sourceUrl ? { url: f.sourceUrl, reviewedAt: f.reviewedAt, title: "", note: "" } : undefined,
          });
          onDone(r.id);
        } catch (x) {
          setErr(x);
          setErrors((x as ApiError).fields ?? {});
        }
      }}
    >
      {err ? <ErrorAlert error={err} /> : null}
      <TextField label="Organization" required value={f.displayName} error={errors.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
      <TextField label="Primary domain" value={f.primaryDomain} error={errors.primaryDomain} onChange={(e) => setF({ ...f, primaryDomain: e.target.value })} hint="Used for deduplication." />
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600 }}>Country</legend>
        <Checkbox label="Canada" checked={f.country.includes("CA")} onChange={() => toggle("country", "CA")} />
        <Checkbox label="USA" checked={f.country.includes("US")} onChange={() => toggle("country", "US")} />
      </fieldset>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600 }}>Classification</legend>
        {PROSPECT_TYPES.map((t) => <Checkbox key={t} label={PROSPECT_TYPE_LABELS[t]} checked={f.prospectTypes.includes(t)} onChange={() => toggle("prospectTypes", t)} />)}
      </fieldset>
      <div className="grid-2">
        <TextField label="Province / state" value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} />
        <TextField label="Industry" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} />
      </div>
      <TextField label="Program name" value={f.programName} onChange={(e) => setF({ ...f, programName: e.target.value })} />
      <TextArea label="Publicly described purpose" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} rows={2} />
      <div className="grid-2">
        <TextField label="Official website" type="url" value={f.officialWebsite} onChange={(e) => setF({ ...f, officialWebsite: e.target.value })} />
        <TextField label="Program page" type="url" value={f.programUrl} onChange={(e) => setF({ ...f, programUrl: e.target.value })} />
        <TextField label="Reviewed source URL" type="url" value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} />
        <TextField label="Reviewed on" type="date" value={f.reviewedAt} onChange={(e) => setF({ ...f, reviewedAt: e.target.value })} />
      </div>
      <button className="btn btn-primary">Save record</button>
    </form>
  );
}

function ImportResearch() {
  const [csv, setCsv] = useState("");
  const [res, setRes] = useState<any>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const header = "organization,program,operator,prospect_types,country,region,industry,audience,program_summary,official_website,program_url,contact_url,public_email,public_phone,source_url,reviewed_at\n";
  async function run(dryRun: boolean) {
    try {
      const r = await api.post("/internal/research/import", { csv, dryRun });
      setRes({ ...r, dryRun });
      if (!dryRun) {
        toast("Import complete — imported records are marked unverified until reviewed");
        qc.invalidateQueries({ queryKey: ["internal", "research"] });
      }
    } catch (e: any) {
      toast(e.message, "error");
    }
  }
  return (
    <div className="stack">
      <p className="muted">Imports create research records only — never offers or partnerships. Duplicates (name, alias or domain) are skipped. <a download="research-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(header)}`}>Template</a></p>
      <label className="btn btn-ghost" style={{ width: "fit-content", cursor: "pointer" }}>
        Choose CSV
        <input type="file" className="sr-only" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
      </label>
      <TextArea label="…or paste CSV" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} />
      <div className="row">
        <button className="btn btn-ghost" disabled={!csv} onClick={() => run(true)}>Preview</button>
        <button className="btn btn-dark" disabled={!res?.dryRun} onClick={() => run(false)}>Import</button>
      </div>
      {res ? (
        <ul>{res.results.map((r: any) => <li key={r.row}>Row {r.row}: {r.organization} — <strong>{r.status}</strong> {r.existing ? `(matches ${r.existing})` : ""} {r.errors ? JSON.stringify(r.errors) : ""}</li>)}</ul>
      ) : null}
    </div>
  );
}

// ======================= Outreach =======================
export function OutreachPage() {
  useDocumentTitle("Sales Outreach");
  const [sp] = useSearchParams();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { data: list } = useQuery<any>({ queryKey: ["internal", "research", { pageSize: 200 }], queryFn: () => api.get("/internal/research?pageSize=200") });
  const [orgId, setOrgId] = useState(sp.get("org") ?? "");
  const { data: detail } = useQuery<any>({ queryKey: ["internal", "research-detail", orgId], queryFn: () => api.get(`/internal/research/${orgId}`), enabled: Boolean(orgId) });
  const [opts, setOpts] = useState({ objective: "sell_program", channel: "email", persona: "", tone: "warm", senderName: me?.user?.display_name ?? "" });
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  useEffect(() => {
    if (!detail) return;
    const types: string[] = detail.record.prospect_types;
    setOpts((o) => ({ ...o, objective: types.includes("operator") ? "partnership" : types.includes("merchant") ? "recruit_merchant" : o.objective }));
    setSourceIds(detail.sources.filter((s: any) => s.review_level === "page_reviewed").map((s: any) => s.id));
    setOut(null);
    setSavedId(null);
  }, [detail]);
  async function generate(ai = true) {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.post(`/internal/outreach/generate${ai ? "" : "?ai=0"}`, { researchOrgId: orgId, ...opts, sourceIds });
      setOut(r);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    try {
      const r = await api.post("/internal/outreach/drafts", { researchOrgId: orgId, ...opts, content: out.content, generator: out.generator, model: out.model, sourceIds: out.sourceIds, sourceUrls: out.sourceUrls, parentId: savedId });
      setSavedId(r.id);
      toast(`Draft saved (version ${r.version})`);
      qc.invalidateQueries({ queryKey: ["internal", "research-detail", orgId] });
    } catch (e: any) {
      toast(e.message, "error");
    }
  }
  const dnc = detail?.prospect?.do_not_contact || detail?.prospect?.stage === "do_not_contact";
  return (
    <Wrap>
      <PageHeader title="Sales Outreach" eyebrow="Admin Research & Sales" />
      <div className="alert alert-info" style={{ marginBottom: 14, fontSize: ".88rem" }}>
        Drafts only. Nothing is sent from Culturosity. You remain responsible for the final message, channel permission and your approved outreach policy.
      </div>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <section className="panel">
          <SelectField label="Prospect" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">Choose a research record…</option>
            {(list?.records ?? []).map((r: any) => <option key={r.id} value={r.id}>{r.display_name}</option>)}
          </SelectField>
          {dnc ? <div className="alert alert-error" style={{ marginBottom: 12 }}>This organization is marked Do Not Contact.</div> : null}
          <div className="grid-2">
            <SelectField label="Objective" value={opts.objective} onChange={(e) => setOpts({ ...opts, objective: e.target.value })}>
              {Object.entries(OUTREACH_OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectField>
            <SelectField label="Channel" value={opts.channel} onChange={(e) => setOpts({ ...opts, channel: e.target.value })}>
              {Object.entries(OUTREACH_CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectField>
            <TextField label="Audience / persona" placeholder="e.g. HR benefits lead" value={opts.persona} onChange={(e) => setOpts({ ...opts, persona: e.target.value })} />
            <SelectField label="Tone" value={opts.tone} onChange={(e) => setOpts({ ...opts, tone: e.target.value })}>
              {["warm", "concise", "formal", "energetic"].map((t) => <option key={t}>{t}</option>)}
            </SelectField>
            <TextField label="Sender name" value={opts.senderName} onChange={(e) => setOpts({ ...opts, senderName: e.target.value })} />
          </div>
          {detail ? (
            <fieldset style={{ border: 0, padding: 0 }}>
              <legend style={{ fontWeight: 600 }}>Verified context to use</legend>
              {detail.sources.map((s: any) => (
                <Checkbox
                  key={s.id}
                  label={<span style={{ overflowWrap: "anywhere" }}>{s.url}</span>}
                  hint={`${s.review_level.replace("_", " ")} · ${new Date(s.reviewed_at).toLocaleDateString()}`}
                  checked={sourceIds.includes(s.id)}
                  onChange={(v) => setSourceIds(v ? [...sourceIds, s.id] : sourceIds.filter((x) => x !== s.id))}
                />
              ))}
            </fieldset>
          ) : null}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" disabled={!orgId || busy || dnc} onClick={() => generate(true)}>{busy ? "Generating…" : "Generate"}</button>
            {out ? <button className="btn btn-ghost" disabled={busy} onClick={() => generate(true)}>Regenerate</button> : null}
          </div>
          {err ? <div style={{ marginTop: 10 }}><ErrorAlert error={err} /></div> : null}
        </section>
        <section className="panel">
          {!out ? (
            <EmptyState title="Your draft appears here">Choose a prospect and objective, then Generate.</EmptyState>
          ) : (
            <div className="stack">
              <div className="spread">
                <span className={`badge ${out.generator === "ai" ? "badge-new" : ""}`}>{out.label}</span>
                {!out.aiConfigured ? <span className="muted" style={{ fontSize: ".8rem" }}>AI drafting not configured (ANTHROPIC_API_KEY)</span> : null}
              </div>
              {out.aiError ? <div className="alert alert-warning">AI drafting failed ({out.aiError}); showing the example template.</div> : null}
              {out.content.warnings.map((w: string, i: number) => <div key={i} className="alert alert-warning">{w}</div>)}
              {out.content.sections.map((s: any, i: number) => (
                <div key={s.key + i} style={{ borderTop: i ? "1px solid #eee" : 0, paddingTop: i ? 12 : 0 }}>
                  <div className="spread">
                    <strong>{s.title}</strong>
                    <button className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText((s.subject ? `Subject: ${s.subject}\n\n` : "") + s.body); toast("Copied"); }}>Copy</button>
                  </div>
                  {s.subject !== undefined ? (
                    <TextField label="Subject" value={s.subject ?? ""} onChange={(e) => { const n = structuredClone(out); n.content.sections[i].subject = e.target.value; setOut(n); }} />
                  ) : null}
                  <TextArea label="Body" rows={Math.min(14, Math.max(4, s.body.split("\n").length + 1))} value={s.body} onChange={(e) => { const n = structuredClone(out); n.content.sections[i].body = e.target.value; setOut(n); }} />
                </div>
              ))}
              <div className="muted" style={{ fontSize: ".82rem" }}>Sources: {out.sourceUrls.join(", ") || "none selected"}</div>
              <div className="row">
                <button className="btn btn-dark" onClick={save}>Save Draft</button>
                <Link className="btn btn-ghost" to={`${B}/research?open=${orgId}`}>Mark Activity</Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </Wrap>
  );
}

// ======================= Pipeline =======================
type Stage = (typeof PIPELINE_STAGES)[number];
type DragItem = { kind: "prospect" | "record"; id: string; from: Stage | null; name: string };

/**
 * Drag-and-drop pipeline board. Drag a research record from the tray into any stage to add it,
 * or drag a card between stages. Every card also has a stage picker, so the board works by
 * keyboard, screen reader and touch (HTML drag-and-drop is mouse-only on most phones).
 */
export function PipelinePage() {
  useDocumentTitle("Pipeline");
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["internal", "pipeline"], queryFn: () => api.get("/internal/pipeline") });
  const { data: records } = useQuery<any>({ queryKey: ["internal", "research", { pageSize: 200 }], queryFn: () => api.get("/internal/research?pageSize=200") });
  const [filter, setFilter] = useState("");
  const [dragging, setDragging] = useState<DragItem | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const grouped = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const s of PIPELINE_STAGES) m[s] = [];
    for (const p of data?.prospects ?? []) m[p.stage]?.push(p);
    return m;
  }, [data]);
  const inPipeline = useMemo(() => new Set((data?.prospects ?? []).map((p: any) => p.research_org_id)), [data]);
  const tray = useMemo(
    () =>
      (records?.records ?? [])
        .filter((r: any) => !inPipeline.has(r.id))
        .filter((r: any) => !filter || r.display_name.toLowerCase().includes(filter.toLowerCase())),
    [records, inPipeline, filter],
  );

  const move = useMutation({
    mutationFn: ({ item, to, clearDnc }: { item: DragItem; to: Stage; clearDnc?: boolean }) =>
      api.put(`/internal/prospects/${item.id}`, { stage: to, ...(clearDnc ? { doNotContact: false } : {}) }),
    onMutate: async ({ item, to }) => {
      // Optimistic: show the card in its new column immediately.
      await qc.cancelQueries({ queryKey: ["internal", "pipeline"] });
      const prev = qc.getQueryData<any>(["internal", "pipeline"]);
      if (prev) {
        const exists = prev.prospects.some((p: any) => p.research_org_id === item.id);
        const prospects = exists
          ? prev.prospects.map((p: any) => (p.research_org_id === item.id ? { ...p, stage: to } : p))
          : [...prev.prospects, { id: `tmp-${item.id}`, research_org_id: item.id, display_name: item.name, stage: to }];
        qc.setQueryData(["internal", "pipeline"], { ...prev, prospects });
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["internal", "pipeline"], ctx.prev);
      toast(e.message, "error");
    },
    onSuccess: (_r, { item, to }) => {
      const msg = item.from ? `Moved ${item.name} to ${PIPELINE_LABELS[to]}` : `Added ${item.name} to ${PIPELINE_LABELS[to]}`;
      setAnnounce(msg);
      toast(msg);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["internal", "pipeline"] });
      qc.invalidateQueries({ queryKey: ["internal", "research"] });
      qc.invalidateQueries({ queryKey: ["internal", "overview"] });
    },
  });

  function moveTo(item: DragItem, to: Stage) {
    if (item.from === to) return;
    if (to === "do_not_contact" && !confirm(`Mark ${item.name} as Do Not Contact? Outreach drafting will be disabled for this organization.`)) return;
    let clearDnc = false;
    if (item.from === "do_not_contact") {
      if (!confirm(`Remove the Do Not Contact status from ${item.name}? Only do this if you have a valid reason to contact them again.`)) return;
      clearDnc = true;
    }
    move.mutate({ item, to, clearDnc });
  }

  const dragProps = (item: DragItem) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id);
      setDragging(item);
    },
    onDragEnd: () => {
      setDragging(null);
      setOver(null);
    },
  });
  const dropProps = (stage: Stage) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (over !== stage) setOver(stage);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(null);
      if (dragging) moveTo(dragging, stage);
      setDragging(null);
    },
  });

  return (
    <Wrap>
      <PageHeader title="Pipeline" eyebrow="Admin Research & Sales">
        <Link className="btn btn-ghost" to={`${B}/research`}>Add a research record</Link>
      </PageHeader>
      <p className="muted">
        Drag a record from the tray into a stage to add it, or drag cards between stages. You can also use each card's stage menu. Generating an outreach
        draft never moves a prospect.
      </p>
      <div className="sr-only" aria-live="polite">{announce}</div>
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}

      <section className="pipeline-tray" aria-labelledby="tray-title">
        <div className="spread" style={{ marginBottom: 10 }}>
          <h2 id="tray-title" style={{ fontSize: "1rem", margin: 0 }}>
            Not in pipeline yet <span className="muted">({tray.length})</span>
          </h2>
          <label className="sr-only" htmlFor="tray-filter">Filter records</label>
          <input id="tray-filter" className="input" style={{ maxWidth: 260, minHeight: 40 }} placeholder="Filter records" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {tray.length ? (
          <div className="tray-items">
            {tray.map((r: any) => {
              const item: DragItem = { kind: "record", id: r.id, from: null, name: r.display_name };
              return (
                <div key={r.id} className={`tray-chip ${dragging?.id === r.id ? "dragging" : ""}`} {...dragProps(item)}>
                  <span className="grip" aria-hidden>⠿</span>
                  <span className="name">{r.display_name}</span>
                  <label className="sr-only" htmlFor={`add-${r.id}`}>Add {r.display_name} to stage</label>
                  <select
                    id={`add-${r.id}`}
                    className="stage-select"
                    value=""
                    onChange={(e) => e.target.value && moveTo(item, e.target.value as Stage)}
                  >
                    <option value="">Add to…</option>
                    {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{PIPELINE_LABELS[s]}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {filter ? "No records match." : "Every research record is already in the pipeline."} <Link to={`${B}/research`}>Add a new research record</Link>.
          </p>
        )}
      </section>

      <div
        className="kanban"
        role="list"
        aria-label="Pipeline stages"
        onDragOver={(e) => {
          // Auto-scroll the board when dragging near its edges so off-screen stages are reachable.
          if (!dragging) return;
          const el = e.currentTarget;
          const r = el.getBoundingClientRect();
          if (e.clientX > r.right - 70) el.scrollLeft += 18;
          else if (e.clientX < r.left + 70) el.scrollLeft -= 18;
        }}
      >
        {PIPELINE_STAGES.map((s) => (
          <div key={s} role="listitem" className={`col ${over === s ? "drop-over" : ""} ${s === "do_not_contact" ? "col-dnc" : ""}`} {...dropProps(s)} aria-label={`${PIPELINE_LABELS[s]}, ${grouped[s].length} prospects`}>
            <h4><span>{PIPELINE_LABELS[s]}</span><span>{grouped[s].length}</span></h4>
            {grouped[s].map((p) => {
              const item: DragItem = { kind: "prospect", id: p.research_org_id, from: s, name: p.display_name };
              return (
                <div key={p.id} className={`card ${dragging?.id === p.research_org_id ? "dragging" : ""}`} {...dragProps(item)}>
                  <div className="spread" style={{ alignItems: "flex-start", gap: 6 }}>
                    <Link to={`${B}/research?open=${p.research_org_id}`} style={{ fontWeight: 700, color: "inherit" }}>{p.display_name}</Link>
                    <span className="grip" aria-hidden>⠿</span>
                  </div>
                  {p.next_action ? <div className="muted">Next: {p.next_action}</div> : null}
                  {p.due_date ? <div className="muted">Due {new Date(p.due_date).toLocaleDateString()}</div> : null}
                  {p.owner_email ? <div className="muted">Owner: {p.owner_email}</div> : null}
                  <label className="sr-only" htmlFor={`move-${p.id}`}>Move {p.display_name} to stage</label>
                  <select id={`move-${p.id}`} className="stage-select" value={s} onChange={(e) => moveTo(item, e.target.value as Stage)}>
                    {PIPELINE_STAGES.map((x) => <option key={x} value={x}>{PIPELINE_LABELS[x]}</option>)}
                  </select>
                </div>
              );
            })}
            {!grouped[s].length ? <div className="drop-hint">{dragging ? "Drop here" : "Empty"}</div> : null}
          </div>
        ))}
      </div>
    </Wrap>
  );
}

// ======================= Demo guide =======================
export function DemoGuidePage() {
  useDocumentTitle("Demo Guide");
  // A real, fully detailed Culturosity perk to open in the demo (newest first).
  const { data } = useQuery<any>({ queryKey: ["demo-guide-perk"], queryFn: () => api.get("/public/perks?sort=new") });
  const sample = (data?.perks ?? []).find((p: any) => !p.is_demo && !p.details_pending);
  const perkLink = sample ? `/perks/${sample.id}` : "/perks";
  const perkName = sample ? `${sample.provider_name} — ${sample.title}` : "any perk";
  const steps: [string, string, string][] = [
    ["Introduce Culturosity Perks", "/perks", "Show the catalogue: value labels (Save 15%, Free, BOGO), the New / A–Z / Ending soon sorting, search and filters, and the light/dark switch."],
    ["Open a perk’s Details page", perkLink, `Open ${perkName}. Walk through the value pill and Use Perk button, the large image, the green offer card with the promo code, and the provider’s website, email and directions.`],
    ["Explain redeeming in person: the member card", perkLink, "Scroll to the member card. Each perk has its own QR code that the provider links to their point-of-sale system; members show it at checkout. (Signed-out visitors see it locked.)"],
    ["Also show the Culturosity app on your phone", "/", "On top of the website, show the app itself. Before the demo, download the Culturosity app onto your own mobile device (App Store or Google Play — the badges are on the home page). During the demo, after walking through the website, show the app live on your phone: browse perks, open a perk’s details and show the member card with its QR code. Then point to the badges on the website so they know where members download it."],
    ["Explain affinity programs for organizations", "/affinity", "How a company, association or union gets its own private perks program for its people, alongside Culturosity Perks."],
    ["Show how providers add offers", "/submit-perk", "Show the Submit a Perk form only — don’t submit it during a demo, because submitting publishes a real perk."],
    ["Explain Self-Service, Launch with Culturosity and Fully Managed", "/services", "Walk through the three ways to work with Culturosity. No invented pricing — offer a proposal instead."],
    ["Close with a proposal request", "/services#request", "This walkthrough is the demo — close it by filling in Request a Proposal together with the prospect, using their organization’s details. It goes straight to the Service queue and emails Culturosity, and the prospect gets a confirmation email."],
  ];
  return (
    <Wrap>
      <PageHeader title="Demo Guide" eyebrow="Admin Research & Sales" />
      <div className="alert alert-info" style={{ marginBottom: 14 }}>
        Every step opens a real page on the live site in a new tab, so this guide stays open here. Look around freely, but don’t submit forms during a demo unless you mean to.
      </div>
      <ol style={{ display: "grid", gap: 12, paddingLeft: 0, listStyle: "none" }}>
        {steps.map(([t, to, d], i) => (
          <li key={t} className="panel">
            <div className="spread" style={{ gap: 16 }}>
              <div>
                <div className="eyebrow">Step {i + 1}</div>
                <h3 style={{ margin: "4px 0" }}>{t}</h3>
                <p className="muted" style={{ margin: 0 }}>{d}</p>
              </div>
              {/* New tab, so the Demo Guide stays open in this one. */}
              <a className="btn btn-dark" href={to} target="_blank" rel="noopener" aria-label={`Open step ${i + 1} in a new tab: ${t}`}>
                Open <IconExternal size={16} />
              </a>
            </div>
          </li>
        ))}
      </ol>
    </Wrap>
  );
}

// ======================= Preview (branded demo) =======================
const PREVIEW_KEY = "cul:brand-preview";

export function PreviewPage() {
  useDocumentTitle("Preview");
  const toast = useToast();
  const [brand, setBrand] = useState<BrandState>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREVIEW_KEY) || "null");
      return saved ? { ...DEFAULT_BRAND, ...saved } : DEFAULT_BRAND;
    } catch {
      return DEFAULT_BRAND;
    }
  });
  const [screen, setScreen] = useState<"perks" | "details" | "about">("about");
  const [seed, setSeed] = useState(1);
  const [logoErr, setLogoErr] = useState<string | null>(null);
  const [present, setPresent] = useState(false);
  // Kept in this browser only, so a salesperson can prepare a demo ahead of time.
  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(brand));
    } catch {
      /* storage full or blocked: preview still works */
    }
  }, [brand]);
  const set = (patch: Partial<BrandState>) => setBrand((b) => ({ ...b, ...patch }));

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setLogoErr(null);
    try {
      const logo = await readLogo(file);
      set({ logo });
    } catch (e: any) {
      setLogoErr(e.message);
    }
  }

  const controls = (
    <div className="bp-controls">
      <section className="panel">
        <h2 className="bp-h">1. Company</h2>
        <TextField label="Company name" value={brand.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Prairie Teachers Association" />
        <div className="field">
          <label htmlFor="bp-logo">Logo</label>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <div className="bp-logo-box">{brand.logo ? <img src={brand.logo} alt="Uploaded logo" /> : <span className="muted">No logo</span>}</div>
            <div style={{ display: "grid", gap: 6 }}>
              <input id="bp-logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" onChange={(e) => onLogo(e.target.files?.[0])} />
              {brand.logo ? (
                <div className="row" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      const c = await coloursFromLogo(brand.logo!);
                      if (c) {
                        set(c);
                        toast("Colours matched to the logo");
                      } else toast("Couldn't read colours from this logo", "error");
                    }}
                  >
                    Match colours to logo
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ logo: null })}>Remove</button>
                </div>
              ) : null}
            </div>
          </div>
          {logoErr ? <div className="error">{logoErr}</div> : <div className="hint">PNG, JPG, WebP or SVG. A transparent background looks best.</div>}
        </div>
      </section>

      <section className="panel">
        <h2 className="bp-h">2. Colours</h2>
        <div className="bp-presets" role="group" aria-label="Colour presets">
          {PRESETS.map((p) => (
            <button type="button" key={p.name} className="chip" onClick={() => set({ c1: p.c1, c2: p.c2, c3: p.c3 })} aria-pressed={brand.c1 === p.c1 && brand.c2 === p.c2 && brand.c3 === p.c3}>
              <Swatches c1={p.c1} c2={p.c2} c3={p.c3} /> {p.name}
            </button>
          ))}
        </div>
        <ColourField label="Colour 1 — header & navigation" hint="Top bar, About title bar and bottom menu." value={brand.c1} onChange={(c1) => set({ c1 })} />
        <ColourField label="Colour 2 — value badge" hint="“SAVE 15%”, “FREE” and the value pill." value={brand.c2} onChange={(c2) => set({ c2 })} />
        <ColourField label="Colour 3 — buttons & highlights" hint="DETAILS / USE PERK, the offer card, member card band and About background." value={brand.c3} onChange={(c3) => set({ c3 })} />
      </section>

      <section className="panel">
        <h2 className="bp-h">3. About page</h2>
        <TextField label="Title bar text" value={brand.tagline} onChange={(e) => set({ tagline: e.target.value.slice(0, 40) })} hint="Short, like “LIFE TO THE FULLEST”." />
        <TextField label="Headline" value={brand.headline} onChange={(e) => set({ headline: e.target.value.slice(0, 120) })} />
        <TextArea label="Description" rows={5} value={brand.description} onChange={(e) => set({ description: e.target.value.slice(0, 1500) })} hint="Leave a blank line between paragraphs." />
        <TextField label="Privacy Policy link (optional)" value={brand.privacyUrl} onChange={(e) => set({ privacyUrl: e.target.value.slice(0, 300) })} placeholder="https://…" />
        <TextField label="Terms of Use link (optional)" value={brand.termsUrl} onChange={(e) => set({ termsUrl: e.target.value.slice(0, 300) })} placeholder="https://…" />
      </section>

      <div className="row" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            if (confirm("Clear this preview and start again?")) setBrand(DEFAULT_BRAND);
          }}
        >
          Start a new preview
        </button>
      </div>
      <p className="muted" style={{ fontSize: ".82rem", margin: 0 }}>
        For demonstrations only. The logo and details stay in this browser — nothing is uploaded or saved to Culturosity, and nothing is published.
      </p>
    </div>
  );

  return (
    <Wrap>
      <PageHeader title="Preview" eyebrow="Admin Research & Sales">
        <button type="button" className="btn btn-ghost" onClick={() => setPresent((v) => !v)}>
          {present ? "Show controls" : "Presentation view"}
        </button>
      </PageHeader>
      {!present ? (
        <p className="muted" style={{ marginTop: 0, maxWidth: 760 }}>
          Show a prospect their own branded perks app. Add their logo and colours and watch the phone and tablet update live. Tap through the screens on
          either device; both stay in step.
        </p>
      ) : null}
      <div className={`bp-layout ${present ? "bp-present" : ""}`}>
        {!present ? controls : null}
        <div className="bp-stage">
          <div className="bp-stage-bar">
            <div className="segmented" role="group" aria-label="Screen">
              {(["about", "perks", "details"] as const).map((s) => (
                <button key={s} type="button" aria-pressed={screen === s} onClick={() => setScreen(s)}>
                  {s === "perks" ? "Perks" : s === "details" ? "Details" : "About"}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSeed((n) => n + 1)}>Shuffle perks</button>
          </div>
          <DevicePreview brand={brand} seed={seed} screen={screen} setScreen={setScreen} maxZoom={present ? 1.3 : 1} />
          <p className="muted" style={{ fontSize: ".8rem", textAlign: "center", margin: 0 }}>Sample perks from the Culturosity catalogue, shown for illustration.</p>
        </div>
      </div>
    </Wrap>
  );
}

// ======================= Service queue =======================
export function ServiceQueuePage() {
  useDocumentTitle("Service queue");
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["internal", "services", status], queryFn: () => api.get(`/internal/service-requests${qs({ status })}`) });
  const [open, setOpen] = useState<any>(null);
  return (
    <Wrap>
      <PageHeader title="Service queue" eyebrow="Culturosity Management Services" />
      <div className="segmented" role="group" aria-label="Status" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        {["", "new", "contacted", "scoping", "proposal_sent", "won", "closed"].map((s) => (
          <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>{s ? s.replace("_", " ") : "All"}</button>
        ))}
      </div>
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}
      {data && !data.requests.length ? <EmptyState title="No requests" /> : null}
      {data?.requests.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Organization</th><th>Approach</th><th>Needs</th><th>Status</th><th>Owner</th><th>Received</th></tr></thead>
            <tbody>
              {data.requests.map((r: any) => (
                <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                  <td><strong>{r.organization_name}</strong>{r.is_demo ? <span className="badge badge-demo" style={{ marginLeft: 6 }}>Demo</span> : null}<div className="muted" style={{ fontSize: ".82rem" }}>{r.contact_name} · {r.contact_email}</div></td>
                  <td>{r.approach?.replace("_", " ")}</td>
                  <td style={{ fontSize: ".85rem" }}>{r.service_needs.join("; ")}</td>
                  <td><span className="badge">{r.status.replace("_", " ")}</span></td>
                  <td>{r.owner_email ?? "—"}</td>
                  <td>{new Date(r.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.organization_name ?? "Request"}>
        {open ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              try {
                await api.patch(`/internal/service-requests/${open.id}`, Object.fromEntries(fd.entries()));
                toast("Request updated");
                qc.invalidateQueries({ queryKey: ["internal", "services"] });
                setOpen(null);
              } catch (x: any) {
                toast(x.message, "error");
              }
            }}
          >
            <div className="panel" style={{ marginBottom: 14 }}>
              <p><strong>Contact:</strong> {open.contact_name} · <a href={`mailto:${open.contact_email}`}>{open.contact_email}</a></p>
              <p><strong>Members:</strong> {open.approx_member_count ?? "—"} · <strong>Coverage:</strong> {open.coverage || "—"} · <strong>Launch:</strong> {open.target_launch || "—"}</p>
              <p style={{ whiteSpace: "pre-line" }}>{open.message}</p>
            </div>
            <SelectField label="Status" name="status" defaultValue={open.status}>
              {["new", "contacted", "scoping", "proposal_sent", "won", "closed"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </SelectField>
            <TextField label="Owner (admin email)" name="ownerEmail" defaultValue={open.owner_email ?? ""} />
            <TextField label="Next step" name="nextStep" defaultValue={open.next_step} />
            <TextArea label="Notes" name="notes" defaultValue={open.notes} />
            <button className="btn btn-dark">Save</button>
          </form>
        ) : null}
      </Drawer>
    </Wrap>
  );
}

// ======================= Client workspaces / entitlements =======================
export function WorkspacesPage() {
  useDocumentTitle("Client workspaces");
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["internal", "orgs"], queryFn: () => api.get("/internal/orgs") });
  const superAdmin = me?.grants?.includes("super_admin");
  return (
    <Wrap>
      <PageHeader title="Client workspaces" eyebrow="Operations" />
      {!superAdmin ? <div className="alert alert-info" style={{ marginBottom: 12 }}>Sales admins see demo workspaces only.</div> : null}
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}
      {data ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Workspace</th><th>Status</th><th>Members</th><th>Live offers</th><th>Delivery</th><th>Licensed Culturosity programs</th><th /></tr></thead>
            <tbody>
              {data.orgs.map((o: any) => (
                <tr key={o.id}>
                  <td><strong>{o.name}</strong> {o.is_demo ? <span className="badge badge-demo">Demo</span> : null}<div className="muted" style={{ fontSize: ".8rem" }}>{o.kind}</div></td>
                  <td>
                    <span className={`badge ${o.status === "suspended" ? "badge-paused" : "badge-mint"}`}>{o.status === "suspended" ? "Paused" : o.status === "active" ? "Active" : o.status}</span>
                  </td>
                  <td>{o.members}</td>
                  <td>{o.offers}</td>
                  <td>{o.delivery_preference?.replace("_", " ") ?? "—"}</td>
                  <td>
                    {o.kind === "client" && superAdmin
                      ? data.culturosityPrograms.map((p: any) => {
                          const has = o.entitlements.some((e: any) => e.source_program_id === p.id);
                          return (
                            <label key={p.id} className="check" style={{ minHeight: 32, padding: 0 }}>
                              <input
                                type="checkbox"
                                checked={has}
                                onChange={async () => {
                                  try {
                                    await api.post("/internal/entitlements", { orgId: o.id, sourceProgramId: p.id, revoke: has });
                                    qc.invalidateQueries({ queryKey: ["internal", "orgs"] });
                                    toast(has ? "Entitlement revoked" : "Entitlement granted");
                                  } catch (e: any) {
                                    toast(e.message, "error");
                                  }
                                }}
                              />
                              <span style={{ fontSize: ".85rem" }}>{p.name}</span>
                            </label>
                          );
                        })
                      : "—"}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <Link className="btn btn-ghost btn-sm" to={`/app/${o.slug}/manage`}>Open</Link>
                      {o.kind === "client" && superAdmin ? (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={async () => {
                              const pause = o.status !== "suspended";
                              if (pause && !confirm(`Pause ${o.name}? Everyone in it, including its owner, loses access until you resume it.`)) return;
                              try {
                                await api.post(`/orgs/${o.slug}/pause`, { paused: pause });
                                qc.invalidateQueries({ queryKey: ["internal", "orgs"] });
                                toast(pause ? `${o.name} paused` : `${o.name} resumed`);
                              } catch (e: any) {
                                toast(e.message, "error");
                              }
                            }}
                          >
                            {o.status === "suspended" ? "Resume" : "Pause"}
                          </button>
                          <Link className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} to={`/app/${o.slug}/manage/settings`}>
                            Delete…
                          </Link>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Wrap>
  );
}

export function AccessSettingsPage() {
  useDocumentTitle("Access settings");
  const { data: me } = useMe();
  const toast = useToast();
  const [f, setF] = useState({ currentCode: "", newCode: "" });
  if (!me?.grants?.includes("super_admin")) return <Wrap><EmptyState title="Super admin only" /></Wrap>;
  return (
    <Wrap>
      <PageHeader title="Access settings" eyebrow="Operations" />
      <form
        className="panel"
        style={{ maxWidth: 520 }}
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post("/internal/gate/rotate", f);
            setF({ currentCode: "", newCode: "" });
            toast("Access code rotated. Other unlocked sessions were locked.");
          } catch (x: any) {
            toast(x.message, "error");
          }
        }}
      >
        <h2 style={{ fontSize: "1.1rem" }}>Rotate the numerical access code</h2>
        <p className="muted" style={{ fontSize: ".88rem" }}>The code is stored only as a hash. Rotation takes effect immediately; no rebuild needed.</p>
        <TextField label="Current code" type="password" inputMode="numeric" autoComplete="off" value={f.currentCode} onChange={(e) => setF({ ...f, currentCode: e.target.value.replace(/\D/g, "") })} />
        <TextField label="New code (6–20 digits)" type="password" inputMode="numeric" autoComplete="off" value={f.newCode} onChange={(e) => setF({ ...f, newCode: e.target.value.replace(/\D/g, "") })} />
        <button className="btn btn-dark">Rotate code</button>
      </form>
      <NotificationSettings />
    </Wrap>
  );
}

/** Owner setting: who is emailed about new Request a Proposal submissions. */
function NotificationSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery<any>({ queryKey: ["internal", "notify"], queryFn: () => api.get("/internal/settings/notifications") });
  const [value, setValue] = useState<string | null>(null);
  const [err, setErr] = useState<string | undefined>();
  if (!data) return null;
  const v = value ?? data.serviceNotificationEmail;
  return (
    <form
      className="panel"
      style={{ maxWidth: 520, marginTop: 20 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(undefined);
        try {
          await api.put("/internal/settings/notifications", { serviceNotificationEmail: v });
          setValue(null);
          await qc.invalidateQueries({ queryKey: ["internal", "notify"] });
          toast("Notification settings saved");
        } catch (x) {
          setErr((x as ApiError).fields?.serviceNotificationEmail ?? (x as Error).message);
        }
      }}
    >
      <h2 style={{ fontSize: "1.1rem" }}>Proposal request notifications</h2>
      <p className="muted" style={{ fontSize: ".88rem" }}>
        Each new Request a Proposal is saved to the Service queue and emailed here, with replies going straight to the person who asked. They also get an
        automatic “we received your request” confirmation.
      </p>
      <TextField
        label="Send notifications to"
        value={v}
        onChange={(e) => setValue(e.target.value)}
        error={err}
        placeholder="Leave empty to notify the super admins"
        hint="One address, or up to 5 separated by commas."
      />
      <p className="muted" style={{ fontSize: ".85rem" }}>
        Currently notifying: <strong>{data.effectiveRecipients.join(", ") || "nobody"}</strong>
        {data.serviceNotificationEmail ? "" : " (super admins, because no address is set)"}.
        {data.emailConfigured ? "" : " Email isn’t connected, so nothing is sent yet."}
      </p>
      <button className="btn btn-dark">Save</button>
    </form>
  );
}

export function useInternalParams() {
  return useParams();
}

/** Delete another super admin's account. Asks for the current super admin's password. */
function DeleteAdminAccount({ id, email, onDone }: { id: string; email: string; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} onClick={() => setOpen(true)}>
        Delete account…
      </button>
    );
  return (
    <form
      style={{ display: "grid", gap: 8, minWidth: 220 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(undefined);
        setBusy(true);
        try {
          await api.post(`/internal/team/${id}/delete-account`, { password });
          toast(`${email} was deleted`);
          onDone();
        } catch (x) {
          setErr((x as ApiError).fields?.password ?? (x as Error).message);
          setBusy(false);
        }
      }}
    >
      <div style={{ fontSize: ".82rem" }}>
        Permanently delete <strong>{email}</strong> and its admin access? This can’t be undone.
      </div>
      <TextField label="Your password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={err} autoComplete="current-password" required />
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-danger btn-sm" disabled={busy || !password}>{busy ? "Deleting…" : "Delete account"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function SalesTeamPage() {
  useDocumentTitle("Sales team");
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["internal", "team"], queryFn: () => api.get("/internal/team"), enabled: Boolean(me?.grants?.includes("super_admin")) });
  const [email, setEmail] = useState("");
  const [emailErr, setEmailErr] = useState<string | undefined>();
  const [created, setCreated] = useState<{ email: string; link: string; expiresAt: string; emailed: boolean; emailConfigured?: boolean; emailError?: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["internal", "team"] });
  if (!me?.grants?.includes("super_admin")) return <Wrap><EmptyState title="Super admin only" /></Wrap>;

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Link copied");
    } catch {
      toast("Select the link to copy it", "error");
    }
  }

  return (
    <Wrap>
      <PageHeader title="Sales team" eyebrow="Operations" />
      <p className="muted" style={{ maxWidth: 720, marginTop: 0 }}>
        Salespeople get Admin Research &amp; Sales only — Overview, Research Directory, Sales Outreach, Pipeline, Demo Guide and the Service queue. They
        can’t see the catalogue, client workspaces or settings, and they still need the access code to open the area.
      </p>
      <div className="grid-2" style={{ alignItems: "start" }}>
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setEmailErr(undefined);
            try {
              const r = await api.post<{ link: string; expiresAt: string; emailed: boolean; emailConfigured?: boolean; emailError?: string }>("/internal/team/invitations", { email });
              setCreated({ email, ...r });
              setEmail("");
              refresh();
            } catch (x) {
              setEmailErr((x as ApiError).fields?.email ?? (x as Error).message);
            }
          }}
        >
          <h2 style={{ fontSize: "1.15rem", marginTop: 0 }}>Add a salesperson</h2>
          <TextField label="Their email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={emailErr} required />
          <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }}>Create sign-up link</button>
          {created ? (
            <div className="alert alert-success" role="status" style={{ marginTop: 14, display: "grid", gap: 8 }}>
              <div>
                Sign-up link for <strong>{created.email}</strong> — valid until {new Date(created.expiresAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}, works once.
                {created.emailed ? " Resend accepted the email, so it’s on its way to them." : created.emailConfigured ? "" : " Email isn’t connected yet, so send it to them yourself."}
              </div>
              {created.emailConfigured && !created.emailed ? (
                <div className="alert alert-warning" style={{ margin: 0 }}>
                  The email couldn’t be sent{created.emailError ? ` — ${created.emailError}` : ""}. Send the link below yourself.
                </div>
              ) : null}
              <code style={{ overflowWrap: "anywhere", fontSize: ".85rem" }}>{created.link}</code>
              <div><button type="button" className="btn btn-dark btn-sm" onClick={() => copy(created.link)}>Copy link</button></div>
              <div className="muted" style={{ fontSize: ".82rem" }}>For security the link is shown only now. If it’s lost, create a new one — the old one stops working.</div>
            </div>
          ) : null}
        </form>

        <section className="panel">
          <h2 style={{ fontSize: "1.15rem", marginTop: 0 }}>People with admin access</h2>
          {error ? <ErrorAlert error={error} /> : null}
          {isLoading ? <Spinner /> : null}
          {data ? (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Person</th><th>Access</th><th /></tr></thead>
                <tbody>
                  {data.team.map((t: any) => (
                    <tr key={`${t.id}-${t.grant_name}`}>
                      <td><div style={{ fontWeight: 600 }}>{t.display_name}</div><div className="muted" style={{ fontSize: ".85rem" }}>{t.email}</div></td>
                      <td>{t.grant_name === "super_admin" ? "Super admin" : "Salesperson"}</td>
                      <td>
                        {t.grant_name === "sales_admin" ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={async () => {
                              if (!confirm(`Remove ${t.email} from the sales team? They lose access immediately.`)) return;
                              try {
                                await api.post(`/internal/team/${t.id}/remove`);
                                toast("Access removed");
                                refresh();
                              } catch (e: any) {
                                toast(e.message, "error");
                              }
                            }}
                          >
                            Remove
                          </button>
                        ) : t.email === me?.user?.email ? (
                          <span className="muted" style={{ fontSize: ".82rem" }}>You</span>
                        ) : (
                          <DeleteAdminAccount id={t.id} email={t.email} onDone={refresh} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {data?.invitations.length ? (
            <>
              <h3 style={{ fontSize: "1rem", marginTop: 18 }}>Unused sign-up links</h3>
              <ul style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
                {data.invitations.map((i: any) => (
                  <li key={i.id}>
                    {i.email} <span className="muted">· expires {new Date(i.expires_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</span>{" "}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={async () => {
                        await api.del(`/internal/team/invitations/${i.id}`);
                        toast("Link cancelled");
                        refresh();
                      }}
                    >
                      Cancel link
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </Wrap>
  );
}

export { TutorialPage } from "../components/Tutorial";
