"use client";
import { Download, Clock, FileJson, Accessibility } from "lucide-react";
import { describeRouteSteps, estimateEvacuationTime, type AStarRunResult, type CellType } from "@/lib/astar";

interface SimulatorStatsPanelProps {
  run: AStarRunResult | undefined;
  results: AStarRunResult[] | null;
  done: boolean;
  cursor: number;
  total: number;
  openSize: number;
  closedSize: number;
  startsCount: number;
  gridData: Record<string, CellType>;
  scaleMeters: number;
  onScaleMetersChange: (v: number) => void;
  walkingSpeed: number;
  onWalkingSpeedChange: (v: number) => void;
  onExportJson: () => void;
  onExportPng: () => void;
}

export default function SimulatorStatsPanel({
  run,
  results,
  done,
  cursor,
  total,
  openSize,
  closedSize,
  startsCount,
  gridData,
  scaleMeters,
  onScaleMetersChange,
  walkingSpeed,
  onWalkingSpeedChange,
  onExportJson,
  onExportPng,
}: SimulatorStatsPanelProps) {
  const timeEst = run
    ? estimateEvacuationTime(run, gridData, {
        scaleMetersPerCell: scaleMeters,
        walkingSpeedMps: walkingSpeed,
      })
    : null;
  const routeSteps = run && done ? describeRouteSteps(run, scaleMeters) : [];

  return (
    <section className="plan-card plan-pad">
      <div className="plan-section-heading">
        <h3>Live search statistics</h3>
      </div>
      <div className="plan-sim-stats">
        {[
          { label: "Path cost", value: done && run?.reached ? run.stats.totalCost.toFixed(2) : "—" },
          { label: "Nodes explored", value: run ? run.stats.nodesExplored : "—" },
          { label: "Steps played", value: `${cursor} / ${total}` },
          { label: "Open list", value: openSize },
          { label: "Closed list", value: closedSize },
          { label: "Compute time", value: run ? `${run.stats.timeTakenMs.toFixed(2)} ms` : "—" },
          { label: "Routes found", value: results ? `${results.filter(r => r.reached).length} / ${startsCount}` : "—" },
          { label: "Est. travel time", value: done && timeEst && run?.reached ? timeEst.formatted : "—" },
        ].map(s => (
          <div key={s.label}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>

      <details className="mt-3">
        <summary className="plan-small cursor-pointer font-medium flex items-center gap-1">
          <Clock size={13} /> Scale &amp; walking speed estimator ({scaleMeters} m/cell · {walkingSpeed} m/s)
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span>Meters / cell</span>
            <input
              type="number"
              aria-label="Meters per cell"
              min={0.2}
              max={10}
              step={0.1}
              value={scaleMeters}
              onChange={e => onScaleMetersChange(Math.max(0.2, Math.min(10, Number(e.target.value) || 1)))}
              className="rounded border px-2 py-1 bg-transparent"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Speed (m/s)</span>
            <input
              type="number"
              aria-label="Walking speed m/s"
              min={0.3}
              max={4}
              step={0.05}
              value={walkingSpeed}
              onChange={e => onWalkingSpeedChange(Math.max(0.3, Math.min(4, Number(e.target.value) || 1.35)))}
              className="rounded border px-2 py-1 bg-transparent"
            />
          </label>
        </div>
        {done && timeEst && run?.reached && (
          <p className="plan-small mt-2">
            Est. distance: <strong>{timeEst.distanceMeters.toFixed(1)} m</strong> · Walking: <strong>{timeEst.travelSeconds.toFixed(1)}s</strong>
            {timeEst.congestionDelaySeconds > 0 && (
              <> · Crowd delay: <strong>+{timeEst.congestionDelaySeconds.toFixed(1)}s</strong></>
            )}
          </p>
        )}
      </details>

      {done && routeSteps.length > 0 && (
        <details className="mt-2">
          <summary className="plan-small cursor-pointer font-medium flex items-center gap-1">
            <Accessibility size={13} /> Step-by-step text route ({routeSteps.length} steps)
          </summary>
          <ol className="mt-2 pl-4 text-xs space-y-1 list-decimal" aria-label="Turn-by-turn route description">
            {routeSteps.map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ol>
        </details>
      )}

      {results && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" className="plan-btn secondary small" onClick={onExportJson} title="Export simulation run as JSON">
            <FileJson size={14} /> Export JSON
          </button>
          <button type="button" className="plan-btn secondary small" onClick={onExportPng} title="Download route snapshot as PNG">
            <Download size={14} /> Export PNG
          </button>
        </div>
      )}

      <p className="plan-small mt-2">
        Costs are grid units; estimated times apply your scale ({scaleMeters} m/cell) and speed ({walkingSpeed} m/s).
      </p>
    </section>
  );
}
