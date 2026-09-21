import "server-only";

/**
 * Gemini AI Provider implementation for structured intent extraction.
 *
 * Activated when `AI_PROVIDER=gemini` and `GEMINI_API_KEY` is present in `.env.local`.
 * Reads API key server-side only from process.env — never exposed to client bundles.
 */

const INTENT_GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    query: { type: "STRING" },
    category: { type: "STRING" },
    subcategory: { type: "STRING" },
    brand: { type: "STRING" },
    color: { type: "STRING" },
    size: { type: "STRING" },
    material: { type: "STRING" },
    fit: { type: "STRING" },
    occasion: { type: "STRING" },
    price_min: { type: "NUMBER" },
    price_max: { type: "NUMBER" },
    rating: { type: "NUMBER" },
    discount: { type: "NUMBER" },
    sort: { type: "STRING", enum: ["relevance", "popular", "price_asc", "price_desc", "discount", "rating", "newest"] },
    gender: { type: "STRING", enum: ["men", "women", "kids", "unisex"] },
    outfit_count: { type: "INTEGER" },
  },
};

export const geminiProvider = {
  name: "gemini",
  modelTier: "lightweight",

  async extractIntent(rawQuery) {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_INTENT_MODEL || "gemini-3.6-flash";

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured — falling back to the local provider.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Extract structured shopping intent from the user message: "${rawQuery}". Only include fields you're confident about. Never invent products or prices.`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: INTENT_GEMINI_SCHEMA,
            temperature: 0,
          },
        }),
      });

      if (!res.ok) {
        const err = new Error(`Gemini request failed with HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }

      const data = await res.json();
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        throw new Error("Gemini response contained no content.");
      }

      return JSON.parse(content);
    } catch (err) {
      if (err.name === "AbortError") {
        throw new Error("Gemini request timed out after 8000ms.");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  },
};

