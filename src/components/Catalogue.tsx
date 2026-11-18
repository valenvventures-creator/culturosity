import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, prefs, qs } from "../lib/api";
import { formatWindow, formatDateTime } from "@shared/time";
import { PERK_CATEGORIES, VALUE_TYPE_LABELS, VALUE_TYPES } from "@shared/perk";
import { EmptyState, ErrorAlert, PerkImage, useToast, DemoBadge } from "./ui";
import { IconCalendar, IconFilter, IconGrid, IconHeart, IconHeartFill, IconList, IconPin, IconSearch, IconGlobe } from "./Icons";

export interface ListingPerk {
  id: string;
  title: string;
  short_description: string;
  provider_name: string;
  value_label: string;
  value_type: string;
  starts_at: string | null;
  ends_at: string | null;
  is_ongoing: boolean;
  timezone: string;
  city: string | null;
  region: string | null;
  country: string | null;
  is_online_only: boolean;
  redemption_method: string;
  image_url: string | null;
  image_alt: string;
  category: string;
  is_new: boolean;
  is_demo: boolean;
  is_favourite?: boolean;
  program_id?: string;
  program_name?: string;
  source_org_name?: string;
  source_org_kind?: string;
  next_occurrence: string | null;
  upcoming_occurrences: number;
  details_pending?: boolean;
}

function availability(p: ListingPerk) {
  if (p.details_pending && p.is_ongoing && !p.ends_at) return "Details coming soon";
  return formatWindow(p.starts_at, p.ends_at, p.is_ongoing, p.timezone);
}
function place(p: ListingPerk) {
  if (p.is_online_only) return "Online";
  return [p.city, p.region].filter(Boolean).join(", ") || p.country || "";
}

function FavButton({ perk, onToggle, size = 20 }: { perk: ListingPerk; onToggle?: (p: ListingPerk) => void; size?: number }) {
  if (!onToggle || !perk.program_id) return null;
  return (
    <button
      className="icon-btn fav"
      aria-pressed={Boolean(perk.is_favourite)}
      aria-label={perk.is_favourite ? `Remove ${perk.title} from saved` : `Save ${perk.title}`}
      onClick={(e) => {
        e.preventDefault();
        onToggle(perk);
      }}
    >
      {perk.is_favourite ? <IconHeartFill size={size} /> : <IconHeart size={size} />}
    </button>
  );
}

export function PerkCard({ perk, href, onToggleFav, index = 0 }: { perk: ListingPerk; href: string; onToggleFav?: (p: ListingPerk) => void; index?: number }) {
  return (
    <article className="perk-card" style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}>
      <div className="media">
        <PerkImage src={perk.image_url} alt={perk.image_alt || `${perk.provider_name} offer image`} />
        <div className="top-badges">
          {perk.is_new ? <span className="badge badge-new">New</span> : null}
          {perk.is_demo ? <DemoBadge /> : null}
        </div>
        <span className="badge badge-value">{perk.value_label}</span>
        <FavButton perk={perk} onToggle={onToggleFav} />
      </div>
      <div className="body">
        <div className="provider">{perk.provider_name}</div>
        <h3 className="title" title={perk.title}>
          {perk.title}
        </h3>
        <div className="meta">
          <span className="row" style={{ gap: 5 }}>
            <IconCalendar size={15} /> {availability(perk)}
          </span>
          {place(perk) ? (
            <span className="row" style={{ gap: 5 }}>
              {perk.is_online_only ? <IconGlobe size={15} /> : <IconPin size={15} />} {place(perk)}
            </span>
          ) : null}
        </div>
        {perk.next_occurrence ? (
          <div className="meta">
            Next event: {formatDateTime(perk.next_occurrence, perk.timezone)}
            {perk.upcoming_occurrences > 1 ? ` (+${perk.upcoming_occurrences - 1} more)` : ""}
          </div>
        ) : null}
        <div className="actions">
          <span className="muted" style={{ fontSize: ".78rem" }}>
            {perk.source_org_kind === "culturosity" && perk.program_name && !perk.program_name.startsWith("Culturosity") ? "From Culturosity" : perk.category}
          </span>
          <Link to={href} className="btn btn-primary btn-sm" aria-label={`Details: ${perk.provider_name} — ${perk.title}`}>
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}

