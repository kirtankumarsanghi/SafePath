import { hueName, type Bounds, type PixelImage } from "./map-analysis";

function extractBoxesFromMask(
  mask: Uint8Array,
  w: number,
  h: number,
  options: { minW: number; minH: number; minAspect: number; maxAspect: number; minArea: number; maxAreaShare: number; minFill: number }
): { area: number; box: Bounds }[] {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const boxes: { area: number; box: Bounds }[] = [];

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let head = 0, tail = 1;
    let left = i % w, right = left, top = Math.floor(i / w), bottom = top;
    queue[0] = i;
    seen[i] = 1;
    while (head < tail) {
      const n = queue[head++];
      const x = n % w, y = Math.floor(n / w);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, ni = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ni] || !mask[ni]) continue;
        seen[ni] = 1;
        queue[tail++] = ni;
      }
    }
    const bw = right - left + 1;
    const bh = bottom - top + 1;
    const aspect = bw / bh;
    const fill = tail / (bw * bh);
    if (
      bw < options.minW ||
      bh < options.minH ||
      aspect < options.minAspect ||
      aspect > options.maxAspect ||
      tail < options.minArea ||
      tail > w * h * options.maxAreaShare ||
      fill < options.minFill
    ) {
      continue;
    }
    boxes.push({
      area: tail,
      box: { left: left / w, top: top / h, right: (right + 1) / w, bottom: (bottom + 1) / h },
    });
  }
  return boxes;
}

/** Internal OCR regions only. A dark rectangle is never itself an exit candidate. */
export function darkSignRegions(image: PixelImage): Bounds[] {
  const scale = Math.max(1, Math.ceil(Math.max(image.width, image.height) / 800));
  const w = Math.ceil(image.width / scale), h = Math.ceil(image.height / scale);
  const mask = new Uint8Array(w * h);
  const channels = image.channels ?? (image.data.length >= image.width * image.height * 4 ? 4 : 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (Math.min(image.height - 1, y * scale) * image.width + Math.min(image.width - 1, x * scale)) * channels;
      const lum = 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
      mask[y * w + x] = lum < 155 ? 1 : 0;
    }
  }
  // Support both horizontal sign plates and vertical (90°-rotated) corridor sign plates while rejecting thin walls.
  const boxes = extractBoxesFromMask(mask, w, h, {
    minW: 10,
    minH: 10,
    minAspect: 0.18,
    maxAspect: 6.5,
    minArea: 85,
    maxAreaShare: 0.04,
    minFill: 0.52,
  });
  return boxes.sort((a, b) => b.area - a.area).slice(0, 14).map((x) => x.box);
}

/** Detect saturated colored sign plates (green exit signs, red fire signs, blue/amber notices) for targeted OCR. */
export function coloredSignRegions(image: PixelImage): Bounds[] {
  const scale = Math.max(1, Math.ceil(Math.max(image.width, image.height) / 800));
  const w = Math.ceil(image.width / scale), h = Math.ceil(image.height / scale);
  const mask = new Uint8Array(w * h);
  const channels = image.channels ?? (image.data.length >= image.width * image.height * 4 ? 4 : 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (Math.min(image.height - 1, y * scale) * image.width + Math.min(image.width - 1, x * scale)) * channels;
      mask[y * w + x] = hueName(image.data[i], image.data[i + 1], image.data[i + 2]) !== null ? 1 : 0;
    }
  }
  const boxes = extractBoxesFromMask(mask, w, h, {
    minW: 9,
    minH: 9,
    minAspect: 0.18,
    maxAspect: 7.0,
    minArea: 65,
    maxAreaShare: 0.045,
    minFill: 0.42,
  });
  return boxes.sort((a, b) => b.area - a.area).slice(0, 14).map((x) => x.box);
}

/** Combine dark and colored sign regions while deduplicating overlapping bounding boxes. */
export function detectSignRegions(image: PixelImage, extraBoxes: Bounds[] = []): Bounds[] {
  const all = [...extraBoxes, ...darkSignRegions(image), ...coloredSignRegions(image)];
  const deduped: Bounds[] = [];
  for (const box of all) {
    const cx = (box.left + box.right) / 2;
    const cy = (box.top + box.bottom) / 2;
    const duplicate = deduped.some((existing) => {
      const ex = (existing.left + existing.right) / 2;
      const ey = (existing.top + existing.bottom) / 2;
      return Math.hypot(cx - ex, cy - ey) < 0.025;
    });
    if (!duplicate) deduped.push(box);
  }
  return deduped.slice(0, 18);
}
