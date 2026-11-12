import fs from "fs";
import path from "path";
import {
  buildOfficialRankingClubLines,
  resolveCareerTotalAllClubsDisplay,
  resolveOfficialPuntosDisplay,
} from "./jugadorPuntosBreakdown";
import {
  rankingPosicionesFromSorted,
  sortJugadoresForOfficialSiteRanking,
} from "./rankingPosition";
import type { PlayerPointsBreakdownClub } from "./playerPointsBreakdown";
import type { RivieraJugadorWithStats } from "./types";

const RIVIERA = "11111111-1111-4111-8111-111111111111";
const HACK = "22222222-2222-4222-8222-222222222222";
const PADELITO = "33333333-3333-4333-8333-333333333333";
const VALVIDUB = "44444444-4444-4444-8444-444444444444";

const LEDGER_CLUBS: PlayerPointsBreakdownClub[] = [
  { organizador_id: RIVIERA, club_name: "Club Riviera", points: 1060 },
  { organizador_id: HACK, club_name: "Hack Pádel", points: 540 },
  { organizador_id: PADELITO, club_name: "Padelito Warehouse", points: 260 },
  { organizador_id: VALVIDUB, club_name: "Valvidub Sports", points: 150 },
];

function jugador(
  partial: Partial<RivieraJugadorWithStats> = {}
): RivieraJugadorWithStats {
  return {
    id: "810f9308-fe0a-4c63-b9aa-e44fca6fa243",
    nombre: "Nevyl",
    slug: "nevyl",
    riviera_id: "RIV-00000011",
    organizador_id: RIVIERA,
    categoria: "5ta_fuerza",
    visible_publico: true,
    estado: "activo",
    suma_ranking: true,
    stats: { puntos_totales: 1180 } as never,
    ...partial,
  } as RivieraJugadorWithStats;
}

