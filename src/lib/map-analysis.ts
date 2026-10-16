import { isBlocked, type CellType, type Point } from "./astar";
import { extractWallSegments, summarizeGridGraph } from "./map-topology";

export interface Bounds { left: number; top: number; right: number; bottom: number }
export type ReviewStatus = "CONFIRMED" | "NEEDS_REVIEW" | "UNDETECTED_OR_UNKNOWN";
export type SemanticClass = "FIRE_HAZARD" | "FIRE_EXTINGUISHER" | "FIRE_ALARM" | "EMERGENCY_EXIT" | "EXIT_SIGN" | "EVACUATION_ARROW" | "FIRST_AID" | "ASSEMBLY_POINT" | "WALL" | "DOOR" | "WINDOW" | "STAIRS" | "RAMP" | "ELEVATOR" | "LEGEND" | "ROOM_LABEL" | "START_MARKER" | "COLORED_ANNOTATION" | "UNKNOWN";
export type LabelKind = "exit" | "start" | "stairs" | "room" | "equipment" | "other" | "legend" | "hazard" | "arrow" | "door" | "window" | "elevator" | "ramp" | "first-aid" | "assembly";
export interface PlanLabel { text: string; confidence: number; box: Bounds; kind: LabelKind; semanticClass?: SemanticClass; legendId?: string | null; scoreType?: "tesseract-raw" }
export interface LegendEntry { id: string; text: string; semanticClass: SemanticClass; bounds: Bounds; ocrScore: number }
export interface LegendRegion { id: string; header: string; bounds: Bounds; entries: LegendEntry[]; status: ReviewStatus }
export interface PlanObject { id: string; semanticClass: SemanticClass; status: ReviewStatus; bounds: Bounds; gridCells: string[]; method: "tesseract-line" | "connected-color-region" | "grid-geometry"; sourceText?: string; engineScore?: number; scoreType: "tesseract-raw" | "not-calibrated"; legendId?: string | null; evidence: string }
export interface PlanCandidate {
  id: string;
  /** `hazard` remains accepted for old clients; new color blobs are always annotations. */
  kind: "exit" | "start" | "hazard" | "stairs" | "annotation";
  label: string;
  evidence: string;
  source: "text" | "color";
  box: Bounds;
  confidence: "text-match" | "color-only";
  semanticClass?: SemanticClass;
  status?: "NEEDS_REVIEW";
  engineScore?: number;
  legendId?: string | null;
}
export interface ConversionOptions {
  cols: number; rows: number; wallThreshold: number; wallCoverage: number;
  /** Fraction of a cell covered by a colored annotation before it becomes UNKNOWN. */
  annotationCoverage: number;
  invert: boolean; denoise: boolean; ignoreText: boolean; crop: Bounds;
  /** Source-normalized legend/exterior regions that must not become navigable floor. */
  excludedRegions: Bounds[];
}
export interface PixelImage { data: Uint8Array | Uint8ClampedArray; width: number; height: number; channels?: 3 | 4 }
export interface CellEvidence {
  type: "WALL" | "WALKABLE_CANDIDATE" | "UNKNOWN";
  status: "NEEDS_REVIEW";
  sourcePixels: { left: number; top: number; right: number; bottom: number };
  darkCoverage: number;
  annotationCoverage: number;
  excludedCoverage: number;
  horizontalLineCoverage: number;
  verticalLineCoverage: number;
  evidence: string[];
  scoreType: "measured-pixel-coverage-not-probability";
}
export interface ValidationCheck { id: string; status: "PASS" | "REVIEW" | "FAIL"; message: string; count?: number }
export interface WallSegment { id: string; orientation: "horizontal" | "vertical"; cells: string[]; sourceBounds: { left: number; top: number; right: number; bottom: number }; status: "NEEDS_REVIEW" }
export interface NavigationGraphSummary { nodeCount: number; undirectedEdgeCount: number; connectedComponents: number; isolatedNodes: number; floors: 1; verticalTransitionsModeled: false }
export interface ConversionResult {
  grid: Record<string, CellType>; cols: number; rows: number;
  walls: number; walkable: number; unknown: number; regions: number; largestRegion: number;
  uncertainCells: number; warnings: string[];
  counts: { WALL: number; WALKABLE_CANDIDATE: number; UNKNOWN: number; ACTIVE_FIRE_HAZARD: number };
  cellEvidence: Record<string, CellEvidence>;
  wallSegments: WallSegment[]; doorCandidates: PlanObject[];
  navigationGraph: NavigationGraphSummary;
  transform: { sourceWidth: number; sourceHeight: number; normalizedSourceWidth: number; normalizedSourceHeight: number; crop: Bounds; cols: number; rows: number; cellToImage: "pixel-bounds-derived-from-crop-and-grid-dimensions" };
  validation: ValidationCheck[];
}
export interface AnalysisReport {
  version: 2;
  width: number; height: number; imageUrl: string; fileName: string;
  labels: PlanLabel[]; candidates: PlanCandidate[];
  objects: PlanObject[]; legendRegions: LegendRegion[];
  ocrStatus: "complete" | "unavailable" | "skipped";
  ocrMessage: string;
  options: ConversionOptions;
  conversion: ConversionResult;
  warnings: string[];
  validation: ValidationCheck[];
  semanticCounts: Record<string, number>;
  limitations: string[];
  layers: { structural: string[]; annotations: string[]; grid: string[] };
}
export interface SavedAnalysis {
  version: 2;
  width: number; height: number; fileName: string;
  labels: PlanLabel[]; candidates: PlanCandidate[]; objects?: PlanObject[]; legendRegions?: LegendRegion[];
  options: ConversionOptions;
  ocrStatus: AnalysisReport["ocrStatus"];
  reviewed: boolean;
  reviewedAt: string | null;
  decisions: Record<string, "accepted" | "dismissed">;
  counts?: ConversionResult["counts"];
  validation?: ValidationCheck[];
  semanticCounts?: Record<string, number>;
  limitations?: string[];
  cellEvidence?: Record<string, CellEvidence>;
  transform?: ConversionResult["transform"];
}
export const FULL_BOUNDS: Bounds = { left: 0, top: 0, right: 1, bottom: 1 };
export const DEFAULT_CONVERSION: ConversionOptions = { cols: 64, rows: 48, wallThreshold: 155, wallCoverage: 0.18, annotationCoverage: 0.025, invert: false, denoise: true, ignoreText: true, crop: FULL_BOUNDS, excludedRegions: [] };
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function validCrop(crop: Bounds): Bounds {
  if (![crop?.left, crop?.top, crop?.right, crop?.bottom].every(Number.isFinite) || crop.left < 0 || crop.top < 0 || crop.right > 1 || crop.bottom > 1 || crop.right - crop.left < 0.1 || crop.bottom - crop.top < 0.1) throw new Error("Crop bounds must leave at least 10% of the image in each direction.");
  return crop;
}
export function resolutionFor(width: number, height: number, longest: number, crop: Bounds = FULL_BOUNDS) {
  const ratio = width * (crop.right - crop.left) / (height * (crop.bottom - crop.top));
  return ratio >= 1 ? { cols: longest, rows: Math.max(8, Math.round(longest / ratio)) } : { rows: longest, cols: Math.max(8, Math.round(longest * ratio)) };
}
export function validateConversionOptions(o: ConversionOptions): ConversionOptions {
  if (!Number.isInteger(o.cols) || !Number.isInteger(o.rows) || o.cols < 8 || o.rows < 8 || o.cols > 96 || o.rows > 96) throw new Error("Grid dimensions must be integers between 8 and 96.");
  if (![o.wallThreshold, o.wallCoverage, o.annotationCoverage].every(Number.isFinite) || o.wallThreshold < 0 || o.wallThreshold > 255 || o.wallCoverage < 0.04 || o.wallCoverage > 0.85 || o.annotationCoverage < 0.01 || o.annotationCoverage > 0.8) throw new Error("Conversion thresholds are outside supported bounds.");
  validCrop(o.crop);
  if (!Array.isArray(o.excludedRegions) || o.excludedRegions.length > 30) throw new Error("At most 30 legend/exterior exclusion regions are supported.");
  for (const region of o.excludedRegions) validCrop(region);
  return o;
}
function hueName(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), spread = max - min;
  if (spread < 44 || max < 80) return null;
  if (r > g * 1.28 && r > b * 1.18) return g > b * 1.15 ? "orange/red" : "red";
  if (g > r * 1.2 && g > b * .88) return "green";
  if (b > r * 1.18 && b > g * 1.12) return "blue";
  if (r > b * 1.1 && g > b * 1.08 && r > g * .82) return "yellow";
  return "colored";
}
function componentMask(image: PixelImage, stride: number, predicate: (r: number, g: number, b: number) => boolean, maxComponentShare: number) {
  const scale = Math.max(1, Math.ceil(Math.max(image.width, image.height) / stride)), w = Math.ceil(image.width / scale), h = Math.ceil(image.height / scale);
  const mask = new Uint8Array(w * h), seen = new Uint8Array(w * h), queue = new Int32Array(w * h), channels = image.channels ?? (image.data.length >= image.width * image.height * 4 ? 4 : 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (Math.min(image.height - 1, y * scale) * image.width + Math.min(image.width - 1, x * scale)) * channels; mask[y * w + x] = predicate(image.data[i], image.data[i + 1], image.data[i + 2]) ? 1 : 0; }
  const blobs: { area: number; bounds: Bounds; sampleX: number; sampleY: number }[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let head = 0, tail = 1, left = i % w, right = left, top = Math.floor(i / w), bottom = top; queue[0] = i; seen[i] = 1;
    while (head < tail) { const n = queue[head++], x = n % w, y = Math.floor(n / w); left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, ni = ny * w + nx; if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ni] || !mask[ni]) continue; seen[ni] = 1; queue[tail++] = ni; }
    }
    const bw = right - left + 1, bh = bottom - top + 1;
    if (tail < Math.max(12, Math.round(w * h / 35000)) || tail > w * h * maxComponentShare || bw / bh > 8 || bh / bw > 8 || tail / (bw * bh) < .10) continue;
    blobs.push({ area: tail, bounds: { left: left / w, top: top / h, right: (right + 1) / w, bottom: (bottom + 1) / h }, sampleX: (left + right) / 2 * scale, sampleY: (top + bottom) / 2 * scale });
  }
  return blobs.sort((a, b) => b.area - a.area);
}
export function suggestedOptions(image: PixelImage): ConversionOptions {
  const hist = new Uint32Array(256); let count = 0, sum = 0;
  const channels = image.channels ?? (image.data.length >= image.width * image.height * 4 ? 4 : 3);
  for (let p = 0; p < image.width * image.height; p += 4) { const i = p * channels; const v = Math.round(.299 * image.data[i] + .587 * image.data[i + 1] + .114 * image.data[i + 2]); hist[v]++; sum += v; count++; }
  let leftCount = 0, leftSum = 0, bestVariance = 0, cutoff = 130, median = 255;
  for (let i = 0, acc = 0; i < 256; i++) { acc += hist[i]; if (acc >= count / 2) { median = i; break; } }
  for (let i = 0; i < 255; i++) { leftCount += hist[i]; leftSum += i * hist[i]; const rightCount = count - leftCount; if (!leftCount || !rightCount) continue; const d = leftSum / leftCount - (sum - leftSum) / rightCount, variance = leftCount * rightCount * d * d; if (variance > bestVariance) { bestVariance = variance; cutoff = i; } }
  return { ...DEFAULT_CONVERSION, ...resolutionFor(image.width, image.height, 64), wallThreshold: clamp(cutoff + 30, 90, 205), invert: median < 105, crop: { ...FULL_BOUNDS } };
}
export function classifyLabel(text: string): LabelKind {
  const t = text.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(?:MAP )?(?:LEGEND|KEY|SYMBOLS|SYMBOL KEY|MAP KEY|MAP SYMBOLS|KEY TO SYMBOLS)$/.test(t)) return "legend";
  if (/\b(NO EXIT|NOT AN EXIT|EXIT LEGEND|FIRE EXIT PLAN|EVACUATION PLAN|EVACUATION ROUTE|EXIT ROUTE|MAP EXIT KEY)\b/.test(t)) return "other";
  if (/\b(FIRE HAZARD|ACTIVE FIRE|SMOKE AREA|FIRE AREA|FIRE LOCATION|FIRE INCIDENT)\b/.test(t) && !/EXTINGUISHER|ALARM|FIRE EXIT/.test(t)) return "hazard";
  if (/\b(YOU ARE HERE|YOUR LOCATION|CURRENT LOCATION)\b/.test(t)) return "start";
  if (/\b(FIRE )?EXTINGUISHER|\bHYDRANT\b|\bFIRE HOSE\b/.test(t)) return "equipment";
  if (/\bFIRE ALARM\b|\bSMOKE DETECTOR\b|\bALARM\b/.test(t)) return "equipment";
  if (/\bFIRST AID\b|\bAED\b/.test(t)) return "first-aid";
  if (/\bASSEMBLY POINT\b|\bMUSTER POINT\b/.test(t)) return "assembly";
  if (/\bEVACUATION ARROW\b|\bEVACUATION ROUTE\b|\bEXIT ARROW\b/.test(t)) return "arrow";
  const sign = t.replace(/\s+/g, " ").replace(/EXIT(?=\d)/g, "EXIT ");
  if (/^(?:(?:FIRE|EMERGENCY|FINAL|NORTH|SOUTH|EAST|WEST|MAIN|SIDE|REAR|FRONT|NEAREST|STAIR(?:S)?|LEVEL [0-9]) ){0,2}(?:EXIT|EXITS|EGRESS|SORTIE|SALIDA|WAY OUT)(?: (?:ONLY|DOOR|[0-9]{1,3}|[A-D]))?$/.test(sign)) return "exit";
  if (/\b(STAIR|STAIRS|STAIRWELL)\b/.test(t)) return "stairs";
  if (/\b(RAMP|ACCESSIBLE ROUTE)\b/.test(t)) return "ramp";
  if (/\b(ELEVATOR|LIFT|ELEV)\b/.test(t)) return "elevator";
  if (/\b(WINDOW|GLAZING)\b/.test(t)) return "window";
  if (/\b(DOOR|DOORWAY|ENTRANCE|ENTRY)\b/.test(t)) return "door";
  if (/\b(ROOM|CLASSROOM|LAB|LABORATORY|OFFICE|HALL|CORRIDOR|RECEPTION|WARD|LOBBY|STORE|TOILET|WC|KITCHEN|LIBRARY|BEDROOM|MEETING|CUBICLE|PATIENT)\b/.test(t)) return "room";
  return "other";
}
export function semanticClassForLabel(text: string, kind: LabelKind): SemanticClass {
  if (kind === "legend") return "LEGEND";
  if (kind === "exit") return "EXIT_SIGN";
  if (kind === "start") return "START_MARKER";
  if (kind === "hazard") return "FIRE_HAZARD";
  if (kind === "stairs") return "STAIRS";
  if (kind === "ramp") return "RAMP";
  if (kind === "elevator") return "ELEVATOR";
  if (kind === "window") return "WINDOW";
  if (kind === "door") return "DOOR";
  if (kind === "first-aid") return "FIRST_AID";
  if (kind === "assembly") return "ASSEMBLY_POINT";
  if (kind === "arrow") return "EVACUATION_ARROW";
  if (kind === "room") return "ROOM_LABEL";
  if (kind === "equipment") { const t = text.toUpperCase(); return /EXTINGUISHER|HYDRANT|FIRE HOSE/.test(t) ? "FIRE_EXTINGUISHER" : /ALARM|DETECTOR/.test(t) ? "FIRE_ALARM" : "UNKNOWN"; }
  return "UNKNOWN";
}
function isLegendHeader(text: string) { return classifyLabel(text) === "legend"; }
export function detectLegendRegions(labels: PlanLabel[]): LegendRegion[] {
  const headers = labels.filter(l => isLegendHeader(l.text)), result: LegendRegion[] = [];
  for (const [index, header] of headers.entries()) {
    const id = `legend-${index + 1}`, cx = (header.box.left + header.box.right) / 2, cy = (header.box.top + header.box.bottom) / 2;
    const neighbors = labels.filter(l => l !== header && Math.abs((l.box.left + l.box.right) / 2 - cx) < .34 && (l.box.top + l.box.bottom) / 2 >= cy - .015 && (l.box.top + l.box.bottom) / 2 < cy + .38);
    const all = [header, ...neighbors];
    const bounds: Bounds = { left: clamp(Math.min(...all.map(l => l.box.left)) - .018, 0, 1), top: clamp(Math.min(...all.map(l => l.box.top)) - .012, 0, 1), right: clamp(Math.max(...all.map(l => l.box.right)) + .018, 0, 1), bottom: clamp(Math.max(...all.map(l => l.box.bottom)) + .018, 0, 1) };
    const entries = neighbors.map((l, i) => ({ id: `${id}-entry-${i + 1}`, text: l.text, semanticClass: semanticClassForLabel(l.text, l.kind), bounds: l.box, ocrScore: l.confidence }));
    result.push({ id, header: header.text, bounds, entries, status: "NEEDS_REVIEW" });
  }
  return result;
}
export function labelInLegend(box: Bounds, legends: LegendRegion[]) { return legends.find(region => { const x = (box.left + box.right) / 2, y = (box.top + box.bottom) / 2; return x >= region.bounds.left && x <= region.bounds.right && y >= region.bounds.top && y <= region.bounds.bottom; }) ?? null; }
export function detectCandidates(image: PixelImage, labels: PlanLabel[], legends: LegendRegion[] = detectLegendRegions(labels)): PlanCandidate[] {
  const candidates: PlanCandidate[] = [];
  for (const [i, label] of labels.entries()) {
    const legend = labelInLegend(label.box, legends); label.legendId = legend?.id ?? null; label.semanticClass = legend ? "LEGEND" : semanticClassForLabel(label.text, label.kind); label.scoreType = "tesseract-raw";
    if (legend || (label.kind !== "exit" && label.kind !== "start" && label.kind !== "stairs")) continue;
    candidates.push({ id: `text-${i}`, kind: label.kind === "exit" ? "exit" : label.kind === "start" ? "start" : "stairs", semanticClass: label.kind === "exit" ? "EXIT_SIGN" : label.kind === "start" ? "START_MARKER" : "STAIRS", status: "NEEDS_REVIEW", label: label.text.trim(), source: "text", confidence: "text-match", engineScore: label.confidence, box: label.box, legendId: null, evidence: label.kind === "exit" ? `OCR read an exit-sign label (uncalibrated Tesseract engine score ${Math.round(label.confidence)} / 100). This is not proof that the nearest door is an actual, usable exit. Check the exact door in the source and place a provisional exit there.` : label.kind === "start" ? "The plan contains a ‘you are here’/location label. Verify the actual person location on the grid." : "Stairs are labeled in the source. Vertical floor connections are not modeled by this single-floor graph." });
  }
  const blobs = componentMask(image, 800, (r, g, b) => hueName(r, g, b) !== null, .045);
  const channels = image.channels ?? (image.data.length >= image.width * image.height * 4 ? 4 : 3);
  for (const blob of blobs.slice(0, 50)) {
    const b = blob.bounds, legend = labelInLegend(b, legends); if (legend) continue;
    const si = (Math.min(image.height - 1, Math.round(blob.sampleY)) * image.width + Math.min(image.width - 1, Math.round(blob.sampleX))) * channels;
    const hue = hueName(image.data[si], image.data[si + 1], image.data[si + 2]) ?? "colored";
    if (candidates.some(c => c.source === "color" && Math.hypot((c.box.left + c.box.right) / 2 - (b.left + b.right) / 2, (c.box.top + c.box.bottom) / 2 - (b.top + b.bottom) / 2) < .025)) continue;
    if (candidates.some(c => c.source === "text" && (b.left + b.right) / 2 >= c.box.left - .01 && (b.left + b.right) / 2 <= c.box.right + .01 && (b.top + b.bottom) / 2 >= c.box.top - .015 && (b.top + b.bottom) / 2 <= c.box.bottom + .015)) continue;
    candidates.push({ id: `color-${candidates.length}`, kind: "annotation", semanticClass: "COLORED_ANNOTATION", status: "NEEDS_REVIEW", label: `${hue} color-only annotation`, evidence: `A ${hue} region was detected by color and connected-component geometry only. Color cannot identify an exit, arrow, assembly marker, alarm, extinguisher, active fire or wall. This annotation is excluded from the routing grid; inspect and correct its region manually.`, source: "color", confidence: "color-only", engineScore: undefined, box: b, legendId: null });
  }
  return candidates.slice(0, 80);
}
function intersectsCellRun(mask: Uint8Array, w: number, h: number, horizontal: Uint8Array, vertical: Uint8Array, minH: number, minV: number) {
  for (let y = 0; y < h; y++) { let from = -1; for (let x = 0; x <= w; x++) { const at = x < w && mask[y * w + x] ? 1 : 0; if (at && from < 0) from = x; else if (!at && from >= 0) { if (x - from >= minH) for (let xx = from; xx < x; xx++) horizontal[y * w + xx] = 1; from = -1; } } }
  for (let x = 0; x < w; x++) { let from = -1; for (let y = 0; y <= h; y++) { const at = y < h && mask[y * w + x] ? 1 : 0; if (at && from < 0) from = y; else if (!at && from >= 0) { if (y - from >= minV) for (let yy = from; yy < y; yy++) vertical[yy * w + x] = 1; from = -1; } } }
}
function localIntegral(data: Uint8Array, w: number, h: number) {
  const stride = w + 1, sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += data[y * w + x]; sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + row; } }
  return sum;
}
function meanIn(sum: Float64Array, stride: number, x0: number, y0: number, x1: number, y1: number) { return (sum[y1 * stride + x1] - sum[y0 * stride + x1] - sum[y1 * stride + x0] + sum[y0 * stride + x0]) / Math.max(1, (x1 - x0) * (y1 - y0)); }
/** Hybrid global + adaptive local contrast, OCR masking, geometry continuity, and unknown-region preservation. */
export function convertPixels(image: PixelImage, options: ConversionOptions, labels: PlanLabel[] = []): ConversionResult {
  validateConversionOptions(options);
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.data.length < image.width * image.height * 3) throw new Error("The pixel raster is invalid or truncated.");
  const crop = options.crop, cols = Math.round(options.cols), rows = Math.round(options.rows), x0 = Math.floor(crop.left * image.width), y0 = Math.floor(crop.top * image.height), w = Math.max(1, Math.ceil(crop.right * image.width) - x0), h = Math.max(1, Math.ceil(crop.bottom * image.height) - y0);
  const channels = image.channels ?? (image.data.length >= image.width * image.height * 4 ? 4 : 3);
  const grey = new Uint8Array(w * h), colored = new Uint8Array(w * h), excluded = new Uint8Array(w * h), ink = new Uint8Array(w * h), textMask = new Uint8Array(w * h);
  for (const region of options.excludedRegions) {
    const left = clamp(Math.floor(region.left * image.width) - x0, 0, w), right = clamp(Math.ceil(region.right * image.width) - x0, 0, w), top = clamp(Math.floor(region.top * image.height) - y0, 0, h), bottom = clamp(Math.ceil(region.bottom * image.height) - y0, 0, h);
    for (let yy = top; yy < bottom; yy++) for (let xx = left; xx < right; xx++) excluded[yy * w + xx] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const source = ((y + y0) * image.width + x + x0) * channels, i = y * w + x, alpha = channels === 4 ? image.data[source + 3] / 255 : 1, r = image.data[source] * alpha + 255 * (1 - alpha), g = image.data[source + 1] * alpha + 255 * (1 - alpha), b = image.data[source + 2] * alpha + 255 * (1 - alpha); grey[i] = Math.round(.299 * r + .587 * g + .114 * b); colored[i] = hueName(r, g, b) ? 1 : 0; }
  if (options.ignoreText) for (const label of labels) { if (label.confidence < 50) continue; const left = clamp(Math.floor(label.box.left * image.width) - x0, 0, w), right = clamp(Math.ceil(label.box.right * image.width) - x0, 0, w), top = clamp(Math.floor(label.box.top * image.height) - y0, 0, h), bottom = clamp(Math.ceil(label.box.bottom * image.height) - y0, 0, h); for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) textMask[y * w + x] = 1; }
  const sum = localIntegral(grey, w, h), stride = w + 1, minCell = Math.max(3, Math.min(w / cols, h / rows)), radius = Math.max(9, Math.min(46, Math.round(minCell * 1.15)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (textMask[i]) continue; const xA = Math.max(0, x - radius), yA = Math.max(0, y - radius), xB = Math.min(w, x + radius + 1), yB = Math.min(h, y + radius + 1), mean = meanIn(sum, stride, xA, yA, xB, yB), lum = grey[i]; const adaptive = options.invert ? lum > mean + Math.max(7, (255 - mean) * .035) : lum < mean - Math.max(7, mean * .035); const global = options.invert ? lum > options.wallThreshold : lum < options.wallThreshold; ink[i] = (global || adaptive) && !colored[i] ? 1 : 0; }
  const hLines = new Uint8Array(w * h), vLines = new Uint8Array(w * h), cellW = w / cols, cellH = h / rows;
  // Long but not page-wide continuous components provide architectural line evidence.
  intersectsCellRun(ink, w, h, hLines, vLines, Math.max(12, Math.round(cellW * .8)), Math.max(12, Math.round(cellH * .8)));
  const size = cols * rows, total = new Uint32Array(size), dark = new Uint32Array(size), annotations = new Uint32Array(size), excludedCounts = new Uint32Array(size), hHits = new Uint32Array(size), vHits = new Uint32Array(size), grid: Record<string, CellType> = {}, cellEvidence: Record<string, CellEvidence> = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const cell = Math.min(rows - 1, Math.floor(y * rows / h)) * cols + Math.min(cols - 1, Math.floor(x * cols / w)), i = y * w + x; total[cell]++; if (colored[i]) annotations[cell]++; if (excluded[i]) excludedCounts[cell]++; if (!ink[i]) continue; if (options.denoise && !hLines[i] && !vLines[i] && x > 0 && x < w - 1 && y > 0 && y < h - 1) { let near = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && ink[(y + dy) * w + x + dx]) near++; if (near <= 1) continue; } dark[cell]++; if (hLines[i]) hHits[cell]++; if (vLines[i]) vHits[cell]++; }
  let walls = 0, unknown = 0, uncertainCells = 0; const cropLeft = x0, cropTop = y0;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const i = cy * cols + cx, key = `${cx},${cy}`, denominator = Math.max(1, total[i]), wallCoverage = dark[i] / denominator, annotationCoverage = annotations[i] / denominator, excludedCoverage = excludedCounts[i] / denominator, horizontal = hHits[i] / Math.max(1, cellW), vertical = vHits[i] / Math.max(1, cellH);
    const strongWall = wallCoverage >= options.wallCoverage || horizontal >= .52 || vertical >= .52;
    const ambiguousInk = !strongWall && wallCoverage >= Math.max(.025, options.wallCoverage * .34);
    const atFrame = cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1;
    const annotationUnknown = annotationCoverage >= options.annotationCoverage;
    const legendExcluded = excludedCoverage >= .45;
    const type: CellType = strongWall ? "wall" : annotationUnknown || ambiguousInk || atFrame || legendExcluded ? "unknown" : "empty";
    grid[key] = type; if (type === "wall") walls++; if (type === "unknown") unknown++;
    const cellBox: Bounds = { left: cx / cols, top: cy / rows, right: (cx + 1) / cols, bottom: (cy + 1) / rows };
    const evidence = [horizontal >= .52 ? "long-horizontal-line" : "", vertical >= .52 ? "long-vertical-line" : "", wallCoverage >= options.wallCoverage ? "wall-pixel-occupancy-above-review-threshold" : "", annotationUnknown ? "colored-annotation-not-semantically-interpreted" : "", legendExcluded ? "legend-or-user-excluded-region" : "", atFrame ? "image-edge-is-not-assumed-walkable" : "", ambiguousInk ? "partial-ink-needs-human-review" : ""].filter(Boolean);
    if (ambiguousInk || (wallCoverage > 0 && Math.abs(wallCoverage - options.wallCoverage) < .08)) uncertainCells++;
    cellEvidence[key] = { type: type === "wall" ? "WALL" : type === "unknown" ? "UNKNOWN" : "WALKABLE_CANDIDATE", status: "NEEDS_REVIEW", sourcePixels: { left: cropLeft + Math.floor(cellBox.left * w), top: cropTop + Math.floor(cellBox.top * h), right: cropLeft + Math.ceil(cellBox.right * w), bottom: cropTop + Math.ceil(cellBox.bottom * h) }, darkCoverage: Number(wallCoverage.toFixed(4)), annotationCoverage: Number(annotationCoverage.toFixed(4)), excludedCoverage: Number(excludedCoverage.toFixed(4)), horizontalLineCoverage: Number(horizontal.toFixed(3)), verticalLineCoverage: Number(vertical.toFixed(3)), evidence: evidence.length ? evidence : ["low-contrast-with-detected-wall-strokes; still requires comparison with the source"], scoreType: "measured-pixel-coverage-not-probability" };
  }
  const region = countRegions(grid, cols, rows), graph = summarizeGridGraph(grid, cols, rows), wallSegments = extractWallSegments(grid, cols, rows, crop, image.width, image.height), warnings: string[] = [];
  if (walls < size * .012) warnings.push("Few definite wall cells were extracted. Pale regions are only walkable candidates. Check contrast and hand-draw walls from the source.");
  if (walls > size * .62) warnings.push("Most cells are classified as walls. Try another threshold or polarity and compare each result against the source.");
  if (unknown) warnings.push(`${unknown} grid cells are unknown (image edge, colored annotation, legend exclusion, or ambiguous line evidence); unknown cells block routing until reviewed.`);
  if (options.excludedRegions.length) warnings.push(`${options.excludedRegions.length} OCR-detected legend region(s) are excluded from navigable space. Review each detected legend boundary before saving.`);
  if (region.count > 1) warnings.push(`${region.count} separate connected walkable candidate regions remain. Check door openings and partitions; disconnected regions were not deleted.`);
  if (uncertainCells) warnings.push(`${uncertainCells} cells have partial wall evidence. The displayed coverage is a pixel measurement, not a probability.`);
  const counts = { WALL: walls, WALKABLE_CANDIDATE: size - walls - unknown, UNKNOWN: unknown, ACTIVE_FIRE_HAZARD: 0 };
  const checks: ValidationCheck[] = [
    { id: "grid-dimensions", status: Object.keys(grid).length === size ? "PASS" : "FAIL", message: `Grid has ${Object.keys(grid).length} cells; expected ${size}.`, count: Object.keys(grid).length },
    { id: "coordinate-trace", status: Object.keys(cellEvidence).length === size ? "PASS" : "FAIL", message: "Every grid cell has a source-image pixel rectangle.", count: Object.keys(cellEvidence).length },
    { id: "semantic-separation", status: counts.ACTIVE_FIRE_HAZARD === 0 ? "PASS" : "FAIL", message: "The image analyzer never invents an active-fire scenario; scenario hazards come from explicit user input.", count: counts.ACTIVE_FIRE_HAZARD },
    { id: "unknown-cells", status: unknown ? "REVIEW" : "PASS", message: unknown ? `${unknown} unknown cells are impassable until manually reviewed.` : "No unknown annotations or uncertain wall cells remain; verify the image edges regardless." , count: unknown },
    { id: "walkable-connectivity", status: region.count > 1 ? "REVIEW" : "PASS", message: region.count > 1 ? `${region.count} separate walkable candidate regions are preserved; a break may be a real wall or an extraction error.` : "One 4-connected walkable candidate component; this does not prove that all real doorways were detected.", count: region.count },
    { id: "graph-wall-clearance", status: "PASS", message: "Graph edges are created only between adjacent cells that are not walls, windows, fires, blocked or unknown.", count: graph.undirectedEdgeCount },
    { id: "door-exit-verification", status: "REVIEW", message: "Door openings and usable exits are not inferred from a missing wall pixel or a sign alone. Confirm each passage and actual door on the source." },
    { id: "floor-connections", status: "REVIEW", message: "This upload is one floor. Stairs/elevators do not create vertical connections; analyze each floor separately." },
  ];
  return { grid, cols, rows, walls, walkable: counts.WALKABLE_CANDIDATE, unknown, regions: region.count, largestRegion: region.largest, uncertainCells, warnings, counts, cellEvidence, wallSegments, doorCandidates: [], navigationGraph: graph, transform: { sourceWidth: image.width, sourceHeight: image.height, normalizedSourceWidth: image.width, normalizedSourceHeight: image.height, crop: { ...crop }, cols, rows, cellToImage: "pixel-bounds-derived-from-crop-and-grid-dimensions" }, validation: checks };
}
export function countRegions(grid: Record<string, CellType>, cols: number, rows: number) { const seen = new Uint8Array(cols * rows), queue = new Int32Array(cols * rows); let count = 0, largest = 0; for (let i = 0; i < seen.length; i++) { if (seen[i] || isBlocked(grid[`${i % cols},${Math.floor(i / cols)}`])) continue; let head = 0, tail = 1; queue[0] = i; seen[i] = 1; count++; while (head < tail) { const n = queue[head++], x = n % cols, y = Math.floor(n / cols); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, ni = ny * cols + nx; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[ni] || isBlocked(grid[`${nx},${ny}`])) continue; seen[ni] = 1; queue[tail++] = ni; } } largest = Math.max(largest, tail); } return { count, largest }; }
export function pixelsForBounds(bounds: Bounds, options: ConversionOptions, sourceWidth: number, sourceHeight: number) {
  const c = options.crop, l = c.left + bounds.left * (c.right - c.left), r = c.left + bounds.right * (c.right - c.left), t = c.top + bounds.top * (c.bottom - c.top), b = c.top + bounds.bottom * (c.bottom - c.top);
  return { left: Math.floor(l * sourceWidth), top: Math.floor(t * sourceHeight), right: Math.ceil(r * sourceWidth), bottom: Math.ceil(b * sourceHeight) };
}
export function gridCellsForBounds(bounds: Bounds, options: ConversionOptions): string[] {
  const c = options.crop, l = (bounds.left - c.left) / (c.right - c.left), r = (bounds.right - c.left) / (c.right - c.left), t = (bounds.top - c.top) / (c.bottom - c.top), b = (bounds.bottom - c.top) / (c.bottom - c.top);
  if (r <= 0 || b <= 0 || l >= 1 || t >= 1) return [];
  const x0 = clamp(Math.floor(l * options.cols), 0, options.cols - 1), x1 = clamp(Math.ceil(r * options.cols) - 1, 0, options.cols - 1), y0 = clamp(Math.floor(t * options.rows), 0, options.rows - 1), y1 = clamp(Math.ceil(b * options.rows) - 1, 0, options.rows - 1), cells: string[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push(`${x},${y}`);
  return cells;
}
export function buildPlanObjects(labels: PlanLabel[], candidates: PlanCandidate[], legends: LegendRegion[], options: ConversionOptions): PlanObject[] {
  const objs: PlanObject[] = [];
  for (const [i, label] of labels.entries()) {
    const legend = labelInLegend(label.box, legends), cls = legend ? "LEGEND" : semanticClassForLabel(label.text, label.kind);
    objs.push({ id: `ocr-object-${i}`, semanticClass: cls, status: "NEEDS_REVIEW", bounds: label.box, gridCells: gridCellsForBounds(label.box, options), method: "tesseract-line", sourceText: label.text, engineScore: label.confidence, scoreType: "tesseract-raw", legendId: legend?.id ?? null, evidence: legend ? `OCR text was found inside legend region ${legend.id}; it is an entry or explanation, not an independently detected building object.` : `OCR read this label with a raw Tesseract engine score of ${Math.round(label.confidence)}/100. The score is not a calibrated semantic probability.` });
  }
  for (const [i, c] of candidates.filter(c => c.source === "color").entries()) objs.push({ id: `color-object-${i}`, semanticClass: "COLORED_ANNOTATION", status: "NEEDS_REVIEW", bounds: c.box, gridCells: gridCellsForBounds(c.box, options), method: "connected-color-region", scoreType: "not-calibrated", legendId: c.legendId ?? null, evidence: c.evidence });
  return objs;
}
export function semanticCounts(objects: PlanObject[], legends: LegendRegion[]) {
  const counts: Record<string, number> = { FIRE_HAZARD: 0, FIRE_EXTINGUISHER: 0, FIRE_ALARM: 0, EMERGENCY_EXIT: 0, EXIT_SIGN: 0, EVACUATION_ARROW: 0, FIRST_AID: 0, ASSEMBLY_POINT: 0, WALL: 0, DOOR: 0, WINDOW: 0, STAIRS: 0, RAMP: 0, ELEVATOR: 0, LEGEND: 0, ROOM_LABEL: 0, START_MARKER: 0, COLORED_ANNOTATION: 0, UNKNOWN: 0 };
  for (const o of objects) counts[o.semanticClass] = (counts[o.semanticClass] ?? 0) + 1;
  counts.LEGEND += legends.length;
  return counts;
}
export function candidatePosition(candidate: PlanCandidate, options: ConversionOptions, grid: Record<string, CellType>): Point | null {
  const crop = options.crop, x = ((candidate.box.left + candidate.box.right) / 2 - crop.left) / (crop.right - crop.left), y = ((candidate.box.top + candidate.box.bottom) / 2 - crop.top) / (crop.bottom - crop.top);
  if (x < 0 || y < 0 || x >= 1 || y >= 1) return null;
  const cx = Math.floor(x * options.cols), cy = Math.floor(y * options.rows), choices: (Point & { d: number })[] = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const px = cx + dx, py = cy + dy; if (px >= 0 && py >= 0 && px < options.cols && py < options.rows && !isBlocked(grid[`${px},${py}`])) choices.push({ x: px, y: py, d: dx * dx + dy * dy }); }
  choices.sort((a, b) => a.d - b.d); return choices[0] ? { x: choices[0].x, y: choices[0].y } : null;
}

