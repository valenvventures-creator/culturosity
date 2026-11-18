// Sourced research starting set (reviewed 2026-11-17). These are research records only —
// not Culturosity partners, not offers, and not a complete Canada/USA directory.
// Unpublished contact, pricing and eligibility details are intentionally left empty.
import type { Db } from "../db";

type T = "employer" | "association" | "operator" | "merchant";
interface Seed {
  org: string;
  program: string;
  domain: string | null;
  country: ("CA" | "US")[];
  focus: string;
  types: T[];
  purpose: string;
  url: string;
  operator?: string;
  industry?: string;
  aliases?: string[];
}

const REVIEWED = "2026-11-17";

export const RESEARCH_SEED: Seed[] = [
  { org: "Abenity", program: "Abenity employee and member discount programs", domain: "abenity.com", country: ["US"], focus: "USA; wider coverage to qualify", types: ["operator"], purpose: "Employee and member discount programmes", url: "https://abenity.com/", industry: "Benefits technology" },
  { org: "Access Perks", program: "Access Perks", domain: "accessperks.com", country: ["US"], focus: "USA", types: ["operator"], purpose: "Employee discount network and rewards offering", url: "https://accessperks.com/", industry: "Benefits technology" },
  { org: "AT&T", program: "AT&T Perks for Employees", domain: null, country: ["US"], focus: "USA; programme coverage to qualify", types: ["employer"], purpose: "Public employee discount programme description", url: "https://www.benefithub.com/att-perks-employees", operator: "BenefitHub", industry: "Telecommunications" },
  { org: "BenefitHub", program: "BenefitHub solutions", domain: "benefithub.com", country: ["CA", "US"], focus: "North America and international", types: ["operator"], purpose: "Employee discounts, benefits, and rewards platform", url: "https://www.benefithub.com/benefithub-solutions", industry: "Benefits technology" },
  { org: "CAA South Central Ontario", program: "CAA Rewards", domain: "caasco.com", country: ["CA"], focus: "Canada; club/service area specific", types: ["association"], purpose: "Member savings across travel, retail, dining, and attractions", url: "https://www.caasco.com/rewards", industry: "Automobile club / membership" },
  { org: "Canadian Forces Morale and Welfare Services", program: "CF One", domain: "cfmws.ca", country: ["CA"], focus: "Canada; military-community eligibility", types: ["association"], purpose: "Discounts and shopping benefits for eligible CF One members", url: "https://www.cfmws.ca/discounts-shopping", industry: "Military community services", aliases: ["CFMWS"] },
  { org: "EdvantagePerks / OTIP", program: "EdvantagePerks", domain: "edvantage.ca", country: ["CA"], focus: "Canada; participating groups", types: ["association", "operator"], purpose: "Savings through partners for members of participating groups/associations", url: "https://www.edvantage.ca/faq", industry: "Education sector membership", aliases: ["OTIP"] },
  { org: "Member Benefits", program: "Member Benefits programme administration", domain: "memberbenefits.com", country: ["US"], focus: "USA; programme/state eligibility varies", types: ["operator"], purpose: "Association and group benefit programme administration", url: "https://memberbenefits.com/what-we-do/", industry: "Affinity benefits administration" },
  { org: "National Association of REALTORS®", program: "NAR REALTOR Benefits®", domain: "nar.realtor", country: ["US"], focus: "USA; member eligibility", types: ["association"], purpose: "Customized member offers through selected partners", url: "https://www.nar.realtor/realtor-benefits-program", industry: "Professional association", aliases: ["NAR"] },
  { org: "NEA Member Benefits", program: "NEA Member Benefits", domain: "neamb.com", country: ["US"], focus: "USA; educator/member eligibility", types: ["association"], purpose: "Educator/member benefits, travel, shopping, and other services", url: "https://www.neamb.com/", industry: "Education union / association" },
  { org: "Perkopolis", program: "Perkopolis", domain: "perkopolis.com", country: ["CA"], focus: "Canada", types: ["operator"], purpose: "Managed employee and member discount programmes", url: "https://www.perkopolis.com/about", industry: "Benefits technology" },
  { org: "Perks at Work / Next Jump", program: "Perks at Work", domain: "perksatwork.com", country: ["US"], focus: "USA focus; international coverage to qualify", types: ["operator"], purpose: "Employee pricing and member resources", url: "https://www.perksatwork.com/login", industry: "Benefits technology", aliases: ["Next Jump"] },
  { org: "PerkSpot", program: "PerkSpot", domain: "perkspot.com", country: ["US"], focus: "USA focus; coverage to qualify", types: ["operator"], purpose: "Employee discounts and employer programme support", url: "https://www.perkspot.com/", industry: "Benefits technology" },
  { org: "ServicePlus Group", program: "ServicePlus member savings", domain: "serviceplusgroup.ca", country: ["CA"], focus: "Canada; participating organizations", types: ["association"], purpose: "Member savings through participating organizations and merchant partners", url: "https://serviceplusgroup.ca/about/", industry: "Union / member services" },
  { org: "TELUS", program: "TELUS Exclusive Partner Program", domain: "telus.com", country: ["CA"], focus: "Canada; workplace/organization eligibility", types: ["merchant"], purpose: "Connectivity offers for eligible employees and their families", url: "https://www.telus.com/en/mobility/epp-corporate-plan", industry: "Telecommunications" },
  { org: "Union Plus", program: "Union Plus shopping and lifestyle benefits", domain: "unionplus.org", country: ["US"], focus: "USA; union eligibility", types: ["association"], purpose: "Shopping and lifestyle benefits for eligible union members/families", url: "https://www.unionplus.org/benefits/shopping-discounts", industry: "Union benefits" },
  { org: "Union Savings", program: "Union Savings", domain: "unionsavings.ca", country: ["CA"], focus: "Canada; participating unions", types: ["association"], purpose: "Union-run member discount programme", url: "https://unionsavings.ca/en/for-unions", industry: "Union benefits" },
  { org: "UPS", program: "UPS SmartSavings Marketplace", domain: null, country: ["US"], focus: "USA focus; programme coverage to qualify", types: ["employer"], purpose: "Public employee discount marketplace description", url: "https://www.benefithub.com/ups-smartsavings-marketplace", operator: "BenefitHub", industry: "Logistics" },
  { org: "Venngo", program: "WorkPerks", domain: "venngo.com", country: ["CA"], focus: "Canada; USA programme available to qualify", types: ["operator"], purpose: "Private employee discount programme, online and in-store", url: "https://workperks.venngo.com/faq", industry: "Benefits technology", aliases: ["WorkPerks"] },
  { org: "Working Advantage", program: "Working Advantage employer savings platform", domain: "workingadvantage.com", country: ["US"], focus: "USA focus; coverage to qualify", types: ["operator"], purpose: "Employer employee-savings platform with customizable branding", url: "https://www.workingadvantage.com/employer", industry: "Benefits technology" },
];

