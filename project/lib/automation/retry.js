/**
 * Bounded exponential backoff (§33). Framework-agnostic — used by any
 * Node-driven automation job that calls an external API.
 */

const DEFAULT_BASE_MS = 500;
const DEFAULT_MAX_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * delay = base * 2^attempt, capped at maxDelayMs, +/- jitter.
 * @param {number} attempt - 0-indexed attempt number
 */
export function backoffDelayMs(attempt, { baseMs = DEFAULT_BASE_MS, maxMs = DEFAULT_MAX_MS, jitter = true } = {}) {
  const raw = Math.min(baseMs * 2 ** attempt, maxMs);
  if (!jitter) return raw;
  // Full jitter (AWS-style): random in [0, raw] — avoids synchronized
  // retry storms across concurrent callers better than +/- jitter does.
  return Math.floor(Math.random() * raw);
}

/**
 * Classifies an error/response as transient (worth retrying) or
 * permanent (won't succeed on retry) — §33.
 * @param {{ status?: number, code?: string, message?: string }} err
 */
export function classifyFailure(err) {
  const status = err?.status;
  if (status === 429) return "transient";
  if (status >= 500 && status <= 599) return "transient";
  if (err?.code === "ETIMEDOUT" || err?.code === "ECONNRESET" || err?.name === "AbortError") return "transient";
  if (status >= 400 && status <= 499) return "permanent"; // invalid credentials, bad request, not found, etc.
  return "transient"; // unknown errors default to retryable, bounded by maxAttempts regardless
}

/**
 * Runs `fn` with bounded exponential backoff. Resolves with `fn`'s
 * result on success. On exhaustion or a permanent failure, rejects with
 * the last error, annotated with `.category` and `.attempts` so the
 * caller can decide DLQ vs. surface-immediately (§33, §34).
 *
 * @param {() => Promise<T>} fn
 * @param {{ maxAttempts?: number, baseMs?: number, maxMs?: number }} [options]
 */
export async function withBackoff(fn, options = {}) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const category = classifyFailure(err);
      if (category === "permanent") {
        err.category = "permanent";
        err.attempts = attempt + 1;
        throw err; // §33: permanent failures are not retried indefinitely — fail fast to DLQ
      }
      if (attempt === maxAttempts - 1) break; // exhausted
      await sleep(backoffDelayMs(attempt, options));
    }
  }

  lastError.category = "transient";
  lastError.attempts = maxAttempts;
  throw lastError; // exhausted retries → caller sends to DLQ (§33 "after retry policy is exhausted -> DLQ")
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
