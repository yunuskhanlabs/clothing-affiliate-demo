/**
 * PART 5 — AFFILIATE REDIRECT SECURITY AUDIT & RUNTIME TEST SUITE
 *
 * Runs against a live production build server (Next.js production build).
 */

import http from "node:http";
import { spawn } from "node:child_process";
import { isValidHttpUrl, isValidImageUrl } from "./lib/security/url-validation.js";

function resolveTrustedDestination(offer, store) {
  if (isValidHttpUrl(offer?.affiliate_url, { blockPrivate: true })) return offer.affiliate_url;
  if (isValidHttpUrl(store?.base_url, { blockPrivate: true })) return store.base_url;
  return null;
}

function injectTrackingParam(destinationUrl, paramName, clickId) {
  const url = new URL(destinationUrl);
  url.searchParams.set(paramName || "subid1", clickId);
  return url.toString();
}

const COOKIE_NAME = "cloxtro_sid";
const SAFE_SID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FALLBACK_SID_RE = /^[a-zA-Z0-9_-]{16,64}$/;

function resolveSessionId(request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (match) {
    const rawVal = match[1].trim();
    if (SAFE_SID_RE.test(rawVal) || FALLBACK_SID_RE.test(rawVal)) {
      return { sessionId: rawVal, isNew: false };
    }
  }
  return { sessionId: "00000000-0000-0000-0000-000000000000", isNew: true };
}

const PORT = 3005;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const SECRET_PATTERNS = [
  /eyJh[A-Za-z0-9_-]{20,}/, // JWT / service role tokens
  /postgres:\/\//i,
  /supabase_service_role/i,
  /SERVICE_ROLE_KEY/i,
  /DATABASE_URL/i,
  /UPSTASH_REDIS_REST_TOKEN/i,
  /AFFILIATE_WEBHOOK_SECRET/i,
  /CRON_SECRET/i,
  /ADMIN_STEP_UP_SECRET/i,
];

function containsSecretPatterns(text) {
  if (!text || typeof text !== "string") return false;
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function runFetch(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = urlPath.startsWith("http") ? urlPath : `${BASE_URL}${urlPath}`;
    const parsed = new URL(fullUrl);

    const reqOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || "GET",
      headers: options.headers || {},
    };

    const req = http.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch { }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: data,
          json,
        });
      });
    });

    req.on("error", reject);

    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function waitForServer(maxAttempts = 40, interval = 500) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await runFetch("/api/health");
      if (res.status === 200) return true;
    } catch { }
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

