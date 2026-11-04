/**
 * Reparación controlada: asegura partido THIRD (3.er/4.º) en ligas
 * parejas_fijas_playoffs con SF1/SF2 completed y FINAL existente.
 *
 * Uso (producción):
 *   REACT_APP_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/repair-liga-playoffs-third-place.mjs --liga-name "LIGA PADELITO WAREHOUSE TEMPORADA 1"
 *
 * Idempotente: no toca FINAL ni duplica THIRD.
 */
import { createClient } from "@supabase/supabase-js";
import {
  PLAYOFFS_THIRD_PLACE_SLOT,
  planGranFinalSync,
  planThirdPlaceSync,
  resolvePlayoffsSemifinalWinners,
} from "../src/lib/liga/parejasFijasPlayoffsGranFinal.ts";

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const ligaName =
  argValue("--liga-name") || "LIGA PADELITO WAREHOUSE TEMPORADA 1";
const ligaIdArg = argValue("--liga-id");
const dryRun = process.argv.includes("--dry-run");

const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.sb_secret_key;

if (!url || !key) {
  console.error("Faltan REACT_APP_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolveEquipoId(jornadaId, parejaId) {
  const { data, error } = await sb
    .from("liga_jornada_parejas")
    .select("equipo_id")
    .eq("jornada_id", jornadaId)
    .eq("id", parejaId)
    .maybeSingle();
  if (error) throw error;
  return data?.equipo_id ? String(data.equipo_id) : null;
}

async function ensureParejaIds(ligaId, jornadaId, equipoIds) {
  const { data: equipos, error } = await sb
    .from("liga_equipos")
    .select("id, jugador1_id, jugador2_id")
    .eq("liga_id", ligaId);
  if (error) throw error;
  const byId = new Map((equipos ?? []).map((e) => [String(e.id), e]));
  const out = [];
  for (const eqId of equipoIds) {
    const eq = byId.get(eqId);
    if (!eq) throw new Error(`Equipo ${eqId} no encontrado`);
    const { data: existing } = await sb
      .from("liga_jornada_parejas")
      .select("id")
      .eq("jornada_id", jornadaId)
      .eq("equipo_id", eqId)
      .maybeSingle();
    if (existing?.id) {
      out.push(String(existing.id));
      continue;
    }
    if (dryRun) {
      out.push(`dry-run-pareja-${eqId}`);
      continue;
    }
    const { data: ins, error: pErr } = await sb
      .from("liga_jornada_parejas")
      .insert({
        jornada_id: jornadaId,
        equipo_id: eqId,
        jugador1_id: eq.jugador1_id,
        jugador2_id: eq.jugador2_id,
      })
      .select("id")
      .single();
    if (pErr) throw pErr;
    out.push(String(ins.id));
  }
  return out;
}

async function main() {
  let liga;
  if (ligaIdArg) {
    const { data, error } = await sb
      .from("ligas")
      .select("id, nombre, modalidad, estado")
      .eq("id", ligaIdArg)
      .maybeSingle();
    if (error) throw error;
    liga = data;
  } else {
    const { data, error } = await sb
      .from("ligas")
      .select("id, nombre, modalidad, estado")
      .ilike("nombre", `%${ligaName}%`)
      .limit(5);
    if (error) throw error;
    if (!data?.length) throw new Error(`Liga no encontrada: ${ligaName}`);
    if (data.length > 1) {
      console.error(
        "Varias ligas coinciden:",
        data.map((d) => `${d.id} ${d.nombre}`)
      );
      process.exit(1);
    }
    liga = data[0];
  }

  console.log("Liga:", liga.id, liga.nombre, liga.modalidad);
  if (liga.modalidad !== "parejas_fijas_playoffs") {
    throw new Error(`Modalidad inesperada: ${liga.modalidad}`);
  }

  const { data: sfRows, error: sfErr } = await sb
    .from("liga_partidos")
    .select(
      "id, jornada_id, bracket_slot, pareja1_id, pareja2_id, score_pareja1, score_pareja2, set_scores, estado"
    )
    .eq("liga_id", liga.id)
    .in("bracket_slot", ["SF1", "SF2"]);
  if (sfErr) throw sfErr;

  const sfInputs = [];
  for (const slot of ["SF1", "SF2"]) {
    const row = (sfRows ?? []).find((r) => r.bracket_slot === slot);
    if (!row) throw new Error(`Falta ${slot}`);
    if (row.estado !== "completed") throw new Error(`${slot} no completed`);
    const eq1 = await resolveEquipoId(row.jornada_id, row.pareja1_id);
    const eq2 = await resolveEquipoId(row.jornada_id, row.pareja2_id);
    if (!eq1 || !eq2) throw new Error(`Sin equipos en ${slot}`);
    sfInputs.push({
      bracket_slot: slot,
      estado: row.estado,
      pareja1_equipo_id: eq1,
      pareja2_equipo_id: eq2,
      score_pareja1: row.score_pareja1 == null ? null : Number(row.score_pareja1),
      score_pareja2: row.score_pareja2 == null ? null : Number(row.score_pareja2),
      set_scores: row.set_scores,
    });
    console.log(slot, {
      id: row.id,
      eq1,
      eq2,
      estado: row.estado,
    });
  }

  const resolved = resolvePlayoffsSemifinalWinners(sfInputs);
  if (!resolved.ok) throw new Error(resolved.error);
  console.log("Winners:", resolved.winners);

  const { data: finalRow, error: fErr } = await sb
    .from("liga_partidos")
    .select(
      "id, jornada_id, pareja1_id, pareja2_id, score_pareja1, score_pareja2, set_scores, estado, bracket_slot"
    )
    .eq("liga_id", liga.id)
    .eq("bracket_slot", "FINAL")
    .maybeSingle();
  if (fErr) throw fErr;
  if (!finalRow) throw new Error("No hay FINAL; abortar reparación.");

  const fEq1 = await resolveEquipoId(finalRow.jornada_id, finalRow.pareja1_id);
  const fEq2 = await resolveEquipoId(finalRow.jornada_id, finalRow.pareja2_id);
  const finalSnap = {
    id: String(finalRow.id),
    equipo1_id: fEq1,
    equipo2_id: fEq2,
    estado: String(finalRow.estado),
    score_pareja1:
      finalRow.score_pareja1 == null ? null : Number(finalRow.score_pareja1),
    score_pareja2:
      finalRow.score_pareja2 == null ? null : Number(finalRow.score_pareja2),
    set_scores: finalRow.set_scores,
  };
  const finalPlan = planGranFinalSync(resolved.winners, finalSnap);
  console.log("FINAL plan:", finalPlan.action, "id=", finalRow.id);
  if (finalPlan.action !== "noop" && finalPlan.action !== "blocked_scored_mismatch") {
    throw new Error(
      `FINAL no está estable (${finalPlan.action}); no se repara THIRD automáticamente.`
    );
  }
  // blocked_scored_mismatch: FINAL ya jugada con esos IDs — se conserva; igual se crea THIRD.

  const { data: thirdRow, error: tErr } = await sb
    .from("liga_partidos")
    .select("id, jornada_id, pareja1_id, pareja2_id, score_pareja1, score_pareja2, set_scores, estado")
    .eq("liga_id", liga.id)
    .eq("bracket_slot", PLAYOFFS_THIRD_PLACE_SLOT)
    .maybeSingle();
  if (tErr) throw tErr;

  let thirdSnap = null;
  if (thirdRow?.id) {
    const t1 = await resolveEquipoId(thirdRow.jornada_id, thirdRow.pareja1_id);
    const t2 = await resolveEquipoId(thirdRow.jornada_id, thirdRow.pareja2_id);
    thirdSnap = {
      id: String(thirdRow.id),
      equipo1_id: t1,
      equipo2_id: t2,
      estado: String(thirdRow.estado),
      score_pareja1:
        thirdRow.score_pareja1 == null ? null : Number(thirdRow.score_pareja1),
      score_pareja2:
        thirdRow.score_pareja2 == null ? null : Number(thirdRow.score_pareja2),
      set_scores: thirdRow.set_scores,
    };
  }

  const thirdPlan = planThirdPlaceSync(resolved.winners, thirdSnap);
  console.log("THIRD plan:", thirdPlan);

  if (thirdPlan.action === "noop") {
    console.log("THIRD ya correcto:", thirdRow.id);
  } else if (thirdPlan.action === "blocked_scored_mismatch") {
    throw new Error("THIRD marcado no coincide; revisar manualmente.");
  } else if (thirdPlan.action === "create") {
    const jornadaId = String(finalRow.jornada_id);
    const parejaIds = await ensureParejaIds(liga.id, jornadaId, [
      thirdPlan.equipo1_id,
      thirdPlan.equipo2_id,
    ]);
    console.log("Crear THIRD en jornada", jornadaId, "parejas", parejaIds);
    if (!dryRun) {
      const { data: inserted, error: insErr } = await sb
        .from("liga_partidos")
        .insert({
          jornada_id: jornadaId,
          liga_id: liga.id,
          pareja1_id: parejaIds[0],
          pareja2_id: parejaIds[1],
          ronda: 1,
          cancha: 2,
          estado: "upcoming",
          score_pareja1: null,
          score_pareja2: null,
          fase: "classification",
          bracket_slot: PLAYOFFS_THIRD_PLACE_SLOT,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      console.log("THIRD creado:", inserted.id);

      await sb
        .from("liga_jornadas")
        .update({ estado: "in_progress", puntos_aplicados: false })
        .eq("id", jornadaId)
        .eq("estado", "completed");
    }
  } else if (thirdPlan.action === "update_unscored") {
    console.log("Actualizar THIRD unscored", thirdPlan.thirdId);
    if (!dryRun) {
      const jornadaId = String(thirdRow.jornada_id);
      const parejaIds = await ensureParejaIds(liga.id, jornadaId, [
        thirdPlan.equipo1_id,
        thirdPlan.equipo2_id,
      ]);
      const { error: updErr } = await sb
        .from("liga_partidos")
        .update({
          pareja1_id: parejaIds[0],
          pareja2_id: parejaIds[1],
          estado: "upcoming",
          score_pareja1: null,
          score_pareja2: null,
          set_scores: null,
        })
        .eq("id", thirdPlan.thirdId)
        .eq("bracket_slot", PLAYOFFS_THIRD_PLACE_SLOT)
        .is("score_pareja1", null)
        .is("score_pareja2", null);
      if (updErr) throw updErr;
    }
  }

  // Verificación
  const { data: verify } = await sb
    .from("liga_partidos")
    .select("id, bracket_slot, estado, score_pareja1, score_pareja2")
    .eq("liga_id", liga.id)
    .in("bracket_slot", ["FINAL", PLAYOFFS_THIRD_PLACE_SLOT]);
  console.log("Verify slots:", verify);

  const { data: j10 } = await sb
    .from("liga_jornadas")
    .select("id, numero, estado, puntos_aplicados")
    .eq("id", finalRow.jornada_id)
    .maybeSingle();
  console.log("Jornada final:", j10);
  console.log(dryRun ? "DRY-RUN OK" : "REPAIR OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
