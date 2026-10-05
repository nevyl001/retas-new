import { buildStandingsForGrupo } from "./standings";
import { planGroupReconcile, requiredPendingMatchups, type RosterMatch, type RosterSlot } from "./groupRoster";
import type { TorneoExpressGrupo, TorneoExpressGrupoPareja, TorneoExpressPartido } from "./types";
import { careerPairFromSide, ratingSideFromSnapshot } from "./participantesSnapshot";
import type { Pair } from "../db/types";

const slots: RosterSlot[] = [
  { parejaId: "a2", activa: true, parejaPreviaIds: ["a"] },
  { parejaId: "b", activa: true, parejaPreviaIds: [] },
  { parejaId: "c", activa: false, parejaPreviaIds: [] },
];

describe("requiredPendingMatchups", () => {
  it("no exige el cruce ya jugado con la pareja anterior ni el de una retirada", () => {
    const matches: RosterMatch[] = [
      { id: "ab", localId: "a", visitanteId: "b", played: true },
      { id: "ac", localId: "a2", visitanteId: "c", played: false },
    ];
    expect(requiredPendingMatchups(slots, matches)).toEqual([]);
  });

  it("pide el cruce entre activas que todavía no se jugó", () => {
    expect(requiredPendingMatchups(slots, [])).toEqual([
      { localId: "a2", visitanteId: "b" },
    ]);
  });

  it("una plaza virtual sigue siendo un cruce real", () => {
    const virtual: RosterSlot[] = [
      { parejaId: "real", activa: true, parejaPreviaIds: [] },
      { parejaId: "virtual", activa: true, parejaPreviaIds: [] },
    ];
    expect(requiredPendingMatchups(virtual, [])).toEqual([
      { localId: "real", visitanteId: "virtual" },
    ]);
  });
});

describe("planGroupReconcile", () => {
  it("crea el faltante, tira solo el pendiente obsoleto y no toca el jugado", () => {
    const matches: RosterMatch[] = [
      { id: "obsolete", localId: "a2", visitanteId: "c", played: false },
    ];
    expect(planGroupReconcile(slots, matches)).toEqual({
      create: [{ localId: "a2", visitanteId: "b" }],
      dropIds: ["obsolete"],
    });
  });

  it("un pendiente que repite un jugado histórico se retira", () => {
    const matches: RosterMatch[] = [
      { id: "played", localId: "a", visitanteId: "b", played: true },
      { id: "pending", localId: "a2", visitanteId: "b", played: false },
    ];
    expect(planGroupReconcile(slots, matches)).toEqual({
      create: [],
      dropIds: ["pending"],
    });
  });

  it("repetido sobre el plan ya aplicado no crea ni tira", () => {
    const settled: RosterMatch[] = [
      { id: "pending", localId: "a2", visitanteId: "b", played: false },
    ];
    expect(planGroupReconcile(slots, settled)).toEqual({ create: [], dropIds: [] });
  });
});

describe("standings con linaje", () => {
  const grupo: TorneoExpressGrupo = {
    id: "g",
    torneo_id: "t",
    nombre: "A",
    orden: 1,
    created_at: "",
  };

  it("el partido jugado con la pareja anterior cuenta para el slot vigente", () => {
    const parejas: TorneoExpressGrupoPareja[] = [
      {
        id: "1",
        grupo_id: "g",
        pareja_id: "a2",
        pareja_previa_ids: ["a"],
        created_at: "",
      },
      { id: "2", grupo_id: "g", pareja_id: "b", created_at: "" },
    ];
    const partidos: TorneoExpressPartido[] = [
      {
        id: "m",
        grupo_id: "g",
        pareja_local_id: "a",
        pareja_visitante_id: "b",
        puntos_local: 6,
        puntos_visitante: 4,
        ganador_id: "a",
        estado: "jugado",
        created_at: "",
      },
    ];
    const rows = buildStandingsForGrupo(grupo, parejas, partidos);
    const current = rows.find((row) => row.parejaId === "a2");
    expect(current?.pj).toBe(1);
    expect(current?.pg).toBe(1);
    expect(rows.find((row) => row.parejaId === "a")).toBeUndefined();
  });

  it("una retirada conserva los jugados y no exige sus pendientes", () => {
    const parejas: TorneoExpressGrupoPareja[] = [
      { id: "1", grupo_id: "g", pareja_id: "a", activa: false, created_at: "" },
      { id: "2", grupo_id: "g", pareja_id: "b", created_at: "" },
      { id: "3", grupo_id: "g", pareja_id: "c", created_at: "" },
    ];
    const partidos: TorneoExpressPartido[] = [
      {
        id: "ab",
        grupo_id: "g",
        pareja_local_id: "a",
        pareja_visitante_id: "b",
        puntos_local: 6,
        puntos_visitante: 3,
        ganador_id: "a",
        estado: "jugado",
        created_at: "",
      },
    ];
    const rows = buildStandingsForGrupo(grupo, parejas, partidos);
    expect(rows.find((row) => row.parejaId === "a")?.pg).toBe(1);
    const roster = [
      { parejaId: "a", activa: false, parejaPreviaIds: [] },
      { parejaId: "b", activa: true, parejaPreviaIds: [] },
      { parejaId: "c", activa: true, parejaPreviaIds: [] },
    ];
    expect(requiredPendingMatchups(roster, [
      { id: "ab", localId: "a", visitanteId: "b", played: true },
    ])).toEqual([{ localId: "b", visitanteId: "c" }]);
  });
});

describe("snapshot de rating y carrera", () => {
  const live: Pair = {
    id: "pair",
    tournament_id: "t",
    player1_id: "carlos",
    player2_id: "ana",
    player1_name: "Carlos",
    player2_name: "Ana",
    created_at: "",
  };

  it("corrige contra los jugadores congelados, no contra la pareja viva", () => {
    const side = ratingSideFromSnapshot({
      player1_id: "pedro",
      player2_id: "ana",
      player1_name: "Pedro",
      player2_name: "Ana",
      is_virtual: false,
      virtual_label: null,
    });
    expect(side).toEqual({
      player1_id: "pedro",
      player2_id: "ana",
      player1_name: "Pedro",
      player2_name: "Ana",
    });
    const career = careerPairFromSide("pair", {
      player1_id: "pedro",
      player2_id: "ana",
      player1_name: "Pedro",
      player2_name: "Ana",
      is_virtual: false,
      virtual_label: null,
    }, live);
    expect(career?.player1_id).toBe("pedro");
    expect(career?.player1_id).not.toBe(live.player1_id);
  });

  it("una plaza virtual no se manda a rating", () => {
    expect(ratingSideFromSnapshot({
      player1_id: null,
      player2_id: null,
      player1_name: null,
      player2_name: null,
      is_virtual: true,
      virtual_label: "Por definir",
    })).toBeNull();
  });
});
