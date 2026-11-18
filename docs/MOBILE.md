# Mobile pathway

## Today: installable PWA

- `public/manifest.webmanifest` (standalone, black theme, 192/512 and maskable icons from the official logo), `apple-touch-icon.png`.
- `viewport-fit=cover` with safe-area padding for the bottom navigation.
- Compact mobile navigation: **Perks · Saved · Submit · Account**; admin tools are not squeezed into the bottom bar.
- `public/sw.js` caches **only** the static app shell and brand files. `/api/*` is never cached: catalogue data, promo codes, member cards, research and redemption tokens are always fetched live. Offline navigation shows `offline.html`; offline scans are never treated as verified (the verify page refuses while offline).
- Sign-out clears the TanStack Query cache, per-device preferences and runtime caches.
- Deep links (`/perks/:id`, `/app/:org/perks/:id`) still go through the server access check.

## Next: iOS and Android with Capacitor

1. `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android` and `npx cap init Culturosity io.culturosity.app --web-dir=dist`.
2. API origin: native shells load from `capacitor://localhost`, so either serve the API from the same custom domain via `server.url`, or switch native builds to bearer-token sessions stored in the platform keychain/keystore (e.g. `@capacitor/preferences` is **not** secure — use a secure-storage plugin). Update CORS and CSRF origin checks accordingly.
3. Adapters to swap for native:
   - Camera scanning: replace `BarcodeDetector` with a native barcode plugin behind the same `useQrScanner` interface.
   - Share: `@capacitor/share`; Directions: open the platform maps URL.
   - External checkout: `@capacitor/browser` for Use Perk.
4. Universal links / app links for `/perks/*` and `/app/*`.

## Release work still required (not done)

- Apple Developer and Google Play accounts, bundle IDs, signing certificates/keystores.
- Store listings, screenshots, app icons at all required sizes.
- Privacy disclosures (App Store privacy labels, Play Data safety): account email/name, membership, usage analytics, camera (provider scanning only).
- Permission strings (camera) and review notes with a demo account.
- Device testing on current iOS/Android versions and small screens.

No App Store or Google Play badges are shown in the product until real store links exist.
