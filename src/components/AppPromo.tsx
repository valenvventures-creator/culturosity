// "Get the Culturosity app" promotion: a phone mockup in the style of the Culturosity mobile app,
// filled with real catalogue listings, plus the official App Store / Google Play badges.
import { useEffect, useRef, useState } from "react";
import type React from "react";
import type { ListingPerk } from "./Catalogue";

export const APP_STORE_URL = "https://apps.apple.com/ca/app/culturosity/id6467152905";
export const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.culturosity";

export function StoreBadges({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <div className={`store-badges store-badges-${size}`}>
      <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="store-badge">
        <img src="/brand/stores/app-store-badge.svg" alt="Download the Culturosity app on the App Store" />
      </a>
      <a href={GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer" className="store-badge">
        <img src="/brand/stores/google-play-badge.png" alt="Get the Culturosity app on Google Play" />
      </a>
    </div>
  );
}

function PerkRow({ p }: { p: ListingPerk }) {
  return (
    <div className="phone-row">
      <div className="phone-thumb">{p.image_url ? <img src={p.image_url} alt="" decoding="async" /> : null}</div>
      <div className="phone-info">
        <strong>{p.provider_name}</strong>
        <span>{p.title}</span>
        <div className="phone-actions">
          <em>{p.value_label.toUpperCase()}</em>
          <b>DETAILS</b>
        </div>
      </div>
    </div>
  );
}

function PhoneMockup({ perks }: { perks: ListingPerk[] }) {
  // Enough rows to scroll through; the list is rendered twice so the scroll loops seamlessly.
  const rows = perks.slice(0, 12);
  const scrolls = rows.length > 5;
  // Swoop in when the phone comes into view (on phones it starts below the fold).
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    // The slot stays in place (and is what we watch); only the inner element moves.
    <div ref={ref} className={`phone-slot ${inView ? "in-view" : ""}`}>
    <div className="phone-enter">
    <div className="phone" role="img" aria-label="The Culturosity app on a phone, scrolling through a list of perks">
      <div className="phone-screen" aria-hidden>
        <div className="phone-status">
          <span>9:41</span>
          <span className="phone-island" />
          <span className="phone-icons">●●● ▮</span>
        </div>
        <div className="phone-title">
          <picture>
            <source srcSet="/brand/culturosity-logo.webp" type="image/webp" />
            <img className="phone-logo" src="/brand/culturosity-logo.png" alt="" />
          </picture>
          PERKS
        </div>
        <div className="phone-tabs">
          <span>♥</span>
          <span className="on">New</span>
          <span>A–Z</span>
        </div>
        <div className="phone-list">
          <div
            className={`phone-scroller ${scrolls ? "is-scrolling" : ""}`}
            // About 2.6 seconds per perk, so titles stay readable.
            style={scrolls ? ({ "--scroll-duration": `${rows.length * 2.6}s` } as React.CSSProperties) : undefined}
          >
            {rows.map((p) => <PerkRow key={p.id} p={p} />)}
            {scrolls ? rows.map((p) => <PerkRow key={`again-${p.id}`} p={p} />) : null}
          </div>
        </div>
        <div className="phone-nav">
          <span className="on">PERKS</span>
          <span>ABOUT</span>
          <span>ACCOUNT</span>
        </div>
      </div>
    </div>
    </div>
    </div>
  );
}

export function AppPromo({ perks }: { perks: ListingPerk[] }) {
  return (
    <aside className="app-promo" aria-labelledby="app-promo-title">
      {perks.length ? <PhoneMockup perks={perks} /> : null}
      <div className="app-promo-copy">
        <p className="app-promo-mission">Our mission is to indulge curiosity about culture.</p>
        <h2 id="app-promo-title" className="eyebrow" style={{ margin: "14px 0 10px" }}>
          Get the Culturosity app
        </h2>
        <StoreBadges />
      </div>
    </aside>
  );
}
