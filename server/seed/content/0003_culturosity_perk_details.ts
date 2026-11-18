// Full Culturosity perk details, transcribed from the Culturosity app "Details" screenshots supplied by
// Culturosity (two screenshots per perk: offer details, then provider contact + member card).
// Text is kept as written by Culturosity; only OCR errors and obvious typos are corrected.
//
// Description convention (same as the app): a line "***PROMO CODE***" marks where the promo-code
// block appears. The code itself lives in `promo`, so it is never part of the public description.
//
// `qr` is the exact payload of the perk's own QR code from the member card in the app. Perk
// providers link these codes to their point-of-sale systems, so it is stored unchanged (only a
// Google Analytics session parameter was removed from one WSO link).
import type { ListingSpec } from "./0001_culturosity_perks_listings";

export interface ProviderDetails {
  name: string;
  about: string;
  website: string;
  email: string;
}

export interface Occurrence {
  date: string; // YYYY-MM-DD, America/Winnipeg
  start: string; // HH:MM
  end?: string;
  venue?: string;
  notes?: string;
}

export interface PerkDetails {
  provider: string;
  /** Title as currently stored (pack 0001/0002/0003 listing). */
  title: string;
  /** Corrected title, when the listing screenshot cut it off. */
  newTitle?: string;
  shortDescription: string;
  description: string;
  promo?: string;
  /** How to redeem, in the provider's words (also part of the description in most cases). */
  howToRedeem: string;
  method: "online" | "in_person" | "hybrid";
  /** USE PERK destination. Required for online/hybrid. */
  url?: string;
  qr: string;
  address?: string;
  city?: string;
  /** Last moment the perk can be claimed (America/Winnipeg). Omitted = ongoing. */
  endsAt?: { date: string; time: string };
  occurrences?: Occurrence[];
  exclusions?: string;
}
// Event dates are part of each description (as in the app), so `occurrences` is only used when
// a perk needs dates listed separately.

const WPG = "Winnipeg";

export const PROVIDERS: ProviderDetails[] = [
  { name: "Le Musée de Saint-Boniface Museum", about: "Le Musée de Saint-Boniface Museum is recognized as a keeper of Francophone and Métis heritage.", website: "https://msbm.mb.ca", email: "info@msbm.mb.ca" },
  { name: "Crescendo Music Lessons", about: "Crescendo music lessons is focused on helping you reach your full potential with your gifts.", website: "https://crescendomusiclessons.com", email: "crescendomusiclessons@gmail.com" },
  { name: "Manitoba Museum Shop", about: "At the Manitoba Museum Shop, you'll find a unique selection of Museum merchandise, locally made goods, inspiring gifts, souvenirs, and more.", website: "https://www.manitobamuseumshop.ca", email: "museumshop@manitobamuseum.ca" },
  { name: "Blufish Japanese Restaurant", about: "Contemporary place for classic & unique sushi rolls, plus Japanese kitchen entrees & bento boxes", website: "https://www.blufish.ca", email: "sushi@blufish.ca" },
  { name: "Made Here", about: "Made Here specializes in crafting corporate gifts, offering unique, heart-selected items for all business sizes. Beyond being a store, Made Here is committed to supporting local children's charities and fostering youth through mentorships and internships.", website: "https://madeheremb.com", email: "hello@madeheremb.com" },
  { name: "Folklorama", about: "Folklorama brings people together by sharing ethno-cultural experiences and education", website: "https://folklorama.ca", email: "info@folklorama.ca" },
  { name: "The Pourium", about: "The Pourium is committed to transforming your wine shopping experience by providing a fun, approachable and inviting atmosphere with an abundance of product knowledge so you feel more confident and empowered in your product selections.", website: "https://thepourium.com", email: "admin@thepourium.com" },
  { name: "WAG-Qaumajuq", about: "WAG-Qaumajuq features an impressive collection of over 27,000 artworks spanning centuries, cultures, and media, including the largest public collection of contemporary Inuit art in the world.", website: "https://www.wag.ca", email: "inquiries@wag.ca" },
  { name: "Heritage Winnipeg", about: "Heritage Winnipeg promotes and encourages the conservation of historic/heritage structures and sites and attends to those matters which enhance and complement this purpose.", website: "https://heritagewinnipeg.com", email: "info@heritagewinnipeg.com" },
  { name: "Shakespeare in the Ruins", about: "SIR is the only professional theatre company in Manitoba dedicated to producing and revitalizing plays from the Classical canon.", website: "https://shakespeareintheruins.com", email: "admin@sirmb.ca" },
  { name: "The Canadian Museum for Human Rights", about: "The Canadian Museum for Human Rights is the first museum solely dedicated to the evolution, celebration and future of human rights.", website: "https://humanrights.ca", email: "info@humanrights.ca" },
  { name: "Carnaval Brazilian BBQ Restaurant", about: "An authentic Brazilian “Churrascaria”, steakhouse that combines the influence of the local ingredients with the traditional Brazilian BBQ.", website: "https://www.carnavalrestaurant.ca", email: "info@carnavalrestaurant.ca" },
  { name: "James Avenue Pumphouse", about: "James Avenue Pumphouse Food & Drink, is built in a historical building which was Winnipeg's first high-pressure water system.", website: "https://jamesavenuepumphouse.com", email: "office@jamespumphouse.ca" },
  { name: "Clay Oven East Indian Restaurants", about: "Clay Oven offers a vast menu of chicken, lamb, goat, seafood, vegetarian and vegan dishes, as well as a selection of sweets and desserts all prepared from authentic Indian recipes.", website: "https://www.clayoven.ca", email: "events@clayoven.ca" },
  { name: "Canadian Fossil Discovery Centre", about: "Canadian Fossil Discovery Centre features Canada's largest collection of marine reptile fossils. Its galleries highlight life in the Western Interior Seaway during the late Cretaceous period, offering a captivating look into Earth's prehistoric past.", website: "https://discoverfossils.com", email: "info@discoverfossils.com" },
  { name: "Siam Authentic Thai Cuisine", about: "Siam Thai Cuisine serves up Winnipeg's finest Thai food with exciting dishes and unique ambiance. At Siam Thai, every dish is created using only the freshest, finest ingredients.", website: "https://siamthairestaurant.ca", email: "siamthaiwinnipeg@shaw.ca" },
  { name: "Spa Botanica", about: "Spa Botanica is a full service day spa specializing in Ayurvedic treatments and green beauty.", website: "https://spabotanica.ca", email: "info@spabotanica.ca" },
  { name: "Winnipeg Symphony Orchestra", about: "Winnipeg Symphony Orchestra is one of Canada's leading orchestras, captivating audiences since 1948 with exceptional performances—from timeless classics to contemporary concerts and films in concert.", website: "https://wso.ca", email: "boxoffice@wso.mb.ca" },
  { name: "Manitoba Opera", about: "Manitoba Opera is Manitoba’s only full-time professional opera company and serves a region that also includes Northwestern Ontario, Saskatchewan, and the Dakotas.", website: "https://mbopera.ca", email: "boxoffice@mbopera.ca" },
  { name: "Canada Life Centre", about: "TNSE's marquee entertainment facility which hosts a variety of premier sports, music and entertainment events", website: "https://www.canadalifecentre.ca", email: "info@tnse.com" },
];

