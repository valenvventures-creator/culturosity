import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { useMe } from "../lib/session";
import { formatWindow, formatDateTime } from "@shared/time";
import { directionsUrl, isSafeHttpUrl } from "@shared/perk";
import { MemberCard } from "./MemberCard";
import { DemoBadge, ErrorAlert, PerkImage, Spinner, useDocumentTitle, useToast } from "./ui";
import {
  IconBack,
  IconCalendar,
  IconClock,
  IconCopy,
  IconDirections,
  IconExternal,
  IconGlobe,
  IconHeart,
  IconHeartFill,
  IconMail,
  IconPhone,
  IconPin,
  IconShare,
  IconTicket,
  IconUsers,
} from "./Icons";

export function PerkDetailPage({ perkId, programId, backTo, backLabel }: { perkId: string; programId?: string; backTo: string; backLabel: string }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ["perk", perkId, programId, me?.user?.id],
    queryFn: () => api.get(`/perks/${perkId}${qs({ programId })}`),
    retry: false,
  });
  const perk = data?.perk;
  useDocumentTitle(perk ? `${perk.provider_name} — ${perk.title}` : "Perk");

  const fav = useMutation({
    mutationFn: () =>
      perk.is_favourite ? api.del("/favourites", { programId: perk.program.id, perkId }) : api.post("/favourites", { programId: perk.program.id, perkId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["perk", perkId] });
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      toast(perk.is_favourite ? "Removed from saved perks" : "Saved to your perks");
    },
  });

  async function share() {
    // Safe deep link only: no promo code or redemption token. Recipients must qualify independently.
    const url = `${window.location.origin}${window.location.pathname}`;
    try {
      if (navigator.share) await navigator.share({ title: `${perk.provider_name} — ${perk.title}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast("Link copied. Recipients need their own eligible membership to view it.");
      }
      if (data?.access === "member") api.post("/events", { event: "share", programId: perk.program.id, perkId }).catch(() => {});
    } catch {
      /* user cancelled */
    }
  }

  async function usePerk() {
    // Open synchronously (popup blockers), sever the opener, then navigate once the click is recorded.
    const w = window.open("about:blank", "_blank");
    if (w) w.opener = null;
    try {
      const r = await api.post<{ redirect: string | null }>("/events", { event: "use_perk_click", programId: perk.program.id, perkId });
      const url = r.redirect && isSafeHttpUrl(r.redirect) ? r.redirect : perk.redemption_url;
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (e: any) {
      w?.close();
      toast(e.message, "error");
    }
  }

  if (isLoading)
    return (
      <div className="container page">
        <Spinner label="Loading perk" />
      </div>
    );
  if (error || !perk)
    return (
      <div className="container page">
        <ErrorAlert error={error} title="This perk isn't available." />
        <p style={{ marginTop: 16 }}>
          It may have ended, or it may belong to a program you are not a member of.{" "}
          {!me?.user ? <Link to={`/auth/signin?next=${encodeURIComponent(location.pathname)}`}>Sign in</Link> : null}
        </p>
        <Link className="btn btn-ghost" to={backTo}>
          ← {backLabel}
        </Link>
      </div>
    );

  const window_ = formatWindow(perk.starts_at, perk.ends_at, perk.is_ongoing, perk.timezone);
  const isTeaser = data.access === "teaser";

  if (isTeaser)
    return (
      <div className="container page">
        <div className="detail-top">
          <button className="btn btn-ghost btn-sm" onClick={() => nav(backTo)}>
            <IconBack size={18} /> {backLabel}
          </button>
          <button className="icon-btn" onClick={share} aria-label="Share link">
            <IconShare />
          </button>
        </div>
        <div className="detail-layout">
          <div className="stack">
            <div className="value-hero">
              <div className="row">
                <span className="value">{perk.value_label}</span>
                {perk.is_demo ? <DemoBadge /> : null}
              </div>
              <div>
                <div className="eyebrow">{perk.provider_name}</div>
                <h1 style={{ fontSize: "clamp(1.6rem,3.2vw,2.4rem)" }}>{perk.title}</h1>
                <p className="muted">{perk.short_description}</p>
                <p className="row muted" style={{ gap: 6 }}>
                  <IconCalendar size={16} /> {window_}
                </p>
              </div>
            </div>
            <div className="detail-image">
              <PerkImage src={perk.image_url} alt={perk.image_alt || perk.title} eager />
            </div>
          </div>
          <aside className="detail-aside panel">
            <h2 style={{ fontSize: "1.3rem" }}>Members see the full offer</h2>
            <p className="muted">Eligible Culturosity members can view the full description, redemption details and member card after signing in.</p>
            <div className="row">
              <Link className="btn btn-primary" to={`/auth/signin?next=${encodeURIComponent(location.pathname)}`}>
                Sign in to view
              </Link>
              <Link className="btn btn-ghost" to="/affinity">
                Bring perks to your organization
              </Link>
            </div>
          </aside>
        </div>
      </div>
    );

  const locations = [
    ...(perk.address_line || perk.city ? [{ label: "", address_line: perk.address_line, city: perk.city, region: perk.region, postal_code: perk.postal_code, country: perk.country, lat: perk.lat, lng: perk.lng }] : []),
    ...perk.provider_locations,
  ];
  const online = perk.redemption_method !== "in_person" && perk.redemption_url;
  const inPerson = perk.redemption_method !== "online";
  const limitReached = perk.usage_limit_per_member != null && perk.redemptions_used >= perk.usage_limit_per_member;
  const pending = Boolean(perk.details_pending);

  return (
    <div className="container page">
      <div className="detail-top">
        <button className="btn btn-ghost btn-sm" onClick={() => nav(backTo)}>
          <IconBack size={18} /> {backLabel}
        </button>
        <div className="row">
          <button className="icon-btn" onClick={share} aria-label="Share link to this perk">
            <IconShare />
          </button>
          <button className="icon-btn" aria-pressed={perk.is_favourite} onClick={() => fav.mutate()} aria-label={perk.is_favourite ? "Remove from saved" : "Save perk"}>
            {perk.is_favourite ? <IconHeartFill /> : <IconHeart />}
          </button>
        </div>
      </div>

      <div className="detail-layout">
        <div className="stack">
          {/* 1. Value and action first */}
          <div className="value-hero">
            <div className="row">
              <span className="value">{perk.value_label}</span>
              {perk.is_demo ? <DemoBadge /> : null}
              <span className="badge badge-mint">
                {perk.program.org_kind === "culturosity" ? "Culturosity Perks" : perk.program.org_name}
                {perk.source_org_kind === "culturosity" && perk.program.org_kind !== "culturosity" ? " · from Culturosity" : ""}
              </span>
            </div>
            {perk.conditions ? <p className="muted" style={{ margin: 0 }}>{perk.conditions}</p> : null}
            {pending ? (
              <div className="alert alert-info" role="status">Full details and how to redeem this perk are coming soon. Save it to find it again easily.</div>
            ) : null}
            <div className="row" hidden={pending}>
              {online ? (
                <button className="btn btn-primary btn-lg" onClick={usePerk}>
                  Use Perk <IconExternal size={18} />
                </button>
              ) : null}
              {inPerson ? (
                <a className={`btn ${online ? "btn-ghost" : "btn-primary"} btn-lg`} href="#member-card">
                  <IconTicket size={18} /> Show Member Card
                </a>
              ) : null}
            </div>
            {perk.redemption_method === "hybrid" ? <p className="muted" style={{ margin: 0, fontSize: ".88rem" }}>Redeem online with Use Perk, or in person with your member card.</p> : null}
          </div>

          {/* 2. Image */}
          <div className="detail-image">
            <PerkImage src={perk.image_url} alt={perk.image_alt || perk.title} eager />
          </div>

          {/* 3. Offer details */}
          <article className="panel">
            <div className="eyebrow">{perk.provider_name}</div>
            <h1 style={{ fontSize: "clamp(1.5rem,3vw,2.2rem)" }}>{perk.title}</h1>
            {perk.full_description ? <p style={{ whiteSpace: "pre-line" }}>{perk.full_description}</p> : pending ? <p className="muted">The full description is coming soon.</p> : null}
            {perk.promo_code ? (
              <div style={{ margin: "16px 0" }}>
                <div className="label" style={{ fontWeight: 600, marginBottom: 6 }}>Promo code</div>
                <div className="promo">
                  <code>{perk.promo_code}</code>
                  <button
                    className="btn btn-dark btn-sm"
                    onClick={async () => {
                      await navigator.clipboard.writeText(perk.promo_code);
                      toast("Promo code copied");
                    }}
                  >
                    <IconCopy size={16} /> Copy
                  </button>
                </div>
              </div>
            ) : null}
            <hr className="divider" />
            <div className="info-list">
              <div className="info-item">
                <IconCalendar />
                <div>
                  <strong>Available</strong>
                  <div>{pending && perk.is_ongoing && !perk.ends_at ? "Details coming soon" : <>{window_} <span className="muted">({perk.timezone.replace("_", " ")})</span></>}</div>
                </div>
              </div>
              {perk.occurrences.length ? (
                <div className="info-item">
                  <IconClock />
                  <div>
                    <strong>Event dates</strong>
                    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                      {perk.occurrences.map((o: any) => (
                        <li key={o.id}>
                          {formatDateTime(o.starts_at, perk.timezone)}
                          {o.ends_at ? ` – ${new Intl.DateTimeFormat("en-CA", { timeZone: perk.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(o.ends_at))}` : ""}
                          {o.venue ? ` · ${o.venue}` : ""}
                          {o.notes ? ` · ${o.notes}` : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="muted" style={{ fontSize: ".82rem" }}>Event dates are separate from the period when this offer can be claimed.</div>
                  </div>
                </div>
              ) : null}
              {perk.booking_deadline ? (
                <div className="info-item">
                  <IconClock />
                  <div>
                    <strong>Book by</strong>
                    <div>{formatDateTime(perk.booking_deadline, perk.timezone)}</div>
                  </div>
                </div>
              ) : null}
              <div className="info-item">
                <IconTicket />
                <div>
                  <strong>How to redeem</strong>
                  <div style={{ whiteSpace: "pre-line" }}>{perk.redemption_instructions}</div>
                  {perk.usage_limit_per_member ? (
                    <div className="muted" style={{ fontSize: ".85rem" }}>
                      Limit {perk.usage_limit_per_member} per member · you have used {perk.redemptions_used}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="info-item">
                <IconUsers />
                <div>
                  <strong>Who is eligible</strong>
                  <div>{perk.eligibility_text}</div>
                  {perk.household_allowed ? <div className="muted">Household members may also use this offer.</div> : null}
                </div>
              </div>
              {perk.exclusions || perk.terms || (perk.blackout_dates ?? []).length ? (
                <div className="info-item">
                  <IconClock />
                  <div>
                    <strong>Restrictions &amp; terms</strong>
                    {perk.exclusions ? <div>{perk.exclusions}</div> : null}
                    {(perk.blackout_dates ?? []).length ? <div>Not available on: {perk.blackout_dates.join(", ")}</div> : null}
                    {perk.terms ? <div className="muted" style={{ whiteSpace: "pre-line" }}>{perk.terms}</div> : null}
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        </div>

        <aside className="detail-aside stack">
          {/* 4. Provider contact */}
          <section className="panel" aria-labelledby="provider-heading">
            <h2 id="provider-heading" style={{ fontSize: "1.15rem" }}>
              {perk.provider_name}
            </h2>
            {perk.provider_description ? <p className="muted">{perk.provider_description}</p> : null}
            <div className="info-list">
              {perk.provider_website && isSafeHttpUrl(perk.provider_website) ? (
                <div className="info-item">
                  <IconGlobe />
                  <a href={perk.provider_website} target="_blank" rel="noopener noreferrer">
                    {new URL(perk.provider_website).hostname.replace(/^www\./, "")}
                  </a>
                </div>
              ) : null}
              {perk.provider_email ? (
                <div className="info-item">
                  <IconMail />
                  <a href={`mailto:${perk.provider_email}`}>{perk.provider_email}</a>
                </div>
              ) : null}
              {perk.provider_phone ? (
                <div className="info-item">
                  <IconPhone />
                  <a href={`tel:${perk.provider_phone.replace(/[^0-9+]/g, "")}`}>{perk.provider_phone}</a>
                </div>
              ) : null}
              {perk.is_online_only ? (
                <div className="info-item">
                  <IconGlobe />
                  <div>Online offer</div>
                </div>
              ) : null}
              {locations.map((l: any, i: number) => {
                const dir = directionsUrl(l);
                return (
                  <div className="info-item" key={i}>
                    <IconPin />
                    <div>
                      {l.label ? <strong>{l.label}</strong> : null}
                      <div>{[l.address_line, l.city, l.region, l.postal_code, l.country].filter(Boolean).join(", ")}</div>
                      {dir ? (
                        <a className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} href={dir} target="_blank" rel="noopener noreferrer">
                          <IconDirections size={16} /> Directions
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 5. Member card */}
          {pending ? null : inPerson || !online ? (
            <MemberCard
              programId={perk.program.id}
              perkId={perk.id}
              providerRef={perk.provider_ref}
              memberName={me?.user?.display_name || "Member"}
              programName={perk.program.name}
              limitReached={limitReached}
            />
          ) : (
            <section className="member-card" aria-label="Member card">
              <div className="vertical" aria-hidden>
                <span>MEMBER</span>
              </div>
              <img className="card-logo" src="/brand/culturosity-logo.webp" alt="Culturosity" />
              <div style={{ marginTop: 12, fontWeight: 600 }}>{me?.user?.display_name}</div>
              <div style={{ fontSize: ".85rem", color: "#b4b4bf" }}>{perk.program.name}</div>
              <p style={{ fontSize: ".85rem", color: "#b4b4bf", marginTop: 10, marginBottom: 0 }}>
                This is an online offer — use the Use Perk button. No in-person code is needed.
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
