import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, prefs } from "../lib/api";
import { useConfig, useMe, useSignOut } from "../lib/session";
import { Checkbox, ErrorAlert, Logo, SelectField, Spinner, TextField, useDocumentTitle, useToast } from "../components/ui";

function AuthCard({ title, children, sub }: { title: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="container page" style={{ maxWidth: 520 }}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <Logo height={64} className="logo-on-page" />
      </div>
      <div className="panel">
        <h1 style={{ fontSize: "1.6rem" }}>{title}</h1>
        {sub ? <p className="muted">{sub}</p> : null}
        {children}
      </div>
    </div>
  );
}

function safeNext(v: string | null) {
  // Same-origin paths only: reject protocol-relative and backslash tricks ("//x", "/\\x").
  return v && /^\/(?![\/\\])[^\\]*$/.test(v) ? v : "/perks";
}

export function SignInPage() {
  useDocumentTitle("Sign in");
  const [sp] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { data: cfg } = useConfig();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      qc.clear();
      prefs.clearAll();
      await api.post("/auth/signin", { email, password });
      window.location.assign(safeNext(sp.get("next")));
    } catch (x) {
      setErr(x);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthCard title="Sign in">
      <form onSubmit={submit} noValidate>
        {err ? <ErrorAlert error={err} title="Couldn't sign in." /> : null}
        <div style={{ height: 12 }} />
        <TextField label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <div className="spread" style={{ marginTop: 16, fontSize: ".92rem" }}>
        <Link to="/auth/forgot">Forgot password?</Link>
        {(sp.get("next") ?? "").startsWith("/auth/invite/") ? (
          <Link to={`/auth/signup?next=${encodeURIComponent(sp.get("next")!)}`}>Create your account</Link>
        ) : (
          <span className="muted">New to Culturosity? Accounts are created through your organization’s invitation.</span>
        )}
      </div>
      {cfg?.mode === "demo" ? (
        <div className="alert alert-info" style={{ marginTop: 18, fontSize: ".85rem" }}>
          Local demo: sign in as a sample persona from the <Link to="/demo">demo page</Link>, or use a demo account listed in the README.
        </div>
      ) : null}
    </AuthCard>
  );
}

export function SignUpPage() {
  useDocumentTitle("Create account");
  const [sp] = useSearchParams();
  const [f, setF] = useState({ displayName: "", email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState<{ devMailbox?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const inviteToken = (sp.get("next") ?? "").match(/^\/auth\/invite\/([A-Za-z0-9_-]+)/)?.[1];
      const r = await api.post("/auth/signup", { ...f, ...(inviteToken ? { inviteToken } : {}) });
      setDone(r);
    } catch (x) {
      setErr(x);
      setErrors((x as ApiError).fields ?? {});
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <AuthCard title="Check your email">
        <p>We sent a verification link to <strong>{f.email}</strong>. Open it to activate your account.</p>
        {done.devMailbox ? <p className="muted">Local demo: open the <Link to="/dev/mailbox">development mailbox</Link> to see the message.</p> : null}
        <Link className="btn btn-primary" to={safeNext(sp.get("next"))}>Continue</Link>
      </AuthCard>
    );
  return (
    <AuthCard
      title="Create your account"
      sub="Accounts are by invitation only — for members of organizations with a Culturosity program. Use the email address your invitation was sent to, or your work email if your organization lets staff join that way."
    >
      <form onSubmit={submit} noValidate>
        {err ? <ErrorAlert error={err} title="Couldn't create the account." /> : null}
        <div style={{ height: 12 }} />
        <TextField label="Your name" required autoComplete="name" value={f.displayName} error={errors.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} />
        <TextField label="Email" type="email" required autoComplete="email" value={f.email} error={errors.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <TextField label="Password" type="password" required autoComplete="new-password" value={f.password} error={errors.password} hint="At least 10 characters, mixing letters with numbers or symbols." onChange={(e) => setF({ ...f, password: e.target.value })} />
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <p className="muted" style={{ marginTop: 10, fontSize: ".82rem" }}>
          By creating an account, you agree to our <Link to="/terms">Terms of Use</Link> and <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </form>
      <p style={{ marginTop: 14, fontSize: ".92rem" }}>
        Already have an account? <Link to="/auth/signin">Sign in</Link>
      </p>
    </AuthCard>
  );
}

export function VerifyPage() {
  useDocumentTitle("Verify email");
  const [sp] = useSearchParams();
  const [state, setState] = useState<"working" | "ok" | "error">("working");
  const [err, setErr] = useState<unknown>(null);
  const qc = useQueryClient();
  useEffect(() => {
    api
      .post("/auth/verify", { token: sp.get("token") })
      .then(() => {
        setState("ok");
        qc.invalidateQueries({ queryKey: ["me"] });
      })
      .catch((e) => {
        setErr(e);
        setState("error");
      });
  }, [sp, qc]);
  return (
    <AuthCard title="Email verification">
      {state === "working" ? <Spinner label="Verifying" /> : null}
      {state === "ok" ? (
        <>
          <div className="alert alert-success">Your email is verified.</div>
          <p style={{ marginTop: 14 }}>
            <Link className="btn btn-primary" to="/perks">Continue</Link>
          </p>
        </>
      ) : null}
      {state === "error" ? <ErrorAlert error={err} title="Verification failed." /> : null}
    </AuthCard>
  );
}

export function ForgotPage() {
  useDocumentTitle("Reset password");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  return (
    <AuthCard title="Reset your password">
      {msg ? (
        <div className="alert alert-success">{msg}</div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const r = await api.post("/auth/forgot", { email });
              setMsg(r.message);
            } catch (x) {
              setErr(x);
            }
          }}
        >
          {err ? <ErrorAlert error={err} /> : null}
          <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-primary btn-block">Send reset link</button>
        </form>
      )}
    </AuthCard>
  );
}

