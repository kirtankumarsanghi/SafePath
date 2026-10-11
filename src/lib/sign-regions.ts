import type { Bounds, PixelImage } from "./map-analysis";
/** Internal OCR regions only. A dark rectangle is never itself an exit candidate. */
export function darkSignRegions(image: PixelImage): Bounds[] {
  const scale = Math.max(1, Math.ceil(Math.max(image.width, image.height) / 800));
  const w = Math.ceil(image.width / scale), h = Math.ceil(image.height / scale);
  const mask = new Uint8Array(w * h), seen = new Uint8Array(w * h), queue = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (Math.min(image.height - 1, y * scale) * image.width + Math.min(image.width - 1, x * scale)) * 4;
    mask[y * w + x] = .299 * image.data[i] + .587 * image.data[i + 1] + .114 * image.data[i + 2] < 150 ? 1 : 0;
  }
  const boxes: { area: number; box: Bounds }[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let head = 0, tail = 1, left = i % w, right = left, top = Math.floor(i / w), bottom = top;
    queue[0] = i; seen[i] = 1;
    while (head < tail) {
      const n = queue[head++], x = n % w, y = Math.floor(n / w);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, ni = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen[ni] || !mask[ni]) continue;
        seen[ni] = 1; queue[tail++] = ni;
      }
    }
    const bw = right - left + 1, bh = bottom - top + 1;
    // Reject long walls, glyphs, building outlines and solid page backgrounds.
    if (bw < 18 || bh < 12 || bw / bh < 1.15 || bw / bh > 6 || tail < 100 || tail > w * h * .035 || tail / (bw * bh) < .58) continue;
    boxes.push({ area: tail, box: { left: left / w, top: top / h, right: (right + 1) / w, bottom: (bottom + 1) / h } });
  }
  return boxes.sort((a, b) => b.area - a.area).slice(0, 12).map(x => x.box);
}