export function PerkRow({ perk, href, onToggleFav, index = 0 }: { perk: ListingPerk; href: string; onToggleFav?: (p: ListingPerk) => void; index?: number }) {
  return (
    <article className="perk-row" style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}>
      <div className="thumb">
        <PerkImage src={perk.image_url} alt={perk.image_alt || `${perk.provider_name} offer image`} />
      </div>
      <div className="info">
        <div className="provider">
          {perk.provider_name} {perk.is_demo ? <DemoBadge /> : null} {perk.is_new ? <span className="badge badge-new">New</span> : null}
        </div>
        <div className="title" title={perk.title}>
          {perk.title}
        </div>
        <div className="line">
          <span className="badge badge-value">{perk.value_label}</span>
          <span>{availability(perk)}</span>
          {place(perk) ? <span>· {place(perk)}</span> : null}
        </div>
      </div>
      <div className="row-actions">
        {onToggleFav && perk.program_id ? (
          <button
            className="icon-btn"
            aria-pressed={Boolean(perk.is_favourite)}
            aria-label={perk.is_favourite ? `Remove ${perk.title} from saved` : `Save ${perk.title}`}
            onClick={() => onToggleFav(perk)}
          >
            {perk.is_favourite ? <IconHeartFill /> : <IconHeart />}
          </button>
        ) : null}
        <Link to={href} className="btn btn-primary btn-sm" aria-label={`Details: ${perk.provider_name} — ${perk.title}`}>
          Details
        </Link>
      </div>
    </article>
  );
}

interface Filters {
  q: string;
  sort: "az" | "new" | "ending";
  favourites: boolean;
  onlyNew: boolean;
  category: string;
  city: string;
  region: string;
  country: string;
  mode: string;
  valueType: string;
  from: string;
  to: string;
}
const EMPTY: Filters = { q: "", sort: "new", favourites: false, onlyNew: false, category: "", city: "", region: "", country: "", mode: "", valueType: "", from: "", to: "" };

/**
 * Shared catalogue used for Culturosity Perks and company program catalogues.
 * `endpoint`: "/catalogue" (signed-in) or "/public/perks" (teaser).
 */
