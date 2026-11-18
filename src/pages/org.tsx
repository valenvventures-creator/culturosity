import { useState } from "react";
import { Link, Navigate, Outlet, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, qs } from "../lib/api";
import { useMe } from "../lib/session";
import { AppShell, PageHeader, type NavSection } from "../components/AppShell";
import { CatalogueView } from "../components/Catalogue";
import { PerkDetailPage } from "../components/PerkDetail";
import { PerkForm } from "../components/PerkForm";
import { BarChart, Checkbox, DemoBadge, Drawer, EmptyState, ErrorAlert, Modal, SelectField, Spinner, Stat, StatusPill, TextArea, TextField, useDocumentTitle, useToast } from "../components/ui";
import { ServiceRequestForm } from "./public";
import { formatWindow } from "@shared/time";
import { parseCsvObjects } from "@shared/csv";

export function useOrg(slug: string) {
  return useQuery<any>({ queryKey: ["org", slug], queryFn: () => api.get(`/orgs/${slug}`), retry: false });
}

// ======================= Member portal =======================
export function OrgPortalPage() {
  const { orgSlug = "" } = useParams();
  const { data, isLoading, error } = useOrg(orgSlug);
  const { data: me } = useMe();
  useDocumentTitle(data?.org?.program_display_name ?? data?.org?.name ?? "Program");
  if (isLoading) return <div className="container page"><Spinner /></div>;
  if (error) return <div className="container page"><ErrorAlert error={error} title="Workspace unavailable." /></div>;
  const org = data.org;
  const canManage = ["owner", "admin", "provider_manager"].includes(data.role) || data.elevated;
  const isMember = (me?.programs ?? []).some((p) => p.org_slug === orgSlug);
  return (
    <div className="container page">
      <section className="org-hero">
        <div className="accent-bar" style={{ background: org.accent_color || "var(--brand-mint)" }} />
        <div className="spread">
          <div className="row" style={{ gap: 16 }}>
            {org.logo_url ? <img src={org.logo_url} alt={`${org.name} logo`} style={{ height: 56, width: "auto", borderRadius: 10, background: "#fff", padding: 6 }} /> : null}
            <div>
              <div className="eyebrow" style={{ color: org.accent_color || undefined }}>{org.name} {org.is_demo ? <DemoBadge /> : null}</div>
              <h1 style={{ fontSize: "clamp(1.6rem,3.4vw,2.4rem)", margin: "4px 0" }}>{org.program_display_name || `${org.name} Perks`}</h1>
              {org.welcome_copy ? <p className="muted" style={{ margin: 0, maxWidth: 640 }}>{org.welcome_copy}</p> : null}
            </div>
          </div>
          <div className="row">
            <Link className="btn btn-ghost" to={`/app/${orgSlug}/submit-perk`}>Submit a Perk</Link>
            {canManage ? <Link className="btn btn-lime" to={`/app/${orgSlug}/manage`}>Manage program</Link> : null}
          </div>
        </div>
        <p className="muted" style={{ fontSize: ".8rem", margin: "14px 0 0" }}>Powered by Culturosity</p>
      </section>
      {isMember ? (
        <CatalogueView endpoint="/catalogue" scope={`org:${orgSlug}`} signedIn heading={`${org.name} perks`} detailHref={(p) => `/app/${orgSlug}/perks/${p.id}`} />
      ) : (
        <EmptyState title="You're not in a member program here">
          {canManage ? <>As an administrator you can manage offers. <Link to={`/app/${orgSlug}/manage/members`}>Add yourself to a program</Link> to browse as a member.</> : "Ask your administrator for access."}
        </EmptyState>
      )}
    </div>
  );
}

export function OrgPerkRoute() {
  const { orgSlug = "", perkId = "" } = useParams();
  const { data: me } = useMe();
  // Prefer the program in this workspace; the server still verifies membership and distribution.
  const progs = (me?.programs ?? []).filter((p) => p.org_slug === orgSlug);
  if (!me) return <div className="container page"><Spinner /></div>;
  return <PerkDetailPage perkId={perkId} programId={progs.length === 1 ? progs[0].program_id : undefined} backTo={`/app/${orgSlug}`} backLabel="Program perks" />;
}

export function OrgSubmitPage() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Submit a Perk");
  return (
    <div className="page page-light surface-light">
      <div className="container" style={{ maxWidth: 980 }}>
        <PageHeader title="Submit a Perk" eyebrow="Company program" back={{ to: `/app/${orgSlug}`, label: "Program" }} />
        <PerkForm presetOrgSlug={orgSlug} />
      </div>
    </div>
  );
}

