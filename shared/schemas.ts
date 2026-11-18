import { z } from "zod";
import { isValidTimeZone, windowFromInput } from "./time";
import { VALUE_TYPES, isSafeHttpUrl } from "./perk";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker (YYYY-MM-DD)");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)");
const opt = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());
const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(isSafeHttpUrl, "Enter a full web address starting with https://");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address").max(254);
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /[^A-Za-z]/.test(p), "Mix letters with numbers or symbols");

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1, "Enter your name").max(120),
});
export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password").max(200) });

export const providerInputSchema = z.object({
  existingId: opt(z.string().uuid()),
  name: z.string().trim().min(2, "Enter the provider's display name").max(120),
  description: z.string().trim().max(2000).default(""),
  category: z.string().trim().max(60).default(""),
  website: opt(httpUrl),
  publicEmail: opt(emailSchema),
  publicPhone: opt(z.string().trim().max(40).regex(/^[0-9+().\-\s]{7,40}$/, "Enter a valid phone number")),
  logoAssetId: opt(z.string().uuid()),
});

export const perkInputSchema = z
  .object({
    provider: providerInputSchema,
    title: z.string().trim().min(3, "Enter a perk title").max(140),
    shortDescription: z.string().trim().min(10, "Add a short listing description (10+ characters)").max(240),
    fullDescription: z.string().trim().min(20, "Add a full description (20+ characters)").max(8000),
    category: z.string().trim().min(2, "Choose a category").max(60),
    tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
    value: z.object({
      type: z.enum(VALUE_TYPES),
      label: opt(z.string().trim().max(60)),
      percent: opt(z.coerce.number()),
      amount: opt(z.coerce.number()),
      currency: opt(z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code")),
      conditions: z.string().trim().max(1000).default(""),
    }),
    availability: z.object({
      ongoing: z.boolean(),
      startDate: opt(dateStr),
      startTime: opt(timeStr),
      endDate: opt(dateStr),
      endTime: opt(timeStr),
      timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone"),
      bookingDeadline: opt(dateStr),
      blackoutDates: z.array(dateStr).max(60).default([]),
    }),
    occurrences: z
      .array(
        z.object({
          date: dateStr,
          startTime: timeStr,
          endTime: opt(timeStr),
          venue: z.string().trim().max(200).default(""),
          notes: z.string().trim().max(500).default(""),
        }),
      )
      .max(60)
      .default([]),
    media: z.object({
      imageAssetId: opt(z.string().uuid()),
      imageAlt: z.string().trim().max(250).default(""),
      additional: z.array(z.object({ assetId: z.string().uuid(), alt: z.string().trim().min(3).max(250) })).max(8).default([]),
    }),
    redemption: z.object({
      method: z.enum(["online", "in_person", "hybrid"]),
      url: opt(httpUrl),
      instructions: z.string().trim().min(10, "Explain exactly how members redeem this offer").max(3000),
      promoCode: opt(z.string().trim().max(60)),
      usageLimitPerMember: opt(z.coerce.number().int().min(1).max(1000)),
      posReference: opt(z.string().trim().max(120)),
    }),
    location: z.object({
      onlineOnly: z.boolean(),
      addressLine: opt(z.string().trim().max(200)),
      city: opt(z.string().trim().max(100)),
      region: opt(z.string().trim().max(100)),
      postalCode: opt(z.string().trim().max(20)),
      country: opt(z.string().trim().max(60)),
      lat: opt(z.coerce.number().min(-90).max(90)),
      lng: opt(z.coerce.number().min(-180).max(180)),
    }),
    eligibility: z.object({
      groups: z.string().trim().min(3, "Describe who is eligible").max(1000),
      householdAllowed: z.boolean().default(false),
      exclusions: z.string().trim().max(2000).default(""),
      terms: z.string().trim().max(4000).default(""),
    }),
    allowDistribution: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    const v = p.value;
    if (v.type === "percent") {
      if (v.percent === undefined || !(v.percent > 0 && v.percent <= 100))
        ctx.addIssue({ code: "custom", path: ["value", "percent"], message: "Enter a percentage between 0 and 100" });
    }
    if (v.type === "amount") {
      if (v.amount === undefined || !(v.amount > 0) || Math.round(v.amount * 100) !== Number((v.amount * 100).toFixed(2)))
        ctx.addIssue({ code: "custom", path: ["value", "amount"], message: "Enter a positive amount (max 2 decimals)" });
      if (!v.currency) ctx.addIssue({ code: "custom", path: ["value", "currency"], message: "Choose a currency for dollar savings" });
    }
    if (v.type === "special" && !v.label)
      ctx.addIssue({ code: "custom", path: ["value", "label"], message: "Describe the special offer (e.g. “VIP tour included”)" });

    const a = p.availability;
    if (!a.ongoing && !a.endDate)
      ctx.addIssue({ code: "custom", path: ["availability", "endDate"], message: "Add an end date or mark the offer as ongoing" });
    if (a.ongoing && a.endDate)
      ctx.addIssue({ code: "custom", path: ["availability", "endDate"], message: "Ongoing offers should not have an end date" });
    if (a.startTime && !a.startDate)
      ctx.addIssue({ code: "custom", path: ["availability", "startDate"], message: "Add a start date for the start time" });
    if (a.endTime && !a.endDate)
      ctx.addIssue({ code: "custom", path: ["availability", "endDate"], message: "Add an end date for the end time" });
    if (isValidTimeZone(a.timezone)) {
      const w = windowFromInput({ ...a, ongoing: a.ongoing });
      if (w.startsAt && w.endsAt && w.startsAt >= w.endsAt)
        ctx.addIssue({ code: "custom", path: ["availability", "endDate"], message: "End must be after the start" });
      if (w.endsAt && w.endsAt.getTime() <= Date.now())
        ctx.addIssue({ code: "custom", path: ["availability", "endDate"], message: "This end date has already passed" });
    }
    p.occurrences.forEach((o, i) => {
      if (o.endTime && o.endTime <= o.startTime)
        ctx.addIssue({ code: "custom", path: ["occurrences", i, "endTime"], message: "Event end must be after its start" });
    });

    const r = p.redemption;
    if ((r.method === "online" || r.method === "hybrid") && !r.url)
      ctx.addIssue({ code: "custom", path: ["redemption", "url"], message: "Add the exact redemption web address" });
    if (r.method === "in_person" && r.url)
      ctx.addIssue({ code: "custom", path: ["redemption", "url"], message: "In-person offers use the member card; remove the web address or choose Hybrid" });

    const l = p.location;
    if (r.method !== "online" && l.onlineOnly)
      ctx.addIssue({ code: "custom", path: ["location", "onlineOnly"], message: "In-person and hybrid offers need a location" });
    if (!l.onlineOnly) {
      if (!l.city) ctx.addIssue({ code: "custom", path: ["location", "city"], message: "Enter the city" });
      if (!l.country) ctx.addIssue({ code: "custom", path: ["location", "country"], message: "Enter the country" });
      if (r.method !== "online" && !l.addressLine)
        ctx.addIssue({ code: "custom", path: ["location", "addressLine"], message: "Enter the street address members will visit" });
    }
    if (p.media.imageAssetId && p.media.imageAlt.length < 3)
      ctx.addIssue({ code: "custom", path: ["media", "imageAlt"], message: "Describe the image for people using screen readers" });
  });
export type PerkInput = z.infer<typeof perkInputSchema>;

export const submissionSchema = z.object({
  idempotencyKey: z.string().min(16).max(100),
  destination: z.object({ orgId: z.string().uuid(), programId: z.string().uuid() }),
  perk: perkInputSchema,
  submitter: z.object({
    name: z.string().trim().min(2, "Enter your name").max(120),
    email: emailSchema,
    organization: z.string().trim().max(160).default(""),
    authorityConfirmed: z.literal(true, { error: "Confirm you are authorised to publish this offer and media" }),
  }),
});
export type SubmissionInput = z.infer<typeof submissionSchema>;

export const draftSchema = z.object({
  idempotencyKey: z.string().min(16).max(100),
  destination: z.object({ orgId: z.string().uuid(), programId: z.string().uuid() }),
  draft: z.record(z.string(), z.unknown()),
});

export const SERVICE_NEEDS = [
  "Program strategy and benefits planning",
  "Branded portal setup and launch",
  "Provider discovery and relationship coordination",
  "Perk entry, cataloguing, maintenance and renewals",
  "Employee/member onboarding and engagement materials",
  "Reporting, ongoing updates and program improvement",
] as const;

export const serviceRequestSchema = z.object({
  organizationName: z.string().trim().min(2, "Enter your organization").max(160),
  contactName: z.string().trim().min(2, "Enter a contact name").max(120),
  contactEmail: emailSchema,
  approxMemberCount: opt(z.coerce.number().int().min(1).max(10_000_000)),
  serviceNeeds: z.array(z.enum(SERVICE_NEEDS)).min(1, "Choose at least one service"),
  approach: z.enum(["self_service", "launch", "managed", "unsure"]),
  coverage: z.string().trim().max(300).default(""),
  targetLaunch: z.string().trim().max(120).default(""),
  message: z.string().trim().max(4000).default(""),
  orgSlug: opt(z.string().max(64)),
  website: z.string().max(0).optional(), // honeypot
});

export const PIPELINE_STAGES = [
  "researching",
  "qualified",
  "contact_planned",
  "contacted",
  "demo_booked",
  "proposal",
  "won",
  "lost",
  "do_not_contact",
] as const;
export const PIPELINE_LABELS: Record<(typeof PIPELINE_STAGES)[number], string> = {
  researching: "Researching",
  qualified: "Qualified",
  contact_planned: "Contact Planned",
  contacted: "Contacted",
  demo_booked: "Demo Booked",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
  do_not_contact: "Do Not Contact",
};

export const PROSPECT_TYPES = ["employer", "association", "operator", "merchant"] as const;
export const PROSPECT_TYPE_LABELS: Record<(typeof PROSPECT_TYPES)[number], string> = {
  employer: "Employer / organization with a program",
  association: "Association / union / membership organization",
  operator: "Affinity program operator / aggregator",
  merchant: "Merchant / benefit provider",
};

export const researchOrgSchema = z.object({
  displayName: z.string().trim().min(2).max(200),
  aliases: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  primaryDomain: opt(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like example.com")),
  country: z.array(z.enum(["CA", "US"])).min(1, "Choose Canada and/or USA"),
  region: z.string().trim().max(200).default(""),
  industry: z.string().trim().max(120).default(""),
  prospectTypes: z.array(z.enum(PROSPECT_TYPES)).min(1, "Choose at least one classification"),
  audience: z.string().trim().max(500).default(""),
  researchFocus: z.string().trim().max(300).default(""),
  internalNotes: z.string().trim().max(5000).default(""),
  fitAssessment: z.string().trim().max(2000).default(""),
  program: z
    .object({
      name: z.string().trim().min(2).max(200),
      summary: z.string().trim().max(2000).default(""),
      coverage: z.string().trim().max(300).default(""),
      perkCategories: z.array(z.string().trim().max(60)).max(20).default([]),
      eligibility: z.string().trim().max(1000).default(""),
      pricing: z.string().trim().max(500).default(""),
      officialWebsite: opt(httpUrl),
      programUrl: opt(httpUrl),
      contactUrl: opt(httpUrl),
      publicEmail: opt(emailSchema),
      publicPhone: opt(z.string().trim().max(40)),
    })
    .optional(),
  source: z
    .object({ url: httpUrl, title: z.string().trim().max(300).default(""), reviewedAt: dateStr, note: z.string().trim().max(1000).default("") })
    .optional(),
});

export const OUTREACH_OBJECTIVES = {
  sell_program: "Sell a company affinity program",
  managed_support: "Offer managed program support",
  recruit_merchant: "Recruit a merchant offer",
  partnership: "Explore a partnership",
  book_demo: "Book a demonstration",
} as const;
export const OUTREACH_CHANNELS = {
  email: "Email",
  sms: "SMS / text",
  phone: "Phone",
  demo: "Demo outline",
} as const;

export const outreachRequestSchema = z.object({
  researchOrgId: z.string().uuid(),
  objective: z.enum(Object.keys(OUTREACH_OBJECTIVES) as [keyof typeof OUTREACH_OBJECTIVES]),
  channel: z.enum(Object.keys(OUTREACH_CHANNELS) as [keyof typeof OUTREACH_CHANNELS]),
  persona: z.string().trim().max(120).default(""),
  tone: z.enum(["warm", "concise", "formal", "energetic"]).default("warm"),
  sourceIds: z.array(z.string().uuid()).max(10).default([]),
  senderName: z.string().trim().max(80).default(""),
});
