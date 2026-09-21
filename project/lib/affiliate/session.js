import "server-only";

const COOKIE_NAME = "cloxtro_sid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Anonymous visitor identifier for click/view deduplication (§13, §14).
 * A random, non-identifying UUID stored in a first-party cookie —
 * deliberately NOT derived from IP address (§13: "do not rely solely on
 * IP for unique-user identification") and carries no PII.
 *
 * Route Handlers can't both read and mutate a cookie through
 * `next/headers` in one step the way Server Components can, so this
 * takes the incoming `NextRequest` and returns the id to use immediately
 * plus a `setCookie` flag — the caller applies it to its own
 * `NextResponse` (which may be a redirect, so this stays response-shape
 * agnostic).
 *
 * @param {Request} request
 * @returns {{ sessionId: string, isNew: boolean }}
 */
const SAFE_SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK_SID_RE = /^[a-zA-Z0-9_-]{16,64}$/;

export function resolveSessionId(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (match) {
    const rawVal = match[1].trim();
    if (SAFE_SID_RE.test(rawVal) || FALLBACK_SID_RE.test(rawVal)) {
      return { sessionId: rawVal, isNew: false };
    }
  }
  return { sessionId: crypto.randomUUID(), isNew: true };
}

/**
 * Applies the session cookie to an outgoing response when it's new.
 * @param {import("next/server").NextResponse} response
 * @param {string} sessionId
 */
export function applySessionCookie(response, sessionId) {
  response.cookies.set(COOKIE_NAME, sessionId, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}
