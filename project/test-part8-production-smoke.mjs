import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PORT = 3050;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runFetch(reqPath, options = {}) {
    const url = `${BASE_URL}${reqPath}`;
    try {
        const res = await fetch(url, {
            redirect: "manual",
            ...options,
        });
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
    } catch (err) {
        return {
            status: 0,
            headers: {},
            text: err.message,
            json: null,
            error: err,
        };
    }
}

function containsSecretsOrStack(text) {
    if (!text) return false;
    const patterns = [
        /SUPABASE_SERVICE_ROLE_KEY/i,
        /STEP_UP_SECRET/i,
        /CRON_SECRET/i,
        /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/, // JWT
        /postgresql:\/\//i,
        /postgres:\/\//i,
        /at\s+[a-zA-Z0-9_.]+\s+\(.*:\d+:\d+\)/, // Node stack trace
    ];
    return patterns.some((p) => p.test(text));
}

let serverProcess = null;

async function startServer() {
    console.log(`Starting Next.js production server on port ${PORT}...`);
    serverProcess = spawn("npx", ["next", "start", "-p", String(PORT)], {
        cwd: process.cwd(),
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "production", PORT: String(PORT) },
    });

    let ready = false;
    for (let i = 0; i < 40; i++) {
        await sleep(1000);
        const res = await runFetch("/api/health");
        if (res.status === 200) {
            ready = true;
            break;
        }
    }

    if (!ready) {
        if (serverProcess) serverProcess.kill();
        throw new Error(`Server failed to start on port ${PORT}`);
    }
    console.log(`Production server ready at ${BASE_URL}\n`);
}

function stopServer() {
    if (serverProcess) {
        console.log("\nStopping production server...");
        serverProcess.kill();
        serverProcess = null;
    }
}

