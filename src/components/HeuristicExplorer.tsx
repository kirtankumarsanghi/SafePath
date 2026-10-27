"use client";
import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { getSearchFrame, runAStarWithSteps, heuristicFormula, type AStarRunResult, type CellType, type HeuristicType } from "@/lib/astar";
import GridView from "./GridView";
const START = { x: 2, y: 5 }, GOAL = { x: 17, y: 5 };
export default function HeuristicExplorer() {
  const grid = useMemo(() => {
    const g: Record<string, CellType> = {};
    for (let y = 0; y < 13; y++) for (let x = 0; x < 20; x++) g[`${x},${y}`] = !x || !y || x === 19 || y === 12 || x === 7 && y < 9 || x === 12 && y > 3 ? "wall" : "empty";
    return g;
  }, []);
  const [active, setActive] = useState<HeuristicType>("manhattan"), [results, setResults] = useState<Partial<Record<HeuristicType, AStarRunResult>>>({});
  const current = results[active];
  const frame = useMemo(() => getSearchFrame(current, (current?.steps.length ?? 0) - 1), [current]);
  const run = (h: HeuristicType) => { setActive(h); setResults(r => ({ ...r, [h]: runAStarWithSteps(grid, 20, 13, START, GOAL, [], h, { allowDiagonal: false }) })); };
  return <section className="plan-card"><div className="editor-toolbar"><div><h3>Interactive heuristic lab</h3><p className="plan-small">Identical four-way grid and unit costs. Only h(n) changes.</p></div></div><div className="editor-canvas-wrap"><GridView grid={grid} cols={20} rows={13} starts={[START]} exits={[GOAL]} fires={[]} openSet={frame.open} closedSet={frame.closed} fMap={frame.fMap} frameVersion={frame.version} paths={current?.reached ? [{ points: current.path, color: "#059669", label: "Optimal path", progress: 1 }] : []} showFValues={false} activeCell={null} cellSize={25} interactive={false} /></div><div className="plan-pad"><table className="plan-comparison"><thead><tr><th>Heuristic</th><th>Path cost</th><th>Explored</th><th>Compare</th></tr></thead><tbody>{(["manhattan", "euclidean", "chebyshev"] as HeuristicType[]).map(h => <tr key={h}><td><strong className="capitalize">{h}</strong><p className="plan-small">{heuristicFormula(h)}</p></td><td>{results[h]?.stats.totalCost ?? "—"}</td><td>{results[h]?.stats.nodesExplored ?? "—"}</td><td><button className="plan-btn secondary small" onClick={() => run(h)}><Play size={13} />Run</button></td></tr>)}</tbody></table><p className="plan-small">All three return the same optimal cost on this model, but may explore different numbers of nodes. Each uses the same tie-breaking rule and movement model.</p></div></section>;
}
