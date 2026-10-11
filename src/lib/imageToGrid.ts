import { convertPixels, type AnalysisReport, type ConversionOptions, type ConversionResult, type PixelImage, type PlanLabel } from "./map-analysis";
export type { ConversionOptions, ConversionResult } from "./map-analysis";
export { DEFAULT_CONVERSION } from "./map-analysis";

/** Decode the exact normalized image returned by analysis for local re-conversion. */
export function readImagePixels(dataUrl: string): Promise<PixelImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("The source image could not be loaded. Upload it again."));
    image.onload = () => {
      const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) { reject(new Error("Your browser does not support image conversion.")); return; }
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0);
      resolve({ data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height });
    };
    image.src = dataUrl;
  });
}
export async function reconvertImage(imageUrl: string, options: ConversionOptions, labels: PlanLabel[]): Promise<ConversionResult> {
  const pixels = await readImagePixels(imageUrl);
  return convertPixels(pixels, options, labels);
}
export async function uploadForAnalysis(file: File, signal?: AbortSignal, ocr = true): Promise<AnalysisReport> {
  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Use an image smaller than 12 MB.");
  const form = new FormData(); form.set("file", file); form.set("ocr", String(ocr));
  const response = await fetch("/api/maps/analyze", { method: "POST", body: form, signal });
  const data = await response.json().catch(() => ({ error: "The analyzer returned an invalid response. Please retry." }));
  if (!response.ok || !data.analysis) throw new Error(data.error || "Image analysis failed.");
  return data.analysis;
}
