import { test, expect, type Page } from "@playwright/test";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const PAGES = ["/dashboard", "/maps", "/maps/new", "/simulator", "/theory", "/runs", "/profile", "/auth"];
async function headerSignature(page: Page) {
  return page.locator(".site-header").evaluate(header => {
    const nav = header.querySelector<HTMLElement>(".site-nav")!, brand = header.querySelector<HTMLElement>(".site-brand")!, account = header.querySelector<HTMLElement>(".site-account")!;
    const h = getComputedStyle(header), n = getComputedStyle(nav), b = getComputedStyle(brand), a = getComputedStyle(account);
    return { height: h.height, bg: h.backgroundColor, font: h.fontFamily, navHeight: n.height, navBg: n.backgroundColor, navRadius: n.borderRadius, brandSize: b.fontSize, accountHeight: a.height, links: Array.from(nav.querySelectorAll("a")).map(x => ({ text: x.textContent, href: x.getAttribute("href") })) };
  });
}
test("home and all app pages share the exact same header geometry and links", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(BASE);
  const expected = await headerSignature(page);
  for (const path of PAGES) {
    await page.goto(BASE + path); await expect(page.locator(".site-header")).toBeVisible();
    expect(await headerSignature(page), path).toEqual(expected);
    await expect(page.locator(".sp-shell")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), path).toBe(false);
    if (!["/auth", "/profile"].includes(path)) {
      const active = page.locator(".site-nav a[aria-current=page]"); await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute("href", path === "/maps/new" ? "/maps" : path);
    }
  }
  expect(errors).toEqual([]);
});
test("every page uses the same mobile breakpoint and accessible menu", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  for (const path of ["/", ...PAGES]) {
    await page.goto(BASE + path); await expect(page.locator(".site-nav")).toBeHidden();
    const button = page.getByRole("button", { name: "Open menu", exact: true }); await button.click();
    const menu = page.getByRole("dialog", { name: "Site menu" }); await expect(menu).toBeVisible();
    await expect(menu.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link")).toHaveCount(6);
    await page.keyboard.press("Escape"); await expect(page.locator("#site-menu")).toBeHidden(); await expect(button).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), path).toBe(false);
  }
});
test("dashboard uses actual saved plans, previews and run counts", async ({ page, request }) => {
  const maps = (await (await request.get(BASE + "/api/maps")).json()).maps;
  const runs = (await (await request.get(BASE + "/api/runs")).json()).runs;
  await page.goto(BASE + "/dashboard");
  await expect(page.getByRole("heading", { name: "Egress Routing & Graph Solvers" })).toBeVisible();
  await expect(page.locator(".metric-strip dd").first()).toHaveText(String(maps.length));
  await expect(page.locator(".metric-strip dd").nth(3)).toHaveText(String(runs.length));
  await expect(page.locator(".plan-tile")).toHaveCount(Math.min(3, maps.length));
  for (const map of maps.slice(0,3)) {
    await expect(page.getByRole("heading", { name: map.title, exact: true })).toBeVisible();
    const preview = await request.get(BASE + `/api/maps/${map.id}/preview`); expect(preview.status()).toBe(200); expect(preview.headers()["content-type"]).toContain("image/svg+xml");
  }
  await page.screenshot({ path: "/tmp/premium-dashboard.png", fullPage: true });
});
test("library search and useful no-match state", async ({ page }) => {
  await page.goto(BASE + "/maps"); const search = page.getByRole("searchbox", { name: "Search floor plans" });
  await expect(search).toBeVisible(); await search.fill("no-matching-plan-928319");
  await expect(page.getByRole("heading", { name: "No matching plans" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(page.locator(".plan-tile").first()).toBeVisible();
});
test("workspace mobile pages do not clip controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/dashboard", "/maps", "/maps/new", "/simulator", "/auth", "/profile"]) {
    await page.goto(BASE + path); expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), path).toBe(false);
  }
  await page.goto(BASE + "/dashboard"); await page.screenshot({ path: "/tmp/premium-mobile-dashboard.png", fullPage: true });
});
