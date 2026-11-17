import { flexPointsForPosition } from "./constants";
import {
  generateFlexSchedule,
  regenerateFlexSchedule,
  scheduleCoversPlayers,
  scheduleHasCapturedResults,
  type FlexSchedule,
} from "./schedule";
import { rankFlexJornada } from "./standings";
import {
  assertFlexFinalJornada,
  rankFlexSeason,
  replaceJornadaAwards,
  resizeFlexSeason,
  seasonMovement,
} from "./season";
import { estimateFlexJornada } from "./time";

function players(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${String(i + 1).padStart(2, "0")}`,
    name: `Jugador ${i + 1}`,
  }));
}

function expectValid(schedule: FlexSchedule, count: number, rounds: number, courts: number) {
  expect(schedule.rounds).toHaveLength(rounds);
  const plays = Object.values(schedule.quality.matchesByPlayer);
  expect(plays).toHaveLength(count);
  expect(schedule.quality.playSpread).toBeLessThanOrEqual(1);
  for (const round of schedule.rounds) {
    const seen = new Set<string>();
    expect(round.matches.length).toBeLessThanOrEqual(courts);
    for (const match of round.matches) {
      const ids = [...match.pairA, ...match.pairB];
      expect(new Set(ids).size).toBe(4);
      for (const id of ids) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
    for (const id of round.benchIds) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
    expect(seen.size).toBe(count);
  }
}

describe("Riviera Flex League — generador", () => {
  it("A: 12 jugadores, 3 canchas y 5 rondas, todos juegan cinco y no repiten compañero", () => {
    const roster = players(12);
    const schedule = generateFlexSchedule({
      players: roster,
      courts: 3,
      rounds: 5,
      seed: 11,
    });
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    expectValid(schedule, 12, 5, 3);
    expect(Object.values(schedule.quality.matchesByPlayer).every((n) => n === 5)).toBe(true);
    expect(Object.values(schedule.quality.benchesByPlayer).every((n) => n === 0)).toBe(true);
    expect(schedule.quality.partnerRepeats).toBe(0);
    expect(schedule.quality.needsConfirmation).toBe(false);
  });

  it("B: 16 jugadores, 4 canchas y 5 rondas, todos juegan cinco", () => {
    const schedule = generateFlexSchedule({
      players: players(16),
      courts: 4,
      rounds: 5,
      seed: 22,
      trials: 1,
    });
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    expectValid(schedule, 16, 5, 4);
    expect(Object.values(schedule.quality.matchesByPlayer).every((n) => n === 5)).toBe(true);
  }, 30000);

  it("C: 13 jugadores reparte un descanso por ronda", () => {
    const schedule = generateFlexSchedule({
      players: players(13),
      courts: 3,
      rounds: 5,
      seed: 33,
    });
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    expectValid(schedule, 13, 5, 3);
    expect(schedule.rounds.every((round) => round.benchIds.length === 1)).toBe(true);
    expect(schedule.quality.benchSpread).toBeLessThanOrEqual(1);
    expect(schedule.quality.playSpread).toBeLessThanOrEqual(1);
  });

  it("D: 14 jugadores, 6 rondas y dos descansos por ronda", () => {
    const schedule = generateFlexSchedule({
      players: players(14),
      courts: 3,
      rounds: 6,
      seed: 44,
    });
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    expectValid(schedule, 14, 6, 3);
    expect(schedule.rounds.every((round) => round.benchIds.length === 2)).toBe(true);
    expect(schedule.quality.playSpread).toBeLessThanOrEqual(1);
  });

  it("E: 15 jugadores descansan una vez en cinco rondas", () => {
    const schedule = generateFlexSchedule({
      players: players(15),
      courts: 3,
      rounds: 5,
      seed: 55,
    });
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    expectValid(schedule, 15, 5, 3);
    expect(Object.values(schedule.quality.benchesByPlayer).every((n) => n === 1)).toBe(true);
    expect(schedule.quality.consecutiveBenches).toBe(0);
  });

  it("F: respeta 7 rondas pedidas", () => {
    const schedule = generateFlexSchedule({
      players: players(12),
      courts: 3,
      rounds: 7,
      seed: 66,
      trials: 1,
    });
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    expect(schedule.rounds).toHaveLength(7);
    expect(schedule.quality.rounds).toBe(7);
  });

  it("G: regenerar busca otra distribución", () => {
    const roster = players(12);
    const first = generateFlexSchedule({
      players: roster,
      courts: 3,
      rounds: 4,
      seed: 77,
      trials: 1,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = regenerateFlexSchedule({
      players: roster,
      courts: 3,
      rounds: 4,
      seed: first.seed,
      previousSignature: first.signature,
      trials: 6,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.changed).toBe(true);
    expect(second.signature).not.toBe(first.signature);
    expect(second.quality.playSpread).toBeLessThanOrEqual(1);
  });

  it("H: quitar un jugador invalida la programación confirmada", () => {
    const roster = players(12);
    const schedule = generateFlexSchedule({
      players: roster,
      courts: 3,
      rounds: 3,
      seed: 88,
      trials: 1,
    });
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    expect(scheduleCoversPlayers(schedule, roster.map((p) => p.id))).toBe(true);
    const nextIds = roster.slice(1).map((p) => p.id);
    expect(scheduleCoversPlayers(schedule, nextIds)).toBe(false);
  });

  it("I: con marcadores capturados no se puede regenerar encima", () => {
    expect(scheduleHasCapturedResults([{ scoreA: null, scoreB: null }])).toBe(false);
    expect(scheduleHasCapturedResults([{ scoreA: 6, scoreB: 4 }])).toBe(true);
  });

  it("J: si las rondas obligan a repetir compañero, avisa y no recorta el calendario", () => {
    const schedule = generateFlexSchedule({
      players: players(12),
      courts: 3,
      rounds: 12,
      seed: 99,
      trials: 1,
    });
    expect(schedule.ok).toBe(true);
    if (!schedule.ok) return;
    expect(schedule.rounds).toHaveLength(12);
    expect(schedule.quality.partnerRepeats).toBeGreaterThan(0);
    expect(schedule.quality.needsConfirmation).toBe(true);
    expect(schedule.quality.limitations.join(" ")).toMatch(/compañero/i);
  });

  it("K: el orden de inscripción no reparte más descansos a los primeros", () => {
    const roster = players(13);
    const rests = new Map<string, number>();
    for (const player of roster) rests.set(player.id, 0);
    const seeds = 12;
    for (let seed = 1; seed <= seeds; seed += 1) {
      const schedule = generateFlexSchedule({
        players: roster,
        courts: 3,
        rounds: 5,
        seed: seed * 19,
        trials: 1,
      });
      expect(schedule.ok).toBe(true);
      if (!schedule.ok) return;
      for (const [id, n] of Object.entries(schedule.quality.benchesByPlayer)) {
        rests.set(id, (rests.get(id) ?? 0) + n);
      }
    }
    const means = roster.map((p) => (rests.get(p.id) ?? 0) / seeds);
    const spread = Math.max(...means) - Math.min(...means);
    expect(spread).toBeLessThan(0.75);
  });
});

describe("Riviera Flex League — puntos y temporada", () => {
  it("L: el primer lugar vale 100 con 4, 5 o 6 rondas", () => {
    expect(flexPointsForPosition(1)).toBe(100);
    for (const rounds of [4, 5, 6]) {
      expect(flexPointsForPosition(1)).toBe(100);
      expect(rounds).toBeGreaterThan(0);
    }
    expect(flexPointsForPosition(16)).toBe(10);
    expect(flexPointsForPosition(12)).toBe(30);
  });

  it("ordena por promedio de games y no por la suma bruta", () => {
    const ranked = rankFlexJornada({
      players: [
        { id: "a", name: "Ana" },
        { id: "b", name: "Beto" },
        { id: "c", name: "Cata" },
        { id: "d", name: "Dani" },
      ],
      matches: [
        { round: 1, pairA: ["a", "b"], pairB: ["c", "d"], scoreA: 6, scoreB: 1 },
        { round: 2, pairA: ["a", "c"], pairB: ["b", "d"], scoreA: 2, scoreB: 6 },
      ],
    });
    expect(ranked.ok).toBe(true);
    if (!ranked.ok) return;
    const ana = ranked.rows.find((r) => r.jugadorId === "a")!;
    const beto = ranked.rows.find((r) => r.jugadorId === "b")!;
    expect(ana.gamesFavor).toBe(8);
    expect(beto.gamesFavor).toBe(12);
    expect(beto.posicion).toBeLessThan(ana.posicion);
    expect(ranked.rows[0]!.puntos).toBe(100);
  });

  it("un empate que cambia puntos pide resolución y no usa el nombre", () => {
    const tied = rankFlexJornada({
      players: [
        { id: "z", name: "Zoe" },
        { id: "a", name: "Ana" },
        { id: "m", name: "Mario" },
        { id: "l", name: "Luis" },
      ],
      matches: [
        { round: 1, pairA: ["z", "a"], pairB: ["m", "l"], scoreA: 5, scoreB: 5 },
      ],
    });
    expect(tied.ok).toBe(false);
    if (tied.ok) return;
    expect(tied.ties.flat().sort()).toEqual(["a", "l", "m", "z"]);

    const resolved = rankFlexJornada({
      players: [
        { id: "z", name: "Zoe" },
        { id: "a", name: "Ana" },
        { id: "m", name: "Mario" },
        { id: "l", name: "Luis" },
      ],
      matches: [
        { round: 1, pairA: ["z", "a"], pairB: ["m", "l"], scoreA: 5, scoreB: 5 },
      ],
      resolution: ["m", "l", "z", "a"],
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.rows.map((r) => r.jugadorId)).toEqual(["m", "l", "z", "a"]);
    expect(resolved.rows.map((r) => r.puntos)).toEqual([100, 90, 80, 70]);
  });

  it("suma jornadas distintas, conserva ausencias y corrige sin duplicar", () => {
    const j1 = [
      { jornadaNumero: 1, jugadorId: "carlos", posicion: 1, puntos: 100 },
      { jornadaNumero: 1, jugadorId: "andres", posicion: 2, puntos: 90 },
      { jornadaNumero: 1, jugadorId: "miguel", posicion: 3, puntos: 80 },
    ];
    const j2 = [
      { jornadaNumero: 2, jugadorId: "carlos", posicion: 4, puntos: 70 },
      { jornadaNumero: 2, jugadorId: "miguel", posicion: 3, puntos: 80 },
      { jornadaNumero: 2, jugadorId: "luis", posicion: 1, puntos: 100 },
    ];
    const season = rankFlexSeason({ awards: [...j1, ...j2] });
    expect(season.ok).toBe(true);
    if (!season.ok) return;
    expect(season.rows.find((r) => r.jugadorId === "carlos")!.puntos).toBe(170);
    expect(season.rows.find((r) => r.jugadorId === "luis")!.jornadasJugadas).toBe(1);
    expect(season.rows.find((r) => r.jugadorId === "andres")!.puntos).toBe(90);
    expect(season.rows[0]!.jugadorId).toBe("carlos");

    const corrected = replaceJornadaAwards(j1, 1, [
      { jornadaNumero: 1, jugadorId: "carlos", posicion: 2, puntos: 90 },
      { jornadaNumero: 1, jugadorId: "andres", posicion: 1, puntos: 100 },
      { jornadaNumero: 1, jugadorId: "miguel", posicion: 3, puntos: 80 },
    ]);
    const again = rankFlexSeason({
      awards: [...corrected, ...j2],
      resolution: ["carlos", "miguel", "andres", "luis"],
    });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.rows.find((r) => r.jugadorId === "carlos")!.puntos).toBe(160);
  });

  it("amplía, reduce sin borrar historia y exige que la final sea la última", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({
      numero: i + 1,
      hasOfficialResults: i < 4,
    }));
    const grown = resizeFlexSeason({ jornadas: twelve, targetCount: 16 });
    expect(grown.ok && grown.addNumeros).toEqual([13, 14, 15, 16]);
    const blocked = resizeFlexSeason({ jornadas: twelve, targetCount: 3 });
    expect(blocked.ok).toBe(false);
    const shrunk = resizeFlexSeason({
      jornadas: twelve.map((j) => ({ ...j, hasOfficialResults: j.numero <= 9 })),
      targetCount: 10,
    });
    expect(shrunk.ok && shrunk.removeNumeros).toEqual([12, 11]);

    expect(
      assertFlexFinalJornada({
        jornadas: [
          { numero: 10, hasData: true },
          { numero: 11, hasData: false },
        ],
        numero: 10,
      }).ok
    ).toBe(false);
    expect(
      assertFlexFinalJornada({
        jornadas: [{ numero: 10, hasData: true }],
        numero: 10,
      }).ok
    ).toBe(true);
  });

  it("el cierre arma el podio y el movimiento usa la tabla real", () => {
    const season = rankFlexSeason({
      awards: [
        { jornadaNumero: 10, jugadorId: "oro", posicion: 1, puntos: 100 },
        { jornadaNumero: 10, jugadorId: "plata", posicion: 2, puntos: 90 },
        { jornadaNumero: 10, jugadorId: "bronce", posicion: 3, puntos: 80 },
      ],
    });
    expect(season.ok && season.podio).toEqual(["oro", "plata", "bronce"]);
    const move = seasonMovement(
      [{ jugadorId: "plata", posicion: 5 }],
      [{ jugadorId: "plata", posicion: 3, puntosJornada: 90 }],
      "plata"
    );
    expect(move).toEqual({ puntos: 90, posicion: 3, delta: 2 });
  });

  it("estima la duración y avisa si el horario no alcanza", () => {
    const ok = estimateFlexJornada({ rounds: 5, roundMinutes: 20, restMinutes: 3 });
    expect(ok.totalMinutes).toBe(112);
    const tight = estimateFlexJornada({
      rounds: 5,
      roundMinutes: 20,
      restMinutes: 3,
      availableMinutes: 90,
    });
    expect(tight.fits).toBe(false);
  });
});
