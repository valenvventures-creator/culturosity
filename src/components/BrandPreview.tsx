// Sales "Preview": shows a prospect what their own branded perks app could look like, on a phone
// and a tablet side by side. Everything stays in the browser — nothing is uploaded or saved on the
// server. Perk listings come from the live public catalogue (illustration only).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { api } from "../lib/api";

export interface BrandState {
  name: string;
  tagline: string;
  headline: string;
  description: string;
  logo: string | null; // data URL, kept in this browser only
  c1: string; // header & navigation
  c2: string; // value badge
  c3: string; // actions, offer card, About background
  privacyUrl: string;
  termsUrl: string;
}

export const PRESETS: { name: string; c1: string; c2: string; c3: string }[] = [
  { name: "Culturosity", c1: "#000000", c2: "#F472C4", c3: "#7CF3AD" },
  { name: "Ocean", c1: "#0B3D91", c2: "#F59E0B", c3: "#7DD3FC" },
  { name: "Forest", c1: "#14532D", c2: "#DC2626", c3: "#A7F3D0" },
  { name: "Sunset", c1: "#7C2D12", c2: "#DB2777", c3: "#FDBA74" },
  { name: "Royal", c1: "#3B0764", c2: "#EAB308", c3: "#C4B5FD" },
  { name: "Slate", c1: "#1F2937", c2: "#0EA5E9", c3: "#E5E7EB" },
];

export const DEFAULT_BRAND: BrandState = {
  name: "",
  tagline: "LIFE TO THE FULLEST",
  headline: "Exclusive perks for our people.",
  description:
    "Our perks program brings you curated offers on culture, dining, wellness and experiences across the city.\n\nIt's our way of saying thank you — and of helping you discover something new.",
  logo: null,
  c1: PRESETS[0].c1,
  c2: PRESETS[0].c2,
  c3: PRESETS[0].c3,
  privacyUrl: "",
  termsUrl: "",
};

// ---------- colour helpers ----------
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Black or white text, whichever reads better on `hex`. */
export function onColour(hex: string) {
  return luminance(hex) > 0.36 ? "#000000" : "#FFFFFF";
}
function mix(hex: string, with_: string, t: number) {
  const a = hexToRgb(hex);
  const b = hexToRgb(with_);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number) {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}
/** A light but lively tint of a colour (for buttons and highlights). */
function brightTint(hex: string) {
  const [h, s] = toHsl(hex);
  return fromHsl(h, Math.max(s, 0.65), 0.74);
}
/** A gentle second gradient stop: lighter, with the hue nudged (like the app's mint → cyan). */
function gradientEnd(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return mix(rgbToHex(r * 0.85, g * 0.98, Math.min(255, b * 1.25 + 30)), "#FFFFFF", 0.12);
}

/** Suggest three colours from a logo: its darkest strong colour, its most vivid, and a light tint. */
export async function coloursFromLogo(dataUrl: string): Promise<{ c1: string; c2: string; c3: string } | null> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode().catch(() => undefined);
  if (!img.width) return null;
  const size = 48;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue; // transparent
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  const cols = [...buckets.values()]
    .filter((e) => e.n > 3)
    .map((e) => {
      const hex = rgbToHex(e.r / e.n, e.g / e.n, e.b / e.n);
      const [r, g, b] = hexToRgb(hex);
      const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
      return { hex, n: e.n, sat, lum: luminance(hex) };
    });
  if (!cols.length) return null;
  const notWhite = cols.filter((c) => c.lum < 0.85);
  const vivid = [...notWhite].sort((a, b) => b.sat * Math.log(b.n + 1) - a.sat * Math.log(a.n + 1))[0];
  const dark = [...notWhite].sort((a, b) => a.lum - b.lum)[0];
  const c1 = dark && dark.lum < 0.2 ? dark.hex : vivid ? mix(vivid.hex, "#000000", 0.55) : "#000000";
  const c2 = vivid && vivid.sat > 0.25 ? vivid.hex : "#F472C4";
  const second = [...notWhite].filter((c) => c.hex !== c2 && c.sat > 0.2).sort((a, b) => b.n - a.n)[0];
  const c3 = brightTint(second?.hex ?? c2);
  return { c1, c2, c3 };
}

