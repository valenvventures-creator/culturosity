// Culturosity's existing perks, transcribed from the listing screenshots supplied by Culturosity
// (provider, perk title, value label, image). Listing-only: details, dates, locations and
// redemption information are supplied in a later pack, so every perk is marked details_pending.
// Order is the "New" order shown in the screenshots (first = newest).
// Categories are an internal classification for catalogue filters.

export type ValueSpec =
  | { type: "percent"; percent: number }
  | { type: "amount"; amount: number }
  | { type: "free" }
  | { type: "bogo" }
  | { type: "special"; label: string };

export interface ListingSpec {
  slug: string;
  provider: string;
  title: string;
  value: ValueSpec;
  category: string;
  /** Set when the title was cut off in the screenshot and needs confirming. */
  titleNeedsConfirmation?: boolean;
}

const pct = (percent: number): ValueSpec => ({ type: "percent", percent });
const dollars = (amount: number): ValueSpec => ({ type: "amount", amount });
const FREE: ValueSpec = { type: "free" };

export const CULTUROSITY_PERK_LISTINGS: ListingSpec[] = [
  { slug: "canada-life-centre-ram-motorsports-feb-7", provider: "Canada Life Centre", title: "Ram Motorsports Spectacular - Feb 7, 2027", value: pct(25), category: "Events & Experiences" },
  { slug: "canada-life-centre-ram-motorsports-feb-6", provider: "Canada Life Centre", title: "Ram Motorsports Spectacular - Feb 6, 2027", value: pct(25), category: "Events & Experiences" },
  { slug: "wso-beethoven-sibelius", provider: "Winnipeg Symphony Orchestra", title: "Beethoven’s Violin Concerto & Sibelius’ Symphony", value: pct(15), category: "Arts & Culture", titleNeedsConfirmation: true },
  { slug: "wag-mini-holiday-stockings", provider: "WAG-Qaumajuq", title: "Mini Holiday Stockings with Jennine Krauchi", value: FREE, category: "Arts & Culture" },
  { slug: "canada-life-centre-harlem-globetrotters", provider: "Canada Life Centre", title: "Harlem Globetrotters: Rivalry Tour", value: { type: "special", label: "Special offer" }, category: "Events & Experiences" },
  { slug: "manitoba-opera-madama-butterfly", provider: "Manitoba Opera", title: "Madama Butterfly", value: pct(15), category: "Arts & Culture" },
  { slug: "manitoba-opera-treemonisha", provider: "Manitoba Opera", title: "Treemonisha", value: pct(15), category: "Arts & Culture" },
  { slug: "wso-season-2026-2027", provider: "Winnipeg Symphony Orchestra", title: "Season 2026/2027", value: pct(15), category: "Arts & Culture" },
  { slug: "wso-subscription-bring-a-friend", provider: "Winnipeg Symphony Orchestra", title: "Buy one subscription, bring a friend for free", value: { type: "bogo" }, category: "Arts & Culture", titleNeedsConfirmation: true },
  { slug: "wag-wednesday-nights", provider: "WAG-Qaumajuq", title: "WAG Wednesday Nights", value: FREE, category: "Arts & Culture" },
  { slug: "wag-canada-life-free-sunday", provider: "WAG-Qaumajuq", title: "Canada Life Free Sunday@WAG-Qaumajuq", value: FREE, category: "Arts & Culture" },
  { slug: "spa-botanica-ayurvedic", provider: "Spa Botanica", title: "Ayurvedic treatments", value: pct(10), category: "Wellness" },
  { slug: "siam-thai-dine-in", provider: "Siam Authentic Thai Cuisine", title: "All Dine-in Menu Items", value: pct(10), category: "Food & Drink" },
  { slug: "fossil-centre-gift-shop", provider: "Canadian Fossil Discovery Centre", title: "Gift Shop", value: pct(10), category: "Retail" },
  { slug: "fossil-centre-admissions", provider: "Canadian Fossil Discovery Centre", title: "Admissions", value: pct(10), category: "Family" },
  { slug: "clay-oven-special-discount", provider: "Clay Oven East Indian Restaurants", title: "Special Discount", value: pct(10), category: "Food & Drink" },
  { slug: "james-avenue-pumphouse-happy-hour", provider: "James Avenue Pumphouse", title: "Happy Hour Pricing All Day!", value: { type: "special", label: "Exclusive" }, category: "Food & Drink" },
  { slug: "carnaval-brazilian-bbq", provider: "Carnaval Brazilian BBQ Restaurant", title: "Special Discount", value: pct(10), category: "Food & Drink" },
  { slug: "cmhr-gallery-admission", provider: "The Canadian Museum for Human Rights", title: "Regular Gallery Admission", value: pct(15), category: "Arts & Culture" },
  { slug: "shakespeare-in-the-ruins-merch", provider: "Shakespeare in the Ruins", title: "Shakespeare Merch", value: pct(10), category: "Retail" },
  { slug: "heritage-winnipeg-150", provider: "Heritage Winnipeg", title: "Winnipeg 150: Stories Our Buildings Tell", value: pct(20), category: "Arts & Culture" },
  { slug: "wag-indigenous-admission", provider: "WAG-Qaumajuq", title: "Indigenous People Admission", value: FREE, category: "Arts & Culture" },
  { slug: "wag-youth-admission", provider: "WAG-Qaumajuq", title: "Youth Admission", value: FREE, category: "Arts & Culture" },
  { slug: "wag-main-floor", provider: "WAG-Qaumajuq", title: "Main Floor of WAG-Qaumajuq", value: FREE, category: "Arts & Culture" },
  { slug: "blufish-avocado-rice-kids", provider: "Blufish Japanese Restaurant", title: "Avocado on rice for kids under 6", value: FREE, category: "Food & Drink" },
  { slug: "blufish-birthday-dessert", provider: "Blufish Japanese Restaurant", title: "Dessert for Birthdays", value: FREE, category: "Food & Drink" },
  { slug: "blufish-happy-hour-wine", provider: "Blufish Japanese Restaurant", title: "Happy Hour - Glass of Wine (9oz)", value: dollars(2), category: "Food & Drink" },
  { slug: "pourium-passport-to-wine", provider: "The Pourium", title: "The Pourium's 'Passport To Wine'", value: dollars(25), category: "Food & Drink" },
  { slug: "blufish-happy-hour-lycheetini", provider: "Blufish Japanese Restaurant", title: "Happy Hour - Lycheetini", value: dollars(2), category: "Food & Drink" },
  { slug: "folklorama-365", provider: "Folklorama", title: "Folklorama 365: Ethno-Cultural Artists", value: pct(10), category: "Arts & Culture" },
  { slug: "made-here-corporate-gifts", provider: "Made Here", title: "Made Here Corporate Gifts", value: pct(15), category: "Retail" },
  { slug: "made-here", provider: "Made Here", title: "Made Here", value: pct(10), category: "Retail" },
  { slug: "blufish-feature-roll", provider: "Blufish Japanese Restaurant", title: "Feature Roll", value: dollars(2), category: "Food & Drink" },
  { slug: "manitoba-museum-shop", provider: "Manitoba Museum Shop", title: "Manitoba Museum Shop", value: pct(15), category: "Retail" },
  { slug: "crescendo-learning-to-sing", provider: "Crescendo Music Lessons", title: "Learning to sing app.", value: dollars(10), category: "Learning" },
];

/** Listing value labels in Culturosity's own wording ("Save 25%", "Free", "BOGO"…). */
export function listingLabel(v: ValueSpec): string {
  switch (v.type) {
    case "percent":
      return `Save ${v.percent}%`;
    case "amount":
      return `Save $${v.amount}`;
    case "free":
      return "Free";
    case "bogo":
      return "BOGO";
    case "special":
      return v.label;
  }
}
