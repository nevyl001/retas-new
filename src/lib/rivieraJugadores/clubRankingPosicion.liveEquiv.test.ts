/**
 * Equivalencia masiva LISTA TS (ranking visible) ↔ RPC 1-jugador.
 *
 * NO usa el gate del frontend. Llama la RPC directo (para validar 0024
 * con CLUB_RANKING_POSICION_RPC_ENABLED=false).
 *
 * Comando:
 *   RUN_RANKING_POS_EQUIV=1 npm test -- --watchAll=false --testPathPattern=clubRankingPosicion.liveEquiv
 *
 * PASS: compared > 0 && diffs === []
 * FAIL: cualquier diferencia de posición o puntos (nativo, cedido o source id).
 *
 * @jest-environment jsdom
 */
import { createClient } from "@supabase/supabase-js";
import {
  rankingPosicionesFromSortedForClub,
  rankingPuntosClubLocal,
} from "./rankingPosition";
import { PUBLIC_ORGANIZER_RPC_FALLBACK } from "./publicOrganizador";
import { listInternalClubJugadoresRanking } from "./rivieraJugadoresService";

const RUN = process.env.RUN_RANKING_POS_EQUIV === "1";
const ORG =
  process.env.EQUIV_ORG_ID || "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";
const CATS = [
  "open",
  "1ra_fuerza",
  "2da_fuerza",
  "3ra_fuerza",
  "4ta_fuerza",
  "5ta_fuerza",
  "6ta_fuerza",
] as const;
const GENEROS = ["M", "F"] as const;

type RpcPos = { jugador_id: string; posicion: number; puntos: number };

async function rpcPosicion1Jugador(
  org: string,
  jugadorId: string,
  categoria: string,
  genero: string
): Promise<RpcPos | null> {
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.REACT_APP_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.REACT_APP_SUPABASE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL/anon key in env");
  }
  const sb = createClient(url, key);
  const { data, error } = await sb.rpc(
    "riviera_ranking_posicion_jugador_por_organizador",
    {
      p_organizador_id: org,
      p_jugador_id: jugadorId,
      p_categoria: categoria,
      p_genero: genero === "F" ? "F" : "M",
    }
  );
  if (error) {
    throw new Error(
      `RPC 1-jugador falló (${categoria}/${genero}/${jugadorId}): ${error.message}`
    );
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  return {
    jugador_id: String(row.jugador_id ?? jugadorId),
    posicion: Number(row.posicion),
    puntos: Number(row.puntos),
  };
}

const maybeDescribe = RUN ? describe : describe.skip;

maybeDescribe("equivalencia masiva ranking lista ↔ RPC 1-jugador", () => {
  jest.setTimeout(300_000);

  it("0 diferencias en todas las categorías/géneros del org", async () => {
    const diffs: Array<Record<string, unknown>> = [];
    let compared = 0;
    let grantedCompared = 0;
    let tiesBuckets = 0;

    for (const genero of GENEROS) {
      for (const categoria of CATS) {
        // Misma semántica que JugadoresPublicRanking (anon + publicRpcContext).
        const list = await listInternalClubJugadoresRanking(
          ORG,
          categoria,
          genero,
          PUBLIC_ORGANIZER_RPC_FALLBACK
        );
        if (list.length === 0) continue;

        const ranks = rankingPosicionesFromSortedForClub(list, ORG);
        const pts = list.map((j) => rankingPuntosClubLocal(j, ORG));
        const uniquePts = new Set(pts);
        if (uniquePts.size < list.length) tiesBuckets += 1;

        for (let i = 0; i < list.length; i++) {
          const j = list[i]!;
          const listPos = ranks[i]!;
          const listPts = pts[i]!;
          const rpc = await rpcPosicion1Jugador(ORG, j.id, categoria, genero);
          compared += 1;
          if (j.concedidoPorAdmin) grantedCompared += 1;

          if (
            !rpc ||
            !Number.isFinite(rpc.posicion) ||
            rpc.posicion !== listPos ||
            rpc.puntos !== listPts
          ) {
            diffs.push({
              categoria,
              genero,
              id: j.id,
              nombre: j.nombre,
              concedido: Boolean(j.concedidoPorAdmin),
              listPos,
              rpcPos: rpc?.posicion ?? null,
              listPts,
              rpcPts: rpc?.puntos ?? null,
            });
          }

          const sourceId = j.grantedAccess?.sourceJugadorId?.trim();
          if (sourceId && sourceId !== j.id) {
            const rpcSource = await rpcPosicion1Jugador(
              ORG,
              sourceId,
              categoria,
              genero
            );
            compared += 1;
            if (
              !rpcSource ||
              rpcSource.posicion !== listPos ||
              rpcSource.puntos !== listPts
            ) {
              diffs.push({
                categoria,
                genero,
                id: sourceId,
                via: "source_id_lookup",
                localId: j.id,
                listPos,
                rpcPos: rpcSource?.posicion ?? null,
                listPts,
                rpcPts: rpcSource?.puntos ?? null,
              });
            }
          }
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          compared,
          grantedCompared,
          categoriesWithTies: tiesBuckets,
          diffs: diffs.length,
          sample: diffs.slice(0, 20),
          pass: compared > 0 && diffs.length === 0,
        },
        null,
        2
      )
    );

    expect(compared).toBeGreaterThan(0);
    expect(diffs).toEqual([]);
  });
});
