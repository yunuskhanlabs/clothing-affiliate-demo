import "server-only";
import { logWarn } from "@/lib/observability/logger";

/**
 * Rate Limiting Module
 *
 * Provides distributed rate limiting when Upstash Redis is configured
 * (via `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`), with a
 * safe, memory-bounded local fallback for development or single-instance
 * deployments.
 */

const buckets = new Map(); // key -> { count, windowStart }
const MAX_TRACKED_KEYS = 5000;

/**
 * Resolves the client IP address from proxy headers defensively,
 * checking Cloudflare/Edge headers first to prevent spoofing.
 */
export function resolveClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  return "127.0.0.1";
}

/**
 * Synchronous in-memory rate limiter for local fallback.
 */
export function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear();
    buckets.set(key, { count: 1, windowStart: now });
    return { ok: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    const retryAfterSeconds = Math.ceil((existing.windowStart + windowMs - now) / 1000);
    return { ok: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return { ok: true, remaining: limit - existing.count };
}

/**
 * Async rate limiter with distributed Upstash Redis support and automatic memory fallback.
 */
export async function checkRateLimitAsync(key, { limit, windowMs }) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const windowSeconds = Math.ceil(windowMs / 1000);
      const pipelineUrl = `${redisUrl.replace(/\/$/, "")}/pipeline`;

      const res = await fetch(pipelineUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${redisToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", key],
          ["PTTL", key],
        ]),
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const count = data[0]?.result || 1;
        let pttl = data[1]?.result || -1;

        if (count === 1 || pttl === -1) {
          await fetch(pipelineUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${redisToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([["EXPIRE", key, windowSeconds]]),
            cache: "no-store",
          }).catch(() => { });
          pttl = windowMs;
        }

        const remaining = Math.max(0, limit - count);
        const retryAfterSeconds = Math.max(1, Math.ceil(pttl / 1000));

        if (count > limit) {
          return { ok: false, remaining: 0, retryAfterSeconds };
        }
        return { ok: true, remaining };
      }
    } catch (err) {
      logWarn("Upstash Redis rate-limit check failed, falling back to memory", { key, error: String(err) });
    }
  }

  return checkRateLimit(key, { limit, windowMs });
}

/**
 * Synchronous route rate limiter wrapper.
 */
export function rateLimitOr429(request, routeName, opts) {
  const ip = resolveClientIp(request);
  const result = checkRateLimit(`${routeName}:${ip}`, opts);
  if (result.ok) return null;

  logWarn("rate limit exceeded", { route: routeName, ip, retryAfterSeconds: result.retryAfterSeconds });
  return Response.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds || 60) } }
  );
}

/**
 * Async route rate limiter wrapper.
 */
export async function rateLimitOr429Async(request, routeName, opts) {
  const ip = resolveClientIp(request);
  const result = await checkRateLimitAsync(`${routeName}:${ip}`, opts);
  if (result.ok) return null;

  logWarn("rate limit exceeded", { route: routeName, ip, retryAfterSeconds: result.retryAfterSeconds });
  return Response.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds || 60) } }
  );
}