/** Read an uploaded logo into a small data URL (raster images are scaled to max 600px). */
export async function readLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(file.type)) throw new Error("Use a PNG, JPG, WebP, GIF or SVG image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Use an image under 5 MB.");
  const url = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
  if (file.type === "image/svg+xml") return url; // shown via <img>, so scripts in SVGs never run
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, 600 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

// ---------- preview screens ----------
type Screen = "perks" | "details" | "about";
interface Perk {
  id: string;
  title: string;
  provider_name: string;
  value_label: string;
  image_url: string | null;
  short_description: string;
}

function useDemoPerks(seed: number) {
  const { data } = useQuery<any>({ queryKey: ["preview-perks"], queryFn: () => api.get("/public/perks?sort=new"), staleTime: 300_000 });
  return useMemo(() => {
    const all: Perk[] = (data?.perks ?? []).filter((p: any) => !p.is_demo && !p.details_pending && p.image_url);
    // Deterministic shuffle per seed so both devices show the same "random" selection.
    let s = seed * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    return [...all].sort(() => rnd() - 0.5).slice(0, 8);
  }, [data, seed]);
}

function usePerkDetail(id: string | undefined) {
  return useQuery<any>({ queryKey: ["preview-perk", id], queryFn: () => api.get(`/perks/${id}`), enabled: Boolean(id), staleTime: 300_000 });
}

function useDemoQr(text: string) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#000000", light: "#ffffff" } }).then(setSvg);
  }, [text]);
  return svg;
}

function Logo({ brand, className }: { brand: BrandState; className?: string }) {
  if (brand.logo) return <img className={className} src={brand.logo} alt={`${brand.name || "Company"} logo`} />;
  return <div className={`${className ?? ""} bp-logo-ph`}>{(brand.name || "Your logo").slice(0, 18)}</div>;
}

function firstParagraphs(text: string, max = 2) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\s*\*{2,}\s*promo\s*code\s*\*{2,}\s*$/im, "").trim())
    .filter(Boolean)
    .slice(0, max);
}

interface ScreenProps {
  brand: BrandState;
  perks: Perk[];
  screen: Screen;
  perkId: string | undefined;
  go: (s: Screen, perkId?: string) => void;
  device: "phone" | "tablet";
}

function Header({ brand, title, back, onBack }: { brand: BrandState; title: string; back?: boolean; onBack?: () => void }) {
  return (
    <div className="bp-header">
      {back ? (
        <button type="button" className="bp-back" onClick={onBack} aria-label="Back">
          ‹
        </button>
      ) : brand.logo ? (
        <img className="bp-header-logo" src={brand.logo} alt="" />
      ) : (
        <span />
      )}
      <div className="bp-header-title">{title}</div>
      <span />
    </div>
  );
}

function Nav({ screen, go }: { screen: Screen; go: ScreenProps["go"] }) {
  return (
    <div className="bp-nav">
      <button type="button" className={screen !== "about" ? "on" : ""} onClick={() => go("perks")}>PERKS</button>
      <button type="button" className={screen === "about" ? "on" : ""} onClick={() => go("about")}>ABOUT</button>
      <button type="button">ACCOUNT</button>
    </div>
  );
}

