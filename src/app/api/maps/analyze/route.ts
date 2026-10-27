import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import path from "node:path";
import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  buildPlanObjects, classifyLabel, convertPixels, detectCandidates, detectLegendRegions, mergeStackedAndAdjacentLabels, normalizeOcrText, semanticCounts, suggestedOptions, validationFor,
  type AnalysisReport, type Bounds, type PlanLabel,
} from "@/lib/map-analysis";
import { detectSignRegions } from "@/lib/sign-regions";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const maxDuration = 60;
let active = 0;
function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Text recognition timed out")), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

/**
 * Isolate white/light lettering on saturated colored sign backgrounds (green, red, blue, orange)
 * by mapping `255 - min(R,G,B)` so white text becomes crisp black ink (0) and saturated color becomes white (255).
 */
async function buildChromaticSignBuffer(buffer: Buffer, left: number, top: number, sw: number, sh: number, targetWidth: number, rotateDeg = 0): Promise<Buffer> {
  let pipeline = sharp(buffer).extract({ left, top, width: sw, height: sh });
  if (rotateDeg) pipeline = pipeline.rotate(rotateDeg);
  const { data, info } = await pipeline
    .resize({ width: targetWidth })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const mono = Buffer.alloc(info.width * info.height);
  for (let i = 0, p = 0; i < data.length; i += 3, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const minCh = Math.min(r, g, b);
    // White pixels have high min(R,G,B) -> invert so white glyphs become dark ink (0) on white background (255)
    mono[p] = 255 - minCh;
  }
  return sharp(mono, { raw: { width: info.width, height: info.height, channels: 1 } })
    .normalise()
    .threshold(135)
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: "white" })
    .png()
    .toBuffer();
}

