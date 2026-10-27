import { test, expect } from "@playwright/test";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";

test("simulator shows g, h, f and resets the demo cleanly", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));

  await page.goto(`${BASE}/simulator`);
  await page.getByRole("button", { name: "Small demo", exact: true }).click();

  const currentNode = page.getByTestId("current-node");
  await expect(currentNode).toContainText("g(n)");
  await expect(currentNode).toContainText("h(n)");
  await expect(currentNode).toContainText("f(n) = g + h");
  await expect(page.getByText("Nodes explored", { exact: true })).toBeVisible();

  await expect(page.getByText(/Exit reached at/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("button", { name: "Re-run A*", exact: true })).toBeVisible();

  const pathCost = page.locator(".plan-sim-stats div").filter({ hasText: "Path cost" });
  await expect(pathCost).toContainText("10.00");

  await page.getByRole("button", { name: "Toggle fire", exact: true }).click();
  const box = await page.getByTestId("grid-canvas").boundingBox();
  if (!box) throw new Error("Grid canvas was not visible");
  await page.mouse.click(box.x + box.width * (1.5 / 9), box.y + box.height * (3.5 / 6));

  await expect(pathCost).toContainText("12.00", { timeout: 15000 });
  await expect(page.getByTestId("no-route-alert")).toHaveCount(0);

  await page.getByRole("button", { name: "Reset grid", exact: true }).click();
  await expect(page.getByRole("button", { name: "Run A*", exact: true })).toBeVisible();
  await expect(currentNode).toContainText("Press Run A*");

  expect(errors).toEqual([]);
});