/** Perks that appear in the app screenshots but were not on the site yet (newest first). */
export const NEW_LISTINGS: ListingSpec[] = [
  { slug: "musee-membership", provider: "Le Musée de Saint-Boniface Museum", title: "Membership", value: { type: "amount", amount: 5 }, category: "Arts & Culture" },
  { slug: "musee-la-belle-boutique-blanche", provider: "Le Musée de Saint-Boniface Museum", title: "La Belle Boutique Blanche", value: { type: "percent", percent: 10 }, category: "Retail" },
  { slug: "crescendo-vocal-assessment", provider: "Crescendo Music Lessons", title: "Vocal Assessment", value: { type: "free" }, category: "Learning" },
];

const P = "***PROMO CODE***";
const MUSEE_ADDR = { address: "494 Taché Ave", city: WPG };
const WAG_ADDR = { address: "300 Memorial Blvd", city: WPG };
const WSO_ADDR = { address: "Centennial Concert Hall", city: WPG };
const CLC = "Canada Life Centre";
const RAM_TEXT = `The Ram Motorsports Spectacular is roaring back into Canada Life Centre for its 40th Anniversary Tour, featuring monster trucks, high-flying motocross, mini monsters and more!

The Monster Truck Challenge will feature seven of the world’s toughest monster trucks, including Rockstar, Sheer Insanity, Identity Theft, Mixed Up, Spitfire, Roughneck and Crude Behavior. Watch as these massive machines battle it out in head-to-head racing before taking on a junk car-filled track in an action-packed freestyle competition.

Fans will also experience high-flying freestyle motocross, including the Radical Jump Contest featuring expert riders taking on the Canada Life Centre freestyle jump, plus the return of mini monster trucks.

Every ticket includes access to a free pre-show pit party, giving fans the chance to get an up-close look at the monster trucks and meet some of the drivers. Monster truck rides will also be available.`;
const BLUFISH_HH = "Valid during happy hour.";
const WAG_STORY = `WAG-Qaumajuq features an impressive collection of over 27,000 artworks spanning centuries, cultures, and media, including the largest public collection of contemporary Inuit art in the world.

Each piece has its own story to tell. Sharing these stories with the world is at the core of WAG-Qaumajuq. This is an engaging, accessible space where visitors can experience art and learning in new ways.`;