describe("RIV-00000011 — ranking oficial y carrera local", () => {
  const profile = jugador({
    pointsBreakdown: {
      currentClubPoints: 1060,
      careerTotalAllClubs: 1750,
      officialGlobalPoints: 2010,
      officialPointsByClub: LEDGER_CLUBS,
      pointsByClub: [
        { organizador_id: RIVIERA, club_name: "Club Riviera", points: 1060 },
        { organizador_id: HACK, club_name: "Hack Pádel", points: 540 },
        { organizador_id: VALVIDUB, club_name: "Valvidub Sports", points: 150 },
      ],
    },
  });

  it("el ranking muestra el ledger (2010), no la carrera filtrada (1750)", () => {
    expect(resolveOfficialPuntosDisplay(profile)).toEqual({
      kind: "available",
      puntos: 2010,
    });
    expect(resolveCareerTotalAllClubsDisplay(profile, false)).toBe(1750);
  });

  it("el desglose oficial incluye el club de 260 y suma el total del ledger", () => {
    const lines = buildOfficialRankingClubLines(profile);
    expect(lines.map((line) => line.puntos).sort((a, b) => b - a)).toEqual([
      1060, 540, 260, 150,
    ]);
    expect(lines.reduce((sum, line) => sum + line.puntos, 0)).toBe(2010);
    expect(lines.some((line) => line.role === "career-total")).toBe(false);
    expect(lines.some((line) => line.clubLabel === "Padelito Warehouse")).toBe(true);
  });

  it("un ajuste manual de carrera no se resta del ranking oficial", () => {
    const withNegativeCareer = jugador({
      pointsBreakdown: {
        ...profile.pointsBreakdown!,
        pointsByClub: [
          ...profile.pointsBreakdown!.pointsByClub,
          { organizador_id: PADELITO, club_name: "Padelito Warehouse", points: -800 },
        ],
        careerTotalAllClubs: 950,
      },
    });
    expect(resolveOfficialPuntosDisplay(withNegativeCareer).kind === "available"
      ? resolveOfficialPuntosDisplay(withNegativeCareer)
      : null).toEqual({ kind: "available", puntos: 2010 });
    expect(
      buildOfficialRankingClubLines(withNegativeCareer).reduce(
        (sum, line) => sum + line.puntos,
        0
      )
    ).toBe(2010);
  });

  it("una lectura fallida del desglose no convierte el ranking en 0 ni en la carrera", () => {
    const unread = jugador({
      pointsBreakdown: {
        ...profile.pointsBreakdown!,
        officialPointsByClub: null,
      },
    });
    expect(resolveOfficialPuntosDisplay(unread)).toEqual({
      kind: "available",
      puntos: 2010,
    });
    expect(buildOfficialRankingClubLines(unread)).toEqual([]);
  });

  it("sin total oficial no inventa 0", () => {
    const missing = jugador({
      officialPuntosGlobal: null,
      pointsBreakdown: {
        ...profile.pointsBreakdown!,
        officialGlobalPoints: null,
        officialPointsByClub: LEDGER_CLUBS,
      },
    });
    expect(resolveOfficialPuntosDisplay(missing)).toEqual({ kind: "unavailable" });
    expect(buildOfficialRankingClubLines(missing)).toEqual([]);
  });

  it("un movimiento duplicado que no cuadra con el total no se muestra como desglose", () => {
    const duplicated = jugador({
      pointsBreakdown: {
        ...profile.pointsBreakdown!,
        officialPointsByClub: [
          ...LEDGER_CLUBS,
          { organizador_id: PADELITO, club_name: "Padelito Warehouse", points: 260 },
        ],
      },
    });
    expect(buildOfficialRankingClubLines(duplicated)).toEqual([]);
    expect(resolveOfficialPuntosDisplay(duplicated)).toEqual({
      kind: "available",
      puntos: 2010,
    });
  });

  it("la sustitución conserva el total oficial aunque la carrera local esté incompleta", () => {
    const substituted = jugador({
      id: "e42908fe-455f-4646-96be-4cf5181bf58f",
      pointsBreakdown: {
        currentClubPoints: 0,
        careerTotalAllClubs: 260,
        officialGlobalPoints: 2010,
        officialPointsByClub: LEDGER_CLUBS,
        pointsByClub: [
          { organizador_id: PADELITO, club_name: "Padelito Warehouse", points: 260 },
        ],
      },
    });
    expect(resolveCareerTotalAllClubsDisplay(substituted, false)).toBe(260);
    expect(resolveOfficialPuntosDisplay(substituted)).toEqual({
      kind: "available",
      puntos: 2010,
    });
  });
});

describe("orden oficial del ranking", () => {
  function ranked(nombre: string, official: number, local = 0): RivieraJugadorWithStats {
    return jugador({
      id: nombre,
      nombre,
      officialPuntosGlobal: official,
      stats: { puntos_totales: local } as never,
    });
  }

  it("empata por puntos oficiales y desempata por nombre", () => {
    const sorted = sortJugadoresForOfficialSiteRanking([
      ranked("zeta", 500, 100),
      ranked("ana", 500, 100),
      ranked("bruno", 700, 50),
    ]);
    expect(sorted.map((item) => item.nombre)).toEqual(["bruno", "ana", "zeta"]);
    expect(rankingPosicionesFromSorted(sorted)).toEqual([1, 2, 2]);
  });

  it("una bonificación ya asentada en el ledger permanece dentro del total oficial", () => {
    const lines = buildOfficialRankingClubLines(
      jugador({
        pointsBreakdown: {
          currentClubPoints: 150,
          careerTotalAllClubs: 150,
          officialGlobalPoints: 150,
          officialPointsByClub: [
            { organizador_id: VALVIDUB, club_name: "Valvidub Sports", points: 150 },
          ],
          pointsByClub: [],
        },
      })
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.puntos).toBe(150);
  });
});

describe("lectura oficial por club", () => {
  it("la migración solo agrega el ledger y no reescribe puntos", () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../../../supabase/migrations/0127_official_points_by_club.sql"
      ),
      "utf8"
    );
    expect(sql).toMatch(/FROM public\.riviera_official_points_ledger/);
    expect(sql).toMatch(/_resolve_official_player_key/);
    expect(sql).not.toMatch(/INSERT\s+INTO/i);
    expect(sql).not.toMatch(/UPDATE\s+public/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });
});
