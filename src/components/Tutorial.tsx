// Admin Research & Sales — Tutorial for salespeople. Step-by-step directions, real screenshots
// (public/tutorial/*.webp, captured from the demo copy) and plain-language definitions.
import { useEffect, useState, type ReactNode } from "react";
import { PageHeader } from "./AppShell";
import { IconExternal } from "./Icons";

const B = "/culturosity/admin";

function Shot({ src, alt, caption, narrow }: { src: string; alt: string; caption: ReactNode; narrow?: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <figure className={`tut-shot ${narrow ? "narrow" : ""}`}>
      <button type="button" className="tut-shot-btn" onClick={() => setOpen(true)} aria-label={`Enlarge screenshot: ${alt}`}>
        <img src={`/tutorial/${src}.webp`} alt={alt} loading="lazy" decoding="async" />
        <span className="tut-zoom" aria-hidden>
          Click to enlarge
        </span>
      </button>
      <figcaption>{caption}</figcaption>
      {open ? (
        <div className="tut-lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={() => setOpen(false)}>
          <img src={`/tutorial/${src}.webp`} alt={alt} />
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      ) : null}
    </figure>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="tut-steps">{children}</ol>;
}

function Terms({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="tut-terms">
      {items.map(([t, d]) => (
        <div key={t}>
          <dt>{t}</dt>
          <dd>{d}</dd>
        </div>
      ))}
    </dl>
  );
}

function Tip({ kind = "tip", children }: { kind?: "tip" | "important"; children: ReactNode }) {
  return (
    <div className={`tut-callout ${kind}`}>
      <strong>{kind === "tip" ? "Tip" : "Important"}</strong>
      <div>{children}</div>
    </div>
  );
}

function OpenLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a className="btn btn-ghost btn-sm" href={to} target="_blank" rel="noopener">
      {children} <IconExternal size={14} />
    </a>
  );
}

function Section({ id, n, title, intro, open, children }: { id: string; n: number; title: string; intro: ReactNode; open?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section id={id} className="tut-section panel" aria-labelledby={`${id}-h`}>
      <div className="tut-section-head">
        <div>
          <div className="eyebrow">Part {n}</div>
          <h2 id={`${id}-h`}>{title}</h2>
        </div>
        {open ? <OpenLink to={open.to}>{open.label}</OpenLink> : null}
      </div>
      <p className="tut-intro">{intro}</p>
      {children}
    </section>
  );
}

const TOC: [string, string][] = [
  ["start", "Quick start"],
  ["access", "Getting in"],
  ["overview", "Overview"],
  ["research", "Research Directory"],
  ["live", "Live Search"],
  ["outreach", "Sales Outreach"],
  ["pipeline", "Pipeline"],
  ["demo", "Demo Guide"],
  ["preview", "Preview"],
  ["services", "Service queue"],
  ["routine", "A typical week"],
  ["joining", "How clients and members join"],
  ["limits", "What only the owner can do"],
  ["help", "Troubleshooting"],
  ["glossary", "Glossary"],
];

