import test from "node:test";
import assert from "node:assert/strict";
import { convertPixels, detectCandidates, classifyLabel, hueName, normalizeOcrText, mergeStackedAndAdjacentLabels, DEFAULT_CONVERSION, FULL_BOUNDS, resolutionFor, candidatePosition, type PixelImage } from "../src/lib/map-analysis";
import { detectSignRegions } from "../src/lib/sign-regions";
import { parseMapInput, applyTool, inspectDocument, type GridDocument } from "../src/lib/map-model";
import { isBlocked } from "../src/lib/astar";
import { validateLoginInput, validateSignupInput, parsePagination } from "../src/lib/api-validation";
import { checkRateLimit } from "../src/lib/rate-limit";

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

test("text recognition distinguishes NO EXIT and fire equipment from real exit text including multilingual signs", () => {
  assert.equal(classifyLabel('Training sample — verify all doorways and exits before routing'), 'other');
  assert.equal(classifyLabel('FIRE EXIT PLAN'), 'other');
  assert.equal(classifyLabel('NO EXIT'), 'other');
  assert.equal(classifyLabel('NOT AN EXIT'), 'other');
  assert.equal(classifyLabel('SIN SALIDA'), 'other');
  assert.equal(classifyLabel('PAS DE SORTIE'), 'other');
  assert.equal(classifyLabel('EMERGENCY EXIT'), 'exit');
  assert.equal(classifyLabel('SALIDA DE EMERGENCIA'), 'exit');
  assert.equal(classifyLabel('SORTIE DE SECOURS'), 'exit');
  assert.equal(classifyLabel('NOTAUSGANG'), 'exit');
  assert.equal(classifyLabel('USCITA'), 'exit');
  assert.equal(classifyLabel('ESCALERA'), 'stairs');
  assert.equal(classifyLabel('FIRE EXTINGUISHER'), 'equipment');
  assert.equal(classifyLabel('YOU ARE HERE'), 'start');
  assert.equal(classifyLabel('USTED ESTÁ AQUÍ'), 'start');
});

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
  doc = applyTool(doc, 'smoke', { x: 5, y: 5 }); assert.equal(doc.gridData['5,5'], 'smoke');
  doc = applyTool(doc, 'stairs', { x: 6, y: 6 }); assert.equal(doc.gridData['6,6'], 'stairs');
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

test("API schema validators and sliding-window rate limiter enforce strict rules", () => {
  assert.equal(validateLoginInput({ email: "USER@Example.com ", password: "secret" }).ok, true);
  assert.equal(validateLoginInput({ email: "", password: "secret" }).ok, false);
  assert.equal(validateSignupInput({ name: "Test", email: "bad-email", password: "StrongPassword123" }).ok, false);
  assert.equal(validateSignupInput({ name: "Test", email: "user@example.com", password: "short" }).ok, false);
  assert.equal(validateSignupInput({ name: "Test", email: "user@example.com", password: "StrongPassword123" }).ok, true);

  const page = parsePagination(new URLSearchParams("limit=25&offset=10&mine=1"));
  assert.deepEqual(page, { limit: 25, offset: 10, mine: true });

  const key = `test-bucket-${Date.now()}`;
  assert.equal(checkRateLimit(key, 2, 10_000, 1000).allowed, true);
  assert.equal(checkRateLimit(key, 2, 10_000, 1500).allowed, true);
  assert.equal(checkRateLimit(key, 2, 10_000, 2000).allowed, false);
  assert.equal(checkRateLimit(key, 2, 10_000, 12_000).allowed, true);
});

test("HSV color classifier identifies full spectrum of floor-plan hues and ignores neutral tones", () => {
  assert.equal(hueName(210, 25, 25), "red");
  assert.equal(hueName(235, 105, 20), "orange/red");
  assert.equal(hueName(240, 205, 25), "yellow");
  assert.equal(hueName(10, 150, 65), "green");
  assert.equal(hueName(15, 185, 195), "cyan/teal");
  assert.equal(hueName(25, 90, 220), "blue");
  assert.equal(hueName(170, 40, 205), "purple/magenta");
  assert.equal(hueName(130, 70, 30), "brown");
  assert.equal(hueName(250, 250, 248), null);
  assert.equal(hueName(120, 122, 118), null);
  assert.equal(hueName(15, 15, 15), null);
});

test("OCR normalization repairs common character confusions and classifies room/safety labels", () => {
  assert.equal(normalizeOcrText("E X I T"), "EXIT");
  assert.equal(classifyLabel("EX1T"), "exit");
  assert.equal(classifyLabel("EMERGFNCY EX1T"), "exit");
  assert.equal(classifyLabel("STAlRS"), "stairs");
  assert.equal(classifyLabel("F1RE EXT1NGUISHER"), "equipment");
  assert.equal(classifyLabel("ELFVAT0R"), "elevator");
  assert.equal(classifyLabel("RM 204B"), "room");
  assert.equal(classifyLabel("SERVER ROOM"), "room");
});

