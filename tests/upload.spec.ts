import { test, expect } from "@playwright/test";
import path from "node:path";
import sharp from "sharp";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
test.setTimeout(120000);
test("real upload, OCR, reviewed refinement, atomic save, exact-map A* and reload", async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  let mapId: number | undefined;
  try {
    await page.goto(`${BASE}/maps/new`);
    await expect(page.getByRole('heading', { name: 'From floor plan to escape route.' })).toBeVisible();
    const analyzed = page.waitForResponse(r => r.url().endsWith('/api/maps/analyze') && r.request().method() === 'POST');
    await page.getByLabel('Upload floor plan image').setInputFiles(path.resolve('public/samples/campus-plan.png'));
    const response = await analyzed;
    expect(response.ok()).toBeTruthy(); const { analysis } = await response.json();
    expect(analysis.ocrStatus).toBe('complete');
    expect(analysis.candidates.some((c: { label: string; source: string }) => c.label.toUpperCase().includes('EXIT') && c.source === 'text')).toBeTruthy();
    expect(analysis.candidates.some((c: { label: string }) => c.label.includes('Training sample'))).toBeFalsy();
    await expect(page.getByRole('heading', { name: 'Compare the conversion' })).toBeVisible();
    await page.screenshot({ path: '/tmp/safepath-analysis.png', fullPage: true });
    await page.getByRole('button', { name: 'Refine grid & confirm exits' }).click();
    await expect(page.getByRole('heading', { name: 'Route validation' })).toBeVisible();
    await page.getByRole('button', { name: 'Confirm position', exact: true }).click();
    const exitButtons = page.getByRole('button', { name: 'Confirm exit', exact: true });
    expect(await exitButtons.count()).toBeGreaterThanOrEqual(2);
    await exitButtons.first().click(); await exitButtons.first().click();
    await page.getByRole('button', { name: 'Validate routes', exact: true }).click();
    await expect(page.getByText('Person 1: route found', { exact: true })).toBeVisible({ timeout: 20000 });
    await page.getByLabel('Map name', { exact: true }).fill(`E2E reviewed floor ${Date.now()}`);
    await page.getByLabel('I checked the walls, doorways, exterior areas and actual exit positions against the source plan.').check();
    await expect(page.getByRole('button', { name: 'Save & run A*', exact: true })).toBeEnabled();
    await page.screenshot({ path: '/tmp/safepath-refined.png', fullPage: true });
    const savedResponse = page.waitForResponse(r => r.url().endsWith('/api/maps') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save & run A*', exact: true }).click();
    const saved = await savedResponse; expect(saved.status()).toBe(201);
    const data = await saved.json(); mapId = data.map.id;
    expect(
      data.map.imageUrl.startsWith('data:image/webp;base64,') ||
      /^\/api\/maps\/\d+\/image/.test(data.map.imageUrl)
    ).toBeTruthy();
    expect(data.map.analysis.reviewed).toBe(true); expect(data.map.starts).toHaveLength(1); expect(data.map.exits).toHaveLength(2);
    expect(data.run.pathResult.allReached).toBe(true);
    const expectedCost = data.run.pathResult.people[0].stats.totalCost;
    await expect(page).toHaveURL(new RegExp(`/simulator\\?mapId=${mapId}`));
    await expect(page.getByTestId('loaded-map-title')).toHaveText(data.map.title);
    await expect(page.getByRole('button', { name: 'Show final route', exact: true })).toBeEnabled({ timeout: 20000 });
    await page.getByRole('button', { name: 'Show final route', exact: true }).click();
    await expect(page.getByText('Goal reached', { exact: true })).toBeVisible();
    await expect(page.locator('.plan-sim-stats').getByText(expectedCost.toFixed(2), { exact: true })).toBeVisible();
    await page.screenshot({ path: '/tmp/safepath-simulator.png', fullPage: true });
    await page.getByLabel('Heuristic', { exact: true }).selectOption('euclidean');
    await expect(page.getByRole('button', { name: 'Show final route', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Show final route', exact: true }).click();
    await expect(page.getByText('Goal reached', { exact: true })).toBeVisible();
    await expect(page.locator('.plan-sim-stats').getByText(expectedCost.toFixed(2), { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('loaded-map-title')).toHaveText(data.map.title);
    await expect(page.getByRole('button', { name: 'Show final route', exact: true })).toBeEnabled();
    const persisted = await (await request.get(`${BASE}/api/maps/${mapId}`)).json();
    expect(persisted.map.gridData).toEqual(data.map.gridData); expect(persisted.map.analysis).toEqual(data.map.analysis);
    expect(errors).toEqual([]);
  } finally { if (mapId) await request.delete(`${BASE}/api/maps/${mapId}`); }
});
test("unreadable file has a useful error and can be retried", async ({ page }) => {
  await page.goto(`${BASE}/maps/new`);
  await page.getByLabel('Upload floor plan image').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('.planner').getByRole('alert')).toContainText('could not be decoded');
  await expect(page.getByRole('button', { name: 'Retry analysis', exact: true })).toBeVisible();
});
test("blank images never acquire invented exits", async ({ page }) => {
  const blank = await sharp({ create: { width: 500, height: 350, channels: 3, background: 'white' } }).png().toBuffer();
  await page.goto(`${BASE}/maps/new`);
  await page.getByLabel('Upload floor plan image').setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: blank });
  await expect(page.getByRole('heading', { name: 'Compare the conversion' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Refine grid & confirm exits' }).click();
  await expect(page.getByText('No exit markers identified', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save & run A*', exact: true })).toBeDisabled();
  await expect(page.getByText('Place at least one person on a walkable cell.', { exact: true })).toBeVisible();
});
test("mobile upload page stays within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/maps/new`);
  await expect(page.getByText('Drop a floor plan here', { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path: '/tmp/safepath-mobile.png', fullPage: true });
});
