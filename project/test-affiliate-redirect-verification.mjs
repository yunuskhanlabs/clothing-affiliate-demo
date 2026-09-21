import http from "node:http";
import { spawn } from "node:child_process";
import { isValidHttpUrl } from "./lib/security/url-validation.js";
import { resolveTrustedDestination, injectTrackingParam } from "./lib/affiliate/url.js";

const PORT = 3060;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      redirect: "manual",
      ...options,
    });
    const body = await res.text();
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      body,
    };
  } catch (err) {
    return {
      status: 0,
      headers: {},
      body: err.message,
    };
  }
}

function containsSecretPatterns(text) {
  if (!text) return false;
  const suspicious = [
    /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
    /postgresql:\/\//i,
    /postgres:\/\//i,
    /SUPABASE_SERVICE_ROLE_KEY/i,
    /STEP_UP_SECRET/i,
    /CRON_SECRET/i,
    /at\s+[a-zA-Z0-9_.]+\s+\(.*:\d+:\d+\)/,
  ];
  return suspicious.some((p) => p.test(text));
}

async function startServer() {
  console.log(`Starting Next.js production server on port ${PORT}...`);
  const proc = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
  });

  let serverErr = "";
  if (proc.stderr) {
    proc.stderr.on("data", (d) => {
      serverErr += d.toString();
    });
  }

  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    try {
      const res = await request("/api/health");
      if (res.status === 200) {
        console.log(`Production server is ready at ${BASE_URL}\n`);
        return proc;
      }
    } catch { }
  }

  proc.kill();
  throw new Error(`Server failed to start on port ${PORT}. Stderr: ${serverErr}`);
}

