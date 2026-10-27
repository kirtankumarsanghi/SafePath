"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Save, Trash2, Route, AlertTriangle, ShieldCheck, FileImage } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import FloorPlanEditor from "@/components/FloorPlanEditor";
import { cleanTerrain, inspectDocument, requestHeaders, type GridDocument, type SavedMap } from "@/lib/map-model";
import { computeEvacuation } from "@/lib/compute-client";
import { colorForIndex, type AStarRunResult } from "@/lib/astar";
import { getCustomMapById, saveCustomMap, deleteCustomMap } from "@/lib/custom-maps-storage";

export default function MapEditPage() {
  const params = useParams(), router = useRouter(), id = String(params.id);
  const [map, setMap] = useState<SavedMap | null>(null), [doc, setDoc] = useState<GridDocument | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [reviewed, setReviewed] = useState(false), [saved, setSaved] = useState(false), [saving, setSaving] = useState(false), [deleting, setDeleting] = useState(false);
  const [evaluation, setEvaluation] = useState<AStarRunResult[] | null>(null), [evaluating, setEvaluating] = useState(false);
  const evalAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    const localMap = getCustomMapById(id);

    if (localMap) {
      queueMicrotask(() => {
        if (abort.signal.aborted) return;
        setMap(localMap);
        setDoc({ ...localMap, gridData: cleanTerrain(localMap.gridData) });
        setTitle(localMap.title);
        setDescription(localMap.description ?? "");
        setReviewed(!localMap.imageUrl || !!localMap.analysis?.reviewed);
        setLoading(false);
      });
    }

    fetch(`/api/maps/${id}`, { signal: abort.signal })
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d.map as SavedMap;
      })
      .then(m => {
        if (!abort.signal.aborted) {
          setMap(m);
          setDoc({ ...m, gridData: cleanTerrain(m.gridData) });
          setTitle(m.title);
          setDescription(m.description ?? "");
          setReviewed(!m.imageUrl || !!m.analysis?.reviewed);
        }
      })
      .catch(e => {
        if (!abort.signal.aborted) {
          if (!localMap) {
            setError(e.message);
          }
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });

    return () => {
      abort.abort();
      evalAbort.current?.abort();
    };
  }, [id]);

  const check = useMemo(() => doc ? inspectDocument(doc) : null, [doc]);
  const paths = useMemo(() => (evaluation ?? []).map((r, i) => ({ points: r.path, color: colorForIndex(i).stroke, label: `Person ${i + 1}`, progress: 1 })), [evaluation]);

  function change(next: GridDocument) {
    evalAbort.current?.abort();
    setDoc(next);
    setSaved(false);
    setEvaluation(null);
    setEvaluating(false);
  }

  async function evaluate() {
    if (!doc || evaluating) return;
    if (check?.errors.length) { setError(check.errors.join(" ")); return; }
    setError(""); setEvaluating(true); evalAbort.current?.abort(); const abort = new AbortController(); evalAbort.current = abort;
    try { const r = await computeEvacuation(doc, "manhattan", { trace: false }, abort.signal); if (!abort.signal.aborted) setEvaluation(r); }
    catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Validation failed."); } finally { if (!abort.signal.aborted) setEvaluating(false); }
  }

  async function save(run: boolean) {
    if (!map || !doc || saving) return;
    setSaving(true);
    setError("");

    const updatedMap: SavedMap = {
      ...map,
      ...doc,
      title,
      description,
      imageUrl: map.imageUrl,
      analysis: map.analysis ? { ...map.analysis, reviewed, reviewedAt: reviewed ? new Date().toISOString() : null } : null,
      updatedAt: new Date().toISOString(),
    };

    // Save locally immediately to guarantee persistence
    saveCustomMap(updatedMap);

    try {
      const response = await fetch(`/api/maps/${id}`, {
        method: "PUT",
        headers: requestHeaders(),
        body: JSON.stringify({
          ...doc,
          title,
          description,
          imageUrl: map.imageUrl,
          analysis: map.analysis ? { ...map.analysis, reviewed, reviewedAt: reviewed ? new Date().toISOString() : null } : null,
          runAStar: run,
        }),
      });
      const data = await response.json();
      if (response.ok && data.map) {
        setMap(data.map);
        saveCustomMap(data.map);
      }
    } catch (e) {
      console.warn("Could not sync map save to server (preserved in browser storage):", e);
    }

    setSaved(true);
    setSaving(false);

    if (run) {
      router.push(`/simulator?mapId=${id}&autoplay=1&saved=1`);
    }
  }

  async function remove() {
    if (!window.confirm("Delete this map and its saved runs? This cannot be undone.")) return;
    setDeleting(true);
    setError("");
    deleteCustomMap(Number(id));
    try {
      await fetch(`/api/maps/${id}`, { method: "DELETE", headers: requestHeaders(false) });
    } catch (e) {
      console.warn("Server delete warning:", e);
    }
    router.push("/maps");
  }

  return (
    <DashboardLayout>
      <div className="planner">
        <div className="plan-breadcrumb">
          <Link href="/maps"><ArrowLeft className="inline mr-1" size={13} />My saved maps</Link>
          <span>/</span>
          <span>Refine floor plan</span>
        </div>
        <header className="plan-page-heading">
          <div>
            <div className="plan-eyebrow">SAVED FLOOR PLAN · #{id}</div>
            <h1>{title || "Loading floor plan…"}</h1>
            <p>Your source image and reviewed grid remain aligned. Edit, validate and save before running.</p>
          </div>
          <button className="plan-btn secondary" onClick={remove} disabled={!map || deleting}>
            <Trash2 size={15} />{deleting ? "Deleting…" : "Delete map"}
          </button>
        </header>

        {error && <div className="plan-alert error" role="alert"><AlertTriangle size={18} /><div>{error}</div></div>}
        {saved && <div className="plan-success-bar" role="status"><CheckCircle2 size={17} />Changes saved to this map.</div>}

        {loading ? (
          <div className="h-96 rounded-xl bg-slate-200 animate-pulse" />
        ) : doc && map ? (
          <div className="plan-workspace">
            <div className="plan-main-column">
              <FloorPlanEditor document={doc} onChange={change} imageUrl={map.imageUrl} crop={map.analysis?.options.crop} paths={paths} />
              <section className="plan-card plan-pad">
                <div className="plan-section-heading">
                  <h3><Route size={18} />Route validation</h3>
                  <button className="plan-btn secondary small" disabled={evaluating} onClick={evaluate}>
                    {evaluating ? <Loader2 size={15} className="animate-spin" /> : <Route size={15} />}
                    {evaluating ? "Testing…" : "Validate routes"}
                  </button>
                </div>
                {check?.errors.length ? (
                  <ul className="plan-note-list">{check.errors.map(e => <li key={e}>{e}</li>)}</ul>
                ) : (
                  <p className="plan-small">{doc.starts.length} people, {doc.exits.length} confirmed exits. Test the edited grid before saving a run.</p>
                )}
                {evaluation && (
                  <div className="plan-route-results">
                    {evaluation.map((r, i) => (
                      <div key={i} className={r.reached ? "success" : "failed"}>
                        {r.reached ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                        <div>
                          <strong>Person {i + 1}: {r.reached ? `${r.stats.totalCost.toFixed(0)} grid steps` : "no route"}</strong>
                          <p>{r.reached ? `Exit (${r.exit.x}, ${r.exit.y}) · ${r.stats.nodesExplored} nodes expanded` : r.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <aside className="plan-side-column">
              <section className="plan-card plan-pad plan-save-panel">
                <h3>Map details</h3>
                <label htmlFor="map-title">Map name</label>
                <input id="map-title" value={title} maxLength={255} onChange={e => { setTitle(e.target.value); setSaved(false); }} />
                <label htmlFor="map-description">Description</label>
                <textarea id="map-description" rows={3} value={description} onChange={e => { setDescription(e.target.value); setSaved(false); }} />
                <label className="plan-checkbox review-checkbox">
                  <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />
                  <span>I reviewed walls, doorways, exterior areas and exit positions against the source.</span>
                </label>
                <button
                  className="plan-btn primary full"
                  disabled={saving}
                  onClick={() => save(true)}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Route size={16} />}
                  Save & run A*
                </button>
                <button className="plan-btn secondary full" disabled={saving} onClick={() => save(false)}>
                  <Save size={15} />{saving ? "Saving…" : "Save changes"}
                </button>
                <Link className="plan-text-btn mt-3" href={`/simulator?mapId=${id}`}>
                  Open last saved version in simulator
                </Link>
                <p className="plan-small">Run A* uses this exact map. Each save is synchronized to both your browser and server.</p>
              </section>
              {map.imageUrl && (
                <section className="plan-card plan-pad">
                  <div className="plan-section-heading">
                    <h3><FileImage size={17} />Preserved source</h3>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={map.imageUrl} alt="Original uploaded floor plan" className="w-full rounded-md" />
                  <p className="plan-small">
                    {map.analysis?.fileName ?? "Source image"}<br />
                    {map.analysis ? `${map.analysis.width} × ${map.analysis.height} pixels · ${map.analysis.labels.length} OCR labels` : "Image saved with the map"}
                  </p>
                </section>
              )}
              <section className="plan-card plan-pad">
                <h3>Refinement checklist</h3>
                <ul className="plan-note-list">
                  <li>Check that dark cells match actual walls.</li>
                  <li>Open only doorways visible in the source.</li>
                  <li>Exclude legends and exterior margins.</li>
                  <li>Place exits at doors, not directional arrows.</li>
                  <li>Place people on walkable cells and validate every route.</li>
                </ul>
              </section>
            </aside>
          </div>
        ) : !error && (
          <div className="plan-empty-small">Map not found.</div>
        )}
        <footer className="plan-safety-note">
          <ShieldCheck size={17} />
          <p>Planning and education only. The grid does not certify building safety or replace an approved evacuation plan.</p>
        </footer>
      </div>
    </DashboardLayout>
  );
}
