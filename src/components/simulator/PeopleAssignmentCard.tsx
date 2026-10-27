"use client";
import { Users, ShieldAlert } from "lucide-react";
import type { AStarRunResult } from "@/lib/astar";

interface PeopleAssignmentCardProps {
  results: AStarRunResult[] | null;
  active: number;
  onSelectPerson: (index: number) => void;
  congestionPenalty: number;
  onCongestionPenaltyChange: (value: number) => void;
  exitCapacity: number;
  onExitCapacityChange: (value: number) => void;
  fireBufferPenalty: number;
  onFireBufferPenaltyChange: (value: number) => void;
}

export default function PeopleAssignmentCard({
  results,
  active,
  onSelectPerson,
  congestionPenalty,
  onCongestionPenaltyChange,
  exitCapacity,
  onExitCapacityChange,
  fireBufferPenalty,
  onFireBufferPenaltyChange,
}: PeopleAssignmentCardProps) {
  return (
    <>
      {results && (
        <section className="plan-card plan-pad">
          <div className="plan-section-heading">
            <h3>People &amp; exit assignments</h3>
          </div>
          <div className="plan-people-buttons">
            {results.map((r, i) => (
              <button
                key={i}
                className={i === active ? "active" : ""}
                onClick={() => onSelectPerson(i)}
              >
                Person {i + 1}{" "}
                <span>
                  {r.reached
                    ? `Exit (${r.exit.x}, ${r.exit.y}) · cost ${r.stats.totalCost.toFixed(2)}${
                        r.alternativeExit
                          ? ` · 2nd exit (${r.alternativeExit.exit.x}, ${r.alternativeExit.exit.y}) (${r.alternativeExit.totalCost.toFixed(1)})`
                          : ""
                      }`
                    : r.status === "invalid"
                    ? "Invalid start or exit"
                    : r.reason?.includes("capacity")
                    ? "Exit capacity full"
                    : "No reachable exit"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="plan-card plan-pad">
        <div className="plan-section-heading">
          <h3>
            <Users size={16} className="inline mr-1" />
            Crowd, capacity &amp; hazard buffer
          </h3>
        </div>
        <label className="plan-small block mb-2">
          Congestion penalty per shared cell: <strong>{congestionPenalty.toFixed(1)}</strong>
          <input
            type="range"
            aria-label="Congestion penalty"
            min={0}
            max={3}
            step={0.5}
            value={congestionPenalty}
            onChange={e => onCongestionPenaltyChange(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
        </label>
        <label className="plan-small block mb-2">
          Max occupants per exit:{" "}
          <strong>{exitCapacity === 0 ? "Unlimited" : `${exitCapacity} people`}</strong>
          <input
            type="range"
            aria-label="Exit capacity"
            min={0}
            max={12}
            step={1}
            value={exitCapacity}
            onChange={e => onExitCapacityChange(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
        </label>
        <label className="plan-small block">
          <ShieldAlert size={13} className="inline mr-1" />
          Fire proximity buffer penalty: <strong>{fireBufferPenalty.toFixed(1)}</strong>
          <input
            type="range"
            aria-label="Fire proximity buffer"
            min={0}
            max={4}
            step={0.5}
            value={fireBufferPenalty}
            onChange={e => onFireBufferPenaltyChange(Number(e.target.value))}
            className="w-full accent-orange-500"
          />
        </label>
        <p className="plan-small mt-2">
          Enable congestion or exit capacity to distribute multiple occupants across exits and avoid bottlenecks.
        </p>
      </section>
    </>
  );
}
