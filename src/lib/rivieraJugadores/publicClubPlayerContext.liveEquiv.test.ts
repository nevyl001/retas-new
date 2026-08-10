/**
 * Gate: todo jugador del ranking público del club debe resolver ficha.
 * ranking_player_ids MINUS resolvable_public_profile_ids = []
 *
 * Comando:
 *   RUN_PUBLIC_CLUB_FICHA_EQUIV=1 npm test -- --watchAll=false --testPathPattern=publicClubPlayerContext.liveEquiv
 *
 * @jest-environment jsdom
 */
import { createClient } from "@supabase/supabase-js";
import { PUBLIC_ORGANIZER_RPC_FALLBACK } from "./publicOrganizador";
import {
  assertPublicClubPlayerContextHasNoPii,
  resolvePublicClubPlayerContext,
} from "./publicClubPlayerContext";
import { listInternalClubJugadoresRanking } from "./rivieraJugadoresService";

const RUN = process.env.RUN_PUBLIC_CLUB_FICHA_EQUIV === "1";
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

const maybeDescribe = RUN ? describe : describe.skip;

maybeDescribe("equivalencia ranking público → ficha resoluble", () => {
  jest.setTimeout(300_000);

  it("0 ids del ranking sin resolve_public_club_player_context", async () => {
    const missing: Array<Record<string, unknown>> = [];
    const piiLeaks: string[] = [];
    let compared = 0;
    let grantedCompared = 0;
    let hiddenCompared = 0;
    const seen = new Set<string>();

    for (const genero of GENEROS) {
      for (const categoria of CATS) {
        const list = await listInternalClubJugadoresRanking(
          ORG,
          categoria,
          genero,
          PUBLIC_ORGANIZER_RPC_FALLBACK
        );
        for (const j of list) {
          if (seen.has(j.id)) continue;
          seen.add(j.id);
          compared += 1;
          if (j.concedidoPorAdmin) grantedCompared += 1;
          if (j.visible_publico === false) hiddenCompared += 1;

          const ctx = await resolvePublicClubPlayerContext(ORG, j.id);
          if (!ctx || !ctx.id) {
            missing.push({
              id: j.id,
              nombre: j.nombre,
              categoria: j.categoria,
              concedido: Boolean(j.concedidoPorAdmin),
              visible_publico: j.visible_publico,
            });
            continue;
          }
          try {
            assertPublicClubPlayerContextHasNoPii(ctx);
          } catch (e) {
            piiLeaks.push(`${j.id}: ${e instanceof Error ? e.message : e}`);
          }

          const sourceId = j.grantedAccess?.sourceJugadorId?.trim();
          if (sourceId && sourceId !== j.id) {
            compared += 1;
            const viaSource = await resolvePublicClubPlayerContext(ORG, sourceId);
            if (!viaSource || viaSource.id !== ctx.id) {
              missing.push({
                id: sourceId,
                via: "source_id_lookup",
                localId: j.id,
                resolved: viaSource?.id ?? null,
                expectedLocal: ctx.id,
              });
            }
          }
        }
      }
    }

    // Jugador de otro club SIN grant hacia este org → null
    const foreign = await resolvePublicClubPlayerContext(
      ORG,
      "00000000-0000-0000-0000-000000000001"
    );
    const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
    const key =
      process.env.REACT_APP_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.REACT_APP_SUPABASE_KEY;
    let otherClubBlocked = true;
    if (url && key) {
      const sb = createClient(url, key);
      const { data: grantSources } = await sb.rpc(
        "list_public_grants_for_ranking",
        { p_grantee_organizador_id: ORG }
      );
      const grantedSourceIds = new Set(
        ((grantSources as Array<{ jugador_id?: string }> | null) ?? [])
          .map((g) => String(g.jugador_id ?? ""))
          .filter(Boolean)
      );
      const { data: candidates } = await sb
        .from("riviera_jugadores")
        .select("id,organizador_id")
        .neq("organizador_id", ORG)
        .eq("estado", "activo")
        .limit(50);
      const outsider = (candidates ?? []).find(
        (row) => !grantedSourceIds.has(String(row.id))
      );
      if (outsider?.id) {
        const cross = await resolvePublicClubPlayerContext(
          ORG,
          String(outsider.id)
        );
        otherClubBlocked = cross == null;
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          compared,
          grantedCompared,
          hiddenCompared,
          missing: missing.length,
          sampleMissing: missing.slice(0, 20),
          piiLeaks,
          foreignNull: foreign == null,
          otherClubBlocked,
          pass:
            compared > 0 &&
            missing.length === 0 &&
            piiLeaks.length === 0 &&
            foreign == null &&
            otherClubBlocked,
        },
        null,
        2
      )
    );

    expect(compared).toBeGreaterThan(0);
    expect(missing).toEqual([]);
    expect(piiLeaks).toEqual([]);
    expect(foreign).toBeNull();
    expect(otherClubBlocked).toBe(true);
  });
});
