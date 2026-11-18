# Design tokens

Defined in `src/styles/app.css` (`:root`).

## Brand (from culturosity.io theme CSS, verified 2026-11-17)

| Token | Value | Use |
| --- | --- | --- |
| `--brand-black` | `#000000` | Header, footer, nav, member card, dark sections |
| `--brand-white` | `#FFFFFF` | Text on dark, clean surfaces |
| `--brand-light` | `#F5F5F7` | Light content surfaces, forms, tables |
| `--brand-lime` | `#D2F538` | Active indicators, chips, "New", focus ring |
| `--brand-mint` | `#57F6C3` | Primary actions, selected controls, member-card edge |
| Font | Open Sans 400 body / 500 headings | Loaded from Google Fonts |

Logo: the official Culturosity wordmark (`public/brand/culturosity-logo.webp|png`, downsized from the published asset; `culturosity-logo-original.webp` is the untouched download). Native colours and proportions are preserved. It is designed for dark backgrounds.

## Palette extensions (app design choices, not from the reference site)

| Token | Value | Purpose |
| --- | --- | --- |
| `--charcoal-950…500` | `#07070A` → `#3B3B46` | Depth for dark cards, sidebar, inputs |
| `--ink`, `--ink-muted` | `#111114`, `#4B4B57` | Text on light surfaces (≥7:1) |
| `--on-dark-muted` | `#B4B4BF` | Secondary text on black (≥9:1) |
| `--value-magenta` | `#B5005D` | Offer-value badge (white text 6.9:1), kept from the recording's value/action distinction, secondary to mint/lime |
| `--success`, `--warning`, `--danger` (+ backgrounds) | — | Status and alerts |

## Motion & accessibility

- Logo-inspired dot clusters (`DotField`) are masked away from text columns and disabled under `prefers-reduced-motion`.
- All transitions/animations collapse to ~0ms under reduced motion.
- Focus: 3px lime outline on dark surfaces, deep green on light surfaces.
- Touch targets: 44px minimum for buttons, chips, nav items.
- QR codes are pure black on white, static, with a quiet zone and no decoration.
- Company accent colours must have ≥4.5:1 contrast on the dark UI (enforced by the API).
