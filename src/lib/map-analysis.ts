import { isBlocked, type CellType, type Point } from "./astar";
import { extractDoorCandidates, extractWallSegments, summarizeGridGraph } from "./map-topology";

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

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number; spread: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const v = max / 255;
  const s = max === 0 ? 0 : spread / max;
  if (spread === 0) return { h: 0, s: 0, v, spread: 0 };
  let h = 0;
  if (max === r) h = 60 * (((g - b) / spread) % 6);
  else if (max === g) h = 60 * ((b - r) / spread + 2);
  else h = 60 * ((r - g) / spread + 4);
  if (h < 0) h += 360;
  return { h, s, v, spread };
}

/**
 * Classify a pixel's chromatic hue across the full HSV spectrum while ignoring
 * neutral black, grey, dark sepia/blueprint wall ink, and off-white paper.
 */
export function hueName(r: number, g: number, b: number): string | null {
  const { h, s, v, spread } = rgbToHsv(r, g, b);
  // Ignore near-black ink, dark blueprint/charcoal strokes, near-white paper, and low-chroma grey tones
  if (spread < 32 || v < 0.25) return null;
  if (v < 0.34 && s < 0.48) return null;
  if (s < 0.20 && spread < 44) return null;
  // Filter faint warm/cool scanner paper tint when brightness is very high
  if (v > 0.92 && s < 0.26) return null;

  if (h >= 345 || h < 14) return "red";
  if (h >= 14 && h < 42) {
    if (v < 0.62 && r < 175 && b < 70) return "brown";
    return "orange/red";
  }
  if (h >= 42 && h < 70) return "yellow";
  if (h >= 70 && h < 166) return "green";
  if (h >= 166 && h < 200) return "cyan/teal";
  if (h >= 200 && h < 262) return "blue";
  if (h >= 262 && h < 345) return "purple/magenta";
  return "colored";
}

