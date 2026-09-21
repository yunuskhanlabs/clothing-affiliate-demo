import "server-only";
import { localProvider } from "./providers/local";
import { openaiProvider } from "./providers/openai";
import { geminiProvider } from "./providers/gemini";

/**
 * Model configuration layer (§50). `AI_PROVIDER` selects which
 * `extractIntent(query)` implementation runs; all providers return the
 * same raw shape and are validated identically afterward (§49) — nothing
 * downstream needs to know which one ran. Defaults to `local` (always
 * available, no key needed).
 */
const PROVIDERS = { local: localProvider, openai: openaiProvider, gemini: geminiProvider };

export function getAiProvider() {
  const key = process.env.AI_PROVIDER || "local";
  return PROVIDERS[key] || localProvider;
}

export const MODEL_TIERS = {
  lightweight: { description: "Fast, low-cost — used for routine intent extraction (§50)." },
  heavy: { description: "Higher reasoning quality — reserved for tasks that genuinely need it; not used anywhere in this phase." },
};
