import { chromium } from "playwright";

const BASE = "http://localhost:3333";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const failedRequests = [];
  const consoleErrors = [];

  page.on("requestfailed", (req) => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  page.on("response", (res) => {
    if (res.status() >= 400) {
      failedRequests.push({ url: res.url(), status: res.status() });
    }
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  console.log("1. Navigating to Home...");
  await page.goto(BASE, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1000);

  console.log("2. Navigating Home -> Men...");
  await page.goto(`${BASE}/men`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1000);
  const menText = await page.textContent("body");
  const menHasError = menText.includes("Something went wrong");

  console.log("3. Navigating Men -> Women...");
  await page.goto(`${BASE}/women`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1000);
  const womenText = await page.textContent("body");
  const womenHasError = womenText.includes("Something went wrong");

  console.log("4. Navigating Women -> Kids...");
  await page.goto(`${BASE}/kids`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1000);
  const kidsText = await page.textContent("body");
  const kidsHasError = kidsText.includes("Something went wrong");

  console.log("5. Direct refresh /men...");
  await page.goto(`${BASE}/men`, { waitUntil: "load", timeout: 30000 });
  await page.reload({ waitUntil: "load" });

  console.log("6. Direct refresh /kids...");
  await page.goto(`${BASE}/kids`, { waitUntil: "load", timeout: 30000 });
  await page.reload({ waitUntil: "load" });

  await browser.close();

  const chunk404s = failedRequests.filter((r) => r.url.includes("/_next/static/chunks/"));

  console.log("\n=== VERIFICATION RESULTS ===");
  console.log("Men page has 'Something went wrong':", menHasError ? "YES ❌" : "NO ✅");
  console.log("Women page has 'Something went wrong':", womenHasError ? "YES ❌" : "NO ✅");
  console.log("Kids page has 'Something went wrong':", kidsHasError ? "YES ❌" : "NO ✅");
  console.log("Chunk 404 requests count:", chunk404s.length);
  if (chunk404s.length > 0) {
    console.log("Chunk 404 details:", chunk404s);
  }
  console.log("Console errors count:", consoleErrors.length);
  if (consoleErrors.length > 0) {
    console.log("Console errors:", consoleErrors);
  }
}

run().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
