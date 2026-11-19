import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useMe } from "../lib/session";
import { DemoBadge, EmptyState, ErrorAlert, Spinner, useDocumentTitle } from "../components/ui";
import { IconQr } from "../components/Icons";

/** Camera scanning adapter: uses the platform BarcodeDetector where available (native containers can swap this). */
function useQrScanner(onCode: (v: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "running" | "unsupported" | "denied">("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState((s) => (s === "running" ? "idle" : s));
  };
  useEffect(() => stop, []);
  async function start() {
    const BD = (window as any).BarcodeDetector;
    if (!BD || !navigator.mediaDevices?.getUserMedia) return setState("unsupported");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setState("running");
      const detector = new BD({ formats: ["qr_code"] });
      const loop = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(v);
          if (codes[0]?.rawValue) {
            stop();
            onCode(codes[0].rawValue);
            return;
          }
        } catch {
          /* frame not ready */
        }
        requestAnimationFrame(loop);
      };
      loop();
    } catch {
      setState("denied");
    }
  }
  return { videoRef, state, start, stop };
}

const RESULT_STYLE: Record<string, { cls: string; title: string }> = {
  valid: { cls: "alert-success", title: "Valid" },
  expired: { cls: "alert-warning", title: "Expired" },
  already_used: { cls: "alert-error", title: "Already used" },
  not_eligible: { cls: "alert-error", title: "Not eligible" },
  wrong_provider: { cls: "alert-error", title: "Not authorised for this provider" },
  not_found: { cls: "alert-error", title: "Not recognised" },
};

export function ProviderVerifyPage() {
  useDocumentTitle("Verify a redemption");
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const { data: providers } = useQuery<any>({ queryKey: ["provider-me"], queryFn: () => api.get("/provider/me"), enabled: Boolean(me?.user) });
  const { data: history } = useQuery<any>({ queryKey: ["provider-redemptions"], queryFn: () => api.get("/provider/redemptions"), enabled: Boolean(me?.user) });
  async function verify(value: string) {
    if (!navigator.onLine) {
      setErr(new Error("You are offline. Verification needs a connection — nothing was recorded."));
      return;
    }
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.post("/provider/verify", { code: value });
      setResult(r);
      if (r.result === "valid") qc.invalidateQueries({ queryKey: ["provider-redemptions"] });
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
      setCode("");
    }
  }
  const scanner = useQrScanner((v) => verify(v));
  if (me && !me.user)
    return (
      <div className="container page">
        <EmptyState title="Provider sign-in required" action={<Link className="btn btn-primary" to="/auth/signin?next=/provider/verify">Sign In</Link>} />
      </div>
    );
  return (
    <div className="page page-light surface-light">
      <div className="container" style={{ maxWidth: 900 }}>
        <div className="eyebrow">Provider tools</div>
        <h1 style={{ fontSize: "2rem" }}>Verify a member redemption</h1>
        <p className="muted">Scan or type the member's <strong>one-time verification code</strong>. Each code is checked on the server, works once and lasts 10 minutes.</p>
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          <strong>Where the member finds it:</strong> on the perk's Details page, under their member card, they open <em>“Provider asks for a verification code?”</em>{" "}
          and select <em>Get a one-time verification code</em>. It shows a QR code and a 10-character code like <code>ABCDE-FGHJK</code>.
          <div style={{ marginTop: 6 }}>
            Promo codes (like <code>CULTURE10</code>) and the perk's own QR code on the member card are for your checkout or point-of-sale system — they aren't checked here.
          </div>
        </div>
        {providers && !providers.providers.length ? (
          <div className="alert alert-warning">You are not assigned to any provider yet. Ask the program administrator to assign you.</div>
        ) : null}
        <div className="grid-2" style={{ marginTop: 12 }}>
          <section className="panel">
            <h2 style={{ fontSize: "1.1rem" }}>Scan</h2>
            <div style={{ background: "#000", borderRadius: 14, overflow: "hidden", aspectRatio: "1", display: "grid", placeItems: "center" }}>
              <video ref={scanner.videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: scanner.state === "running" ? "block" : "none" }} />
              {scanner.state !== "running" ? <IconQr size={64} style={{ color: "#57F6C3" }} /> : null}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {scanner.state === "running" ? (
                <button className="btn btn-ghost" onClick={scanner.stop}>Stop camera</button>
              ) : (
                <button className="btn btn-dark" onClick={scanner.start}>Start camera</button>
              )}
            </div>
            {scanner.state === "unsupported" ? <p className="muted" style={{ fontSize: ".85rem" }}>Camera scanning isn't supported in this browser. Use manual entry.</p> : null}
            {scanner.state === "denied" ? <p className="muted" style={{ fontSize: ".85rem" }}>Camera access was blocked. Use manual entry or allow camera access.</p> : null}
          </section>
          <section className="panel">
            <h2 style={{ fontSize: "1.1rem" }}>Manual entry</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) verify(code.trim());
              }}
            >
              <label htmlFor="manual-code" className="label" style={{ fontWeight: 600 }}>Member's one-time code</label>
              <input
                id="manual-code"
                className="input"
                style={{ fontSize: "1.4rem", letterSpacing: ".12em", textTransform: "uppercase", margin: "6px 0 12px" }}
                placeholder="ABCDE-FGHJK"
                autoComplete="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="btn btn-primary btn-block btn-lg" disabled={busy || !code.trim()}>
                {busy ? "Checking…" : "Verify"}
              </button>
            </form>
            <div aria-live="assertive" style={{ marginTop: 14 }}>
              {busy ? <Spinner label="Checking" /> : null}
              {err ? <ErrorAlert error={err} /> : null}
              {result ? (
                <div className={`alert ${RESULT_STYLE[result.result]?.cls ?? "alert-info"}`} role="status">
                  <strong style={{ fontSize: "1.2rem" }}>{RESULT_STYLE[result.result]?.title ?? result.result}</strong>
                  <div>{result.message}</div>
                  {result.offer ? (
                    <div style={{ marginTop: 6 }}>
                      {result.offer.provider}: {result.offer.title} — <strong>{result.offer.value}</strong>
                      {result.memberFirstName ? <div>Member: {result.memberFirstName}</div> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </div>
        <section className="panel" style={{ marginTop: 16 }}>
          <h2 style={{ fontSize: "1.1rem" }}>Your providers</h2>
          {(providers?.providers ?? []).map((p: any) => (
            <div key={p.id} className="spread" style={{ padding: "8px 0", borderBottom: "1px solid #eee" }}>
              <div>
                <strong>{p.name}</strong> {p.is_demo ? <DemoBadge /> : null}
                <div className="muted" style={{ fontSize: ".85rem" }}>
                  Provider reference <code>{p.provider_ref}</code>
                  {p.pos_reference ? ` · POS ${p.pos_reference}` : ""} · {p.org_name}
                </div>
              </div>
              <div className="row">
                <span className="badge">{p.verified_30d} verified (30 days)</span>
                <Link className="btn btn-ghost btn-sm" to={`/app/${p.org_slug}/manage/offers`}>Offers</Link>
              </div>
            </div>
          ))}
          <h3 style={{ fontSize: "1rem", marginTop: 16 }}>Recent verified redemptions</h3>
          <ul>
            {(history?.redemptions ?? []).slice(0, 10).map((r: any) => (
              <li key={r.id}>
                {new Date(r.verified_at).toLocaleString()} — {r.provider_name}: {r.title} ({r.value_label})
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: ".82rem" }}>
            Implemented mode: server-verified QR and manual codes. POS references are stored for future integrations; no POS system is connected.
          </p>
        </section>
      </div>
    </div>
  );
}
