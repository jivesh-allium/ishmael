/**
 * Playwright E2E mobile test for Pequod whale explorer.
 *
 * Runs at iPhone-sized viewports (375px, 390px) to verify:
 * 1. Map is full-screen (no sidebars eating into it)
 * 2. AlertFeed sidebar is hidden; floating "Ship's Log" button appears
 * 3. Tapping the button opens full-screen feed overlay
 * 4. Tapping an alert in the feed closes it and opens a bottom-sheet detail panel
 * 5. WalletInspector fits within screen bounds
 * 6. Bottom panel (PriceChart/ExchangeFlow) is hidden
 * 7. Compass minimap is hidden
 * 8. CrowsNest stats bar is hidden
 * 9. ShipsClock shows compact presets (4 buttons not 8)
 * 10. Leaderboard / Spyglass overlays fit on screen
 *
 * Run: node tests/e2e_mobile.mjs
 * Prereq: frontend dev server running on http://localhost:5173
 */

import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = join(__dirname, "..", "screenshots", "mobile");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE_URL = "http://localhost:5173";
const WAIT_FOR_RENDER = 5000;

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`   PASS  ${label}`);
    passed++;
  } else {
    console.log(`   FAIL  ${label}`);
    failed++;
  }
}

async function runMobileTests(viewport, label) {
  console.log(`\n========================================`);
  console.log(`  Mobile test: ${label} (${viewport.width}x${viewport.height})`);
  console.log(`========================================\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  // -------------------------------------------
  // 1. Load the page
  // -------------------------------------------
  console.log("1. Loading Pequod at mobile viewport...");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(WAIT_FOR_RENDER);

  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${label}-01-initial.png`),
  });
  console.log(`   Screenshot: ${label}-01-initial.png`);

  // -------------------------------------------
  // 2. Verify sidebar is NOT visible (no w-72 right panel in DOM layout)
  // -------------------------------------------
  console.log("\n2. Checking AlertFeed sidebar is hidden...");
  const rightSidebar = await page.evaluate(() => {
    // The desktop AlertFeed has class "absolute right-0 top-0 bottom-0 w-72"
    // On mobile it should not exist in DOM (conditional render)
    const el = document.querySelector(".absolute.right-0.top-0.bottom-0.w-72");
    return el ? { visible: true, width: el.offsetWidth } : { visible: false };
  });
  assert(!rightSidebar.visible, "AlertFeed sidebar not rendered on mobile");

  // -------------------------------------------
  // 3. Verify floating "Ship's Log" button exists
  // -------------------------------------------
  console.log("\n3. Checking floating Ship's Log button...");
  const fab = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const logBtn = buttons.find((b) => b.textContent?.trim() === "Ship's Log");
    if (!logBtn) return null;
    const rect = logBtn.getBoundingClientRect();
    return { text: logBtn.textContent?.trim(), bottom: rect.bottom, right: rect.right, width: rect.width };
  });
  assert(fab !== null, "Floating 'Ship's Log' button exists");
  if (fab) {
    assert(fab.bottom <= viewport.height, "FAB is within viewport vertically");
    assert(fab.right <= viewport.width, "FAB is within viewport horizontally");
  }

  // -------------------------------------------
  // 4. Tap the FAB to open the feed overlay
  // -------------------------------------------
  console.log("\n4. Opening mobile feed overlay...");
  const logButton = await page.locator("button", { hasText: "Ship's Log" }).first();
  await logButton.click();
  await page.waitForTimeout(500);

  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${label}-02-feed-open.png`),
  });
  console.log(`   Screenshot: ${label}-02-feed-open.png`);

  // Verify the full-screen feed overlay appeared
  const feedOverlay = await page.evaluate(() => {
    const el = document.querySelector(".fixed.inset-0.z-40");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert(feedOverlay !== null, "Feed overlay appeared (fixed inset-0 z-40)");
  if (feedOverlay) {
    assert(
      feedOverlay.width >= viewport.width - 2,
      `Feed overlay is full-width (${feedOverlay.width}px >= ${viewport.width - 2}px)`
    );
  }

  // Verify close button exists in feed overlay
  const feedCloseBtn = await page.evaluate(() => {
    const overlay = document.querySelector(".fixed.inset-0.z-40");
    if (!overlay) return false;
    // Look for the close button (x character)
    const buttons = overlay.querySelectorAll("button");
    return Array.from(buttons).some((b) => b.textContent?.trim() === "\u00d7");
  });
  assert(feedCloseBtn, "Feed overlay has close button");

  // -------------------------------------------
  // 5. Tap an alert in the feed -> should close feed + open detail panel
  // -------------------------------------------
  console.log("\n5. Tapping an alert in the feed...");
  const alertItem = await page.locator(".fixed.inset-0.z-40 .flex-1.overflow-y-auto > div").first();
  const alertExists = await alertItem.count() > 0;

  if (alertExists) {
    await alertItem.click();
    await page.waitForTimeout(600);

    await page.screenshot({
      path: join(SCREENSHOT_DIR, `${label}-03-detail-panel.png`),
    });
    console.log(`   Screenshot: ${label}-03-detail-panel.png`);

    // Feed should be closed now
    const feedAfterClick = await page.evaluate(() => {
      return document.querySelector(".fixed.inset-0.z-40") !== null;
    });
    assert(!feedAfterClick, "Feed overlay closed after tapping alert");

    // Detail panel should be visible as a bottom sheet
    const detailPanel = await page.evaluate(() => {
      // Mobile bottom sheet: absolute bottom-0 left-0 right-0 max-h-[70vh]
      const panels = document.querySelectorAll("[class*='bottom-0'][class*='left-0'][class*='right-0']");
      for (const el of panels) {
        if (el.classList.contains("z-20") && el.querySelector("[class*='border-b']")) {
          const rect = el.getBoundingClientRect();
          return { bottom: rect.bottom, width: rect.width, height: rect.height };
        }
      }
      return null;
    });
    assert(detailPanel !== null, "Detail panel appeared as bottom sheet");
    if (detailPanel) {
      assert(
        detailPanel.width >= viewport.width - 2,
        `Detail panel is full-width (${detailPanel.width}px)`
      );
    }

    // Close the detail panel
    const closeBtn = await page.locator("button:has-text('\u00d7')").first();
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
      await page.waitForTimeout(300);
    }
  } else {
    console.log("   (no alerts available to tap, skipping detail panel test)");
  }

  // -------------------------------------------
  // 6. Verify bottom panel (PriceChart/ExchangeFlow) is hidden
  // -------------------------------------------
  console.log("\n6. Checking bottom panel is hidden...");
  const bottomPanel = await page.evaluate(() => {
    // The bottom panel has "hidden md:flex" on mobile
    const candidates = document.querySelectorAll("[class*='bottom-0'][class*='right-72']");
    for (const el of candidates) {
      const style = window.getComputedStyle(el);
      return { display: style.display };
    }
    return null;
  });
  if (bottomPanel) {
    assert(bottomPanel.display === "none", `Bottom panel is display:none (got: ${bottomPanel.display})`);
  } else {
    assert(true, "Bottom panel element not found (acceptable)");
  }

  // -------------------------------------------
  // 7. Verify Compass minimap is hidden
  // -------------------------------------------
  console.log("\n7. Checking Compass minimap is hidden...");
  const compass = await page.evaluate(() => {
    const svgs = document.querySelectorAll("svg.rounded-full");
    for (const svg of svgs) {
      const parent = svg.parentElement;
      if (parent) {
        const style = window.getComputedStyle(parent);
        return { display: style.display };
      }
    }
    return null;
  });
  if (compass) {
    assert(compass.display === "none", `Compass is display:none (got: ${compass.display})`);
  } else {
    assert(true, "Compass element not found (acceptable)");
  }

  // -------------------------------------------
  // 8. Verify CrowsNest stats bar is hidden
  // -------------------------------------------
  console.log("\n8. Checking CrowsNest stats bar is hidden...");
  const crowsNest = await page.evaluate(() => {
    // CrowsNest has "hidden md:flex" — on mobile display should be none
    const candidates = document.querySelectorAll("[class*='bottom-4'][class*='left-4']");
    for (const el of candidates) {
      if (el.classList.contains("hidden")) {
        const style = window.getComputedStyle(el);
        return { display: style.display };
      }
    }
    return null;
  });
  if (crowsNest) {
    assert(crowsNest.display === "none", `CrowsNest is display:none (got: ${crowsNest.display})`);
  } else {
    assert(true, "CrowsNest element not found (acceptable)");
  }

  // -------------------------------------------
  // 9. Verify ShipsClock has compact presets
  // -------------------------------------------
  console.log("\n9. Checking ShipsClock compact presets...");
  const clockPresets = await page.evaluate(() => {
    // Find the ShipsClock bar — it's the element with "Lookback" text
    const spans = Array.from(document.querySelectorAll("span"));
    const lookback = spans.find((s) => s.textContent?.trim() === "Lookback");
    if (!lookback) return null;
    const bar = lookback.closest("div");
    if (!bar) return null;
    const buttons = Array.from(bar.querySelectorAll("button"));
    // Filter out the expand toggle button (just has arrow chars)
    const presetBtns = buttons.filter((b) => {
      const t = b.textContent?.trim();
      return t && !["▸", "▾"].includes(t);
    });
    return presetBtns.map((b) => b.textContent?.trim());
  });
  if (clockPresets) {
    assert(clockPresets.length === 4, `ShipsClock has 4 compact presets (got: ${clockPresets.length}: ${clockPresets.join(", ")})`);
    assert(
      clockPresets.includes("5m") && clockPresets.includes("1h") && clockPresets.includes("24h") && clockPresets.includes("All"),
      `Compact presets are 5m, 1h, 24h, All`
    );
  } else {
    console.log("   (could not locate ShipsClock presets)");
  }

  // -------------------------------------------
  // 10. Test Leaderboard overlay fits on screen
  // -------------------------------------------
  console.log("\n10. Opening Leaderboard overlay...");
  const leaderBtn = await page.locator("button[title='Captain\\'s Ledger']").first();
  if (await leaderBtn.count() > 0) {
    await leaderBtn.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: join(SCREENSHOT_DIR, `${label}-04-leaderboard.png`),
    });
    console.log(`   Screenshot: ${label}-04-leaderboard.png`);

    const leaderboard = await page.evaluate((vw) => {
      const modal = document.querySelector(".fixed.inset-0.z-50");
      if (!modal) return null;
      const inner = modal.querySelector("[class*='max-w-3xl']");
      if (!inner) return null;
      const rect = inner.getBoundingClientRect();
      return { width: rect.width, overflowsX: rect.right > vw };
    }, viewport.width);
    if (leaderboard) {
      assert(!leaderboard.overflowsX, `Leaderboard does not overflow viewport width`);
    }

    // Check single-column grid on mobile
    const gridCols = await page.evaluate(() => {
      const grid = document.querySelector("[class*='grid-cols-1'][class*='md\\:grid-cols-2']");
      if (!grid) return null;
      const style = window.getComputedStyle(grid);
      return { gridTemplateColumns: style.gridTemplateColumns };
    });
    if (gridCols) {
      // Single column means gridTemplateColumns should NOT have multiple values
      const colCount = gridCols.gridTemplateColumns.split(" ").filter(Boolean).length;
      assert(colCount <= 1, `Leaderboard grid is single-column (cols: ${colCount})`);
    }

    // Close leaderboard — click the close button directly
    const leaderCloseBtn = await page.locator(".fixed.inset-0.z-50 button:has-text('\u00d7')").first();
    if (await leaderCloseBtn.count() > 0) {
      await leaderCloseBtn.click();
    } else {
      // Fallback: click the backdrop area
      await page.locator(".fixed.inset-0.z-50 .absolute.inset-0").first().click({ force: true });
    }
    await page.waitForTimeout(500);
    // Verify it's closed
    const leaderStillOpen = await page.evaluate(() => document.querySelector(".fixed.inset-0.z-50") !== null);
    if (leaderStillOpen) {
      console.log("   (leaderboard still open, force-clicking backdrop)");
      await page.evaluate(() => {
        const backdrop = document.querySelector(".fixed.inset-0.z-50");
        if (backdrop) backdrop.click();
      });
      await page.waitForTimeout(500);
    }
  }

  // -------------------------------------------
  // 11. Test Spyglass overlay fits on screen
  // -------------------------------------------
  console.log("\n11. Opening Spyglass overlay...");
  const spyBtn = await page.locator("button[title='Spyglass']").first();
  if (await spyBtn.count() > 0) {
    await spyBtn.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: join(SCREENSHOT_DIR, `${label}-05-spyglass.png`),
    });
    console.log(`   Screenshot: ${label}-05-spyglass.png`);

    const spyglass = await page.evaluate((vw) => {
      const modal = document.querySelector(".fixed.inset-0.z-50");
      if (!modal) return null;
      const inner = modal.querySelector("[class*='max-w-2xl']");
      if (!inner) return null;
      const rect = inner.getBoundingClientRect();
      return { width: rect.width, overflowsX: rect.right > vw };
    }, viewport.width);
    if (spyglass) {
      assert(!spyglass.overflowsX, `Spyglass does not overflow viewport width`);
    }

    // Close spyglass
    const spyCloseBtn = await page.locator(".fixed.inset-0.z-50 button:has-text('\u00d7')").first();
    if (await spyCloseBtn.count() > 0) {
      await spyCloseBtn.click();
    } else {
      await page.evaluate(() => {
        const backdrop = document.querySelector(".fixed.inset-0.z-50");
        if (backdrop) backdrop.click();
      });
    }
    await page.waitForTimeout(500);
  }

  // -------------------------------------------
  // 12. Title bar extends full width
  // -------------------------------------------
  console.log("\n12. Checking title bar extends full width...");
  const titleBar = await page.evaluate((vw) => {
    // Title bar: "absolute top-0 left-0 right-0 md:right-72"
    const candidates = document.querySelectorAll("[class*='top-0'][class*='left-0']");
    for (const el of candidates) {
      if (el.querySelector("h1")) {
        const rect = el.getBoundingClientRect();
        return { width: rect.width, right: rect.right, vpWidth: vw };
      }
    }
    return null;
  }, viewport.width);
  if (titleBar) {
    assert(
      titleBar.right >= viewport.width - 20,
      `Title bar extends to right edge (right: ${titleBar.right}px, vp: ${viewport.width}px)`
    );
  }

  // -------------------------------------------
  // Final screenshot
  // -------------------------------------------
  await page.screenshot({
    path: join(SCREENSHOT_DIR, `${label}-06-final.png`),
  });
  console.log(`\n   Screenshot: ${label}-06-final.png`);

  // Print console errors
  if (consoleLogs.length > 0) {
    console.log("\n--- Console Errors ---");
    for (const log of consoleLogs) {
      console.log(`   ${log}`);
    }
  }

  await browser.close();
}

// -------------------------------------------
// Run tests at multiple mobile sizes
// -------------------------------------------
async function main() {
  console.log("Pequod Mobile E2E Tests");
  console.log("=======================\n");

  await runMobileTests({ width: 375, height: 812 }, "iphone-se");
  await runMobileTests({ width: 390, height: 844 }, "iphone-14");

  // Also test at the md breakpoint (768px) to verify desktop layout kicks in
  console.log(`\n========================================`);
  console.log(`  Breakpoint test: iPad-mini (768x1024)`);
  console.log(`========================================\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 768, height: 1024 },
  });
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(WAIT_FOR_RENDER);

  await page.screenshot({
    path: join(SCREENSHOT_DIR, "ipad-mini-768.png"),
  });
  console.log("   Screenshot: ipad-mini-768.png");

  // At 768px, desktop layout should be active (AlertFeed sidebar visible)
  const sidebarAt768 = await page.evaluate(() => {
    const el = document.querySelector(".absolute.right-0.top-0.bottom-0.w-72");
    if (!el) return null;
    const style = window.getComputedStyle(el);
    return { display: style.display, width: el.offsetWidth };
  });
  assert(sidebarAt768 !== null, "At 768px, AlertFeed sidebar is present (desktop mode)");

  // FAB should NOT exist at 768px
  const fabAt768 = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    return buttons.some((b) => b.textContent?.trim() === "Ship's Log");
  });
  assert(!fabAt768, "At 768px, no floating Ship's Log button (desktop mode)");

  await browser.close();

  // -------------------------------------------
  // Summary
  // -------------------------------------------
  console.log("\n========================================");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("========================================");
  console.log(`\nScreenshots saved to: ${SCREENSHOT_DIR}/`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Playwright mobile test failed:", err);
  process.exit(1);
});