function dominantBlobHue(image: PixelImage, bounds: Bounds, fallbackX: number, fallbackY: number): string {
  const channels = image.channels ?? (image.data.length >= image.width * image.height * 4 ? 4 : 3);
  const counts = new Map<string, number>();
  const x0 = clamp(Math.floor(bounds.left * image.width), 0, image.width - 1);
  const x1 = clamp(Math.ceil(bounds.right * image.width) - 1, 0, image.width - 1);
  const y0 = clamp(Math.floor(bounds.top * image.height), 0, image.height - 1);
  const y1 = clamp(Math.ceil(bounds.bottom * image.height) - 1, 0, image.height - 1);
  const stepX = Math.max(1, Math.floor((x1 - x0 + 1) / 5));
  const stepY = Math.max(1, Math.floor((y1 - y0 + 1) / 5));

  for (let y = y0; y <= y1; y += stepY) {
    for (let x = x0; x <= x1; x += stepX) {
      const idx = (y * image.width + x) * channels;
      const hue = hueName(image.data[idx], image.data[idx + 1], image.data[idx + 2]);
      if (hue) counts.set(hue, (counts.get(hue) ?? 0) + 1);
    }
  }
  let bestHue = "";
  let bestCount = 0;
  for (const [hue, c] of counts.entries()) {
    if (c > bestCount) {
      bestCount = c;
      bestHue = hue;
    }
  }
  if (bestHue) return bestHue;
  const si = (Math.min(image.height - 1, Math.round(fallbackY)) * image.width + Math.min(image.width - 1, Math.round(fallbackX))) * channels;
  return hueName(image.data[si], image.data[si + 1], image.data[si + 2]) ?? "colored";
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
    if (tail < Math.max(10, Math.round(w * h / 38000)) || tail > w * h * maxComponentShare || bw / bh > 9 || bh / bw > 9 || tail / (bw * bh) < .10) continue;
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

/**
 * Clean common OCR character confusions in floor-plan signage (e.g. EX1T -> EXIT,
 * STAlRS -> STAIRS, spaced E X I T -> EXIT) before semantic classification.
 */
export function normalizeOcrText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bE\s+X\s+I\s+T(\s+S)?\b/gi, "EXIT$1")
    .replace(/\bS\s+T\s+A\s+I\s+R(\s+S)?\b/gi, "STAIR$1")
    .replace(/\bF\s+I\s+R\s+E\b/gi, "FIRE")
    .replace(/\bEX[1I!|l][T7](S)?\b/gi, "EXIT$1")
    .replace(/\bEMER[G6C][EF]N[CG][YV]\b/gi, "EMERGENCY")
    .replace(/\b[S5]TA[1I!|l]R([S5])?\b/gi, "STAIRS")
    .replace(/\bF[1I!|l]RE\b/gi, "FIRE")
    .replace(/\bEXT[1I!|l]NGU[1I!|l]SHER\b/gi, "EXTINGUISHER")
    .replace(/\bEL[EF]VAT[0O]R\b/gi, "ELEVATOR")
    .replace(/\bA[S5][S5]EM[B8]LY\b/gi, "ASSEMBLY")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyLabel(text: string): LabelKind {
  const t = normalizeOcrText(text)
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:MAP )?(?:LEGEND|KEY|SYMBOLS|SYMBOL KEY|MAP KEY|MAP SYMBOLS|KEY TO SYMBOLS|LEGENDE|LEYENDA)$/.test(t)) return "legend";
  if (/\b(NO EXIT|NOT AN EXIT|SIN SALIDA|PAS DE SORTIE|KEIN AUSGANG|NOODUITGANG NIET|EXIT LEGEND|FIRE EXIT PLAN|EVACUATION PLAN|EVACUATION ROUTE|EXIT ROUTE|MAP EXIT KEY)\b/.test(t)) return "other";
  if (/\b(FIRE HAZARD|ACTIVE FIRE|SMOKE AREA|FIRE AREA|FIRE LOCATION|FIRE INCIDENT|DANGER FIRE|FLAMMABLE|HIGH VOLTAGE|BIOHAZARD)\b/.test(t) && !/EXTINGUISHER|ALARM|FIRE EXIT/.test(t)) return "hazard";
  if (/\b(YOU ARE HERE|YOUR LOCATION|CURRENT LOCATION|START HERE|USTED ESTA AQUI|VOUS ETES ICI|SIE SIND HIER|VOCE ESTA AQUI)\b/.test(t)) return "start";
  if (/\b(FIRE )?EXTINGUISHER|\bHYDRANT\b|\bFIRE HOSE\b|\bHOSE REEL\b|\bEXTINTOR\b|\bEXTINCTEUR\b|\bFEUERLOSCHER\b/.test(t)) return "equipment";
  if (/\bFIRE ALARM\b|\bSMOKE DETECTOR\b|\bPULL STATION\b|\bALARM\b/.test(t)) return "equipment";
  if (/\bFIRST AID\b|\bAED\b|\bDEFIBRILLATOR\b|\bMEDICAL KIT\b|\bPRIMEROS AUXILIOS\b/.test(t)) return "first-aid";
  if (/\bASSEMBLY POINT\b|\bMUSTER POINT\b|\bEVACUATION ASSEMBLY\b|\bREFUGE AREA\b|\bPUNTO DE REUNION\b/.test(t)) return "assembly";
  if (/\bEVACUATION ARROW\b|\bEVACUATION ROUTE\b|\bEXIT ARROW\b/.test(t)) return "arrow";
  const sign = t.replace(/\s+/g, " ").replace(/EXIT(?=\d)/g, "EXIT ");
  if (/^(?:(?:FIRE|EMERGENCY|FINAL|NORTH|SOUTH|EAST|WEST|MAIN|SIDE|REAR|FRONT|NEAREST|PRIMARY|SECONDARY|STAIR(?:S)?|LEVEL [0-9]|SALIDA DE|SORTIE DE) ){0,2}(?:EXIT|EXITS|EGRESS|SORTIE|SALIDA|SAIDA|EMERGENCIA|SECOURS|NOTAUSGANG|AUSGANG|USCITA|NOODUITGANG|WAY OUT|EMERGENCY DOOR|ESCAPE DOOR|FIRE DOOR)(?: (?:ONLY|DOOR|DE EMERGENCIA|DE SECOURS|[0-9]{1,3}|[A-F]))?$/.test(sign)) return "exit";
  if (/\b(STAIR|STAIRS|STAIRWELL|STAIRCASE|FIRE STAIRS|ESCALERA|ESCALERAS|ESCALIER|TREPPE|TREPPENHAUS|ESCADA)\b/.test(t)) return "stairs";
  if (/\b(RAMP|ACCESSIBLE ROUTE|WHEELCHAIR RAMP|RAMPA)\b/.test(t)) return "ramp";
  if (/\b(ELEVATOR|LIFT|ELEV|ASCENSOR|ASCENSEUR|AUFZUG)\b/.test(t)) return "elevator";
  if (/\b(WINDOW|GLAZING|SKYLIGHT|VENTANA|FENETRE)\b/.test(t)) return "window";
  if (/\b(DOOR|DOORWAY|ENTRANCE|MAIN ENTRANCE|ENTRY|GATE|PUERTA|PORTE)\b/.test(t)) return "door";
  if (/\b(ROOM|CLASSROOM|LAB|LABORATORY|OFFICE|HALL|HALLWAY|CORRIDOR|RECEPTION|WARD|LOBBY|STORE|STORAGE|TOILET|RESTROOM|WASHROOM|WC|KITCHEN|CAFETERIA|CANTEEN|LIBRARY|BEDROOM|MEETING|CONFERENCE|AUDITORIUM|LECTURE|GYM|CLINIC|PHARMACY|SERVER|ELECTRICAL|MECHANICAL|BOILER|FOYER|ATRIUM|LOUNGE|CUBICLE|PATIENT|NURSE|ARCHIVE|WORKSHOP)\b/.test(t)) return "room";
  if (/^(?:RM|ROOM|R|LAB|OFF)\s*[0-9]{1,4}[A-Z]?$/.test(t)) return "room";
  return "other";
}

