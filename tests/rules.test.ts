import { describe, expect, it } from "vitest";
import { canTransition, compareAZ, defaultValueLabel, effectiveStatus, statusForWindow } from "../shared/perk";
import { windowFromInput, zonedToUtc, utcToZoned, formatWindow } from "../shared/time";
import { parseCsv, toCsv } from "../shared/csv";
import { perkInputSchema } from "../shared/schemas";
import { isPublicAddress, extractTitle } from "../server/adapters/research";
import { samplePerk } from "./helpers";

describe("time windows", () => {
  it("converts wall-clock time in a timezone, across DST", () => {
    expect(zonedToUtc("2027-01-15", "09:00", "America/Toronto").toISOString()).toBe("2027-01-15T14:00:00.000Z");
    expect(zonedToUtc("2027-07-15", "09:00", "America/Toronto").toISOString()).toBe("2027-07-15T13:00:00.000Z");
    expect(utcToZoned("2027-07-15T13:00:00Z", "America/Toronto")).toEqual({ date: "2027-07-15", time: "09:00" });
  });
  it("treats the end date as inclusive and stores an exclusive end", () => {
    // Toronto: starts in EST (UTC-5), ends after the DST switch (UTC-4).
    const w = windowFromInput({ ongoing: false, startDate: "2027-03-01", endDate: "2027-03-31", timezone: "America/Toronto" });
    expect(w.startsAt!.toISOString()).toBe("2027-03-01T05:00:00.000Z");
    expect(w.endsAt!.toISOString()).toBe("2027-04-01T04:00:00.000Z"); // midnight after Mar 31, EDT
    expect(formatWindow(w.startsAt!.toISOString(), w.endsAt!.toISOString(), false, "America/Toronto")).toContain("Mar 31, 2027");
  });
});

describe("offer lifecycle", () => {
  const now = new Date("2027-01-10T12:00:00Z");
  it("derives scheduled / live / expired from the window at read time", () => {
    expect(effectiveStatus({ status: "published", starts_at: "2027-02-01T00:00:00Z", ends_at: null }, now)).toBe("scheduled");
    expect(effectiveStatus({ status: "scheduled", starts_at: "2027-01-01T00:00:00Z", ends_at: null }, now)).toBe("published");
    expect(effectiveStatus({ status: "published", starts_at: null, ends_at: "2027-01-10T12:00:00Z" }, now)).toBe("expired");
    expect(effectiveStatus({ status: "paused", starts_at: null, ends_at: null }, now)).toBe("paused");
    expect(statusForWindow(null, new Date("2027-01-01"), now)).toBe("expired");
  });
  it("only allows defined transitions", () => {
    expect(canTransition("published", "paused")).toBe(true);
    expect(canTransition("archived", "published")).toBe(false);
    expect(canTransition("rejected", "published")).toBe(false);
  });
  it("sorts A–Z by provider then title, case-insensitive and stable", () => {
    const rows = [
      { provider_name: "beta", title: "B", id: "2" },
      { provider_name: "Alpha", title: "z", id: "3" },
      { provider_name: "alpha", title: "a", id: "1" },
    ];
    expect(rows.sort(compareAZ).map((r) => r.id)).toEqual(["1", "3", "2"]);
  });
  it("labels values with currency", () => {
    expect(defaultValueLabel({ type: "amount", amountMinor: 1500, currency: "CAD" })).toBe("$15 CAD off");
    expect(defaultValueLabel({ type: "percent", percent: 20 })).toBe("20% off");
    expect(defaultValueLabel({ type: "special", label: "VIP tour" })).toBe("VIP tour");
  });
});

describe("submission validation", () => {
  it("accepts a valid offer and special offers without a number", () => {
    expect(perkInputSchema.safeParse(samplePerk()).success).toBe(true);
    expect(perkInputSchema.safeParse(samplePerk({ value: { type: "special", label: "Backstage tour", conditions: "" } })).success).toBe(true);
  });
  it("rejects bad percentages, missing currency, reversed dates, unsafe URLs and missing addresses", () => {
    const bad = (o: any) => perkInputSchema.safeParse(samplePerk(o)).success;
    expect(bad({ value: { type: "percent", percent: 0, conditions: "" } })).toBe(false);
    expect(bad({ value: { type: "amount", amount: 10, conditions: "" } })).toBe(false);
    expect(bad({ availability: { ongoing: false, startDate: "2030-05-02", endDate: "2030-05-01", timezone: "America/Toronto", blackoutDates: [] } })).toBe(false);
    expect(bad({ redemption: { method: "online", url: "javascript:alert(1)", instructions: "Click the link to redeem." } })).toBe(false);
    expect(bad({ redemption: { method: "in_person", instructions: "Show your member card." }, location: { onlineOnly: false, city: "Toronto", country: "Canada" } })).toBe(false);
    expect(bad({ availability: { ongoing: false, endDate: "2020-01-01", timezone: "America/Toronto", blackoutDates: [] } })).toBe(false);
    expect(bad({ availability: { ongoing: true, timezone: "Mars/Olympus", blackoutDates: [] } })).toBe(false);
  });
});

describe("CSV", () => {
  it("round-trips quotes and neutralises formula injection", () => {
    const csv = toCsv(["a", "b"], [{ a: 'He said "hi", ok', b: "=HYPERLINK(1)" }]);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(parseCsv(csv)).toEqual([["a", "b"], ['He said "hi", ok', "'=HYPERLINK(1)"]]);
  });
});

describe("research fetch safety", () => {
  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"])
      expect(isPublicAddress(ip)).toBe(false);
    expect(isPublicAddress("93.184.216.34")).toBe(true);
  });
  it("extracts only title text from untrusted HTML", () => {
    expect(extractTitle("<html><title>Perks &amp; <b>More</b></title><script>ignore()</script>")).toBe("Perks & More");
  });
});
