import {
  buildPartidosDetalleByLegacyPlayerId,
  buildPartidosDetalleForPair,
  labelRetaRonda,
} from "./buildRetaPartidosDetalle";
import type { Game, Match, Pair } from "../db/types";

const pairs: Pair[] = [
  {
    id: "pa",
    tournament_id: "t1",
    player1_id: "u1",
    player2_id: "u2",
    player1_name: "Devyl",
    player2_name: "Duran",
    created_at: "2026-06-01T10:00:00Z",
  },
  {
    id: "pb",
    tournament_id: "t1",
    player1_id: "u3",
    player2_id: "u4",
    player1_name: "Nevyl",
    player2_name: "Marlon",
    created_at: "2026-06-01T10:00:00Z",
  },
];

const mkMatch = (
  id: string,
  round: number,
  p1: string,
  p2: string,
  s1: number,
  s2: number,
  extra?: Partial<Match>
): Match =>
  ({
    id,
    tournament_id: "t1",
    pair1_id: p1,
    pair2_id: p2,
    pair1_name: "A",
    pair2_name: "B",
    pair1_score: s1,
    pair2_score: s2,
    round,
    court: 1,
    status: "finished",
    created_at: `2026-06-0${round}T12:00:00Z`,
    ...extra,
  }) as Match;

describe("buildRetaPartidosDetalle", () => {
  it("genera detalle por pareja con rival, ronda y resultado", () => {
    const matches = [
      mkMatch("m1", 1, "pa", "pb", 6, 2),
      mkMatch("m2", 2, "pa", "pb", 4, 6),
    ];
    const gamesByMatchId = new Map<string, Game[]>();
    const pairById = new Map(pairs.map((p) => [p.id, p]));

    const detalle = buildPartidosDetalleForPair(
      "pa",
      matches,
      gamesByMatchId,
      pairById
    );

    expect(detalle).toHaveLength(2);
    expect(detalle[0]).toMatchObject({
      id: "m1",
      ronda: 1,
      fase: "Ronda 1",
      rival: "Nevyl / Marlon",
      games_favor: 6,
      games_contra: 2,
      resultado: "win",
    });
    expect(detalle[1]).toMatchObject({
      ronda: 2,
      games_favor: 4,
      games_contra: 6,
      resultado: "loss",
    });
  });

  it("asigna el mismo detalle a ambos jugadores de la pareja", () => {
    const matches = [mkMatch("m1", 1, "pa", "pb", 6, 3)];
    const gamesByMatchId = new Map<string, Game[]>();
    const byPlayer = buildPartidosDetalleByLegacyPlayerId(
      pairs,
      matches,
      gamesByMatchId
    );

    expect(byPlayer.get("u1")).toEqual(byPlayer.get("u2"));
    expect(byPlayer.get("u1")).toHaveLength(1);
  });

  it("acumula los partidos de un jugador que jugó en varias parejas (alineación dinámica) en vez de sobrescribir", () => {
    // u1 ("Devyl") jugó su pareja original "pa" en la ronda 1, y luego una
    // pareja NUEVA "pc" (rotación dinámica, con un jugador u5 que no
    // pertenece a ninguna otra pareja) en la ronda 2 -- ambos partidos deben
    // quedar en su detalle, no solo el último procesado.
    const pairsWithRotation: Pair[] = [
      ...pairs,
      {
        id: "pc",
        tournament_id: "t1",
        player1_id: "u1",
        player2_id: "u5",
        player1_name: "Devyl",
        player2_name: "Otro",
        created_at: "2026-06-02T10:00:00Z",
      },
    ];
    const matches = [
      mkMatch("m1", 1, "pa", "pb", 6, 3),
      mkMatch("m2", 2, "pc", "pb", 6, 4),
    ];
    const gamesByMatchId = new Map<string, Game[]>();

    const byPlayer = buildPartidosDetalleByLegacyPlayerId(
      pairsWithRotation,
      matches,
      gamesByMatchId
    );

    const u1Detalle = byPlayer.get("u1")!;
    expect(u1Detalle).toHaveLength(2);
    expect(u1Detalle.map((d) => d.id).sort()).toEqual(["m1", "m2"]);
    expect(u1Detalle[0].ronda).toBe(1);
    expect(u1Detalle[1].ronda).toBe(2);
    // u2 (solo en "pa", que solo jugó m1) conserva su único partido; u5
    // (solo en "pc", que solo jugó m2) también. u3/u4 (en "pb", que jugó
    // ambos partidos como rival) correctamente tienen los 2.
    expect(byPlayer.get("u2")).toHaveLength(1);
    expect(byPlayer.get("u5")).toHaveLength(1);
    expect(byPlayer.get("u3")).toHaveLength(2);
    expect(byPlayer.get("u4")).toHaveLength(2);
  });

  it("ignora partidos sin marcador", () => {
    const matches = [mkMatch("m0", 1, "pa", "pb", 0, 0)];
    const gamesByMatchId = new Map<string, Game[]>();
    const pairById = new Map(pairs.map((p) => [p.id, p]));

    expect(
      buildPartidosDetalleForPair("pa", matches, gamesByMatchId, pairById)
    ).toHaveLength(0);
  });

  it("labelRetaRonda distingue RR y remontada", () => {
    expect(labelRetaRonda(2, 3)).toBe("Ronda 2");
    expect(labelRetaRonda(4, 3)).toBe("Semifinal");
    expect(labelRetaRonda(5, 3)).toBe("Final");
  });
});
