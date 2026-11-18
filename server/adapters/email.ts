// Email boundary. The outbox row is always written first, so a saved record never depends
// on email delivery. When RESEND_API_KEY is set the message is also sent via Resend's HTTP API.
import type { Queryable } from "../db";
import type { ServerConfig } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}
/** `sent` is true only when the provider accepted the message; `error` is the provider's reason otherwise. */
export interface EmailResult {
  sent: boolean;
  error?: string;
}
export interface EmailAdapter {
  configured: boolean;
  send(db: Queryable, msg: EmailMessage): Promise<EmailResult>;
}

export function createEmailAdapter(cfg: ServerConfig): EmailAdapter {
  const key = cfg.resendApiKey;
  return {
    configured: Boolean(key),
    async send(db, msg) {
      await db.query(`insert into email_outbox (to_email, subject, body_text, delivered_via) values ($1,$2,$3,$4)`, [
        msg.to,
        msg.subject,
        msg.text,
        key ? "resend" : "outbox",
      ]);
      if (!key) return { sent: false, error: "Email isn't connected (no RESEND_API_KEY)." };
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: cfg.emailFrom, to: [msg.to], subject: msg.subject, text: msg.text }),
        });
        if (res.ok) return { sent: true };
        // Resend explains rejections (e.g. unverified domain) in a JSON "message"; never includes the key.
        const detail = await res.json().then((j: any) => String(j?.message ?? "")).catch(() => "");
        const error = `Resend returned ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
        console.error(`[email] ${error}`);
        return { sent: false, error };
      } catch (e) {
        console.error("[email] delivery failed", (e as Error).message);
        return { sent: false, error: "Couldn't reach Resend." };
      }
    },
  };
}