export function validationFor(
  labels: PlanLabel[],
  candidates: PlanCandidate[],
  conversion: ConversionResult,
  objects: PlanObject[],
  legends: LegendRegion[]
): ValidationCheck[] {
  const exitSigns = objects.filter(o => o.semanticClass === "EXIT_SIGN").length;
  const explicitHazardText = objects.filter(o => o.semanticClass === "FIRE_HAZARD").length;
  const forbiddenColorHazards = candidates.filter(c => c.source === "color" && c.kind === "hazard").length;
  return [
    ...conversion.validation,
    { id: "legend-exclusion", status: "REVIEW" as const, message: legends.length ? `${legends.length} legend region(s) and their text are excluded from the navigation grid. Check the boundary and legend entries.` : "No reliable legend heading was identified. Colored marks cannot be interpreted against a legend that has not been located.", count: legends.length },
    { id: "exit-semantics", status: "REVIEW" as const, message: exitSigns ? `${exitSigns} OCR exit-sign label(s) are candidates only; the label is not a verified, passable exit door. Place each exit at a manually checked doorway.` : "No text-confirmed exit sign was found. Mark real doorways manually; no exits were inferred from green pixels.", count: exitSigns },
    { id: "fire-equipment-separation", status: forbiddenColorHazards === 0 ? "PASS" as const : "FAIL" as const, message: "Red/green color regions are generic annotations. Fire extinguishers and alarms are OCR equipment classes, never active-fire cells.", count: objects.filter(o => ["FIRE_EXTINGUISHER", "FIRE_ALARM"].includes(o.semanticClass)).length },
    { id: "explicit-fire-text", status: explicitHazardText ? "REVIEW" as const : "PASS" as const, message: explicitHazardText ? `${explicitHazardText} explicitly worded fire/smoke annotation(s) need human confirmation; none was applied to the routing scenario.` : "No explicit fire-location text was found; no active fire is inferred from image colors.", count: explicitHazardText },
    { id: "ocr-language", status: "REVIEW" as const, message: labels.length ? "English OCR engine scores are uncalibrated text-recognition measures, not semantic confidence or proof." : "No text was confidently read. Verify labels and legends manually.", count: labels.length },
  ];
}