// ======================= Manage layout =======================
export function ManageLayout() {
  const { orgSlug = "" } = useParams();
  const { data, isLoading, error } = useOrg(orgSlug);
  if (isLoading) return <div className="container page"><Spinner /></div>;
  if (error || !data) return <div className="container page"><ErrorAlert error={error} title="You don't have access to manage this workspace." /></div>;
  const role = data.role as string;
  const isAdmin = role === "owner" || role === "admin" || data.elevated;
  if (!isAdmin && role !== "provider_manager") return <Navigate to={`/app/${orgSlug}`} replace />;
  const b = `/app/${orgSlug}/manage`;
  const sections: NavSection[] = [
    { title: "Program", items: [{ to: b, label: "Dashboard", end: true }, { to: `${b}/offers`, label: "Offers" }, { to: `/app/${orgSlug}/submit-perk`, label: "Submit a Perk" }] },
  ];
  if (isAdmin) {
    sections[0].items.push({ to: `${b}/review`, label: "Review queue" }, { to: `${b}/licensed`, label: "Culturosity offers" }, { to: `${b}/import`, label: "Import / export" });
    sections.push(
      { title: "People", items: [{ to: `${b}/members`, label: "Members & roles" }, { to: `${b}/providers`, label: "Providers" }, { to: `${b}/programs`, label: "Programs & groups" }] },
      { title: "Insights", items: [{ to: `${b}/reports`, label: "Reports" }] },
      { title: "Workspace", items: [{ to: `${b}/branding`, label: "Branding" }, { to: `${b}/launch`, label: "Launch materials" }, { to: `${b}/services`, label: "Management Services" }] },
    );
  } else {
    sections[0].items.push({ to: `${b}/providers`, label: "My providers" }, { to: "/provider/verify", label: "Verify redemptions" });
  }
  return (
    <AppShell
      sections={sections}
      header={
        <div style={{ padding: "0 12px 16px" }}>
          <div className="eyebrow">{role === "provider_manager" ? "Provider manager" : "Administration"}</div>
          <div style={{ fontWeight: 600 }}>{data.org.name}</div>
          {data.org.is_demo ? <DemoBadge /> : null}
          <div style={{ marginTop: 8 }}>
            <Link to={`/app/${orgSlug}`} style={{ fontSize: ".85rem" }}>View member portal →</Link>
          </div>
        </div>
      }
    />
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="container page">{children}</div>;
}

// ======================= Dashboard =======================
export function ManageDashboard() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Dashboard");
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["dash", orgSlug], queryFn: () => api.get(`/orgs/${orgSlug}/dashboard`) });
  const org = useOrg(orgSlug).data;
  if (isLoading) return <Wrap><Spinner /></Wrap>;
  if (error) return <Wrap><ErrorAlert error={error} /></Wrap>;
  const days: Record<string, Record<string, number>> = {};
  for (const r of data.daily) (days[r.day] ??= {})[r.event] = r.n;
  const chart = Object.entries(days).map(([label, values]) => ({ label, values }));
  return (
    <Wrap>
      <PageHeader title={org?.org?.name ?? "Dashboard"} eyebrow="Dashboard">
        <Link className="btn btn-primary" to={`/app/${orgSlug}/submit-perk`}>Submit a Perk</Link>
      </PageHeader>
      {data.isDemo ? <div className="alert alert-warning" style={{ marginBottom: 16 }}>Demo workspace — figures include synthetic demo activity and are excluded from production totals.</div> : null}
      <div className="stats">
        <Stat label="Live offers" value={data.offers.live} />
        <Stat label="Scheduled offers" value={data.offers.scheduled} />
        <Stat label="Active members" value={data.activeMembers} />
        <Stat label="Offer views (30 days)" value={data.last30.perkViews} />
        <Stat label="Use Perk clicks (30 days)" value={data.last30.usePerkClicks} hint="Clicks are not proof of purchase." />
        <Stat label="Verified redemptions (30 days)" value={data.last30.redemptionsVerified} hint="Confirmed by a provider on the server." />
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <h2 style={{ fontSize: "1.1rem" }}>Engagement — last 14 days</h2>
          {chart.length ? (
            <BarChart
              title="Daily offer views, Use Perk clicks and verified redemptions"
              data={chart}
              series={[
                { key: "perk_view", label: "Views", color: "#0a6b51" },
                { key: "use_perk_click", label: "Use Perk clicks", color: "#9cc21a" },
                { key: "redemption_verified", label: "Verified redemptions", color: "#b5005d" },
              ]}
            />
          ) : (
            <p className="muted">No measured activity yet.</p>
          )}
        </section>
        <section className="panel">
          <h2 style={{ fontSize: "1.1rem" }}>Needs attention</h2>
          <ul className="checklist">
            <li>{data.pendingReviews} submission(s) awaiting review {data.pendingReviews ? <Link to={`/app/${orgSlug}/manage/review`}>Review →</Link> : null}</li>
            <li>{data.offers.paused} paused · {data.offers.drafts} draft · {data.offers.expired} expired offer(s)</li>
            {data.expiringSoon.map((p: any) => (
              <li key={p.id}>
                <strong>{p.provider_name}</strong> — {p.title} ends {new Date(p.ends_at).toLocaleDateString()}
              </li>
            ))}
          </ul>
          <hr className="divider" />
          <h3 style={{ fontSize: "1rem" }}>Culturosity Management Services</h3>
          <p className="muted">Short on time? Our team can populate, maintain and renew offers for you.</p>
          <Link className="btn btn-ghost btn-sm" to={`/app/${orgSlug}/manage/services`}>Have Culturosity Manage It</Link>
        </section>
      </div>
    </Wrap>
  );
}

