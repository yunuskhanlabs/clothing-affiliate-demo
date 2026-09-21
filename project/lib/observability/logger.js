/**
 * Minimal structured logging — PART 6 §54-§57, §90.
 *
 * This project has no third-party error-tracking service wired up (no
 * Sentry/etc. DSN was supplied — see PHASE-6-CONTEXT.md §46 "Known
 * external setup requirements"). Rather than claim monitoring is
 * "configured" when it isn't, this module gives every server code path
 * ONE consistent, structured log shape now, so wiring a real sink later
 * (Sentry, Axiom, Better Stack, a Supabase log drain, whatever the
 * deploy target uses) is a one-function change here — `emit()` below —
 * not a rewrite of every call site.
 *
 * Deliberately NOT a class/singleton with request-scoped state: Next.js
 * route handlers are stateless functions, so every call site passes its
 * own `requestId`/context explicitly. This also means nothing here can
 * leak state across concurrent requests in the same server process.
 *
 * Isomorphic on purpose (no `server-only` guard): `app/error.js` and
 * `app/global-error.js` are Client Components (Next.js requirement for
 * error boundaries) and call `logError` too, so it can run in the
 * browser as well as on the server — in the browser it only reaches the
 * visitor's own devtools console, which is expected and harmless (§45's
 * "don't expose secrets" concern is about what's IN the message, not
 * which environment logs it — the same discipline applies either way).
 *
 * Never pass secrets, tokens, full request/webhook bodies, or raw
 * stack traces containing connection strings into `context` — see
 * §45/§55 "log detailed diagnostics securely... do not expose secrets."
 */

function emit(level, message, context = {}) {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };
  // console.error/warn/log map to stderr/stdout, which is what every
  // serverless log drain (Vercel, etc.) actually captures — swapping
  // this for `sink.capture(line)` is the entire integration surface
  // for a future real monitoring provider.
  if (level === "error") console.error(JSON.stringify(line));
  else if (level === "warn") console.warn(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

/**
 * @param {string} message
 * @param {{ requestId?: string, route?: string, [key: string]: unknown }} [context]
 */
export function logError(message, context) {
  emit("error", message, context);
}

/** @param {string} message @param {object} [context] */
export function logWarn(message, context) {
  emit("warn", message, context);
}

/** @param {string} message @param {object} [context] */
export function logInfo(message, context) {
  emit("info", message, context);
}