async function runVerification() {
  console.log("================================================================================");
  console.log("    AFFILIATE OFFER RESOLUTION & REDIRECT VERIFICATION SUITE");
  console.log("================================================================================\n");

  let serverProc = null;
  const results = [];

  function record(category, testName, passed, details = "") {
    const icon = passed ? "✓ PASS" : "✗ FAIL";
    console.log(`${icon} [${category}] ${testName} ${details ? "— " + details : ""}`);
    results.push({ category, testName, passed, details });
  }

  try {
    serverProc = await startServer();

    // 1. Valid Offer ID (Seed / Catalog item)
    const validRes = await request("/go/00000000-0000-0000-0000-000000000001");
    const validLocation = validRes.headers.location || "";
    const validPass = validRes.status === 302 &&
      validLocation.startsWith("https://") &&
      validLocation.includes("subid1=") &&
      validLocation.includes("tag=cloxtro-demo");

    record(
      "Valid Offer Resolution",
      "GET /go/{validOfferId} resolves to merchant URL with tracking injection",
      validPass,
      `Status: ${validRes.status}, Location: ${validLocation}`
    );

    // 2. Cache-Control and Security Headers on Redirect
    const cc = validRes.headers["cache-control"] || "";
    const pragma = validRes.headers["pragma"] || "";
    const xRobots = validRes.headers["x-robots-tag"] || "";
    const reqId = validRes.headers["x-request-id"] || "";
    const headersPass = cc.includes("no-store") &&
      cc.includes("no-cache") &&
      pragma === "no-cache" &&
      xRobots.includes("noindex") &&
      reqId.length > 0;

    record(
      "Response Headers",
      "302 redirect sets no-store, no-cache, X-Robots-Tag, and x-request-id",
      headersPass,
      `Cache-Control: "${cc}", Pragma: "${pragma}", X-Robots: "${xRobots}", reqId: "${reqId}"`
    );

    // 3. Malformed / Non-UUID offerId
    const malformedRes = await request("/go/not-a-valid-uuid");
    const malformedPass = malformedRes.status === 400 &&
      malformedRes.body.includes("This deal isn't available right now") &&
      !containsSecretPatterns(malformedRes.body);

    record(
      "Input Validation",
      "GET /go/not-a-valid-uuid returns 400 with safe generic HTML",
      malformedPass,
      `Status: ${malformedRes.status}`
    );

    // 4. SQL Injection payload in offerId
    const sqliRes = await request("/go/'%20OR%201=1%20--");
    const sqliPass = sqliRes.status === 400 &&
      sqliRes.body.includes("This deal isn't available right now") &&
      !containsSecretPatterns(sqliRes.body);

    record(
      "Input Validation",
      "GET /go/SQLi payload returns 400 with safe generic HTML",
      sqliPass,
      `Status: ${sqliRes.status}`
    );

    // 5. Path Traversal attempt in offerId
    const traversalRes = await request("/go/..%2F..%2Fadmin");
    const traversalPass = traversalRes.status === 400 &&
      traversalRes.body.includes("This deal isn't available right now") &&
      !containsSecretPatterns(traversalRes.body);

    record(
      "Input Validation",
      "GET /go/path-traversal returns 400 with safe generic HTML",
      traversalPass,
      `Status: ${traversalRes.status}`
    );

    // 6. Oversized offerId (> 100 chars)
    const oversizedRes = await request(`/go/${"a".repeat(200)}`);
    const oversizedPass = oversizedRes.status === 400 &&
      oversizedRes.body.includes("This deal isn't available right now") &&
      !containsSecretPatterns(oversizedRes.body);

    record(
      "Input Validation",
      "GET /go/oversized-id returns 400 with safe generic HTML",
      oversizedPass,
      `Status: ${oversizedRes.status}`
    );

    // 7. Non-existent UUID offer (404)
    const notFoundRes = await request("/go/00000000-0000-0000-0000-000000000000");
    const notFoundPass = notFoundRes.status === 404 &&
      notFoundRes.body.includes("This deal isn't available right now") &&
      !containsSecretPatterns(notFoundRes.body);

    record(
      "Offer Lookup",
      "GET /go/non-existent-uuid returns 404 with safe generic HTML",
      notFoundPass,
      `Status: ${notFoundRes.status}`
    );

    // 8. Open Redirect Query Parameter Injection Defense
    const openRedirectAttempts = [
      "?url=https://evil.example.com",
      "?redirect=https://evil.example.com",
      "?next=https://evil.example.com",
      "?dest=//evil.example.com",
      "?url=javascript:alert(1)",
      "?url=data:text/html,evil",
    ];

    let openRedirectBlockedAll = true;
    for (const query of openRedirectAttempts) {
      const res = await request(`/go/00000000-0000-0000-0000-000000000001${query}`);
      const loc = res.headers.location || "";
      if (loc.includes("evil.example") || loc.startsWith("//evil") || loc.startsWith("javascript:") || loc.startsWith("data:")) {
        openRedirectBlockedAll = false;
      }
    }

    record(
      "Security",
      "Open Redirect query parameters (?url=, ?redirect=, ?next=) completely ignored",
      openRedirectBlockedAll,
      `All ${openRedirectAttempts.length} malicious query vectors safely ignored`
    );

    // 9. SSRF and Private Host Protection unit checks
    const privateTargets = [
      "http://localhost:8080/admin",
      "http://127.0.0.1:3000/secret",
      "http://169.254.169.254/latest/meta-data",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://10.0.0.1/admin",
      "http://192.168.1.1/admin",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
    ];

    let ssrfBlockedAll = true;
    for (const target of privateTargets) {
      if (isValidHttpUrl(target, { blockPrivate: true })) {
        ssrfBlockedAll = false;
      }
    }

    record(
      "SSRF Defense",
      "Private subnets, cloud metadata IPs, and pseudoprotocols rejected by URL validator",
      ssrfBlockedAll,
      `Examined ${privateTargets.length} private/dangerous targets, all blocked`
    );

    // 10. ClickID injection preserves existing params
    const testUrl = "https://amazon.in/dp/sample-item?tag=partner-tag&campaign=summer";
    const injected = injectTrackingParam(testUrl, "subid1", "12345678-1234-1234-1234-123456789abc");
    const parsed = new URL(injected);
    const trackingPass = parsed.searchParams.get("subid1") === "12345678-1234-1234-1234-123456789abc" &&
      parsed.searchParams.get("tag") === "partner-tag" &&
      parsed.searchParams.get("campaign") === "summer";

    record(
      "Tracking Injection",
      "injectTrackingParam sets configured tracking parameter and preserves existing query",
      trackingPass,
      `Injected URL: ${injected}`
    );

    console.log("\n================================================================================");
    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;
    console.log(`SUMMARY: ${passedCount} / ${totalCount} TESTS PASSED`);
    console.log("================================================================================\n");

    if (passedCount !== totalCount) {
      process.exit(1);
    }
  } finally {
    if (serverProc) {
      console.log("Stopping test server...");
      serverProc.kill();
    }
  }
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
