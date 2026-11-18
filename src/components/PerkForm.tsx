import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, newIdempotencyKey, prefs, ApiError } from "../lib/api";
import { useMe } from "../lib/session";
import { perkInputSchema } from "@shared/schemas";
import { COMMON_TIMEZONES, formatWindow, windowFromInput } from "@shared/time";
import { PERK_CATEGORIES, VALUE_TYPE_LABELS, VALUE_TYPES, defaultValueLabel } from "@shared/perk";
import { Checkbox, ErrorAlert, PerkImage, SelectField, TextArea, TextField, useToast, DemoBadge } from "./ui";
import { IconCalendar, IconPin, IconPlus, IconTicket, IconUpload, IconCheck, IconGlobe } from "./Icons";

const STEPS = ["Destination & provider", "Perk", "Offer value", "Dates & events", "Redemption & location", "Eligibility & media", "Review"] as const;
const STEP_PREFIX: [string, number][] = [
  ["destination", 0],
  ["provider", 0],
  ["title", 1],
  ["shortDescription", 1],
  ["fullDescription", 1],
  ["category", 1],
  ["tags", 1],
  ["value", 2],
  ["availability", 3],
  ["occurrences", 3],
  ["redemption", 4],
  ["location", 4],
  ["eligibility", 5],
  ["media", 5],
  ["submitter", 5],
];
const stepOf = (key: string) => STEP_PREFIX.find(([p]) => key === p || key.startsWith(p + "."))?.[1] ?? 6;

type Form = ReturnType<typeof emptyForm>;
function emptyForm() {
  return {
    provider: { existingId: "", name: "", description: "", category: "", website: "", publicEmail: "", publicPhone: "", logoAssetId: "" },
    title: "",
    shortDescription: "",
    fullDescription: "",
    category: "",
    tags: [] as string[],
    value: { type: "percent", label: "", percent: "" as any, amount: "" as any, currency: "CAD", conditions: "" },
    availability: { ongoing: false, startDate: "", startTime: "", endDate: "", endTime: "", timezone: "America/Toronto", bookingDeadline: "", blackoutDates: [] as string[] },
    occurrences: [] as { date: string; startTime: string; endTime: string; venue: string; notes: string }[],
    media: { imageAssetId: "", imageAlt: "", additional: [] as { assetId: string; alt: string }[] },
    redemption: { method: "online", url: "", instructions: "", promoCode: "", usageLimitPerMember: "" as any, posReference: "" },
    location: { onlineOnly: false, addressLine: "", city: "", region: "", postalCode: "", country: "Canada", lat: "" as any, lng: "" as any },
    eligibility: { groups: "", householdAllowed: false, exclusions: "", terms: "" },
    allowDistribution: false,
  };
}

/** Strip empty strings so optional fields validate as absent. */
function clean(form: Form) {
  const strip = (o: any): any => {
    if (Array.isArray(o)) return o.map(strip);
    if (o && typeof o === "object") {
      const out: any = {};
      for (const [k, v] of Object.entries(o)) {
        if (v === "" || v === null || v === undefined) continue;
        out[k] = strip(v);
      }
      return out;
    }
    return o;
  };
  const f = strip(form);
  f.tags = form.tags;
  f.occurrences = (form.occurrences ?? []).map(strip);
  f.media = { imageAlt: form.media.imageAlt, additional: form.media.additional, ...(form.media.imageAssetId ? { imageAssetId: form.media.imageAssetId } : {}) };
  f.availability.blackoutDates = form.availability.blackoutDates;
  f.eligibility = { ...form.eligibility };
  return f;
}

interface Destination {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgKind: string;
  isDemo: boolean;
  programs: { id: string; name: string; moderation_required: boolean }[];
  mode: "publish" | "publish_assigned" | "review";
  providers: { id: string; name: string }[];
}