export function TutorialPage() {
  return (
    <div className="container page">
      <PageHeader title="Tutorial" eyebrow="Admin Research & Sales" />
      <p className="tut-lead">
        Everything you need to work in Admin Research &amp; Sales, step by step. Read it once from top to bottom, then come back to any part when you need it.
        Click any screenshot to see it larger. Buttons marked <IconExternal size={13} /> open that area in a new tab, so this page stays open.
      </p>
      <div className="tut-layout">
        <nav className="tut-toc" aria-label="Tutorial contents">
          <div className="eyebrow">Contents</div>
          <ol>
            {TOC.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="tut-body">
          {/* ---------------- Quick start ---------------- */}
          <section id="start" className="tut-section panel tut-quick" aria-labelledby="start-h">
            <h2 id="start-h">Quick start — your first 10 minutes</h2>
            <Steps>
              <li>Open the private sign-up link Culturosity sent you, enter your name and choose a password (at least 12 characters).</li>
              <li>Get the <strong>access code</strong> from the Culturosity owner. You need it every time you open this area.</li>
              <li>
                Open <strong>Admin Research &amp; Sales</strong> from the account menu (the person icon, top right) and enter the code.
              </li>
              <li>Read the <strong>Overview</strong>, then open the <strong>Research Directory</strong> and look through a few organizations.</li>
              <li>Pick one good fit, add it to the <strong>Pipeline</strong>, and draft a first message in <strong>Sales Outreach</strong>.</li>
              <li>Before your first meeting, practise the <strong>Demo Guide</strong> and set up a branded <strong>Preview</strong> for that prospect.</li>
            </Steps>
            <Tip>Nothing in this area sends emails or messages for you. Drafts are for you to copy, check and send yourself.</Tip>
          </section>

          {/* ---------------- Getting in ---------------- */}
          <Section id="access" n={1} title="Getting in" intro="How to create your account, open the portal, and keep it secure.">
            <h3>Create your account</h3>
            <Steps>
              <li>Open the sign-up link you were sent. It works once and expires after 7 days.</li>
              <li>Your email is already filled in. Enter your name and create a password.</li>
              <li>Select <strong>Create my account</strong>. You're signed in and taken to the portal.</li>
            </Steps>
            <Shot src="01-signup" alt="The Join the Culturosity sales team page" caption="The sign-up page you see when you open your link." />
            <Tip>If your link has expired or was already used, ask the Culturosity owner for a new one.</Tip>

            <h3>Open Admin Research &amp; Sales</h3>
            <Steps>
              <li>
                Sign in at <strong>Sign In</strong> (top right of the website) with your email and password.
              </li>
              <li>Select the <strong>person icon</strong> at the top right to open your account menu.</li>
              <li>
                Choose <strong>Admin Research &amp; Sales</strong>.
              </li>
            </Steps>
            <Shot src="02-account-menu" alt="The account menu with Admin Research & Sales" caption="Your account menu. Admin Research & Sales is the way in." narrow />

            <h3>Enter the access code</h3>
            <Steps>
              <li>Type the numerical access code with your keyboard or the on-screen keypad.</li>
              <li>
                Select <strong>Unlock</strong>.
              </li>
            </Steps>
            <Shot src="03-gate" alt="The access code keypad" caption="The access code screen. Use Clear or ⌫ to fix a mistake." />
            <Tip kind="important">
              Never write the access code down where others can see it, and never share it. Too many wrong tries temporarily blocks further attempts.
            </Tip>

            <h3>Staying unlocked and locking</h3>
            <p>
              The top of the left-hand menu shows when the portal will lock. It locks itself after <strong>30 minutes without activity</strong>, or after{" "}
              <strong>4 hours</strong> at most. When it locks, enter the code again — nothing you saved is lost.
            </p>
            <Shot src="05-lockbar" alt="The lock status and Lock Portal button" caption="Select Lock Portal whenever you step away from your computer." narrow />
          </Section>

          {/* ---------------- Overview ---------------- */}
          <Section id="overview" n={2} title="Overview" intro="Your home screen: a quick picture of research and sales activity." open={{ to: `${B}/overview`, label: "Open Overview" }}>
            <Shot src="04-overview" alt="The Overview page" caption="The Overview: numbers at the top, shortcuts below, recent activity at the bottom." />
            <Terms
              items={[
                ["Research records", "How many organizations are in the Research Directory, and how many have a reviewed source."],
                ["Last research date", "The most recent date a record's source was checked."],
                ["Qualified / Contacted / Demo booked", "How many prospects are at each of these pipeline stages right now."],
                ["Open service requests", "Proposal requests in the Service queue that aren't Won or Closed yet."],
                ["Recent activity", "The latest changes, such as stage moves and logged calls, with dates."],
              ]}
            />
            <p>Select any shortcut card to jump to that area.</p>
          </Section>

          {/* ---------------- Research ---------------- */}
          <Section
            id="research"
            n={3}
            title="Research Directory"
            intro="A growing list of Canadian and American organizations with affinity, employee-discount or member-benefit programs — each backed by a reviewed source. It is never a complete list of every program."
            open={{ to: `${B}/research`, label: "Open Research Directory" }}
          >
            <Shot src="06-research" alt="The Research Directory with filters" caption="The Research Directory: totals, filters, the A–Z jump bar and the list." />
            <h3>Find organizations</h3>
            <Steps>
              <li>
                Type in <strong>Search</strong> to find an organization, program name or website.
              </li>
              <li>Narrow the list with the filters (see the definitions below). Filters combine, so set them back to “Any” to widen the list again.</li>
              <li>
                Use the <strong>A–Z</strong> letters to jump to names starting with that letter.
              </li>
              <li>
                Switch between <strong>Table</strong> and <strong>Cards</strong> views. Use <strong>Previous</strong> / <strong>Next</strong> at the bottom for more results.
              </li>
            </Steps>
            <Terms
              items={[
                ["Country", "Canada, USA, or both."],
                [
                  "Prospect type",
                  <>
                    <strong>Employer</strong> (an organization with a program for its people), <strong>Association / union</strong> (a membership organization),{" "}
                    <strong>Operator</strong> (a company that runs perk programs for others) or <strong>Merchant</strong> (a business that provides offers).
                  </>,
                ],
                ["Province / state, Sector / industry", "Where the organization is and what it does."],
                ["Operator", "The company that runs a program, e.g. “BenefitHub”. Useful to find all programs run by one provider."],
                ["Verification freshness", "“Checked in last 90 days” or “Older than 90 days / never”. Fresh records are safer to rely on."],
                ["Outreach status", "Where the organization sits in the Pipeline."],
                ["Perk category", "The kind of perks the program offers."],
              ]}
            />
            <h3>Open a record</h3>
            <p>Select an organization's name to open its record on the right.</p>
            <Shot src="07-record" alt="An open research record" caption="A research record: facts, sources, pipeline, notes, contacts and activity in one place." />
            <Terms
              items={[
                ["Verified facts", "What the reviewed sources actually say: focus, industry, region, audience, domain and the program itself. “Not publicly confirmed” means we couldn't verify it — don't assume it."],
                ["Sources & evidence", "The web pages the facts come from, the date each was reviewed and what it establishes. Select Recheck URL to confirm a page still works, or add a new reviewed source."],
                ["Pipeline", "Set the stage, owner (your email), next action, due date and notes, then Save pipeline."],
                ["Internal analysis", "Your private notes on why this could be a good fit. Select Save analysis."],
                ["Business contacts", "People you may contact. A Provenance (where you found them) is required, and you can mark a contact Do not contact."],
                ["Activity", "A log of notes, emails, calls, texts, meetings and demos. Tick “Move to Contacted” to advance the stage when you log real contact."],
              ]}
            />
            <h3>Add organizations</h3>
            <Steps>
              <li>
                <strong>Add record</strong> — fill in the organization, country, type and, ideally, a reviewed source URL with the date you checked it, then select <strong>Save record</strong>.
              </li>
              <li>
                <strong>Import CSV</strong> — download the <em>Template</em>, fill it in, paste or upload it, select <strong>Preview</strong> to check it, then <strong>Import</strong>. Duplicates are skipped.
              </li>
              <li>
                <strong>Export CSV</strong> — downloads the records that match your current filters.
              </li>
            </Steps>
            <Tip kind="important">Only record facts you found on a public, reliable source. Never invent discounts, contacts or partnerships.</Tip>
          </Section>

          {/* ---------------- Live Search ---------------- */}
          <section id="live" className="tut-section panel" aria-labelledby="live-h">
            <div className="tut-section-head">
              <div>
                <div className="eyebrow">Part 3b</div>
                <h2 id="live-h">Live Search</h2>
              </div>
              <OpenLink to={`${B}/live-search`}>Open Live Search</OpenLink>
            </div>
            <p className="tut-intro">
              Finds new affinity, employee-discount and member-benefit programs on the public web for you. Culturosity searches, reads the pages and returns{" "}
              <strong>suggestions with their sources</strong>. Nothing goes into the directory until you add it.
            </p>
            <Steps>
              <li>
                Describe what you're looking for in plain words, e.g. “Teachers' associations in Manitoba that offer member discount programs”.
              </li>
              <li>Optionally tick Canada / USA and add a province or state, a sector and a prospect type to focus the search.</li>
              <li>
                Choose <strong>Quick</strong> (under a minute, about 10–30¢) or <strong>Deep</strong> (1–3 minutes, about 50¢–$1.50), then select <strong>Search the web</strong>.
              </li>
              <li>
                Optional — tick only if you need them: <strong>Extra-deep search</strong> (about 25 searches and 20 pages, up to 20 suggestions; also checks each organization for a mobile app, whether its program is professionally managed, and how good a fit it is for Culturosity — ranked best fit first; 3–6 minutes, about $2–$5) and{" "}
                <strong>Research each suggestion in depth</strong> (a deep dive on up to 8 organizations found: program details, perk categories, eligibility, who runs it and the public contact page; about 50¢–$2 each). The estimated cost appears before you start.
              </li>
              <li>Results appear below when ready. You can leave the page — searches are saved under Recent searches.</li>
              <li>
                For each suggestion, open <strong>Sources</strong> and check the pages. Select <strong>Add to directory</strong> for good fits or <strong>Dismiss</strong> for the rest.
              </li>
            </Steps>
            <Terms
              items={[
                ["Suggestion", "An organization the search found. Every one is backed by pages actually retrieved during the search; anything it couldn't support is left out."],
                ["Sources", "The pages each suggestion is based on, with what each page shows. Always check them before relying on the facts."],
                ["Found by live search — needs review", "How added records and their sources are labelled until someone reviews the pages. They aren't used for outreach drafts until then."],
                ["Culturosity fit", "Extra-deep searches rate each organization Strong, Possible or Weak for Culturosity, suggest the best service (Self-Service, Launch with Culturosity, Fully Managed or Culturosity Perks) and give reasons. It's an assessment to guide you, not a fact — it goes into the record's Potential fit when you add it."],
                ["Mobile app / management", "Whether a program has its own mobile app and whether a perks vendor runs it or the organization manages it in-house. “Unknown” means no page confirmed it."],
                ["In-depth research", "The extra details shown under a suggestion when you ticked “Research each suggestion in depth”. Only facts the pages state; empty fields mean no page said so. Added to the record when you select Add to directory."],
                ["Monthly budget", "Live Search stops for everyone when this month's spending limit is reached. The owner sets the limit."],
              ]}
            />
            <Tip>Organizations already in the directory are skipped automatically, so each search only shows new ones.</Tip>
          </section>

          {/* ---------------- Outreach ---------------- */}
          <Section
            id="outreach"
            n={4}
            title="Sales Outreach"
            intro="Creates a first draft of an email, text, phone script or demo outline for a prospect, based on their verified research. Nothing is ever sent from Culturosity — you copy, check and send it yourself."
            open={{ to: `${B}/outreach`, label: "Open Sales Outreach" }}
          >
            <Shot src="08-outreach" alt="Sales Outreach with a generated draft" caption="Choose the options on the left; the draft appears on the right for you to edit." />
            <Steps>
              <li>
                Choose the <strong>Prospect</strong> (or select <strong>Generate outreach</strong> on a research record to arrive here with it already chosen).
              </li>
              <li>
                Choose the <strong>Objective</strong> and <strong>Channel</strong>, and optionally the <strong>Audience / persona</strong> (e.g. “HR benefits lead”) and <strong>Tone</strong>.
              </li>
              <li>
                Check your <strong>Sender name</strong>, and tick the <strong>Verified context</strong> sources the draft may draw on.
              </li>
              <li>
                Select <strong>Generate</strong>. Read the draft carefully, edit the subject and body, and replace placeholders like [First Name].
              </li>
              <li>
                Select <strong>Copy</strong> to paste it into your own email or phone, and <strong>Save Draft</strong> to keep it on the record. <strong>Regenerate</strong> makes a new version.
              </li>
            </Steps>
            <Terms
              items={[
                ["Objective", "Sell a company affinity program · Offer managed program support · Recruit a merchant offer · Explore a partnership · Book a demonstration."],
                ["Channel", "Email, SMS / text, Phone (a call script) or Demo outline."],
                ["Example template", "A ready-made draft built from the research. Shown when AI drafting isn't switched on — it's still a good starting point."],
                ["Warnings", "Yellow notes about the draft, e.g. missing facts. Fix these before you send anything."],
              ]}
            />
            <Tip kind="important">
              You are responsible for the final message and for having permission to contact the person on that channel. If an organization is marked Do Not Contact, drafting is switched off for it.
            </Tip>
          </Section>

          {/* ---------------- Pipeline ---------------- */}
          <Section
            id="pipeline"
            n={5}
            title="Pipeline"
            intro="A board that shows every prospect you're working on and how far along it is, from Researching to Won."
            open={{ to: `${B}/pipeline`, label: "Open Pipeline" }}
          >
            <Shot src="09-pipeline" alt="The Pipeline board" caption="Records not yet in the pipeline sit in the tray at the top; stages run left to right below." />
            <h3>Move prospects</h3>
            <Steps>
              <li>
                <strong>Add a prospect:</strong> drag a record from <em>Not in pipeline yet</em> into a stage, or use its <strong>Add to…</strong> menu. Use <strong>Filter records</strong> to find one quickly.
              </li>
              <li>
                <strong>Change stage:</strong> drag a card to another column, or use the stage menu at the bottom of the card. The board scrolls sideways when you drag near the edge.
              </li>
              <li>
                <strong>See details:</strong> each card shows the next action, due date and owner. Select the organization's name on a card to open its record and update them.
              </li>
            </Steps>
            <Terms
              items={[
                ["Researching", "Still learning about them."],
                ["Qualified", "A good fit worth contacting."],
                ["Contact Planned", "You've decided who to contact and how."],
                ["Contacted", "You've reached out (email, call, text…)."],
                ["Demo Booked", "A demonstration is scheduled."],
                ["Proposal", "They've asked for, or received, a proposal."],
                ["Won", "They've signed up."],
                ["Lost", "Not going ahead for now."],
                ["Do Not Contact", "They must not be contacted. You'll be asked to confirm, and outreach drafting is switched off for them."],
              ]}
            />
            <Tip>Generating an outreach draft never moves a prospect. Move them yourself once you've actually made contact.</Tip>
          </Section>

          {/* ---------------- Demo Guide ---------------- */}
          <Section id="demo" n={6} title="Demo Guide" intro="Your script for a live demonstration, using real pages of the Culturosity website." open={{ to: `${B}/demo-guide`, label: "Open Demo Guide" }}>
            <Shot src="10-demo-guide" alt="The Demo Guide" caption="Eight steps, each with an Open button that opens the page in a new tab." />
            <Steps>
              <li>Before the meeting, download the Culturosity app onto your phone (App Store or Google Play) and practise the steps once.</li>
              <li>
                In the meeting, keep the Demo Guide open and select <strong>Open</strong> on each step. The page opens in a new tab; switch back to the guide for the next step.
              </li>
              <li>Show the website first, then the app on your phone (step 4), then close with a proposal request together (step 8).</li>
            </Steps>
            <Tip kind="important">Look around freely, but don't submit forms during a demo unless you mean to — for example, submitting a perk sends a real perk to Culturosity for review.</Tip>
          </Section>

          {/* ---------------- Preview ---------------- */}
          <Section
            id="preview"
            n={7}
            title="Preview"
            intro="Shows a prospect what their own branded perks app could look like — with their logo and colours on a phone and tablet, updating live."
            open={{ to: `${B}/preview`, label: "Open Preview" }}
          >
            <Shot src="11-preview" alt="The Preview with a sample logo and colours" caption="Fill in the left side; the tablet and phone on the right update instantly." />
            <Steps>
              <li>
                <strong>Company:</strong> type their name and upload their logo (PNG, JPG, WebP or SVG — a transparent background looks best).
              </li>
              <li>
                <strong>Colours:</strong> select <strong>Match colours to logo</strong>, pick a preset, or set each colour yourself with the picker or a colour code like #0B3D91.
              </li>
              <li>
                <strong>About page:</strong> add a title bar line, a headline, a short description and, if you have them, links to their Privacy Policy and Terms of Use.
              </li>
              <li>
                Use <strong>About · Perks · Details</strong> to switch screens, or tap inside either device. <strong>Shuffle perks</strong> shows different sample perks.
              </li>
              <li>
                Select <strong>Presentation view</strong> to hide the controls and enlarge the devices for the meeting.
              </li>
            </Steps>
            <Terms
              items={[
                ["Colour 1 — header & navigation", "The top bar, the About title bar and the bottom menu."],
                ["Colour 2 — value badge", "“SAVE 15%”, “FREE” and the value pill."],
                ["Colour 3 — buttons & highlights", "DETAILS / USE PERK, the offer card, the member-card band and the About background."],
              ]}
            />
            <Tip>Your preview stays in your browser only — nothing is uploaded or published. It's remembered for next time; select Start a new preview to clear it.</Tip>
          </Section>

          {/* ---------------- Service queue ---------------- */}
          <Section
            id="services"
            n={8}
            title="Service queue"
            intro="Every Request a Proposal form submitted on the website lands here. Culturosity is also emailed, and the person who asked gets a confirmation."
            open={{ to: `${B}/services`, label: "Open Service queue" }}
          >
            <Shot src="12-service-queue" alt="The Service queue list" caption="Filter by status with the buttons at the top; select a row to open it." />
            <Steps>
              <li>Select a request to open it. You'll see the contact, member count, coverage, launch date and their message.</li>
              <li>
                Set the <strong>Status</strong>, put your email in <strong>Owner</strong> if you're handling it, write the <strong>Next step</strong> and any <strong>Notes</strong>.
              </li>
              <li>
                Select <strong>Save</strong>.
              </li>
            </Steps>
            <Shot src="13-service-request" alt="An open service request" caption="An open request with the fields you update as you follow up." />
            <Terms
              items={[
                ["new", "Just arrived — nobody has followed up yet."],
                ["contacted", "Someone has replied to them."],
                ["scoping", "Working out what they need."],
                ["proposal sent", "A proposal has gone to them."],
                ["won", "They've agreed to go ahead."],
                ["closed", "Finished or not going ahead."],
              ]}
            />
          </Section>

          {/* ---------------- Routine ---------------- */}
          <section id="routine" className="tut-section panel" aria-labelledby="routine-h">
            <div className="eyebrow">Part 9</div>
            <h2 id="routine-h">A typical week</h2>
            <Steps>
              <li>
                <strong>Monday:</strong> check the Overview and the Service queue for new requests; claim any you'll handle.
              </li>
              <li>
                <strong>Research:</strong> find and qualify a few organizations; add reviewed sources and a fit note.
              </li>
              <li>
                <strong>Outreach:</strong> draft, check and send messages yourself; log each one under Activity.
              </li>
              <li>
                <strong>Pipeline:</strong> move cards as things change and keep next actions and due dates current.
              </li>
              <li>
                <strong>Demos:</strong> prepare a branded Preview, run the Demo Guide, and close with a proposal request.
              </li>
            </Steps>
          </section>

          {/* ---------------- Limits ---------------- */}
          <section id="joining" className="tut-section panel" aria-labelledby="joining-h">
            <div className="eyebrow">Part 9b</div>
            <h2 id="joining-h">How clients and members join</h2>
            <p className="tut-intro">
              There is <strong>no public sign-up</strong>. Culturosity sets up each company's program, and only that company's people become members. Promo codes,
              Use Perk links and member-card QR codes are visible to members only.
            </p>
            <Steps>
              <li>
                <strong>The prospect asks for a program</strong> — usually by filling in <strong>Request a Proposal</strong> with you at the end of a demo. It lands in the
                Service queue.
              </li>
              <li>
                <strong>The Culturosity owner creates the company's workspace</strong> and makes the client's contact its Owner. Salespeople and companies can't create
                workspaces themselves.
              </li>
              <li>
                <strong>The company adds its people</strong> in Manage → Members &amp; roles: by emailed invitation, by approving its work-email domain (staff then join
                with their work email), or by importing a member list.
              </li>
              <li>
                <strong>Members create their account</strong> from their invitation link — or with their work email if the domain is approved — and then see the
                company's perks, including the Culturosity Perks the owner licenses to that company.
              </li>
            </Steps>
            <Tip>
              If a prospect asks “how do I sign up?”, the answer is: “Request a Proposal and we'll set up your program — then your people join through your
              invitation.” Don't send them to the Sign In page.
            </Tip>
          </section>

          <section id="limits" className="tut-section panel" aria-labelledby="limits-h">
            <div className="eyebrow">Part 10</div>
            <h2 id="limits-h">What only the owner can do</h2>
            <p>Your account is for research and sales. These are handled by the Culturosity owner — ask them if you need any of them:</p>
            <ul className="tut-list">
              <li>Changing the access code or any site settings</li>
              <li>Adding or removing salespeople</li>
              <li>Managing the Culturosity Perks catalogue or any company workspace</li>
              <li>Creating (setting up), pausing or deleting company workspaces</li>
              <li>Making someone an Owner of a company workspace</li>
            </ul>
          </section>

          {/* ---------------- Troubleshooting ---------------- */}
          <section id="help" className="tut-section panel" aria-labelledby="help-h">
            <div className="eyebrow">Part 11</div>
            <h2 id="help-h">Troubleshooting</h2>
            <Terms
              items={[
                ["It's asking for the access code again", "The portal locked after 30 minutes without activity or 4 hours in total. Enter the code again."],
                ["“Too many attempts”", "Wait a while before trying the code again, and check you have the current code from the owner."],
                ["I can't find an organization", "Clear the search box and set the filters back to “Any”. It may not be in the directory yet — add it."],
                ["Generate is greyed out", "Choose a prospect first. If it's still greyed out, the organization is marked Do Not Contact."],
                ["My sign-up link doesn't work", "Links work once and expire after 7 days. Ask the owner for a new one."],
                ["A prospect says they can't create an account", "That's expected — accounts are by invitation only. Send them Request a Proposal; once their program is set up, their people join through the company's invitation or work email."],
                ["“Accounts are by invitation only” when someone signs up", "They must use the exact email their invitation was sent to (or an approved work email). Ask the company admin to resend the invitation if needed."],
                ["I forgot my password", "Use “Forgot password?” on the Sign In page. If no email arrives, ask the owner."],
                ["I don't see Admin Research & Sales in my menu", "Make sure you're signed in with the email your sign-up link was sent to."],
              ]}
            />
          </section>

          {/* ---------------- Glossary ---------------- */}
          <section id="glossary" className="tut-section panel" aria-labelledby="glossary-h">
            <div className="eyebrow">Part 12</div>
            <h2 id="glossary-h">Glossary</h2>
            <Terms
              items={[
                ["Affinity program", "A perks program an organization offers its employees or members, such as discounts on culture, dining and wellness."],
                ["Culturosity Perks", "Culturosity's own curated catalogue of perks, on the website and in the app."],
                ["Prospect", "An organization you might sell to or partner with."],
                ["Operator / aggregator", "A company that runs perk programs for many organizations."],
                ["Reviewed source", "A public web page someone checked on a given date that supports the facts in a record."],
                ["Provenance", "Where a contact's details came from (e.g. a public staff page). Always required."],
                ["Do Not Contact", "A person or organization that must not be contacted. Respect it every time."],
                ["Stage", "A prospect's step in the Pipeline, from Researching to Won."],
                ["Draft", "A message created in Sales Outreach. Only a starting point — you check and send it yourself."],
                ["Service request", "A Request a Proposal form submitted on the website."],
                ["Invitation-only", "Nobody can create an account on their own. Accounts come from a company invitation, an approved work-email domain, a salesperson sign-up link, or the owner."],
                ["Company workspace", "A company's private perks program on Culturosity — its own members, perks and admin area. Set up by the Culturosity owner."],
                ["Access code", "The numerical code that unlocks Admin Research & Sales for a session."],
                ["Owner / super admin", "The Culturosity account holder who manages settings, the catalogue and the sales team."],
              ]}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
