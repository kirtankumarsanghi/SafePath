import {
  convertPixels,
  suggestedOptions,
  detectCandidates,
  detectLegendRegions,
  buildPlanObjects,
  semanticCounts,
  validationFor,
  type AnalysisReport,
  type ConversionOptions,
  type ConversionResult,
  type PixelImage,
  type PlanLabel,
} from "./map-analysis";
export type { ConversionOptions, ConversionResult } from "./map-analysis";
export { DEFAULT_CONVERSION } from "./map-analysis";

/** Decode the exact normalized image returned by analysis for local re-conversion. */
export function readImagePixels(dataUrl: string): Promise<PixelImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("The source image could not be loaded. Upload it again."));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        reject(new Error("Your browser does not support image conversion."));
        return;
      }
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      resolve({
        data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        width: canvas.width,
        height: canvas.height,
      });
    };
    image.src = dataUrl;
  });
}

export async function reconvertImage(
  imageUrl: string,
  options: ConversionOptions,
  labels: PlanLabel[]
): Promise<ConversionResult> {
  const pixels = await readImagePixels(imageUrl);
  return convertPixels(pixels, options, labels);
}

/**
 * Fast, reliable client-side floor-plan analysis using HTML5 Canvas.
 * Directly runs wall segmentation and candidate detection without server timeouts,
 * request payload limits, or native binary dependencies.
 */
export async function analyzeFileInBrowser(file: File): Promise<AnalysisReport> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected file could not be decoded as an image. Please use a PNG or JPEG file."));
    };
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const maxDim = 1200;
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        if (width < 80 || height < 80) {
          reject(new Error("This image is too small to analyze. Use a plan at least 80 × 80 pixels."));
          return;
        }

        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          reject(new Error("Browser does not support canvas image analysis."));
          return;
        }

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height);
        const pixels: PixelImage = { data: imgData.data, width, height, channels: 4 };

        const baseOptions = suggestedOptions(pixels);
        const labels: PlanLabel[] = [];
        const legendRegions = detectLegendRegions(labels);
        const options = { ...baseOptions, excludedRegions: legendRegions.map((r) => r.bounds) };
        const conversion = convertPixels(pixels, options, labels);
        const candidates = detectCandidates(pixels, labels, legendRegions);
        const objects = buildPlanObjects(labels, candidates, legendRegions, options);
        const validation = validationFor(labels, candidates, conversion, objects, legendRegions);
        const labelCounts = semanticCounts(objects, legendRegions);

        // Highly compressed webp/jpeg so total JSON payload stays well under Vercel's 4.5 MB limit
        let imageUrl = canvas.toDataURL("image/webp", 0.82);
        if (!imageUrl.startsWith("data:image/webp")) {
          imageUrl = canvas.toDataURL("image/jpeg", 0.82);
        }

        const report: AnalysisReport = {
          version: 2,
          width,
          height,
          imageUrl,
          fileName: file.name.slice(0, 255),
          labels: [],
          candidates,
          objects,
          legendRegions,
          ocrStatus: "skipped",
          ocrMessage: "Analyzed directly in your browser. Mark exits and starting positions manually.",
          options,
          conversion,
          warnings: [
            "Automated image analysis is an approximation. Verify walls and doorway clearances before running A*.",
            "All color regions are treated as unconfirmed review candidates. Manually confirm exits at the real doors.",
            ...conversion.warnings,
          ],
          validation,
          semanticCounts: labelCounts,
          limitations: [
            "Raster image analysis runs client-side in the browser. Confirm actual doorways and wall corners.",
            "No scale or CAD inference is supplied. Distances represent grid steps.",
          ],
          layers: {
            structural: ["wall", "unknown", "walkable candidate", "unverified wall line segments"],
            annotations: ["exit-sign candidate", "stairs", "colored unclassified symbol", "legend"],
            grid: ["blocked", "static detection", "confirmed exit", "person", "scenario fire"],
          },
        };

        resolve(report);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Client image analysis failed."));
      }
    };
    img.src = objectUrl;
  });
}

export async function uploadForAnalysis(
  file: File,
  signal?: AbortSignal,
  ocr = true
): Promise<AnalysisReport> {
  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Use an image smaller than 20 MB.");

  // If the file is > 12 MB (server payload limit) or OCR is disabled,
  // process directly in the browser canvas for instant conversion.
  if (file.size > 12 * 1024 * 1024 || !ocr) {
    return analyzeFileInBrowser(file);
  }

  // Attempt server analysis with a 45-second deadline so multi-region OCR completes reliably.
  const serverController = new AbortController();
  const serverTimer = setTimeout(() => serverController.abort(), 45000);
  const handleAbort = () => serverController.abort();
  signal?.addEventListener("abort", handleAbort, { once: true });

  try {
    const form = new FormData();
    form.set("file", file);
    form.set("ocr", String(ocr));
    const response = await fetch("/api/maps/analyze", {
      method: "POST",
      body: form,
      signal: serverController.signal,
    });

    clearTimeout(serverTimer);
    const data = await response.json().catch(() => null);
    if (response.ok && data?.analysis) {
      return data.analysis;
    }
    if (response.status >= 400 && response.status < 500 && response.status !== 429 && data?.error) {
      throw new Error(data.error);
    }
  } catch (err) {
    if (signal?.aborted) throw err;
    if (err instanceof Error && /could not be decoded|too small|larger than|Choose a PNG/i.test(err.message)) {
      throw err;
    }
  } finally {
    clearTimeout(serverTimer);
    signal?.removeEventListener("abort", handleAbort);
  }

  // Guaranteed, instantaneous client-side fallback
  return analyzeFileInBrowser(file);
}