// ======================= Offers =======================
export function ManageOffers() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Offers");
  const [status, setStatus] = useState("");
  const toast = useToast();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["manage-perks", orgSlug, status], queryFn: () => api.get(`/orgs/${orgSlug}/perks${qs({ status })}`) });
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      action === "duplicate" ? api.post(`/orgs/${orgSlug}/perks/${id}/duplicate`) : api.post(`/orgs/${orgSlug}/perks/${id}/status`, { action }),
    onSuccess: (r: any, v) => {
      qc.invalidateQueries({ queryKey: ["manage-perks"] });
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      toast(v.action === "duplicate" ? "Duplicated as a draft" : `Offer ${r.status?.replace("_", " ")}`);
      if (v.action === "duplicate" && r.perkId) nav(`/app/${orgSlug}/manage/offers/${r.perkId}`);
    },
    onError: (e: any) => toast(e.message, "error"),
  });
  return (
    <Wrap>
      <PageHeader title="Offers" eyebrow="Program">
        <Link className="btn btn-primary" to={`/app/${orgSlug}/submit-perk`}>Submit a Perk</Link>
      </PageHeader>
      <div className="segmented" role="group" aria-label="Filter by status" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        {["", "published", "scheduled", "paused", "draft", "expired", "archived"].map((s) => (
          <button key={s} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {s ? s[0].toUpperCase() + s.slice(1) : "All"}
          </button>
        ))}
      </div>
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}
      {data && !data.perks.length ? <EmptyState title="No offers here yet" action={<Link className="btn btn-primary" to={`/app/${orgSlug}/submit-perk`}>Submit a Perk</Link>} /> : null}
      {data?.perks.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Provider / offer</th>
                <th>Value</th>
                <th>Availability</th>
                <th>Status</th>
                <th>Verified</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.perks.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.provider_name}</div>
                    <Link to={`/app/${orgSlug}/manage/offers/${p.id}`}>{p.title}</Link> {p.is_demo ? <DemoBadge /> : null}
                    <div className="muted" style={{ fontSize: ".8rem" }}>{p.programs.map((x: any) => x.name).join(", ") || "Not distributed"}</div>
                  </td>
                  <td><span className="badge badge-value">{p.value_label}</span></td>
                  <td style={{ whiteSpace: "nowrap" }}>{formatWindow(p.starts_at, p.ends_at, p.is_ongoing, p.timezone)}</td>
                  <td><StatusPill status={p.effective_status} /></td>
                  <td>{p.verified_redemptions}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <Link className="btn btn-ghost btn-sm" to={`/app/${orgSlug}/manage/offers/${p.id}`}>Edit</Link>
                      {["published", "scheduled"].includes(p.effective_status) ? <button className="btn btn-ghost btn-sm" onClick={() => act.mutate({ id: p.id, action: "pause" })}>Pause</button> : null}
                      {["paused", "draft"].includes(p.effective_status) ? <button className="btn btn-ghost btn-sm" onClick={() => act.mutate({ id: p.id, action: "publish" })}>Publish</button> : null}
                      <button className="btn btn-ghost btn-sm" onClick={() => act.mutate({ id: p.id, action: "duplicate" })}>Duplicate</button>
                      {p.effective_status !== "archived" ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => confirm("Archive this offer? It stays in history and reports.") && act.mutate({ id: p.id, action: "archive" })}>
                          Archive
                        </button>
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

export function ManageOfferEdit() {
  const { orgSlug = "", perkId = "" } = useParams();
  useDocumentTitle("Edit offer");
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["manage-perk", orgSlug, perkId], queryFn: () => api.get(`/orgs/${orgSlug}/perks/${perkId}`) });
  if (isLoading) return <Wrap><Spinner /></Wrap>;
  if (error) return <Wrap><ErrorAlert error={error} /></Wrap>;
  return (
    <Wrap>
      <PageHeader title="Edit offer" eyebrow={<StatusPill status={data.perk.effective_status} />} back={{ to: `/app/${orgSlug}/manage/offers`, label: "Offers" }} />
      <div className="alert alert-info" style={{ marginBottom: 16 }}>
        Provider QR identity: <strong>{data.perk.provider_ref}</strong>
        {data.perk.provider_pos_reference ? <> · POS reference: <strong>{data.perk.provider_pos_reference}</strong></> : null}. Generated by Culturosity and linked to the provider record.
      </div>
      <PerkForm edit={{ orgSlug, perkId, form: data.form, status: data.perk.effective_status }} />
    </Wrap>
  );
}

// ======================= Review queue =======================
export function ManageReview() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Review queue");
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["review", orgSlug], queryFn: () => api.get(`/orgs/${orgSlug}/submissions`) });
  async function decide(decision: "approve" | "reject") {
    try {
      const r = await api.post(`/orgs/${orgSlug}/submissions/${open.id}/${decision}`, { notes });
      toast(decision === "approve" ? `Approved — ${r.status}` : "Rejected");
      setOpen(null);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["review"] });
      qc.invalidateQueries({ queryKey: ["catalogue"] });
    } catch (e: any) {
      toast(e.message, "error");
    }
  }
  return (
    <Wrap>
      <PageHeader title="Review queue" eyebrow="Program" />
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}
      {data && !data.submissions.length ? <EmptyState title="Nothing to review">Submissions from members, providers and the public appear here.</EmptyState> : null}
      <div style={{ display: "grid", gap: 10 }}>
        {(data?.submissions ?? []).map((s: any) => (
          <button key={s.id} className="panel" style={{ textAlign: "left", cursor: "pointer", font: "inherit" }} onClick={() => setOpen(s)}>
            <div className="spread">
              <div>
                <strong>{s.payload.provider?.name}</strong> — {s.payload.title}
                <div className="muted" style={{ fontSize: ".85rem" }}>
                  From {s.submitter_name} ({s.submitter_email}) · {new Date(s.created_at).toLocaleString()} · {s.program_name}
                </div>
              </div>
              <StatusPill status="pending_review" />
            </div>
          </button>
        ))}
      </div>
      <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title="Review submission">
        {open ? (
          <div className="stack">
            <div className="panel">
              <div className="eyebrow">{open.payload.provider?.name}</div>
              <h3>{open.payload.title}</h3>
              <p>{open.payload.fullDescription}</p>
              <p className="muted">Redemption: {open.payload.redemption?.method} · {open.payload.redemption?.url ?? "in person"}</p>
              <p className="muted">{open.payload.redemption?.instructions}</p>
              <p className="muted">Eligible: {open.payload.eligibility?.groups}</p>
              <p className="muted">Submitter organization: {open.submitter_org_text || "—"} · Authority confirmed</p>
            </div>
            <TextArea label="Review notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="row">
              <button className="btn btn-primary" onClick={() => decide("approve")}>Approve &amp; publish</button>
              <button className="btn btn-ghost" onClick={() => decide("reject")}>Reject</button>
            </div>
          </div>
        ) : null}
      </Drawer>
    </Wrap>
  );
}

