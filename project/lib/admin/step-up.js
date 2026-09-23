import "server-only";
import crypto from "node:crypto";

const COOKIE_NAME = "cloxtro_stepup";
const TOKEN_TTL_SECONDS = 10 * 60; // 10 minutes — deliberately short; step-up proves "you, right now," not "you, earlier today"

/**
 * Step-up (re-)authentication — §6, §94.
 *
 * A normal admin session (a valid Supabase auth cookie) is NOT
 * sufficient for the specific sensitive actions listed in §6 (partner
 * credential changes, affiliate network config, high-impact bulk
 * mutations). Those routes additionally require a short-lived,
 * HMAC-signed token proving the admin re-entered their password within
 * the last 10 minutes — see `POST /api/admin/step-up`, which is the only
 * place `issueStepUpToken()` is called, after re-verifying the password
 * via `supabase.auth.signInWithPassword()`.
 *
 * Deliberately stateless (HMAC-signed, not a database row): the token
 * carries its own expiry and is bound to one user id, verified with
 * `crypto.timingSafeEqual` — same verification shape as the Part 4
 * webhook HMAC check (`lib/affiliate/webhook-verify.js`), reused here for
 * a different trust boundary. This is ordinary admin-session security,
 * not a webhook/network integration — it does not need its own database
 * table for what a signed, short-TTL cookie already proves.
 */
function secret() {
  const value = process.env.STEP_UP_SECRET || "demo-safe-step-up-secret-12345";
  return value;
}

function sign(userId, expiresAt) {
  return crypto.createHmac("sha256", secret()).update(`${userId}.${expiresAt}`).digest("hex");
}

/**
 * @param {string} userId
 * @returns {{ token: string, expiresAt: number }}
 */
export function issueStepUpToken(userId) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const signature = sign(userId, expiresAt);
  return { token: `${expiresAt}.${signature}`, expiresAt };
}

/**
 * @param {string | undefined | null} token
 * @param {string} userId
 * @returns {boolean}
 */
export function verifyStepUpToken(token, userId) {
  if (!token || !userId) return false;
  const [expiresAtStr, signature] = token.split(".");
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || !signature) return false;
  if (Math.floor(Date.now() / 1000) > expiresAt) return false; // expired — re-verification must be recent (§94)

  const expected = sign(userId, expiresAt);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

export function applyStepUpCookie(response, token) {
  response.cookies.set(COOKIE_NAME, token, {
    maxAge: TOKEN_TTL_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export function clearStepUpCookie(response) {
  response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
}

/**
 * Reads and verifies the step-up cookie from an incoming request. Use
 * this at the top of any route from §6's sensitive-action list, after
 * `requireAdmin()` has already confirmed the caller is an admin.
 *
 * @param {Request} request
 * @param {string} userId
 * @returns {boolean}
 */
export function hasValidStepUp(request, userId) {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]) : null;
  return verifyStepUpToken(token, userId);
}

export { COOKIE_NAME as STEP_UP_COOKIE_NAME };
