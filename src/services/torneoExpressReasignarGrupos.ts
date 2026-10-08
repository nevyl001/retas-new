import { supabase } from "../lib/supabaseClient";
import { partidoTieneHistorial } from "../lib/torneoExpress/partidoHistorial";
import { formatSupabaseError } from "./torneoExpressService";
import { assertCategoriaAdmiteGrupos } from "./torneoExpressNuevoGrupo";

/**
 * Reacomoda parejas entre grupos que NO han iniciado, sin tocar los demás.
 * Conserva los ids de los grupos (los grupos con resultados quedan intactos).
 * Las escrituras van una tras otra; si algo falla se restaura lo que había.
 */

export const GRUPO_YA_INICIO_MSG =
  "Uno de los grupos ya tiene resultados: no se pueden cambiar sus parejas.";

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
  if (partidosActuales.some((row) => partidoTieneHistorial(row))) {
    throw new Error(GRUPO_YA_INICIO_MSG);
  }
  const vinculosActuales = await selectRows(
    "torneo_express_grupo_parejas",
    grupoIds
  );

  const vinculosNuevos: Row[] = input.grupos.flatMap((grupo) =>
    Array.from(new Set(grupo.parejaIds)).map((pareja_id) => ({
      grupo_id: grupo.grupoId,
      pareja_id,
    }))
  );
  const partidosNuevos: Row[] = input.partidos.map((partido) => ({
    grupo_id: partido.grupoId,
    pareja_local_id: partido.pareja_local_id,
    pareja_visitante_id: partido.pareja_visitante_id,
    estado: "pendiente",
    ronda: partido.ronda,
    orden: partido.orden,
    cancha: partido.cancha,
    programado_en: partido.programado_en,
  }));

  try {
    await deleteRows("torneo_express_partidos", grupoIds);
    await deleteRows("torneo_express_grupo_parejas", grupoIds);
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
