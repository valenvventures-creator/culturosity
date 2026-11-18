// Three further Culturosity perks, transcribed from the website screenshots supplied by Culturosity
// (provider, title, value, image). Listing-only, like pack 0001: details are pending.
import type { ListingSpec } from "./0001_culturosity_perks_listings";

export const CULTUROSITY_PERK_LISTINGS_MORE: ListingSpec[] = [
  { slug: "manitoba-opera-tosca", provider: "Manitoba Opera", title: "Tosca", value: { type: "percent", percent: 15 }, category: "Arts & Culture" },
  { slug: "nonsuch-happy-hour-two-taps", provider: "Nonsuch Brewing Co.", title: "Happy Hour - Two Taps and a Snack", value: { type: "percent", percent: 35 }, category: "Food & Drink" },
  { slug: "wag-bpm-x-wag", provider: "WAG-Qaumajuq", title: "BPM X WAG-Qaumajuq", value: { type: "free" }, category: "Arts & Culture" },
];
