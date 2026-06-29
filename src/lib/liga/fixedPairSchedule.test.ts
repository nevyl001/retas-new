import {
  buildBergerRounds,
  buildFixedPairLeagueSchedule,
  countPairMeetings,
  LIGA_EQUIPO_BYE,
} from "./fixedPairSchedule";
import { buildJornadaParejasFromPlayers } from "../../services/ligaService";

const SIX = ["e1", "e2", "e3", "e4", "e5", "e6"];

describe("buildFixedPairLeagueSchedule", () => {
  it("6 parejas / 1 vuelta = 5 jornadas", () => {
    expect(buildFixedPairLeagueSchedule(SIX, 1)).toHaveLength(5);
  });

  it("6 parejas / 2 vueltas = 10 jornadas", () => {
    expect(buildFixedPairLeagueSchedule(SIX, 2)).toHaveLength(10);
  });

  it("6 parejas / 3 vueltas = 15 jornadas", () => {
    expect(buildFixedPairLeagueSchedule(SIX, 3)).toHaveLength(15);
  });

  it("cada pareja juega máximo una vez por jornada", () => {
    const schedule = buildFixedPairLeagueSchedule(SIX, 2);
    for (const j of schedule) {
      const seen = new Set<string>();
      for (const m of j.matches) {
        expect(seen.has(m.equipo1_id)).toBe(false);
        expect(seen.has(m.equipo2_id)).toBe(false);
        seen.add(m.equipo1_id);
        seen.add(m.equipo2_id);
      }
    }
  });

  it("doble vuelta: cada enfrentamiento aparece exactamente 2 veces", () => {
    const schedule = buildFixedPairLeagueSchedule(SIX, 2);
    const meetings = countPairMeetings(schedule);
    const expectedPairs = (SIX.length * (SIX.length - 1)) / 2;
    expect(meetings.size).toBe(expectedPairs);
    for (const count of Array.from(meetings.values())) {
      expect(count).toBe(2);
    }
  });

  it("triple vuelta: cada enfrentamiento aparece exactamente 3 veces", () => {
    const schedule = buildFixedPairLeagueSchedule(SIX, 3);
    const meetings = countPairMeetings(schedule);
    for (const count of Array.from(meetings.values())) {
      expect(count).toBe(3);
    }
  });

  it("número impar de parejas genera BYE sin romper el calendario", () => {
    const five = ["a", "b", "c", "d", "e"];
    const schedule = buildFixedPairLeagueSchedule(five, 1);
    expect(schedule).toHaveLength(5);
    for (const j of schedule) {
      for (const m of j.matches) {
        expect(m.equipo1_id).not.toBe(LIGA_EQUIPO_BYE);
        expect(m.equipo2_id).not.toBe(LIGA_EQUIPO_BYE);
      }
      expect(j.matches.length).toBeGreaterThanOrEqual(1);
      expect(j.matches.length).toBeLessThanOrEqual(2);
    }
  });
});

describe("buildJornadaParejasFromPlayers (individual — sin cambios)", () => {
  it("8 jugadores siguen generando 7 jornadas rotativas", () => {
    const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
    const jornadas = buildJornadaParejasFromPlayers(players);
    expect(jornadas).toHaveLength(7);
    expect(jornadas[0]).toHaveLength(4);
  });
});