export function PerkForm({
  presetOrgSlug,
  edit,
}: {
  presetOrgSlug?: string;
  edit?: { orgSlug: string; perkId: string; form: Form; status: string };
}) {
  const { data: me } = useMe();
  const signedIn = Boolean(me?.user);
  const qc = useQueryClient();
  const toast = useToast();
  const draftKey = `perkDraft:${presetOrgSlug ?? "public"}`;
  const [form, setForm] = useState<Form>(() => edit?.form ?? prefs.get<Form | null>(draftKey, null) ?? emptyForm());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [destOrg, setDestOrg] = useState("");
  const [destProgram, setDestProgram] = useState("");
  const [submitter, setSubmitter] = useState({ name: "", email: "", organization: "", authorityConfirmed: false });
  const [idemKey, setIdemKey] = useState(() => newIdempotencyKey());
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const { data: destData } = useQuery<{ destinations: Destination[] }>({ queryKey: ["destinations", me?.user?.id], queryFn: () => api.get("/submit/destinations"), enabled: !edit });
  const destinations = destData?.destinations ?? [];
  const dest = destinations.find((d) => d.orgId === destOrg);

  useEffect(() => {
    if (edit || !destinations.length || destOrg) return;
    const pick = destinations.find((d) => d.orgSlug === presetOrgSlug) ?? destinations[0];
    setDestOrg(pick.orgId);
    setDestProgram(pick.programs[0]?.id ?? "");
  }, [destinations, presetOrgSlug, destOrg, edit]);
  useEffect(() => {
    if (me?.user) setSubmitter((s) => ({ ...s, name: s.name || me.user!.display_name, email: s.email || me.user!.email }));
  }, [me?.user]);
  const firstRender = useRef(true);
  useEffect(() => {
    // Move focus to the step heading when the step changes (not on first load).
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const set = (path: string, value: unknown) =>
    setForm((f) => {
      const next: any = structuredClone(f);
      const parts = path.split(".");
      let o = next;
      for (const p of parts.slice(0, -1)) o = o[p];
      o[parts[parts.length - 1]] = value;
      return next;
    });
  const err = (path: string) => errors[path];

  function validate(): Record<string, string> {
    const r = perkInputSchema.safeParse(clean(form));
    const out: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) out[i.path.join(".")] ??= i.message;
    if (!edit) {
      if (!dest) out["destination"] = "Choose where to publish";
      if (dest?.mode === "publish_assigned" && !form.provider.existingId) out["provider.existingId"] = "Choose one of your assigned providers";
      if (submitter.name.trim().length < 2) out["submitter.name"] = "Enter your name";
      if (!/^\S+@\S+\.\S+$/.test(submitter.email)) out["submitter.email"] = "Enter a valid email";
      if (!submitter.authorityConfirmed) out["submitter.authorityConfirmed"] = "Confirm you are authorised to publish this offer and media";
    }
    return out;
  }

  const stepErrors = useMemo(() => {
    const m = new Map<number, number>();
    for (const k of Object.keys(errors)) m.set(stepOf(k), (m.get(stepOf(k)) ?? 0) + 1);
    return m;
  }, [errors]);

  function next() {
    const all = validate();
    const here = Object.fromEntries(Object.entries(all).filter(([k]) => stepOf(k) === step));
    setErrors((e) => ({ ...Object.fromEntries(Object.entries(e).filter(([k]) => stepOf(k) !== step)), ...here }));
    if (Object.keys(here).length) {
      toast("Please fix the highlighted fields.", "error");
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  async function saveDraft() {
    prefs.set(draftKey, form);
    if (signedIn && dest && !edit) {
      try {
        const r = await api.put("/submissions/drafts", { idempotencyKey: idemKey, destination: { orgId: dest.orgId, programId: destProgram }, draft: form });
        setDraftSavedAt(r.savedAt);
        toast("Draft saved to your account");
        return;
      } catch (e: any) {
        toast(e.message, "error");
      }
    }
    setDraftSavedAt(new Date().toISOString());
    toast("Draft saved on this device");
  }

  async function upload(file: File, alt: string, target: "image" | "additional" | "logo") {
    if (!dest && !edit) return toast("Choose a destination first.", "error");
    const orgId = edit ? me?.memberships?.find((m) => m.org_slug === edit.orgSlug)?.org_id ?? "" : dest!.orgId;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("orgId", orgId);
    fd.append("alt", alt);
    try {
      const r = await api.post<{ asset: { id: string } }>("/uploads", fd);
      if (target === "image") set("media.imageAssetId", r.asset.id);
      if (target === "logo") set("provider.logoAssetId", r.asset.id);
      if (target === "additional") set("media.additional", [...form.media.additional, { assetId: r.asset.id, alt: alt || file.name }]);
      setErrors((e) => {
        const n = { ...e };
        delete n["media.imageAssetId"];
        return n;
      });
      toast("Image uploaded");
    } catch (e: any) {
      setErrors((x) => ({ ...x, "media.imageAssetId": e.message }));
      toast(e.message, "error");
    }
  }

  async function submit() {
    const all = validate();
    setErrors(all);
    if (Object.keys(all).length) {
      const first = Math.min(...Object.keys(all).map(stepOf));
      setStep(first);
      toast("Some fields need attention.", "error");
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      let r: any;
      if (edit) {
        r = await api.put(`/orgs/${edit.orgSlug}/perks/${edit.perkId}`, clean(form));
        r = { ...r, orgSlug: edit.orgSlug, edited: true };
      } else {
        r = await api.post("/submissions", {
          idempotencyKey: idemKey,
          destination: { orgId: dest!.orgId, programId: destProgram },
          perk: clean(form),
          submitter,
        });
      }
      // Success only after the server confirms a durable save.
      prefs.remove(draftKey);
      setResult(r);
      qc.invalidateQueries({ queryKey: ["catalogue"] });
      qc.invalidateQueries({ queryKey: ["manage-perks"] });
    } catch (e) {
      const ae = e as ApiError;
      setServerError(ae);
      if (ae.fields) {
        const mapped: Record<string, string> = {};
        for (const [k, v] of Object.entries(ae.fields)) mapped[k.replace(/^perk\./, "")] = v;
        setErrors(mapped);
        const first = Math.min(...Object.keys(mapped).map(stepOf));
        if (Number.isFinite(first)) setStep(first);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <SubmitResult result={result} dest={dest} onAnother={() => { setResult(null); setForm(emptyForm()); setStep(0); setIdemKey(newIdempotencyKey()); }} />;

  const valuePreview = defaultValueLabel({
    type: form.value.type as any,
    percent: Number(form.value.percent) || null,
    amountMinor: form.value.amount ? Math.round(Number(form.value.amount) * 100) : null,
    currency: form.value.currency,
    label: form.value.label,
  });

  return (
    <div>
      <div className="progress" aria-hidden>
        <div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <nav className="stepper" aria-label="Form steps">
        {STEPS.map((s, i) => (
          <button
            key={s}
            type="button"
            aria-current={i === step ? "step" : undefined}
            className={`${stepErrors.get(i) ? "has-error" : ""} ${i < step ? "done" : ""}`}
            onClick={() => setStep(i)}
          >
            <span className="n">{i < step && !stepErrors.get(i) ? <IconCheck size={12} /> : i + 1}</span>
            {s}
            {stepErrors.get(i) ? <span className="sr-only">({stepErrors.get(i)} errors)</span> : null}
          </button>
        ))}
      </nav>

      <form
        className="panel"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          step === STEPS.length - 1 ? submit() : next();
        }}
      >
        <h2 ref={headingRef} tabIndex={-1} style={{ fontSize: "1.35rem" }}>
          {STEPS[step]}
        </h2>
        {Object.keys(errors).length && step !== STEPS.length - 1 ? (
          <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>
            Some fields need attention. Steps with problems are outlined in red.
          </div>
        ) : null}

        {step === 0 ? (
          <>
            {edit ? (
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                Editing updates this offer everywhere it appears. Current status: <strong>{edit.status.replace("_", " ")}</strong>.
              </div>
            ) : (
              <>
                <SelectField
                  label="Publish to"
                  required
                  value={destOrg}
                  error={err("destination")}
                  onChange={(e) => {
                    setDestOrg(e.target.value);
                    const d = destinations.find((x) => x.orgId === e.target.value);
                    setDestProgram(d?.programs[0]?.id ?? "");
                    set("provider.existingId", "");
                  }}
                  hint="Only programs you are permitted to contribute to are listed."
                >
                  {destinations.map((d) => (
                    <option key={d.orgId} value={d.orgId}>
                      {d.orgName}
                      {d.isDemo ? " (Demo)" : ""}
                    </option>
                  ))}
                </SelectField>
                {dest && dest.programs.length > 1 ? (
                  <SelectField label="Program" value={destProgram} onChange={(e) => setDestProgram(e.target.value)}>
                    {dest.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SelectField>
                ) : null}
                {dest ? (
                  <div className={`alert ${dest.mode === "review" ? "alert-warning" : "alert-success"}`} style={{ marginBottom: 16 }}>
                    {dest.mode === "review"
                      ? "Your submission will go to the program's review queue. It is published automatically through the same pipeline once approved."
                      : dest.mode === "publish_assigned" && dest.programs.find((p) => p.id === destProgram)?.moderation_required
                        ? "This program requires review for provider submissions. It will publish once approved."
                        : "You can publish directly. A valid, currently available offer appears in the member catalogue as soon as you submit."}
                  </div>
                ) : null}
                {!signedIn ? (
                  <p className="muted">
                    Submitting without an account sends your offer to Culturosity for review. <Link to="/auth/signin?next=/submit-perk">Sign in</Link> to upload images or publish to your company program.
                  </p>
                ) : null}
              </>
            )}
            {dest?.providers.length || edit ? (
              <SelectField
                label="Provider"
                value={form.provider.existingId}
                error={err("provider.existingId")}
                onChange={(e) => {
                  const p = dest?.providers.find((x) => x.id === e.target.value);
                  set("provider.existingId", e.target.value);
                  if (p) set("provider.name", p.name);
                }}
                hint={dest?.mode === "publish_assigned" ? "You can publish for your assigned providers only." : "Choose an existing provider or add a new one below."}
              >
                {dest?.mode !== "publish_assigned" ? <option value="">+ New provider</option> : <option value="">Choose…</option>}
                {(dest?.providers ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                {edit && form.provider.existingId ? <option value={form.provider.existingId}>{form.provider.name}</option> : null}
              </SelectField>
            ) : null}
            <div className="grid-2">
              <TextField label="Provider / company display name" required value={form.provider.name} error={err("provider.name")} onChange={(e) => set("provider.name", e.target.value)} disabled={Boolean(form.provider.existingId) && dest?.mode === "publish_assigned"} />
              <SelectField label="Provider category" value={form.provider.category} onChange={(e) => set("provider.category", e.target.value)}>
                <option value="">Choose…</option>
                {PERK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </SelectField>
            </div>
            <TextArea label="About the provider" value={form.provider.description} onChange={(e) => set("provider.description", e.target.value)} rows={3} />
            <div className="grid-2">
              <TextField label="Public website" type="url" inputMode="url" placeholder="https://" value={form.provider.website} error={err("provider.website")} onChange={(e) => set("provider.website", e.target.value)} />
              <TextField label="Public contact email" type="email" value={form.provider.publicEmail} error={err("provider.publicEmail")} onChange={(e) => set("provider.publicEmail", e.target.value)} />
            </div>
            <TextField label="Public phone (optional)" type="tel" value={form.provider.publicPhone} error={err("provider.publicPhone")} onChange={(e) => set("provider.publicPhone", e.target.value)} />
            {signedIn ? <UploadField label="Provider logo (optional)" assetId={form.provider.logoAssetId} onFile={(f) => upload(f, `${form.provider.name} logo`, "logo")} /> : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <TextField label="Perk title" required maxLength={140} value={form.title} error={err("title")} onChange={(e) => set("title", e.target.value)} hint="Shown in the listing, e.g. “20% off weekend passes”." />
            <TextField label="Short listing description" required maxLength={240} value={form.shortDescription} error={err("shortDescription")} onChange={(e) => set("shortDescription", e.target.value)} hint={`${form.shortDescription.length}/240`} />
            <TextArea label="Full description" required rows={6} value={form.fullDescription} error={err("fullDescription")} onChange={(e) => set("fullDescription", e.target.value)} />
            <div className="grid-2">
              <SelectField label="Category" required value={form.category} error={err("category")} onChange={(e) => set("category", e.target.value)}>
                <option value="">Choose…</option>
                {PERK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </SelectField>
              <TextField label="Tags (comma separated)" value={form.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12))} />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
              <legend style={{ fontWeight: 600, marginBottom: 8 }}>Offer type</legend>
              <div className="row">
                {VALUE_TYPES.map((v) => (
                  <label key={v} className="chip" style={{ color: "var(--ink)", borderColor: form.value.type === v ? "#000" : "var(--line-light)", background: form.value.type === v ? "var(--brand-lime)" : "#fff" }}>
                    <input type="radio" name="vtype" className="sr-only" checked={form.value.type === v} onChange={() => set("value.type", v)} />
                    {VALUE_TYPE_LABELS[v]}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid-2">
              {form.value.type === "percent" ? (
                <TextField label="Percentage" required type="number" inputMode="decimal" min={1} max={100} step="0.5" value={form.value.percent} error={err("value.percent")} onChange={(e) => set("value.percent", e.target.value)} />
              ) : null}
              {form.value.type === "amount" ? (
                <>
                  <TextField label="Amount" required type="number" inputMode="decimal" min={0.01} step="0.01" value={form.value.amount} error={err("value.amount")} onChange={(e) => set("value.amount", e.target.value)} />
                  <SelectField label="Currency" required value={form.value.currency} error={err("value.currency")} onChange={(e) => set("value.currency", e.target.value)}>
                    <option value="CAD">CAD — Canadian dollar</option>
                    <option value="USD">USD — US dollar</option>
                  </SelectField>
                </>
              ) : null}
              <TextField
                label={form.value.type === "special" ? "Describe the special offer" : "Display label (optional)"}
                required={form.value.type === "special"}
                maxLength={60}
                value={form.value.label}
                error={err("value.label")}
                onChange={(e) => set("value.label", e.target.value)}
                hint={form.value.type === "special" ? "e.g. “VIP tour included”" : "Leave blank to use the automatic label."}
              />
            </div>
            <TextArea label="Qualifying conditions" rows={3} value={form.value.conditions} onChange={(e) => set("value.conditions", e.target.value)} hint="e.g. minimum spend, one per member, new customers only." />
            <p>
              Listing label preview: <span className="badge badge-value">{valuePreview}</span>
            </p>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Checkbox label="This offer is ongoing (no end date)" checked={form.availability.ongoing} onChange={(v) => { set("availability.ongoing", v); if (v) { set("availability.endDate", ""); set("availability.endTime", ""); } }} />
            <div className="grid-2">
              <TextField label="Claim window starts" type="date" value={form.availability.startDate} error={err("availability.startDate")} onChange={(e) => set("availability.startDate", e.target.value)} hint="Leave blank to start immediately. Future dates are scheduled." />
              <TextField label="Start time (optional)" type="time" value={form.availability.startTime} error={err("availability.startTime")} onChange={(e) => set("availability.startTime", e.target.value)} />
              {!form.availability.ongoing ? (
                <>
                  <TextField label="Last day to claim" required type="date" value={form.availability.endDate} error={err("availability.endDate")} onChange={(e) => set("availability.endDate", e.target.value)} hint="Inclusive: the offer is claimable through the end of this day." />
                  <TextField label="End time (optional)" type="time" value={form.availability.endTime} error={err("availability.endTime")} onChange={(e) => set("availability.endTime", e.target.value)} />
                </>
              ) : null}
              <SelectField label="Timezone" required value={form.availability.timezone} error={err("availability.timezone")} onChange={(e) => set("availability.timezone", e.target.value)}>
                {COMMON_TIMEZONES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </SelectField>
              <TextField label="Booking deadline (optional)" type="date" value={form.availability.bookingDeadline} onChange={(e) => set("availability.bookingDeadline", e.target.value)} />
            </div>
            <TextField
              label="Blackout dates (optional)"
              value={form.availability.blackoutDates.join(", ")}
              onChange={(e) => set("availability.blackoutDates", e.target.value.split(",").map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)))}
              hint="Comma-separated dates in YYYY-MM-DD format."
            />
            <h3 style={{ marginTop: 10 }}>Event occurrences (optional)</h3>
            <p className="muted" style={{ fontSize: ".9rem" }}>Event dates are separate from the claim window. Add each performance, class or session.</p>
            {form.occurrences.map((o, i) => (
              <div key={i} className="grid-2" style={{ background: "#fafafc", padding: 12, borderRadius: 12, marginBottom: 10 }}>
                <TextField label={`Event ${i + 1} date`} type="date" value={o.date} error={err(`occurrences.${i}.date`)} onChange={(e) => set(`occurrences.${i}.date`, e.target.value)} />
                <div className="grid-2">
                  <TextField label="Starts" type="time" value={o.startTime} error={err(`occurrences.${i}.startTime`)} onChange={(e) => set(`occurrences.${i}.startTime`, e.target.value)} />
                  <TextField label="Ends" type="time" value={o.endTime} error={err(`occurrences.${i}.endTime`)} onChange={(e) => set(`occurrences.${i}.endTime`, e.target.value)} />
                </div>
                <TextField label="Venue" value={o.venue} onChange={(e) => set(`occurrences.${i}.venue`, e.target.value)} />
                <div className="row" style={{ alignItems: "flex-end" }}>
                  <TextField label="Notes" value={o.notes} onChange={(e) => set(`occurrences.${i}.notes`, e.target.value)} />
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }} onClick={() => set("occurrences", form.occurrences.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={() => set("occurrences", [...form.occurrences, { date: "", startTime: "19:00", endTime: "", venue: "", notes: "" }])}>
              <IconPlus size={18} /> Add event date
            </button>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <SelectField label="How members redeem" required value={form.redemption.method} error={err("redemption.method")} onChange={(e) => set("redemption.method", e.target.value)}>
              <option value="online">Online — provider website</option>
              <option value="in_person">In person — show member card / QR</option>
              <option value="hybrid">Hybrid — online or in person</option>
            </SelectField>
            {form.redemption.method !== "in_person" ? (
              <TextField label="Exact redemption web address" required type="url" inputMode="url" placeholder="https://" value={form.redemption.url} error={err("redemption.url")} onChange={(e) => set("redemption.url", e.target.value)} hint="Use Perk sends members here — use the specific offer page, not just the homepage." />
            ) : null}
            <TextArea label="Redemption instructions" required rows={4} value={form.redemption.instructions} error={err("redemption.instructions")} onChange={(e) => set("redemption.instructions", e.target.value)} hint="Exactly what the member does, step by step." />
            <div className="grid-2">
              <TextField label="Promo code (optional)" value={form.redemption.promoCode} onChange={(e) => set("redemption.promoCode", e.target.value)} hint="Only shown to eligible, signed-in members." />
              <TextField label="Uses per member (optional)" type="number" min={1} value={form.redemption.usageLimitPerMember} error={err("redemption.usageLimitPerMember")} onChange={(e) => set("redemption.usageLimitPerMember", e.target.value)} hint="Enforced when providers verify codes." />
            </div>
            <TextField label="Perk QR code for POS (optional)" value={form.redemption.posReference} onChange={(e) => set("redemption.posReference", e.target.value)} hint="The value the perk's QR code on the member card should contain — a link or code the provider's point-of-sale system recognises. Leave empty to show only the one-time verification code." />
            <hr className="divider" />
            <Checkbox label="This is an online-only offer (no physical location)" checked={form.location.onlineOnly} onChange={(v) => set("location.onlineOnly", v)} />
            {err("location.onlineOnly") ? <div className="error" style={{ color: "var(--danger)", fontWeight: 600 }}>{err("location.onlineOnly")}</div> : null}
            {!form.location.onlineOnly ? (
              <>
                <TextField label="Street address" required={form.redemption.method !== "online"} value={form.location.addressLine} error={err("location.addressLine")} onChange={(e) => set("location.addressLine", e.target.value)} />
                <div className="grid-2">
                  <TextField label="City" required value={form.location.city} error={err("location.city")} onChange={(e) => set("location.city", e.target.value)} />
                  <TextField label="Province / state" value={form.location.region} onChange={(e) => set("location.region", e.target.value)} />
                  <TextField label="Postal / ZIP code" value={form.location.postalCode} onChange={(e) => set("location.postalCode", e.target.value)} />
                  <SelectField label="Country" required value={form.location.country} error={err("location.country")} onChange={(e) => set("location.country", e.target.value)}>
                    <option value="">Choose…</option>
                    <option>Canada</option>
                    <option>United States</option>
                  </SelectField>
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {step === 5 ? (
          <>
            <TextArea label="Who is eligible" required rows={2} value={form.eligibility.groups} error={err("eligibility.groups")} onChange={(e) => set("eligibility.groups", e.target.value)} hint="e.g. “All Northwind employees and contractors”." />
            <Checkbox label="Household members may use this offer" checked={form.eligibility.householdAllowed} onChange={(v) => set("eligibility.householdAllowed", v)} />
            <TextArea label="Exclusions" rows={2} value={form.eligibility.exclusions} onChange={(e) => set("eligibility.exclusions", e.target.value)} />
            <TextArea label="Terms" rows={3} value={form.eligibility.terms} onChange={(e) => set("eligibility.terms", e.target.value)} />
            {dest?.orgKind === "culturosity" || edit ? (
              <Checkbox label="Provider permits distribution to licensed company programs" checked={form.allowDistribution} onChange={(v) => set("allowDistribution", v)} />
            ) : null}
            <hr className="divider" />
            <h3>Images</h3>
            {signedIn ? (
              <>
                <UploadField label="Main image" assetId={form.media.imageAssetId} error={err("media.imageAssetId")} onFile={(f) => upload(f, form.media.imageAlt, "image")} hint="JPEG, PNG or WebP up to 5 MB. Without an image the Culturosity branded artwork is shown." />
                <TextField label="Image description (alt text)" required={Boolean(form.media.imageAssetId)} value={form.media.imageAlt} error={err("media.imageAlt")} onChange={(e) => set("media.imageAlt", e.target.value)} />
                <UploadField label="Additional image (optional)" onFile={(f) => upload(f, `${form.title} additional image`, "additional")} />
                {form.media.additional.length ? <p className="muted">{form.media.additional.length} additional image(s) attached.</p> : null}
              </>
            ) : (
              <p className="muted">Images can be added after review, or sign in to upload now. A recognisable Culturosity branded image is used meanwhile.</p>
            )}
            {!edit ? (
              <>
                <hr className="divider" />
                <h3>Submitter</h3>
                <div className="grid-2">
                  <TextField label="Your name" required value={submitter.name} error={err("submitter.name")} onChange={(e) => setSubmitter({ ...submitter, name: e.target.value })} />
                  <TextField label="Your email" required type="email" value={submitter.email} error={err("submitter.email")} onChange={(e) => setSubmitter({ ...submitter, email: e.target.value })} />
                </div>
                <TextField label="Organization / provider you represent" value={submitter.organization} onChange={(e) => setSubmitter({ ...submitter, organization: e.target.value })} />
                <Checkbox
                  label="I am authorised to publish this offer and its images on behalf of the provider."
                  checked={submitter.authorityConfirmed}
                  onChange={(v) => setSubmitter({ ...submitter, authorityConfirmed: v })}
                />
                {err("submitter.authorityConfirmed") ? <div style={{ color: "var(--danger)", fontWeight: 600, fontSize: ".85rem" }}>{err("submitter.authorityConfirmed")}</div> : null}
              </>
            ) : null}
          </>
        ) : null}

        {step === 6 ? (
          <>
            <p className="muted">This preview matches how members will see the offer.</p>
            <Preview form={form} valueLabel={valuePreview} isDemo={Boolean(dest?.isDemo)} />
            {Object.keys(errors).length ? (
              <div className="alert alert-error" role="alert" style={{ marginTop: 16 }}>
                Please fix: {Object.values(errors).slice(0, 4).join(" · ")}
              </div>
            ) : null}
            {serverError ? <div style={{ marginTop: 16 }}><ErrorAlert error={serverError} title="Not saved." /></div> : null}
          </>
        ) : null}

        <div className="spread" style={{ marginTop: 24 }}>
          <div className="row">
            <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </button>
            {!edit ? (
              <button type="button" className="btn btn-ghost" onClick={saveDraft}>
                Save draft
              </button>
            ) : null}
            {draftSavedAt ? <span className="muted" style={{ fontSize: ".82rem" }}>Saved {new Date(draftSavedAt).toLocaleTimeString()}</span> : null}
          </div>
          {step < STEPS.length - 1 ? (
            <button type="submit" className="btn btn-dark">
              Continue
            </button>
          ) : (
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting} aria-busy={submitting}>
              {submitting ? "Saving…" : edit ? "Save changes" : dest?.mode === "review" ? "Submit for review" : "Publish perk"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function UploadField({ label, assetId, onFile, error, hint }: { label: string; assetId?: string; onFile: (f: File) => void; error?: string; hint?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="row">
        {assetId ? (
          <div style={{ width: 120, height: 75, borderRadius: 10, overflow: "hidden", background: "#eee" }}>
            <img src={`/api/assets/${assetId}`} alt="Uploaded image preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ) : null}
        <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
          <IconUpload size={18} /> {busy ? "Uploading…" : assetId ? "Replace image" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              await onFile(f);
              setBusy(false);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {hint ? <div className="hint">{hint}</div> : null}
      {error ? <div className="error" role="alert">{error}</div> : null}
    </div>
  );
}

function Preview({ form, valueLabel, isDemo }: { form: Form; valueLabel: string; isDemo: boolean }) {
  let window_ = "—";
  try {
    const w = windowFromInput({ ...form.availability, ongoing: form.availability.ongoing });
    window_ = formatWindow(w.startsAt?.toISOString() ?? null, w.endsAt?.toISOString() ?? null, form.availability.ongoing, form.availability.timezone);
  } catch {
    /* incomplete */
  }
  const place = form.location.onlineOnly ? "Online" : [form.location.city, form.location.region].filter(Boolean).join(", ");
  return (
    <div style={{ background: "#000", color: "#fff", borderRadius: 22, padding: 16 }}>
      <div className="grid-2">
        <div className="perk-card" style={{ animation: "none" }}>
          <div className="media">
            <PerkImage src={form.media.imageAssetId ? `/api/assets/${form.media.imageAssetId}` : null} alt={form.media.imageAlt} />
            <div className="top-badges">
              <span className="badge badge-new">New</span>
              {isDemo ? <DemoBadge /> : null}
            </div>
            <span className="badge badge-value">{valueLabel}</span>
          </div>
          <div className="body">
            <div className="provider">{form.provider.name || "Provider name"}</div>
            <div className="title">{form.title || "Perk title"}</div>
            <div className="meta">
              <span className="row" style={{ gap: 5 }}>
                <IconCalendar size={15} /> {window_}
              </span>
              {place ? (
                <span className="row" style={{ gap: 5 }}>
                  {form.location.onlineOnly ? <IconGlobe size={15} /> : <IconPin size={15} />} {place}
                </span>
              ) : null}
            </div>
            <div className="actions">
              <span className="muted" style={{ fontSize: ".78rem" }}>{form.category}</span>
              <span className="btn btn-primary btn-sm" aria-hidden>Details</span>
            </div>
          </div>
        </div>
        <div className="value-hero">
          <span className="value">{valueLabel}</span>
          <div className="row">
            {form.redemption.method !== "in_person" ? <span className="btn btn-primary" aria-hidden>Use Perk</span> : null}
            {form.redemption.method !== "online" ? (
              <span className="btn btn-ghost" aria-hidden>
                <IconTicket size={16} /> Show Member Card
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: ".9rem" }}>
            <strong>{form.title}</strong>
            <p className="muted" style={{ whiteSpace: "pre-line" }}>{form.fullDescription}</p>
            <p className="muted">How to redeem: {form.redemption.instructions}</p>
            <p className="muted">Eligible: {form.eligibility.groups}</p>
            {form.occurrences.length ? <p className="muted">{form.occurrences.length} event date(s)</p> : null}
            {form.redemption.promoCode ? <p className="muted">Promo code shown to members after sign-in.</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubmitResult({ result, dest, onAnother }: { result: any; dest?: Destination; onAnother: () => void }) {
  const status: string = result.status;
  const orgSlug = result.orgSlug ?? dest?.orgSlug;
  const isCul = (result.orgKind ?? dest?.orgKind) === "culturosity";
  const viewUrl = result.perkId ? (isCul ? `/perks/${result.perkId}?programId=${result.programId}` : `/app/${orgSlug}/perks/${result.perkId}`) : null;
  return (
    <div className="panel" role="status" aria-live="polite" style={{ textAlign: "center", padding: 40 }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--brand-mint)", display: "grid", placeItems: "center", margin: "0 auto 16px", color: "#000" }}>
        <IconCheck size={32} />
      </div>
      {result.edited ? (
        <h2>Changes saved</h2>
      ) : status === "published" ? (
        <h2>Published — it's live now</h2>
      ) : status === "scheduled" ? (
        <h2>Scheduled</h2>
      ) : (
        <h2>Submitted for review</h2>
      )}
      <p className="muted" style={{ maxWidth: 560, margin: "0 auto 18px" }}>
        {result.edited
          ? "The offer, its listing and its details page now show your changes."
          : status === "published"
            ? "Your offer was saved and added to the program catalogue automatically. Eligible members can see it now."
            : status === "scheduled"
              ? "Your offer was saved. It appears in management as Scheduled and becomes visible to eligible members at its start time."
              : "Your submission was saved in the review queue. Once approved it is published automatically — no copying required."}
        {result.duplicate ? " (This was a repeat of an earlier submission, so no duplicate was created.)" : ""}
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        {viewUrl && status === "published" ? (
          <Link className="btn btn-primary" to={viewUrl}>
            View Perk
          </Link>
        ) : null}
        {orgSlug && !isCul ? (
          <Link className="btn btn-ghost" to={`/app/${orgSlug}/manage/offers`}>
            Manage offers
          </Link>
        ) : null}
        <button className="btn btn-ghost" onClick={onAnother}>
          Submit another
        </button>
      </div>
    </div>
  );
}

export type { Form as PerkFormState };
