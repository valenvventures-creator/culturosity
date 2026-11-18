// Email boundary. The outbox row is always written first, so a saved record never depends
// on email delivery. When RESEND_API_KEY is set the message is also sent via Resend's HTTP API.
import type { Queryable } from "../db";
import type { ServerConfig } from "../env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}
export interface EmailAdapter {
  configured: boolean;
  send(db: Queryable, msg: EmailMessage): Promise<void>;
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
      if (!key) return;
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: cfg.emailFrom, to: [msg.to], subject: msg.subject, text: msg.text }),
        });
        if (!res.ok) console.error(`[email] provider returned ${res.status}`);
      } catch (e) {
        console.error("[email] delivery failed", (e as Error).message);
      }
    },
  };
}