export async function seedResearch(db: Db): Promise<number> {
  let created = 0;
  const ids = new Map<string, string>();
  for (const s of RESEARCH_SEED) {
    const existing = await db.query<{ id: string }>(`select id from research_organizations where lower(display_name) = lower($1)`, [s.org]);
    if (existing.rows[0]) {
      ids.set(s.org, existing.rows[0].id);
      continue;
    }
    const r = await db.query<{ id: string }>(
      `insert into research_organizations (display_name, aliases, primary_domain, country, industry, prospect_types, research_focus,
         verification_status, last_checked_at)
       values ($1,$2::text[],$3,$4::text[],$5,$6::text[],$7,'source_reviewed',$8) returning id`,
      [s.org, s.aliases ?? [], s.domain, s.country, s.industry ?? "", s.types, s.focus, new Date(`${REVIEWED}T12:00:00Z`)],
    );
    ids.set(s.org, r.rows[0].id);
    created++;
  }
  for (const s of RESEARCH_SEED) {
    const orgId = ids.get(s.org)!;
    const has = await db.query(`select 1 from research_programs where organization_id = $1`, [orgId]);
    if (has.rows.length) continue;
    const operatorId = s.operator ? ids.get(s.operator) ?? null : null;
    const p = await db.query<{ id: string }>(
      `insert into research_programs (organization_id, operator_org_id, name, summary, coverage, program_url, official_website, verification_status, last_checked_at)
       values ($1,$2,$3,$4,$5,$6,$7,'source_reviewed',$8) returning id`,
      [orgId, operatorId, s.program, s.purpose, s.focus, s.url, s.domain ? `https://${s.domain === "nar.realtor" ? "www.nar.realtor" : s.domain}/` : null, new Date(`${REVIEWED}T12:00:00Z`)],
    );
    await db.query(
      `insert into research_sources (organization_id, program_id, url, title, review_level, reviewed_at, note)
       values ($1,$2,$3,'','page_reviewed',$4,'Official page reviewed for the starting directory. Establishes a publicly described programme only; does not verify current discounts, contacts, contracts or redistribution rights.')`,
      [orgId, p.rows[0].id, s.url, new Date(`${REVIEWED}T12:00:00Z`)],
    );
  }
  // Legacy alias: beneplace.com redirected to Working Advantage's employer page when checked.
  const wa = ids.get("Working Advantage");
  const bene = await db.query(`select 1 from research_organizations where lower(display_name) = 'beneplace'`);
  if (wa && !bene.rows.length) {
    const b = await db.query<{ id: string }>(
      `insert into research_organizations (display_name, primary_domain, country, prospect_types, research_focus, verification_status, last_checked_at, legacy_of, internal_notes)
       values ('Beneplace', 'beneplace.com', '{US}', '{operator}', 'Legacy alias pending verification', 'needs_review', $1, $2,
               'Not counted as an independently verified current operator. Retained as a legacy alias/source relationship.') returning id`,
      [new Date(`${REVIEWED}T12:00:00Z`), wa],
    );
    await db.query(
      `insert into research_sources (organization_id, url, review_level, reviewed_at, redirected_to, note)
       values ($1,'https://www.beneplace.com/','url_rechecked',$2,'https://www.workingadvantage.com/employer','Redirected to Working Advantage employer page when checked.')`,
      [b.rows[0].id, new Date(`${REVIEWED}T12:00:00Z`)],
    );
  }
  return created;
}