// ======================= Members =======================
export function ManageMembers() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Members & roles");
  const qc = useQueryClient();
  const toast = useToast();
  const org = useOrg(orgSlug).data;
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["members", orgSlug], queryFn: () => api.get(`/orgs/${orgSlug}/members`) });
  const [invite, setInvite] = useState({ email: "", role: "member", programId: "" });
  const [inviteErr, setInviteErr] = useState<Record<string, string>>({});
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["members", orgSlug] });
  async function change(id: string, body: any) {
    try {
      await api.patch(`/orgs/${orgSlug}/members/${id}`, body);
      toast("Member updated");
      refresh();
    } catch (e: any) {
      toast(e.message, "error");
    }
  }
  return (
    <Wrap>
      <PageHeader title="Members & roles" eyebrow="People" />
      {error ? <ErrorAlert error={error} /> : null}
      <div className="grid-2">
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setInviteErr({});
            try {
              const r = await api.post(`/orgs/${orgSlug}/invitations`, { ...invite, programId: invite.programId || null });
              toast(`Invitation sent to ${invite.email}`);
              setLastLink(r.inviteUrl ?? null);
              setInvite({ ...invite, email: "" });
              refresh();
            } catch (x) {
              setInviteErr((x as ApiError).fields ?? { email: (x as Error).message });
            }
          }}
        >
          <h2 style={{ fontSize: "1.1rem" }}>Invite someone</h2>
          <TextField label="Email" type="email" required value={invite.email} error={inviteErr.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <div className="grid-2">
            <SelectField label="Role" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              <option value="member">Member</option>
              <option value="provider_manager">Provider manager</option>
              <option value="admin">Administrator</option>
              <option value="owner">Owner</option>
            </SelectField>
            <SelectField label="Program" value={invite.programId} onChange={(e) => setInvite({ ...invite, programId: e.target.value })}>
              <option value="">Default program</option>
              {(org?.programs ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
          </div>
          <button className="btn btn-dark">Send invitation</button>
          {lastLink ? <p className="muted" style={{ marginTop: 10, fontSize: ".85rem" }}>Demo invitation link: <Link to={lastLink}>{lastLink}</Link></p> : null}
        </form>
        <div className="panel">
          <h2 style={{ fontSize: "1.1rem" }}>Approved enrollment</h2>
          <p className="muted" style={{ fontSize: ".9rem" }}>
            People who verify an email at an approved domain join as <strong>members</strong> only. Domain enrollment never grants admin rights.
          </p>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <TextField label="Email domain" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
            <button
              className="btn btn-ghost"
              style={{ marginBottom: 16 }}
              onClick={async () => {
                try {
                  await api.post(`/orgs/${orgSlug}/enrollment-rules`, { domain });
                  setDomain("");
                  refresh();
                  toast("Enrollment rule added");
                } catch (e: any) {
                  toast(e.message, "error");
                }
              }}
            >
              Add
            </button>
          </div>
          {(data?.enrollmentRules ?? []).map((r: any) => (
            <div key={r.id} className="spread" style={{ padding: "6px 0" }}>
              <span>@{r.email_domain}</span>
              <button className="btn btn-ghost btn-sm" onClick={async () => { await api.del(`/orgs/${orgSlug}/enrollment-rules/${r.id}`); refresh(); }}>Remove</button>
            </div>
          ))}
          <hr className="divider" />
          <Link to={`/app/${orgSlug}/manage/import`}>Bulk import members from CSV →</Link>
        </div>
      </div>
      {isLoading ? <Spinner /> : null}
      {data ? (
        <section style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Members ({data.members.length})</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Person</th><th>Role</th><th>Programs</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.members.map((m: any) => (
                  <tr key={m.id}>
                    <td><div style={{ fontWeight: 600 }}>{m.display_name}</div><div className="muted" style={{ fontSize: ".85rem" }}>{m.email}</div></td>
                    <td>
                      <label className="sr-only" htmlFor={`role-${m.id}`}>Role for {m.email}</label>
                      <select id={`role-${m.id}`} className="select" style={{ minHeight: 38 }} value={m.role} onChange={(e) => change(m.id, { role: e.target.value })}>
                        <option value="member">Member</option>
                        <option value="provider_manager">Provider manager</option>
                        <option value="admin">Administrator</option>
                        <option value="owner">Owner</option>
                      </select>
                    </td>
                    <td style={{ minWidth: 180 }}>
                      {(org?.programs ?? []).map((p: any) => (
                        <label key={p.id} className="check" style={{ minHeight: 32, padding: 0 }}>
                          <input
                            type="checkbox"
                            checked={m.program_ids.includes(p.id)}
                            onChange={(e) => change(m.id, { programIds: e.target.checked ? [...m.program_ids, p.id] : m.program_ids.filter((x: string) => x !== p.id) })}
                          />
                          <span style={{ fontSize: ".85rem" }}>{p.name}</span>
                        </label>
                      ))}
                    </td>
                    <td><StatusPill status={m.status === "active" ? "published" : "paused"} /> <span className="sr-only">{m.status}</span></td>
                    <td>
                      {m.status === "active" ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => change(m.id, { status: "suspended" })}>Suspend</button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => change(m.id, { status: "active" })}>Reactivate</button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => confirm(`Remove ${m.email}?`) && change(m.id, { status: "removed" })}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.invitations.length ? (
            <>
              <h3 style={{ fontSize: "1rem", marginTop: 16 }}>Pending invitations</h3>
              <ul>
                {data.invitations.map((i: any) => (
                  <li key={i.id}>
                    {i.email} — {i.role.replace("_", " ")} · expires {new Date(i.expires_at).toLocaleDateString()}{" "}
                    <button className="btn btn-ghost btn-sm" onClick={async () => { await api.del(`/orgs/${orgSlug}/invitations/${i.id}`); refresh(); }}>Revoke</button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </Wrap>
  );
}

// ======================= Providers =======================
export function ManageProviders() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Providers");
  const qc = useQueryClient();
  const toast = useToast();
  const { data: orgData } = useOrg(orgSlug);
  const isAdmin = ["owner", "admin"].includes(orgData?.role) || orgData?.elevated;
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["providers", orgSlug], queryFn: () => api.get(`/orgs/${orgSlug}/providers`) });
  const [adding, setAdding] = useState(false);
  const [np, setNp] = useState({ name: "", website: "", publicEmail: "", category: "" });
  const [edit, setEdit] = useState<any>(null);
  const [assignEmail, setAssignEmail] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["providers", orgSlug] });
  return (
    <Wrap>
      <PageHeader title="Providers" eyebrow="People">
        {isAdmin ? <button className="btn btn-primary" onClick={() => setAdding(true)}>Add provider</button> : null}
      </PageHeader>
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Provider</th><th>QR / POS reference</th><th>Offers</th><th>Next expiry</th><th>Managers</th><th /></tr></thead>
          <tbody>
            {(data?.providers ?? []).map((p: any) => (
              <tr key={p.id}>
                <td><div style={{ fontWeight: 600 }}>{p.name}</div><div className="muted" style={{ fontSize: ".82rem" }}>{p.website ?? ""} {p.public_email ?? ""}</div></td>
                <td><code>{p.provider_ref}</code>{p.pos_reference ? <div className="muted" style={{ fontSize: ".82rem" }}>POS: {p.pos_reference}</div> : null}</td>
                <td>{p.offer_count}</td>
                <td>{p.next_expiry ? new Date(p.next_expiry).toLocaleDateString() : "—"}</td>
                <td>{p.managers.map((m: any) => m.email).join(", ") || "—"}</td>
                <td>{isAdmin ? <button className="btn btn-ghost btn-sm" onClick={() => setEdit(p)}>Manage</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add provider">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post(`/orgs/${orgSlug}/providers`, np);
              setAdding(false);
              setNp({ name: "", website: "", publicEmail: "", category: "" });
              refresh();
              toast("Provider added — a unique QR identity was generated");
            } catch (x: any) {
              toast(x.message, "error");
            }
          }}
        >
          <TextField label="Name" required value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
          <TextField label="Website" type="url" value={np.website} onChange={(e) => setNp({ ...np, website: e.target.value })} />
          <TextField label="Public email" type="email" value={np.publicEmail} onChange={(e) => setNp({ ...np, publicEmail: e.target.value })} />
          <button className="btn btn-dark">Add provider</button>
        </form>
      </Modal>
      <Drawer open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.name ?? "Provider"}>
        {edit ? (
          <div className="stack">
            <div className="panel">
              <h3 style={{ fontSize: "1rem" }}>POS reference</h3>
              <p className="muted" style={{ fontSize: ".88rem" }}>
                Optional merchant discount reference already configured in the provider's POS. Confirm compatibility with the merchant before relying on it — Culturosity
                currently verifies redemptions on its own server (QR or manual code).
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const v = (e.currentTarget.elements.namedItem("pos") as HTMLInputElement).value;
                  await api.patch(`/orgs/${orgSlug}/providers/${edit.id}`, { posReference: v });
                  toast("POS reference saved");
                  refresh();
                }}
              >
                <TextField label="POS reference" name="pos" defaultValue={edit.pos_reference ?? ""} />
                <button className="btn btn-dark btn-sm">Save</button>
              </form>
            </div>
            <div className="panel">
              <h3 style={{ fontSize: "1rem" }}>Provider managers</h3>
              {edit.managers.map((m: any) => (
                <div className="spread" key={m.id}>
                  <span>{m.email}</span>
                  <button className="btn btn-ghost btn-sm" onClick={async () => { await api.del(`/orgs/${orgSlug}/providers/${edit.id}/assignments/${m.id}`); refresh(); setEdit(null); }}>Remove</button>
                </div>
              ))}
              <div className="row" style={{ alignItems: "flex-end", marginTop: 8 }}>
                <TextField label="Assign by member email" type="email" value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)} hint="They must already be a member of this workspace." />
                <button
                  className="btn btn-ghost"
                  style={{ marginBottom: 16 }}
                  onClick={async () => {
                    try {
                      await api.post(`/orgs/${orgSlug}/providers/${edit.id}/assignments`, { email: assignEmail });
                      setAssignEmail("");
                      refresh();
                      setEdit(null);
                      toast("Provider manager assigned");
                    } catch (e: any) {
                      toast(e.message, "error");
                    }
                  }}
                >
                  Assign
                </button>
              </div>
            </div>
            <div className="panel">
              <h3 style={{ fontSize: "1rem" }}>Locations</h3>
              {edit.locations.map((l: any) => <div key={l.id}>{[l.label, l.address_line, l.city, l.region].filter(Boolean).join(", ")}</div>)}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  await api.post(`/orgs/${orgSlug}/providers/${edit.id}/locations`, Object.fromEntries(fd.entries()));
                  refresh();
                  setEdit(null);
                  toast("Location added");
                }}
              >
                <div className="grid-2">
                  <TextField label="Label" name="label" />
                  <TextField label="Address" name="addressLine" />
                  <TextField label="City" name="city" />
                  <TextField label="Province / state" name="region" />
                </div>
                <button className="btn btn-ghost btn-sm">Add location</button>
              </form>
            </div>
          </div>
        ) : null}
      </Drawer>
    </Wrap>
  );
}

