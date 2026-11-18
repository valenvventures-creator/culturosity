// AI drafting boundary. Only the selected, authorised research record and approved product
// context are sent to the model — never a client workspace or membership data.
import Anthropic from "@anthropic-ai/sdk";
import type { ServerConfig } from "../env";
import { OUTREACH_SYSTEM_PROMPT, type OutreachContent, type OutreachContext } from "../lib/outreach";

export interface AiAdapter {
  configured: boolean;
  model: string | null;
  draftOutreach(ctx: OutreachContext): Promise<OutreachContent>;
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sections", "warnings"],
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "title", "subject", "body"],
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    warnings: { type: "array", items: { type: "string" } },
  },
};

const CHANNEL_SPEC: Record<OutreachContext["channel"], string> = {
  email: "Sections: email_initial (with subject), email_followup_1 (with subject), email_followup_2 (with subject).",
  sms: "Sections: sms (under 300 characters, subject empty).",
  phone: "Sections: phone_opener (about 30 seconds spoken), discovery (5 numbered questions), voicemail, call_outline, objections (address 'we already have a program' and 'no time to manage another platform'). Subjects empty.",
  demo: "Sections: demo_outline (7 numbered steps ending with a booking or proposal request), post_demo (follow-up email with subject).",
};

export function createAiAdapter(cfg: ServerConfig): AiAdapter {
  if (!cfg.anthropicApiKey) {
    return {
      configured: false,
      model: null,
      async draftOutreach() {
        throw new Error("AI drafting is not configured (ANTHROPIC_API_KEY missing).");
      },
    };
  }
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey, maxRetries: 2, timeout: 60_000 });
  return {
    configured: true,
    model: cfg.aiModel,
    async draftOutreach(ctx) {
      const record = {
        organization: ctx.organization,
        classification: ctx.prospectTypes,
        program: ctx.programName,
        program_summary: ctx.programSummary,
        audience: ctx.audience,
        source_urls: ctx.sourceUrls,
      };
      const user = [
        `Objective: ${ctx.objective}. Channel: ${ctx.channel}. Persona: ${ctx.persona || "[unknown role]"}. Tone: ${ctx.tone}. Sender name: ${ctx.senderName || "[Sender Name]"}.`,
        CHANNEL_SPEC[ctx.channel],
        `<RECORD>\n${JSON.stringify(record, null, 2)}\n</RECORD>`,
      ].join("\n\n");
      const params: any = {
        model: cfg.aiModel,
        max_tokens: 4000,
        system: OUTREACH_SYSTEM_PROMPT,
        output_config: { effort: cfg.aiEffort, format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
        messages: [{ role: "user", content: user }],
      };
      // Server-side refusal fallback for the Opus/Sonnet 5.x family.
      if (/^claude-(opus|sonnet|fable)-5/.test(cfg.aiModel)) {
        params.betas = ["server-side-fallback-2026-07-01"];
        params.fallbacks = "default";
      }
      const response: any = await client.beta.messages.create(params);
      if (response.stop_reason === "refusal") throw new Error("The model declined to draft this message. Use the example template instead.");
      const text = (response.content as any[]).filter((b) => b.type === "text").map((b) => b.text).join("");
      const parsed = JSON.parse(text) as OutreachContent;
      return {
        sections: parsed.sections.map((s) => ({ ...s, subject: s.subject || undefined })),
        warnings: parsed.warnings ?? [],
      };
    },
  };
}
