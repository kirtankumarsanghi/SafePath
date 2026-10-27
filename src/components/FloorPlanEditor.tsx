"use client";
import { useEffect, useRef, useState } from "react";
import { UserRound, DoorOpen, Square, Flame, Eraser, Undo2, ZoomIn, ZoomOut, Scan, Ban, MousePointer2 } from "lucide-react";
import GridView, { type DrawnPath, type GridMarker } from "./GridView";
import { applyTool, type EditTool, type GridDocument } from "@/lib/map-model";
import type { Bounds } from "@/lib/map-analysis";
import type { Point } from "@/lib/astar";
const TOOLS = [
  { id: "person", label: "Person", Icon: UserRound, help: "Click a walkable cell to place a person. Click again to remove them." },
  { id: "exit", label: "Exit", Icon: DoorOpen, help: "Mark the actual exit doorway, not an arrow or a legend symbol. Click again to remove it." },
  { id: "wall", label: "Wall", Icon: Square, help: "Drag to draw solid walls. A* will never cross these cells." },
  { id: "floor", label: "Walkable / door", Icon: Scan, help: "Drag to open a verified door or corridor. Only clear walls where the source actually shows a passage." },
  { id: "fire", label: "Fire", Icon: Flame, help: "Draw a simulated fire zone. This does not mean fire was detected in the building." },
  { id: "blocked", label: "Exclude area", Icon: Ban, help: "Block legends, exterior margins, locked doors or other non-navigable areas." },
  { id: "erase", label: "Erase", Icon: Eraser, help: "Clear the selected cell, including its person, exit, wall and fire markers." },
] as const;
const EMPTY = new Set<string>();
export default function FloorPlanEditor({ document: doc, onChange, imageUrl, crop, markers = [], paths = [], initialTool = "person" }: {
  document: GridDocument; onChange: (doc: GridDocument) => void; imageUrl?: string | null; crop?: Bounds;
  markers?: GridMarker[]; paths?: DrawnPath[]; initialTool?: EditTool;
}) {
  const [tool, setTool] = useState<EditTool>(initialTool), [view, setView] = useState<"overlay" | "grid" | "image">(imageUrl ? "overlay" : "grid");
  const [zoom, setZoom] = useState(0), [brush, setBrush] = useState(1), [hover, setHover] = useState<Point | null>(null), [undoCount, setUndoCount] = useState(0);
  const [feedback, setFeedback] = useState("");
  const history = useRef<GridDocument[]>([]), latest = useRef(doc);
  useEffect(() => { latest.current = doc; }, [doc]);
  useEffect(() => { history.current = []; queueMicrotask(() => setUndoCount(0)); }, [doc.gridWidth, doc.gridHeight, imageUrl]);
  const paint = tool !== "person" && tool !== "exit";
  const edit = (p: Point) => {
    let next = latest.current; const r = paint ? Math.floor(brush / 2) : 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) next = applyTool(next, tool, { x: p.x + dx, y: p.y + dy });
    if (next === latest.current && !paint) {
      setFeedback("That position is blocked or already occupied. Choose a different walkable cell, or use Walkable / door only if the source shows a real passage.");
      if (history.current.at(-1) === latest.current) history.current.pop();
      setUndoCount(history.current.length);
      return;
    }
    setFeedback(""); latest.current = next; onChange(next);
  };
  return <section className="plan-card editor-card" aria-label="Refine your floor plan">
    <div className="editor-toolbar">
      <div className="plan-segmented" aria-label="Map view">{(["image", "overlay", "grid"] as const).map(v => <button key={v} type="button" disabled={!imageUrl && v !== "grid"} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v === "image" ? "Source image" : v === "overlay" ? "Image + grid" : "Grid only"}</button>)}</div>
      <div className="editor-zoom"><button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0, z - 1))}><ZoomOut size={16} /></button><button type="button" onClick={() => setZoom(0)}>{zoom === 0 ? "Fit" : `${100 + zoom * 25}%`}</button><button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(6, z + 1))}><ZoomIn size={16} /></button></div>
    </div>
    <div className="editor-tools" role="toolbar" aria-label="Grid editing tools">{TOOLS.map(t => <button type="button" key={t.id} aria-pressed={tool === t.id} title={t.help} className={tool === t.id ? "selected" : ""} onClick={() => { setTool(t.id); setFeedback(""); if (view === "image") setView("overlay"); }}><t.Icon size={15} />{t.label}</button>)}<button type="button" disabled={!undoCount} title="Undo grid edit" aria-label="Undo grid edit" onClick={() => { const prev = history.current.pop(); if (prev) { latest.current = prev; onChange(prev); } setUndoCount(history.current.length); }}><Undo2 size={15} />Undo</button></div>
    <div className="editor-hint" role="status"><MousePointer2 size={14} /><span className={feedback ? "plan-emphasis" : ""}>{feedback || (view === "image" ? "Source-only view. Choose Image + grid to edit." : TOOLS.find(t => t.id === tool)?.help)}</span>{paint && <label>Brush <select aria-label="Brush size" value={brush} onChange={e => setBrush(Number(e.target.value))}><option value={1}>1 cell</option><option value={3}>3 cells</option><option value={5}>5 cells</option></select></label>}</div>
    <div className="editor-canvas-wrap"><div style={{ minWidth: zoom ? `${100 + zoom * 25}%` : "100%" }}><GridView grid={doc.gridData} cols={doc.gridWidth} rows={doc.gridHeight} starts={doc.starts} exits={doc.exits} fires={doc.obstacles} openSet={EMPTY} closedSet={EMPTY} fMap={{}} paths={paths} showFValues={false} activeCell={null} imageUrl={imageUrl} crop={crop} view={view} cellSize={30} fit paint={paint} markers={markers}
      onInspect={setHover} onCellClick={edit} onStrokeStart={() => { history.current.push(latest.current); if (history.current.length > 40) history.current.shift(); setUndoCount(history.current.length); }} /></div></div>
    <div className="editor-footer"><div className="plan-legend"><span><i style={{ background: "#263449" }} />Wall</span><span><i style={{ background: "#e11d48" }} />Person</span><span><i style={{ background: "#059669" }} />Confirmed exit</span><span><i style={{ background: "#f97316" }} />Fire</span><span><i className="candidate-key" />Candidate</span></div><span className="plan-mono">{hover ? `Cell (${hover.x}, ${hover.y})` : `${doc.gridWidth} × ${doc.gridHeight} cells`}</span></div>
  </section>;
}