test("continuous walls survive even when an OCR text bounding box overlaps the wall", () => {
  const im = image(400, 300);
  fill(im, 197, 0, 200, 300, [10, 10, 10]);
  const overlappingLabel = [{
    text: "ROOM 101",
    confidence: 88,
    kind: "room" as const,
    box: { left: 0.42, top: 0.28, right: 0.58, bottom: 0.42 },
  }];
  const c = convertPixels(im, { ...DEFAULT_CONVERSION, cols: 40, rows: 30, ignoreText: true }, overlappingLabel);
  assert.equal(c.grid["19,10"], "wall");
  assert.equal(c.regions, 2);
});

test("sign region detector finds both dark and colored sign plates", () => {
  const im = image(400, 300);
  fill(im, 30, 30, 95, 65, [20, 20, 20]);
  fill(im, 240, 40, 310, 75, [15, 160, 70]);
  const regions = detectSignRegions(im);
  assert.ok(regions.length >= 2);
});

test("dark blueprint wall ink, 1px anti-alias gap bridging, doorway detection, and cavity-safe candidate snapping", () => {
  const im = image(400, 300);
  // Dark navy/charcoal wall with a 1-pixel anti-aliasing dropout at y=60 and a real doorway opening at y=140..175
  fill(im, 197, 0, 200, 60, [20, 30, 55]);
  fill(im, 197, 61, 200, 140, [20, 30, 55]);
  fill(im, 197, 175, 200, 300, [20, 30, 55]);
  const c = convertPixels(im, { ...DEFAULT_CONVERSION, cols: 40, rows: 30 });
  assert.equal(c.grid["19,6"], "wall");
  assert.equal(c.grid["19,15"], "empty");
  assert.ok(c.doorCandidates.length >= 1);

  // Candidate position avoids a 1-cell enclosed wall pocket at (5,5) and snaps to connected floor
  const pocketGrid = { ...c.grid };
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    pocketGrid[`${5 + dx},${5 + dy}`] = "wall";
  }
  pocketGrid["5,5"] = "empty";
  const snapped = candidatePosition(
    {
      id: "exit-pocket",
      kind: "exit",
      label: "EXIT",
      evidence: "OCR",
      source: "text",
      confidence: "text-match",
      box: { left: 5 / 40, top: 5 / 30, right: 6 / 40, bottom: 6 / 30 },
    },
    { ...DEFAULT_CONVERSION, cols: 40, rows: 30 },
    pocketGrid
  );
  assert.ok(snapped !== null && !(snapped.x === 5 && snapped.y === 5));
});

test("stacked two-line labels merge NO + EXIT and YOU ARE + HERE, and diagonal walls survive", () => {
  const im = image(400, 300);
  // Draw a 45-degree diagonal wall across the center
  for (let t = 40; t < 240; t++) {
    fill(im, t, t, t + 2, t + 2, [15, 15, 15]);
  }
  const c = convertPixels(im, { ...DEFAULT_CONVERSION, cols: 40, rows: 30 });
  assert.equal(c.grid["10,10"], "wall");

  const stackedLabels = mergeStackedAndAdjacentLabels([
    { text: "NO", confidence: 88, kind: "other", box: { left: 0.1, top: 0.1, right: 0.16, bottom: 0.13 } },
    { text: "EXIT", confidence: 90, kind: "exit", box: { left: 0.09, top: 0.135, right: 0.17, bottom: 0.165 } },
    { text: "YOU ARE", confidence: 85, kind: "other", box: { left: 0.5, top: 0.5, right: 0.6, bottom: 0.53 } },
    { text: "HERE", confidence: 89, kind: "other", box: { left: 0.51, top: 0.535, right: 0.59, bottom: 0.565 } },
  ]);
  assert.equal(stackedLabels.length, 2);
  assert.equal(stackedLabels[0].text, "NO EXIT");
  assert.equal(stackedLabels[0].kind, "other");
  assert.equal(stackedLabels[1].text, "YOU ARE HERE");
  assert.equal(stackedLabels[1].kind, "start");

  // Ensure detectCandidates never produces an exit from a stacked NO + EXIT sign
  const candidates = detectCandidates(image(200, 200), [
    { text: "NO", confidence: 88, kind: "other", box: { left: 0.1, top: 0.1, right: 0.16, bottom: 0.13 } },
    { text: "EXIT", confidence: 90, kind: "exit", box: { left: 0.09, top: 0.135, right: 0.17, bottom: 0.165 } },
  ]);
  assert.equal(candidates.filter((cand) => cand.kind === "exit").length, 0);
});
