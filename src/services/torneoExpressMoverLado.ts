import { supabase } from "../lib/supabaseClient";
import { cruceDelOtroLado } from "../lib/torneoExpress/moverLadoEliminatoria";

type CruceRow = {
  id: string;
  torneo_id: string;
  ronda: number;
  cruce_index: number;
  es_bye: boolean;
};

/**
 * Mueve un partido completo al otro lado de la siguiente ronda.
 * Solo intercambia cruce_index. Parejas, marcador, ganador, horario y cancha
 * se quedan en el mismo registro.
 */
export async function moverPartidoAlOtroLado(partidoId: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error("Inicia sesión para mover el cuadro.");
  }

  const { data: match, error: matchError } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select("id, torneo_id, ronda, cruce_index, es_bye")
    .eq("id", partidoId)
    .single();
  if (matchError) throw new Error(matchError.message);
  const current = match as CruceRow;
  if (current.es_bye) {
    throw new Error("Un bye no se puede mover de lado.");
  }

  const { data: roundRows, error: roundError } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select("id, torneo_id, ronda, cruce_index, es_bye")
    .eq("torneo_id", current.torneo_id)
    .eq("ronda", current.ronda);
  if (roundError) throw new Error(roundError.message);
  const round = (roundRows ?? []) as CruceRow[];

  const { data: nextRows, error: nextError } = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .select("id")
    .eq("torneo_id", current.torneo_id)
    .eq("ronda", current.ronda + 1)
    .eq("es_bye", false)
    .limit(1);
  if (nextError) throw new Error(nextError.message);
  if ((nextRows ?? []).length > 0) {
    throw new Error(
      "La siguiente ronda ya existe. No se puede mover el partido."
    );
  }

  const destino = cruceDelOtroLado(
    current.cruce_index,
    round.filter((row) => !row.es_bye).map((row) => row.cruce_index)
  );
  const otro = round.find((row) => row.cruce_index === destino);
  if (destino == null || !otro) {
    throw new Error("No hay un partido en el otro lado para intercambiar.");
  }

  const temporal = 1000 + current.cruce_index;
  const first = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .update({ cruce_index: temporal })
    .eq("id", current.id);
  if (first.error) throw new Error(first.error.message);
  const second = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .update({ cruce_index: current.cruce_index })
    .eq("id", otro.id);
  if (second.error) {
    await supabase
      .from("torneo_express_eliminatoria_partidos")
      .update({ cruce_index: current.cruce_index })
      .eq("id", current.id);
    throw new Error(second.error.message);
  }
  const third = await supabase
    .from("torneo_express_eliminatoria_partidos")
    .update({ cruce_index: destino })
    .eq("id", current.id);
  if (third.error) throw new Error(third.error.message);
}
