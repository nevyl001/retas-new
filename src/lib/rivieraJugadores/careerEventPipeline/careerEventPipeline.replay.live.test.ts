/**
 * Replay live del pipeline sobre un duelo ya finalizado.
 * Uso: REPLAY_PIPELINE_LIVE=1 npm run replay:career-pipeline-duelo
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import type { Duelo2v2 } from "../../duelo2v2/types";

const EVENTO_ID = "41e90d4c-fd2c-41fe-9b19-627aebac3bfa";

function loadEnvFile(): void {
  const envPath = resolve(__dirname, "../../../../.env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    if (!process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceKey) {
    process.env.REACT_APP_SUPABASE_ANON_KEY = serviceKey;
  }
}

function mapDueloRow(row: Record<string, unknown>): Duelo2v2 {
  const parseDetalleSets = (raw: unknown): Duelo2v2["detalle_sets"] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        const a = Number(o.a);
        const b = Number(o.b);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return { a, b };
      })
      .filter((x): x is { a: number; b: number } => x !== null);
  };

  return {
    id: String(row.id),
    organizador_id: String(row.organizador_id),
    nombre: String(row.nombre),
    descripcion: row.descripcion ? String(row.descripcion) : null,
    cancha: row.cancha != null ? String(row.cancha) : null,
    programado_en: row.programado_en ? String(row.programado_en) : null,
    programado_hasta: row.programado_hasta ? String(row.programado_hasta) : null,
    estado: row.estado as Duelo2v2["estado"],
    pareja_a_j1_id: row.pareja_a_j1_id ? String(row.pareja_a_j1_id) : null,
    pareja_a_j2_id: row.pareja_a_j2_id ? String(row.pareja_a_j2_id) : null,
    pareja_a_j1_nombre: String(row.pareja_a_j1_nombre),
    pareja_a_j2_nombre: String(row.pareja_a_j2_nombre),
    pareja_b_j1_id: row.pareja_b_j1_id ? String(row.pareja_b_j1_id) : null,
    pareja_b_j2_id: row.pareja_b_j2_id ? String(row.pareja_b_j2_id) : null,
    pareja_b_j1_nombre: String(row.pareja_b_j1_nombre),
    pareja_b_j2_nombre: String(row.pareja_b_j2_nombre),
    sets_pareja_a: Number(row.sets_pareja_a ?? 0),
    sets_pareja_b: Number(row.sets_pareja_b ?? 0),
    detalle_sets: parseDetalleSets(row.detalle_sets),
    ganador: (row.ganador as Duelo2v2["ganador"]) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    finalizado_at: row.finalizado_at ? String(row.finalizado_at) : null,
  };
}

const describeLive =
  process.env.REPLAY_PIPELINE_LIVE === "1" ? describe : describe.skip;

describeLive("career-event-pipeline live replay", () => {
  beforeAll(() => {
    loadEnvFile();
  });

  it(
    `replays duelo_2v2 ${EVENTO_ID} and expects ok: true`,
    async () => {
      const { supabase } = await import("../../supabaseClient");
      const { data: dueloRow, error: dueloError } = await supabase
        .from("duelos_2v2")
        .select("*")
        .eq("id", EVENTO_ID)
        .maybeSingle();

      expect(dueloError).toBeNull();
      expect(dueloRow).toBeTruthy();

      const duelo = mapDueloRow(dueloRow as Record<string, unknown>);

      if (process.env.REPLAY_ASSERTIONS_ONLY === "1") {
        const { data: participaciones } = await supabase
          .from("jugador_participaciones")
          .select("jugador_id")
          .eq("tipo_evento", "duelo_2v2")
          .eq("evento_id", EVENTO_ID);
        const touchedJugadorIds = Array.from(
          new Set((participaciones ?? []).map((p) => p.jugador_id))
        );

        const { assertCareerEventIntegrity } = await import("./assertions");
        const failures = await assertCareerEventIntegrity({
          context: {
            kind: "duelo_2v2",
            organizadorId: duelo.organizador_id,
            hostOrganizadorId: duelo.organizador_id,
            eventoId: EVENTO_ID,
            tipoEvento: "duelo_2v2",
          },
          touchedJugadorIds,
          requireRating: true,
          ratingPartidoRefs: [`duelo2v2:${EVENTO_ID}`],
        });

        const result = {
          ok: failures.length === 0,
          processed: touchedJugadorIds.length > 0,
          touchedJugadorIds,
          failures,
        };

        // eslint-disable-next-line no-console
        console.info("[replay-career-pipeline] assertions-only", result);
        expect(result.processed).toBe(true);
        expect(result.failures).toEqual([]);
        expect(result.ok).toBe(true);
        return;
      }

      const { finalizeCareerEvent } = await import("./pipeline");

      const result = await finalizeCareerEvent({
        kind: "duelo_2v2",
        organizadorId: duelo.organizador_id,
        duelo,
      });

      // eslint-disable-next-line no-console
      console.info("[replay-career-pipeline] result", {
        ok: result.ok,
        processed: result.processed,
        touchedJugadorIds: result.touchedJugadorIds,
        failures: result.failures,
        durationMs: result.durationMs,
      });

      expect(result.processed).toBe(true);
      expect(result.failures).toEqual([]);
      expect(result.ok).toBe(true);
    },
    120_000
  );
});
