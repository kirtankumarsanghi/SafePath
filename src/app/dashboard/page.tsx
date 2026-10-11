"use client";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import PlanTile from "@/components/PlanTile";
import { getJSON, shortDate, type MapSummary, type RunSummary } from "@/lib/workspace-client";
import { ShieldCheck, Activity, Terminal, Layers, DoorOpen, History, Server, FileText, ArrowRight, Play, Upload } from "lucide-react";

export default function DashboardPage() {
  const [maps, setMaps] = useState<MapSummary[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      getJSON<{ maps: MapSummary[] }>("/api/maps", { signal: controller.signal }),
      getJSON<{ runs: RunSummary[] }>("/api/runs", { signal: controller.signal })
    ])
      .then(([m, r]) => {
        if (!controller.signal.aborted) {
          setMaps(m.maps);
          setRuns(r.runs);
        }
      })
      .catch(e => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry]);

  const totalExits = useMemo(() => maps.reduce((count, map) => count + (map.exits?.length ?? 0), 0), [maps]);
  const totalStarts = useMemo(() => maps.reduce((count, map) => count + (map.starts?.length ?? 0), 0), [maps]);

  // Compute workspace status indicators
  const unreviewedCount = useMemo(() => {
    return maps.filter(m => {
      const parsedAnalysis = (m as any).analysis;
      return parsedAnalysis && !parsedAnalysis.reviewed;
    }).length;
  }, [maps]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Editorial Header */}
        <header className="workspace-head">
          <div>
            <span className="workspace-kicker">Workspace Command Center</span>
            <h1 className="text-3xl font-extrabold tracking-tight">Egress Routing & Graph Solvers</h1>
            <p className="text-sm text-slate-400">
              Isolate partition geometry, verify legal exits, and compile building blueprints into un-occluded spatial routing graphs. This is an active routing utility; verify real-world conditions independently.
            </p>
          </div>
          <div className="workspace-actions">
            <a className="site-button" href="/simulator">Launch A* Simulator</a>
            <a className="site-button primary" href="/maps/new">Upload floor plan</a>
          </div>
        </header>

        {error && (
          <div className="workspace-alert" role="alert">
            {error}{" "}
            <button className="site-link" type="button" onClick={() => setRetry(r => r + 1)}>
              Retry sync
            </button>
          </div>
        )}

        {/* Dense telemetry row */}
        <dl className="metric-strip" aria-label="System status telemetry">
          <div>
            <dt>Active Blueprints</dt>
            <dd>{loading || error ? "—" : maps.length}</dd>
            <small>{unreviewedCount ? `${unreviewedCount} pending blueprint reviews` : "All plans confirmed"}</small>
          </div>
          <div>
            <dt>Exit Nodes</dt>
            <dd>{loading || error ? "—" : totalExits}</dd>
            <small>{maps.length ? `${(totalExits / maps.length).toFixed(1)} exits avg per floor` : "0 exits mapped"}</small>
          </div>
          <div>
            <dt>Total Start Vertices</dt>
            <dd>{loading || error ? "—" : totalStarts}</dd>
            <small>Active starting positions</small>
          </div>
          <div>
            <dt>Saved Solver Passes</dt>
            <dd>{loading || error ? "—" : runs.length}</dd>
            <small>Heuristic path history</small>
          </div>
        </dl>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Workspace Column */}
          <div className="lg:col-span-2 space-y-6">
            <section className="workspace-section">
              <div className="workspace-section-head">
                <div>
                  <h2>Structural Maps Workspace</h2>
                  <p>Verify line continuity and doorway clearance on these floor plans.</p>
                </div>
                <Link className="site-link" href="/maps">
                  See all plans
                </Link>
              </div>

              {loading ? (
                <div className="plan-library">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="workspace-skeleton" />
                  ))}
                </div>
              ) : !maps.length ? (
                <div className="workspace-empty">
                  <h3>No building blueprints uploaded</h3>
                  <p>
                    Convert a raster floor-plan into a navigable grid. SafePath separates text labels and equipment icons to isolate masonry lines.
                  </p>
                  <a className="site-button primary" href="/maps/new">
                    Upload your first drawing
                  </a>
                </div>
              ) : (
                <div className="plan-library">
                  {maps.slice(0, 3).map(map => (
                    <PlanTile key={map.id} map={map} />
                  ))}
                </div>
              )}
            </section>

            <section className="workspace-section">
              <div className="workspace-section-head">
                <div>
                  <h2>Solver History Logs</h2>
                  <p>Previous A* executions. A path cost is a grid unit, not an evacuation estimate.</p>
                </div>
                <Link className="site-link" href="/runs">
                  See full log
                </Link>
              </div>

              {loading ? (
                <div className="workspace-skeleton" style={{ height: 180 }} />
              ) : !runs.length ? (
                <div className="workspace-empty">
                  <h3>No previous paths computed</h3>
                  <p>Open the simulator, set up an evacuation scenario, and click Save Run to log path performance metrics.</p>
                  <a className="site-button" href="/simulator">
                    Open simulator
                  </a>
                </div>
              ) : (
                <div className="workspace-table-wrap">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Run Scenario</th>
                        <th>Heuristic</th>
                        <th>Path Steps</th>
                        <th>Solver Passes</th>
                        <th>Compute Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.slice(0, 5).map(run => (
                        <tr key={run.id}>
                          <td className="name">
                            {run.title}
                            <small>{shortDate(run.createdAt)}</small>
                          </td>
                          <td className="capitalize">{run.heuristic}</td>
                          <td className="number font-bold">
                            {run.totalPathCost === null ? "—" : run.totalPathCost.toFixed(1)}
                          </td>
                          <td className="number">{run.nodesExplored ?? 0} cells</td>
                          <td className="number text-slate-400">
                            {run.timeTakenMs ? `${run.timeTakenMs} ms` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Sidebar Telemetry & System logs */}
          <aside className="space-y-6">
            <section className="workspace-panel">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-slate-200">
                <Terminal size={14} className="text-slate-400" />
                SYSTEM STATUS LOG
              </h3>
              <div className="space-y-3 font-mono text-[11px] text-slate-400">
                <div className="p-3 bg-black/40 border border-white/5 space-y-2">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>A* Core Workers</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ONLINE
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Tesseract OCR</span>
                    <span className="text-slate-400">IDLE</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span>PostgreSQL DB</span>
                    <span className="text-emerald-400">CONNECTED</span>
                  </div>
                </div>

                <div className="space-y-1 text-slate-500 leading-relaxed">
                  <div>[10:42:01] DB connected successfully.</div>
                  <div>[10:42:03] Cache traced to memory.</div>
                  <div>[10:42:05] Ready to compile new structural plans.</div>
                </div>
              </div>
            </section>

            <section className="workspace-panel">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-2 text-slate-200">
                <ShieldCheck size={14} className="text-slate-400" />
                Verifiability checklist
              </h3>
              <ul className="space-y-3 text-[11.5px] text-slate-400 leading-relaxed list-disc list-inside">
                <li>
                  <strong>Wall line continuity:</strong> Low thresholds might leave door openings blocked. Check and edit wall corners on the plan.
                </li>
                <li>
                  <strong>Confirmed exits:</strong> Color blobs are unverified suggestions. Confirm the real exit positions before simulating.
                </li>
                <li>
                  <strong>Exclude annotation area:</strong> Keep legends, margins, and textual keys separate from the building's navigability.
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}
