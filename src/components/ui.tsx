import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { ApiError } from "../lib/api";
import { STATUS_LABELS, type PerkStatus } from "@shared/perk";
import { IconClose } from "./Icons";

// ---------- Brand ----------
export function Logo({ height = 40, className }: { height?: number; className?: string }) {
  return (
    <picture>
      <source srcSet="/brand/culturosity-logo.webp" type="image/webp" />
      <img src="/brand/culturosity-logo.png" alt="Culturosity" height={height} style={{ height, width: "auto" }} className={className} />
    </picture>
  );
}

/** Logo-inspired floating dots. Purely decorative; disabled for reduced motion via CSS. */
export function DotField({ density = 22, seed = 7, centered = false, edgeOnly = false }: { density?: number; seed?: number; centered?: boolean; edgeOnly?: boolean }) {
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const dots = Array.from({ length: density }, (_, i) => {
    const t = rnd();
    const color = t < 0.45 ? "#D2F538" : t < 0.85 ? "#57F6C3" : "#9BF07A";
    return { cx: rnd() * 100, cy: rnd() * 100, r: 0.4 + rnd() * 2.6, color, delay: -(rnd() * 9), op: 0.25 + rnd() * 0.55, i };
  });
  return (
    <svg className={`dotfield ${centered ? "full-edge" : ""} ${edgeOnly ? "edge-only" : ""}`} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {dots.map((d) => (
        <circle key={d.i} cx={d.cx} cy={d.cy} r={d.r} fill={d.color} opacity={d.op} style={{ animationDelay: `${d.delay}s` }} />
      ))}
    </svg>
  );
}

// ---------- Feedback ----------
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="row" style={{ gap: 10 }}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" fill="none" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="#57F6C3" strokeWidth="3" fill="none" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
        </path>
      </svg>
      <span>{label}…</span>
    </span>
  );
}

export function ErrorAlert({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;
  const e = error as ApiError;
  return (
    <div className="alert alert-error" role="alert">
      <strong>{title ?? "Something went wrong."}</strong> {e.message}
      {e.requestId ? <span className="muted" style={{ display: "block", fontSize: ".8rem" }}>Reference: {e.requestId}</span> : null}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children ? <div className="muted" style={{ maxWidth: 520, margin: "0 auto 14px" }}>{children}</div> : null}
      {action}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`status status-${status}`}>{STATUS_LABELS[status as PerkStatus] ?? status}</span>;
}

export function DemoBadge() {
  return <span className="badge badge-demo">Demo</span>;
}

// ---------- Form fields ----------
interface FieldProps {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden style={{ color: "var(--danger)" }}> *</span> : null}
      </label>
      {children({ id, describedBy: [hintId, errId].filter(Boolean).join(" ") || undefined, invalid: Boolean(error) })}
      {hint ? <div className="hint" id={hintId}>{hint}</div> : null}
      {error ? <div className="error" id={errId}>{error}</div> : null}
    </div>
  );
}

export function TextField(
  props: { label: ReactNode; error?: string; hint?: ReactNode; required?: boolean } & InputHTMLAttributes<HTMLInputElement>,
) {
  const { label, error, hint, required, className, ...rest } = props;
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <input id={id} className={`input ${className ?? ""}`} aria-describedby={describedBy} aria-invalid={invalid} aria-required={required} {...rest} />
      )}
    </Field>
  );
}
export function TextArea(
  props: { label: ReactNode; error?: string; hint?: ReactNode; required?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const { label, error, hint, required, ...rest } = props;
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => <textarea id={id} className="textarea" aria-describedby={describedBy} aria-invalid={invalid} aria-required={required} {...rest} />}
    </Field>
  );
}
export function SelectField(
  props: { label: ReactNode; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>,
) {
  const { label, error, hint, required, children, ...rest } = props;
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <select id={id} className="select" aria-describedby={describedBy} aria-invalid={invalid} aria-required={required} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}
export function Checkbox({ label, checked, onChange, hint }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint ? <span className="hint" style={{ display: "block", fontSize: ".82rem", color: "var(--ink-muted)" }}>{hint}</span> : null}
      </span>
    </label>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; text: string; kind: "ok" | "error" };
const ToastCtx = createContext<(text: string, kind?: "ok" | "error") => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite" role="status">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- Dialogs (focus-trapped) ----------
function useFocusTrap(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
    (el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(sel))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && el) {
        const items = Array.from(el.querySelectorAll<HTMLElement>(sel)).filter((x) => x.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      prev?.focus?.();
    };
  }, [open, onClose]);
  return ref;
}

export function Drawer({ open, onClose, title, children, actions }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"} ref={ref}>
        <header>
          <h2 style={{ fontSize: "1.15rem", margin: 0 }}>{title}</h2>
          <div className="row">
            {actions}
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <IconClose />
            </button>
          </div>
        </header>
        <div className="drawer-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useFocusTrap(open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
        <div className="spread" style={{ marginBottom: 12 }}>
          <h2 id="modal-title" style={{ fontSize: "1.25rem", margin: 0 }}>
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

// ---------- Data display ----------
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="num">{value}</div>
      <div className="lbl">{label}</div>
      {hint ? <div className="muted" style={{ fontSize: ".75rem", marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

/** Grouped bar chart (SVG) with an accessible table fallback. */
export function BarChart({
  data,
  series,
  title,
}: {
  data: { label: string; values: Record<string, number> }[];
  series: { key: string; label: string; color: string }[];
  title: string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const W = 640, H = 220, pad = 28;
  const gw = (W - pad * 2) / Math.max(1, data.length);
  const bw = Math.max(3, Math.min(16, (gw - 6) / series.length));
  return (
    <figure className="chart" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H + 24}`} role="img" aria-label={title}>
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={pad} x2={W - pad} y1={pad + (H - pad * 2) * (1 - t) + 8} y2={pad + (H - pad * 2) * (1 - t) + 8} stroke="#e4e4ea" />
            <text x={4} y={pad + (H - pad * 2) * (1 - t) + 12} fontSize="10" fill="#6b6b76">
              {Math.round(max * t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={d.label}>
            {series.map((s, j) => {
              const v = d.values[s.key] ?? 0;
              const h = ((H - pad * 2) * v) / max;
              return <rect key={s.key} x={pad + i * gw + 3 + j * bw} y={H - pad + 8 - h} width={bw - 2} height={h} rx="2" fill={s.color} />;
            })}
            {i % Math.ceil(data.length / 7) === 0 ? (
              <text x={pad + i * gw + 2} y={H + 18} fontSize="10" fill="#6b6b76">
                {d.label.slice(5)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <figcaption className="legend">
        {series.map((s) => (
          <span key={s.key}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </figcaption>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th>Date</th>
            {series.map((s) => <th key={s.key}>{s.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <td>{d.label}</td>
              {series.map((s) => <td key={s.key}>{d.values[s.key] ?? 0}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function PerkImage({ src, alt, eager }: { src: string | null; alt: string; eager?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken)
    return (
      <div className="fallback-art" role="img" aria-label={alt || "Culturosity offer"}>
        <img src="/brand/culturosity-logo.webp" alt="" />
      </div>
    );
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setBroken(true)} />;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Culturosity` : "Culturosity";
  }, [title]);
}