function PerksScreen({ brand, perks, go, device }: ScreenProps) {
  return (
    <>
      <Header brand={brand} title="PERKS" />
      <div className="bp-tabs">
        <span>♥</span>
        <span className="on">New</span>
        <span>A–Z</span>
      </div>
      <div className={`bp-scroll ${device === "tablet" ? "bp-grid" : ""}`}>
        {perks.map((p) =>
          device === "tablet" ? (
            <button type="button" className="bp-card" key={p.id} onClick={() => go("details", p.id)}>
              <div className="bp-card-img">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : null}</div>
              <div className="bp-card-body">
                <strong>{p.provider_name}</strong>
                <span>{p.title}</span>
                <div className="bp-actions">
                  <em>{p.value_label.toUpperCase()}</em>
                  <b>DETAILS</b>
                </div>
              </div>
            </button>
          ) : (
            <button type="button" className="bp-row" key={p.id} onClick={() => go("details", p.id)}>
              <div className="bp-thumb">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : null}</div>
              <div className="bp-info">
                <strong>{p.provider_name}</strong>
                <span>{p.title}</span>
                <div className="bp-actions">
                  <em>{p.value_label.toUpperCase()}</em>
                  <b>DETAILS</b>
                </div>
              </div>
            </button>
          ),
        )}
      </div>
    </>
  );
}

