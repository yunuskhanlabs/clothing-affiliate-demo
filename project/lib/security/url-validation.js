/**
 * URL and Image URL Security Validation
 *
 * Enforces strict protocol allowlists (http/https only), reasonable length bounds,
 * rejects dangerous pseudoprotocols (javascript:, data:, file:, blob:, vbscript:),
 * and prevents SSRF where arbitrary hostnames or private network targets could be used.
 */

const MAX_URL_LENGTH = 2048;

const DISALLOWED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "::",
  "[::]",
  "169.254.169.254", // AWS/GCP/Azure metadata IP
  "metadata.google.internal",
  "metadata.internal",
  "instance-data",
]);

/**
 * Checks if an IP or hostname belongs to a private/reserved network range.
 */
function isPrivateHost(hostname) {
  if (!hostname) return true;
  const rawHost = hostname.toLowerCase().trim();
  const host = rawHost.replace(/^\[|\]$/g, ""); // strip IPv6 brackets if present

  if (DISALLOWED_HOSTNAMES.has(rawHost) || DISALLOWED_HOSTNAMES.has(host)) return true;

  // RFC 1918 / loopback / link-local / local TLDs
  if (
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    host.endsWith(".lan") ||
    host.endsWith(".localdomain")
  ) {
    return true;
  }

  // IPv6 loopback / unspecified / link-local / unique-local / mapped
  if (
    host === "::1" ||
    host === "::" ||
    host === "0:0:0:0:0:0:0:1" ||
    host === "0:0:0:0:0:0:0:0" ||
    /^fe[89ab]/i.test(host) || // fe80::/10 link-local
    /^f[cd]/i.test(host) ||     // fc00::/7 unique local
    host.startsWith("::ffff:")  // IPv4-mapped IPv6
  ) {
    return true;
  }

  // IPv4 subnets (including private, loopback, link-local, carrier-grade NAT, test nets, multicast)
  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, b1, b2, b3, b4] = ipv4Match.map(Number);
    if (b1 > 255 || b2 > 255 || b3 > 255 || b4 > 255) return true;
    if (b1 === 0) return true; // 0.0.0.0/8
    if (b1 === 10) return true; // 10.0.0.0/8
    if (b1 === 127) return true; // 127.0.0.0/8 (loopback)
    if (b1 === 169 && b2 === 254) return true; // 169.254.0.0/16 (link-local)
    if (b1 === 172 && b2 >= 16 && b2 <= 31) return true; // 172.16.0.0/12
    if (b1 === 192 && b2 === 168) return true; // 192.168.0.0/16
    if (b1 === 100 && b2 >= 64 && b2 <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (b1 === 192 && b2 === 0 && b3 === 2) return true; // 192.0.2.0/24 (TEST-NET-1)
    if (b1 === 198 && (b2 === 18 || b2 === 19)) return true; // 198.18.0.0/15 (Benchmarking)
    if (b1 === 198 && b2 === 51 && b3 === 100) return true; // 198.51.100.0/24 (TEST-NET-2)
    if (b1 === 203 && b2 === 0 && b3 === 113) return true; // 203.0.113.0/24 (TEST-NET-3)
    if (b1 >= 224) return true; // 224.0.0.0/4 (Multicast/Reserved)
  }

  return false;
}

/**
 * Validates a general HTTP/HTTPS URL.
 *
 * @param {string | null | undefined} value
 * @param {{ blockPrivate?: boolean, maxLength?: number }} [options]
 * @returns {boolean}
 */
export function isValidHttpUrl(value, options = {}) {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  const maxLength = options.maxLength || MAX_URL_LENGTH;
  if (trimmed.length === 0 || trimmed.length > maxLength) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!parsed.hostname || parsed.hostname.trim() === "") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (options.blockPrivate && isPrivateHost(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an image URL for products, avatars, logos, or content.
 *
 * Image URLs MUST:
 * 1. Be valid http: or https: URLs.
 * 2. Not use javascript:, data:, file:, blob:, etc.
 * 3. Not exceed max URL length.
 * 4. Not contain embedded user credentials (user:pass@host).
 *
 * @param {string | null | undefined} value
 * @param {{ blockPrivate?: boolean, maxLength?: number }} [options]
 * @returns {boolean}
 */
export function isValidImageUrl(value, options = {}) {
  if (!value || typeof value !== "string") return false;
  const trimmed = value.trim();
  const maxLength = options.maxLength || MAX_URL_LENGTH;
  if (trimmed.length === 0 || trimmed.length > maxLength) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!parsed.hostname || parsed.hostname.trim() === "") {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (options.blockPrivate && isPrivateHost(parsed.hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

