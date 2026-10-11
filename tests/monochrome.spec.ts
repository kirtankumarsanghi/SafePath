import { test, expect } from "@playwright/test";
import sharp from "sharp";
const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
test.setTimeout(90000);
test('black-and-white floor plans read actual exit lettering rather than inventing green markers', async ({ request }) => {
  const grayscale = await sharp('public/samples/campus-plan.png').grayscale().png().toBuffer();
  const response = await request.post(`${BASE}/api/maps/analyze`, { multipart: { file: { name: 'monochrome-floor.png', mimeType: 'image/png', buffer: grayscale } } });
  expect(response.status()).toBe(200);
  const { analysis } = await response.json();
  expect(analysis.ocrStatus).toBe('complete');
  const exits = analysis.candidates.filter((c: { kind: string }) => c.kind === 'exit');
  expect(exits.length).toBeGreaterThanOrEqual(2);
  expect(exits.every((c: { source: string; label: string }) => c.source === 'text' && /EXIT/i.test(c.label))).toBeTruthy();
  expect(exits.some((c: { label: string }) => /Training/i.test(c.label))).toBeFalsy();
});
