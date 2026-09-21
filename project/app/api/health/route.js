/**
 * PART 6 §58 — liveness: "is the application process itself responding
 * at all", nothing more. Deliberately has ZERO dependencies (no database
 * call, no env var read) — a liveness probe that itself depends on the
 * database can never distinguish "the app is down" from "the database
 * is down," which defeats the point of having two separate checks (see
 * `/api/health/ready` for the dependency-aware one). No sensitive
 * internal diagnostic detail is returned (§58).
 */
export async function GET() {
  return Response.json({ status: "ok" });
}
