// Server-side URL recheck for research sources, hardened against SSRF:
// http(s) only, standard ports, every resolved address must be public, DNS answer is pinned
// for the connection (no rebinding), redirects are followed manually and re-validated,
// response size and time are capped. Fetched content is treated as untrusted data: only the
// HTTP status, final URL and <title> text are extracted; nothing in the page is executed or obeyed.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";

export interface RecheckResult {
  ok: boolean;
  status: number | null;
  finalUrl: string | null;
  redirected: boolean;
  title: string;
  error?: string;
  checkedAt: string;
}

export interface ResearchFetcher {
  recheck(url: string): Promise<RecheckResult>;
  /** Live search connector. Not configured by default; see docs/RESEARCH.md. */
  searchConfigured: boolean;
}

export function isPublicAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false; // multicast + reserved
    return true;
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return false;
    if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return false; // link-local
    if (v.startsWith("fc") || v.startsWith("fd")) return false; // unique local
    if (v.startsWith("ff")) return false; // multicast
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    return true;
  }
  return false;
}

async function resolvePublic(hostname: string): Promise<{ address: string; family: number }> {
  if (isIP(hostname)) {
    if (!isPublicAddress(hostname)) throw new Error("Address is not public");
    return { address: hostname, family: isIP(hostname) };
  }
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(hostname)) throw new Error("Internal hostname refused");
  const all = await dnsLookup(hostname, { all: true });
  if (!all.length || all.some((a) => !isPublicAddress(a.address))) throw new Error("Host resolves to a non-public address");
  return all[0];
}

function requestOnce(url: URL, pinned: { address: string; family: number }, timeoutMs: number) {
  return new Promise<{ status: number; location?: string; body: string }>((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      url,
      {
        method: "GET",
        headers: { "User-Agent": "CulturosityResearchBot/1.0 (+source verification)", Accept: "text/html,*/*;q=0.5" },
        lookup: (_h: string, _o: unknown, cb: (err: Error | null, address: string, family: number) => void) =>
          cb(null, pinned.address, pinned.family),
        timeout: timeoutMs,
      } as any,
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (d: Buffer) => {
          size += d.length;
          if (size > 512 * 1024) {
            res.destroy();
            return;
          }
          chunks.push(d);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body: Buffer.concat(chunks).toString("utf8") }));
        res.on("close", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

export function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]{0,500}?)<\/title>/i);
  if (!m) return "";
  return m[1]
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function createResearchFetcher(opts: { searchConfigured?: boolean } = {}): ResearchFetcher {
  return {
    searchConfigured: Boolean(opts.searchConfigured),
    async recheck(input) {
      const checkedAt = new Date().toISOString();
      let url: URL;
      try {
        url = new URL(input);
      } catch {
        return { ok: false, status: null, finalUrl: null, redirected: false, title: "", error: "Invalid URL", checkedAt };
      }
      let redirected = false;
      try {
        for (let hop = 0; hop < 5; hop++) {
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported scheme");
          if (url.port && !["80", "443"].includes(url.port)) throw new Error("Non-standard port refused");
          if (url.username || url.password) throw new Error("Credentials in URL refused");
          const pinned = await resolvePublic(url.hostname);
          const r = await requestOnce(url, pinned, 8000);
          if (r.status >= 300 && r.status < 400 && r.location) {
            url = new URL(r.location, url);
            redirected = true;
            continue;
          }
          return { ok: r.status >= 200 && r.status < 400, status: r.status, finalUrl: url.toString(), redirected, title: extractTitle(r.body), checkedAt };
        }
        throw new Error("Too many redirects");
      } catch (e) {
        return { ok: false, status: null, finalUrl: url.toString(), redirected, title: "", error: (e as Error).message, checkedAt };
      }
    },
  };
}
