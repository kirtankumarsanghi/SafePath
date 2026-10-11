import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import path from "node:path";
import { createWorker, PSM, type Worker } from "tesseract.js";
import {
  buildPlanObjects, classifyLabel, convertPixels, detectCandidates, detectLegendRegions, semanticCounts, suggestedOptions,
  type AnalysisReport, type Bounds, type PlanLabel,
} from "@/lib/map-analysis";
import { darkSignRegions } from "@/lib/sign-regions";
export const runtime = "nodejs";
export const maxDuration = 60;
let active = 0;
function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Text recognition timed out")), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
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
    worker = await deadline(Promise.race([initializing, failed]), 14000);
    const end = Date.now() + 33000;
    const ocrImage = invert ? await sharp(buffer).grayscale().negate().normalise().png().toBuffer() : buffer;
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, user_defined_dpi: "150" });
    const { data } = await deadline(Promise.race([worker.recognize(ocrImage, {}, { blocks: true, text: true }), failed]), 26000);
    const labels: PlanLabel[] = [];
    for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
      const text = line.text.replace(/\s+/g, " ").trim();
      if (!text || line.confidence < 35 || text.length > 200) continue;
      labels.push({ text, confidence: line.confidence, scoreType: "tesseract-raw", kind: classifyLabel(text), box: { left: Math.max(0, line.bbox.x0 / width), top: Math.max(0, line.bbox.y0 / height), right: Math.min(1, line.bbox.x1 / width), bottom: Math.min(1, line.bbox.y1 / height) } });
    }
    // OCR cropped, contrast-inverted sign/legend regions as text evidence only.
    // Color or rectangle shape alone never determines the semantic class.
    for (const box of regions.slice(0, 10)) {
      if (Date.now() >= end - 1200) break;
      const cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
      if (labels.some(l => ["exit", "legend"].includes(l.kind) && cx >= l.box.left - .035 && cx <= l.box.right + .035 && cy >= l.box.top - .035 && cy <= l.box.bottom + .035)) continue;
      const left = Math.max(0, Math.floor(box.left * width)), top = Math.max(0, Math.floor(box.top * height));
      const sw = Math.min(width - left, Math.max(1, Math.ceil((box.right - box.left) * width))), sh = Math.min(height - top, Math.max(1, Math.ceil((box.bottom - box.top) * height)));
      try {
        const signImage = await sharp(buffer).extract({ left, top, width: sw, height: sh }).resize({ width: Math.min(800, Math.max(360, sw * 4)) }).grayscale().negate().normalise().threshold(150).extend({ top: 12, bottom: 12, left: 12, right: 12, background: "white" }).png().toBuffer();
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
        const { data: text } = await deadline(Promise.race([worker.recognize(signImage, {}, { text: true }), failed]), Math.min(3500, end - Date.now()));
        const clean = text.text.replace(/\s+/g, " ").trim(), kind = classifyLabel(clean);
        if (text.confidence >= 45 && ["exit", "legend", "equipment", "first-aid", "assembly", "hazard"].includes(kind) && !labels.some(l => l.kind === kind && Math.hypot((l.box.left + l.box.right) / 2 - cx, (l.box.top + l.box.bottom) / 2 - cy) < .03)) labels.push({ text: clean, confidence: text.confidence, scoreType: "tesseract-raw", kind, box, });
      } catch { break; }
    }
    return labels.slice(0, 1000);
  } finally { cancelled = true; if (worker) await worker.terminate().catch(() => {}); }
}
function validationFor(labels: PlanLabel[], candidates: ReturnType<typeof detectCandidates>, conversion: AnalysisReport["conversion"], objects: ReturnType<typeof buildPlanObjects>, legends: ReturnType<typeof detectLegendRegions>) {
  const exitSigns = objects.filter(o => o.semanticClass === "EXIT_SIGN").length;
  const explicitHazardText = objects.filter(o => o.semanticClass === "FIRE_HAZARD").length;
  const forbiddenColorHazards = candidates.filter(c => c.source === "color" && c.kind === "hazard").length;
  return [
    ...conversion.validation,
    { id: "legend-exclusion", status: legends.length ? "REVIEW" as const : "REVIEW" as const, message: legends.length ? `${legends.length} legend region(s) and their text are excluded from the navigation grid. Check the boundary and legend entries.` : "No reliable legend heading was identified. Colored marks cannot be interpreted against a legend that has not been located.", count: legends.length },
    { id: "exit-semantics", status: exitSigns ? "REVIEW" as const : "REVIEW" as const, message: exitSigns ? `${exitSigns} OCR exit-sign label(s) are candidates only; the label is not a verified, passable exit door. Place each exit at a manually checked doorway.` : "No text-confirmed exit sign was found. Mark real doorways manually; no exits were inferred from green pixels.", count: exitSigns },
    { id: "fire-equipment-separation", status: forbiddenColorHazards === 0 ? "PASS" as const : "FAIL" as const, message: "Red/green color regions are generic annotations. Fire extinguishers and alarms are OCR equipment classes, never active-fire cells.", count: objects.filter(o => ["FIRE_EXTINGUISHER", "FIRE_ALARM"].includes(o.semanticClass)).length },
    { id: "explicit-fire-text", status: explicitHazardText ? "REVIEW" as const : "PASS" as const, message: explicitHazardText ? `${explicitHazardText} explicitly worded fire/smoke annotation(s) need human confirmation; none was applied to the routing scenario.` : "No explicit fire-location text was found; no active fire is inferred from image colors.", count: explicitHazardText },
    { id: "ocr-language", status: labels.length ? "REVIEW" as const : "REVIEW" as const, message: labels.length ? "English OCR engine scores are uncalibrated text-recognition measures, not semantic confidence or proof." : "No text was confidently read. Verify labels and legends manually." , count: labels.length },
  ];
}
export async function POST(req: NextRequest) {
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
    const OCRRegions = [...preliminaryColor.filter(c => c.source === "color").map(c => c.box), ...darkSignRegions(pixels)];
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