export function CatalogueView({
  endpoint,
  scope,
  detailHref,
  signedIn,
  heading,
}: {
  endpoint: "/catalogue" | "/public/perks";
  scope?: string;
  detailHref: (p: ListingPerk) => string;
  signedIn: boolean;
  heading?: string;
}) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">(() => prefs.get("catalogueView", typeof window !== "undefined" && window.innerWidth < 720 ? "list" : "grid"));
  const [showFilters, setShowFilters] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => {
    const t = setTimeout(() => setF((x) => ({ ...x, q })), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    prefs.set("catalogueView", view);
  }, [view]);

  const params = {
    scope,
    q: f.q,
    sort: f.sort,
    favourites: f.favourites ? 1 : undefined,
    new: f.onlyNew ? 1 : undefined,
    category: f.category,
    city: f.city,
    region: f.region,
    country: f.country,
    mode: f.mode,
    valueType: f.valueType,
    from: f.from,
    to: f.to,
  };
  const key = ["catalogue", endpoint, params];
  const { data, isLoading, error, isFetching } = useQuery<{ perks: ListingPerk[] }>({
    queryKey: key,
    queryFn: () => api.get(`${endpoint}${qs(params)}`),
    placeholderData: (prev) => prev,
  });
  const fav = useMutation({
    mutationFn: (p: ListingPerk) =>
      p.is_favourite ? api.del("/favourites", { programId: p.program_id, perkId: p.id }) : api.post("/favourites", { programId: p.program_id, perkId: p.id }),
    onSuccess: (_r, p) => {
      toast(p.is_favourite ? "Removed from saved perks" : "Saved to your perks");
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      qc.invalidateQueries({ queryKey: ["favourites"] });
    },
    onError: (e: any) => toast(e.message, "error"),
  });

  const perks = data?.perks ?? [];
  const cities = useMemo(() => [...new Set(perks.map((p) => p.city).filter(Boolean))].sort() as string[], [perks]);
  const activeFilterCount = ["category", "city", "region", "country", "mode", "valueType", "from", "to"].filter((k) => (f as any)[k]).length;
  const anyFilter = activeFilterCount > 0 || f.q || f.favourites;

  return (
    <section aria-labelledby="catalogue-heading">
      {heading ? (
        <h2 id="catalogue-heading" className="sr-only">
          {heading}
        </h2>
      ) : null}
      <div className="catalogue-toolbar">
        <div className="search-wrap">
          <IconSearch />
          <label htmlFor="perk-search" className="sr-only">
            Search perks by provider, title, category or location
          </label>
          <input
            id="perk-search"
            className="input dark-input"
            type="search"
            placeholder="Search providers, perks, categories or places"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="spread">
          <div className="row" role="group" aria-label="Quick filters">
            {signedIn ? (
              <button className="chip" aria-pressed={f.favourites} onClick={() => setF((x) => ({ ...x, favourites: !x.favourites }))}>
                <IconHeart size={16} /> Favourites
              </button>
            ) : null}
            {/* New and A–Z are alternative sort orders (newest publication first / provider A–Z), as in the Culturosity app. */}
            <button className="chip" aria-pressed={f.sort === "new"} onClick={() => setF((x) => ({ ...x, sort: "new" }))}>
              New
            </button>
            <button className="chip" aria-pressed={f.sort === "az"} onClick={() => setF((x) => ({ ...x, sort: "az" }))}>
              A–Z
            </button>
            <button className="chip" aria-pressed={f.sort === "ending"} onClick={() => setF((x) => ({ ...x, sort: x.sort === "ending" ? "new" : "ending" }))}>
              Ending soon
            </button>
            <button className="chip" aria-expanded={showFilters} aria-controls="filters-panel" onClick={() => setShowFilters((v) => !v)}>
              <IconFilter size={16} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </button>
          </div>
          <div className="row">
            {anyFilter ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setF(EMPTY);
                  setQ("");
                }}
              >
                Clear all
              </button>
            ) : null}
            <div className="segmented" role="group" aria-label="Layout">
              <button aria-pressed={view === "grid"} onClick={() => setView("grid")} aria-label="Grid view">
                <IconGrid size={18} />
              </button>
              <button aria-pressed={view === "list"} onClick={() => setView("list")} aria-label="List view">
                <IconList size={18} />
              </button>
            </div>
          </div>
        </div>
        {showFilters ? (
          <div className="filters-panel" id="filters-panel">
            <label>
              Category
              <select className="select" value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}>
                <option value="">All categories</option>
                {PERK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>
              City
              <input className="input" list="city-list" value={f.city} onChange={(e) => setF((x) => ({ ...x, city: e.target.value }))} placeholder="Any city" />
              <datalist id="city-list">{cities.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label>
              Province / state
              <input className="input" value={f.region} onChange={(e) => setF((x) => ({ ...x, region: e.target.value }))} placeholder="e.g. ON" />
            </label>
            <label>
              Country
              <select className="select" value={f.country} onChange={(e) => setF((x) => ({ ...x, country: e.target.value }))}>
                <option value="">Any country</option>
                <option>Canada</option>
                <option>United States</option>
              </select>
            </label>
            <label>
              Online / in person
              <select className="select" value={f.mode} onChange={(e) => setF((x) => ({ ...x, mode: e.target.value }))}>
                <option value="">Any</option>
                <option value="online">Online</option>
                <option value="in_person">In person</option>
              </select>
            </label>
            <label>
              Offer type
              <select className="select" value={f.valueType} onChange={(e) => setF((x) => ({ ...x, valueType: e.target.value }))}>
                <option value="">Any offer type</option>
                {VALUE_TYPES.map((v) => <option key={v} value={v}>{VALUE_TYPE_LABELS[v]}</option>)}
              </select>
            </label>
            <label>
              Available from
              <input className="input" type="date" value={f.from} onChange={(e) => setF((x) => ({ ...x, from: e.target.value }))} />
            </label>
            <label>
              Available until
              <input className="input" type="date" value={f.to} onChange={(e) => setF((x) => ({ ...x, to: e.target.value }))} />
            </label>
          </div>
        ) : null}
      </div>

      <div aria-live="polite" className="muted" style={{ fontSize: ".85rem", marginBottom: 12, minHeight: 22 }}>
        {isLoading ? "Loading perks…" : `${perks.length} ${perks.length === 1 ? "perk" : "perks"}${isFetching ? " · updating…" : ""}`}
      </div>
      {error ? <ErrorAlert error={error} title="We couldn't load perks." /> : null}
      {isLoading ? (
        <div className="perk-grid">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" />)}
        </div>
      ) : perks.length === 0 ? (
        <EmptyState
          title={f.favourites ? "No saved perks yet" : anyFilter ? "No perks match these filters" : "No perks are available yet"}
          action={
            anyFilter ? (
              <button className="btn btn-ghost" onClick={() => { setF(EMPTY); setQ(""); }}>
                Clear filters
              </button>
            ) : undefined
          }
        >
          {f.favourites ? "Tap the heart on any perk to save it here." : anyFilter ? "Try a broader search or remove a filter." : "New offers appear here automatically as soon as they are published."}
        </EmptyState>
      ) : view === "grid" ? (
        <div className="perk-grid">
          {perks.map((p, i) => <PerkCard key={`${p.program_id}-${p.id}`} perk={p} index={i} href={detailHref(p)} onToggleFav={signedIn ? (x) => fav.mutate(x) : undefined} />)}
        </div>
      ) : (
        <div className="perk-list">
          {perks.map((p, i) => <PerkRow key={`${p.program_id}-${p.id}`} perk={p} index={i} href={detailHref(p)} onToggleFav={signedIn ? (x) => fav.mutate(x) : undefined} />)}
        </div>
      )}
    </section>
  );
}
