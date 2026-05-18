import type { TorneoExpress, TorneoExpressGrupo } from "./types";
import type { StandingRowExpress } from "./types";
import { buildStandingsForGrupo } from "./standings";
import type {
  TorneoExpressBundle,
} from "./types";

export type GrupoStandingsBlock = {
  grupo: TorneoExpressGrupo;
  rows: StandingRowExpress[];
};

export function buildGrupoStandingsFromBundle(
  bundle: TorneoExpressBundle
): GrupoStandingsBlock[] {
  return bundle.grupos.map((grupo) => ({
    grupo,
    rows: buildStandingsForGrupo(
      grupo,
      bundle.parejasPorGrupo[grupo.id] ?? [],
      bundle.partidosPorGrupo[grupo.id] ?? []
    ),
  }));
}

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatResultadosCopyText(
  torneo: Pick<TorneoExpress, "nombre" | "created_at">,
  blocks: GrupoStandingsBlock[]
): string {
  const fecha = formatFecha(torneo.created_at);
  const lines: string[] = [`📊 ${torneo.nombre} - ${fecha}`, ""];

  blocks.forEach((block) => {
    lines.push(`${block.grupo.nombre.toUpperCase()}:`);
    block.rows.forEach((row, i) => {
      const dif =
        row.dif > 0 ? `+${row.dif}` : row.dif < 0 ? `${row.dif}` : "0";
      lines.push(
        `${i + 1}° ${row.parejaLabel}      FAV:${row.ptsFav}  DIF:${dif}  PTS:${row.puntos}`
      );
    });
    lines.push("");
  });

  lines.push("Generado con RivieraApp 🎾");
  return lines.join("\n");
}
