import test from "node:test";
import assert from "node:assert/strict";
import { convertPixels, detectCandidates, classifyLabel, DEFAULT_CONVERSION, FULL_BOUNDS, resolutionFor, candidatePosition, type PixelImage } from "../src/lib/map-analysis";
import { parseMapInput, applyTool, inspectDocument, type GridDocument } from "../src/lib/map-model";
import { isBlocked } from "../src/lib/astar";
function image(w = 400, h = 300): PixelImage { const data = new Uint8Array(w * h * 4); data.fill(255); return { data, width: w, height: h }; }
function fill(im: PixelImage, left: number, top: number, right: number, bottom: number, rgb: number[]) { for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) { const i = (y * im.width + x) * 4; im.data[i] = rgb[0]; im.data[i + 1] = rgb[1]; im.data[i + 2] = rgb[2]; } }
test("thin walls survive, all rooms survive, and no border exits are invented", () => {
  const im = image(); fill(im, 197, 0, 200, 300, [10, 10, 10]);
  const c = convertPixels(im, { ...DEFAULT_CONVERSION, cols: 40, rows: 30 });
  assert.equal(c.grid['19,10'], 'wall'); assert.equal(c.regions, 2); assert.equal(c.grid['4,8'], 'empty'); assert.equal(c.grid['33,8'], 'empty');
  assert.equal(detectCandidates(im, []).length, 0); assert.equal(c.grid['0,0'], 'unknown');
});
test("blank image has no fabricated exits or starts", () => { const im = image(); assert.deepEqual(detectCandidates(im, []), []); const c = convertPixels(im, DEFAULT_CONVERSION); assert.equal(c.walls, 0); assert.ok(c.warnings.some(s => s.includes('Few definite wall cells'))); });
test("green sign is one candidate, red equipment is not automatically a fire", () => {
  const im = image(); fill(im, 25, 25, 60, 55, [10, 150, 65]); fill(im, 250, 150, 280, 180, [200, 20, 20]);
  const candidates = detectCandidates(im, []); assert.equal(candidates.filter(c => c.kind === 'exit').length, 0); assert.equal(candidates.filter(c => c.kind === 'hazard').length, 0); assert.equal(candidates.filter(c => c.kind === 'annotation' && c.semanticClass === 'COLORED_ANNOTATION').length, 2);
  const grid = convertPixels(im, DEFAULT_CONVERSION).grid; assert.ok(!Object.values(grid).includes('fire')); assert.ok(!Object.values(grid).includes('exit')); assert.ok(!Object.values(grid).includes('start'));
});
test("text recognition distinguishes NO EXIT and fire equipment from real exit text", () => { assert.equal(classifyLabel('Training sample — verify all doorways and exits before routing'), 'other'); assert.equal(classifyLabel('FIRE EXIT PLAN'), 'other'); assert.equal(classifyLabel('NO EXIT'), 'other'); assert.equal(classifyLabel('NOT AN EXIT'), 'other'); assert.equal(classifyLabel('EMERGENCY EXIT'), 'exit'); assert.equal(classifyLabel('FIRE EXTINGUISHER'), 'equipment'); assert.equal(classifyLabel('YOU ARE HERE'), 'start'); });
test("cropping and aspect-locked resolution map candidates consistently", () => {
  assert.deepEqual(resolutionFor(1200, 840, 64), { cols: 64, rows: 45 });
  const im = image(); const opts = { ...DEFAULT_CONVERSION, cols: 20, rows: 20, crop: { left: .25, top: 0, right: .75, bottom: 1 } };
  const grid = convertPixels(im, opts).grid;
  const c = { id: 'x', kind: 'exit' as const, label: 'EXIT', evidence: 'OCR', source: 'text' as const, confidence: 'text-match' as const, box: { left: .45, top: .45, right: .55, bottom: .55 } };
  assert.deepEqual(candidatePosition(c, opts, grid), { x: 10, y: 10 });
  assert.equal(candidatePosition({ ...c, box: { left: .01, top: 0, right: .05, bottom: .05 } }, opts, grid), null);
});
test("edit tools enforce exclusivity and validation rejects missing/out-of-bounds cells", () => {
  const converted = convertPixels(image(), { ...DEFAULT_CONVERSION, cols: 20, rows: 20, crop: FULL_BOUNDS });
  let doc: GridDocument = { gridWidth: 20, gridHeight: 20, gridData: converted.grid, starts: [], exits: [], obstacles: [] };
  doc = applyTool(doc, 'wall', { x: 3, y: 3 }); doc = applyTool(doc, 'person', { x: 3, y: 3 }); assert.equal(doc.starts.length, 0);
  doc = applyTool(doc, 'floor', { x: 3, y: 3 }); doc = applyTool(doc, 'person', { x: 3, y: 3 }); doc = applyTool(doc, 'exit', { x: 3, y: 3 }); assert.equal(doc.exits.length, 0);
  doc = applyTool(doc, 'exit', { x: 18, y: 18 }); assert.equal(inspectDocument(doc).errors.length, 0); assert.equal(inspectDocument(doc).unreachable.length, 0);
  assert.equal(parseMapInput({ ...doc, title: 'Valid map' }).starts.length, 1);
  assert.throws(() => parseMapInput({ ...doc, title: 'Invalid', starts: [{ x: 200, y: 0 }] }), /outside/);
  assert.throws(() => parseMapInput({ ...doc, title: 'Invalid', gridData: {} }), /missing/);
});
test("windows are blocked, unknown cells stay review-walkable, and fire preserves existing terrain", () => {
  assert.equal(isBlocked('unknown'), false);
  assert.equal(isBlocked('window'), true);
  assert.equal(isBlocked('empty'), false);
  const doc: GridDocument = { gridWidth: 6, gridHeight: 6, gridData: { '2,2': 'wall', '3,3': 'empty' }, starts: [], exits: [], obstacles: [] };
  const wallFire = applyTool(doc, 'fire', { x: 2, y: 2 });
  assert.equal(wallFire.gridData['2,2'], 'wall');
  assert.deepEqual(wallFire.obstacles, [{ x: 2, y: 2 }]);
  assert.equal(applyTool(doc, 'fire', { x: 3, y: 3 }).gridData['3,3'], 'empty');
});
test("pre-check never connects through a blocked corner", () => {
  const grid: GridDocument['gridData'] = {};
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) grid[`${x},${y}`] = 'wall';
  grid['1,1'] = 'empty'; grid['2,2'] = 'empty';
  const doc: GridDocument = { gridWidth: 3, gridHeight: 3, gridData: grid, starts: [{ x: 1, y: 1 }], exits: [{ x: 2, y: 2 }], obstacles: [] };
  assert.equal(inspectDocument(doc).unreachable.length, 1);
  assert.equal(inspectDocument(doc, { allowDiagonal: true }).unreachable.length, 1);
});
