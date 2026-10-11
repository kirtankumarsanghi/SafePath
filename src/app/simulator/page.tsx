"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Play, Pause, StepBack, StepForward, SkipForward, RotateCcw, Save, Route, BrainCircuit, Loader2, CheckCircle2, AlertTriangle, SlidersHorizontal, Flame, MousePointer2, PencilRuler, ArrowLeft, ShieldCheck } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import GridView from "@/components/GridView";
import { colorForIndex, getSearchFrame, heuristicDescription, heuristicFormula, samePoint, type AStarRunResult, type HeuristicType, type Point } from "@/lib/astar";
import { computeEvacuation } from "@/lib/compute-client";
import { applyTool, cleanTerrain, inspectDocument, requestHeaders, type GridDocument, type SavedMap } from "@/lib/map-model";
function demo(): GridDocument {
  const grid: GridDocument["gridData"] = {};
  for (let y = 0; y < 20; y++) for (let x = 0; x < 28; x++) grid[`${x},${y}`] = x === 0 || y === 0 || x === 27 || y === 19 || x === 11 && y > 2 && y < 15 && y !== 9 ? "wall" : "empty";
  return { gridWidth: 28, gridHeight: 20, gridData: grid, starts: [{ x: 5, y: 5 }, { x: 18, y: 5 }], exits: [{ x: 3, y: 16 }, { x: 25, y: 16 }], obstacles: [{ x: 9, y: 9 }] };
}
export default function SimulatorPage() { return <Suspense fallback={<DashboardLayout><div className="h-80 rounded-xl animate-pulse bg-slate-200" /></DashboardLayout>}><Simulator /></Suspense>; }
function Simulator() {
  const params = useSearchParams(), router = useRouter();
  const requestedId = params.get("mapId"), autoplay = params.get("autoplay") === "1";
  const [doc, setDoc] = useState<GridDocument | null>(null), [map, setMap] = useState<SavedMap | null>(null), [maps, setMaps] = useState<{ id: number; title: string }[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const [heuristic, setHeuristic] = useState<HeuristicType>("manhattan"), [diagonal, setDiagonal] = useState(false), [live, setLive] = useState(true), [values, setValues] = useState(false);
  const [enabled, setEnabled] = useState(false), [nonce, setNonce] = useState(0), [computing, setComputing] = useState(false);
  const [results, setResults] = useState<AStarRunResult[] | null>(null), [active, setActive] = useState(0), [cursor, setCursor] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(12);
  const [tool, setTool] = useState<"inspect" | "fire" | "floor" | "wall">("inspect"), [view, setView] = useState<"grid" | "overlay" | "image">("grid"), [selected, setSelected] = useState<Point | null>(null);
  const [comparison, setComparison] = useState<{ heuristic: HeuristicType; cost: number; nodes: number; time: number }[]>([]), [comparing, setComparing] = useState(false);
  const compareAbort = useRef<AbortController | null>(null);
  useEffect(() => { fetch("/api/maps").then(r => r.json()).then(d => setMaps(d.maps ?? [])).catch(() => {}); }, []);
  useEffect(() => {
    const abort = new AbortController(); setEnabled(false); setPlaying(false); setResults(null); setMap(null); setDoc(null); setError(""); setLoading(true); setSaved(false); setComparison([]);
    if (!requestedId) { setDoc(demo()); setLoading(false); setView("grid"); return () => abort.abort(); }
    if (!/^\d+$/.test(requestedId)) { setError("Invalid map ID. Choose a saved map."); setLoading(false); return () => abort.abort(); }
    fetch(`/api/maps/${requestedId}`, { signal: abort.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load this map."); return data.map as SavedMap;
    }).then(loaded => {
      if (abort.signal.aborted) return;
      setMap(loaded); setDoc({ gridWidth: loaded.gridWidth, gridHeight: loaded.gridHeight, gridData: cleanTerrain(loaded.gridData), starts: loaded.starts, exits: loaded.exits, obstacles: loaded.obstacles });
      setView(loaded.imageUrl ? "overlay" : "grid"); setHeuristic("manhattan"); setDiagonal(false);
      setEnabled(autoplay && (!loaded.imageUrl || !!loaded.analysis?.reviewed));
    }).catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [requestedId, autoplay]);
  useEffect(() => {
    compareAbort.current?.abort(); setComparison([]); setComparing(false); setSaved(false);
    if (!enabled || !doc || loading) { setComputing(false); return; }
    if (!doc.starts.length || !doc.exits.length) { setResults(null); setPlaying(false); setComputing(false); setError("Place at least one person and one confirmed exit before running A*."); return; }
    const abort = new AbortController(); setComputing(true); setResults(null); setCursor(0); setPlaying(false); setError("");
    const timer = setTimeout(() => {
      computeEvacuation(doc, heuristic, { allowDiagonal: diagonal }, abort.signal).then(r => { if (!abort.signal.aborted) { setResults(r); setActive(0); setCursor(0); setPlaying((r[0]?.steps.length ?? 0) > 0); } }).catch(e => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setComputing(false); });
    }, 100);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [doc, heuristic, diagonal, enabled, nonce, loading]);
  const run = results?.[active], total = run?.steps.length ?? 0;
  useEffect(() => {
    if (!playing || total === 0) return;
    if (cursor >= total) { setPlaying(false); return; }
    const timer = setTimeout(() => setCursor(c => Math.min(total, c + 1)), 1000 / speed);
    return () => clearTimeout(timer);
  }, [playing, cursor, total, speed]);
  useEffect(() => () => compareAbort.current?.abort(), []);
  const frame = useMemo(() => getSearchFrame(run, cursor - 1), [run, cursor]);
  const current = cursor ? run?.steps[cursor - 1] : null, done = !!run && cursor >= total;
  const paths = useMemo(() => (done ? results ?? [] : []).map((r, i) => ({ points: r.path, color: colorForIndex(i).stroke, label: `Person ${i + 1}`, progress: 1 })), [results, done]);
  const chosenValues = selected ? frame.fMap[`${selected.x},${selected.y}`] : null;
  const draft = !!map?.imageUrl && !map.analysis?.reviewed;
  const noRoute = !!results?.some(r => !r.reached);
  function search() { if (draft) { setError("This uploaded map is still a draft. Refine it and confirm the source review before running A*."); return; } setEnabled(true); setNonce(n => n + 1); }
  function edit(p: Point) {
    if (!doc || tool === "inspect") return;
    let next: GridDocument;
    if (tool === "fire" && doc.obstacles.some(q => samePoint(q, p))) next = { ...doc, obstacles: doc.obstacles.filter(q => !samePoint(q, p)) };
    else next = applyTool(doc, tool, p);
    setDoc(next); setResults(null); setPlaying(false); setCursor(0); setError(""); if (!live) setEnabled(false);
  }
  async function saveRun() {
    if (!doc || !results || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/runs", { method: "POST", headers: requestHeaders(), body: JSON.stringify({ mapId: map?.id ?? null, title: `${map?.title ?? "Practice grid"} — ${heuristic}`, document: doc, heuristic, config: { allowDiagonal: diagonal } }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save the run."); setSaved(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the run."); } finally { setSaving(false); }
  }
  async function compare() {
    if (!doc || comparing || !doc.starts[active]) return;
    setComparing(true); compareAbort.current?.abort(); const abort = new AbortController(); compareAbort.current = abort;
    try {
      const table = [];
      for (const h of ["manhattan", "euclidean", "chebyshev"] as HeuristicType[]) {
        const [r] = await computeEvacuation({ ...doc, starts: [doc.starts[active]] }, h, { allowDiagonal: diagonal, trace: false }, abort.signal);
        table.push({ heuristic: h, cost: r.stats.totalCost, nodes: r.stats.nodesExplored, time: r.stats.timeTakenMs });
      }
      if (!abort.signal.aborted) setComparison(table);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Comparison failed."); } finally { if (!abort.signal.aborted) setComparing(false); }
  }
  let narration = "Place a person and confirmed exits, then run A*. Routes are constrained to the reviewed grid; they are not a prediction of real evacuation safety.";
  if (computing) narration = "A* is evaluating the grid in a background worker. The interface stays responsive while the search runs.";
  else if (run && cursor === 0) narration = "Start initialized: g = 0. The heuristic is the minimum lower-bound distance to all unblocked exits. The frontier contains the starting cell.";
  else if (done) narration = run?.reached ? `Exit reached at (${run.exit.x}, ${run.exit.y}). Parent pointers reconstruct an optimal path for this grid with cost ${run.stats.totalCost.toFixed(2)}.` : run?.reason ?? "No route found.";
  else if (current) narration = `Expanded (${current.popped.x}, ${current.popped.y}): f = ${current.poppedF.toFixed(2)} = g ${current.poppedG.toFixed(2)} + h ${current.poppedH.toFixed(2)}. ${current.updates.length} neighbor scores updated. Amber cells are the frontier; purple cells have been explored.`;
  return <DashboardLayout><div className="planner">
    <div className="plan-breadcrumb"><Link href={map ? `/maps/${map.id}` : "/maps"}><ArrowLeft size={13} className="inline mr-1" />{map ? "Back to this map" : "My saved maps"}</Link><span>/</span><span>A* simulator</span></div>
    <header className="plan-page-heading"><div><div className="plan-eyebrow">SEARCH, STEP BY STEP</div><h1>A* route simulator</h1><p data-testid="loaded-map-title">{loading ? "Loading your saved map…" : map?.title ?? "Practice grid · choose a saved floor plan to use your building"}</p></div>{map && <Link className="plan-btn secondary" href={`/maps/${map.id}`}><PencilRuler size={15} />Refine this map</Link>}</header>
    {params.get("saved") === "1" && map && <div className="plan-success-bar" role="status"><CheckCircle2 size={17} />Map #{map.id} and its A* result were saved. You are viewing that exact reviewed grid.</div>}
    {error && <div className="plan-alert error" role="alert"><AlertTriangle size={18} /><div>{error}</div></div>}
    {draft && <div className="plan-alert"><AlertTriangle size={18} /><div>This map is a draft. <Link href={`/maps/${map?.id}`} className="underline">Review doors and confirm exit positions</Link> before running A*.</div></div>}
    <section className="plan-card plan-pad" style={{ marginBottom: 20 }}><div className="plan-sim-header"><select aria-label="Select saved map" value={requestedId ?? ""} onChange={e => router.push(e.target.value ? `/simulator?mapId=${e.target.value}` : "/simulator")}><option value="">Practice grid</option>{maps.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select><div className="plan-form-row"><label>Heuristic <select aria-label="Heuristic" value={heuristic} onChange={e => setHeuristic(e.target.value as HeuristicType)}><option value="manhattan">Manhattan</option><option value="euclidean">Euclidean</option><option value="chebyshev">Chebyshev</option></select></label><button className="plan-btn primary" disabled={computing || loading || !doc || draft} onClick={search}>{computing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}{computing ? "Searching…" : results ? "Re-run A*" : "Run A*"}</button></div></div></section>
    {loading ? <div className="h-96 rounded-xl bg-slate-200 animate-pulse" /> : doc && <div className="plan-workspace"><div className="plan-main-column">
      <section className="plan-card"><div className="editor-toolbar"><div className="plan-segmented">{(["grid", "overlay", "image"] as const).map(v => <button key={v} disabled={!map?.imageUrl && v !== "grid"} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v === "grid" ? "Grid" : v === "overlay" ? "Image + grid" : "Source"}</button>)}</div><span className="plan-mono">{doc.gridWidth} × {doc.gridHeight} cells</span></div><div className="editor-tools">{([{ id: "inspect", label: "Inspect node", Icon: MousePointer2 }, { id: "fire", label: "Toggle fire", Icon: Flame }, { id: "floor", label: "Open door", Icon: PencilRuler }, { id: "wall", label: "Wall", Icon: SlidersHorizontal }] as const).map(t => <button key={t.id} className={tool === t.id ? "selected" : ""} onClick={() => setTool(t.id)}><t.Icon size={14} />{t.label}</button>)}</div><div className="editor-canvas-wrap"><GridView grid={doc.gridData} cols={doc.gridWidth} rows={doc.gridHeight} starts={doc.starts} exits={doc.exits} fires={doc.obstacles} openSet={frame.open} closedSet={frame.closed} fMap={frame.fMap} paths={paths} showFValues={values} activeCell={current?.popped ?? null} imageUrl={map?.imageUrl} crop={map?.analysis?.options.crop} view={view} onCellClick={edit} onInspect={setSelected} cellSize={30} /></div><div className="editor-footer"><div className="plan-legend"><span><i style={{ background: "#263449" }} />Wall</span><span><i style={{ background: "#fbbf24" }} />Frontier</span><span><i style={{ background: "#a78bfa" }} />Explored</span><span><i style={{ background: "#059669" }} />Final path</span></div><span className="plan-mono">{selected ? `(${selected.x}, ${selected.y})${chosenValues ? ` f=${chosenValues.f.toFixed(1)}` : ""}` : "Hover to inspect"}</span></div></section>
      <section className="plan-card plan-pad"><div className="plan-sim-controls"><button aria-label="Reset playback" title="Reset playback" disabled={!results} onClick={() => { setCursor(0); setPlaying(false); }}><RotateCcw size={16} /></button><button aria-label="Step back" title="Step back" disabled={!cursor} onClick={() => { setPlaying(false); setCursor(c => Math.max(0, c - 1)); }}><StepBack size={17} /></button><button className="play" disabled={!total} onClick={() => { if (cursor >= total) setCursor(0); setPlaying(p => !p); }}>{playing ? <Pause size={16} /> : <Play size={16} />}<span style={{ marginLeft: 6 }}>{playing ? "Pause" : "Play"}</span></button><button aria-label="Step forward" title="Step forward" disabled={!total || done} onClick={() => { setPlaying(false); setCursor(c => Math.min(total, c + 1)); }}><StepForward size={17} /></button><button aria-label="Show final route" title="Show final route" disabled={!total} onClick={() => { setCursor(total); setPlaying(false); }}><SkipForward size={17} /></button><label className="plan-small" style={{ margin: "0 0 0 auto" }}>Speed <input aria-label="Playback speed" type="range" min={1} max={60} value={speed} onChange={e => setSpeed(Number(e.target.value))} className="accent-orange-500 w-20 align-middle" /> {speed}/s</label></div><div className="plan-sim-progress"><input type="range" aria-label="Search step" min={0} max={total || 1} value={cursor} disabled={!total} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false); }} /><span>{cursor} / {total} expanded</span></div></section>
      <section className="plan-card plan-pad"><div className="plan-section-heading"><h3><BrainCircuit size={18} />What A* is doing</h3><span className="plan-pill neutral">{done ? run?.reached ? "Goal reached" : "No route" : computing ? "Computing" : playing ? "Exploring" : "Paused"}</span></div><p style={{ fontSize: 12, color: "var(--p-muted)", lineHeight: 1.8 }}>{narration}</p></section>
      {noRoute && <div className="plan-alert"><AlertTriangle size={18} /><div>At least one person has no route through this model. Review their position, doorways and blocked cells. A* does not remove walls to manufacture a route.</div></div>}
      <section className="plan-card plan-pad"><div className="plan-section-heading"><h3>Compare heuristics fairly</h3><button className="plan-btn secondary small" disabled={comparing || !results} onClick={compare}>{comparing ? <Loader2 size={14} className="animate-spin" /> : <SlidersHorizontal size={14} />}Compare</button></div><p className="plan-small">Same person, grid, exits and movement costs. Only the heuristic changes. Runtime is measured separately from animation.</p>{comparison.length > 0 && <table className="plan-comparison"><thead><tr><th>Heuristic</th><th>Cost</th><th>Explored</th><th>Time</th></tr></thead><tbody>{comparison.map(r => <tr key={r.heuristic}><td className="capitalize">{r.heuristic}</td><td>{Number.isFinite(r.cost) ? r.cost.toFixed(2) : "No route"}</td><td>{r.nodes}</td><td>{r.time.toFixed(2)} ms</td></tr>)}</tbody></table>}</section>
    </div><aside className="plan-side-column"><section className="plan-card plan-pad"><div className="plan-section-heading"><h3>Live search statistics</h3></div><div className="plan-sim-stats">{[{ label: "Path cost", value: done && run?.reached ? run.stats.totalCost.toFixed(2) : "—" }, { label: "Expanded", value: cursor }, { label: "Open list", value: frame.open.size }, { label: "Closed list", value: frame.closed.size }, { label: "Compute time", value: run ? `${run.stats.timeTakenMs.toFixed(2)} ms` : "—" }, { label: "Routes found", value: results ? `${results.filter(r => r.reached).length} / ${doc.starts.length}` : "—" }].map(s => <div key={s.label}><span>{s.label}</span><strong>{s.value}</strong></div>)}</div><p className="plan-small">Costs are grid units, not meters or evacuation time. People are routed independently; crowd congestion is not modeled.</p></section>
      {results && <section className="plan-card plan-pad"><div className="plan-section-heading"><h3>People & exit assignments</h3></div><div className="plan-people-buttons">{results.map((r, i) => <button key={i} className={i === active ? "active" : ""} onClick={() => { setActive(i); setCursor(0); setPlaying(false); setComparison([]); }}>Person {i + 1} <span>{r.reached ? `Exit (${r.exit.x}, ${r.exit.y}) · cost ${r.stats.totalCost.toFixed(2)}` : "No reachable exit"}</span></button>)}</div></section>}
      <section className="plan-card plan-pad"><h3>Search model</h3><label className="plan-checkbox"><input type="checkbox" checked={diagonal} onChange={e => setDiagonal(e.target.checked)} /><span>Allow diagonals (cost √2; no corner cutting)</span></label><label className="plan-checkbox"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /><span>Re-plan after fire or grid edits</span></label><label className="plan-checkbox"><input type="checkbox" checked={values} onChange={e => setValues(e.target.checked)} /><span>Show f(n) on discovered cells</span></label><div className="plan-theory-code">f(n) = g(n) + h(n)<br />{heuristicFormula(heuristic)}{diagonal && heuristic === "manhattan" && <><br />h is scaled by 1 / √2</>}</div><p className="plan-small">{heuristicDescription(heuristic)} For multiple exits, use the minimum estimate to any exit.</p><button className="plan-btn primary full" onClick={saveRun} disabled={!results || saving || saved}>{saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}{saved ? "Run saved to history" : saving ? "Saving result…" : "Save this run"}</button><Link className="plan-text-btn mt-3" href="/runs">View run history</Link></section>
      <section className="plan-card plan-pad"><h3>Why A* finds the optimal route</h3><p className="plan-small">g(n) is the actual cost from the person. h(n) is a lower bound to the nearest goal. A* expands the smallest f(n), then reconstructs the parent chain when it reaches an exit.</p><p className="plan-small">Walls and fire have infinite cost. With these non-negative movement costs and an admissible heuristic, the returned route is optimal for this grid—not necessarily for the real building.</p><Link className="plan-text-btn" href="/theory">Explore the algorithm theory</Link></section>
    </aside></div>}
    <footer className="plan-safety-note"><ShieldCheck size={17} /><p>Educational planning model only. Image extraction and user edits must be checked against the real building. In an emergency, follow posted exits, staff instructions and local emergency guidance.</p></footer>
  </div></DashboardLayout>;
}
