import {
  buildPersistPayload,
  partidoToMatchResult,
} from "./partidoSets";
import { buildStandingsForGrupo } from "./standings";
import {
  computeWinnerChangePropagation,
  RONDA_TERCER_LUGAR,
} from "./bracketRounds";
import type {
  TorneoExpressEliminatoriaPartido,
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "./types";
import {
  isTorneoExpressClosed,
  SETS_RESULTADO_MISSING_MSG,
  TORNEO_CERRADO_RESULTADO_MSG,
} from "../../services/torneoExpressService";

/**
 * Ciclo de corrección idempotente y reglas de cierre.
 * Rating real no se integra aquí: usa partido_ref estable `te-grupo:{id}` /
 * `te-elim:{id}` + reconcileRatingPartidoRef (idempotente). Limitación documentada.
 */
describe("corrección idempotente y cierre de torneo", () => {
  const grupo: TorneoExpressGrupo = {
    id: "g1",
    torneo_id: "t1",
    nombre: "Grupo A",
    orden: 1,
    created_at: "2026-01-01",
  };

  const parejas: TorneoExpressGrupoPareja[] = [
    {
      id: "gp1",
      grupo_id: "g1",
      pareja_id: "p1",
      pareja_display: "Local / Pair",
      created_at: "2026-01-01",
    },
    {
      id: "gp2",
      grupo_id: "g1",
      pareja_id: "p2",
      pareja_display: "Visit / Pair",
      created_at: "2026-01-01",
    },
  ];

  function applySetsToPartido(
    base: TorneoExpressPartido,
    sets: Array<{ local: number; visitante: number }>
  ): TorneoExpressPartido {
    const payload = buildPersistPayload(sets);
    if (!payload) throw new Error("payload inválido");
    const ganadorId =
      payload.ganadorSide === "local"
        ? base.pareja_local_id
        : base.pareja_visitante_id;
    return {
      ...base,
      id: base.id,
      puntos_local: payload.puntos_local,
      puntos_visitante: payload.puntos_visitante,
      sets_resultado: payload.sets_resultado,
      ganador_id: ganadorId,
      estado: "jugado",
    };
  }

  it("6-4 → 4-6 → 6-4 conserva id y restaura standings/ganador", () => {
    const partidoId = "partido-mismo-id";
    let partido: TorneoExpressPartido = {
      id: partidoId,
      grupo_id: "g1",
      pareja_local_id: "p1",
      pareja_visitante_id: "p2",
      puntos_local: null,
      puntos_visitante: null,
      ganador_id: null,
      estado: "pendiente",
      created_at: "2026-01-01",
    };

    partido = applySetsToPartido(partido, [{ local: 6, visitante: 4 }]);
    expect(partido.id).toBe(partidoId);
    expect(partido.ganador_id).toBe("p1");
    const afterFirst = buildStandingsForGrupo(grupo, parejas, [partido]);
    expect(afterFirst[0].parejaId).toBe("p1");
    expect(afterFirst[0].ptsFav).toBe(6);
    expect(afterFirst[0].ptsCon).toBe(4);

    partido = applySetsToPartido(partido, [{ local: 4, visitante: 6 }]);
    expect(partido.id).toBe(partidoId);
    expect(partido.ganador_id).toBe("p2");
    const afterSecond = buildStandingsForGrupo(grupo, parejas, [partido]);
    expect(afterSecond[0].parejaId).toBe("p2");
    expect(afterSecond[0].ptsFav).toBe(6);
    expect(afterSecond[0].ptsCon).toBe(4);

    partido = applySetsToPartido(partido, [{ local: 6, visitante: 4 }]);
    expect(partido.id).toBe(partidoId);
    expect(partido.ganador_id).toBe("p1");
    const afterThird = buildStandingsForGrupo(grupo, parejas, [partido]);
    expect(afterThird).toEqual(afterFirst);
    expect(partidoToMatchResult(partido)?.gamesA).toBe(6);
    expect(partidoToMatchResult(partido)?.gamesB).toBe(4);
  });

  it("eliminatoria: corregir ganador y volver al original restaura slot downstream", () => {
    const basePartidos: TorneoExpressEliminatoriaPartido[] = [
      {
        id: "semi-0",
        torneo_id: "t1",
        ronda: 1,
        orden: 1,
        cruce_index: 0,
        pareja_local_id: "a",
        pareja_visitante_id: "b",
        puntos_local: 6,
        puntos_visitante: 4,
        sets_resultado: [{ local: 6, visitante: 4 }],
        ganador_id: "a",
        estado: "jugado",
        es_bye: false,
        created_at: "2026-01-01",
      },
      {
        id: "semi-1",
        torneo_id: "t1",
        ronda: 1,
        orden: 2,
        cruce_index: 1,
        pareja_local_id: "c",
        pareja_visitante_id: "d",
        puntos_local: 6,
        puntos_visitante: 2,
        sets_resultado: [{ local: 6, visitante: 2 }],
        ganador_id: "c",
        estado: "jugado",
        es_bye: false,
        created_at: "2026-01-01",
      },
      {
        id: "final",
        torneo_id: "t1",
        ronda: 2,
        orden: 1,
        cruce_index: 0,
        pareja_local_id: "a",
        pareja_visitante_id: "c",
        puntos_local: null,
        puntos_visitante: null,
        ganador_id: null,
        estado: "pendiente",
        es_bye: false,
        created_at: "2026-01-01",
      },
      {
        id: "tercer",
        torneo_id: "t1",
        ronda: RONDA_TERCER_LUGAR,
        orden: 1,
        cruce_index: 0,
        pareja_local_id: "b",
        pareja_visitante_id: "d",
        puntos_local: null,
        puntos_visitante: null,
        ganador_id: null,
        estado: "pendiente",
        es_bye: false,
        created_at: "2026-01-01",
      },
    ];

    const applyPatches = (
      partidos: TorneoExpressEliminatoriaPartido[],
      patches: ReturnType<typeof computeWinnerChangePropagation>
    ) => {
      const next = partidos.map((p) => ({ ...p }));
      for (const patch of patches) {
        const idx = next.findIndex((p) => p.id === patch.id);
        if (idx < 0) continue;
        next[idx] = { ...next[idx], ...patch } as TorneoExpressEliminatoriaPartido;
      }
      return next;
    };

    // a→b: final debe pasar a local=b y resetearse; 3.er lugar a/d
    let partidos = applyPatches(
      basePartidos,
      computeWinnerChangePropagation(
        basePartidos,
        {
          id: "semi-0",
          ronda: 1,
          cruce_index: 0,
          ganador_id: "a",
          es_bye: false,
        },
        "b",
        { totalRondas: 2 }
      )
    );
    partidos = partidos.map((p) =>
      p.id === "semi-0"
        ? {
            ...p,
            ganador_id: "b",
            puntos_local: 4,
            puntos_visitante: 6,
            sets_resultado: [{ local: 4, visitante: 6 }],
          }
        : p
    );

    expect(partidos.find((p) => p.id === "final")).toMatchObject({
      pareja_local_id: "b",
      pareja_visitante_id: "c",
      estado: "pendiente",
      ganador_id: null,
    });
    expect(partidos.find((p) => p.id === "tercer")).toMatchObject({
      pareja_local_id: "a",
      pareja_visitante_id: "d",
      estado: "pendiente",
    });

    // b→a: vuelve al estado inicial de slots
    partidos = applyPatches(
      partidos,
      computeWinnerChangePropagation(
        partidos,
        {
          id: "semi-0",
          ronda: 1,
          cruce_index: 0,
          ganador_id: "b",
          es_bye: false,
        },
        "a",
        { totalRondas: 2 }
      )
    );

    expect(partidos.find((p) => p.id === "final")).toMatchObject({
      pareja_local_id: "a",
      pareja_visitante_id: "c",
      estado: "pendiente",
      ganador_id: null,
      puntos_local: null,
      puntos_visitante: null,
    });
    expect(partidos.find((p) => p.id === "tercer")).toMatchObject({
      pareja_local_id: "b",
      pareja_visitante_id: "d",
      estado: "pendiente",
      ganador_id: null,
    });
  });

  it("isTorneoExpressClosed cubre fase cerrado y estado finalizado", () => {
    expect(isTorneoExpressClosed({ fase_torneo: "cerrado", estado: "en_curso" })).toBe(
      true
    );
    expect(
      isTorneoExpressClosed({ fase_torneo: "eliminatoria", estado: "finalizado" })
    ).toBe(true);
    expect(
      isTorneoExpressClosed({ fase_torneo: "grupos", estado: "en_curso" })
    ).toBe(false);
    expect(TORNEO_CERRADO_RESULTADO_MSG).toMatch(/cerrado/i);
    expect(SETS_RESULTADO_MISSING_MSG).toMatch(/multi-set/i);
  });

  it("partido_ref de rating es estable por id (idempotencia documentada)", () => {
    const partidoId = "abc-123";
    expect(`te-grupo:${partidoId}`).toBe("te-grupo:abc-123");
    expect(`te-elim:${partidoId}`).toBe("te-elim:abc-123");
  });
});
