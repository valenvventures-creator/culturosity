import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useToast } from "./ui";

interface Token {
  qrPayload: string;
  manualCode: string;
  providerRef: string;
  expiresAt: string;
}

/**
 * Culturosity membership card. The QR is static black-on-white (no gradients or animation)
 * and encodes only an opaque, short-lived server-issued reference — never names or emails.
 */
export function MemberCard({
  programId,
  perkId,
  providerRef,
  memberName,
  programName,
  limitReached,
}: {
  programId: string;
  perkId: string;
  providerRef: string;
  memberName: string;
  programName: string;
  limitReached: boolean;
}) {
  const [token, setToken] = useState<Token | null>(null);
  const [svg, setSvg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const toast = useToast();

  useEffect(() => {
    if (!token) return;
    QRCode.toString(token.qrPayload, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }).then(setSvg);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [token]);

  const remaining = token ? Math.min(600, Math.max(0, Math.floor((new Date(token.expiresAt).getTime() - now) / 1000))) : 0;
  const expired = token && remaining === 0;

  async function issue() {
    setBusy(true);
    setErr(null);
    try {
      const t = await api.post<Token>("/redemption-tokens", { programId, perkId });
      setToken(t);
    } catch (e: any) {
      setErr(e.message);
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="member-card" aria-labelledby="member-card-title" id="member-card">
      <div className="vertical" aria-hidden>
        <span>MEMBER</span>
      </div>
      <div className="spread" style={{ alignItems: "flex-start" }}>
        <img className="card-logo" src="/brand/culturosity-logo.webp" alt="Culturosity" />
        <div style={{ textAlign: "right", fontSize: ".78rem", color: "#b4b4bf" }}>
          <div id="member-card-title" style={{ color: "#fff", fontWeight: 600 }}>
            Member card
          </div>
          <div>{programName}</div>
        </div>
      </div>
      <div style={{ margin: "14px 0 6px", fontSize: "1.05rem", fontWeight: 600 }}>{memberName}</div>
      <div style={{ fontSize: ".8rem", color: "#b4b4bf" }}>
        Provider reference <strong style={{ color: "#fff", letterSpacing: ".06em" }}>{providerRef}</strong>
      </div>
      <div style={{ marginTop: 16 }}>
        {limitReached ? (
          <p style={{ color: "#D2F538" }}>You have used this offer the maximum number of times.</p>
        ) : token && !expired ? (
          <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
            <div className="qr" role="img" aria-label="Redemption QR code. The manual code is shown beside it." dangerouslySetInnerHTML={{ __html: svg }} />
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: ".78rem", color: "#b4b4bf" }}>Manual code</div>
              <div className="code" aria-label={`Manual code ${token.manualCode.split("").join(" ")}`}>
                {token.manualCode}
              </div>
              <div style={{ fontSize: ".8rem", color: "#b4b4bf" }} aria-live="polite">
                Valid for {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
              </div>
              <div style={{ fontSize: ".78rem", color: "#b4b4bf", maxWidth: 200 }}>Show this to the provider. They verify it on their device.</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {expired ? <p style={{ color: "#D2F538", margin: 0 }}>This code expired. Generate a new one when you are with the provider.</p> : null}
            <button className="btn btn-primary" onClick={issue} disabled={busy}>
              {busy ? "Generating…" : expired ? "Generate a new code" : "Show my redemption code"}
            </button>
            <p style={{ fontSize: ".8rem", color: "#b4b4bf", margin: 0 }}>Codes last 10 minutes and work once. Generate it when you are ready to redeem.</p>
          </div>
        )}
        {err && !token ? <p role="alert" style={{ color: "#ff9aa2", fontSize: ".85rem", marginTop: 8 }}>{err}</p> : null}
      </div>
    </section>
  );
}
