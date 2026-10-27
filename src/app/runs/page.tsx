"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { getJSON, shortDate, type RunSummary } from "@/lib/workspace-client";
export default function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getJSON<{ runs: RunSummary[] }>("/api/runs", { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setRuns(d.runs); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  return <DashboardLayout><header className="workspace-head"><div><span className="workspace-kicker">Search records</span><h1>Run history</h1><p>Compare saved A* results, heuristics and search effort. Costs describe the grid model—not real-world evacuation time or safety.</p></div><Link className="site-button primary" href="/simulator">Open the simulator</Link></header>
    {error && <div className="workspace-alert" role="alert">{error} <button className="site-link" onClick={() => { setLoading(true); setError(""); setRetry(n => n + 1); }}>Try again</button></div>}
    {loading ? <div className="workspace-skeleton" aria-label="Loading run history" /> : !runs.length ? <div className="workspace-empty"><h2>{error ? "History could not be loaded" : "No runs saved yet"}</h2><p>Run the algorithm and choose “Save this run” in the simulator to record the result here.</p><Link className="site-button" href="/simulator">Try the simulator</Link></div> : <><div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Run</th><th>Heuristic</th><th>Path cost</th><th>Explored</th><th>Compute time</th><th>Action</th></tr></thead><tbody>{runs.map(run => <tr key={run.id}><td className="name">{run.title}<small>{shortDate(run.createdAt)}</small></td><td className="capitalize">{run.heuristic}</td><td className="number">{run.totalPathCost === null ? "No complete route" : run.totalPathCost.toFixed(2)}</td><td className="number">{run.nodesExplored ?? 0}</td><td className="number">{run.timeTakenMs ?? 0} ms</td><td><Link className="site-link" href={run.mapId ? `/simulator?mapId=${run.mapId}` : "/simulator"}>Open map</Link></td></tr>)}</tbody></table></div><p className="workspace-meta">Showing the most recent {runs.length} saved runs (up to 50). Opening a map uses its current saved configuration.</p></>}
  </DashboardLayout>;
}
