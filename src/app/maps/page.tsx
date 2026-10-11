"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import PlanTile from "@/components/PlanTile";
import { getJSON, type MapSummary } from "@/lib/workspace-client";
import { requestHeaders } from "@/lib/map-model";
export default function MapsPage() {
  const [maps, setMaps] = useState<MapSummary[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(""), [query, setQuery] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    getJSON<{ maps: MapSummary[] }>("/api/maps", { signal: controller.signal }).then(d => { if (!controller.signal.aborted) setMaps(d.maps); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const filtered = useMemo(() => maps.filter(m => `${m.title} ${m.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [maps, query]);
  async function remove(id: number) {
    const map = maps.find(m => m.id === id);
    if (!map || !window.confirm(`Delete “${map.title}” and its saved runs? This cannot be undone.`)) return;
    setError(""); setMaps(previous => previous.filter(m => m.id !== id));
    try { await getJSON(`/api/maps/${id}`, { method: "DELETE", headers: requestHeaders(false) }); }
    catch (e) { setMaps(previous => [map, ...previous].filter((m, i, rows) => rows.findIndex(q => q.id === m.id) === i)); setError(e instanceof Error ? e.message : "The plan could not be deleted. It has been restored."); }
  }
  return <DashboardLayout><header className="workspace-head"><div><span className="workspace-kicker">Building models</span><h1>Your floor plans</h1><p>Keep the source image, refined grid and exit positions together. Open a plan to review it before running the simulator.</p></div><Link className="site-button primary" href="/maps/new">Upload a floor plan</Link></header>
    {error && <div className="workspace-alert" role="alert">{error} <button className="site-link" onClick={() => setRetry(n => n + 1)}>Reload plans</button></div>}
    {!loading && maps.length > 0 && <div className="plan-library-toolbar"><input aria-label="Search floor plans" type="search" placeholder="Search floor plans…" value={query} onChange={e => setQuery(e.target.value)} /><span>{filtered.length} of {maps.length} plans</span></div>}
    {loading ? <div className="plan-library" aria-label="Loading floor plans">{[1,2,3].map(i => <div key={i} className="workspace-skeleton" />)}</div> : !maps.length ? <div className="workspace-empty"><h2>{error ? "Floor plans are unavailable" : "No maps yet — upload your first floor plan"}</h2><p>Start with a clear image of one building level. You can refine its grid, mark exits and save it for later.</p><Link className="site-button primary" href="/maps/new">Upload your first plan</Link></div> : !filtered.length ? <div className="workspace-empty"><h2>No matching plans</h2><p>Try a different building name or description.</p><button className="site-button" onClick={() => setQuery("")}>Clear search</button></div> : <div className="plan-library">{filtered.map(map => <PlanTile key={map.id} map={map} onDelete={remove} />)}</div>}
  </DashboardLayout>;
}
