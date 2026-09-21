import "server-only";
import { INTENT_JSON_SCHEMA } from "@/lib/ai/schema";

/**
 * Documented integration seam for a real structured-output provider —
 * NOT wired to a live model in this phase (no network/API key available
 * to test against here; §50 "do not hardcode a provider-specific model
 * name if the project's current provider/API uses a different current
 * model" — the model name below is intentionally read from an env var
 * rather than hardcoded, for exactly that reason).
 *
 * To activate: set `AI_PROVIDER=openai` and `OPENAI_API_KEY` in
 * `.env.local`. `lib/ai/provider.js` will then route through this file
 * instead of the local rule-based provider. The request shape below
 * follows OpenAI's structured-output ("Structured Outputs" /
 * `response_format: { type: "json_schema", ... }`) convention using
 * `INTENT_JSON_SCHEMA` from `lib/ai/schema.js` as the constraint (§48) —
 * adjust the request shape here if the configured provider's actual API
 * differs (e.g. a different provider's function-calling format).
 */
export const openaiProvider = {
  name: "openai",
  // §50: lightweight/fast model class for routine intent extraction —
  // read from env, not hardcoded, since "the current model" changes
  // over time and across providers.
  modelTier: "lightweight",

  async extractIntent(rawQuery) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_INTENT_MODEL || "gpt-4o-mini";
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not configured — falling back to the local provider.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "Extract structured shopping intent from the user's message. Only include fields you're confident about. Never invent products, prices, or brands that weren't mentioned.",
            },
            { role: "user", content: rawQuery },
          ],
          response_format: { type: "json_schema", json_schema: INTENT_JSON_SCHEMA },
          temperature: 0,
        }),
      });
      if (!res.ok) {
        const err = new Error(`OpenAI request failed: ${res.status}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI response had no content.");
      return JSON.parse(content); // still passed through validateIntent()/Zod by the caller — §49
    } finally {
      clearTimeout(timeout);
    }
  },
};