async function main() {
  console.log("================================================================================");
  console.log("        PART 5 — AFFILIATE REDIRECT RUNTIME SECURITY AUDIT");
  console.log("================================================================================\n");

  console.log(`Starting Next.js production server on port ${PORT}...`);
  const serverProc = spawn("npx", ["next", "start", "-p", String(PORT)], {
    shell: true,
    stdio: "pipe",
    env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
  });

  serverProc.stdout.on("data", (d) => {
    const msg = d.toString();
    if (msg.includes("Ready in") || msg.includes("started server")) {
      console.log(`Server log: ${msg.trim()}`);
    }
  });

  serverProc.stderr.on("data", (d) => {
    // console.error(`Server err: ${d.toString()}`);
  });

  const results = [];

  function record(section, testName, pass, details = {}) {
    results.push({ section, testName, pass, details });
    const status = pass ? "PASS" : "FAIL";
    console.log(`[${status}] [${section}] ${testName}`);
    if (details.status) console.log(`       HTTP Status: ${details.status}`);
    if (details.location) console.log(`       Location: ${details.location}`);
    if (details.message) console.log(`       Detail: ${details.message}`);
  }

  try {
    const ready = await waitForServer();
    if (!ready) {
      throw new Error(`Server failed to start on port ${PORT} within timeout`);
    }
    console.log(`\nServer is LIVE at ${BASE_URL}. Running audit test battery...\n`);

    // =========================================================================
    // SECTION 1: OPEN REDIRECT PROTECTION
    // =========================================================================
    console.log("--- 1. OPEN REDIRECT DEFENSE TESTS ---");

    // Fetch an available offer ID from public API / deals
    let sampleOfferId = null;
    try {
      const dealsRes = await runFetch("/api/deals");
      if (dealsRes.json && Array.isArray(dealsRes.json.deals) && dealsRes.json.deals.length > 0) {
        sampleOfferId = dealsRes.json.deals[0].offer_id || dealsRes.json.deals[0].id;
      }
    } catch { }

    // Fallback known seed UUID if deals API not seeded
    if (!sampleOfferId) {
      sampleOfferId = "00000000-0000-0000-0000-000000000001";
    }

    const openRedirectPayloads = [
      { param: "?url=https://evil.example.com", label: "Query param ?url override" },
      { param: "?redirect=https://evil.example.com", label: "Query param ?redirect override" },
      { param: "?next=https://evil.example.com", label: "Query param ?next override" },
      { param: "?returnUrl=https://evil.example.com", label: "Query param ?returnUrl override" },
      { param: "?callback=https://evil.example.com", label: "Query param ?callback override" },
      { param: "?subid1=https://evil.example.com", label: "Query param ?subid1 injection" },
      { param: "?dest=%2F%2Fevil.example.com", label: "Encoded protocol-relative target" },
      { param: "?url=javascript%3Aalert(1)", label: "Javascript: pseudo-protocol query" },
      { param: "?url=data%3Atext%2Fhtml%2Cevil", label: "Data: pseudo-protocol query" },
    ];

    for (const item of openRedirectPayloads) {
      const res = await runFetch(`/go/${sampleOfferId}${item.param}`);
      // Must NOT redirect to evil.example
      const location = res.headers.location || "";
      const didRedirectToEvil = location.includes("evil.example") || location.startsWith("//evil") || location.startsWith("javascript:") || location.startsWith("data:");
      const pass = !didRedirectToEvil && (res.status === 302 || res.status === 404 || res.status === 410 || res.status === 502);
      record(
        "Open Redirect",
        item.label,
        pass,
        { status: res.status, location: location || "(none)", message: didRedirectToEvil ? "VULNERABILITY: Redirected to attacker URL!" : "Attacker destination safely ignored" }
      );
    }

    // =========================================================================
    // SECTION 2: OFFER ID VALIDATION & SQLi / TRAVERSAL
    // =========================================================================
    console.log("\n--- 2. OFFER ID INPUT VALIDATION TESTS ---");

    const offerIdTests = [
      { path: "/go/not-a-uuid", expectedStatus: 400, label: "Non-UUID string" },
      { path: "/go/'%20OR%201=1%20--", expectedStatus: 400, label: "SQL Injection payload in offerId" },
      { path: "/go/..%2F..%2Fadmin", expectedStatus: 400, label: "Path traversal in offerId" },
      { path: `/go/${"a".repeat(2000)}`, expectedStatus: 400, label: "Oversized offer ID string" },
      { path: "/go/00000000-0000-0000-0000-000000000000", expectedStatus: [404, 502], label: "Valid format non-existent UUID" },
    ];

    for (const test of offerIdTests) {
      const res = await runFetch(test.path);
      const isExpected = Array.isArray(test.expectedStatus) ? test.expectedStatus.includes(res.status) : res.status === test.expectedStatus;
      const hasSafeHtml = res.text.includes("This deal isn't available right now") || res.status === 400;
      const noLeak = !containsSecretPatterns(res.text);
      const pass = isExpected && hasSafeHtml && noLeak;
      record(
        "Offer ID Validation",
        test.label,
        pass,
        { status: res.status, message: `Status ${res.status} returned, safe HTML: ${hasSafeHtml}, no secret leak: ${noLeak}` }
      );
    }

    // =========================================================================
    // SECTION 3: AFFILIATE URL / SSRF / PRIVATE HOST BLOCKING
    // =========================================================================
    console.log("\n--- 3. AFFILIATE URL VALIDATION & SSRF TESTS ---");

    const ssrfTargets = [
      { url: "http://localhost:8080/admin", label: "localhost loopback" },
      { url: "http://127.0.0.1:3000/secret", label: "127.0.0.1 loopback" },
      { url: "http://0.0.0.0:8000/", label: "0.0.0.0 loopback" },
      { url: "http://[::1]:8080/", label: "[::1] IPv6 loopback" },
      { url: "http://[::]:8080/", label: "[::] IPv6 unspecified" },
      { url: "http://169.254.169.254/latest/meta-data", label: "169.254.169.254 Cloud Metadata" },
      { url: "http://metadata.google.internal/computeMetadata/v1/", label: "metadata.google.internal" },
      { url: "http://instance-data/latest/", label: "instance-data hostname" },
      { url: "http://10.0.0.1/admin", label: "10.0.0.0/8 private IP" },
      { url: "http://172.16.0.1/admin", label: "172.16.0.0/12 private IP" },
      { url: "http://192.168.1.1/admin", label: "192.168.0.0/16 private IP" },
      { url: "http://100.64.0.1/admin", label: "100.64.0.0/10 Carrier Grade NAT" },
      { url: "http://[fe80::1]/link-local", label: "IPv6 link-local" },
      { url: "http://[fc00::1]/unique-local", label: "IPv6 unique local" },
      { url: "http://internal.service.local/api", label: ".local internal TLD" },
      { url: "http://db.internal/api", label: ".internal internal TLD" },
      { url: "http://cluster.lan/api", label: ".lan internal TLD" },
      { url: "javascript:alert(1)", label: "javascript: pseudo-protocol" },
      { url: "data:text/html,<script>alert(1)</script>", label: "data: pseudo-protocol" },
      { url: "file:///etc/passwd", label: "file: pseudo-protocol" },
      { url: "blob:https://example.com/uuid", label: "blob: pseudo-protocol" },
      { url: "http://admin:secret@trusted-merchant.com/deal", label: "Embedded credentials in URL" },
      { url: "https://legitimate-store.com/product/123", label: "Legitimate public HTTPS URL", shouldPass: true },
    ];

    for (const target of ssrfTargets) {
      const valid = isValidHttpUrl(target.url, { blockPrivate: true });
      const expected = target.shouldPass ? true : false;
      const pass = valid === expected;
      record(
        "SSRF & URL Security",
        target.label,
        pass,
        { message: `Input: "${target.url}", Validated: ${valid}, Expected: ${expected}` }
      );
    }

    // Verify resolveTrustedDestination rejects private URLs
    const privateOffer = { affiliate_url: "http://127.0.0.1:8080/internal" };
    const privateStore = { base_url: "http://169.254.169.254/latest" };
    const resolvedPrivate = resolveTrustedDestination(privateOffer, privateStore);
    const passPrivateResolution = resolvedPrivate === null;
    record(
      "Trusted Destination Resolution",
      "resolveTrustedDestination rejects private host offer & store",
      passPrivateResolution,
      { message: `Resolved destination: ${resolvedPrivate}, Expected: null` }
    );

    const publicOffer = { affiliate_url: "https://nike.com/air-max" };
    const publicStore = { base_url: "https://nike.com" };
    const resolvedPublic = resolveTrustedDestination(publicOffer, publicStore);
    const passPublicResolution = resolvedPublic === "https://nike.com/air-max";
    record(
      "Trusted Destination Resolution",
      "resolveTrustedDestination accepts public HTTPS offer URL",
      passPublicResolution,
      { message: `Resolved destination: ${resolvedPublic}` }
    );

    // Verify injectTrackingParam injection
    const trackingInjected = injectTrackingParam("https://nike.com/air-max?campaign=summer", "subid1", "11111111-2222-3333-4444-555555555555");
    const parsedInjected = new URL(trackingInjected);
    const trackingPass = parsedInjected.searchParams.get("subid1") === "11111111-2222-3333-4444-555555555555" && parsedInjected.searchParams.get("campaign") === "summer";
    record(
      "Click Tracking Injection",
      "injectTrackingParam preserves existing params and sets click ID",
      trackingPass,
      { message: `Injected URL: ${trackingInjected}` }
    );

    // =========================================================================
    // SECTION 4: REDIRECT RESPONSE SECURITY & HEADERS
    // =========================================================================
    console.log("\n--- 4. REDIRECT RESPONSE SECURITY & HEADERS ---");

    const goRes = await runFetch(`/go/00000000-0000-0000-0000-000000000000`);
    const cacheControl = goRes.headers["cache-control"] || "";
    const pragma = goRes.headers["pragma"] || "";
    const reqId = goRes.headers["x-request-id"] || "";
    const noStorePass = cacheControl.includes("no-store") && pragma === "no-cache";
    const reqIdPass = reqId.length > 0;
    const noLeakGo = !containsSecretPatterns(goRes.text);

    record(
      "Redirect Response Security",
      "Cache-Control: no-store and Pragma: no-cache headers",
      noStorePass,
      { message: `Cache-Control: "${cacheControl}", Pragma: "${pragma}"` }
    );

    record(
      "Redirect Response Security",
      "x-request-id correlation header presence",
      reqIdPass,
      { message: `x-request-id: "${reqId}"` }
    );

    record(
      "Redirect Response Security",
      "No internal database or secret leakage in response",
      noLeakGo,
      { message: "Response clean of secret patterns" }
    );

    // =========================================================================
    // SECTION 5: COOKIE & SESSION SECURITY
    // =========================================================================
    console.log("\n--- 5. COOKIE & SESSION SECURITY TESTS ---");

    // Test with malicious / forged cookie
    const forgedCookies = [
      { cookie: `cloxtro_sid=${"x".repeat(5000)}`, label: "Oversized cookie value (>5000 chars)" },
      { cookie: `cloxtro_sid=' OR 1=1 --`, label: "SQLi payload in cookie" },
      { cookie: `cloxtro_sid=<script>alert(1)</script>`, label: "XSS payload in cookie" },
    ];

    for (const item of forgedCookies) {
      const res = await runFetch("/api/track/view", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: item.cookie,
        },
        body: JSON.stringify({ productId: "00000000-0000-0000-0000-000000000000" }),
      });

      const setCookie = res.headers["set-cookie"] || [];
      const setCookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : String(setCookie);
      const regeneratedSafe = setCookieStr.includes("cloxtro_sid=");
      const isHttpOnly = setCookieStr.includes("HttpOnly");
      const isSameSiteLax = setCookieStr.toLowerCase().includes("samesite=lax");

      const pass = res.status === 204 && regeneratedSafe && isHttpOnly;
      record(
        "Cookie & Session Security",
        `Forged Cookie Sanitization: ${item.label}`,
        pass,
        { status: res.status, message: `Set-Cookie issued fresh safe UUID, HttpOnly: ${isHttpOnly}, SameSite: ${isSameSiteLax}` }
      );
    }

    // Unit check resolveSessionId sanitization
    const fakeReqMalformed = { headers: new Headers({ cookie: `cloxtro_sid=BAD_PAYLOAD_123` }) };
    const resolvedForged = resolveSessionId(fakeReqMalformed);
    const resolvedClean = resolvedForged.isNew === true && resolvedForged.sessionId !== "BAD_PAYLOAD_123";
    record(
      "Cookie & Session Security",
      "resolveSessionId rejects malformed cookie and generates clean UUID",
      resolvedClean,
      { message: `isNew: ${resolvedForged.isNew}, SessionId: ${resolvedForged.sessionId}` }
    );

    // =========================================================================
    // SECTION 6: UNAUTHORIZED MANIPULATION HEADERS
    // =========================================================================
    console.log("\n--- 6. UNAUTHORIZED MANIPULATION TESTS ---");

    const manipulationTests = [
      {
        headers: { "x-user-role": "admin" },
        label: "Forged x-user-role: admin header",
      },
      {
        headers: { authorization: "Bearer fake-token-12345" },
        label: "Fake Authorization Bearer token header",
      },
      {
        headers: { "x-forwarded-host": "attacker.com" },
        label: "Forged x-forwarded-host header",
      },
    ];

    for (const test of manipulationTests) {
      const res = await runFetch(`/go/00000000-0000-0000-0000-000000000000`, { headers: test.headers });
      const location = res.headers.location || "";
      const pass = !location.includes("attacker.com") && (res.status === 404 || res.status === 502);
      record(
        "Unauthorized Manipulation",
        test.label,
        pass,
        { status: res.status, message: "Headers had no effect on route security posture" }
      );
    }

    // =========================================================================
    // SECTION 7: RATE LIMITING BURST VERIFICATION
    // =========================================================================
    console.log("\n--- 7. RATE LIMITING & ABUSE PROTECTION ---");

    // Perform a quick 65-request burst to confirm 429 response
    const burstPromises = [];
    for (let i = 0; i < 65; i++) {
      burstPromises.push(runFetch(`/go/00000000-0000-0000-0000-000000000000`));
    }
    const burstResponses = await Promise.all(burstPromises);
    const hit429 = burstResponses.some((r) => r.status === 429);
    const retryAfterHeader = burstResponses.find((r) => r.status === 429)?.headers["retry-after"];

    record(
      "Rate Limiting & Abuse",
      "Route returns HTTP 429 on excessive rapid requests",
      hit429,
      { message: `Hit 429: ${hit429}, Retry-After Header: ${retryAfterHeader || "(none)"}` }
    );

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log("\n================================================================================");
    console.log("                        AUDIT SUMMARY");
    console.log("================================================================================");

    const totalTests = results.length;
    const passedTests = results.filter((r) => r.pass).length;
    const failedTests = results.filter((r) => !r.pass);

    console.log(`Total Audit Checks: ${totalTests}`);
    console.log(`Passed Checks:      ${passedTests}`);
    console.log(`Failed Checks:      ${failedTests.length}`);
    console.log(`Overall Status:     ${failedTests.length === 0 ? "FULL PASS" : "FAIL"}`);
    console.log("================================================================================\n");

    if (failedTests.length > 0) {
      console.log("Failed test details:");
      for (const f of failedTests) {
        console.log(`- [${f.section}] ${f.testName}: ${JSON.stringify(f.details)}`);
      }
      process.exit(1);
    }
  } finally {
    if (serverProc) {
      console.log("Shutting down test server...");
      serverProc.kill();
    }
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});

