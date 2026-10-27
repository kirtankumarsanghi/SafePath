"use client";
import { useEffect, useRef, useState } from "react";
import type { CellType, Point, NodeValues } from "@/lib/astar";
import { FULL_BOUNDS, type Bounds } from "@/lib/map-analysis";
export interface DrawnPath { points: Point[]; color: string; label: string; progress: number }
export interface GridMarker { id: string; point: Point; kind: string; label: string; selected?: boolean; bounds?: { left: number; top: number; right: number; bottom: number }; semanticClass?: string; legendId?: string | null }
interface GridViewProps {
  grid: Record<string, CellType>; cols: number; rows: number;
  starts: Point[]; exits: Point[]; fires: Point[];
  openSet: Set<string>; closedSet: Set<string>; fMap: Record<string, NodeValues>; frameVersion?: number;
  paths: DrawnPath[]; showFValues: boolean; activeCell: Point | null;
  cellSize?: number; interactive?: boolean; onCellClick?: (p: Point) => void;
  imageUrl?: string | null; crop?: Bounds; view?: "grid" | "overlay" | "image";
  fit?: boolean; paint?: boolean; markers?: GridMarker[];
  onStrokeStart?: () => void; onStrokeEnd?: () => void; onInspect?: (p: Point) => void;
}
export default function GridView({ grid, cols, rows, starts, exits, fires, openSet, closedSet, fMap, frameVersion, paths, showFValues, activeCell, cellSize = 26, interactive = true, onCellClick, imageUrl, crop = FULL_BOUNDS, view = "grid", fit = true, paint = false, markers = [], onStrokeStart, onStrokeEnd, onInspect }: GridViewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [loadedImage, setLoadedImage] = useState<{ url: string; image: HTMLImageElement } | null>(null);
  const image = loadedImage && loadedImage.url === imageUrl ? loadedImage.image : null;
  const [hover, setHover] = useState<Point | null>(null);
  const drawing = useRef(false), previous = useRef<Point | null>(null);
  const width = cols * cellSize, height = rows * cellSize;
  useEffect(() => {
    let alive = true;
    if (imageUrl) { const img = new Image(); img.onload = () => { if (alive) setLoadedImage({ url: imageUrl, image: img }); }; img.src = imageUrl; }
    return () => { alive = false; };
  }, [imageUrl]);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr; canvas.height = height * dpr; ctx.scale(dpr, dpr);
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, width, height);
    if (view !== "grid" && image) ctx.drawImage(image, image.width * crop.left, image.height * crop.top, image.width * (crop.right - crop.left), image.height * (crop.bottom - crop.top), 0, 0, width, height);
    const fk = new Set(fires.map(p => `${p.x},${p.y}`));
    const maxF = Math.max(1, ...Object.values(fMap).map(v => v.f));
    if (view !== "image") for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const k = `${x},${y}`, type = grid[k] ?? "empty"; let color = view === "overlay" ? "rgba(255,255,255,.03)" : "#ffffff";
      if (closedSet.has(k)) color = `hsla(${255 - (fMap[k]?.f ?? 0) / maxF * 30},60%,75%,${view === "overlay" ? .55 : .65})`;
      if (openSet.has(k)) color = "rgba(251,191,36,.65)";
      if (type === "wall") color = view === "overlay" ? "rgba(30,41,59,.7)" : "#263449";
       if (type === "blocked" || type === "window") color = "#64748b";
       if (type === "unknown") color = view === "overlay" ? "rgba(217,70,239,.24)" : "#f3e8ff";
       if (type === "obstacle") color = "#fde68a";
      if (fk.has(k) || type === "fire") color = "#f97316";
       ctx.fillStyle = color; ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
       if (type === "unknown") { ctx.save(); ctx.beginPath(); ctx.rect(x * cellSize, y * cellSize, cellSize, cellSize); ctx.clip(); ctx.strokeStyle = "rgba(147,51,234,.66)"; ctx.lineWidth = 1; for (let d = -cellSize; d <= cellSize * 2; d += 7) { ctx.beginPath(); ctx.moveTo(x * cellSize + d, y * cellSize); ctx.lineTo(x * cellSize + d - cellSize, (y + 1) * cellSize); ctx.stroke(); } ctx.restore(); }
      if (showFValues && fMap[k] && cellSize >= 15) { ctx.fillStyle = "#3b236e"; ctx.font = `600 ${Math.max(8, cellSize * .3)}px ui-monospace, monospace`; ctx.textAlign = "center"; ctx.fillText(fMap[k].f.toFixed(1), (x + .5) * cellSize, (y + .64) * cellSize); }
    }
    if (view !== "image") {
      ctx.strokeStyle = view === "overlay" ? "rgba(71,85,105,.22)" : "#e2e8f0"; ctx.lineWidth = .6; ctx.beginPath();
      for (let x = 0; x <= cols; x++) { ctx.moveTo(x * cellSize, 0); ctx.lineTo(x * cellSize, height); }
      for (let y = 0; y <= rows; y++) { ctx.moveTo(0, y * cellSize); ctx.lineTo(width, y * cellSize); } ctx.stroke();
    }
    for (const path of paths) {
      if (path.progress <= 0 || path.points.length < 2) continue;
      const points = path.points.slice(0, Math.max(2, Math.ceil(path.points.length * path.progress)));
      ctx.beginPath(); points.forEach((p, i) => { if (i) ctx.lineTo((p.x + .5) * cellSize, (p.y + .5) * cellSize); else ctx.moveTo((p.x + .5) * cellSize, (p.y + .5) * cellSize); });
      ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = path.color; ctx.lineWidth = cellSize * .48; ctx.globalAlpha = .22; ctx.stroke();
      ctx.lineWidth = cellSize * .2; ctx.globalAlpha = 1; ctx.stroke();
    }
    function badge(p: Point, color: string, label: string) {
      if (!ctx) return; ctx.fillStyle = color; ctx.fillRect(p.x * cellSize + 1, p.y * cellSize + 1, cellSize - 2, cellSize - 2);
      ctx.fillStyle = "white"; ctx.font = `700 ${Math.max(9, cellSize * .4)}px system-ui`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, (p.x + .5) * cellSize, (p.y + .5) * cellSize);
    }
    exits.forEach((p, i) => badge(p, "#059669", `E${i + 1}`)); starts.forEach((p, i) => badge(p, "#e11d48", `P${i + 1}`));
    for (const m of markers) {
      const p = m.point, color = m.semanticClass === "LEGEND" ? "#64748b" : m.semanticClass === "EXIT_SIGN" ? "#059669" : m.semanticClass === "FIRE_EXTINGUISHER" || m.semanticClass === "FIRE_ALARM" ? "#b45309" : m.semanticClass === "ROOM_LABEL" ? "#2563eb" : "#b45309";
      let bx = (p.x - .3) * cellSize, by = (p.y - .3) * cellSize, bw = cellSize * 1.6, bh = cellSize * 1.6;
      if (m.bounds) { bx = (m.bounds.left - crop.left) / (crop.right - crop.left) * width; by = (m.bounds.top - crop.top) / (crop.bottom - crop.top) * height; bw = (m.bounds.right - m.bounds.left) / (crop.right - crop.left) * width; bh = (m.bounds.bottom - m.bounds.top) / (crop.bottom - crop.top) * height; }
      ctx.strokeStyle = m.selected ? "#2563eb" : color; ctx.lineWidth = m.selected ? 3 : 2; ctx.setLineDash([4, 3]); ctx.strokeRect(bx, by, bw, bh); ctx.setLineDash([]);
      if (bw < cellSize * .8 || bh < cellSize * .8) { ctx.fillStyle = m.selected ? "#2563eb" : color; ctx.beginPath(); ctx.arc(bx + bw / 2, by + bh / 2, cellSize * .22, 0, Math.PI * 2); ctx.fill(); }
    }
    const current = hover ?? activeCell;
    if (current) { ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 2; ctx.strokeRect(current.x * cellSize + 1, current.y * cellSize + 1, cellSize - 2, cellSize - 2); }
  }, [grid, cols, rows, starts, exits, fires, openSet, closedSet, fMap, frameVersion, paths, showFValues, activeCell, cellSize, image, crop, view, width, height, hover, markers]);
  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const bounds = e.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(cols - 1, Math.floor((e.clientX - bounds.left) * cols / bounds.width))), y: Math.max(0, Math.min(rows - 1, Math.floor((e.clientY - bounds.top) * rows / bounds.height))) };
  };
  const move = (p: Point) => {
    setHover(p); onInspect?.(p);
    if (!drawing.current || !paint || !interactive || view === "image") return;
    const from = previous.current ?? p, length = Math.max(Math.abs(p.x - from.x), Math.abs(p.y - from.y));
    for (let i = 1; i <= length; i++) onCellClick?.({ x: Math.round(from.x + (p.x - from.x) * i / length), y: Math.round(from.y + (p.y - from.y) * i / length) });
    previous.current = p;
  };
  return <div style={{ width: fit ? "100%" : width, maxWidth: width, minWidth: fit ? undefined : width, aspectRatio: `${cols}/${rows}` }} className="relative select-none">
    <canvas ref={ref} data-testid="grid-canvas" data-cols={cols} data-rows={rows} role="img" aria-label={`Interactive floor grid, ${cols} columns and ${rows} rows. Use arrow keys to select a cell, Enter to apply the selected tool.`} tabIndex={interactive ? 0 : -1}
      className="block h-full w-full rounded-sm focus-visible:outline-2 focus-visible:outline-blue-500" style={{ touchAction: interactive ? "none" : "auto", cursor: interactive && view !== "image" ? "crosshair" : "default" }}
      onPointerDown={e => { if (!interactive || view === "image" || e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); e.currentTarget.focus(); drawing.current = true; const p = pointAt(e); previous.current = p; setHover(p); onStrokeStart?.(); onCellClick?.(p); }}
      onPointerMove={e => move(pointAt(e))} onPointerLeave={() => { if (!drawing.current) setHover(null); }}
      onPointerUp={() => { drawing.current = false; previous.current = null; onStrokeEnd?.(); }}
      onPointerCancel={() => { drawing.current = false; previous.current = null; onStrokeEnd?.(); }}
      onKeyDown={e => { const p = hover ?? { x: 0, y: 0 }; const d: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }; if (d[e.key]) { e.preventDefault(); move({ x: Math.max(0, Math.min(cols - 1, p.x + d[e.key].x)), y: Math.max(0, Math.min(rows - 1, p.y + d[e.key].y)) }); } else if ((e.key === "Enter" || e.key === " ") && interactive && view !== "image") { e.preventDefault(); onStrokeStart?.(); onCellClick?.(p); onStrokeEnd?.(); } }} />
  </div>;
}