export function ResetPage() {
  useDocumentTitle("Choose a new password");
  const [sp] = useSearchParams();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <>
          <div className="alert alert-success">Password updated. Other sessions were signed out.</div>
          <p style={{ marginTop: 14 }}><Link className="btn btn-primary" to="/auth/signin">Sign in</Link></p>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.post("/auth/reset", { token: sp.get("token"), password: pw });
              setDone(true);
            } catch (x) {
              setErr(x);
            }
          }}
        >
          {err ? <ErrorAlert error={err} /> : null}
          <TextField label="New password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 10 characters." />
          <button className="btn btn-primary btn-block">Update password</button>
        </form>
      )}
    </AuthCard>
  );
}

/** Private sign-up link for Culturosity salespeople (created by a super admin in Admin → Sales team). */
export function SalesSignUpPage() {
  useDocumentTitle("Join the Culturosity sales team");
  const { token = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, error, isLoading } = useQuery<any>({ queryKey: ["staff-invite", token], queryFn: () => api.get(`/staff-invitations/${token}`), retry: false });
  const [f, setF] = useState({ displayName: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const inv = data?.invitation;
  return (
    <AuthCard title="Join the Culturosity sales team" sub="Your account gives you access to Admin Research & Sales: the research directory, outreach, pipeline and demo guide.">
      {isLoading ? <Spinner /> : null}
      {error ? <ErrorAlert error={error} /> : null}
      {inv ? (
        inv.accepted ? (
          <div className="alert alert-info">
            This link was already used. <Link to="/auth/signin?next=/culturosity/admin">Sign in</Link> to continue.
          </div>
        ) : inv.expired ? (
          <div className="alert alert-warning">This sign-up link has expired. Ask Culturosity for a new one.</div>
        ) : (
          <form
            className="stack"
            style={{ display: "grid", gap: 12 }}
            onSubmit={async (e) => {
              e.preventDefault();
              setErr(null);
              setErrors({});
              setBusy(true);
              try {
                const r = await api.post<{ redirect: string }>(`/staff-invitations/${token}/accept`, f);
                await qc.invalidateQueries({ queryKey: ["me"] });
                nav(r.redirect, { replace: true });
              } catch (x) {
                setErrors((x as ApiError).fields ?? {});
                setErr(x);
                setBusy(false);
              }
            }}
          >
            <TextField label="Email" value={inv.email} readOnly disabled />
            {inv.hasAccount ? (
              <p className="muted" style={{ margin: 0 }}>You already have a Culturosity account with this email. Enter its password to add sales access.</p>
            ) : (
              <TextField label="Your name" value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} error={errors.displayName} autoComplete="name" required />
            )}
            <TextField
              label={inv.hasAccount ? "Password" : "Create a password"}
              type="password"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              error={errors.password}
              hint={inv.hasAccount ? undefined : "At least 12 characters."}
              autoComplete={inv.hasAccount ? "current-password" : "new-password"}
              required
            />
            {err ? <ErrorAlert error={err} /> : null}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {busy ? "Setting up…" : inv.hasAccount ? "Add sales access" : "Create my account"}
            </button>
            <p className="muted" style={{ fontSize: ".85rem", margin: 0 }}>You'll also need the access code from Culturosity to open the research and sales area.</p>
          </form>
        )
      ) : null}
    </AuthCard>
  );
}

export function InvitePage() {
  useDocumentTitle("Invitation");
  const { token = "" } = useParams();
  const { data: me } = useMe();
  const { data, error, isLoading } = useQuery<any>({ queryKey: ["invite", token], queryFn: () => api.get(`/invitations/${token}`), retry: false });
  const [err, setErr] = useState<unknown>(null);
  const nav = useNavigate();
  const qc = useQueryClient();
  const inv = data?.invitation;
  return (
    <AuthCard title="You're invited">
      {isLoading ? <Spinner /> : null}
      {error ? <ErrorAlert error={error} /> : null}
      {inv ? (
        <>
          <p>
            <strong>{inv.orgName}</strong> invited <strong>{inv.email}</strong> to join as <strong>{inv.role.replace("_", " ")}</strong>.
          </p>
          {inv.expired ? <div className="alert alert-warning">This invitation has expired. Ask your administrator for a new one.</div> : null}
          {inv.accepted ? <div className="alert alert-info">This invitation was already accepted.</div> : null}
          {err ? <ErrorAlert error={err} /> : null}
          {!inv.expired && !inv.accepted ? (
            me?.user ? (
              <button
                className="btn btn-primary btn-block"
                onClick={async () => {
                  try {
                    const r = await api.post(`/invitations/${token}/accept`);
                    await qc.invalidateQueries({ queryKey: ["me"] });
                    nav(`/app/${r.orgSlug}`);
                  } catch (x) {
                    setErr(x);
                  }
                }}
              >
                Accept invitation as {me.user.email}
              </button>
            ) : (
              <div className="row">
                <Link className="btn btn-primary" to={`/auth/signup?next=/auth/invite/${token}`}>Create account</Link>
                <Link className="btn btn-ghost" to={`/auth/signin?next=/auth/invite/${token}`}>Sign in</Link>
              </div>
            )
          ) : null}
        </>
      ) : null}
    </AuthCard>
  );
}

export function AccountPage() {
  useDocumentTitle("Account");
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const signOut = useSignOut();
  const [name, setName] = useState("");
  const { data: sessions } = useQuery<any>({ queryKey: ["sessions"], queryFn: () => api.get("/me/sessions"), enabled: Boolean(me?.user) });
  useEffect(() => {
    setName(me?.user?.display_name ?? "");
  }, [me?.user?.display_name]);
  if (me && !me.user)
    return (
      <AuthCard title="Account">
        <Link className="btn btn-primary" to="/auth/signin?next=/account">Sign In</Link>
      </AuthCard>
    );
  if (!me) return <div className="container page"><Spinner /></div>;
  return (
    <div className="page page-light surface-light">
      <div className="container" style={{ maxWidth: 900 }}>
        <h1 style={{ fontSize: "2rem" }}>Account &amp; security</h1>
        {!me.user!.email_verified_at ? (
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            Please verify your email address.{" "}
            <button className="btn btn-sm btn-ghost" onClick={async () => { await api.post("/auth/resend-verification"); toast("Verification email sent"); }}>
              Resend email
            </button>
          </div>
        ) : null}
        <div className="grid-2">
          <section className="panel">
            <h2 style={{ fontSize: "1.2rem" }}>Profile</h2>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="muted">Email: {me.user!.email}</p>
            <button className="btn btn-dark" onClick={async () => { await api.patch("/me", { displayName: name }); qc.invalidateQueries({ queryKey: ["me"] }); toast("Profile saved"); }}>
              Save
            </button>
          </section>
          <section className="panel">
            <h2 style={{ fontSize: "1.2rem" }}>Memberships</h2>
            {(me.memberships ?? []).length ? (
              <ul style={{ paddingLeft: 18 }}>
                {me.memberships!.map((m) => (
                  <li key={m.id}>
                    {m.org_name} — {m.role.replace("_", " ")} {m.is_demo ? <span className="badge badge-demo">Demo</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">You are not a member of any program yet. Ask your organization for an invitation.</p>
            )}
            {me.grants?.length ? <p className="muted">Internal Culturosity access: {me.grants.join(", ").replace("_", " ")}</p> : null}
          </section>
        </div>
        <section className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: "1.2rem" }}>Active sessions</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Device</th><th>Last active</th><th /></tr></thead>
              <tbody>
                {(sessions?.sessions ?? []).map((s: any) => (
                  <tr key={s.id}>
                    <td>{(s.user_agent || "Unknown device").slice(0, 80)} {s.current ? <span className="badge badge-new">This device</span> : null}</td>
                    <td>{new Date(s.last_seen_at).toLocaleString()}</td>
                    <td>
                      {!s.current ? (
                        <button className="btn btn-ghost btn-sm" onClick={async () => { await api.del(`/me/sessions/${s.id}`); qc.invalidateQueries({ queryKey: ["sessions"] }); toast("Session signed out"); }}>
                          Sign out
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: "1.2rem" }}>Your data</h2>
          <div className="row">
            <a className="btn btn-ghost" href="/api/me/export" download>Download my data (JSON)</a>
            <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirm("Deactivate your account? You will be signed out everywhere and removed from programs. Verified redemption history is retained for program records.")) return;
                try {
                  await api.post("/me/deactivate");
                  window.location.assign("/");
                } catch (e: any) {
                  toast(e.message, "error");
                }
              }}
            >
              Deactivate account
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export function DevMailboxPage() {
  useDocumentTitle("Development mailbox");
  const { data, error } = useQuery<any>({ queryKey: ["mailbox"], queryFn: () => api.get("/dev/mailbox"), refetchInterval: 4000 });
  return (
    <div className="page page-light surface-light">
      <div className="container" style={{ maxWidth: 900 }}>
        <h1 style={{ fontSize: "1.8rem" }}>Development mailbox</h1>
        <p className="muted">Local demo only. Messages that would be emailed are shown here when no mail provider is configured.</p>
        {error ? <ErrorAlert error={error} title="Mailbox unavailable outside the local demo." /> : null}
        {(data?.messages ?? []).map((m: any) => (
          <article key={m.id} className="panel" style={{ marginBottom: 12 }}>
            <div className="muted" style={{ fontSize: ".82rem" }}>To {m.to_email} · {new Date(m.created_at).toLocaleString()}</div>
            <h2 style={{ fontSize: "1.05rem" }}>{m.subject}</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>
              {m.body_text.split(/(https?:\/\/\S+)/g).map((part: string, i: number) =>
                /^https?:\/\//.test(part) ? <a key={i} href={part.replace(/^https?:\/\/[^/]+/, "")}>{part}</a> : part,
              )}
            </pre>
          </article>
        ))}
      </div>
    </div>
  );
}

export function StartWorkspacePage() {
  useDocumentTitle("Create a company workspace");
  const { data: me } = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", programName: "", contactName: "", contactEmail: "", coverage: "", approxMemberCount: "", deliveryPreference: "self_service", agree: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    if (me?.user) setF((x) => ({ ...x, contactName: x.contactName || me.user!.display_name, contactEmail: x.contactEmail || me.user!.email }));
  }, [me?.user]);
  if (me && !me.grants?.includes("super_admin"))
    return (
      <AuthCard title="Get your company's perks program" sub="Company workspaces are set up by Culturosity. Request a proposal and our team will set up your program with you.">
        <div className="row">
          <Link className="btn btn-primary" to="/services#request">Request a Proposal</Link>
          {!me.user ? <Link className="btn btn-ghost" to="/auth/signin?next=/start">Culturosity staff sign in</Link> : null}
        </div>
      </AuthCard>
    );
  return (
    <AuthCard
      title="Create a company workspace"
      sub="Set up a client's private affinity program. You become its first owner — then invite the client's contact as an Owner from Manage → Members & roles."
    >
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (!f.agree) return setErrors({ agree: "Confirm you are authorised to create this workspace" });
          try {
            const r = await api.post("/orgs", { ...f, approxMemberCount: f.approxMemberCount || undefined });
            await qc.invalidateQueries({ queryKey: ["me"] });
            nav(`/app/${r.slug}/manage`);
          } catch (x) {
            setErr(x);
            setErrors((x as ApiError).fields ?? {});
          }
        }}
      >
        {err ? <ErrorAlert error={err} title="Couldn't create the workspace." /> : null}
        {me?.user && !me.user.email_verified_at ? <div className="alert alert-warning">Verify your email address before creating a workspace.</div> : null}
        <div style={{ height: 10 }} />
        <TextField label="Organization name" required value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <TextField label="Program name" placeholder="e.g. Northwind Perks" value={f.programName} onChange={(e) => setF({ ...f, programName: e.target.value })} />
        <TextField label="Contact person" required value={f.contactName} error={errors.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
        <TextField label="Business email" required type="email" value={f.contactEmail} error={errors.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />
        <TextField label="Location / coverage" value={f.coverage} onChange={(e) => setF({ ...f, coverage: e.target.value })} />
        <TextField label="Approximate members / employees" type="number" min={1} value={f.approxMemberCount} error={errors.approxMemberCount} onChange={(e) => setF({ ...f, approxMemberCount: e.target.value })} />
        <SelectField label="How would you like to run it?" value={f.deliveryPreference} onChange={(e) => setF({ ...f, deliveryPreference: e.target.value })}>
          <option value="self_service">Self-Service — our team runs it</option>
          <option value="launch">Launch with Culturosity</option>
          <option value="managed">Fully Managed by Culturosity</option>
        </SelectField>
        <Checkbox label="I am authorised to create this workspace for my organization." checked={f.agree} onChange={(v) => setF({ ...f, agree: v })} />
        {errors.agree ? <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: ".85rem" }}>{errors.agree}</div> : null}
        <p className="muted" style={{ fontSize: ".85rem" }}>You can upload your logo and brand colour in workspace settings after creating it.</p>
        <button className="btn btn-primary btn-block btn-lg">Create workspace</button>
      </form>
    </AuthCard>
  );
}
