import { Fragment, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, qs } from "../lib/api";
import { useMe } from "../lib/session";
import { formatDateTime } from "@shared/time";
import { directionsUrl, isSafeHttpUrl } from "@shared/perk";
import { LockedMemberCard, MemberCard } from "./MemberCard";
import { DemoBadge, ErrorAlert, PerkImage, Spinner, useDocumentTitle, useToast } from "./ui";
import { IconBack, IconCalendar, IconCopy, IconDirections, IconExternal, IconGlobe, IconHeart, IconHeartFill, IconLock, IconMail, IconPhone, IconShare, IconTicket } from "./Icons";

/** "***PROMO CODE***" on its own line marks where the promo-code block sits (the app's convention). */
const PROMO_MARKER = /^\s*\*{2,}\s*promo\s*code\s*\*{2,}\s*$/i;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** True when `part` already appears in `whole` (ignoring case, punctuation and line breaks). */
const mentions = (whole: string, part: string) => norm(whole).includes(norm(part));

function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <a key={m.index} href={`mailto:${m[1]}`}>
        {m[1]}
      </a>,
    );
    last = m.index + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Paragraphs on blank lines, "- " lines as lists, line breaks kept, promo marker → promo block. */
function RichText({ text, promo }: { text: string; promo: ReactNode }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  let promoShown = false;
  const nodes = blocks.map((b, i) => {
    const lines = b.split("\n").filter((l) => l.trim() !== "");
    if (!lines.length) return null;
    if (lines.length === 1 && PROMO_MARKER.test(lines[0])) {
      promoShown = true;
      return <Fragment key={i}>{promo}</Fragment>;
    }
    const parts: ReactNode[] = [];
    let list: string[] = [];
    let para: string[] = [];
    const flushPara = () => {
      if (para.length)
        parts.push(
          <p key={`p${parts.length}`}>
            {para.map((l, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                {linkify(l)}
              </Fragment>
            ))}
          </p>,
        );
      para = [];
    };
    const flushList = () => {
      if (list.length)
        parts.push(
          <ul key={`u${parts.length}`}>
            {list.map((l, j) => (
              <li key={j}>{linkify(l)}</li>
            ))}
          </ul>,
        );
      list = [];
    };
    for (const l of lines) {
      if (PROMO_MARKER.test(l)) {
        flushPara();
        flushList();
        promoShown = true;
        parts.push(<Fragment key={`m${parts.length}`}>{promo}</Fragment>);
      } else if (/^\s*[-•]\s+/.test(l)) {
        flushPara();
        list.push(l.replace(/^\s*[-•]\s+/, ""));
      } else {
        flushList();
        para.push(l);
      }
    }
    flushPara();
    flushList();
    return <Fragment key={i}>{parts}</Fragment>;
  });
  return (
    <>
      {nodes}
      {!promoShown ? promo : null}
    </>
  );
}

function displayUrl(u: string) {
  try {
    const x = new URL(u);
    return x.host + (x.pathname !== "/" ? x.pathname.replace(/\/$/, "") : "");
  } catch {
    return u;
  }
}

function ContactRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="pd-contact">
      <span className="pd-contact-icon" aria-hidden>
        {icon}
      </span>
      <div>
        <div className="pd-contact-label">{label}</div>
        <div className="pd-contact-value">{children}</div>
      </div>
    </li>
  );
}

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
        toast("Link copied.");
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

  const isTeaser = data.access === "teaser";
  const pending = Boolean(perk.details_pending);
  const signInHref = `/auth/signin?next=${encodeURIComponent(location.pathname)}`;
  const online = perk.redemption_method !== "in_person";
  const inPerson = perk.redemption_method !== "online";
  const limitReached = !isTeaser && perk.usage_limit_per_member != null && perk.redemptions_used >= perk.usage_limit_per_member;
  const tz = perk.timezone;
  const locations = [
    ...(perk.address_line ? [{ label: "", address_line: perk.address_line, city: perk.city, region: perk.region, postal_code: perk.postal_code, country: perk.country, lat: perk.lat, lng: perk.lng }] : []),
    ...(perk.provider_locations ?? []),
  ];
  const occurrences: any[] = perk.occurrences ?? [];
  const nowMs = Date.now();
  const endsSoon = !perk.is_ongoing && perk.ends_at ? formatDateTime(perk.ends_at, tz) : null;
  const time = (v: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(v));

  const promoBlock =
    perk.promo_code || perk.has_promo ? (
      <div className="pd-promo">
        <div className="pd-promo-label">Promo code</div>
        {isTeaser ? (
          <Link className="pd-promo-code pd-promo-locked" to={signInHref}>
            <IconLock size={16} /> Sign in to reveal
          </Link>
        ) : (
          <button
            type="button"
            className="pd-promo-code"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(perk.promo_code);
                toast("Promo code copied");
              } catch {
                toast("Select the code to copy it", "error");
              }
            }}
            aria-label={`Promo code ${perk.promo_code}. Copy to clipboard`}
          >
            <code>{perk.promo_code}</code>
            <span className="pd-promo-copy">
              <IconCopy size={16} /> Copy
            </span>
          </button>
        )}
      </div>
    ) : null;

  // Value pill fused with the main action, like the app.
  const action = pending ? null : isTeaser ? (
    <Link className="pd-action" to={signInHref}>
      {online ? "Use Perk" : "Show card"} <IconLock size={16} />
    </Link>
  ) : online && perk.redemption_url ? (
    <button type="button" className="pd-action" onClick={usePerk}>
      Use Perk <IconExternal size={16} />
    </button>
  ) : (
    <a className="pd-action" href="#member-card">
      Show card <IconTicket size={16} />
    </a>
  );

  const hasContacts = perk.provider_website || perk.provider_email || perk.provider_phone || locations.length;

  return (
    <div className="container page pd">
      <div className="pd-top">
        <button className="icon-btn" onClick={() => nav(backTo)} aria-label={`Back to ${backLabel}`}>
          <IconBack />
        </button>
        <div className="pd-top-title">Details</div>
        <button className="icon-btn" onClick={share} aria-label="Share link to this perk">
          <IconShare />
        </button>
      </div>

      <div className="pd-layout">
        <div className="pd-main">
          <div className="pd-actionbar">
            <div className="pd-pill">
              <span className="pd-value">{perk.value_label}</span>
              {action}
            </div>
            {perk.is_demo ? <DemoBadge /> : null}
            {isTeaser ? (
              <Link className="icon-btn pd-fav" to={signInHref} aria-label="Sign in to save this perk">
                <IconHeart />
              </Link>
            ) : (
              <button className="icon-btn pd-fav" aria-pressed={perk.is_favourite} onClick={() => fav.mutate()} aria-label={perk.is_favourite ? "Remove from saved" : "Save perk"}>
                {perk.is_favourite ? <IconHeartFill /> : <IconHeart />}
              </button>
            )}
          </div>

          <div className="pd-image">
            <PerkImage src={perk.image_url} alt={perk.image_alt || `${perk.provider_name} — ${perk.title}`} eager />
          </div>

          <div className="pd-provider">{perk.provider_name}</div>

          <article className="pd-card" aria-labelledby="perk-title">
            <h1 id="perk-title">{perk.title}</h1>
            {endsSoon || occurrences.length ? (
              <div className="pd-when">
                {occurrences.length ? (
                  <ul>
                    {occurrences.map((o) => {
                      const past = new Date(o.ends_at ?? o.starts_at).getTime() < nowMs;
                      return (
                        <li key={o.id} className={past ? "past" : ""}>
                          <IconCalendar size={16} />
                          <span>
                            {formatDateTime(o.starts_at, tz)}
                            {o.ends_at ? ` – ${time(o.ends_at)}` : ""}
                            {o.notes ? <span className="pd-when-note"> · {o.notes}</span> : null}
                            {past ? <span className="pd-when-note"> (past)</span> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {endsSoon ? <div className="pd-ends">Offer ends {endsSoon}</div> : null}
              </div>
            ) : null}
            {pending ? (
              <p>Full details and how to redeem this perk are coming soon. {isTeaser ? null : "Save it to find it again easily."}</p>
            ) : perk.full_description ? (
              <RichText text={perk.full_description} promo={promoBlock} />
            ) : (
              <>
                {perk.short_description ? <p>{perk.short_description}</p> : null}
                {promoBlock}
              </>
            )}
            {!pending && perk.redemption_instructions && !mentions(perk.full_description ?? "", perk.redemption_instructions) ? (
              <div className="pd-redeem">
                <strong>How to redeem</strong>
                <p>{perk.redemption_instructions}</p>
              </div>
            ) : null}
            {!pending && perk.exclusions && !mentions(perk.full_description ?? "", perk.exclusions) ? (
              <p className="pd-fine">{perk.exclusions}</p>
            ) : null}
            {perk.terms ? <p className="pd-fine">{perk.terms}</p> : null}
            {!isTeaser && perk.usage_limit_per_member ? (
              <p className="pd-fine">
                Limit {perk.usage_limit_per_member} per member · you have used {perk.redemptions_used}
              </p>
            ) : null}
          </article>
        </div>

        <aside className="pd-aside">
          <section className="pd-about" aria-labelledby="provider-heading">
            <h2 id="provider-heading" className="sr-only">
              About {perk.provider_name}
            </h2>
            {perk.provider_description ? <p>{perk.provider_description}</p> : null}
            {hasContacts ? (
              <ul className="pd-contacts">
                {perk.provider_website && isSafeHttpUrl(perk.provider_website) ? (
                  <ContactRow icon={<IconGlobe size={20} />} label="Website">
                    <a href={perk.provider_website} target="_blank" rel="noopener noreferrer">
                      {displayUrl(perk.provider_website)}
                    </a>
                  </ContactRow>
                ) : null}
                {perk.provider_email ? (
                  <ContactRow icon={<IconMail size={20} />} label="Email">
                    <a href={`mailto:${perk.provider_email}`}>{perk.provider_email}</a>
                  </ContactRow>
                ) : null}
                {perk.provider_phone ? (
                  <ContactRow icon={<IconPhone size={20} />} label="Phone">
                    <a href={`tel:${perk.provider_phone.replace(/[^0-9+]/g, "")}`}>{perk.provider_phone}</a>
                  </ContactRow>
                ) : null}
                {locations.map((l: any, i: number) => {
                  const dir = directionsUrl(l);
                  const text = [l.address_line, l.city, l.region].filter(Boolean).join(", ");
                  return (
                    <ContactRow key={i} icon={<IconDirections size={20} />} label={l.label ? `Directions · ${l.label}` : "Directions"}>
                      {dir ? (
                        <a href={dir} target="_blank" rel="noopener noreferrer">
                          {text}
                        </a>
                      ) : (
                        text
                      )}
                    </ContactRow>
                  );
                })}
              </ul>
            ) : null}
          </section>

          {pending ? null : isTeaser ? (
            <LockedMemberCard signInHref={signInHref} />
          ) : inPerson || perk.pos_reference ? (
            <MemberCard
              programId={perk.program.id}
              perkId={perk.id}
              providerRef={perk.provider_ref}
              perkQr={perk.pos_reference || null}
              perkLabel={`${perk.provider_name} — ${perk.title}`}
              memberName={me?.user?.display_name || "Member"}
              programName={perk.program.org_kind === "culturosity" ? "Culturosity Perks" : perk.program.name}
              limitReached={limitReached}
            />
          ) : null}

          {isTeaser ? (
            <div className="pd-signin">
              <strong>For Culturosity members</strong>
              <p>Members see promo codes, use perks and show their member card in the Culturosity app or after signing in here.</p>
              <div className="row">
                <Link className="btn btn-primary btn-sm" to={signInHref}>
                  Sign in
                </Link>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
