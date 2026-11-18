// Browser journey test against a running demo instance (npm run dev in another terminal).
// Requires Playwright with a Chromium build: `npm i -D playwright && npx playwright install chromium`
// Usage: BASE_URL=http://localhost:5173 npm run test:e2e
let chromium, devices;
try {
  ({ chromium, devices } = await import("playwright"));
} catch {
  try {
    const { createRequire } = await import("node:module");
    ({ chromium, devices } = createRequire(import.meta.url)("playwright")); // honours NODE_PATH / global installs
  } catch {}
}
if (!chromium) {
  console.error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const BASE = process.env.BASE_URL || "http://localhost:5173";
const PASSWORD = process.env.SEED_DEMO_PASSWORD || "culturosity-demo-2026";
const GATE = process.env.GATE_E2E_CODE; // set to the configured access code to test the gate
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name, e.message.split("\n")[0]]);
  }
};

const browser = await chromium.launch();
async function signIn(ctx, email) {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/auth/signin`);
  await p.getByLabel("Email").fill(email);
  await p.getByLabel("Password").fill(PASSWORD);
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL("**/perks");
  return p;
}

const title = `E2E perk ${Date.now()}`;
const adminCtx = await browser.newContext();
const memberCtx = await browser.newContext({ ...devices["iPhone 13"] });

await step("company admin publishes through the dedicated Submit a Perk page", async () => {
  const p = await signIn(adminCtx, "admin@northwind.example");
  await p.goto(`${BASE}/app/northwind-demo/submit-perk`);
  await p.getByLabel("Provider / company display name").fill("E2E Provider (Demo)");
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByLabel("Perk title").fill(title);
  await p.getByLabel("Short listing description").fill("Automated browser test offer.");
  await p.getByLabel("Full description").fill("This offer was created by the end-to-end browser test.");
  await p.getByLabel(/^Category/).selectOption("Wellness");
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("spinbutton", { name: /^Percentage/ }).fill("12");
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByLabel("This offer is ongoing (no end date)").check();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByLabel("Exact redemption web address").fill("https://example.com/e2e");
  await p.getByLabel("Redemption instructions").fill("Select Use Perk and complete checkout.");
  await p.getByLabel("This is an online-only offer (no physical location)").check();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByLabel("Who is eligible").fill("All Northwind employees");
  await p.getByLabel("I am authorised to publish this offer and its images on behalf of the provider.").check();
  await p.getByRole("button", { name: "Continue" }).click();
  await p.getByRole("button", { name: "Publish perk" }).click();
  await p.getByRole("heading", { name: /Published/ }).waitFor();
});

await step("the new perk appears for a member on another device", async () => {
  const p = await signIn(memberCtx, "member@northwind.example");
  await p.goto(`${BASE}/app/northwind-demo`);
  await p.getByText(title).first().waitFor({ timeout: 10000 });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) throw new Error("horizontal overflow on mobile");
});

await step("Harbour member cannot open Northwind's program", async () => {
  const ctx = await browser.newContext();
  const p = await signIn(ctx, "member@harbour.example");
  const r = await p.request.get(`${BASE}/api/orgs/northwind-demo/perks`);
  if (r.status() !== 404) throw new Error(`expected 404, got ${r.status()}`);
});

if (GATE) {
  await step("super admin unlocks research with the numerical keypad", async () => {
    const ctx = await browser.newContext();
    const p = await signIn(ctx, "super@demo.culturosity.test");
    await p.goto(`${BASE}/culturosity/admin`);
    for (const d of GATE) await p.getByRole("button", { name: `Digit ${d}`, exact: true }).click();
    await p.getByRole("button", { name: "Unlock" }).click();
    await p.waitForURL("**/overview");
    await p.goto(`${BASE}/culturosity/admin/research`);
    await p.getByRole("button", { name: "Abenity", exact: true }).waitFor();
  });
}

await browser.close();
for (const r of results) console.log(r.join("  "));
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
