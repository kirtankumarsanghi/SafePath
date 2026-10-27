"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Play, Pause, StepBack, StepForward, SkipForward, RotateCcw, Save, Route, BrainCircuit, Loader2, CheckCircle2, AlertTriangle, SlidersHorizontal, Flame, MousePointer2, PencilRuler, ArrowLeft, ShieldCheck, UserRound, DoorOpen, Info, CloudFog, Layers } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import GridView from "@/components/GridView";
import SimulatorStatsPanel from "@/components/simulator/SimulatorStatsPanel";
import PeopleAssignmentCard from "@/components/simulator/PeopleAssignmentCard";
import HeuristicComparisonCard, { type HeuristicComparisonRow } from "@/components/simulator/HeuristicComparisonCard";
import { colorForIndex, getSearchFrame, heuristicDescription, heuristicFormula, samePoint, type AStarRunResult, type HeuristicType, type Point } from "@/lib/astar";
import { computeEvacuation } from "@/lib/compute-client";
import { applyTool, cleanTerrain, inspectDocument, requestHeaders, type GridDocument, type SavedMap } from "@/lib/map-model";
import { getCustomMaps, getCustomMapById, toMapSummary, ensureValidCoordinates } from "@/lib/custom-maps-storage";

function demo(): GridDocument {
  const grid: GridDocument["gridData"] = {};
  for (let y = 0; y < 20; y++) for (let x = 0; x < 28; x++) grid[`${x},${y}`] = x === 0 || y === 0 || x === 27 || y === 19 || x === 11 && y > 2 && y < 15 && y !== 9 ? "wall" : "empty";
  return { gridWidth: 28, gridHeight: 20, gridData: grid, starts: [{ x: 5, y: 5 }, { x: 18, y: 5 }], exits: [{ x: 3, y: 16 }, { x: 25, y: 16 }], obstacles: [] };
}
function demoSmall(): GridDocument {
  const grid: GridDocument["gridData"] = {};
  for (let y = 0; y < 6; y++) for (let x = 0; x < 9; x++) grid[`${x},${y}`] = x === 0 || y === 0 || x === 8 || y === 5 || x === 4 && y > 0 && y < 4 ? "wall" : "empty";
  return { gridWidth: 9, gridHeight: 6, gridData: grid, starts: [{ x: 1, y: 2 }], exits: [{ x: 7, y: 2 }], obstacles: [{ x: 2, y: 2 }] };
}
export default function SimulatorPage() { return <Suspense fallback={<DashboardLayout><div className="h-80 rounded-xl animate-pulse bg-slate-200" /></DashboardLayout>}><Simulator /></Suspense>; }
function Simulator() {
  const params = useSearchParams(), router = useRouter();
  const requestedId = params.get("mapId"), autoplay = params.get("autoplay") === "1";
  const [doc, setDoc] = useState<GridDocument | null>(null), [map, setMap] = useState<SavedMap | null>(null), [maps, setMaps] = useState<{ id: number; title: string }[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [saving, setSaving] = useState(false), [saved, setSaved] = useState(false);
  const [heuristic, setHeuristic] = useState<HeuristicType>("manhattan"), [diagonal, setDiagonal] = useState(false), [live, setLive] = useState(true), [values, setValues] = useState(false);
  const [congestionPenalty, setCongestionPenalty] = useState(0), [exitCapacity, setExitCapacity] = useState(0), [fireBufferPenalty, setFireBufferPenalty] = useState(0);
  const [scaleMeters, setScaleMeters] = useState(1.0), [walkingSpeed, setWalkingSpeed] = useState(1.35);
  const [enabled, setEnabled] = useState(false), [nonce, setNonce] = useState(0), [computing, setComputing] = useState(false);
  const [results, setResults] = useState<AStarRunResult[] | null>(null), [active, setActive] = useState(0), [cursor, setCursor] = useState(0), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(12);
  const [tool, setTool] = useState<"inspect" | "person" | "exit" | "fire" | "smoke" | "stairs" | "floor" | "wall">("inspect"), [view, setView] = useState<"grid" | "overlay" | "image">("grid"), [selected, setSelected] = useState<Point | null>(null);
  const [comparison, setComparison] = useState<HeuristicComparisonRow[]>([]), [comparing, setComparing] = useState(false), [compareAll, setCompareAll] = useState(false);
  const compareAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const loadMaps = () => {
      fetch("/api/maps")
        .then(r => r.json())
        .then(d => {
          const serverMaps = d.maps ?? [];
          const localMaps = getCustomMaps().map(toMapSummary);
          const merged = [...localMaps, ...serverMaps].filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);
          setMaps(merged);
        })
        .catch(() => {
          const localMaps = getCustomMaps().map(toMapSummary);
          setMaps(localMaps);
        });
    };

    loadMaps();
    window.addEventListener("safepath-maps-updated", loadMaps);
    return () => window.removeEventListener("safepath-maps-updated", loadMaps);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    queueMicrotask(() => {
      if (abort.signal.aborted) return;
      setEnabled(false); setPlaying(false); setResults(null); setMap(null); setDoc(null); setError(""); setLoading(true); setSaved(false); setComparison([]);
      if (!requestedId) {
        setDoc(demo());
        setLoading(false);
        setView("grid");
        return;
      }
      if (!/^\d+$/.test(requestedId)) {
        setError("Invalid map ID. Choose a saved map.");
        setLoading(false);
        return;
      }
      const local = getCustomMapById(requestedId);
      if (local) {
        setMap(local);
        const rawDoc: GridDocument = {
          gridWidth: local.gridWidth,
          gridHeight: local.gridHeight,
          gridData: cleanTerrain(local.gridData),
          starts: Array.isArray(local.starts) ? local.starts : [],
          exits: Array.isArray(local.exits) ? local.exits : [],
          obstacles: Array.isArray(local.obstacles) ? local.obstacles : [],
        };
        const { doc: readyDoc } = ensureValidCoordinates(rawDoc);
        setDoc(readyDoc);
        setView(local.imageUrl ? "overlay" : "grid");
        setHeuristic("manhattan");
        setDiagonal(false);
        setEnabled(true);
        setLoading(false);
        return;
      }

      fetch(`/api/maps/${requestedId}`, { signal: abort.signal })
        .then(async response => {
          if (response.ok) {
            const data = await response.json();
            if (data.map) return data.map as SavedMap;
          }
          throw new Error("Server lookup failed");
        })
        .catch(() => {
          throw new Error("Could not load this floor plan.");
        })
        .then(loaded => {
          if (abort.signal.aborted) return;
          setMap(loaded);
          const rawDoc: GridDocument = {
            gridWidth: loaded.gridWidth,
            gridHeight: loaded.gridHeight,
            gridData: cleanTerrain(loaded.gridData),
            starts: Array.isArray(loaded.starts) ? loaded.starts : [],
            exits: Array.isArray(loaded.exits) ? loaded.exits : [],
            obstacles: Array.isArray(loaded.obstacles) ? loaded.obstacles : [],
          };
          const { doc: readyDoc } = ensureValidCoordinates(rawDoc);
          setDoc(readyDoc);
          setView(loaded.imageUrl ? "overlay" : "grid");
          setHeuristic("manhattan");
          setDiagonal(false);
          setEnabled(true);
        })
        .catch(e => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    });
    return () => abort.abort();
  }, [requestedId, autoplay]);

  useEffect(() => {
    compareAbort.current?.abort();
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setComparison([]); setComparing(false); setSaved(false);
      if (!enabled || !doc || loading) { setComputing(false); return; }
      if (!doc.starts.length || !doc.exits.length) { setResults(null); setPlaying(false); setComputing(false); setError("Place at least one person and one confirmed exit before running A*."); return; }
      setComputing(true); setResults(null); setCursor(0); setPlaying(false); setError("");
      computeEvacuation(
        doc,
        heuristic,
        {
          allowDiagonal: diagonal,
          congestionPenalty,
          exitCapacity: exitCapacity > 0 ? exitCapacity : undefined,
          fireBufferPenalty,
          includeSecondBestExit: true,
        },
        abort.signal
      )
        .then(r => {
          if (!abort.signal.aborted) {
            setResults(r);
            setActive(0);
            setCursor(0);
            setPlaying((r[0]?.steps.length ?? 0) > 0);
          }
        })
        .catch(e => {
          if (!abort.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setComputing(false);
        });
    }, 100);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [doc, heuristic, diagonal, congestionPenalty, exitCapacity, fireBufferPenalty, enabled, nonce, loading]);

  const run = results?.[active], total = run?.steps.length ?? 0;
  useEffect(() => {
    if (!playing || total === 0) return;
    const timer = setTimeout(() => {
      if (cursor >= total) setPlaying(false);
      else setCursor(c => Math.min(total, c + 1));
    }, cursor >= total ? 0 : 1000 / speed);
    return () => clearTimeout(timer);
  }, [playing, cursor, total, speed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "CANVAS"].includes(target.tagName) || target.isContentEditable) return;
      if (e.key === "[" && cursor > 0) {
        e.preventDefault();
        setPlaying(false);
        setCursor(c => Math.max(0, c - 1));
      } else if (e.key === "]" && total > 0 && cursor < total) {
        e.preventDefault();
        setPlaying(false);
        setCursor(c => Math.min(total, c + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursor, total]);

  useEffect(() => () => compareAbort.current?.abort(), []);
  const frame = useMemo(() => getSearchFrame(run, cursor - 1), [run, cursor]);
  const current = cursor ? run?.steps[cursor - 1] : null, done = !!run && cursor >= total;
  const node = current ? { point: current.popped, g: current.poppedG, h: current.poppedH, f: current.poppedF } : run?.initial ? { point: { x: run.initial.x, y: run.initial.y }, g: run.initial.g, h: run.initial.h, f: run.initial.f } : null;
  const shownHeuristic = run?.stats.heuristicUsed ?? heuristic;
  const paths = useMemo(() => (done ? results ?? [] : []).map((r, i) => ({ points: r.path, color: colorForIndex(i).stroke, label: `Person ${i + 1}`, progress: 1 })), [results, done]);
  const chosenValues = selected ? frame.fMap[`${selected.x},${selected.y}`] : null;
  const draft = !!map?.imageUrl && !map.analysis?.reviewed;
  const failures = (results ?? []).map((r, i) => ({ run: r, person: i + 1 })).filter(x => !x.run.reached);
  const precheck = useMemo(() => (doc ? inspectDocument(doc, { allowDiagonal: diagonal }) : null), [doc, diagonal]);

  function search() { setEnabled(true); setNonce(n => n + 1); }
  function resetDemo() {
    if (requestedId) { router.push("/simulator"); return; }
    setDoc(demo()); setResults(null); setCursor(0); setPlaying(false); setError(""); setComparison([]); setActive(0); setSaved(false); setEnabled(false); setCongestionPenalty(0); setExitCapacity(0); setFireBufferPenalty(0);
  }
  function loadSmallDemo() {
    setDoc(demoSmall()); setResults(null); setCursor(0); setPlaying(false); setError(""); setComparison([]); setActive(0); setSaved(false); setEnabled(true);
  }
  function edit(p: Point) {
    if (!doc || tool === "inspect") return;
    let next: GridDocument;
    if (tool === "fire" && doc.obstacles.some(q => samePoint(q, p))) next = { ...doc, obstacles: doc.obstacles.filter(q => !samePoint(q, p)) };
    else next = applyTool(doc, tool, p);
    setDoc(next); setResults(null); setPlaying(false); setCursor(0); setError(""); if (live) { setEnabled(true); setNonce(n => n + 1); }
  }
  async function saveRun() {
    if (!doc || !results || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/runs", { method: "POST", headers: requestHeaders(), body: JSON.stringify({ mapId: map?.id ?? null, title: `${map?.title ?? "Practice grid"} — ${heuristic}`, document: doc, heuristic, config: { allowDiagonal: diagonal, congestionPenalty, exitCapacity: exitCapacity > 0 ? exitCapacity : undefined, fireBufferPenalty } }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save the run."); setSaved(true);
    } catch (e) {
      setSaved(false); setError(e instanceof Error ? e.message : "Could not save this run.");
    } finally { setSaving(false); }
  }
  async function compare() {
    if (!doc || comparing) return;
    const starts = compareAll ? doc.starts : doc.starts[active] ? [doc.starts[active]] : [];
    if (!starts.length) return;
    setComparing(true); compareAbort.current?.abort(); const abort = new AbortController(); compareAbort.current = abort;
    try {
      const table: HeuristicComparisonRow[] = [];
      for (const h of ["manhattan", "euclidean", "chebyshev"] as HeuristicType[]) {
        const runs = await computeEvacuation({ ...doc, starts }, h, { allowDiagonal: diagonal, congestionPenalty, exitCapacity: exitCapacity > 0 ? exitCapacity : undefined, fireBufferPenalty, trace: false }, abort.signal);
        const complete = runs.every(r => r.reached);
        table.push({
          heuristic: h,
          cost: complete ? runs.reduce((sum, r) => sum + r.stats.totalCost, 0) : Infinity,
          nodes: runs.reduce((sum, r) => sum + r.stats.nodesExplored, 0),
          time: runs.reduce((sum, r) => sum + r.stats.timeTakenMs, 0),
        });
      }
      if (!abort.signal.aborted) setComparison(table);
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Comparison failed."); } finally { if (!abort.signal.aborted) setComparing(false); }
  }
  function exportJson() {
    if (!doc || !results) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      mapTitle: map?.title ?? "Practice grid",
      heuristic,
      config: { allowDiagonal: diagonal, congestionPenalty, exitCapacity: exitCapacity || null, fireBufferPenalty, scaleMeters, walkingSpeed },
      document: doc,
      results: results.map((r, i) => ({
        person: i + 1,
        reached: r.reached,
        status: r.status,
        start: r.start,
        exit: r.exit,
        path: r.path,
        stats: r.stats,
        alternativeExit: r.alternativeExit ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `safepath-run-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function exportPng() {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="grid-canvas"]');
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `safepath-route-${Date.now()}.png`;
    a.click();
  }

  let narration = "Place a person and confirmed exits, then run A*. Routes are constrained to the reviewed grid; they are not a prediction of real evacuation safety.";
  if (computing) narration = "A* is evaluating the grid in a background worker. The interface stays responsive while the search runs.";
  else if (run && cursor === 0) narration = "Start initialized: g = 0. The heuristic is the minimum lower-bound distance to all unblocked exits. The frontier contains the starting cell.";
  else if (done) narration = run?.reached ? `Exit reached at (${run.exit.x}, ${run.exit.y}). Parent pointers reconstruct an optimal path for this grid with cost ${run.stats.totalCost.toFixed(2)}.` : run?.reason ?? "No route found.";
  else if (current) narration = `Expanded (${current.popped.x}, ${current.popped.y}): f = ${current.poppedF.toFixed(2)} = g ${current.poppedG.toFixed(2)} + h ${current.poppedH.toFixed(2)}. ${current.updates.length} neighbor scores updated. It was popped because it had the lowest f in OPEN; ties break on lower h, then insertion order. Amber cells are the frontier; purple cells have been explored.`;

  return <DashboardLayout><div className="planner">
    <div className="plan-breadcrumb"><Link href={map ? `/maps/${map.id}` : "/maps"}><ArrowLeft size={13} className="inline mr-1" />{map ? "Back to this map" : "My saved maps"}</Link><span>/</span><span>A* simulator</span></div>
    <header className="plan-page-heading"><div><div className="plan-eyebrow">SEARCH, STEP BY STEP</div><h1>A* route simulator</h1><p data-testid="loaded-map-title">{loading ? "Loading your saved map…" : map?.title ?? "Practice grid · choose a saved floor plan to use your building"}</p></div>{map && <Link className="plan-btn secondary" href={`/maps/${map.id}`}><PencilRuler size={15} />Refine this map</Link>}</header>
    {params.get("saved") === "1" && map && <div className="plan-success-bar" role="status"><CheckCircle2 size={17} />Map #{map.id} and its A* result were saved. You are viewing that exact reviewed grid.</div>}
    {error && <div className="plan-alert error" role="alert"><AlertTriangle size={18} /><div>{error}</div></div>}
    {precheck && (precheck.errors.length > 0 || precheck.unreachable.length > 0) && <div className="plan-alert" data-testid="precheck-alert"><Info size={18} /><div>{precheck.errors.map((e, i) => <p key={`${e}-${i}`}>{e}</p>)}{precheck.unreachable.length > 0 && <p>Pre-check: {precheck.unreachable.length} of {doc?.starts.length ?? 0} {precheck.unreachable.length === 1 ? "person cannot" : "people cannot"} reach any exit on this grid. A* will still run and report the failure per person.</p>}</div></div>}
    {draft && <div className="plan-alert"><Info size={18} /><div>Running simulation on your custom floor plan. You can simulate, adjust doors or fire, and test escape routes freely. <Link href={`/maps/${map?.id}`} className="underline">Refine this map in the editor</Link> to adjust permanent walls.</div></div>}
    <section className="plan-card plan-pad" style={{ marginBottom: 20 }}><div className="plan-sim-header"><select aria-label="Select saved map" value={requestedId ?? ""} onChange={e => router.push(e.target.value ? `/simulator?mapId=${e.target.value}` : "/simulator")}><option value="">Practice grid</option>{maps.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select><div className="plan-form-row"><label>Heuristic <select aria-label="Heuristic" value={heuristic} onChange={e => setHeuristic(e.target.value as HeuristicType)}><option value="manhattan">Manhattan</option><option value="euclidean">Euclidean</option><option value="chebyshev">Chebyshev</option></select></label><button className="plan-btn primary" disabled={computing || loading || !doc} onClick={search}>{computing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}{computing ? "Searching…" : results ? "Re-run A*" : "Run A*"}</button><button className="plan-btn secondary" disabled={loading || !doc} onClick={resetDemo} title="Restore the starting demo grid"><RotateCcw size={16} />Reset grid</button>{!requestedId && <button className="plan-btn secondary" disabled={loading} onClick={loadSmallDemo} title="Load a short 9 x 6 demo scenario"><Route size={16} />Small demo</button>}</div></div></section>
    {loading ? <div className="h-96 rounded-xl bg-slate-200 animate-pulse" /> : doc && <div className="plan-workspace"><div className="plan-main-column">
      <section className="plan-card"><div className="editor-toolbar"><div className="plan-segmented">{(["grid", "overlay", "image"] as const).map(v => <button key={v} disabled={!map?.imageUrl && v !== "grid"} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v === "grid" ? "Grid" : v === "overlay" ? "Image + grid" : "Source"}</button>)}</div><span className="plan-mono">{doc.gridWidth} × {doc.gridHeight} cells</span></div><div className="editor-tools">{([{ id: "inspect", label: "Inspect node", Icon: MousePointer2 }, { id: "person", label: "Place person", Icon: UserRound }, { id: "exit", label: "Place exit", Icon: DoorOpen }, { id: "fire", label: "Toggle fire", Icon: Flame }, { id: "smoke", label: "Smoke zone", Icon: CloudFog }, { id: "stairs", label: "Stairs", Icon: Layers }, { id: "floor", label: "Open door", Icon: PencilRuler }, { id: "wall", label: "Wall", Icon: SlidersHorizontal }] as const).map(t => <button key={t.id} className={tool === t.id ? "selected" : ""} onClick={() => setTool(t.id)}><t.Icon size={14} />{t.label}</button>)}</div><div className="editor-canvas-wrap"><GridView grid={doc.gridData} cols={doc.gridWidth} rows={doc.gridHeight} starts={doc.starts} exits={doc.exits} fires={doc.obstacles} openSet={frame.open} closedSet={frame.closed} fMap={frame.fMap} frameVersion={frame.version} paths={paths} showFValues={values} activeCell={current?.popped ?? null} imageUrl={map?.imageUrl} crop={map?.analysis?.options.crop} view={view} onCellClick={edit} onInspect={setSelected} cellSize={30} /></div><div className="editor-footer"><div className="plan-legend"><span><i style={{ background: "#263449" }} />Wall</span><span><i style={{ background: "#64748b" }} />Window / blocked</span><span><i style={{ background: "#f3e8ff" }} />Unknown (review)</span><span><i style={{ background: "#fde68a" }} />Slow terrain</span><span><i style={{ background: "#cbd5e1" }} />Smoke (5×)</span><span><i style={{ background: "#bae6fd" }} />Stairs (2×)</span><span><i style={{ background: "#fbbf24" }} />Frontier ({frame.open.size})</span><span><i style={{ background: "#a78bfa" }} />Explored ({frame.closed.size})</span><span><i style={{ background: "#f97316" }} />Fire</span><span><i style={{ background: "#059669" }} />Final path</span></div><span className="plan-mono">{selected ? `(${selected.x}, ${selected.y})${chosenValues ? ` f=${chosenValues.f.toFixed(1)}` : ""}` : "Hover to inspect"}</span></div></section>
      <section className="plan-card plan-pad"><div className="plan-sim-controls"><button aria-label="Reset playback" title="Reset playback" disabled={!results} onClick={() => { setCursor(0); setPlaying(false); }}><RotateCcw size={16} /></button><button aria-label="Step back" title="Step back" disabled={!cursor} onClick={() => { setPlaying(false); setCursor(c => Math.max(0, c - 1)); }}><StepBack size={17} /></button><button className="play" disabled={!total} onClick={() => { if (cursor >= total) setCursor(0); setPlaying(p => !p); }}>{playing ? <Pause size={16} /> : <Play size={16} />}<span style={{ marginLeft: 6 }}>{playing ? "Pause" : "Play"}</span></button><button aria-label="Step forward" title="Step forward" disabled={!total || done} onClick={() => { setPlaying(false); setCursor(c => Math.min(total, c + 1)); }}><StepForward size={17} /></button><button aria-label="Show final route" title="Show final route" disabled={!total} onClick={() => { setCursor(total); setPlaying(false); }}><SkipForward size={17} /></button><label className="plan-small" style={{ margin: "0 0 0 auto" }}>Speed <input aria-label="Playback speed" type="range" min={1} max={60} value={speed} onChange={e => setSpeed(Number(e.target.value))} className="accent-orange-500 w-20 align-middle" /> {speed}/s</label><label className="plan-checkbox" style={{ margin: 0 }}><input type="checkbox" checked={values} onChange={e => setValues(e.target.checked)} /><span>Show f(n)</span></label></div><div className="plan-sim-progress"><input type="range" aria-label="Search step" min={0} max={total || 1} value={cursor} disabled={!total} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false); }} /><span>{cursor} / {total} expanded</span></div></section>
      <section className="plan-card plan-pad"><div className="plan-section-heading"><h3><BrainCircuit size={18} />What A* is doing</h3><span className="plan-pill neutral">{done ? run?.reached ? "Goal reached" : "No route" : computing ? "Computing" : playing ? "Exploring" : "Paused"}</span></div><p aria-live="polite" style={{ fontSize: 12, color: "var(--p-muted)", lineHeight: 1.8 }}>{narration}</p></section>
      {failures.length > 0 && <div className="plan-alert" data-testid="no-route-alert"><AlertTriangle size={18} /><div>{failures.map(f => <p key={f.person}>Person {f.person}: {f.run.status === "invalid" || f.run.status === "limit" || f.run.reason?.includes("capacity") ? f.run.reason : "No exit is reachable through the reviewed grid. A* will not remove walls or cross fire to manufacture a route."}</p>)}</div></div>}
      <HeuristicComparisonCard
        startsCount={doc.starts.length}
        activePerson={active}
        compareAll={compareAll}
        onCompareAllChange={v => { setCompareAll(v); setComparison([]); }}
        comparing={comparing}
        hasResults={Boolean(results)}
        onCompare={compare}
        comparison={comparison}
      />
    </div><aside className="plan-side-column">
      <SimulatorStatsPanel
        run={run}
        results={results}
        done={done}
        cursor={cursor}
        total={total}
        openSize={frame.open.size}
        closedSize={frame.closed.size}
        startsCount={doc.starts.length}
        gridData={doc.gridData}
        scaleMeters={scaleMeters}
        onScaleMetersChange={setScaleMeters}
        walkingSpeed={walkingSpeed}
        onWalkingSpeedChange={setWalkingSpeed}
        onExportJson={exportJson}
        onExportPng={exportPng}
      />
      <section className="plan-card plan-pad" data-testid="current-node">
        <div className="plan-section-heading"><h3>Current node</h3><span className="plan-pill neutral">{shownHeuristic}</span></div>
        {node ? <div className="plan-sim-stats">
          <div><span>Node</span><strong>({node.point.x}, {node.point.y})</strong></div>
          <div><span>g(n)</span><strong>{node.g.toFixed(2)}</strong></div>
          <div><span>h(n)</span><strong>{node.h.toFixed(2)}</strong></div>
          <div><span>f(n) = g + h</span><strong>{node.f.toFixed(2)}</strong></div>
        </div> : <p className="plan-small">Press Run A* and step through the search to see the selected node and its g, h and f values.</p>}
        <div className="plan-theory-code">{heuristicFormula(shownHeuristic)}{diagonal && shownHeuristic === "manhattan" && <><br />h is scaled by 1 / √2</>}</div>
        <p className="plan-small">A* pops the node with the smallest f. Ties use lower h, then insertion order.</p>
      </section>
      <PeopleAssignmentCard
        results={results}
        active={active}
        onSelectPerson={i => { setActive(i); setCursor(0); setPlaying(false); setComparison([]); }}
        congestionPenalty={congestionPenalty}
        onCongestionPenaltyChange={setCongestionPenalty}
        exitCapacity={exitCapacity}
        onExitCapacityChange={setExitCapacity}
        fireBufferPenalty={fireBufferPenalty}
        onFireBufferPenaltyChange={setFireBufferPenalty}
      />
      <section className="plan-card plan-pad"><h3>Search model</h3><label className="plan-checkbox"><input type="checkbox" checked={diagonal} onChange={e => setDiagonal(e.target.checked)} /><span>Allow diagonals (cost √2; no corner cutting)</span></label><label className="plan-checkbox"><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} /><span>Re-plan after fire or grid edits</span></label><div className="plan-theory-code">f(n) = g(n) + h(n)<br />{heuristicFormula(heuristic)}{diagonal && heuristic === "manhattan" && <><br />h is scaled by 1 / √2</>}</div><p className="plan-small">{heuristicDescription(heuristic)} For multiple exits, use the minimum estimate to any exit.</p><button className="plan-btn primary full" onClick={saveRun} disabled={!results || saving || saved}>{saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}{saved ? "Run saved to history" : saving ? "Saving result…" : "Save this run"}</button><Link className="plan-text-btn mt-3" href="/runs">View run history</Link></section>
      <section className="plan-card plan-pad"><h3>Why A* finds the optimal route</h3><p className="plan-small">g(n) is the actual cost from the person. h(n) is a lower bound to the nearest goal. A* expands the smallest f(n), then reconstructs the parent chain when it reaches an exit.</p><p className="plan-small">Walls, fire, unknown cells and windows have infinite cost. With these non-negative movement costs and an admissible heuristic, the returned route is optimal for this grid—not necessarily for the real building.</p><Link className="plan-text-btn" href="/theory">Explore the algorithm theory</Link></section>
    </aside></div>}
    <footer className="plan-safety-note"><ShieldCheck size={17} /><p>Educational planning model only. Image extraction and user edits must be checked against the real building. In an emergency, follow posted exits, staff instructions and local emergency guidance.</p></footer>
  </div></DashboardLayout>;
}