async function runSmokeSuite() {
    const results = {
        customerWebsite: [],
        authentication: [],
        adminIsolation: [],
        apis: [],
        affiliateRedirects: [],
        webhookSecurity: [],
        corsAndSecurityHeaders: [],
        errorResilience: [],
        finalHealth: [],
    };

    try {
        await startServer();

        // --------------------------------------------------
        // STEP 4: CUSTOMER WEBSITE SMOKE TEST
        // --------------------------------------------------
        console.log("--- STEP 4: CUSTOMER WEBSITE SMOKE TEST ---");
        const customerRoutes = [
            { route: "/", keyword: "cloxtro" },
            { route: "/products", keyword: "products" },
            { route: "/product/essential-crew-tee", keyword: "essential crew tee" },
            { route: "/categories", keyword: "categories" },
            { route: "/search?q=dress", keyword: "search" },
            { route: "/deals", keyword: "deals" },
            { route: "/wishlist", keyword: "wishlist" },
            { route: "/login", keyword: "sign" },
            { route: "/signup", keyword: "account" },
            { route: "/forgot-password", keyword: "password" },
        ];

        for (const item of customerRoutes) {
            const res = await runFetch(item.route);
            const is200 = res.status === 200;
            const noCrash = res.status !== 500 && res.status !== 0;
            const lowerText = res.text.toLowerCase();
            const contentCheck = item.keyword ? lowerText.includes(item.keyword.toLowerCase()) : true;
            const pass = is200 && noCrash && contentCheck;

            results.customerWebsite.push({
                route: item.route,
                status: res.status,
                hasContent: contentCheck,
                noCrash,
                pass,
                result: pass ? "PASS" : `FAIL (status=${res.status}, hasContent=${contentCheck})`,
            });
            console.log(`[Customer Route] ${item.route} -> Status: ${res.status} (${pass ? "PASS" : "FAIL"})`);
        }

        // --------------------------------------------------
        // STEP 5: AUTHENTICATION & PROTECTED ROUTES / ADMIN ISOLATION
        // --------------------------------------------------
        console.log("\n--- STEP 5: AUTHENTICATION & PROTECTED ROUTES ---");

        // /admin page redirect check
        const adminPage = await runFetch("/admin");
        const adminRedirectedOrBlocked =
            [302, 303, 307, 308].includes(adminPage.status) ||
            [401, 403].includes(adminPage.status) ||
            (adminPage.status === 200 && (adminPage.text.toLowerCase().includes("login") || adminPage.text.toLowerCase().includes("sign in")));
        results.adminIsolation.push({
            test: "Unauthenticated /admin page access",
            expected: "Redirect to login or 401/403",
            actual: `Status ${adminPage.status} (Location: ${adminPage.headers.location || "N/A"})`,
            status: adminRedirectedOrBlocked ? "PASS" : "FAIL",
        });

        // /api/profile rejection check
        const profileApi = await runFetch("/api/profile");
        const profileRejected = [401, 403].includes(profileApi.status);
        results.authentication.push({
            test: "Unauthenticated /api/profile access",
            expected: "401 or 403",
            actual: `Status ${profileApi.status}`,
            status: profileRejected ? "PASS" : "FAIL",
        });

        // /api/admin/dashboard rejection check
        const adminDashApi = await runFetch("/api/admin/dashboard");
        const adminDashRejected = [401, 403].includes(adminDashApi.status);
        results.adminIsolation.push({
            test: "Unauthenticated /api/admin/dashboard access",
            expected: "401 or 403",
            actual: `Status ${adminDashApi.status}`,
            status: adminDashRejected ? "PASS" : "FAIL",
        });

        // Forged x-user-role: admin header check on /admin
        const forgedRoleAdminPage = await runFetch("/admin", {
            headers: { "x-user-role": "admin" },
        });
        const forgedRoleBlocked =
            [302, 303, 307, 308].includes(forgedRoleAdminPage.status) ||
            [401, 403].includes(forgedRoleAdminPage.status) ||
            !forgedRoleAdminPage.text.includes("Admin Overview");
        results.adminIsolation.push({
            test: "Forged 'x-user-role: admin' header on /admin",
            expected: "Access denied / Redirect",
            actual: `Status ${forgedRoleAdminPage.status}`,
            status: forgedRoleBlocked ? "PASS" : "FAIL",
        });

        // Forged x-user-role: admin header check on /api/admin/dashboard
        const forgedRoleAdminApi = await runFetch("/api/admin/dashboard", {
            headers: { "x-user-role": "admin" },
        });
        const forgedRoleApiBlocked = [401, 403].includes(forgedRoleAdminApi.status);
        results.adminIsolation.push({
            test: "Forged 'x-user-role: admin' header on /api/admin/dashboard",
            expected: "401 or 403",
            actual: `Status ${forgedRoleAdminApi.status}`,
            status: forgedRoleApiBlocked ? "PASS" : "FAIL",
        });

        // Invalid bearer token check
        const invalidTokenApi = await runFetch("/api/profile", {
            headers: { Authorization: "Bearer fake-invalid-jwt-token" },
        });
        const invalidTokenRejected = [401, 403].includes(invalidTokenApi.status);
        results.authentication.push({
            test: "Invalid Bearer Token on /api/profile",
            expected: "401 or 403",
            actual: `Status ${invalidTokenApi.status}`,
            status: invalidTokenRejected ? "PASS" : "FAIL",
        });

        // --------------------------------------------------
        // STEP 6: CRITICAL API SMOKE TEST
        // --------------------------------------------------
        console.log("\n--- STEP 6: CRITICAL API SMOKE TEST ---");
        const apiEndpoints = [
            { path: "/api/products", expectedStatus: 200 },
            { path: "/api/facets", expectedStatus: 200 },
            { path: "/api/health", expectedStatus: 200 },
            { path: "/api/health/ready", expectedStatus: 200 },
            { path: "/api/cron/automation", expectedStatus: 401 }, // without secret
            { path: "/api/admin/products", expectedStatus: 401 }, // protected admin API
        ];

        for (const item of apiEndpoints) {
            const res = await runFetch(item.path);
            const isExpectedStatus =
                res.status === item.expectedStatus || (item.expectedStatus === 401 && res.status === 403);
            const hasNoSecrets = !containsSecretsOrStack(res.text);
            const validJson = res.json !== null || res.status !== 200;
            const pass = isExpectedStatus && hasNoSecrets && validJson;

            results.apis.push({
                endpoint: item.path,
                expected: String(item.expectedStatus),
                actual: String(res.status),
                status: pass ? "PASS" : "FAIL",
            });
            console.log(`[API Endpoint] ${item.path} -> Expected: ${item.expectedStatus}, Got: ${res.status} (${pass ? "PASS" : "FAIL"})`);
        }

        // --------------------------------------------------
        // STEP 7: AFFILIATE & REDIRECT SMOKE TEST
        // --------------------------------------------------
        console.log("\n--- STEP 7: AFFILIATE & REDIRECT SMOKE TEST ---");

        // 1. Malformed /go/[offerId]
        const malformedGo = await runFetch("/go/not-a-valid-uuid");
        const malformedGoSafe =
            [400, 404].includes(malformedGo.status) ||
            ([302, 303, 307, 308].includes(malformedGo.status) &&
                !malformedGo.headers.location?.startsWith("http"));
        results.affiliateRedirects.push({
            test: "Malformed offer ID (/go/not-a-valid-uuid)",
            expected: "400/404 or Safe internal redirect",
            actual: `Status ${malformedGo.status} (Location: ${malformedGo.headers.location || "None"})`,
            status: malformedGoSafe ? "PASS" : "FAIL",
        });

        // 2. Non-existent UUID offer
        const nonExistentGo = await runFetch("/go/00000000-0000-0000-0000-000000000000");
        const nonExistentGoSafe =
            [400, 404].includes(nonExistentGo.status) ||
            ([302, 303, 307, 308].includes(nonExistentGo.status) &&
                !nonExistentGo.headers.location?.startsWith("http"));
        results.affiliateRedirects.push({
            test: "Non-existent UUID offer (/go/00000000-0000-0000-0000-000000000000)",
            expected: "404 or Safe internal redirect",
            actual: `Status ${nonExistentGo.status} (Location: ${nonExistentGo.headers.location || "None"})`,
            status: nonExistentGoSafe ? "PASS" : "FAIL",
        });

        // 3. Auth callback with external attacker URL
        const openRedirectAuth = await runFetch("/auth/callback?next=https://attacker.com");
        const loc = openRedirectAuth.headers.location || "";
        const openRedirectPrevented = !loc.startsWith("https://attacker.com") && !loc.startsWith("//attacker.com");
        results.affiliateRedirects.push({
            test: "Auth callback open redirect (/auth/callback?next=https://attacker.com)",
            expected: "No external redirect to attacker.com (Safe internal fallback)",
            actual: `Status ${openRedirectAuth.status} (Location: ${loc || "None"})`,
            status: openRedirectPrevented ? "PASS" : "FAIL",
        });

        // --------------------------------------------------
        // STEP 8: WEBHOOK & SECURITY SMOKE TEST / CORS & HEADERS
        // --------------------------------------------------
        console.log("\n--- STEP 8: WEBHOOK & SECURITY SMOKE TEST ---");

        // Invalid webhook signature
        const invalidWebhook = await runFetch("/api/webhooks/affiliate/cj", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Webhook-Signature": "invalid_sig_123",
            },
            body: JSON.stringify({ event: "test" }),
        });
        const webhookRejected = [400, 401, 403, 404, 405].includes(invalidWebhook.status);
        results.webhookSecurity.push({
            test: "Invalid signature POST /api/webhooks/affiliate/cj",
            expected: "Rejection (400/401/403/404)",
            actual: `Status ${invalidWebhook.status}`,
            status: webhookRejected ? "PASS" : "FAIL",
        });

        // Response Security Headers Check on representative page
        const samplePage = await runFetch("/");
        const headers = samplePage.headers;
        const csp = headers["content-security-policy"];
        const xfo = headers["x-frame-options"];
        const xcto = headers["x-content-type-options"];
        const refPol = headers["referrer-policy"];
        const permPol = headers["permissions-policy"];

        const headersValid = Boolean(csp && xfo && xcto && refPol && permPol);

        // CORS Attacker Origin check
        const corsRes = await runFetch("/api/products", {
            headers: { Origin: "https://evil-attacker.com" },
        });
        const acao = corsRes.headers["access-control-allow-origin"];
        const acac = corsRes.headers["access-control-allow-credentials"];
        const safeCors =
            acao !== "*" && acao !== "https://evil-attacker.com" && !(acac === "true" && acao === "https://evil-attacker.com");

        results.corsAndSecurityHeaders.push({
            csp: csp ? "PRESENT" : "MISSING",
            xfo: xfo ? "PRESENT" : "MISSING",
            xcto: xcto ? "PRESENT" : "MISSING",
            refPol: refPol ? "PRESENT" : "MISSING",
            permPol: permPol ? "PRESENT" : "MISSING",
            attackerCorsResult: safeCors ? "SAFE (Refused or No Attacker Origin Reflection)" : `UNSAFE (acao=${acao})`,
            status: headersValid && safeCors ? "PASS" : "FAIL",
        });

        // --------------------------------------------------
        // STEP 9: ERROR RESILIENCE
        // --------------------------------------------------
        console.log("\n--- STEP 9: ERROR RESILIENCE ---");
        const errorTests = [
            { name: "Invalid admin product ID", path: "/api/admin/products/invalid-id-xyz!" },
            { name: "Missing product detail page", path: "/product/non-existent-product-slug-9999" },
            { name: "Malformed query parameter", path: "/api/products?limit=-999&page=abc&sort=invalid_sort!" },
        ];

        for (const testItem of errorTests) {
            const res = await runFetch(testItem.path);
            const no500 = res.status !== 500;
            const noSecrets = !containsSecretsOrStack(res.text);
            const pass = no500 && noSecrets;

            results.errorResilience.push({
                test: testItem.name,
                path: testItem.path,
                status: res.status,
                pass,
                result: pass ? "PASS" : `FAIL (status=${res.status}, exposesSecrets=${!noSecrets})`,
            });
            console.log(`[Error Resilience] ${testItem.name} (${testItem.path}) -> Status: ${res.status} (${pass ? "PASS" : "FAIL"})`);
        }

        // --------------------------------------------------
        // STEP 10: FINAL SERVER HEALTH CHECK
        // --------------------------------------------------
        console.log("\n--- STEP 10: FINAL HEALTH CHECK ---");
        const finalHealth = await runFetch("/api/health");
        const finalReady = await runFetch("/api/health/ready");

        const healthOk = finalHealth.status === 200;
        const readyOk = finalReady.status === 200;

        results.finalHealth.push({
            endpoint: "/api/health",
            result: healthOk ? "PASS (200 OK)" : `FAIL (${finalHealth.status})`,
        });
        results.finalHealth.push({
            endpoint: "/api/health/ready",
            result: readyOk ? "PASS (200 OK)" : `FAIL (${finalReady.status})`,
        });

        console.log(`\nFinal Health Check: /api/health=${finalHealth.status}, /api/health/ready=${finalReady.status}`);

        return results;
    } finally {
        stopServer();
    }
}

runSmokeSuite()
    .then((res) => {
        console.log("\n==================================================");
        console.log("SMOKE TEST COMPLETE - FULL JSON SUMMARY:");
        console.log("==================================================");
        console.log(JSON.stringify(res, null, 2));
    })
    .catch((err) => {
        console.error("FATAL ERROR IN SMOKE SUITE:", err);
        stopServer();
        process.exit(1);
    });