export const PERK_DETAILS: PerkDetails[] = [
  {
    provider: "Le Musée de Saint-Boniface Museum",
    title: "Membership",
    shortDescription: "Save $5 on each membership purchase.",
    description: `Save $5 on each membership purchase by using the code.

${P}

- Free admission (currently free, but not forever!)
- 10% discount at the gift shop all year round
- 20% off coupon for the gift shop
- Two complimentary guest passes
- Invitations to exclusive members-only events, including Wine and Cheese Night
- Discounts and priority for workshops and programs
- Free admission to all other Manitoba Signature Museums, including:
- Commonwealth Air Training Plan Museum, Brandon
- Royal Aviation Museum of Western Canada, Winnipeg
- Mennonite Heritage Village, Steinbach
- New Iceland Heritage Museum, Gimli
- Manitoba Agricultural Museum, Austin
- Canadian Fossil Discovery Centre, Morden

* excludes consignment items, cannot be combined with any other offer

In-person, simply show the code with the app to redeem!`,
    promo: "MUSEEMEMBER5OFF",
    howToRedeem: "In-person, simply show the code with the app to redeem!",
    method: "hybrid",
    url: "https://msbm.mb.ca/become-a-member-2/",
    qr: "https://msbm.mb.ca/become-a-member-2/",
    ...MUSEE_ADDR,
    exclusions: "Excludes consignment items, cannot be combined with any other offer.",
  },
  {
    provider: "Le Musée de Saint-Boniface Museum",
    title: "La Belle Boutique Blanche",
    shortDescription: "Get 10% off in La Belle Boutique Blanche.",
    description: `Get 10% OFF in La Belle Boutique Blanche by using the promo code.

${P}

Le Musée de Saint-Boniface Museum offers up this rustic boutique to visitors and locals alike who are searching for that perfect gift or memento. Great care is given to offer an eclectic array of local artisans’ works, indigenous jewellery and crafts, French-Canadian and Métis specialty items, old-fashioned children’s toys and products that are eco-conscious.

How to redeem: To use your 10% discount online, simply enter the promo code CULTURE10 at checkout when completing your purchase. If you're visiting La Belle Boutique Blanche in person, just open the app and show the promo code to a staff member.`,
    promo: "CULTURE10",
    howToRedeem: "To use your 10% discount online, simply enter the promo code CULTURE10 at checkout when completing your purchase. If you're visiting La Belle Boutique Blanche in person, just open the app and show the promo code to a staff member.",
    method: "hybrid",
    url: "https://msbmwpg.square.site/",
    qr: "https://msbmwpg.square.site/",
    ...MUSEE_ADDR,
  },
  {
    provider: "Crescendo Music Lessons",
    title: "Vocal Assessment",
    shortDescription: "A free vocal assessment for Culturosity users.",
    description: `Not only is singing good for your mental health and well-being it is proven to be healing to the body and soul and it is fun.

At Crescendo Music lessons we will help you find your voice and develop a solid foundation to strengthen your voice and build your vocals. Free Vocal Assessment is available for Culturosity users.`,
    howToRedeem: "Click Use Perk to register for your free vocal assessment.",
    method: "online",
    url: "https://crescendomusiclessons.square.site/register-now",
    qr: "https://crescendomusiclessons.square.site/register-now",
  },
  {
    provider: "Crescendo Music Lessons",
    title: "Learning to sing app.",
    shortDescription: "Save $10 on online voice lessons you can take at home.",
    description: `Take online voice lessons in the comfort of your home. This course will help you break down how to use your voice and connect to your breath. Establish a healthy vocal foundation.

If you are a beginner and have just always wanted to learn to sing or a more seasoned singer but want to grow in your voice this is for you. If you want to just like your voice singing in the kitchen or part of a choir. This course can help you grow towards your vocal growth.

To save $10, use the promo code at online checkout.

${P}`,
    promo: "CULTUROSITY",
    howToRedeem: "To save $10, use the promo code at online checkout.",
    method: "online",
    url: "https://crescendomusiclessons.square.site/product/finding-your-voice-online-app-course/49?cs=true",
    qr: "https://crescendomusiclessons.square.site/product/finding-your-voice-online-app-course/49?cs=true",
  },
  {
    provider: "Manitoba Museum Shop",
    title: "Manitoba Museum Shop",
    shortDescription: "Enjoy 15% off your first purchase.",
    description: `Discover Unique Gifts at the Manitoba Museum Store. Enjoy 15% Off Your First Purchase.

The Manitoba Museum Shop offers a unique selection of Museum merchandise, locally made goods, inspiring gifts, gourmet goodies, and more. Products can be purchased both in-store and online.

We've teamed up with Culturosity to offer 15% off your first purchase.

- In-store: Simply show your Culturosity app at checkout
- Online: Use promo code

${P}

Offer valid until June 1, 2027`,
    promo: "CULTUROSITY15",
    howToRedeem: "In-store: Simply show your Culturosity app at checkout",
    method: "hybrid",
    url: "https://www.manitobamuseumshop.ca",
    qr: "www.manitobamuseumshop.ca",
    city: WPG,
    endsAt: { date: "2027-06-02", time: "00:00" },
  },
  {
    provider: "Blufish Japanese Restaurant",
    title: "Feature Roll",
    shortDescription: "Save $2 on the Hot Seafood Roll during happy hour.",
    description: `Hot Seafood Roll

This delectable roll features salmon, tender pink tuna, and juicy prawns, then lightly deep-fried to perfection. Served with a side of hot sauce for an extra kick.

Valid during Happy Hour:
4:30 - 7:30 pm from Monday to Thursday
4:00 - 7:00 pm on Sunday

Save $2 when you simply present the QR code on the perk detail screen of our app.`,
    howToRedeem: "Save $2 when you simply present the QR code on the perk detail screen of our app.",
    method: "in_person",
    qr: "https://www.blufish.ca",
    city: WPG,
  },
  {
    provider: "Made Here",
    title: "Made Here",
    shortDescription: "Save 10% on all purchases, in-store or online.",
    description: `Culturosity members save 10% on all purchases, whether you're shopping in-store or online.

${P}

From handcrafted treasures to unique finds, Made Here celebrates the vibrant creativity of our community. Experience the essence of local culture and support talented artisans while enjoying savings on your purchases.`,
    promo: "MHCULTUROSITY10",
    howToRedeem: "Use the promo code online, or show it with the app in-store.",
    method: "hybrid",
    url: "https://madeheremb.com/collections/all",
    qr: "https://madeheremb.com/collections/all",
    address: "Richardson Centre Concourse, 1 Lombard Place",
    city: WPG,
  },
  {
    provider: "Made Here",
    title: "Made Here Corporate Gifts",
    shortDescription: "Save 15% on 4 or more corporate gift boxes.",
    description: `Dive into our diverse array of handcrafted treasures and unique finds, each celebrating the vibrant creativity of our local community. Embrace the essence of Winnipeg's cultural richness while supporting talented artisans.

Whether you're exploring Made Here's curated gift collections or creating your own, save 15% on purchases of 4 or more gifts. Each box must reach a minimum value of $50 before taxes to qualify for this special offer.

${P}

This offer is available for in-store purchases. Simply show the code with the app to redeem or email lindsey@madeheremb.com to send your order request and receive the discount.`,
    promo: "MHCORPORATE15",
    howToRedeem: "Simply show the code with the app to redeem or email lindsey@madeheremb.com to send your order request and receive the discount.",
    method: "in_person",
    qr: "https://madeheremb.com",
    address: "Richardson Centre Concourse, 1 Lombard Place",
    city: WPG,
    exclusions: "Minimum of 4 boxes; each box must reach a minimum value of $50 before taxes.",
  },
  {
    provider: "Folklorama",
    title: "Folklorama 365: Ethno-Cultural Artists",
    shortDescription: "Bring the experience of a Folklorama Pavilion to your workplace, school or party.",
    description: `The program is a great idea if you want to bring the experience of a Folklorama Pavilion to your workplace, school, or party or if you want to delve deeper into the more creative and educational aspects of what makes Folklorama so special!

These bookings can include anything from performances, workshops and classes in areas such as cooking, jewellery-making, storytelling sessions, and more.

Our Ethno-Cultural Arts Department can help make your next event unforgettable!`,
    howToRedeem: "Contact Folklorama’s Ethno-Cultural Arts Department to book your event.",
    method: "in_person",
    qr: "https://folklorama.ca",
    city: WPG,
  },
  {
    provider: "Blufish Japanese Restaurant",
    title: "Happy Hour - Lycheetini",
    shortDescription: "Save $2 on the signature Lycheetini during happy hour.",
    description: `Don't miss out on Happy Hour at Blufish, Monday through Thursday from 4:30 pm to 7:30 pm.

Enjoy our signature Lycheetini (Lychee Martini) and save $2 on your drink selection when you present the app.

${BLUFISH_HH}`,
    howToRedeem: "save $2 on your drink selection when you present the app.",
    method: "in_person",
    qr: "https://www.blufish.ca",
    city: WPG,
  },
  {
    provider: "The Pourium",
    title: "The Pourium's 'Passport To Wine'",
    shortDescription: "An exclusive 6-bottle case of wines from around the world for $100 ($125 value).",
    description: `An Exclusive 6-Bottle Case Pack is available to Culturosity Members for a special discount price of $100! Free delivery (within Winnipeg) is included.

Enjoy six assorted 750mL wines from around the world. ($125 Value)

${P}

You can enjoy more than one purchase per person.

Valid online and in-store at 942 Portage Ave.`,
    promo: "AROUNDTHEWORLD",
    howToRedeem: "Valid online and in-store at 942 Portage Ave.",
    method: "hybrid",
    url: "https://thepourium.com/discount/AROUNDTHEWORLD?redirect=/products/culturosity-6-pack",
    qr: "https://thepourium.com/discount/AROUNDTHEWORLD?redirect=/products/culturosity-6-pack",
    address: "942 Portage Ave.",
    city: WPG,
  },
  {
    provider: "Blufish Japanese Restaurant",
    title: "Happy Hour - Glass of Wine (9oz)",
    shortDescription: "$2 off any 9 oz glass of white or red wine during happy hour.",
    description: `Join us for Happy Hour at Blufish, Monday through Thursday from 4:30 pm to 7:30 pm, and enjoy $2 off any 9 oz glass of white or red wine listed in our menu.

Simply present the app to unlock this exclusive perk.

${BLUFISH_HH}`,
    howToRedeem: "Simply present the app to unlock this exclusive perk.",
    method: "in_person",
    qr: "https://www.blufish.ca",
    city: WPG,
  },
  {
    provider: "Blufish Japanese Restaurant",
    title: "Dessert for Birthdays",
    shortDescription: "A complimentary dessert on your special day.",
    description: `Join Blufish on your special day and enjoy a complimentary dessert as our gift to you.

Simply present the app to claim your free dessert!`,
    howToRedeem: "Simply present the app to claim your free dessert!",
    method: "in_person",
    qr: "https://www.blufish.ca",
    city: WPG,
  },
  {
    provider: "Blufish Japanese Restaurant",
    title: "Avocado on rice for kids under 6",
    shortDescription: "Kids under six enjoy a complimentary bowl of rice topped with avocado.",
    description: `Kids under six can enjoy a complimentary bowl of rice topped with creamy avocado.

It's a nutritious and delicious offering designed to cater to the tastes of little ones, ensuring they enjoy their dining experience to the fullest.

Simply present the app to claim the offer!`,
    howToRedeem: "Simply present the app to claim the offer!",
    method: "in_person",
    qr: "https://www.blufish.ca",
    city: WPG,
  },
  {
    provider: "WAG-Qaumajuq",
    title: "Main Floor of WAG-Qaumajuq",
    shortDescription: "The entire main floor of WAG-Qaumajuq is free for everyone.",
    description: `The entire main floor of WAG-Qaumajuq is FREE for everyone.

This includes art on display in the Main Hall and Visible Vault, access to screenings and talks in the theatres, and being able to meet with a friend at Katita Café or pick something up at ShopWAG.`,
    howToRedeem: "The entire main floor of WAG-Qaumajuq is FREE for everyone.",
    method: "in_person",
    qr: "www.wag.ca",
    ...WAG_ADDR,
  },
  {
    provider: "WAG-Qaumajuq",
    title: "Youth Admission",
    shortDescription: "Youth under 18 always get free admission.",
    description: `Youth under 18 years of age always get free admission at WAG-Qaumajuq.

${WAG_STORY}`,
    howToRedeem: "Youth under 18 years of age always get free admission at WAG-Qaumajuq.",
    method: "in_person",
    qr: "www.wag.ca",
    ...WAG_ADDR,
  },
  {
    provider: "WAG-Qaumajuq",
    title: "Indigenous People Admission",
    shortDescription: "Indigenous people get free admission.",
    description: `Indigenous people get free admission at WAG-Qaumajuq.

${WAG_STORY}`,
    howToRedeem: "Indigenous people get free admission at WAG-Qaumajuq.",
    method: "in_person",
    qr: "www.wag.ca",
    ...WAG_ADDR,
  },
  {
    provider: "Heritage Winnipeg",
    title: "Winnipeg 150: Stories Our Buildings Tell",
    shortDescription: "Save 20% on Heritage Winnipeg's book celebrating Winnipeg's 150th anniversary.",
    description: `Heritage Winnipeg is pleased to present its newest publication celebrating the 150th anniversary of the City of Winnipeg. This wonderful souvenir showcases our built heritage through storytelling and 150 original artworks by artist Robert Sweeney.

By Heritage Winnipeg
2024, softcover, 120 pages, 8 1/2 x 11 inches
Regular price $25

Don’t miss this exclusive offer for Culturosity users and save 20%.

Shipping is only available within Canada.

If not shipped, the book must be picked up at the Heritage Winnipeg Office, located at 509-63 Albert Street, Winnipeg, Manitoba.

Please contact Heritage Winnipeg at info@heritagewinnipeg.com to arrange pick up details at time of purchase.`,
    howToRedeem: "Click Use Perk to buy the book at 20% off.",
    method: "online",
    url: "https://heritagewinnipeg.com/culturosity/",
    qr: "https://heritagewinnipeg.com/culturosity/",
    city: WPG,
  },
  {
    provider: "Shakespeare in the Ruins",
    title: "Shakespeare Merch",
    shortDescription: "Save 10% on all Shakespeare merch — tees, mugs and more.",
    description: `For the Shakespeare lover in your life! Shop tees, mugs, and more.

Save 10% on all Shakespeare merch with promo code.

${P}`,
    promo: "CULTURPERK",
    howToRedeem: "Save 10% on all Shakespeare merch with promo code.",
    method: "online",
    url: "https://www.shakespearemerch.ca",
    qr: "https://www.shakespearemerch.ca",
  },
  {
    provider: "The Canadian Museum for Human Rights",
    title: "Regular Gallery Admission",
    shortDescription: "Save 15% on regular gallery admission.",
    description: `The Canadian Museum for Human Rights is the first museum anywhere solely dedicated to the evolution, celebration and future of human rights. Using innovative approaches to storytelling, we invite visitors to explore and reflect on human rights in Canada and internationally.

Click the USE PERK button to unlock the SAVE 15% offer. Once you have selected your preferred date, and tickets have been added to the cart, you will get a message that the promotion has been applied.

Use the promo code if you book tickets in person.

${P}`,
    promo: "CULTUROSITY",
    howToRedeem: "Use the promo code if you book tickets in person.",
    method: "hybrid",
    url: "https://ticketing.humanrights.ca/?promo=247",
    qr: "ticketing.humanrights.ca/?promo=247",
    address: "85 Israel Asper Way",
    city: WPG,
  },
  {
    provider: "Carnaval Brazilian BBQ Restaurant",
    title: "Special Discount",
    shortDescription: "Enjoy 10% off your food purchase in the dining room or lounge.",
    description: `Enjoy 10% off your food purchase in Carnaval's dining room or lounge while immersing yourself in the authentic flavours of Brazil.

Located along Winnipeg's scenic Waterfront Drive in the historic East Exchange.

To redeem this perk, simply show the app.`,
    howToRedeem: "To redeem this perk, simply show the app.",
    method: "in_person",
    qr: "www.carnavalrestaurant.ca",
    address: "270 Waterfront Drive",
    city: WPG,
  },
  {
    provider: "James Avenue Pumphouse",
    title: "Happy Hour Pricing All Day!",
    shortDescription: "Happy Hour prices on all Happy Hour items, all day, every day.",
    description: `Enjoy Happy Hour Prices — All Day, Every Day!

Get Happy Hour pricing on all Happy Hour items, from open to close, any day of the week.

Dine-in only.

Must present the Culturosity App at the time of redemption.`,
    howToRedeem: "Dine-in only. Must present the Culturosity app at the time of redemption.",
    method: "in_person",
    qr: "jamesavenuepumphouse.com",
    address: "2 - 109 James Avenue",
    city: WPG,
    exclusions: "Dine-in only.",
  },
  {
    provider: "Clay Oven East Indian Restaurants",
    title: "Special Discount",
    shortDescription: "Enjoy 10% off your meal.",
    description: `Enjoy 10% off your meal at Clay Oven East Indian Restaurants.

Show the Culturosity App with the perk details at the restaurant.

Come experience authentic East Indian cuisine—memorable food and exceptional value await!`,
    howToRedeem: "Show the Culturosity App with the perk details at the restaurant.",
    method: "in_person",
    qr: "https://www.clayoven.ca",
    city: WPG,
  },
  {
    provider: "Canadian Fossil Discovery Centre",
    title: "Admissions",
    shortDescription: "Save 10% on general admission.",
    description: `Discover ancient marine giants at the Canadian Fossil Discovery Centre!

Home to Canada’s largest collection of marine reptile fossils, the museum brings the Western Interior Seaway of the late Cretaceous period to life through engaging galleries and exhibits.

Culturosity users save 10% on general admission.

To redeem your perk, simply show this screen to the admissions staff.

Located just 1 hour and 20 minutes from Winnipeg via Perimeter and Highway #3.`,
    howToRedeem: "To redeem your perk, simply show this screen to the admissions staff.",
    method: "in_person",
    qr: "discoverfossils.com",
    address: "111-B Gilmour St.",
    city: "Morden",
  },
  {
    provider: "Siam Authentic Thai Cuisine",
    title: "All Dine-in Menu Items",
    shortDescription: "Get 10% off all dine-in menu items.",
    description: `Get 10% off all dine-in menu items (excluding alcoholic beverages) when you show the Culturosity app.

At Siam Thai Cuisine, every dish is made with the freshest meats, seafood, rice, and noodles, and sauces prepared daily in-house.

With its warm ambiance and authentic recipes, Siam Thai brings the vibrant flavors of Thailand to Winnipeg.

Proudly recognized with the Thai Select Premium certification by the Royal Thai Government — an honor given to only nine Thai restaurants in Canada — Siam Thai offers an experience that goes beyond dining.`,
    howToRedeem: "Get 10% off all dine-in menu items (excluding alcoholic beverages) when you show the Culturosity app.",
    method: "in_person",
    qr: "siamthairestaurant.ca",
    address: "587 St. Anne's Road",
    city: WPG,
    exclusions: "Excludes alcoholic beverages.",
  },
  {
    provider: "Spa Botanica",
    title: "Ayurvedic treatments",
    shortDescription: "Treat yourself with 10% off at Spa Botanica.",
    description: `Treat yourself with 10% off at Spa Botanica.

Rooted in authentic Ayurvedic tradition, Spa Botanica offers treatments that follow centuries-old healing rituals, from soothing Shirodhara to nourishing herbal therapies.

Step into a serene, culturally grounded space designed to restore balance, calm the mind, and honour the art of holistic well-being.

To redeem your offer, simply present the app at Spa Botanica.

Offer is valid for rejuvenating Ayurvedic treatments as well as personalized facials and massages. Spa Botanica offers a full range of both traditional and unique spa services.`,
    howToRedeem: "To redeem your offer, simply present the app at Spa Botanica.",
    method: "in_person",
    qr: "spabotanica.ca",
    city: WPG,
  },
  {
    provider: "WAG-Qaumajuq",
    title: "Canada Life Free Sunday@WAG-Qaumajuq",
    shortDescription: "Free admission to all of WAG-Qaumajuq on the second Sunday of the month.",
    description: `Enjoy free admission to all of WAG-Qaumajuq on the second Sunday of the month, thanks to Canada Life.

The upcoming dates for 2026:
- February 8
- March 8
- April 12
- May 10
- June 14
- July 12
- August 9
- September 13
- October 11
- November 8
- December 13

No need for pre-registration.

Free public parking is available at the Canada Life parking lot behind 100 Osborne Street North for visitors on Canada Life Free Sunday@WAG-Qaumajuq. As well, downtown street parking is free on Sundays.`,
    howToRedeem: "No need for pre-registration.",
    method: "in_person",
    qr: "www.wag.ca",
    ...WAG_ADDR,
    endsAt: { date: "2026-12-14", time: "00:00" },
  },
  {
    provider: "WAG-Qaumajuq",
    title: "WAG Wednesday Nights",
    shortDescription: "Weekly free admission to the galleries and more, Wednesdays 5–9 pm.",
    description: `WAG Wednesday Nights is your new mid-week ritual. Your cultural reset. Your place to be.

Enjoy weekly free admission to the galleries and more from 5-9 pm.

WAG-Qaumajuq transforms Wednesday nights into an after-hours experience designed for people who want more from their week — more creativity, more connection, more inspiration.

Whether you're escaping the mid-week slump or looking for a new social scene that isn't the usual bar or crowded weekend rush, WAG Wednesday Nights invite you to explore the Gallery in a completely different way. Think: music echoing through art-filled halls, artists and DJs setting the mood, curated tours, creative pop-ups, and a community of people who want to make Wednesday the highlight of their week.`,
    howToRedeem: "Enjoy weekly free admission to the galleries and more from 5-9 pm.",
    method: "hybrid",
    url: "https://www.wag.ca/events/signature-events/wag-wednesday-nights/",
    qr: "https://www.wag.ca/events/signature-events/wag-wednesday-nights/",
    ...WAG_ADDR,
  },
  {
    provider: "Winnipeg Symphony Orchestra",
    title: "Buy one subscription, bring a friend for free",
    newTitle: "Buy one subscription, bring a friend for free to Symphonic Sessions",
    shortDescription: "Introduce Symphonic Sessions to a friend — they come free with your subscription.",
    description: `Introduce Symphonic Sessions to a friend!

${P}

To redeem, click “Use Perk” and apply the promo code at checkout.

Symphonic Sessions are Thursday concerts that are easy to fit into your week. These concerts have a less formal feel and feature introductions to the pieces being performed by the conductor. After the concert, you are welcome to join us for a free beverage during a Q&A with the conductor and featured musicians.

This 2026-2027 season, experience 5 unforgettable sessions:
- Berlioz's Les Nuits d’été & Schubert's Symphony No. 4 — Thursday, Oct 22, 2026 | 7:00 p.m.
- Britten's Four Sea Interludes & Elgar's Enigma Variations — Thursday, Nov 12, 2026 | 7:00 p.m.
- Liszt's Piano Concerto No. 2 & Schumann's Symphony No. 3 — Thursday, Feb 25, 2027 | 7:00 p.m.
- Mendelssohn's Violin Concerto & Stravinsky's Petrushka — Thursday, Apr 1, 2027 | 7:00 p.m.
- Glière's Horn Concerto & “Musicians’ Choice” — Thursday, May 13, 2027 | 7:00 p.m.`,
    promo: "SYMPHONIC",
    howToRedeem: "To redeem, click “Use Perk” and apply the promo code at checkout.",
    method: "online",
    url: "https://my.wso.ca/packages/fixed/311?premove=Y",
    qr: "https://my.wso.ca/packages/fixed/311?premove=Y",
    ...WSO_ADDR,
    endsAt: { date: "2027-05-13", time: "19:00" },
  },
  {
    provider: "Winnipeg Symphony Orchestra",
    title: "Season 2026/2027",
    shortDescription: "Enjoy 15% off Masterworks, Symphonic Sessions and Live at the WSO concerts.",
    description: `Enjoy 15% off of any Masterworks, Symphonic Sessions, or Live at the WSO/Live at the WSO POPS concerts.

Experience unforgettable performances ranging from timeless orchestral works to exciting live concert events.

${P}

To redeem the perk, simply click the “Use Perk” button at checkout.`,
    promo: "CULTURE2627",
    howToRedeem: "To redeem the perk, simply click the “Use Perk” button at checkout.",
    method: "online",
    url: "https://my.wso.ca/events?premove=?promo=4735",
    qr: "https://my.wso.ca/events?premove=?promo=4735",
    ...WSO_ADDR,
  },
  {
    provider: "Manitoba Opera",
    title: "Treemonisha",
    shortDescription: "Save 15% on tickets for the Wednesday, November 25 performance.",
    description: `A Pulitzer Prize-winning original. A Triumphant adaptation of Joplin's groundbreaking opera, reimagined for the 21st century.

SAVE 15% on tickets for the Wednesday performance (November 25, 7:00 PM) with the special promo code:

${P}

The Story

It is the late 1880s in the Deep South. The people are divided against themselves. A group of upwardly mobile Freedmen are now running a plantation near Texarkana. They are striving to become an essential part of an emerging new America.

In the surrounding forest, a group of Maroons are rebuilding a nearly lost connection to their African ancestry. They do not value a country that has so recently seen them as nothing but property.

Their coexistence is fragile but functional, until it is shattered by an act of violence. Into this conflict comes a young woman who discovers she has roots in both communities. At this crucial moment in history, her choices will determine the future.

Her name is Treemonisha.`,
    promo: "cultur26",
    howToRedeem: "SAVE 15% on tickets for the Wednesday performance (November 25, 7:00 PM) with the special promo code:",
    method: "online",
    url: "https://mbopera.ca/whats-on/book?instanceId=16001",
    qr: "https://mbopera.ca/whats-on/book?instanceId=16001",
    endsAt: { date: "2026-11-25", time: "19:00" },
  },
  {
    provider: "Manitoba Opera",
    title: "Madama Butterfly",
    shortDescription: "Save 15% on tickets for the Wednesday, April 21 performance.",
    description: `A BELOVED STORY. UNFORGETTABLE MELODIES.

SAVE 15% on tickets for the Wednesday performance (April 21, 7:00 PM) with the special promo code:

${P}

The Story

This haunting drama in the high hills of the Nagasaki harbour tells the story of Cio-Cio-San, a beautiful and innocent Japanese geisha who falls in love with Pinkerton, a dashing U.S. Navy lieutenant. Her love for Pinkerton transcends culture and family, and they marry. But some vows aren’t forever. Pinkerton soon leaves Japan and Butterfly unwaveringly waits three long years for his return. When his ship comes in her dreams for the future meet his — with tragic and heartbreaking results.`,
    promo: "cultur26",
    howToRedeem: "SAVE 15% on tickets for the Wednesday performance (April 21, 7:00 PM) with the special promo code:",
    method: "online",
    url: "https://mbopera.ca/whats-on/book?instanceId=16202",
    qr: "https://mbopera.ca/whats-on/book?instanceId=16202",
    endsAt: { date: "2027-04-21", time: "19:00" },
  },
  {
    provider: CLC,
    title: "Harlem Globetrotters: Rivalry Tour",
    shortDescription: "Save up to $26.50 per ticket for the Harlem Globetrotters on Jan 5, 2027.",
    description: `Save up to $26.50 per ticket by using the “Use Perk” button to access discounted tickets for the Harlem Globetrotters: Rivalry Tour on Jan 5, 2027 at Canada Life Centre.

Have the Harlem Globetrotters finally met their match? The Washington Generals and a new lineup of rivals step onto the court — hungry for a win, and out to prove it! This year, new challenges enter the game too.

The Harlem Globetrotters — the team that invented basketball culture — bring the Rivalry Tour to your city as part of their all-new 2027 world tour, with a roster of stars who turn every possession into showtime, quarter after quarter. This is a whole new experience — you're not just watching, you're part of it. You help decide. Get pulled onto the court. Join the squad. Own the jumbotron. Because anything can happen at a Globetrotters game.

A free, all-new pre-game tip-off party kicks off the moment doors open, packed with new surprises for longtime fans and first-time families. This is Globetrotters joy — electric, and built for YOU!

New rivals. New challenges. An all-new show.
The rivalry is theirs. The thrill is yours.`,
    howToRedeem: "Save up to $26.50 per ticket by using the “Use Perk” button to access discounted tickets for the Harlem Globetrotters: Rivalry Tour on Jan 5, 2027 at Canada Life Centre.",
    method: "online",
    url: "https://www.ticketmaster.ca/event/1100651194E65909?did=culturosity",
    qr: "https://www.ticketmaster.ca/event/1100651194E65909?did=culturosity",
    endsAt: { date: "2027-01-06", time: "00:00" },
  },
  {
    provider: "WAG-Qaumajuq",
    title: "Mini Holiday Stockings with Jennine Krauchi",
    shortDescription: "A free hands-on beadwork workshop with Métis artist Jennine Krauchi.",
    description: `Nov 18
5:00 pm - 9:00 pm
FREE ENTRY

Learn the art of two-needle beadwork with Métis beadwork artist and master beadworker Jennine Krauchi in this hands-on holiday workshop.

Presented in partnership with Mentoring Artists for Women’s Art (MAWA), this workshop invites participants to create their own mini beaded holiday stockings while learning directly from Krauchi.

Participants will also have the opportunity to spend time with the artist's work featured in the exhibition Reframed.

Krauchi has shared her knowledge through hundreds of workshops at institutions and cultural events, including the St. Boniface Museum, Manitoba Museum, Festival du Voyageur, and MAWA. Her practice spans beaded gifts, regalia, and designs featured on two Royal Canadian Mint coins in 2022 and 2023. Her work has been exhibited nationally and internationally, including at WAG-Qaumajuq, the Canadian Museum for Human Rights, and the National Gallery of Canada.

In 2024, Krauchi received the Manitoba Arts Council Award of Distinction in recognition of her contributions to the arts.

Whether you're looking to develop your beading skills or learn from an accomplished Métis artist, this workshop offers a meaningful opportunity to create, connect, and celebrate the season through beadwork.`,
    howToRedeem: "Nov 18\n5:00 pm - 9:00 pm\nFREE ENTRY",
    method: "in_person",
    qr: "www.wag.ca",
    ...WAG_ADDR,
    endsAt: { date: "2026-11-18", time: "21:00" },
  },
  {
    provider: "Winnipeg Symphony Orchestra",
    title: "Beethoven’s Violin Concerto & Sibelius’ Symphony",
    newTitle: "Beethoven’s Violin Concerto & Sibelius’ Symphony No. 1",
    shortDescription: "Enjoy 15% off Beethoven’s Violin Concerto & Sibelius’ Symphony No. 1, Jan 23–24, 2027.",
    description: `Sat Jan 23 2027, 7:30 pm
Sun Jan 24 2027, 2:00 pm

Ludwig Van Beethoven: Violin Concerto
Jean Sibelius: Symphony No. 1

Enjoy 15% off with the Promo Code.

${P}

To redeem the perk, simply click the “Use Perk” button at checkout.

Warm, inviting, and full of feeling, this program brings together two unforgettable works under the direction of Daniel Raiskin. At the heart of the evening is Concertmaster Karl Stobbe, who takes centre stage to perform Ludwig van Beethoven's Violin Concerto in D major. Elegant and expressive, it's music that unfolds naturally, drawing you in with its warmth and quiet brilliance, and offering a special chance to see a remarkable leader in a new light.

Raiskin then leads the orchestra in Jean Sibelius’ Symphony No. 1. Inspired by the wide northern landscapes of his native Finland and by the emotional style of late Romantic music, this sweeping symphony moves from a hushed, atmospheric opening to moments of real intensity, showing off the full colour and power of the orchestra.

Marking 200 years since Beethoven's passing, this program offers a thoughtful nod to his legacy, balanced with the rich, romantic voice of Sibelius.`,
    promo: "CULTURE2627",
    howToRedeem: "To redeem the perk, simply click the “Use Perk” button at checkout.",
    method: "online",
    url: "https://my.wso.ca/3760/3762",
    qr: "https://my.wso.ca/3760/3762",
    ...WSO_ADDR,
    endsAt: { date: "2027-01-24", time: "14:00" },
  },
  {
    provider: CLC,
    title: "Ram Motorsports Spectacular - Feb 6, 2027",
    shortDescription: "Save 25% per ticket for the Ram Motorsports Spectacular on Feb 6, 2027 at 2 pm.",
    description: `SAVE 25% per ticket by using the “Use Perk” button to access discounted tickets for the Ram Motorsports Spectacular on Feb 6, 2027 at 2 pm.

${RAM_TEXT}`,
    howToRedeem: "SAVE 25% per ticket by using the “Use Perk” button to access discounted tickets for the Ram Motorsports Spectacular on Feb 6, 2027 at 2 pm.",
    method: "online",
    url: "https://www.ticketmaster.ca/event/11006541E6A8CE27?did=culturosity",
    qr: "https://www.ticketmaster.ca/event/11006541E6A8CE27?did=culturosity",
    endsAt: { date: "2027-02-06", time: "14:00" },
  },
  {
    provider: CLC,
    title: "Ram Motorsports Spectacular - Feb 7, 2027",
    shortDescription: "Save 25% per ticket for the Ram Motorsports Spectacular on Feb 7, 2027 at 2 pm.",
    description: `SAVE 25% per ticket by using the “Use Perk” button to access discounted tickets for the Ram Motorsports Spectacular on Feb 7, 2027 at 2 pm.

${RAM_TEXT}`,
    howToRedeem: "SAVE 25% per ticket by using the “Use Perk” button to access discounted tickets for the Ram Motorsports Spectacular on Feb 7, 2027 at 2 pm.",
    method: "online",
    url: "https://www.ticketmaster.ca/event/11006541E6AFCE34?did=culturosity",
    qr: "https://www.ticketmaster.ca/event/11006541E6AFCE34?did=culturosity",
    endsAt: { date: "2027-02-07", time: "14:00" },
  },
];
