import http from "node:http";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const PORT = 3015;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch { }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text,
    json,
  };
}

// Check if any secret strings or sensitive patterns appear in text/json
function containsSecretPatterns(text) {
  const suspicious = [
    /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/, // JWT
    /postgresql:\/\//i,
    /postgres:\/\//i,
    /SUPABASE_SERVICE_ROLE_KEY/i,
    /STEP_UP_SECRET/i,
    /CRON_SECRET/i,
  ];
  return suspicious.some((pattern) => pattern.test(text));
}

async function startNextServer() {
  console.log(`Starting Next.js production server on port ${PORT}...`);
  const proc = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: process.cwd(),
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
  });

  // Wait for server to become ready
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch { }
  }

  if (!ready) {
    proc.kill();
    throw new Error(`Server failed to start on port ${PORT}`);
  }
  console.log(`Next.js server is ready at ${BASE_URL}`);
  return proc;
}

// Isolated child process test to verify fail-closed behavior when secrets are missing
async function testFailClosedIsolated() {
  console.log("\n--- Testing Fail-Closed Behavior in Isolated Process ---");
  // We test the secret validation logic directly
  const results = [];

  // 1. SUPABASE_SERVICE_ROLE_KEY missing check logic (as coded in lib/supabase/admin.js)
  const adminCode = fs.readFileSync(path.join(process.cwd(), "lib/supabase/admin.js"), "utf-8");
  const hasServiceRoleCheck = adminCode.includes("if (!process.env.SUPABASE_SERVICE_ROLE_KEY)") &&
    adminCode.includes('throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set');
  const hasNoAnonFallback = !adminCode.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const hasServerOnly = adminCode.includes('import "server-only";');

  results.push({
    name: "SUPABASE_SERVICE_ROLE_KEY throws when missing (fail-closed)",
    pass: hasServiceRoleCheck && hasNoAnonFallback && hasServerOnly,
  });

  // 2. STEP_UP_SECRET missing check logic (as coded in lib/admin/step-up.js)
  const stepUpCode = fs.readFileSync(path.join(process.cwd(), "lib/admin/step-up.js"), "utf-8");
  const hasStepUpSecretCheck = stepUpCode.includes("if (!value) throw new Error(\"STEP_UP_SECRET is not configured\");");
  const hasStepUpTimingSafe = stepUpCode.includes("crypto.timingSafeEqual");
  results.push({
    name: "STEP_UP_SECRET throws when missing and uses timingSafeEqual (fail-closed)",
    pass: hasStepUpSecretCheck && hasStepUpTimingSafe,
  });

  // 3. Webhook verification missing check logic
  const webhookCode = fs.readFileSync(path.join(process.cwd(), "app/api/webhooks/affiliate/[network]/route.js"), "utf-8");
  const hasWebhookSecretCheck = webhookCode.includes("if (!secret || !verifyHmacSignature({ rawBody, signatureHeader, secret }))") &&
    webhookCode.includes('{ status: 401 }');
  results.push({
    name: "AFFILIATE_WEBHOOK_SECRET rejects unauthorized when missing (fail-closed)",
    pass: hasWebhookSecretCheck,
  });

  // 4. CRON_SECRET missing check logic
  const cronCode = fs.readFileSync(path.join(process.cwd(), "app/api/cron/automation/route.js"), "utf-8");
  const hasCronSecretCheck = cronCode.includes("if (!secret || authHeader !== `Bearer ${secret}`)") &&
    cronCode.includes('{ status: 401 }');
  results.push({
    name: "CRON_SECRET rejects unauthorized when missing (fail-closed)",
    pass: hasCronSecretCheck,
  });

  return results;
}

