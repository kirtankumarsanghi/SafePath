import "dotenv/config";
import { test, expect } from "@playwright/test";
import { db, pool } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
test.afterAll(async () => { await pool.end(); });
test("sign up, update the persisted profile and sign out with a consistent header", async ({ page, request }) => {
  const email = `ui-test-${Date.now()}@safepath.test`; let userId: number | undefined;
  try {
    await page.goto(BASE + "/auth");
    await page.getByRole("button", { name: "New to SafePath? Create an account", exact: true }).click();
    await page.getByLabel("Full name", { exact: true }).fill("Planning User");
    await page.getByLabel("Email", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill("StrongPlanPass123!");
    const signedUp = page.waitForResponse(r => r.url().endsWith("/api/auth/signup") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    const result = await signedUp; expect(result.status()).toBe(201); userId = (await result.json()).user.id;
    await expect(page).toHaveURL(/\/dashboard$/); await expect(page.locator(".site-header .site-account")).toHaveText("Account");
    await page.locator(".site-header .site-account").click(); await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Planning User");
    await page.getByLabel("Display name", { exact: true }).fill("Reviewed Planner");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("display name has been saved"); await page.reload();
    await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Reviewed Planner");
    const token = await page.evaluate(() => localStorage.getItem("token"));
    const me = await request.get(BASE + "/api/auth/me", { headers: { Authorization: `Bearer ${token}` } }); expect((await me.json()).user.name).toBe("Reviewed Planner");
    const badPatch = await request.patch(BASE + "/api/auth/me", { headers: { Authorization: `Bearer ${token}` }, data: { name: "" } }); expect(badPatch.status()).toBe(400);
    await page.getByRole("button", { name: "Sign out", exact: true }).click(); await expect(page).toHaveURL(BASE + "/");
    await expect(page.locator(".site-header .site-account")).toHaveText("Sign in");
    expect(await page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  } finally { if (userId) await db.delete(users).where(eq(users.id, userId)); }
});
test("guest profile has a real sign-in path, not hardcoded demo details", async ({ page, request }) => {
  await page.goto(BASE + "/profile"); await expect(page.getByRole("heading", { name: "Sign in to manage your account" })).toBeVisible();
  await expect(page.getByText("demo@university.edu", { exact: true })).toHaveCount(0);
  expect((await request.get(BASE + "/api/auth/me")).status()).toBe(401);
});
