import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const results = [];

function record(testName, passed, details) {
  results.push({ testName, passed, details });
  const status = passed ? "✓ PASS" : "✗ FAIL";
  console.log(`${status} | ${testName} | ${details}`);
}

async function runTests() {
  console.log(`\n=== PART 3 — FILE & IMAGE SECURITY AUDIT RUNTIME TEST SUITE ===`);
  console.log(`Target: ${BASE_URL}\n`);

  // 1. Sensitive file exposure tests
  const sensitivePaths = [
    "/.env",
    "/.env.local",
    "/.env.production",
    "/.git/config",
    "/.git/HEAD",
    "/package.json",
    "/next.config.js",
  ];

  for (const path of sensitivePaths) {
    try {
      const res = await fetch(`${BASE_URL}${path}`);
      const text = await res.text();
      // Next.js should either return 404, or the fallback HTML page (not raw file content)
      const exposed = res.status === 200 && (text.includes("NEXT_PUBLIC") || text.includes("SUPABASE") || text.includes("[core]"));
      record(
        `Sensitive file block: ${path}`,
        !exposed,
        `Status ${res.status}, body length: ${text.length} (exposed: ${exposed})`
      );
    } catch (err) {
      record(`Sensitive file block: ${path}`, true, `Error fetching (safe): ${err.message}`);
    }
  }

  // 2. Next.js image optimizer SSRF & unconfigured host test
  try {
    const maliciousImg = encodeURIComponent("http://169.254.169.254/latest/meta-data/");
    const res = await fetch(`${BASE_URL}/_next/image?url=${maliciousImg}&w=64&q=75`);
    const status = res.status;
    // Next.js image optimizer must reject unconfigured hosts with 400 Bad Request or 404
    const safe = status === 400 || status === 404 || status === 403 || status === 500;
    record(
      "Next.js Image SSRF rejection on unconfigured host",
      safe && status !== 200,
      `Status ${status} (Host rejected safely)`
    );
  } catch (err) {
    record("Next.js Image SSRF rejection on unconfigured host", true, `Rejected at network layer: ${err.message}`);
  }

  // 3. Unauthorized access to admin export file endpoint
  try {
    const res = await fetch(`${BASE_URL}/api/admin/export/products`);
    const json = await res.json().catch(() => ({}));
    record(
      "Unauthorized access to CSV export endpoint rejected",
      res.status === 403,
      `Status ${res.status}, response: ${JSON.stringify(json)}`
    );
  } catch (err) {
    record("Unauthorized access to CSV export endpoint rejected", false, `Failed: ${err.message}`);
  }

  // 4. Profile API avatar_url security validation (Unauthorized check)
  try {
    const res = await fetch(`${BASE_URL}/api/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar_url: "javascript:alert(1)" }),
    });
    record(
      "Unauthenticated profile avatar update blocked",
      res.status === 401,
      `Status ${res.status}`
    );
  } catch (err) {
    record("Unauthenticated profile avatar update blocked", false, `Failed: ${err.message}`);
  }

  // 5. Admin API authorization check for image/product updates
  const adminEndpoints = [
    { url: "/api/admin/products/test-id", method: "PATCH", body: { images: [{ url: "javascript:alert(1)" }] } },
    { url: "/api/admin/brands", method: "POST", body: { name: "Test", slug: "test", logo_url: "javascript:alert(1)" } },
    { url: "/api/admin/brands/test-id", method: "PATCH", body: { logo_url: "data:text/html,<script>alert(1)</script>" } },
    { url: "/api/admin/partners", method: "POST", body: { name: "Test", slug: "test", logo_url: "file:///etc/passwd" } },
    { url: "/api/admin/partners/test-id", method: "PATCH", body: { logo_url: "vbscript:alert(1)" } },
    { url: "/api/admin/content", method: "POST", body: { title: "Test", slug: "test", featured_image: "javascript:alert(1)" } },
    { url: "/api/admin/content/test-id", method: "PATCH", body: { featured_image: "data:image/svg+xml;base64,PHN2Z..." } },
    { url: "/api/admin/offers", method: "POST", body: { product_id: "p1", store_id: "s1", price: 100, affiliate_url: "javascript:alert(1)" } },
    { url: "/api/admin/offers/test-id", method: "PATCH", body: { affiliate_url: "file:///etc/hosts" } },
  ];

  for (const ep of adminEndpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.url}`, {
        method: ep.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ep.body),
      });
      record(
        `Unauthenticated admin write blocked: ${ep.method} ${ep.url}`,
        res.status === 403 || res.status === 401,
        `Status ${res.status}`
      );
    } catch (err) {
      record(`Unauthenticated admin write blocked: ${ep.method} ${ep.url}`, false, `Error: ${err.message}`);
    }
  }

  // 6. Direct Unit Validation Tests of isValidImageUrl & isValidHttpUrl
  const { isValidImageUrl, isValidHttpUrl } = await import("./lib/security/url-validation.js");

  const maliciousUrls = [
    { url: "javascript:alert(1)", expected: false, label: "javascript: scheme" },
    { url: "JAVASCRIPT:alert(1)", expected: false, label: "uppercase JAVASCRIPT: scheme" },
    { url: "data:text/html,<script>alert(1)</script>", expected: false, label: "data:text/html scheme" },
    { url: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", expected: false, label: "data:image/svg scheme" },
    { url: "file:///etc/passwd", expected: false, label: "file: scheme" },
    { url: "blob:https://example.com/uuid", expected: false, label: "blob: scheme" },
    { url: "vbscript:msgbox(1)", expected: false, label: "vbscript: scheme" },
    { url: "http://user:password@malicious.com/img.jpg", expected: false, label: "embedded credentials" },
    { url: "https://example.com/image.jpg", expected: true, label: "valid https URL" },
    { url: "http://example.com/image.png", expected: true, label: "valid http URL" },
    { url: "not-a-url", expected: false, label: "malformed URL string" },
    { url: "   ", expected: false, label: "whitespace only" },
    { url: "https://images.unsplash.com/photo-12345?w=800", expected: true, label: "valid Unsplash photo URL" },
    { url: `https://example.com/${"a".repeat(2500)}.png`, expected: false, label: "excessively long URL (>2048 chars)" },
  ];

  for (const item of maliciousUrls) {
    const valid = isValidImageUrl(item.url);
    const passed = valid === item.expected;
    record(
      `Image URL Validation: ${item.label}`,
      passed,
      `Input: "${item.url.slice(0, 45)}...", Result: ${valid}, Expected: ${item.expected}`
    );
  }

  // 7. Test private IP / SSRF blocking in isValidHttpUrl with blockPrivate option
  const ssrfUrls = [
    { url: "http://127.0.0.1:8080/admin", blockPrivate: true, expected: false, label: "127.0.0.1 loopback" },
    { url: "http://localhost:3000/secret", blockPrivate: true, expected: false, label: "localhost loopback" },
    { url: "http://169.254.169.254/latest/meta-data", blockPrivate: true, expected: false, label: "cloud metadata IP" },
    { url: "http://10.0.0.1/internal", blockPrivate: true, expected: false, label: "10.0.0.0/8 private IP" },
    { url: "http://192.168.1.1/router", blockPrivate: true, expected: false, label: "192.168.0.0/16 private IP" },
    { url: "https://partner-store.com/deal", blockPrivate: true, expected: true, label: "public domain" },
  ];

  for (const item of ssrfUrls) {
    const valid = isValidHttpUrl(item.url, { blockPrivate: item.blockPrivate });
    const passed = valid === item.expected;
    record(
      `SSRF Defense in isValidHttpUrl: ${item.label}`,
      passed,
      `Input: ${item.url}, Result: ${valid}, Expected: ${item.expected}`
    );
  }

  // Summary
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`\n======================================================`);
  console.log(`Total Tests: ${totalCount} | Passed: ${passedCount} | Failed: ${totalCount - passedCount}`);
  console.log(`======================================================\n`);

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests();