function DetailsScreen({ brand, perks, perkId, go, device }: ScreenProps) {
  const listing = perks.find((p) => p.id === perkId) ?? perks[0];
  const { data } = usePerkDetail(listing?.id);
  const d = data?.perk;
  const qr = useDemoQr(`DEMO:${(brand.name || "company").slice(0, 40)}:${listing?.id ?? ""}`);
  if (!listing) return <Header brand={brand} title="DETAILS" />;
  const paras = firstParagraphs(d?.full_description || listing.short_description || "", device === "tablet" ? 3 : 2);
  const card = (
    <div className="bp-membercard">
      <Logo brand={brand} className="bp-mc-logo" />
      <div className="bp-mc-qr" dangerouslySetInnerHTML={{ __html: qr }} />
      <div className="bp-mc-band">
        <span>MEMBER</span>
      </div>
    </div>
  );
  const contacts = (
    <div className="bp-contacts">
      {d?.provider_website ? (
        <div>
          <small>WEBSITE</small>
          {new URL(d.provider_website).host}
        </div>
      ) : null}
      {d?.provider_email ? (
        <div>
          <small>EMAIL</small>
          {d.provider_email}
        </div>
      ) : null}
    </div>
  );
  return (
    <>
      <Header brand={brand} title="DETAILS" back onBack={() => go("perks")} />
      <div className="bp-scroll bp-details">
        <div className={device === "tablet" ? "bp-split" : ""}>
          <div>
            <div className="bp-pill">
              <em>{listing.value_label.toUpperCase()}</em>
              <b>USE PERK</b>
            </div>
            <div className="bp-hero">{listing.image_url ? <img src={listing.image_url} alt="" /> : null}</div>
            <div className="bp-provider">{listing.provider_name}</div>
            {device === "tablet" ? card : null}
          </div>
          <div>
            <div className="bp-offer">
              <strong>{listing.title}</strong>
              {paras.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {contacts}
            {device === "phone" ? card : null}
          </div>
        </div>
      </div>
    </>
  );
}

function AboutScreen({ brand }: ScreenProps) {
  const [sheet, setSheet] = useState<null | "privacy" | "terms">(null);
  const url = sheet === "privacy" ? brand.privacyUrl : brand.termsUrl;
  return (
    <>
      <div className="bp-header bp-header-tagline">
        <span />
        <div className="bp-header-title">{(brand.tagline || "ABOUT").toUpperCase()}</div>
        <span />
      </div>
      <div className="bp-scroll bp-about">
        <Logo brand={brand} className="bp-about-logo" />
        <div className="bp-about-card">
          {brand.headline ? <strong>{brand.headline}</strong> : null}
          {(brand.description || "").split(/\n\s*\n/).filter(Boolean).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <button type="button" className="bp-about-btn" onClick={() => setSheet("privacy")}>PRIVACY POLICY</button>
          <button type="button" className="bp-about-btn" onClick={() => setSheet("terms")}>TERMS OF USE</button>
        </div>
      </div>
      {sheet ? (
        <div className="bp-sheet" role="dialog" aria-label={sheet === "privacy" ? "Privacy Policy" : "Terms of Use"}>
          <div className="bp-sheet-card">
            <strong>{sheet === "privacy" ? "Privacy Policy" : "Terms of Use"}</strong>
            <p>
              {url
                ? <>In the app this opens <span className="bp-link">{url.replace(/^https?:\/\//, "")}</span>.</>
                : <>{brand.name || "Your organization"}’s {sheet === "privacy" ? "privacy policy" : "terms of use"} appears here.</>}
            </p>
            <button type="button" className="bp-about-btn" onClick={() => setSheet(null)}>CLOSE</button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function DeviceScreen(props: ScreenProps) {
  const { brand, screen } = props;
  const style = {
    "--bp-c1": brand.c1,
    "--bp-c1-on": onColour(brand.c1),
    "--bp-c2": brand.c2,
    "--bp-c2-on": onColour(brand.c2),
    "--bp-c3": brand.c3,
    "--bp-c3-on": onColour(brand.c3),
    "--bp-c3-end": gradientEnd(brand.c3),
    "--bp-c3-soft": mix(brand.c3, "#FFFFFF", 0.35),
  } as CSSProperties;
  return (
    <div className="bp-app" style={style}>
      <div className="bp-status">
        <span>9:41</span>
        {props.device === "phone" ? <span className="bp-island" /> : <span />}
        <span className="bp-icons">●●● ▮</span>
      </div>
      <div className="bp-body">
        {screen === "perks" ? <PerksScreen {...props} /> : screen === "details" ? <DetailsScreen {...props} /> : <AboutScreen {...props} />}
      </div>
      <Nav screen={screen} go={props.go} />
    </div>
  );
}

export function DevicePreview({ brand, seed, screen, setScreen, maxZoom = 1 }: { brand: BrandState; seed: number; screen: Screen; setScreen: (s: Screen) => void; maxZoom?: number }) {
  const perks = useDemoPerks(seed);
  const [perkId, setPerkId] = useState<string | undefined>();
  useEffect(() => {
    if (!perkId && perks[0]) setPerkId(perks[0].id);
  }, [perks, perkId]);
  useEffect(() => {
    setPerkId(perks[0]?.id);
  }, [seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (s: Screen, id?: string) => {
    if (id) setPerkId(id);
    setScreen(s);
  };
  const common = { brand, perks, screen, perkId, go };
  // Scale both devices together so they always sit side by side in the space available.
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const NATURAL = 1010; // tablet + gap + phone at full size
    const ro = new ResizeObserver(([e]) => setZoom(Math.max(0.3, Math.min(maxZoom, (e.contentRect.width - 4) / NATURAL))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxZoom]);
  return (
    <div className="bp-stage-frame" ref={frame}>
    <div className="bp-devices" style={{ zoom }}>
      <figure className="bp-tablet" aria-label="Tablet preview">
        <div className="bp-tablet-screen">
          <DeviceScreen {...common} device="tablet" />
        </div>
        <figcaption>Tablet</figcaption>
      </figure>
      <figure className="bp-phone" aria-label="Phone preview">
        <div className="bp-phone-screen">
          <DeviceScreen {...common} device="phone" />
        </div>
        <figcaption>Phone</figcaption>
      </figure>
    </div>
    </div>
  );
}

export function ColourField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  // A draft only while typing; otherwise the box always shows the current colour.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="bp-colour">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label} colour picker`} />
      <div>
        <label>
          <span className="bp-colour-label">{label}</span>
          <input
            className="input"
            value={draft ?? value}
            onChange={(e) => {
              setDraft(e.target.value);
              const v = e.target.value.trim().replace("#", "");
              if (/^[0-9a-fA-F]{6}$/.test(v)) onChange(("#" + v).toUpperCase());
            }}
            onBlur={() => setDraft(null)}
            spellCheck={false}
            maxLength={7}
          />
        </label>
        <div className="bp-colour-hint">{hint}</div>
      </div>
    </div>
  );
}

export function Swatches({ c1, c2, c3 }: { c1: string; c2: string; c3: string }): ReactNode {
  return (
    <span className="bp-swatches" aria-hidden>
      <i style={{ background: c1 }} />
      <i style={{ background: c2 }} />
      <i style={{ background: c3 }} />
    </span>
  );
}
