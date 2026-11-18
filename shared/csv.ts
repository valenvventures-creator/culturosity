// Minimal RFC 4180 CSV parse/serialize used by imports and exports on both client and server.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const src = text.replace(/^﻿/, "");
  while (i < src.length) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (ch === "\r") {
      i++;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Parse CSV into objects keyed by header row. */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const all = parseCsv(text);
  if (all.length === 0) return { headers: [], rows: [] };
  const headers = all[0].map((h) => h.trim());
  const rows = all.slice(1).map((cells) => {
    const o: Record<string, string> = {};
    headers.forEach((h, idx) => (o[h] = (cells[idx] ?? "").trim()));
    return o;
  });
  return { headers, rows };
}

/** Neutralise spreadsheet formula injection, then quote as needed. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  return lines.join("\r\n") + "\r\n";
}
