// Offer lifecycle and value rules shared by client and server.

export const PERK_STATUSES = [
  "draft",
  "pending_review",
  "scheduled",
  "published",
  "paused",
  "rejected",
  "expired",
  "archived",
] as const;
export type PerkStatus = (typeof PERK_STATUSES)[number];

/**
 * Allowed stored-status transitions. "scheduled" vs "published" and "expired" are also
 * derived from the claim window at read time (see effectiveStatus), so a delayed
 * background update can never make an expired offer redeemable.
 */
export const PERK_TRANSITIONS: Record<PerkStatus, PerkStatus[]> = {
  draft: ["pending_review", "scheduled", "published", "archived"],
  pending_review: ["scheduled", "published", "rejected", "draft"],
  scheduled: ["published", "paused", "archived", "expired"],
  published: ["paused", "archived", "expired"],
  paused: ["scheduled", "published", "archived"],
  rejected: ["draft", "archived"],
  expired: ["archived", "scheduled", "published"],
  archived: [],
};

export function canTransition(from: PerkStatus, to: PerkStatus): boolean {
  return PERK_TRANSITIONS[from]?.includes(to) ?? false;
}

export type WindowLike = { status: string; starts_at: string | Date | null; ends_at: string | Date | null };

export function effectiveStatus(p: WindowLike, now: Date = new Date()): PerkStatus {
  const s = p.status as PerkStatus;
  if (s !== "published" && s !== "scheduled" && s !== "expired") return s;
  const t = now.getTime();
  if (p.ends_at && new Date(p.ends_at).getTime() <= t) return "expired";
  if (p.starts_at && new Date(p.starts_at).getTime() > t) return "scheduled";
  if (s === "expired") return "expired";
  return "published";
}

/** Initial stored status for a freshly published offer, given its window. */
export function statusForWindow(startsAt: Date | null, endsAt: Date | null, now = new Date()): PerkStatus {
  if (endsAt && endsAt.getTime() <= now.getTime()) return "expired";
  if (startsAt && startsAt.getTime() > now.getTime()) return "scheduled";
  return "published";
}

export const STATUS_LABELS: Record<PerkStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  scheduled: "Scheduled",
  published: "Live",
  paused: "Paused",
  rejected: "Rejected",
  expired: "Expired",
  archived: "Archived",
};

export const VALUE_TYPES = ["percent", "amount", "free", "bogo", "special"] as const;
export type ValueType = (typeof VALUE_TYPES)[number];

export const VALUE_TYPE_LABELS: Record<ValueType, string> = {
  percent: "Percentage savings",
  amount: "Dollar savings",
  free: "Free entry / item",
  bogo: "Buy one, get one",
  special: "Special offer",
};

export function formatMoneyMinor(minor: number, currency: string, locale = "en-CA"): string {
  const major = minor / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
  }).format(major);
}

export function defaultValueLabel(v: {
  type: ValueType;
  percent?: number | null;
  amountMinor?: number | null;
  currency?: string | null;
  label?: string | null;
}): string {
  if (v.label && v.label.trim()) return v.label.trim();
  switch (v.type) {
    case "percent":
      return `${Number(v.percent)}% off`;
    case "amount":
      return v.amountMinor && v.currency ? `${formatMoneyMinor(v.amountMinor, v.currency)} ${v.currency} off` : "Savings";
    case "free":
      return "Free";
    case "bogo":
      return "Buy one, get one";
    default:
      return "Special offer";
  }
}

export const PERK_CATEGORIES = [
  "Arts & Culture",
  "Food & Drink",
  "Wellness",
  "Fitness",
  "Travel",
  "Events & Experiences",
  "Learning",
  "Family",
  "Retail",
  "Services",
  "Technology",
  "Community",
];

export const NEW_WINDOW_DAYS_DEFAULT = 21;

/** Case-insensitive, stable A–Z comparator: provider display name, then perk title. */
export function compareAZ(
  a: { provider_name: string; title: string; id: string },
  b: { provider_name: string; title: string; id: string },
): number {
  const c = (x: string, y: string) => x.localeCompare(y, "en", { sensitivity: "base" });
  return c(a.provider_name, b.provider_name) || c(a.title, b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function directionsUrl(parts: { address_line?: string | null; city?: string | null; region?: string | null; postal_code?: string | null; country?: string | null; lat?: number | null; lng?: number | null }): string | null {
  if (parts.lat != null && parts.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${parts.lat},${parts.lng}`;
  const q = [parts.address_line, parts.city, parts.region, parts.postal_code, parts.country].filter(Boolean).join(", ");
  if (!q || !parts.address_line) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`;
}
