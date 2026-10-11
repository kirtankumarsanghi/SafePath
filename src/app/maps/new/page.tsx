"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, UploadCloud, ScanText, Grid3X3, DoorOpen, Route, Check, CheckCircle2, AlertTriangle, Loader2, FileImage, X, SlidersHorizontal, ShieldCheck, Save, RotateCcw, Info, ChevronDown, UserRound, Eye, PencilRuler } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import GridView, { type GridMarker } from "@/components/GridView";
import FloorPlanEditor from "@/components/FloorPlanEditor";
import { uploadForAnalysis, reconvertImage } from "@/lib/imageToGrid";
import { candidatePosition, countRegions, resolutionFor, DEFAULT_CONVERSION, FULL_BOUNDS, type AnalysisReport, type ConversionOptions, type PlanCandidate, type SavedAnalysis } from "@/lib/map-analysis";
import { inspectDocument, requestHeaders, type GridDocument } from "@/lib/map-model";
import { computeEvacuation } from "@/lib/compute-client";
import { samePoint, colorForIndex, type AStarRunResult } from "@/lib/astar";
const NO_CELLS = new Set<string>();
const STAGES = [{ title: "Upload & analyze", detail: "Read the source image", Icon: ScanText }, { title: "Review conversion", detail: "Check walls and markers", Icon: Grid3X3 }, { title: "Refine, validate & save", detail: "Run on your reviewed grid", Icon: Route }];
const messageOf = (e: unknown) => e instanceof Error ? e.message : "Something went wrong. Please try again.";
export default function NewMapPage() {
  const router = useRouter();
  const [stage, setStage] = useState(0), [report, setReport] = useState<AnalysisReport | null>(null), [doc, setDoc] = useState<GridDocument | null>(null);
  const [options, setOptions] = useState<ConversionOptions>(DEFAULT_CONVERSION), [applied, setApplied] = useState<ConversionOptions>(DEFAULT_CONVERSION);
  const [busy, setBusy] = useState<"analyze" | "convert" | "save" | null>(null), [error, setError] = useState(""), [drag, setDrag] = useState(false);
  const [view, setView] = useState<"image" | "overlay" | "grid">("overlay"), [selected, setSelected] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, "accepted" | "dismissed">>({});
  const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [reviewed, setReviewed] = useState(false), [edited, setEdited] = useState(false);
  const [evaluation, setEvaluation] = useState<AStarRunResult[] | null>(null), [evaluating, setEvaluating] = useState(false);
  const [fileName, setFileName] = useState(""), [elapsed, setElapsed] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null), controller = useRef<AbortController | null>(null), evaluationController = useRef<AbortController | null>(null), lastFile = useRef<File | null>(null);
  useEffect(() => () => { controller.current?.abort(); evaluationController.current?.abort(); }, []);
  useEffect(() => {
    if (busy !== "analyze") return;
    setElapsed(0); const timer = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const settingsDirty = JSON.stringify(options) !== JSON.stringify(applied);
  const inspection = useMemo(() => doc ? inspectDocument(doc) : null, [doc]);
  const regions = useMemo(() => doc ? countRegions(doc.gridData, doc.gridWidth, doc.gridHeight).count : 0, [doc]);
  const markers = useMemo<GridMarker[]>(() => !report || !doc ? [] : report.candidates.flatMap(c => {
    const point = candidatePosition(c, applied, doc.gridData);
    return point && !decisions[c.id] ? [{ id: c.id, point, kind: c.kind, label: c.label, selected: selected === c.id }] : [];
  }), [report, doc, applied, decisions, selected]);
  const paths = useMemo(() => (evaluation ?? []).map((r, i) => ({ points: r.path, color: colorForIndex(i).stroke, label: `Person ${i + 1}`, progress: 1 })), [evaluation]);
  const allRouted = !!evaluation?.length && evaluation.every(r => r.reached);
  const ready = allRouted && reviewed && !inspection?.errors.length && !settingsDirty;
  const changeDocument = (next: GridDocument) => {
    evaluationController.current?.abort(); setEvaluating(false); setEvaluation(null); setReviewed(false); setEdited(true); setDoc(next); setError("");
  };
  async function analyze(file: File, ocr = true) {
    controller.current?.abort(); evaluationController.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    lastFile.current = file; setFileName(file.name); setBusy("analyze"); setError(""); setStage(0); setReport(null); setDoc(null); setEvaluation(null); setDecisions({}); setReviewed(false); setEdited(false);
    const timeout = setTimeout(() => abort.abort("timeout"), 75000);
    try {
      const result = await uploadForAnalysis(file, abort.signal, ocr);
      if (abort.signal.aborted) return;
      setReport(result); setOptions(result.options); setApplied(result.options); setDecisions({});
      setDoc({ gridWidth: result.conversion.cols, gridHeight: result.conversion.rows, gridData: result.conversion.grid, starts: [], exits: [], obstacles: [] });
      setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 255)); setDescription(""); setStage(1); setView("overlay");
    } catch (e) {
      if (controller.current === abort) setError(abort.signal.aborted ? (abort.signal.reason === "timeout" ? "Analysis took too long. Retry a smaller image or analyze without OCR." : "Analysis cancelled. Choose a file to try again.") : messageOf(e));
    } finally { clearTimeout(timeout); if (controller.current === abort) setBusy(null); }
  }
  async function sample() {
    setError("");
    try { const r = await fetch("/samples/campus-plan.png"); if (!r.ok) throw new Error("The sample could not be loaded."); await analyze(new File([await r.blob()], "Campus teaching floor.png", { type: "image/png" })); }
    catch (e) { setError(messageOf(e)); }
  }
  async function applySettings() {
    if (!report || !doc || busy) return;
    if (edited && !window.confirm("Re-converting replaces your manual edits and confirmed markers. Continue?")) return;
    setBusy("convert"); setError("");
    try {
      await new Promise(r => setTimeout(r, 20));
      const result = await reconvertImage(report.imageUrl, options, report.labels);
      setReport({ ...report, conversion: result }); setApplied({ ...options });
      setDoc({ gridWidth: result.cols, gridHeight: result.rows, gridData: result.grid, starts: [], exits: [], obstacles: [] });
      setDecisions({}); setEvaluation(null); setReviewed(false); setEdited(false);
    } catch (e) { setError(messageOf(e)); } finally { setBusy(null); }
  }
  function decide(candidate: PlanCandidate, accept: boolean) {
    if (!doc) return;
    const p = candidatePosition(candidate, applied, doc.gridData);
    if (accept && !p) { setError("No walkable cell was found near this marker. Use the grid tools to mark the correct doorway manually."); return; }
    let next = { ...doc };
    const field = candidate.kind === "exit" ? "exits" : candidate.kind === "start" ? "starts" : "obstacles";
    if (p && candidate.kind !== "stairs") {
      if (accept && !doc[field].some(q => samePoint(q, p))) {
        if (field === "starts" && doc.starts.length >= 12 || field === "exits" && doc.exits.length >= 32) { setError("This grid has reached the supported number of people or exits."); return; }
        next = { ...next, [field]: [...doc[field], p] };
      } else if (!accept && decisions[candidate.id] === "accepted") next = { ...next, [field]: doc[field].filter(q => !samePoint(q, p)) };
    }
    setDecisions(d => ({ ...d, [candidate.id]: accept ? "accepted" : "dismissed" })); changeDocument(next);
  }
  async function validateRoutes() {
    if (!doc || evaluating) return;
    const check = inspectDocument(doc); if (check.errors.length) { setError(check.errors.join(" ")); return; }
    setError(""); setEvaluating(true); evaluationController.current?.abort();
    const abort = new AbortController(); evaluationController.current = abort;
    try { const result = await computeEvacuation(doc, "manhattan", { trace: false }, abort.signal); if (!abort.signal.aborted) setEvaluation(result); }
    catch (e) { if (!abort.signal.aborted) setError(messageOf(e)); }
    finally { if (!abort.signal.aborted) setEvaluating(false); }
  }
  async function save(run: boolean) {
    if (!doc || busy) return;
    if (!title.trim()) { setError("Give this map a name before saving."); return; }
    if (settingsDirty) { setError("Apply or discard the pending conversion settings before saving."); return; }
    if (run && !ready) { setError("Validate the routes and confirm the source review before saving and running A*."); return; }
    setBusy("save"); setError("");
    const analysis: SavedAnalysis | null = report ? { version: 2, width: report.width, height: report.height, fileName: report.fileName, labels: report.labels, candidates: report.candidates, options: applied, ocrStatus: report.ocrStatus, reviewed, reviewedAt: reviewed ? new Date().toISOString() : null, decisions } : null;
    try {
      const response = await fetch("/api/maps", { method: "POST", headers: requestHeaders(), body: JSON.stringify({ ...doc, title: title.trim(), description, imageUrl: report?.imageUrl ?? null, analysis, runAStar: run }) });
      const data = await response.json(); if (!response.ok || !data.map?.id) throw new Error(data.error || "The server could not save your map.");
      router.push(run ? `/simulator?mapId=${data.map.id}&autoplay=1&saved=1` : `/maps/${data.map.id}?saved=1`);
    } catch (e) { setError(messageOf(e)); setBusy(null); }
  }
  function blank() {
    const cols = 32, rows = 24, grid: GridDocument["gridData"] = {};
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) grid[`${x},${y}`] = x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? "wall" : "empty";
    setReport(null); setOptions({ ...DEFAULT_CONVERSION, cols, rows }); setApplied({ ...DEFAULT_CONVERSION, cols, rows }); setDoc({ gridWidth: cols, gridHeight: rows, gridData: grid, starts: [], exits: [], obstacles: [] }); setTitle("Untitled floor plan"); setStage(2); setDecisions({}); setReviewed(false); setEvaluation(null); setError("");
  }
  const changeResolution = (value: number) => { if (report) setOptions(o => ({ ...o, ...resolutionFor(report.width, report.height, value, o.crop) })); };
  const candidatePanel = <section className="plan-card plan-pad candidate-panel">
    <div className="plan-section-heading"><h3><DoorOpen size={17} />Review detected markers</h3><span className="plan-count">{report?.candidates.length ?? 0}</span></div>
    <p className="plan-small">Suggestions, not confirmed exits. Check each marker against the source and place it at the actual doorway.</p>
    {!report?.candidates.length ? <div className="plan-empty-small"><ScanText size={23} /><strong>No exit markers identified</strong><p>No exits were invented. Select the Exit tool and click the real exit doorway on the map.</p></div> : <div className="candidate-list">{report.candidates.map(c => {
      const p = doc ? candidatePosition(c, applied, doc.gridData) : null, decision = decisions[c.id];
      return <article key={c.id} className={`candidate-row ${selected === c.id ? "focused" : ""} ${decision ?? ""}`}>
        <button className="candidate-title" onClick={() => setSelected(c.id)}><span className={`marker-dot ${c.kind}`} /><span>{c.label}</span>{decision === "accepted" ? <CheckCircle2 size={15} /> : <Eye size={15} />}</button>
        <span className="candidate-evidence">{c.source === "text" ? "Text evidence" : "Color only"}{p ? ` · proposed cell (${p.x}, ${p.y})` : " · outside crop / blocked"}</span>
        <details><summary>Why was this detected?</summary><p>{c.evidence}</p></details>
        {decision ? <div className="candidate-actions"><span>{decision === "accepted" ? "Confirmed by you" : "Dismissed"}</span><button onClick={() => { if (decision === "accepted") decide(c, false); else setDecisions(d => { const n = { ...d }; delete n[c.id]; return n; }); }}>{decision === "accepted" ? "Remove" : "Review again"}</button></div>
        : <div className="candidate-actions">{c.kind !== "stairs" && <button disabled={!p || stage === 1} onClick={() => decide(c, true)} className="accept">{c.kind === "exit" ? "Confirm exit" : c.kind === "start" ? "Confirm position" : "Mark as blocked"}</button>}<button disabled={stage === 1} onClick={() => decide(c, false)}>Dismiss</button></div>}
      </article>;
    })}</div>}
    {stage === 1 && <p className="plan-small plan-emphasis">Continue to refinement to confirm or reposition markers.</p>}
  </section>;
  return <DashboardLayout><div className="planner">
    <div className="plan-breadcrumb"><Link href="/maps">My saved maps</Link><span>/</span><span>New floor plan</span></div>
    <header className="plan-page-heading"><div><div className="plan-eyebrow">FLOOR PLAN WORKSPACE</div><h1>From floor plan to escape route.</h1><p>Analyze your image, review the grid, and see A* find a route through your building model.</p></div><span className="plan-status"><ShieldCheck size={15} />Human-reviewed planning</span></header>
    <nav className="plan-stepper" aria-label="Upload steps">{STAGES.map((s, i) => <button key={s.title} onClick={() => { if (i === 0 && !busy) { setStage(0); return; } if (doc && !busy && (i !== 1 || report)) setStage(i); }} disabled={busy !== null || i > 0 && !doc || i === 1 && !report} className={`${stage === i ? "active" : ""} ${stage > i ? "done" : ""}`} aria-current={stage === i ? "step" : undefined}><span className="step-number">{stage > i ? <Check size={17} /> : `0${i + 1}`}</span><span><strong>{s.title}</strong><small>{s.detail}</small></span>{i < 2 && <ArrowRight size={16} className="step-arrow" />}</button>)}</nav>
    {error && <div className="plan-alert error" role="alert"><AlertTriangle size={18} /><div>{error}</div><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
    <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/tiff,image/avif" aria-label="Upload floor plan image" className="sr-only" onChange={e => { const file = e.target.files?.[0]; e.currentTarget.value = ""; if (file) void analyze(file); }} />
    {stage === 0 && <div className="plan-upload-layout"><section className="plan-card upload-card">
      <div className="plan-section-heading"><h2>Upload your floor plan</h2><span className="plan-muted">Step 01 of 03</span></div>
      {busy === "analyze" ? <div className="plan-analysis-loading" role="status"><div className="analysis-scan"><ScanText size={48} /><span /></div><h2>Reading your floor plan</h2><p>{fileName}</p><div className="analysis-loading-line" /><p className="plan-small">Normalizing the image, reading labels with OCR, and measuring walls.<br />Large plans can take up to a minute. {elapsed}s elapsed.</p><button className="plan-btn secondary" onClick={() => controller.current?.abort()}>Cancel analysis</button></div> : <div className={`plan-dropzone ${drag ? "dragging" : ""}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); const file = e.dataTransfer.files[0]; if (file) void analyze(file); }}>
        <div className="upload-glyph"><UploadCloud size={32} strokeWidth={1.5} /></div><h2>Drop a floor plan here</h2><p>or choose an image from your device</p><span className="plan-btn primary">Choose image <ArrowRight size={16} /></span><div className="plan-formats"><span>PNG</span><span>JPG</span><span>WEBP</span><span>GIF / TIFF / AVIF</span></div><small>Up to 12 MB · A clear, straight-on plan works best</small>
      </div>}
      {!busy && <div className="upload-secondary"><button onClick={blank}><PencilRuler size={16} />Draw a grid from scratch</button>{doc && <button onClick={() => setStage(report ? 1 : 2)}>Return to current map <ArrowRight size={15} /></button>}</div>}
      {error && lastFile.current && !busy && <div className="upload-retry"><button className="plan-btn secondary" onClick={() => lastFile.current && analyze(lastFile.current)}>Retry analysis</button><button className="plan-btn secondary" onClick={() => lastFile.current && analyze(lastFile.current, false)}>Analyze without OCR</button></div>}
    </section><aside className="plan-upload-aside"><section className="plan-card plan-pad"><div className="plan-section-heading"><h3>What happens next</h3></div><div className="plan-how"><ScanText size={20} /><div><strong>Read the image</strong><p>Local OCR locates labels. Color analysis flags safety symbols for review.</p></div></div><div className="plan-how"><Grid3X3 size={20} /><div><strong>Build a navigable grid</strong><p>High-resolution line and pixel analysis preserves walls and separate rooms.</p></div></div><div className="plan-how"><Route size={20} /><div><strong>Refine and run A*</strong><p>Confirm real exits, place people, correct doors and validate the routes.</p></div></div></section><button className="plan-sample" disabled={!!busy} onClick={sample}><div className="sample-picture">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/samples/campus-plan.png" alt="Sample campus floor plan with two exits" /></div><div><span>NO IMAGE HANDY?</span><strong>Try a sample floor plan <ArrowRight size={16} /></strong><small>Uses the same upload and analysis pipeline</small></div></button></aside></div>}
    {stage > 0 && doc && <>
      <div className="plan-file-strip"><span className="file-glyph"><FileImage size={21} /></span><div><strong>{report?.fileName ?? "Custom drawn floor plan"}</strong><span>{report ? `${report.width} × ${report.height} pixels · ${report.ocrStatus === "complete" ? "OCR complete" : "Manual text review needed"}` : "Manual grid editor"}</span></div><span className="plan-pill neutral">Source preserved</span><button disabled={!!busy} onClick={() => inputRef.current?.click()} className="plan-text-btn">Replace image</button></div>
      <div className="plan-stat-strip"><div><Grid3X3 size={18} /><strong>{doc.gridWidth} × {doc.gridHeight}</strong><span>Grid dimensions</span></div><div><SquareIcon /><strong>{inspection?.walls ?? 0}</strong><span>Blocked cells</span></div><div><ScanText size={18} /><strong>{report?.labels.length ?? 0}</strong><span>Labels read</span></div><div><DoorOpen size={18} /><strong>{doc.exits.length}<small> / {report?.candidates.filter(c => c.kind === "exit").length ?? 0}</small></strong><span>Confirmed / suggested exits</span></div><div><UserRound size={18} /><strong>{doc.starts.length}</strong><span>People placed</span></div></div>
      <div className="plan-workspace"><div className="plan-main-column">
        {stage === 1 ? <section className="plan-card"><div className="editor-toolbar"><div><h3>Compare the conversion</h3><p className="plan-small">Walls are dark. Amber markers are unconfirmed suggestions.</p></div><div className="plan-segmented">{(["image", "overlay", "grid"] as const).map(v => <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v === "image" ? "Source" : v === "overlay" ? "Overlay" : "Grid"}</button>)}</div></div><div className="editor-canvas-wrap"><GridView grid={doc.gridData} cols={doc.gridWidth} rows={doc.gridHeight} starts={[]} exits={[]} fires={[]} openSet={NO_CELLS} closedSet={NO_CELLS} fMap={{}} paths={[]} showFValues={false} activeCell={null} interactive={false} imageUrl={report?.imageUrl} crop={applied.crop} view={view} markers={markers} fit cellSize={30} /></div><div className="editor-footer"><span>{regions} walkable region{regions !== 1 ? "s" : ""} preserved. No rooms were discarded.</span><span className="plan-mono">{doc.gridWidth * doc.gridHeight} cells</span></div></section>
        : <FloorPlanEditor document={doc} onChange={changeDocument} imageUrl={report?.imageUrl} crop={applied.crop} markers={markers} paths={paths} />}
        {stage === 1 && report && <section className="plan-card plan-pad"><div className="plan-section-heading"><h3><Info size={17} />Analysis notes</h3><span className="plan-pill amber">Review required</span></div><ul className="plan-note-list">{[...report.warnings, ...report.conversion.warnings].map((warning, i) => <li key={i}>{warning}</li>)}</ul><details className="plan-label-details"><summary>Read detected text ({report.labels.length} labels)<ChevronDown size={15} /></summary><p className="plan-small">{report.ocrMessage}</p><div className="plan-label-list">{report.labels.map((l, i) => <span key={i}><strong>{l.text}</strong><small>{l.kind} · OCR {Math.round(l.confidence)}%</small></span>)}</div></details></section>}
        {stage === 2 && <section className="plan-card plan-pad"><div className="plan-section-heading"><h3><Route size={18} />Route validation</h3><button className="plan-btn secondary small" disabled={evaluating || !doc.starts.length || !doc.exits.length} onClick={validateRoutes}>{evaluating ? <Loader2 className="animate-spin" size={15} /> : <Route size={15} />}{evaluating ? "Testing routes…" : "Validate routes"}</button></div><p className="plan-small">A* searches all confirmed exits for each person. Four-way movement costs 1 per cell; walls, excluded areas and fires cannot be crossed.</p>
          {inspection?.errors.length ? <ul className="plan-note-list">{inspection.errors.map(e => <li key={e}>{e}</li>)}</ul> : !evaluation ? <div className="plan-validation-empty"><span className="plan-pill neutral">Ready to test</span><p>Validate routes after editing. Changes invalidate old results, so no stale paths can be saved.</p></div> : <div className="plan-route-results">{evaluation.map((r, i) => <div key={i} className={r.reached ? "success" : "failed"}>{r.reached ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<div><strong>Person {i + 1}: {r.reached ? "route found" : "no route"}</strong><p>{r.reached ? `(${r.start.x}, ${r.start.y}) to exit (${r.exit.x}, ${r.exit.y}) · ${r.stats.totalCost.toFixed(0)} grid steps · ${r.stats.nodesExplored} nodes explored` : r.reason}</p></div></div>)}</div>}
          {evaluation && !allRouted && <p className="plan-small plan-emphasis">Check narrow doors, disconnected rooms, outside margins and the actual exit location. A* will not invent a passage through a wall.</p>}
        </section>}
      </div><aside className="plan-side-column">
        {stage === 1 && report && <section className="plan-card plan-pad plan-settings"><div className="plan-section-heading"><h3><SlidersHorizontal size={17} />Conversion settings</h3></div><label>Grid detail <span>{options.cols} × {options.rows}</span><input type="range" aria-label="Grid detail" min={24} max={96} step={8} value={Math.max(options.cols, options.rows)} onChange={e => changeResolution(Number(e.target.value))} /></label><p className="plan-small">Aspect ratio is preserved. Use more cells for narrow corridors and doorways.</p><label>Darkness threshold <span>{options.wallThreshold}</span><input aria-label="Darkness threshold" type="range" min={40} max={230} value={options.wallThreshold} onChange={e => setOptions(o => ({ ...o, wallThreshold: Number(e.target.value) }))} /></label><label>Minimum wall coverage <span>{Math.round(options.wallCoverage * 100)}%</span><input aria-label="Minimum wall coverage" type="range" min={.06} max={.5} step={.01} value={options.wallCoverage} onChange={e => setOptions(o => ({ ...o, wallCoverage: Number(e.target.value) }))} /></label><p className="plan-small">Lower coverage is more conservative. Long wall lines are preserved even when thin.</p>
          {[{ key: "invert" as const, title: "Dark blueprint / invert" }, { key: "ignoreText" as const, title: "Separate OCR text from walls" }, { key: "denoise" as const, title: "Remove isolated pixel noise" }].map(o => <label key={o.key} className="plan-checkbox"><input type="checkbox" checked={options[o.key]} onChange={e => setOptions(p => ({ ...p, [o.key]: e.target.checked }))} /><span>{o.title}</span></label>)}
          <details className="plan-crop"><summary>Crop legend and outer margins <ChevronDown size={14} /></summary><p className="plan-small">Percentage trimmed from each edge. Exterior space is not automatically distinguished from interior floors.</p><div>{(["left", "top", "right", "bottom"] as const).map(edge => <label key={edge}>{edge}<input type="number" aria-label={`Crop ${edge} percent`} min={0} max={45} value={Math.round((edge === "right" || edge === "bottom" ? 1 - options.crop[edge] : options.crop[edge]) * 100)} onChange={e => { const n = Math.max(0, Math.min(.45, Number(e.target.value) / 100)); setOptions(o => { const crop = { ...o.crop, [edge]: edge === "right" || edge === "bottom" ? 1 - n : n }; return { ...o, crop, ...resolutionFor(report.width, report.height, Math.max(o.cols, o.rows), crop) }; }); }} /></label>)}</div></details>
          <button className="plan-btn secondary full" disabled={!settingsDirty || !!busy} onClick={applySettings}>{busy === "convert" ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}Apply conversion settings</button>{settingsDirty && <p className="plan-small plan-emphasis">Unapplied changes. The preview still shows the previous conversion.</p>}
        </section>}
        {candidatePanel}
        {stage === 2 && <section className="plan-card plan-pad plan-save-panel"><h3>Name & save your map</h3><label htmlFor="map-title">Map name</label><input id="map-title" value={title} maxLength={255} onChange={e => setTitle(e.target.value)} placeholder="Science building, ground floor" /><label htmlFor="map-description">Description <span>(optional)</span></label><textarea id="map-description" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Building, level and important notes" /><label className="plan-checkbox review-checkbox"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>I checked the walls, doorways, exterior areas and actual exit positions against the source plan.</span></label><div className="plan-save-checks"><span className={allRouted ? "done" : ""}><Check size={14} />Routes validated on this grid</span><span className={reviewed ? "done" : ""}><Check size={14} />Source review confirmed</span></div><button className="plan-btn primary full" disabled={!ready || !!busy} onClick={() => save(true)}>{busy === "save" ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />}Save & run A*</button><button className="plan-btn secondary full" disabled={!!busy} onClick={() => save(false)}>Save draft</button><p className="plan-small">Your source image, conversion settings, edits and computed result are saved together. Drafts can be refined later.</p></section>}
      </aside></div>
      <div className="plan-bottom-bar"><button className="plan-btn secondary" onClick={() => setStage(stage - 1)} disabled={!!busy}><ArrowLeft size={16} />{stage === 1 ? "Upload" : "Review conversion"}</button>{stage === 1 ? <button className="plan-btn primary" disabled={!!busy || settingsDirty} onClick={() => setStage(2)}>Refine grid & confirm exits <ArrowRight size={17} /></button> : <span className="plan-small">{doc.starts.length} people · {doc.exits.length} confirmed exits · {doc.obstacles.length} simulated fire cells</span>}</div>
    </>}
    <footer className="plan-safety-note"><ShieldCheck size={17} /><p><strong>For learning and planning, not emergency navigation.</strong> Image analysis cannot verify real building conditions or certify an evacuation route. In an emergency, follow posted signs, staff instructions and local emergency guidance.</p></footer>
  </div></DashboardLayout>;
}
function SquareIcon() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 4h16v16H4zM4 12h16M12 4v8M8 12v8M16 12v8" /></svg>; }