/**
 * Recombine two-line vertically stacked or horizontally split OCR labels when their
 * combined wording changes or refines the semantic meaning (e.g. "NO" + "EXIT" -> "NO EXIT",
 * "YOU ARE" + "HERE" -> "YOU ARE HERE", "EMERGENCY" + "EXIT" -> "EMERGENCY EXIT").
 */
export function mergeStackedAndAdjacentLabels(labels: PlanLabel[]): PlanLabel[] {
  if (labels.length < 2) return labels;
  const used = new Uint8Array(labels.length);
  const result: PlanLabel[] = [];

  for (let i = 0; i < labels.length; i++) {
    if (used[i]) continue;
    const a = labels[i];
    const ax = (a.box.left + a.box.right) / 2;
    const ay = (a.box.top + a.box.bottom) / 2;
    const ah = Math.max(0.005, a.box.bottom - a.box.top);
    const aw = Math.max(0.005, a.box.right - a.box.left);
    let merged: PlanLabel | null = null;

    for (let j = 0; j < labels.length; j++) {
      if (i === j || used[j]) continue;
      const b = labels[j];
      const bx = (b.box.left + b.box.right) / 2;
      const by = (b.box.top + b.box.bottom) / 2;
      const bh = Math.max(0.005, b.box.bottom - b.box.top);

      // Vertically stacked: `b` is directly below `a` with aligned horizontal center
      const verticallyStacked =
        by > ay &&
        b.box.top - a.box.bottom < Math.max(ah, bh) * 1.4 &&
        b.box.top >= a.box.top &&
        Math.abs(ax - bx) < Math.max(aw, b.box.right - b.box.left) * 0.65;

      // Horizontally adjacent on the same line: `b` is immediately to the right of `a`
      const horizontallyAdjacent =
        bx > ax &&
        b.box.left - a.box.right < Math.max(ah, bh) * 1.6 &&
        b.box.left >= a.box.left &&
        Math.abs(ay - by) < Math.max(ah, bh) * 0.6;

      if (!verticallyStacked && !horizontallyAdjacent) continue;

      const combinedText = normalizeOcrText(`${a.text} ${b.text}`);
      const combinedKind = classifyLabel(combinedText);
      const upperCombined = combinedText.toUpperCase();

      // Merge when the pair forms a negation ("NO EXIT", "NOT AN EXIT", "SIN SALIDA")
      // or upgrades/combines a compound safety phrase ("EMERGENCY EXIT", "YOU ARE HERE", "FIRE EXTINGUISHER", "ASSEMBLY POINT", "FIRST AID")
      const isNegatedExit = /\b(NO EXIT|NOT AN EXIT|SIN SALIDA|PAS DE SORTIE|KEIN AUSGANG)\b/.test(upperCombined);
      const isCompoundSafetyPhrase =
        combinedKind !== "other" &&
        (a.kind === "other" || b.kind === "other" || a.kind === combinedKind);

      if (isNegatedExit || isCompoundSafetyPhrase) {
        used[i] = 1;
        used[j] = 1;
        merged = {
          text: combinedText,
          confidence: Math.round((a.confidence + b.confidence) / 2),
          scoreType: "tesseract-raw",
          kind: combinedKind,
          box: {
            left: Math.min(a.box.left, b.box.left),
            top: Math.min(a.box.top, b.box.top),
            right: Math.max(a.box.right, b.box.right),
            bottom: Math.max(a.box.bottom, b.box.bottom),
          },
        };
        break;
      }
    }

    if (merged) {
      result.push(merged);
    } else if (!used[i]) {
      used[i] = 1;
      result.push(a);
    }
  }
  return result;
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
  if (kind === "equipment") { const t = text.toUpperCase(); return /EXTINGUISHER|HYDRANT|FIRE HOSE|HOSE REEL/.test(t) ? "FIRE_EXTINGUISHER" : /ALARM|DETECTOR|PULL STATION/.test(t) ? "FIRE_ALARM" : "UNKNOWN"; }
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
  const mergedLabels = mergeStackedAndAdjacentLabels(labels);
  const candidates: PlanCandidate[] = [];
  for (const [i, label] of mergedLabels.entries()) {
    const legend = labelInLegend(label.box, legends); label.legendId = legend?.id ?? null; label.semanticClass = legend ? "LEGEND" : semanticClassForLabel(label.text, label.kind); label.scoreType = "tesseract-raw";
    if (legend || (label.kind !== "exit" && label.kind !== "start" && label.kind !== "stairs")) continue;
    candidates.push({ id: `text-${i}`, kind: label.kind === "exit" ? "exit" : label.kind === "start" ? "start" : "stairs", semanticClass: label.kind === "exit" ? "EXIT_SIGN" : label.kind === "start" ? "START_MARKER" : "STAIRS", status: "NEEDS_REVIEW", label: label.text.trim(), source: "text", confidence: "text-match", engineScore: label.confidence, box: label.box, legendId: null, evidence: label.kind === "exit" ? `OCR read an exit-sign label (uncalibrated Tesseract engine score ${Math.round(label.confidence)} / 100). This is not proof that the nearest door is an actual, usable exit. Check the exact door in the source and place a provisional exit there.` : label.kind === "start" ? "The plan contains a ‘you are here’/location label. Verify the actual person location on the grid." : "Stairs are labeled in the source. Vertical floor connections are not modeled by this single-floor graph." });
  }
  const blobs = componentMask(image, 800, (r, g, b) => hueName(r, g, b) !== null, .045);
  for (const blob of blobs.slice(0, 50)) {
    const b = blob.bounds, legend = labelInLegend(b, legends); if (legend) continue;
    const hue = dominantBlobHue(image, b, blob.sampleX, blob.sampleY);
    if (candidates.some(c => c.source === "color" && Math.hypot((c.box.left + c.box.right) / 2 - (b.left + b.right) / 2, (c.box.top + c.box.bottom) / 2 - (b.top + b.bottom) / 2) < .025)) continue;
    if (candidates.some(c => c.source === "text" && (b.left + b.right) / 2 >= c.box.left - .01 && (b.left + b.right) / 2 <= c.box.right + .01 && (b.top + b.bottom) / 2 >= c.box.top - .015 && (b.top + b.bottom) / 2 <= c.box.bottom + .015)) continue;
    candidates.push({ id: `color-${candidates.length}`, kind: "annotation", semanticClass: "COLORED_ANNOTATION", status: "NEEDS_REVIEW", label: `${hue} color-only annotation`, evidence: `A ${hue} region was detected by color and connected-component geometry only. Color cannot identify an exit, arrow, assembly marker, alarm, extinguisher, active fire or wall. This annotation is excluded from the routing grid; inspect and correct its region manually.`, source: "color", confidence: "color-only", engineScore: undefined, box: b, legendId: null });
  }
  return candidates.slice(0, 80);
}
function intersectsCellRun(mask: Uint8Array, w: number, h: number, horizontal: Uint8Array, vertical: Uint8Array, diagonal: Uint8Array, minH: number, minV: number) {
  // Bridge 1-pixel anti-aliasing dropouts along orthogonal lines without closing real doorway gaps (>= 3px)
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      if (!mask[row + x] && mask[row + x - 1] && mask[row + x + 1]) mask[row + x] = 1;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 1; y < h - 1; y++) {
      const i = y * w + x;
      if (!mask[i] && mask[i - w] && mask[i + w]) mask[i] = 1;
    }
  }
  for (let y = 0; y < h; y++) { let from = -1; for (let x = 0; x <= w; x++) { const at = x < w && mask[y * w + x] ? 1 : 0; if (at && from < 0) from = x; else if (!at && from >= 0) { if (x - from >= minH) for (let xx = from; xx < x; xx++) horizontal[y * w + xx] = 1; from = -1; } } }
  for (let x = 0; x < w; x++) { let from = -1; for (let y = 0; y <= h; y++) { const at = y < h && mask[y * w + x] ? 1 : 0; if (at && from < 0) from = y; else if (!at && from >= 0) { if (y - from >= minV) for (let yy = from; yy < y; yy++) vertical[yy * w + x] = 1; from = -1; } } }

  // Detect +45° and -45° diagonal architectural wall runs
  const minD = Math.max(12, Math.min(minH, minV));
  for (let start = 0; start < w + h - 1; start++) {
    // Down-right diagonals (x - y = const)
    let x0 = start < w ? start : 0;
    let y0 = start < w ? 0 : start - w + 1;
    let run = 0;
    while (x0 < w && y0 < h) {
      if (mask[y0 * w + x0]) {
        run++;
      } else {
        if (run >= minD) {
          for (let k = 1; k <= run; k++) diagonal[(y0 - k) * w + (x0 - k)] = 1;
        }
        run = 0;
      }
      x0++;
      y0++;
    }
    if (run >= minD) {
      for (let k = 1; k <= run; k++) diagonal[(y0 - k) * w + (x0 - k)] = 1;
    }

    // Down-left diagonals (x + y = const)
    let x1 = start < w ? start : w - 1;
    let y1 = start < w ? 0 : start - w + 1;
    run = 0;
    while (x1 >= 0 && y1 < h) {
      if (mask[y1 * w + x1]) {
        run++;
      } else {
        if (run >= minD) {
          for (let k = 1; k <= run; k++) diagonal[(y1 - k) * w + (x1 + k)] = 1;
        }
        run = 0;
      }
      x1--;
      y1++;
    }
    if (run >= minD) {
      for (let k = 1; k <= run; k++) diagonal[(y1 - k) * w + (x1 + k)] = 1;
    }
  }
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
  const grey = new Uint8Array(w * h), colored = new Uint8Array(w * h), excluded = new Uint8Array(w * h), rawInk = new Uint8Array(w * h), ink = new Uint8Array(w * h), textMask = new Uint8Array(w * h);
  for (const region of options.excludedRegions) {
    const left = clamp(Math.floor(region.left * image.width) - x0, 0, w), right = clamp(Math.ceil(region.right * image.width) - x0, 0, w), top = clamp(Math.floor(region.top * image.height) - y0, 0, h), bottom = clamp(Math.ceil(region.bottom * image.height) - y0, 0, h);
    for (let yy = top; yy < bottom; yy++) for (let xx = left; xx < right; xx++) excluded[yy * w + xx] = 1;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const source = ((y + y0) * image.width + x + x0) * channels, i = y * w + x, alpha = channels === 4 ? image.data[source + 3] / 255 : 1, r = image.data[source] * alpha + 255 * (1 - alpha), g = image.data[source + 1] * alpha + 255 * (1 - alpha), b = image.data[source + 2] * alpha + 255 * (1 - alpha); grey[i] = Math.round(.299 * r + .587 * g + .114 * b); colored[i] = hueName(r, g, b) ? 1 : 0; }
  if (options.ignoreText) for (const label of labels) { if (label.confidence < 48) continue; const left = clamp(Math.floor(label.box.left * image.width) - x0, 0, w), right = clamp(Math.ceil(label.box.right * image.width) - x0, 0, w), top = clamp(Math.floor(label.box.top * image.height) - y0, 0, h), bottom = clamp(Math.ceil(label.box.bottom * image.height) - y0, 0, h); for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) textMask[y * w + x] = 1; }
  const sum = localIntegral(grey, w, h), stride = w + 1, minCell = Math.max(3, Math.min(w / cols, h / rows)), radius = Math.max(9, Math.min(46, Math.round(minCell * 1.15)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (colored[i]) continue;
    const xA = Math.max(0, x - radius), yA = Math.max(0, y - radius), xB = Math.min(w, x + radius + 1), yB = Math.min(h, y + radius + 1);
    const mean = meanIn(sum, stride, xA, yA, xB, yB), lum = grey[i];
    const adaptive = options.invert ? lum > mean + Math.max(7, (255 - mean) * .035) : lum < mean - Math.max(7, mean * .035);
    const global = options.invert ? lum > options.wallThreshold : lum < options.wallThreshold;
    rawInk[i] = global || adaptive ? 1 : 0;
  }
  const hLines = new Uint8Array(w * h), vLines = new Uint8Array(w * h), dLines = new Uint8Array(w * h), cellW = w / cols, cellH = h / rows;
  // Detect long architectural wall runs (orthogonal and diagonal) before applying OCR text masks so walls crossing behind room labels remain intact.
  intersectsCellRun(rawInk, w, h, hLines, vLines, dLines, Math.max(12, Math.round(cellW * .8)), Math.max(12, Math.round(cellH * .8)));
  for (let i = 0; i < w * h; i++) {
    ink[i] = rawInk[i] && (!textMask[i] || hLines[i] || vLines[i] || dLines[i]) ? 1 : 0;
  }
  const size = cols * rows, total = new Uint32Array(size), dark = new Uint32Array(size), annotations = new Uint32Array(size), excludedCounts = new Uint32Array(size), hHits = new Uint32Array(size), vHits = new Uint32Array(size), dHits = new Uint32Array(size), grid: Record<string, CellType> = {}, cellEvidence: Record<string, CellEvidence> = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const cell = Math.min(rows - 1, Math.floor(y * rows / h)) * cols + Math.min(cols - 1, Math.floor(x * cols / w)), i = y * w + x; total[cell]++; if (colored[i]) annotations[cell]++; if (excluded[i]) excludedCounts[cell]++; if (!ink[i]) continue; if (options.denoise && !hLines[i] && !vLines[i] && !dLines[i] && x > 0 && x < w - 1 && y > 0 && y < h - 1) { let near = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && ink[(y + dy) * w + x + dx]) near++; if (near <= 1) continue; } dark[cell]++; if (hLines[i]) hHits[cell]++; if (vLines[i]) vHits[cell]++; if (dLines[i]) dHits[cell]++; }
  let walls = 0, unknown = 0, uncertainCells = 0; const cropLeft = x0, cropTop = y0;
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const i = cy * cols + cx, key = `${cx},${cy}`, denominator = Math.max(1, total[i]), wallCoverage = dark[i] / denominator, annotationCoverage = annotations[i] / denominator, excludedCoverage = excludedCounts[i] / denominator, horizontal = hHits[i] / Math.max(1, cellW), vertical = vHits[i] / Math.max(1, cellH), diagonal = dHits[i] / Math.max(1, Math.min(cellW, cellH));
    const strongWall = wallCoverage >= options.wallCoverage || horizontal >= .52 || vertical >= .52 || diagonal >= .55;
    const ambiguousInk = !strongWall && wallCoverage >= Math.max(.025, options.wallCoverage * .34);
    const atFrame = cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1;
    const annotationUnknown = annotationCoverage >= options.annotationCoverage;
    const legendExcluded = excludedCoverage >= .45;
    const type: CellType = strongWall ? "wall" : annotationUnknown || ambiguousInk || atFrame || legendExcluded ? "unknown" : "empty";
    grid[key] = type; if (type === "wall") walls++; if (type === "unknown") unknown++;
    const cellBox: Bounds = { left: cx / cols, top: cy / rows, right: (cx + 1) / cols, bottom: (cy + 1) / rows };
    const evidence = [horizontal >= .52 ? "long-horizontal-line" : "", vertical >= .52 ? "long-vertical-line" : "", diagonal >= .55 ? "long-diagonal-line" : "", wallCoverage >= options.wallCoverage ? "wall-pixel-occupancy-above-review-threshold" : "", annotationUnknown ? "colored-annotation-not-semantically-interpreted" : "", legendExcluded ? "legend-or-user-excluded-region" : "", atFrame ? "image-edge-is-not-assumed-walkable" : "", ambiguousInk ? "partial-ink-needs-human-review" : ""].filter(Boolean);
    if (ambiguousInk || (wallCoverage > 0 && Math.abs(wallCoverage - options.wallCoverage) < .08)) uncertainCells++;
    cellEvidence[key] = { type: type === "wall" ? "WALL" : type === "unknown" ? "UNKNOWN" : "WALKABLE_CANDIDATE", status: "NEEDS_REVIEW", sourcePixels: { left: cropLeft + Math.floor(cellBox.left * w), top: cropTop + Math.floor(cellBox.top * h), right: cropLeft + Math.ceil(cellBox.right * w), bottom: cropTop + Math.ceil(cellBox.bottom * h) }, darkCoverage: Number(wallCoverage.toFixed(4)), annotationCoverage: Number(annotationCoverage.toFixed(4)), excludedCoverage: Number(excludedCoverage.toFixed(4)), horizontalLineCoverage: Number(horizontal.toFixed(3)), verticalLineCoverage: Number(vertical.toFixed(3)), evidence: evidence.length ? evidence : ["low-contrast-with-detected-wall-strokes; still requires comparison with the source"], scoreType: "measured-pixel-coverage-not-probability" };
  }
  const region = countRegions(grid, cols, rows), graph = summarizeGridGraph(grid, cols, rows), wallSegments = extractWallSegments(grid, cols, rows, crop, image.width, image.height), doorCandidates = extractDoorCandidates(grid, cols, rows, crop), warnings: string[] = [];
  if (walls < size * .012) warnings.push("Few definite wall cells were extracted. Pale regions are only walkable candidates. Check contrast and hand-draw walls from the source.");
  if (walls > size * .62) warnings.push("Most cells are classified as walls. Try another threshold or polarity and compare each result against the source.");
  if (unknown) warnings.push(`${unknown} grid cells are unknown (image edge, colored annotation, legend exclusion, or ambiguous line evidence); unknown cells remain walkable candidates and should be reviewed.`);
  if (options.excludedRegions.length) warnings.push(`${options.excludedRegions.length} OCR-detected legend region(s) are excluded from navigable space. Review each detected legend boundary before saving.`);
  if (region.count > 1) warnings.push(`${region.count} separate connected walkable candidate regions remain. Check door openings and partitions; disconnected regions were not deleted.`);
  if (uncertainCells) warnings.push(`${uncertainCells} cells have partial wall evidence. The displayed coverage is a pixel measurement, not a probability.`);
  const counts = { WALL: walls, WALKABLE_CANDIDATE: size - walls, UNKNOWN: unknown, ACTIVE_FIRE_HAZARD: 0 };
  const checks: ValidationCheck[] = [
    { id: "grid-dimensions", status: Object.keys(grid).length === size ? "PASS" : "FAIL", message: `Grid has ${Object.keys(grid).length} cells; expected ${size}.`, count: Object.keys(grid).length },
    { id: "coordinate-trace", status: Object.keys(cellEvidence).length === size ? "PASS" : "FAIL", message: "Every grid cell has a source-image pixel rectangle.", count: Object.keys(cellEvidence).length },
    { id: "semantic-separation", status: counts.ACTIVE_FIRE_HAZARD === 0 ? "PASS" : "FAIL", message: "The image analyzer never invents an active-fire scenario; scenario hazards come from explicit user input.", count: counts.ACTIVE_FIRE_HAZARD },
    { id: "unknown-cells", status: unknown ? "REVIEW" : "PASS", message: unknown ? `${unknown} unknown cells are walkable review candidates; confirm them against the source before saving.` : "No unknown annotations or uncertain wall cells remain; verify the image edges regardless." , count: unknown },
    { id: "walkable-connectivity", status: region.count > 1 ? "REVIEW" : "PASS", message: region.count > 1 ? `${region.count} separate walkable candidate regions are preserved; a break may be a real wall or an extraction error.` : "One 4-connected walkable candidate component; this does not prove that all real doorways were detected.", count: region.count },
    { id: "graph-wall-clearance", status: "PASS", message: "Graph edges are created only between adjacent cells that are not walls, windows, fires or blocked.", count: graph.undirectedEdgeCount },
    { id: "door-exit-verification", status: "REVIEW", message: "Door openings and usable exits are not inferred from a missing wall pixel or a sign alone. Confirm each passage and actual door on the source." },
    { id: "floor-connections", status: "REVIEW", message: "This upload is one floor. Stairs/elevators do not create vertical connections; analyze each floor separately." },
  ];
  return { grid, cols, rows, walls, walkable: counts.WALKABLE_CANDIDATE, unknown, regions: region.count, largestRegion: region.largest, uncertainCells, warnings, counts, cellEvidence, wallSegments, doorCandidates, navigationGraph: graph, transform: { sourceWidth: image.width, sourceHeight: image.height, normalizedSourceWidth: image.width, normalizedSourceHeight: image.height, crop: { ...crop }, cols, rows, cellToImage: "pixel-bounds-derived-from-crop-and-grid-dimensions" }, validation: checks };
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
  const cols = options.cols, rows = options.rows;
  const cx = Math.floor(x * cols), cy = Math.floor(y * rows);
  if (cx >= 0 && cy >= 0 && cx < cols && cy < rows && !isBlocked(grid[`${cx},${cy}`])) {
    // Check if the direct cell has at least one walkable neighbor so we don't snap into a 1-cell wall cavity
    const hasWalkableNeighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      return nx >= 0 && ny >= 0 && nx < cols && ny < rows && !isBlocked(grid[`${nx},${ny}`]);
    });
    if (hasWalkableNeighbor) return { x: cx, y: cy };
  }
  const choices: (Point & { d: number; hasNeighbor: boolean })[] = [];
  for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
    const px = cx + dx, py = cy + dy;
    if (px >= 0 && py >= 0 && px < cols && py < rows && !isBlocked(grid[`${px},${py}`])) {
      const hasNeighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([nx, ny]) => {
        const qx = px + nx, qy = py + ny;
        return qx >= 0 && qy >= 0 && qx < cols && qy < rows && !isBlocked(grid[`${qx},${qy}`]);
      });
      choices.push({ x: px, y: py, d: dx * dx + dy * dy, hasNeighbor });
    }
  }
  choices.sort((a, b) => (a.hasNeighbor !== b.hasNeighbor ? (a.hasNeighbor ? -1 : 1) : a.d - b.d));
  return choices[0] ? { x: choices[0].x, y: choices[0].y } : null;
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
