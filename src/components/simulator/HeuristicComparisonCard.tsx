"use client";
import { Loader2, SlidersHorizontal } from "lucide-react";
import type { HeuristicType } from "@/lib/astar";

export interface HeuristicComparisonRow {
  heuristic: HeuristicType;
  cost: number;
  nodes: number;
  time: number;
}

interface HeuristicComparisonCardProps {
  startsCount: number;
  activePerson: number;
  compareAll: boolean;
  onCompareAllChange: (v: boolean) => void;
  comparing: boolean;
  hasResults: boolean;
  onCompare: () => void;
  comparison: HeuristicComparisonRow[];
}

export default function HeuristicComparisonCard({
  startsCount,
  activePerson,
  compareAll,
  onCompareAllChange,
  comparing,
  hasResults,
  onCompare,
  comparison,
}: HeuristicComparisonCardProps) {
  const maxNodes = Math.max(1, ...comparison.map(c => c.nodes));

  return (
    <section className="plan-card plan-pad">
      <div className="plan-section-heading">
        <h3>
          Compare heuristics fairly — {compareAll ? `all ${startsCount} people` : `Person ${activePerson + 1}`}
        </h3>
        <label className="plan-checkbox" style={{ margin: 0 }}>
          <input
            type="checkbox"
            checked={compareAll}
            onChange={e => onCompareAllChange(e.target.checked)}
          />
          <span>All people</span>
        </label>
        <button
          className="plan-btn secondary small"
          disabled={comparing || !hasResults}
          onClick={onCompare}
        >
          {comparing ? <Loader2 size={14} className="animate-spin" /> : <SlidersHorizontal size={14} />}
          Compare
        </button>
      </div>
      <p className="plan-small">
        Same selected people, grid, exits and movement costs. Only the heuristic changes. Runtime is measured separately from animation.
      </p>
      {comparison.length > 0 && (
        <table className="plan-comparison">
          <thead>
            <tr>
              <th>Heuristic</th>
              <th>Cost</th>
              <th>Explored</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map(r => (
              <tr key={r.heuristic}>
                <td className="capitalize">{r.heuristic}</td>
                <td>{Number.isFinite(r.cost) ? r.cost.toFixed(2) : "No route"}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <span>{r.nodes}</span>
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-block",
                        height: 6,
                        width: `${Math.max(8, Math.round((r.nodes / maxNodes) * 60))}px`,
                        background: "var(--p-accent, #059669)",
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </td>
                <td>{r.time.toFixed(2)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="plan-small">
        When every selected person is reachable, all three return the same optimal cost; only the explored node count changes. That is what admissibility guarantees.
      </p>
    </section>
  );
}