async function recognize(buffer: Buffer, width: number, height: number, regions: Bounds[], invert: boolean): Promise<PlanLabel[]> {
  let worker: Worker | undefined, cancelled = false;
  let rejectWorker: (e: Error) => void = () => {};
  const failed = new Promise<never>((_, reject) => { rejectWorker = reject; });
  const initializing = createWorker("eng", 1, {
    workerPath: path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/index.js"),
    langPath: path.join(process.cwd(), "assets/ocr"), cacheMethod: "none", gzip: true,
    errorHandler: e => rejectWorker(new Error(String(e))),
  });
  initializing.then(w => { if (cancelled) void w.terminate(); }, () => {});
  try {
    const isVercel = Boolean(process.env.VERCEL);
    const initTimeout = isVercel ? 4000 : 14000;
    const recTimeout = isVercel ? 5000 : 26000;
    worker = await deadline(Promise.race([initializing, failed]), initTimeout);
    const end = Date.now() + (isVercel ? 6000 : 35000);
    const ocrImage = invert
      ? await sharp(buffer).grayscale().negate().normalise().png().toBuffer()
      : buffer;
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: "150" });
    const { data } = await deadline(Promise.race([worker.recognize(ocrImage, {}, { blocks: true, text: true }), failed]), recTimeout);
    const rawLabels: PlanLabel[] = [];
    for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
      const text = normalizeOcrText(line.text);
      if (!text || line.confidence < 35 || text.length > 200) continue;
      const lineKind = classifyLabel(text);
      rawLabels.push({
        text,
        confidence: line.confidence,
        scoreType: "tesseract-raw",
        kind: lineKind,
        box: {
          left: Math.max(0, line.bbox.x0 / width),
          top: Math.max(0, line.bbox.y0 / height),
          right: Math.min(1, line.bbox.x1 / width),
          bottom: Math.min(1, line.bbox.y1 / height),
        },
      });

      // Word-level fallback: if a noisy line grouped room numbers/ticks with an EXIT or STAIRS word,
      // and the line is not a negated/plan header ("NO EXIT", "FIRE EXIT PLAN", "Training sample"),
      // inspect individual high-confidence words with their tight word bounding boxes.
      if (
        lineKind === "other" &&
        !/\b(NO|NOT|SIN|PAS|KEIN|NIET|PLAN|ROUTE|SAMPLE|TRAINING|VERIFY|LEGEND|KEY)\b/i.test(text) &&
        Array.isArray(line.words) &&
        line.words.length > 1
      ) {
        for (const word of line.words) {
          if (word.confidence < 62) continue;
          const wText = normalizeOcrText(word.text);
          const wKind = classifyLabel(wText);
          if (wKind === "exit" || wKind === "stairs") {
            rawLabels.push({
              text: wText,
              confidence: word.confidence,
              scoreType: "tesseract-raw",
              kind: wKind,
              box: {
                left: Math.max(0, word.bbox.x0 / width),
                top: Math.max(0, word.bbox.y0 / height),
                right: Math.min(1, word.bbox.x1 / width),
                bottom: Math.min(1, word.bbox.y1 / height),
              },
            });
          }
        }
      }
    }

    const labels = mergeStackedAndAdjacentLabels(rawLabels);

    // OCR cropped sign/legend regions in light-on-dark, chromatic-channel, dark-on-light, and vertical-rotated polarities.
    // Color or rectangle shape alone never determines the semantic class.
    const signKinds = new Set(["exit", "legend", "equipment", "first-aid", "assembly", "hazard", "start", "stairs", "elevator", "ramp"]);
    for (const box of regions.slice(0, 12)) {
      if (Date.now() >= end - 1200) break;
      const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
      if (labels.some(l => ["exit", "legend"].includes(l.kind) && cx >= l.box.left - .035 && cx <= l.box.right + .035 && cy >= l.box.top - .035 && cy <= l.box.bottom + .035)) continue;
      const left = Math.max(0, Math.floor(box.left * width)), top = Math.max(0, Math.floor(box.top * height));
      const sw = Math.min(width - left, Math.max(1, Math.ceil((box.right - box.left) * width))), sh = Math.min(height - top, Math.max(1, Math.ceil((box.bottom - box.top) * height)));
      try {
        const isVerticalSign = sh > sw * 1.35;
        const targetWidth = Math.min(800, Math.max(360, (isVerticalSign ? sh : sw) * 4));
        let baseCrop = sharp(buffer).extract({ left, top, width: sw, height: sh });
        if (isVerticalSign) baseCrop = baseCrop.rotate(90);

        const invertedSign = await baseCrop.clone().resize({ width: targetWidth }).grayscale().negate().normalise().threshold(150).extend({ top: 12, bottom: 12, left: 12, right: 12, background: "white" }).png().toBuffer();
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
        const { data: invData } = await deadline(Promise.race([worker.recognize(invertedSign, {}, { text: true }), failed]), Math.min(3000, Math.max(500, end - Date.now())));
        let clean = normalizeOcrText(invData.text);
        let kind = classifyLabel(clean);
        let confidence = invData.confidence;

        // Pass 2: Chromatic min-channel extraction for saturated colored signs with white lettering
        if ((confidence < 45 || !signKinds.has(kind)) && Date.now() < end - 1100) {
          const chromaticSign = await buildChromaticSignBuffer(buffer, left, top, sw, sh, targetWidth, isVerticalSign ? 90 : 0);
          const { data: chrData } = await deadline(Promise.race([worker.recognize(chromaticSign, {}, { text: true }), failed]), Math.min(2500, Math.max(500, end - Date.now())));
          const chrClean = normalizeOcrText(chrData.text);
          const chrKind = classifyLabel(chrClean);
          if (chrData.confidence >= 45 && signKinds.has(chrKind)) {
            clean = chrClean;
            kind = chrKind;
            confidence = chrData.confidence;
          }
        }

        // Pass 3: Dark-on-light extraction (black text on yellow/amber/light sign plates)
        if ((confidence < 45 || !signKinds.has(kind)) && Date.now() < end - 1000) {
          const directSign = await baseCrop.clone().resize({ width: targetWidth }).grayscale().normalise().threshold(155).extend({ top: 12, bottom: 12, left: 12, right: 12, background: "white" }).png().toBuffer();
          const { data: dirData } = await deadline(Promise.race([worker.recognize(directSign, {}, { text: true }), failed]), Math.min(2500, Math.max(500, end - Date.now())));
          const dirClean = normalizeOcrText(dirData.text);
          const dirKind = classifyLabel(dirClean);
          if (dirData.confidence >= 45 && signKinds.has(dirKind)) {
            clean = dirClean;
            kind = dirKind;
            confidence = dirData.confidence;
          }
        }

        if (confidence >= 45 && signKinds.has(kind) && !labels.some(l => l.kind === kind && Math.hypot((l.box.left + l.box.right) / 2 - cx, (l.box.top + l.box.bottom) / 2 - cy) < .03)) {
          labels.push({ text: clean, confidence, scoreType: "tesseract-raw", kind, box });
        }
      } catch { break; }
    }
    return mergeStackedAndAdjacentLabels(labels).slice(0, 1000);
  } finally { cancelled = true; if (worker) await worker.terminate().catch(() => {}); }
}