// ======================= Programs =======================
export function ManagePrograms() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Programs");
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useOrg(orgSlug);
  const [name, setName] = useState("");
  const [mod, setMod] = useState(false);
  return (
    <Wrap>
      <PageHeader title="Programs & member groups" eyebrow="People" />
      <div className="grid-2">
        <div className="panel">
          <h2 style={{ fontSize: "1.1rem" }}>Programs</h2>
          {(data?.programs ?? []).map((p: any) => (
            <div key={p.id} className="spread" style={{ padding: "10px 0", borderBottom: "1px solid #eee" }}>
              <div>
                <strong>{p.name}</strong> {p.is_default ? <span className="badge">Default</span> : null}
                <div className="muted" style={{ fontSize: ".85rem" }}>{p.moderation_required ? "Provider submissions reviewed" : "Trusted publishing"} · {p.status}</div>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  await api.patch(`/orgs/${orgSlug}/programs/${p.id}`, { moderationRequired: !p.moderation_required });
                  qc.invalidateQueries({ queryKey: ["org", orgSlug] });
                }}
              >
                {p.moderation_required ? "Turn off review" : "Require review"}
              </button>
            </div>
          ))}
        </div>
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post(`/orgs/${orgSlug}/programs`, { name, moderationRequired: mod });
              setName("");
              qc.invalidateQueries({ queryKey: ["org", orgSlug] });
              toast("Program created");
            } catch (x: any) {
              toast(x.message, "error");
            }
          }}
        >
          <h2 style={{ fontSize: "1.1rem" }}>Create a program or member group</h2>
          <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} hint="e.g. “Retirees”, “Head office”, “Union locals”." />
          <Checkbox label="Review provider-manager submissions before publishing" checked={mod} onChange={setMod} />
          <button className="btn btn-dark">Create</button>
        </form>
      </div>
    </Wrap>
  );
}

