import { PLAYOFFS_SCORE_FORMAT } from "./parejasFijasPlayoffsMatchScore";
import { resolveLigaPodio } from "./ligaPodioRanking";
import type { LigaJornadaPareja, LigaPartido } from "./types";

function pareja(
  id: string,
  jugador1Id: string,
  jugador2Id: string,
  nombres: [string, string]
): LigaJornadaPareja {
  return {
    id,
    jornada_id: "j10",
    jugador1_id: jugador1Id,
    jugador2_id: jugador2Id,
    jugador1: {
      id: jugador1Id,
      nombre: nombres[0],
      email: null,
      telefono: null,
      genero: null,
      nivel: null,
      estado: "activo",
      organizador_id: "org",
      created_at: "",
    },
    jugador2: {
      id: jugador2Id,
      nombre: nombres[1],
      email: null,
      telefono: null,
      genero: null,
      nivel: null,
      estado: "activo",
      organizador_id: "org",
      created_at: "",
    },
  };
}

function partido(partial: Partial<LigaPartido> & Pick<LigaPartido, "id">): LigaPartido {
  return {
    jornada_id: "j10",
    pareja1_id: "p1",
    pareja2_id: "p2",
    ronda: 1,
    cancha: 1,
    estado: "completed",
    score_pareja1: null,
    score_pareja2: null,
    set_scores: null,
    created_at: "",
    ...partial,
  };
}

const cuadra = "17820485-0e73-4cd4-9d8b-f1c7dc4255a5";
const cesar = "cf5c9068-1739-4966-9777-26528db993f0";
const eddie = "8e644295-3eb2-407c-b6dc-a016989b869c";
const jose = "4bb7a93c-cf61-44bc-87df-3a64555756d4";
const arturo = "93f2c6e3-65ff-476b-b84e-34e5af65a2e6";
const javier = "982ee18d-2e3a-4ae1-9e98-941afd2f68a7";

describe("resolveLigaPodio", () => {
  it("da el título a los dos de la pareja que ganó la final, no al que más puntos de temporada tiene", () => {
    const resolution = resolveLigaPodio({
      modalidad: "parejas_fijas_playoffs",
      inscripciones: [],
      equipos: [
        {
          id: "eq-cuadra",
          puntos: 42,
          jugador1_id: cuadra,
          jugador2_id: cesar,
        },
        {
          id: "eq-arturo",
          puntos: 41,
          jugador1_id: arturo,
          jugador2_id: javier,
        },
        {
          id: "eq-eddie",
          puntos: 28,
          jugador1_id: eddie,
          jugador2_id: jose,
        },
      ],
      jornadas: [
        {
          parejas: [
            pareja("finalistas", eddie, jose, ["Eddie E", "José Luis H"]),
            pareja("campeones", cuadra, cesar, ["Cuadra", "César G"]),
            pareja("tercer", arturo, javier, ["Arturo Romero", "Javier Romero"]),
          ],
          partidos: [
            partido({
              id: "final",
              fase: "final",
              bracket_slot: "FINAL",
              pareja1_id: "finalistas",
              pareja2_id: "campeones",
              score_pareja1: 5,
              score_pareja2: 12,
              set_scores: {
                format: PLAYOFFS_SCORE_FORMAT,
                wo: false,
                stb: null,
                sets: [
                  { p1: 1, p2: 6 },
                  { p1: 4, p2: 6 },
                ],
              },
            }),
            partido({
              id: "third",
              fase: "classification",
              bracket_slot: "THIRD",
              pareja1_id: "tercer",
              pareja2_id: "otros",
              score_pareja1: 13,
              score_pareja2: 10,
              set_scores: {
                format: PLAYOFFS_SCORE_FORMAT,
                wo: false,
                stb: null,
                sets: [
                  { p1: 6, p2: 4 },
                  { p1: 7, p2: 6 },
                ],
              },
            }),
          ],
        },
      ],
    });

    expect(resolution.source).toBe("playoff");
    expect(resolution.missingSlots).toEqual([]);
    expect(resolution.entries).toEqual([
      {
        posicion: 1,
        players: [
          { legacyLigaJugadorId: cuadra, nombre: "Cuadra" },
          { legacyLigaJugadorId: cesar, nombre: "César G" },
        ],
      },
      {
        posicion: 2,
        players: [
          { legacyLigaJugadorId: eddie, nombre: "Eddie E" },
          { legacyLigaJugadorId: jose, nombre: "José Luis H" },
        ],
      },
      {
        posicion: 3,
        players: [
          { legacyLigaJugadorId: arturo, nombre: "Arturo Romero" },
          { legacyLigaJugadorId: javier, nombre: "Javier Romero" },
        ],
      },
    ]);
  });

  it("no inventa podio de playoffs con la tabla de puntos si la final no tiene ganador", () => {
    const resolution = resolveLigaPodio({
      modalidad: "parejas_fijas_playoffs",
      inscripciones: [],
      equipos: [
        {
          id: "eq-1",
          puntos: 42,
          jugador1_id: cuadra,
          jugador2_id: cesar,
        },
      ],
      jornadas: [],
    });
    expect(resolution.entries).toEqual([]);
    expect(resolution.reason).toMatch(/Gran Final/);
  });

  it("en individual usa las inscripciones, con desempate estable por id", () => {
    const resolution = resolveLigaPodio({
      modalidad: "individual_rotativo",
      inscripciones: [
        { jugador_id: "b", puntos: 10, jugador: { id: "b", nombre: "B", email: null, telefono: null, genero: null, nivel: null, estado: "activo", organizador_id: null, created_at: "" } },
        { jugador_id: "a", puntos: 10, jugador: { id: "a", nombre: "A", email: null, telefono: null, genero: null, nivel: null, estado: "activo", organizador_id: null, created_at: "" } },
        { jugador_id: "c", puntos: 4, jugador: undefined },
      ],
      jornadas: [],
    });
    expect(resolution.source).toBe("inscripciones");
    expect(resolution.entries.map((entry) => entry.players[0].legacyLigaJugadorId)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
