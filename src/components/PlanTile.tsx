import Link from "next/link";
import { mapPreview, type MapSummary } from "@/lib/workspace-client";
export default function PlanTile({ map, onDelete }: { map: MapSummary; onDelete?: (id: number) => void }) {
  return <article className="plan-tile">
    <Link className="plan-tile__preview" href={`/maps/${map.id}`} aria-label={`Review ${map.title}`}>
      {/* The preview endpoint draws the actual stored grid, not an illustrative plan. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mapPreview(map)} alt={`Preview of ${map.title}`} loading="lazy" />
    </Link>
    <div className="plan-tile__body"><h3>{map.title}</h3><p>{map.description || "A saved building model. Review geometry and exit positions before routing."}</p>
      <div className="plan-tile__facts"><span>{map.gridWidth} × {map.gridHeight} grid</span><span>{map.exits?.length ?? 0} exits</span><span>{map.starts?.length ?? 0} people</span></div>
      <div className="plan-tile__actions"><Link className="site-link" href={`/maps/${map.id}`}>Edit plan</Link><Link className="site-button small" href={`/simulator?mapId=${map.id}`}>Simulate</Link>{onDelete && <button className="plan-tile__delete" type="button" onClick={() => onDelete(map.id)} aria-label={`Delete ${map.title}`}>Delete</button>}</div>
    </div>
  </article>;
}
