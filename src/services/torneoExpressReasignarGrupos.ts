import { supabase } from "../lib/supabaseClient";
import { partidoTieneHistorial } from "../lib/torneoExpress/partidoHistorial";
import { unorderedMatchupKey } from "../lib/torneoExpress/roundRobin";
import { formatSupabaseError } from "./torneoExpressService";
import { assertCategoriaAdmiteGrupos } from "./torneoExpressNuevoGrupo";

/**
 * Reacomoda parejas entre grupos. Una pareja con resultado no sale de su grupo
 * y ese partido se conserva. Solo se borran y rearman los pendientes.
 * Las escrituras van una tras otra; si algo falla se restaura lo que había.
 */

export const PAREJA_CON_RESULTADO_MSG =
  "Una pareja con resultado no se puede mover de su grupo.";

export type ReasignarGrupoInput = {
  grupoId: string;
  parejaIds: string[];
};

export type ReasignarPartidoInput = {
  grupoId: string;
  pareja_local_id: string;
  pareja_visitante_id: string;
  ronda: number;
  orden: number;
  cancha: string;
  programado_en: string;
};

type Row = Record<string, unknown>;

async function selectRows(table: string, grupoIds: string[]): Promise<Row[]> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .in("grupo_id", grupoIds);
  if (error) throw new Error(formatSupabaseError(error));
  return (data ?? []) as Row[];
}

async function deleteRows(table: string, grupoIds: string[]): Promise<void> {
  const { error } = await supabase.from(table).delete().in("grupo_id", grupoIds);
  if (error) throw new Error(formatSupabaseError(error));
}

async function deleteByIds(table: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from(table).delete().in("id", ids);
  if (error) throw new Error(formatSupabaseError(error));
}

async function insertRows(table: string, rows: Row[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).insert(rows);
  if (error) throw new Error(formatSupabaseError(error));
}

export async function reasignarParejasGrupos(input: {
  torneoId: string;
  grupos: ReasignarGrupoInput[];
  partidos: ReasignarPartidoInput[];
}): Promise<void> {
  const grupoIds = input.grupos.map((g) => g.grupoId);
  if (grupoIds.length === 0) return;

  await assertCategoriaAdmiteGrupos(input.torneoId);

  const partidosActuales = await selectRows("torneo_express_partidos", grupoIds);
  const vinculosActuales = await selectRows(
    "torneo_express_grupo_parejas",
    grupoIds
  );
  const desiredByGroup = new Map(
    input.grupos.map((grupo) => [grupo.grupoId, new Set(grupo.parejaIds)])
  );
  const playedKeys = new Set<string>();
  for (const row of partidosActuales) {
    if (!partidoTieneHistorial(row)) continue;
    const grupoId = String(row.grupo_id ?? "");
    const localId = String(row.pareja_local_id ?? "");
    const visitId = String(row.pareja_visitante_id ?? "");
    const desired = desiredByGroup.get(grupoId);
    if (desired && (!desired.has(localId) || !desired.has(visitId))) {
      throw new Error(PAREJA_CON_RESULTADO_MSG);
    }
    playedKeys.add(`${grupoId}:${unorderedMatchupKey(localId, visitId)}`);
  }

  const managedPairIds = new Set(input.grupos.flatMap((grupo) => grupo.parejaIds));
  const vinculosABorrar = vinculosActuales.filter((row) => {
    const grupoId = String(row.grupo_id ?? "");
    const parejaId = String(row.pareja_id ?? "");
    if (!managedPairIds.has(parejaId)) return false;
    return !desiredByGroup.get(grupoId)?.has(parejaId);
  });
  const vinculosNuevos: Row[] = [];
  for (const grupo of input.grupos) {
    const existentes = new Set(
      vinculosActuales
        .filter((row) => String(row.grupo_id ?? "") === grupo.grupoId)
        .map((row) => String(row.pareja_id ?? ""))
    );
    Array.from(new Set(grupo.parejaIds)).forEach((parejaId) => {
      if (!existentes.has(parejaId)) {
        vinculosNuevos.push({ grupo_id: grupo.grupoId, pareja_id: parejaId });
      }
    });
  }
  const partidosNuevos: Row[] = input.partidos
    .filter(
      (partido) =>
        !playedKeys.has(
          `${partido.grupoId}:${unorderedMatchupKey(
            partido.pareja_local_id,
            partido.pareja_visitante_id
          )}`
        )
    )
    .map((partido) => ({
      grupo_id: partido.grupoId,
      pareja_local_id: partido.pareja_local_id,
      pareja_visitante_id: partido.pareja_visitante_id,
      estado: "pendiente",
      ronda: partido.ronda,
      orden: partido.orden,
      cancha: partido.cancha,
      programado_en: partido.programado_en,
    }));
  const pendientesABorrar = partidosActuales
    .filter((row) => !partidoTieneHistorial(row))
    .map((row) => String(row.id ?? ""))
    .filter(Boolean);

  try {
    await deleteByIds("torneo_express_partidos", pendientesABorrar);
    await deleteByIds(
      "torneo_express_grupo_parejas",
      vinculosABorrar.map((row) => String(row.id ?? "")).filter(Boolean)
    );
    await insertRows("torneo_express_grupo_parejas", vinculosNuevos);
    await insertRows("torneo_express_partidos", partidosNuevos);
  } catch (e) {
    try {
      await deleteRows("torneo_express_partidos", grupoIds);
      await deleteRows("torneo_express_grupo_parejas", grupoIds);
      await insertRows("torneo_express_grupo_parejas", vinculosActuales);
      await insertRows("torneo_express_partidos", partidosActuales);
    } catch {
      // Sin efecto: el siguiente refresco mostrará el estado real.
    }
    throw e;
  }
}
