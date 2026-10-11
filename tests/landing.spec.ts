import { test, expect } from "@playwright/test";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const VIDEO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4";
const LINKS = [["Home","/"],["Dashboard","/dashboard"],["Floor plans","/maps"],["Simulator","/simulator"],["Theory","/theory"],["History","/runs"]];

test("landing explains evacuation planning and renders a real search illustration", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(BASE);
  await expect(page).toHaveTitle("SafePath — Algorithmic Evacuation Planning");
  await expect(page.getByRole("heading", { name: "Intelligence Designed To Evolve." })).toBeVisible();
  await expect(page.locator(".bg-video source")).toHaveAttribute("src", VIDEO);

  for (const [label, href] of LINKS) await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
  await expect(page.locator(".site-nav a[aria-current=page]")).toHaveText("Home");

  // The hero visual is an actual drawn search model, not a decorative image.
  const canvas = page.locator("#plan-canvas");
  await expect(canvas).toHaveAttribute("aria-label", /A\* search on a floor-plan grid/);
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(700);
  const painted = await canvas.evaluate((el: HTMLCanvasElement) => {
    const ctx = el.getContext("2d")!; const d = ctx.getImageData(0, 0, el.width, el.height).data;
    let nonBackdrop = 0; for (let i = 0; i < d.length; i += 4) if (!(d[i] < 16 && d[i + 1] < 17 && d[i + 2] < 19)) nonBackdrop++;
    return nonBackdrop;
  });
  expect(painted).toBeGreaterThan(2000);

  await expect(page.locator(".plan-legend li")).toHaveCount(4);
  await page.waitForTimeout(2200);
  await expect(page.locator("#plan-status")).toHaveText(/Exploring|Route selected/);
  await expect(page.getByText("A* path", { exact: true })).toBeVisible();
  await expect(page.locator(".spec-unit")).toHaveCount(3);
  await expect(page.getByText("Exclusion Boundaries", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "Upload building plan", exact: true }).first()).toHaveAttribute("href", "/maps/new");
  await expect(page.getByRole("link", { name: "Launch A* simulator", exact: true })).toHaveAttribute("href", "/simulator");
  await expect(page.getByRole("navigation", { name: "Planning workflow" }).getByRole("link")).toHaveCount(3);

  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  // Everything fits one desktop viewport and nothing is clipped by the stage.
  const fit = await page.evaluate(() => {
    const main = document.querySelector(".landing-main")!.getBoundingClientRect();
    const hero = document.querySelector(".landing-hero")!.getBoundingClientRect();
    const wf = document.querySelector(".landing-workflow")!.getBoundingClientRect();
    return { scrollH: document.documentElement.scrollHeight, innerH: innerHeight, heroTop: hero.top, heroBottom: hero.bottom, mainTop: main.top, wfTop: wf.top, wfBottom: wf.bottom, mainBottom: main.bottom };
  });
  expect(fit.scrollH).toBeLessThanOrEqual(fit.innerH);
  expect(fit.heroTop).toBeGreaterThanOrEqual(fit.mainTop - 1);
  expect(fit.heroBottom).toBeLessThanOrEqual(fit.wfTop + 1);
  expect(fit.wfBottom).toBeLessThanOrEqual(fit.mainBottom + 1);
  // The status readout reflects the search stage rather than static decoration.
  await expect(page.locator("#plan-status")).toHaveText(/Exploring|Route selected|Grid 34/);
  expect(errors).toEqual([]);
});

test("landing actions open the real planning workflow", async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole("link", { name: "Upload building plan", exact: true }).first().click();
  await expect(page).toHaveURL(/\/maps\/new$/);
  await expect(page.getByRole("heading", { name: "From floor plan to escape route." })).toBeVisible();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("link", { name: "Launch A* simulator", exact: true }).click();
  await expect(page).toHaveURL(/\/simulator$/);
  await expect(page.getByRole("button", { name: "Run A*", exact: true })).toBeEnabled();
  await page.goto(BASE);
  await page.getByRole("navigation", { name: "Planning workflow" }).getByRole("link").nth(1).click();
  await expect(page).toHaveURL(/\/maps$/);
});

test("landing mobile menu restores focus, wraps keyboard focus and uses real links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(BASE);
  const toggle = page.getByRole("button", { name: "Open menu", exact: true }); await toggle.click();
  const menu = page.getByRole("dialog", { name: "Site menu" }); await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Home", exact: true })).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  // The mobile menu contains 6 links plus the Close/Burger button.
  // Focusing the last link in the panel ("Upload a floor plan") and pressing Tab should focus the Close button.
  await menu.getByRole("link", { name: "Upload a floor plan", exact: true }).focus(); await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close menu", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(page.locator("#site-menu")).toBeHidden(); await expect(toggle).toBeFocused();
  await toggle.click(); await menu.getByRole("link", { name: "Dashboard", exact: true }).click(); await expect(page).toHaveURL(/\/dashboard$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("reduced-motion landing stops the video and the canvas becomes a static final state", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto(BASE);
  await expect(page.locator(".bg-video")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Intelligence Designed To Evolve." })).toBeVisible();
  await page.waitForTimeout(250);
  const painted = await page.locator("#plan-canvas").evaluate((el: HTMLCanvasElement) => {
    const d = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (!(d[i] < 16 && d[i + 1] < 17 && d[i + 2] < 19)) n++;
    return n;
  });
  expect(painted).toBeGreaterThan(2000);
});
