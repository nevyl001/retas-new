/**
 * @jest-environment jsdom
 *
 * RANK competitivo del ranking interno: solo puntos (1,1,3), nombre no rompe empate.
 */
import { rankingPosicionesFromSortedForClub } from "./rankingPosition";
import type { RivieraJugadorWithStats } from "./types";

function asJugador(
  id: string,
  nombre: string,
  puntosClub: number,
  org = "org"
): RivieraJugadorWithStats {
  return {
    id,
    nombre,
    slug: id,
    categoria: "open",
    genero: "M",
    organizador_id: org,
    estado: "activo",
    visible_publico: true,
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0,
    careerPuntosByClub: [{ organizadorId: org, puntos: puntosClub }],
    careerPuntosTotal: puntosClub,
    pointsBreakdown: {
      currentClubPoints: puntosClub,
      careerTotalAllClubs: puntosClub,
      pointsByClub: [],
    },
  } as unknown as RivieraJugadorWithStats;
}

describe("ranking interno — RANK competitivo (semántica lista)", () => {
  it("empates por puntos comparten #; el siguiente salta (nombre no cambia el #)", () => {
    const org = "org";
    const list = [
      asJugador("b", "Bruno", 200, org),
      asJugador("c", "Carla", 200, org),
      asJugador("a", "Ana", 100, org),
    ];
    const ranks = rankingPosicionesFromSortedForClub(list, org);
    expect(ranks).toEqual([1, 1, 3]);
  });
});
