import { test, expect } from "@playwright/test";
import path from "node:path";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
test.setTimeout(120000);

/**
 * Regression: a saved map whose image is served as /api/maps/:id/image must
 * survive an edit-and-save round trip without dropping or corrupting the image.
 */
test("editing a saved plan keeps its uploaded source image", async ({ page, request }) => {
  let mapId: number | undefined;

  try {
    // 1. Analyze a real plan.
    await page.goto(`${BASE}/maps/new`);
    const analysed = page.waitForResponse((r) => r.url().endsWith("/api/maps/analyze") && r.request().method() === "POST");
    await page.getByLabel("Upload floor plan image").setInputFiles(path.resolve("public/samples/campus-plan.png"));
    const analysisResponse = await analysed;
    expect(analysisResponse.ok()).toBeTruthy();
    const { analysis } = await analysisResponse.json();
    expect(analysis.imageUrl.startsWith("data:image/webp;base64,")).toBeTruthy();

    // 2. Refine and save a draft.
    await page.getByRole("button", { name: "Refine grid & confirm exits" }).click();
    await page.getByRole("button", { name: "Confirm position", exact: true }).click();
    const exitButtons = page.getByRole("button", { name: "Confirm exit", exact: true });
    expect(await exitButtons.count()).toBeGreaterThanOrEqual(2);
    await exitButtons.first().click();
    await exitButtons.first().click();
    await page.getByLabel("Map name", { exact: true }).fill(`Image retention ${Date.now()}`);
    const saved = page.waitForResponse((r) => r.url().endsWith("/api/maps") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Save draft", exact: true }).first().click();
    const saveResponse = await saved;
    expect(saveResponse.status()).toBe(201);
    const { map } = await saveResponse.json();
    mapId = map.id;

    // 3. The API hands back the served image endpoint, not base64.
    expect(map.imageUrl).toMatch(/^\/api\/maps\/\d+\/image/);

    // 4. Round-trip an update carrying that endpoint URL (this used to 400).
    const updated = await request.put(`${BASE}/api/maps/${mapId}`, {
      data: { ...map, description: "edited after upload" },
    });
    expect(updated.ok()).toBeTruthy();
    const after = (await updated.json()).map;
    expect(after.imageUrl).toMatch(/^\/api\/maps\/\d+\/image/);
    expect(after.description).toBe("edited after upload");

    // 5. The image itself still resolves.
    const image = await request.get(`${BASE}${after.imageUrl}`);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toContain("image/");

    // 6. The editor still shows the source image.
    await page.goto(`${BASE}/maps/${mapId}`);
    await expect(page.getByRole("heading", { name: map.title })).toBeVisible();
    await page.getByRole("button", { name: "Image + grid" }).first().click();
    const img = page.locator("img").filter({ hasNot: page.locator("svg") }).last();
    await expect(img).toBeVisible();
  } finally {
    if (mapId) await request.delete(`${BASE}/api/maps/${mapId}`);
  }
});