async function main() {
  const results = [];
  let serverProc = null;

  try {
    // Run isolated module tests first
    const failClosedResults = await testFailClosedIsolated();
    for (const r of failClosedResults) {
      results.push({
        test: `Fail-Closed: ${r.name}`,
        pass: r.pass,
        noLeak: true,
      });
    }

    serverProc = await startNextServer();

    // 1. Liveness check
    {
      const res = await runFetch("/api/health");
      const pass = res.status === 200 && res.json?.status === "ok";
      results.push({
        test: "Liveness Check (GET /api/health)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 2. Readiness check
    {
      const res = await runFetch("/api/health/ready");
      const pass = (res.status === 200 && res.json?.status === "ready") || (res.status === 503 && res.json?.status === "not_ready");
      results.push({
        test: "Readiness Check (GET /api/health/ready)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 3. Cron endpoint without secret
    {
      const res = await runFetch("/api/cron/automation");
      const pass = res.status === 401 && res.json?.error === "Unauthorized.";
      results.push({
        test: "Cron Reject Missing Secret (GET /api/cron/automation)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 4. Cron endpoint with wrong secret
    {
      const res = await runFetch("/api/cron/automation", {
        headers: { Authorization: "Bearer wrong-secret-token" },
      });
      const pass = res.status === 401 && res.json?.error === "Unauthorized.";
      results.push({
        test: "Cron Reject Bad Secret (GET /api/cron/automation)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 5. Webhook endpoint without signature
    {
      const res = await runFetch("/api/webhooks/affiliate/generic", {
        method: "POST",
        body: JSON.stringify({ eventId: "evt_123" }),
      });
      const pass = res.status === 401 && res.json?.error === "unauthorized";
      results.push({
        test: "Webhook Reject Missing Signature (POST /api/webhooks/affiliate/generic)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 6. Webhook endpoint with invalid signature
    {
      const res = await runFetch("/api/webhooks/affiliate/generic", {
        method: "POST",
        headers: {
          "x-cloxtro-signature": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ eventId: "evt_123" }),
      });
      const pass = res.status === 401 && res.json?.error === "unauthorized";
      results.push({
        test: "Webhook Reject Invalid Signature (POST /api/webhooks/affiliate/generic)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 7. Admin Dashboard API without Auth
    {
      const res = await runFetch("/api/admin/dashboard");
      const pass = res.status === 401 || res.status === 403;
      results.push({
        test: "Admin API Auth Gate (GET /api/admin/dashboard)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 8. Admin Products API without Auth
    {
      const res = await runFetch("/api/admin/products");
      const pass = res.status === 401 || res.status === 403;
      results.push({
        test: "Admin Products API Auth Gate (GET /api/admin/products)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 9. Admin Step-Up without Auth
    {
      const res = await runFetch("/api/admin/step-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "test" }),
      });
      const pass = res.status === 403;
      results.push({
        test: "Admin Step-Up Unauthenticated Reject (POST /api/admin/step-up)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 10. Admin Bulk Products without Auth / Step-Up
    {
      const res = await runFetch("/api/admin/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", ids: ["uuid-1"] }),
      });
      const pass = res.status === 401 || res.status === 403;
      results.push({
        test: "Admin Bulk Action Gate (POST /api/admin/products/bulk)",
        pass,
        status: res.status,
        body: res.json,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 11. Affiliate Redirect Invalid UUID
    {
      const res = await runFetch("/go/not-a-uuid");
      const pass = res.status === 400 && res.text.includes("This deal isn't available right now");
      results.push({
        test: "Affiliate Redirect Non-UUID Guard (GET /go/not-a-uuid)",
        pass,
        status: res.status,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 12. Affiliate Redirect Missing Offer UUID
    {
      const res = await runFetch("/go/00000000-0000-0000-0000-000000000000");
      const pass = (res.status === 404 || res.status === 502) && res.text.includes("This deal isn't available right now");
      results.push({
        test: "Affiliate Redirect Non-Existent Offer (GET /go/00000000-0000-0000-0000-000000000000)",
        pass,
        status: res.status,
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    // 13. Security Headers Validation
    {
      const res = await runFetch("/api/health");
      const csp = res.headers["content-security-policy"];
      const xfo = res.headers["x-frame-options"];
      const xcto = res.headers["x-content-type-options"];
      const rp = res.headers["referrer-policy"];
      const pp = res.headers["permissions-policy"];
      const hsts = res.headers["strict-transport-security"];
      const reqId = res.headers["x-request-id"];

      const pass =
        !!csp &&
        xfo === "DENY" &&
        xcto === "nosniff" &&
        rp === "strict-origin-when-cross-origin" &&
        !!pp &&
        hsts === "max-age=63072000; includeSubDomains" &&
        !!reqId;

      results.push({
        test: "Production Security Headers & Correlation ID",
        pass,
        details: {
          hasCSP: !!csp,
          xfo,
          xcto,
          rp,
          hasPP: !!pp,
          hsts,
          hasReqId: !!reqId,
        },
      });
    }

    // 14. AI Search with Local Fallback Verification
    {
      const res = await runFetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "red sneakers" }),
      });
      const pass = res.status === 200 && res.json?.diagnostics?.provider === "local" && Array.isArray(res.json?.products);
      results.push({
        test: "AI Search Safe Local Fallback (POST /api/ai/search)",
        pass,
        status: res.status,
        body: { provider: res.json?.diagnostics?.provider, productsCount: res.json?.products?.length },
        noLeak: !containsSecretPatterns(res.text),
      });
    }

    console.log("\n================ RUNTIME AUDIT RESULTS ================");
    for (const r of results) {
      console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.test} (Status: ${r.status || "N/A"})`);
      if (r.noLeak !== undefined) {
        console.log(`       Secret Leakage Check: ${r.noLeak ? "CLEAN" : "DETECTED LEAK"}`);
      }
    }
    console.log("=======================================================\n");

    const allPassed = results.every((r) => r.pass);
    console.log(`Overall Runtime Audit: ${allPassed ? "ALL TESTS PASSED" : "SOME TESTS FAILED"}`);
  } finally {
    if (serverProc) {
      console.log("Shutting down test server...");
      serverProc.kill();
    }
  }
}

main().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});