export async function POST(req: NextRequest) {
  const rate = checkRateLimit(clientKeyFromHeaders(req.headers, "maps:analyze"), 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Too many floor-plan analysis requests. Please wait a moment and try again.", code: "RATE_LIMITED" },
      { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
    );
  }
  if (active >= 2) return NextResponse.json({ error: "The image analyzer is busy. Please try again in a few seconds." }, { status: 429 });
  if (Number(req.headers.get("content-length") ?? 0) > 13 * 1024 * 1024) return NextResponse.json({ error: "Use an image under 12 MB." }, { status: 413 });
  active++;
  try {
    const form = await req.formData(), file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a PNG, JPEG, WebP, GIF, TIFF or AVIF floor-plan image." }, { status: 400 });
    if (file.size > 12 * 1024 * 1024) return NextResponse.json({ error: "This image is larger than 12 MB. Export a smaller PNG or JPEG." }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    let normalized: Buffer, width: number, height: number;
    try {
      const source = sharp(bytes, { limitInputPixels: 40_000_000, animated: false, failOn: "error" }), metadata = await source.metadata();
      if (!["png", "jpeg", "webp", "gif", "tiff", "avif", "heif"].includes(metadata.format ?? "")) throw new Error("Unsupported raster format");
      if ((metadata.width ?? 0) < 80 || (metadata.height ?? 0) < 80) return NextResponse.json({ error: "This image is too small to analyze. Use a plan at least 80 × 80 pixels, ideally 1000 pixels or wider." }, { status: 422 });
      const result = await source.rotate().flatten({ background: "#ffffff" }).resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").png().toBuffer({ resolveWithObject: true });
      normalized = result.data; width = result.info.width; height = result.info.height;
    } catch { return NextResponse.json({ error: "The file could not be decoded as a supported image. For PDF, SVG or HEIC plans, export a page as PNG or JPEG and upload it again." }, { status: 415 }); }
    const raw = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixels = { data: raw.data, width, height, channels: 4 as const };
    const baseOptions = suggestedOptions(pixels);
    const preliminaryColor = detectCandidates(pixels, [], []);
    const OCRRegions = detectSignRegions(pixels, preliminaryColor.filter(c => c.source === "color").map(c => c.box));
    let labels: PlanLabel[] = [], ocrStatus: AnalysisReport["ocrStatus"] = "skipped", ocrMessage = "Text recognition was skipped. Mark exits and your position manually.";
    if (form.get("ocr") !== "false") {
      try { labels = await recognize(normalized, width, height, OCRRegions, baseOptions.invert); ocrStatus = "complete"; ocrMessage = labels.length ? `${labels.length} English text regions read. OCR engine scores are uncalibrated and do not verify the object class.` : "OCR completed but no legible text was found. All color regions remain unclassified; mark doors and exits manually."; }
      catch (error) { console.error("Floor-plan OCR unavailable:", error instanceof Error ? error.message : error); ocrStatus = "unavailable"; ocrMessage = "Text recognition could not finish. Wall and annotation analysis succeeded. Review the image and mark doors and exits manually, or retry with a clearer image."; }
    }
    const legendRegions = detectLegendRegions(labels);
    for (const label of labels) { const legend = legendRegions.find(r => { const x = (label.box.left + label.box.right) / 2, y = (label.box.top + label.box.bottom) / 2; return x >= r.bounds.left && x <= r.bounds.right && y >= r.bounds.top && y <= r.bounds.bottom; }); label.legendId = legend?.id ?? null; if (legend) label.semanticClass = "LEGEND"; }
    const options = { ...baseOptions, excludedRegions: legendRegions.map(r => r.bounds) };
    const conversion = convertPixels(pixels, options, labels);
    const candidates = detectCandidates(pixels, labels, legendRegions);
    const objects = buildPlanObjects(labels, candidates, legendRegions, options);
    const validation = validationFor(labels, candidates, conversion, objects, legendRegions);
    const labelCounts = semanticCounts(objects, []);
    const preview = await sharp(normalized).webp({ quality: 94, lossless: false }).toBuffer();
    const limitations = [
      "Single raster + English OCR; there is no trained, validated floor-plan segmentation model. OCR and connected components are candidate evidence, not verified semantics.",
      "No scale, structural CAD vector, door-swing, egress-code, accessibility or load-capacity inference is supplied. Grid distances are not physical distances.",
      "No multi-floor vertical graph, real-time sensor feed, smoke model, congestion model, or building-operations integration is included.",
      "Small or broken doors, low contrast, photographed perspective, multilingual lettering, dense symbols and overlapping annotations can be missed. Inspect unknown cells and compare every route to the source.",
    ];
    const warnings = [
      "Automated image analysis is an approximation. Every cell and object remains NEEDS_REVIEW; no image-derived door or exit is confirmed automatically.",
      "Red, green, blue and other color blobs are COLORED_ANNOTATION / UNKNOWN. Color alone never creates a fire, equipment type or emergency exit.",
      ...(legendRegions.length ? [`Detected ${legendRegions.length} possible legend region(s); the text and contained symbols are excluded from walkable space and remain reviewable.`] : ["No reliable legend heading was located. Symbols cannot be associated with a legend that was not detected."]),
      ...(objects.some(o => o.semanticClass === "FIRE_HAZARD") ? ["Explicit fire/smoke wording is a review-only annotation, not an active scenario hazard."] : ["No active fire is inferred from the image. Use the Fire editor tool only to add an explicit simulation scenario." ]),
      ...(conversion.warnings),
      ...(candidates.some(c => c.kind === "exit") ? ["Exit-sign text is a candidate location, not proof of a usable door. Mark an exit at the actual verified doorway in the grid."] : ["No text-confirmed exit sign was located. No exits were invented; manually place exits on the actual doors."]),
    ];
    const report: AnalysisReport = {
      version: 2, width, height, imageUrl: `data:image/webp;base64,${preview.toString("base64")}`, fileName: file.name.slice(0, 255),
      labels, candidates, objects, legendRegions, ocrStatus, ocrMessage, options, conversion, warnings, validation,
      semanticCounts: labelCounts,
      limitations,
      layers: { structural: ["wall", "unknown", "walkable candidate", "unverified wall line segments"], annotations: ["OCR text", "exit-sign candidate", "stairs", "fire-safety equipment label", "colored unclassified symbol", "legend"], grid: ["blocked", "static detection", "confirmed exit", "person", "scenario fire"] },
    };
    return NextResponse.json({ analysis: report });
  } catch (error) {
    console.error("Floor-plan analysis failed", error);
    return NextResponse.json({ error: "Analysis could not be completed. Your file has not been saved. Retry with a clear, straight-on PNG or JPEG floor plan." }, { status: 500 });
  } finally { active--; }
}