// ======================= Branding =======================
export function ManageBranding() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Branding");
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useOrg(orgSlug);
  const org = data?.org;
  const [f, setF] = useState<any>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (org && !f)
    setF({ programDisplayName: org.program_display_name ?? "", welcomeCopy: org.welcome_copy ?? "", accentColor: org.accent_color ?? "#57F6C3", contactName: org.contact_name ?? "", contactEmail: org.contact_email ?? "", coverage: org.coverage ?? "" });
  if (!f) return <Wrap><Spinner /></Wrap>;
  return (
    <Wrap>
      <PageHeader title="Branding" eyebrow="Workspace" />
      <div className="grid-2">
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setErrors({});
            try {
              await api.patch(`/orgs/${orgSlug}`, f);
              qc.invalidateQueries({ queryKey: ["org", orgSlug] });
              toast("Branding saved");
            } catch (x) {
              setErrors((x as ApiError).fields ?? {});
              toast((x as Error).message, "error");
            }
          }}
        >
          <TextField label="Program name" value={f.programDisplayName} onChange={(e) => setF({ ...f, programDisplayName: e.target.value })} />
          <TextArea label="Welcome message" value={f.welcomeCopy} onChange={(e) => setF({ ...f, welcomeCopy: e.target.value })} />
          <div className="row" style={{ alignItems: "flex-end" }}>
            <TextField label="Accent colour" value={f.accentColor} error={errors.accentColor} onChange={(e) => setF({ ...f, accentColor: e.target.value })} hint="Must have at least 4.5:1 contrast on the dark interface." />
            <input type="color" aria-label="Pick accent colour" value={f.accentColor} onChange={(e) => setF({ ...f, accentColor: e.target.value.toUpperCase() })} style={{ width: 52, height: 46, marginBottom: 16, border: 0, background: "none" }} />
          </div>
          <div className="field">
            <span className="label">Logo</span>
            <label className="btn btn-ghost" style={{ cursor: "pointer", width: "fit-content" }}>
              Upload logo
              <input
                type="file"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append("file", file);
                  fd.append("orgId", org.id);
                  fd.append("alt", `${org.name} logo`);
                  try {
                    const r = await api.post("/uploads", fd);
                    await api.patch(`/orgs/${orgSlug}`, { logoAssetId: r.asset.id });
                    qc.invalidateQueries({ queryKey: ["org", orgSlug] });
                    toast("Logo updated");
                  } catch (x: any) {
                    toast(x.message, "error");
                  }
                }}
              />
            </label>
          </div>
          <TextField label="Program contact name" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
          <TextField label="Program contact email" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />
          <TextField label="Coverage" value={f.coverage} onChange={(e) => setF({ ...f, coverage: e.target.value })} />
          <button className="btn btn-dark">Save branding</button>
        </form>
        <div>
          <div className="org-hero" style={{ color: "#fff" }}>
            <div className="accent-bar" style={{ background: f.accentColor }} />
            {org.logo_url ? <img src={org.logo_url} alt="" style={{ height: 48, background: "#fff", borderRadius: 8, padding: 4, marginBottom: 10 }} /> : null}
            <div className="eyebrow" style={{ color: f.accentColor }}>{org.name}</div>
            <h2 style={{ margin: "4px 0" }}>{f.programDisplayName || `${org.name} Perks`}</h2>
            <p className="muted">{f.welcomeCopy}</p>
            <span className="btn btn-sm" style={{ background: f.accentColor, color: "#000" }}>Accent preview</span>
            <p className="muted" style={{ fontSize: ".8rem", marginTop: 12 }}>Powered by Culturosity</p>
          </div>
          <p className="muted" style={{ fontSize: ".85rem" }}>Culturosity attribution and core navigation colours are retained for accessibility and consistency.</p>
        </div>
      </div>
    </Wrap>
  );
}

