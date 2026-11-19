import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../lib/api";
import { useToast } from "./ui";
import { IconLock } from "./Icons";

/** "23 h 59 min" for long periods, "4:05" in the last hour. */
function validFor(seconds: number) {
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

interface Token {
  qrPayload: string;
  manualCode: string;
  providerRef: string;
  expiresAt: string;
  expiresInSeconds?: number;
  /** Local time the code arrived (performance clock, not the device's wall clock). */
  receivedAt?: number;
}

function useQrSvg(payload: string | null | undefined) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    if (!payload) {
      setSvg("");
      return;
    }
    let live = true;
    // Static black-on-white with a quiet zone: the most reliable for point-of-sale scanners.
    QRCode.toString(payload, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } }).then((s) => {
      if (live) setSvg(s);
    });
    return () => {
      live = false;
    };
  }, [payload]);
  return svg;
}

/**
 * Culturosity member card, as in the app: black card, Culturosity logo, the perk's own QR code
 * (each perk has a unique code that providers link to their point-of-sale system) and a vertical
 * MEMBER band. A one-time verification code is available for providers who verify in Culturosity.
 */
export function MemberCard({
  programId,
  perkId,
  providerRef,
  perkQr,
  memberName,
  programName,
  limitReached,
  perkLabel,
}: {
  programId: string;
  perkId: string;
  providerRef: string;
  perkQr: string | null;
  memberName: string;
  programName: string;
  limitReached: boolean;
  perkLabel: string;
}) {
  const [token, setToken] = useState<Token | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const toast = useToast();
  const perkSvg = useQrSvg(perkQr);
  const tokenSvg = useQrSvg(token?.qrPayload);

  useEffect(() => {
    if (!token) return;
    const t = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(t);
  }, [token]);

  // Count down from when the code arrived, so a wrong device clock can't make a new code look expired.
  // (The server still enforces the real expiry.)
  const ttl = token ? token.expiresInSeconds ?? 24 * 60 * 60 : 0;
  const remaining = token ? Math.min(ttl, Math.max(0, Math.floor(ttl - (now - (token.receivedAt ?? now)) / 1000))) : 0;
  const expired = token && remaining === 0;

  async function issue() {
    setBusy(true);
    setErr(null);
    try {
      const t = await api.post<Token>("/redemption-tokens", { programId, perkId });
      const at = performance.now();
      setNow(at);
      setToken({ ...t, receivedAt: at });
    } catch (e: any) {
      setErr(e.message);
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  const verification = limitReached ? (
    <p className="mc-note mc-warn">You have used this offer the maximum number of times.</p>
  ) : token && !expired ? (
    <div className="mc-token">
      <div className="mc-qr mc-qr-sm" role="img" aria-label="One-time verification QR code. The manual code is shown beside it." dangerouslySetInnerHTML={{ __html: tokenSvg }} />
      <div style={{ display: "grid", gap: 4 }}>
        <div className="mc-note">One-time code</div>
        <div className="mc-code" aria-label={`Manual code ${token.manualCode.split("").join(" ")}`}>{token.manualCode}</div>
        <div className="mc-note" aria-live="polite">
          Valid for {validFor(remaining)} · provider {token.providerRef}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ display: "grid", gap: 8 }}>
      {expired ? <p className="mc-note mc-warn">This code expired. Generate a new one when you are with the provider.</p> : null}
      <button className="btn btn-ghost btn-sm mc-btn" onClick={issue} disabled={busy}>
        {busy ? "Generating…" : expired ? "Generate a new code" : "Get a one-time verification code"}
      </button>
      <p className="mc-note">For providers who verify members in Culturosity. Codes last 24 hours and work once.</p>
      {err ? <p role="alert" className="mc-note mc-err">{err}</p> : null}
    </div>
  );

  return (
    <section className="mcard-wrap" aria-labelledby="member-card-title" id="member-card">
      <div className="mcard">
        <div className="mcard-main">
          <img className="mcard-logo" src="/brand/culturosity-logo.webp" alt="Culturosity" />
          <div className="mcard-who">
            <div id="member-card-title" className="mcard-name">{memberName}</div>
            <div className="mcard-sub">{programName}</div>
          </div>
        </div>
        {perkQr ? (
          <div className="mc-qr" role="img" aria-label={`QR code for ${perkLabel}. Show it at checkout.`} dangerouslySetInnerHTML={{ __html: perkSvg }} />
        ) : null}
        <div className="mcard-band" aria-hidden>
          <span>MEMBER</span>
        </div>
      </div>
      <p className="mc-hint">
        {perkQr ? "Show this card at checkout — the provider scans this perk’s QR code at their point of sale." : "Show this card to the provider when you redeem."}
      </p>
      <details className="mc-verify" open={Boolean(token)}>
        <summary>Provider asks for a verification code?</summary>
        {verification}
      </details>
    </section>
  );
}

/** Signed-out placeholder in the same shape as the member card. */
export function LockedMemberCard({ signInHref }: { signInHref: string }) {
  return (
    <section className="mcard-wrap" aria-label="Member card (sign in to view)">
      <div className="mcard mcard-locked">
        <div className="mcard-main">
          <img className="mcard-logo" src="/brand/culturosity-logo.webp" alt="Culturosity" />
          <div className="mcard-who">
            <div className="mcard-name">Your member card</div>
            <div className="mcard-sub">Culturosity Perks</div>
          </div>
        </div>
        <div className="mc-qr mc-qr-locked" aria-hidden>
          <IconLock size={28} />
        </div>
        <div className="mcard-band" aria-hidden>
          <span>MEMBER</span>
        </div>
      </div>
      <p className="mc-hint">
        <Link to={signInHref}>Sign in free</Link> to show this perk’s QR code at checkout.
      </p>
    </section>
  );
}
