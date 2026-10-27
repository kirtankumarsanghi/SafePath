import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
test.setTimeout(120000);
async function cell(page: Page, x: number, y: number) {
  const canvas = page.getByTestId('grid-canvas'); await canvas.scrollIntoViewIfNeeded();
  const b = await canvas.boundingBox(); if (!b) throw new Error('Canvas not visible');
  const cols = Number(await canvas.getAttribute('data-cols')), rows = Number(await canvas.getAttribute('data-rows'));
  await canvas.click({ position: { x: (x + .5) / cols * b.width, y: (y + .5) / rows * b.height } });
}
test('paint, undo, stale-result invalidation, draft persistence, partial update and exact-map rerun', async ({ page, request }) => {
  let id: number | undefined;
  try {
    await page.goto(`${BASE}/maps/new`);
    await page.getByRole('button', { name: 'Draw a grid from scratch', exact: true }).click();
    await cell(page, 4, 4);
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await cell(page, 20, 4);
    await page.getByRole('button', { name: 'Validate routes', exact: true }).click();
    await expect(page.getByText('Person 1: route found', { exact: true })).toBeVisible();
    const review = page.getByLabel('I checked the walls, doorways, exterior areas and actual exit positions against the source plan.');
    await review.check(); await expect(page.getByRole('button', { name: 'Save & run A*', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Wall', exact: true }).click(); await cell(page, 10, 4);
    await expect(review).not.toBeChecked(); await expect(page.getByRole('button', { name: 'Save & run A*', exact: true })).toBeDisabled();
    await expect(page.getByText('Person 1: route found', { exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Undo grid edit', exact: true }).click();
    await page.getByLabel('Map name', { exact: true }).fill(`E2E manual plan ${Date.now()}`);
    const savedResponse = page.waitForResponse(r => r.url().endsWith('/api/maps') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save draft', exact: true }).first().click();
    const response = await savedResponse; expect(response.status()).toBe(201); const saved = await response.json(); id = saved.map.id;
    expect(saved.map.starts).toEqual([{ x: 4, y: 4 }]); expect(saved.map.exits).toEqual([{ x: 20, y: 4 }]); expect(saved.map.gridData['10,4']).toBe('empty');
    await expect(page).toHaveURL(`${BASE}/maps/${id}?saved=1`);
    const patch = await request.put(`${BASE}/api/maps/${id}`, { data: { description: 'Metadata-only update' } }); expect(patch.ok()).toBeTruthy();
    const updated = await patch.json(); expect(updated.map.gridData).toEqual(saved.map.gridData); expect(updated.map.starts).toEqual(saved.map.starts);
    await page.reload(); await expect(page.getByRole('heading', { name: saved.map.title, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Validate routes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save & run A*', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save & run A*', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/simulator\\?mapId=${id}`));
    await expect(page.getByTestId('loaded-map-title')).toHaveText(saved.map.title);
    await expect(page.getByRole('button', { name: 'Show final route', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Show final route', exact: true }).click();
    await expect(page.locator('.plan-sim-stats div').filter({ hasText: 'Path cost' })).toContainText('16.00');
    const run = await request.post(`${BASE}/api/runs`, { data: { mapId: id, title: 'Client sent fake statistics', totalPathCost: -12345, nodesExplored: -22 } });
    expect(run.status()).toBe(201); const computed = await run.json(); expect(computed.run.totalPathCost).toBe(16); expect(computed.run.nodesExplored).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Toggle fire', exact: true }).click(); await cell(page, 10, 4);
    await expect(page.getByRole('button', { name: 'Show final route', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Show final route', exact: true }).click();
    await expect(page.locator('.plan-sim-stats div').filter({ hasText: 'Path cost' })).toContainText('18.00');
  } finally { if (id) await request.delete(`${BASE}/api/maps/${id}`); }
});
test('changed resolution is applied atomically and never mismatches the preview grid', async ({ page }) => {
  await page.goto(`${BASE}/maps/new`);
  await page.getByLabel('Upload floor plan image').setInputFiles(path.resolve('public/samples/campus-plan.png'));
  await expect(page.getByRole('heading', { name: 'Compare the conversion' })).toBeVisible({ timeout: 60000 });
  const canvas = page.getByTestId('grid-canvas'); await expect(canvas).toHaveAttribute('data-cols', '64');
  await page.getByLabel('Grid detail', { exact: true }).focus(); await page.getByLabel('Grid detail', { exact: true }).press('End');
  await expect(page.getByText('Unapplied changes. The preview still shows the previous conversion.', { exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-cols', '64');
  await expect(page.getByRole('button', { name: 'Refine grid & confirm exits', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Apply conversion settings', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-cols', '96'); await expect(canvas).toHaveAttribute('data-rows', '67');
  await expect(page.getByRole('button', { name: 'Refine grid & confirm exits', exact: true })).toBeEnabled();
});