// ======================= Import / export =======================
export function ManageImport() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Import & export");
  const toast = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<"perks" | "members">("perks");
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [dups, setDups] = useState<"skip" | "update">("skip");
  const [busy, setBusy] = useState(false);
  const headers = csv ? parseCsvObjects(csv).headers : [];
  async function run(dryRun: boolean) {
    setBusy(true);
    try {
      const r = await api.post(`/orgs/${orgSlug}/import/${kind}`, { csv, dryRun, mapping: mapping ?? undefined, duplicates: dups });
      setPreview({ ...r, dryRun });
      if (r.mapping && !mapping) setMapping(r.mapping);
      if (!dryRun) {
        toast("Import complete");
        qc.invalidateQueries({ queryKey: ["manage-perks"] });
      }
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  const template =
    kind === "perks"
      ? "provider_name,title,short_description,full_description,category,value_type,value_label,value_percent,value_amount,currency,ongoing,start_date,end_date,timezone,redemption_method,redemption_url,redemption_instructions,promo_code,online_only,address_line,city,region,postal_code,country,eligibility\n"
      : "email,role\n";
  return (
    <Wrap>
      <PageHeader title="Import & export" eyebrow="Program">
        <a className="btn btn-ghost" href={`/api/orgs/${orgSlug}/export/perks.csv`}>Export offers CSV</a>
      </PageHeader>
      <div className="panel">
        <div className="segmented" role="group" aria-label="Import type" style={{ marginBottom: 14 }}>
          <button aria-pressed={kind === "perks"} onClick={() => { setKind("perks"); setPreview(null); setMapping(null); }}>Offers</button>
          <button aria-pressed={kind === "members"} onClick={() => { setKind("members"); setPreview(null); setMapping(null); }}>Members</button>
        </div>
        <p className="muted">
          Upload a CSV, review the preview and field mapping, then import. Rows are validated individually; invalid rows are reported and skipped.{" "}
          <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download={`${kind}-template.csv`}>Download template</a>
        </p>
        <label className="btn btn-ghost" style={{ cursor: "pointer", width: "fit-content" }}>
          Choose CSV file
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setPreview(null); setMapping(null); } }} />
        </label>
        <TextArea label="…or paste CSV" rows={5} value={csv} onChange={(e) => { setCsv(e.target.value); setPreview(null); }} />
        {kind === "perks" && mapping ? (
          <details open style={{ marginBottom: 14 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Field mapping</summary>
            <div className="grid-3" style={{ marginTop: 10 }}>
              {Object.keys(mapping).map((field) => (
                <SelectField key={field} label={field} value={mapping[field]} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}>
                  <option value="">— not mapped —</option>
                  {headers.map((h) => <option key={h}>{h}</option>)}
                </SelectField>
              ))}
            </div>
          </details>
        ) : null}
        {kind === "perks" ? (
          <SelectField label="Duplicates (same provider + title)" value={dups} onChange={(e) => setDups(e.target.value as any)}>
            <option value="skip">Skip duplicates</option>
            <option value="update">Update existing offers</option>
          </SelectField>
        ) : null}
        <div className="row">
          <button className="btn btn-ghost" disabled={!csv || busy} onClick={() => run(true)}>Preview</button>
          <button className="btn btn-dark" disabled={!csv || busy || !preview?.dryRun} onClick={() => run(false)}>Import</button>
        </div>
      </div>
      {preview ? (
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="data">
            <thead><tr><th>Row</th><th>{kind === "perks" ? "Title" : "Email"}</th><th>Result</th><th>Details</th></tr></thead>
            <tbody>
              {preview.results.map((r: any) => (
                <tr key={r.row}>
                  <td>{r.row}</td>
                  <td>{r.title ?? r.email}</td>
                  <td><span className={`status status-${["valid", "created", "invited", "updated"].includes(r.status) ? "published" : r.status === "invalid" ? "rejected" : "paused"}`}>{r.status}</span></td>
                  <td style={{ fontSize: ".82rem" }}>{r.errors ? Object.entries(r.errors).map(([k, v]) => `${k}: ${v}`).join("; ") : r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Wrap>
  );
}

// ======================= Reports =======================
export function ManageReports() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Reports");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const [programId, setProgramId] = useState("");
  const org = useOrg(orgSlug).data;
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["reports", orgSlug, from, to, programId], queryFn: () => api.get(`/orgs/${orgSlug}/reports${qs({ from, to, programId })}`) });
  const t = (k: string) => data?.totals?.[k]?.count ?? 0;
  return (
    <Wrap>
      <PageHeader title="Reports" eyebrow="Insights" />
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="grid-3">
          <TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <SelectField label="Program" value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">All programs</option>
            {(org?.programs ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </SelectField>
        </div>
      </div>
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}
      {data ? (
        <>
          {data.isDemo ? <div className="alert alert-warning" style={{ marginBottom: 12 }}>Demo data — synthetic activity, excluded from production totals.</div> : null}
          <div className="stats">
            <Stat label="Active eligible members" value={data.activeMembers} />
            <Stat label="Catalogue views" value={t("catalogue_view")} />
            <Stat label="Offer detail views" value={t("perk_view")} />
            <Stat label="Favourites added" value={t("favourite_add")} />
            <Stat label="Use Perk clicks" value={t("use_perk_click")} />
            <Stat label="Redemptions initiated" value={t("redemption_initiated")} />
            <Stat label="Verified redemptions" value={t("redemption_verified")} />
          </div>
          <section className="panel" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: "1.1rem" }}>By offer</h2>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Offer</th><th>Views</th><th>Use Perk clicks</th><th>Initiated</th><th>Verified</th><th>Saved</th></tr></thead>
                <tbody>
                  {data.byPerk.map((p: any) => (
                    <tr key={p.id}><td><strong>{p.provider_name}</strong> — {p.title}</td><td>{p.views}</td><td>{p.clicks}</td><td>{p.initiated}</td><td>{p.verified}</td><td>{p.favourites}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel" style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: "1.1rem" }}>Definitions</h2>
            <dl style={{ display: "grid", gap: 8, margin: 0 }}>
              {Object.entries(data.definitions).map(([k, v]) => (
                <div key={k}><dt style={{ fontWeight: 600 }}>{k.replaceAll("_", " ")}</dt><dd style={{ margin: 0 }} className="muted">{v as string}</dd></div>
              ))}
            </dl>
            <p className="muted" style={{ fontSize: ".85rem", marginTop: 10 }}>Reports are aggregated. Member-level behaviour is not shown.</p>
          </section>
        </>
      ) : null}
    </Wrap>
  );
}

// ======================= Licensed Culturosity offers =======================
export function ManageLicensed() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Culturosity offers");
  const qc = useQueryClient();
  const toast = useToast();
  const org = useOrg(orgSlug).data;
  const { data, isLoading, error } = useQuery<any>({ queryKey: ["licensed", orgSlug], queryFn: () => api.get(`/orgs/${orgSlug}/licensed-offers`) });
  const programs = org?.programs ?? [];
  return (
    <Wrap>
      <PageHeader title="Culturosity offers" eyebrow="Program" />
      <p className="muted">Offers from Culturosity programs your organization is licensed for, where the provider permits distribution. Include them in any of your programs.</p>
      {error ? <ErrorAlert error={error} /> : null}
      {isLoading ? <Spinner /> : null}
      {data && !data.offers.length ? (
        <EmptyState title="No licensed Culturosity offers yet" action={<Link className="btn btn-dark" to={`/app/${orgSlug}/manage/services`}>Ask Culturosity</Link>}>
          Culturosity can license selected curated offers to your program.
        </EmptyState>
      ) : null}
      {data?.offers.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Offer</th><th>Source</th>{programs.map((p: any) => <th key={p.id}>{p.name}</th>)}</tr></thead>
            <tbody>
              {data.offers.map((o: any) => (
                <tr key={o.id}>
                  <td><strong>{o.provider_name}</strong> — {o.title} <span className="badge badge-value">{o.value_label}</span></td>
                  <td>{o.source_program}</td>
                  {programs.map((p: any) => (
                    <td key={p.id}>
                      <label className="check" style={{ padding: 0 }}>
                        <input
                          type="checkbox"
                          checked={o.included_in.includes(p.id)}
                          onChange={async (e) => {
                            try {
                              await api.post(`/orgs/${orgSlug}/licensed-offers`, { perkId: o.id, programId: p.id, include: e.target.checked });
                              qc.invalidateQueries({ queryKey: ["licensed", orgSlug] });
                              toast(e.target.checked ? "Included" : "Removed");
                            } catch (x: any) {
                              toast(x.message, "error");
                            }
                          }}
                        />
                        <span className="sr-only">Include in {p.name}</span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Wrap>
  );
}

// ======================= Launch materials =======================
export function ManageLaunch() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Launch materials");
  const qc = useQueryClient();
  const toast = useToast();
  const org = useOrg(orgSlug).data?.org;
  const { data } = useQuery<any>({ queryKey: ["announcements", orgSlug], queryFn: () => api.get(`/orgs/${orgSlug}/announcements`) });
  const [draft, setDraft] = useState<{ id?: string; title: string; body: string } | null>(null);
  const url = `${window.location.origin}/app/${orgSlug}`;
  const templates = org
    ? [
        {
          title: "Launch announcement",
          body: `Subject: Introducing ${org.program_display_name || org.name + " Perks"}\n\nHi team,\n\nWe're launching ${org.program_display_name || org.name + " Perks"} — a single place to find the offers and experiences available to you.\n\nHow to get started:\n1. Accept your invitation email (or sign up with your work email).\n2. Browse offers and save your favourites.\n3. Use Perk online, or show your member card in person.\n\nOpen the program: ${url}\n\nQuestions? Contact ${org.contact_name || "[program contact]"} at ${org.contact_email || "[contact email]"}.`,
        },
        {
          title: "Reminder: new offers this month",
          body: `Subject: New this month in ${org.program_display_name || org.name + " Perks"}\n\nHi team,\n\nWe've added new offers to the program. Open ${url} and choose “New” to see what's been added.\n\n[Highlight one or two offers here]`,
        },
      ]
    : [];
  async function save() {
    if (!draft) return;
    try {
      const r = await api.put(`/orgs/${orgSlug}/announcements`, draft);
      setDraft({ ...draft, id: r.id });
      qc.invalidateQueries({ queryKey: ["announcements", orgSlug] });
      toast("Draft saved");
    } catch (e: any) {
      toast(e.message, "error");
    }
  }
  return (
    <Wrap>
      <PageHeader title="Launch materials" eyebrow="Workspace" />
      <div className="grid-2">
        <div className="panel">
          <h2 style={{ fontSize: "1.1rem" }}>Start from a template</h2>
          {templates.map((t) => (
            <button key={t.title} className="btn btn-ghost btn-block" style={{ marginBottom: 8, justifyContent: "flex-start" }} onClick={() => setDraft({ title: t.title, body: t.body })}>
              {t.title}
            </button>
          ))}
          <h2 style={{ fontSize: "1.1rem", marginTop: 16 }}>Saved drafts</h2>
          {(data?.drafts ?? []).map((d: any) => (
            <div key={d.id} className="spread" style={{ padding: "6px 0" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setDraft(d)}>{d.title}</button>
              <button className="btn btn-ghost btn-sm" onClick={async () => { await api.del(`/orgs/${orgSlug}/announcements/${d.id}`); qc.invalidateQueries({ queryKey: ["announcements", orgSlug] }); }}>Delete</button>
            </div>
          ))}
          <p className="muted" style={{ fontSize: ".85rem", marginTop: 10 }}>Drafts are for your internal communications tools. Culturosity does not send them.</p>
        </div>
        <div className="panel">
          {draft ? (
            <>
              <TextField label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <TextArea label="Message" rows={14} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <div className="row">
                <button className="btn btn-dark" onClick={save}>Save draft</button>
                <button className="btn btn-ghost" onClick={async () => { await navigator.clipboard.writeText(draft.body); toast("Copied"); }}>Copy</button>
              </div>
            </>
          ) : (
            <p className="muted">Choose a template or saved draft to edit.</p>
          )}
        </div>
      </div>
    </Wrap>
  );
}

export function ManageServices() {
  const { orgSlug = "" } = useParams();
  useDocumentTitle("Management Services");
  const { data } = useQuery<any>({ queryKey: ["org-services", orgSlug], queryFn: () => api.get(`/orgs/${orgSlug}/service-requests`) });
  return (
    <Wrap>
      <PageHeader title="Culturosity Management Services" eyebrow="Workspace" />
      <p className="muted" style={{ maxWidth: 720 }}>
        Build your program with Culturosity. Manage it yourself, or let our team take care of it — from provider discovery and perk entry to renewals, member
        materials and reporting.
      </p>
      {(data?.requests ?? []).length ? (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Your requests</h2>
          {data.requests.map((r: any) => (
            <div key={r.id} className="spread" style={{ padding: "6px 0" }}>
              <span>{new Date(r.created_at).toLocaleDateString()} · {r.service_needs.join(", ")}</span>
              <span className="badge">{r.status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      ) : null}
      <ServiceRequestForm orgSlug={orgSlug} compact />
    </Wrap>
  );
}

export { Outlet };
