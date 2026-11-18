// "Get the Culturosity app" promotion: a phone mockup in the style of the Culturosity mobile app,
// filled with real catalogue listings, plus the official App Store / Google Play badges.
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

function PhoneMockup({ perks }: { perks: ListingPerk[] }) {
  const rows = perks.slice(0, 5);
  return (
    <div className="phone" role="img" aria-label="The Culturosity app on a phone, showing a list of perks">
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
          {rows.map((p) => (
            <div className="phone-row" key={p.id}>
              <div className="phone-thumb">{p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : null}</div>
              <div className="phone-info">
                <strong>{p.provider_name}</strong>
                <span>{p.title}</span>
                <div className="phone-actions">
                  <em>{p.value_label.toUpperCase()}</em>
                  <b>DETAILS</b>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="phone-nav">
          <span className="on">PERKS</span>
          <span>ABOUT</span>
          <span>ACCOUNT</span>
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
