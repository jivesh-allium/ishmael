/**
 * Playwright E2E screenshot test for Pequod whale explorer.
 *
 * Takes screenshots at different lookback periods to verify:
 * 1. Transfer lines render correctly (not converging to bottom-left)
 * 2. More lines appear with longer lookback windows
 * 3. Horizontal scroll is properly clamped
 *
 * Run: npx playwright test tests/e2e_screenshots.mjs
 * Or:  node tests/e2e_screenshots.mjs
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, "..", "screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE_URL = "http://localhost:5173";
const WAIT_FOR_RENDER = 5000; // ms to let PixiJS render + history fetch settle
const WAIT_FOR_HISTORY = 8000; // extra wait for history API calls

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // Collect console logs for debugging
  const consoleLogs = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.text().includes("history")) {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  // Intercept network requests to count history API calls
  const historyRequests = [];
  page.on("response", (resp) => {
    if (resp.url().includes("/api/whales")) {
      historyRequests.push({
        url: resp.url(),
        status: resp.status(),
      });
    }
  });

  console.log("1. Loading Pequod...");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(WAIT_FOR_RENDER);

  // Screenshot 1: Default state (All time)
  await page.screenshot({
    path: join(SCREENSHOT_DIR, "01-default-all-time.png"),
    fullPage: false,
  });
  console.log("   Screenshot: 01-default-all-time.png");

  // Count visible transfer lines (approximate via DOM/PixiJS)
  const initialAlertCount = await page.evaluate(() => {
    const feed = document.querySelector('[class*="AlertFeed"]') ||
      document.querySelector(".absolute.top-0.right-0");
    // Count alert items in the feed sidebar
    const items = document.querySelectorAll('[class*="border-l-2"]');
    return items.length;
  });
  console.log(`   Alert feed items visible: ${initialAlertCount}`);

  // Screenshot 2: Click "4h" lookback
  console.log("\n2. Selecting 4h lookback...");
  const buttons = await page.$$("button");
  let clicked4h = false;
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text?.trim() === "4h") {
      await btn.click();
      clicked4h = true;
      break;
    }
  }
  console.log(`   Clicked 4h button: ${clicked4h}`);
  await page.waitForTimeout(WAIT_FOR_HISTORY);

  await page.screenshot({
    path: join(SCREENSHOT_DIR, "02-lookback-4h.png"),
    fullPage: false,
  });
  console.log("   Screenshot: 02-lookback-4h.png");

  const alertCount4h = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="border-l-2"]');
    return items.length;
  });
  console.log(`   Alert feed items at 4h: ${alertCount4h}`);

  // Screenshot 3: Click "24h" lookback
  console.log("\n3. Selecting 24h lookback...");
  let clicked24h = false;
  const buttons2 = await page.$$("button");
  for (const btn of buttons2) {
    const text = await btn.textContent();
    if (text?.trim() === "24h") {
      await btn.click();
      clicked24h = true;
      break;
    }
  }
  console.log(`   Clicked 24h button: ${clicked24h}`);
  await page.waitForTimeout(WAIT_FOR_HISTORY);

  await page.screenshot({
    path: join(SCREENSHOT_DIR, "03-lookback-24h.png"),
    fullPage: false,
  });
  console.log("   Screenshot: 03-lookback-24h.png");

  const alertCount24h = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="border-l-2"]');
    return items.length;
  });
  console.log(`   Alert feed items at 24h: ${alertCount24h}`);

  // Screenshot 4: Test horizontal scroll clamping
  console.log("\n4. Testing horizontal scroll clamping...");
  // Try to scroll way left — should be clamped
  const canvas = await page.$("canvas");
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) {
      // Simulate horizontal scroll (trackpad gesture)
      for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(-200, 0);
        await page.waitForTimeout(50);
      }
      await page.waitForTimeout(500);
    }
  }
  await page.screenshot({
    path: join(SCREENSHOT_DIR, "04-after-horizontal-scroll.png"),
    fullPage: false,
  });
  console.log("   Screenshot: 04-after-horizontal-scroll.png");

  // Screenshot 5: Switch back to "All" to verify it still works
  console.log("\n5. Selecting All (back to full view)...");
  const buttons3 = await page.$$("button");
  for (const btn of buttons3) {
    const text = await btn.textContent();
    if (text?.trim() === "All") {
      await btn.click();
      break;
    }
  }
  await page.waitForTimeout(WAIT_FOR_RENDER);

  await page.screenshot({
    path: join(SCREENSHOT_DIR, "05-back-to-all.png"),
    fullPage: false,
  });
  console.log("   Screenshot: 05-back-to-all.png");

  const alertCountAll = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="border-l-2"]');
    return items.length;
  });
  console.log(`   Alert feed items at All: ${alertCountAll}`);

  // Log API call summary
  console.log("\n--- API Request Summary ---");
  for (const req of historyRequests) {
    console.log(`   ${req.status} ${req.url}`);
  }

  // Print console errors
  if (consoleLogs.length > 0) {
    console.log("\n--- Console Logs ---");
    for (const log of consoleLogs) {
      console.log(`   ${log}`);
    }
  }

  // Summary
  console.log("\n--- Results Summary ---");
  console.log(`   Default (All): ${initialAlertCount} feed items`);
  console.log(`   4h lookback:   ${alertCount4h} feed items`);
  console.log(`   24h lookback:  ${alertCount24h} feed items`);
  console.log(`   Back to All:   ${alertCountAll} feed items`);
  console.log(`   History API calls: ${historyRequests.filter(r => r.url.includes("history")).length}`);

  if (alertCount24h > alertCount4h) {
    console.log("   ✓ 24h returned MORE alerts than 4h (historical fetch working)");
  } else if (alertCount24h === alertCount4h) {
    console.log("   ~ 24h returned SAME alerts as 4h (may need more time for historical data)");
  } else {
    console.log("   ✗ 24h returned FEWER alerts than 4h (possible issue)");
  }

  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}/`);

  await browser.close();
}

main().catch((err) => {
  console.error("Playwright test failed:", err);
  process.exit(1);
});
