import {
  calcularPuntosEvento,
  PUNTOS_AMERICANO,
  PUNTOS_EXPRESS,
  PUNTOS_LIGA,
  PUNTOS_RETA,
} from "./rivieraRankingPoints";

describe("calcularPuntosEvento", () => {
  it("liga: inscripción + jornada ganada + podio", () => {
    expect(
      calcularPuntosEvento({
        formato: "liga",
        esNuevoEnLiga: true,
        jornadas_ganadas: 1,
        posicion_final: 1,
      })
    ).toBe(PUNTOS_LIGA.BASE_INSCRIPCION + PUNTOS_LIGA.GANAR_JORNADA + PUNTOS_LIGA.PRIMER_LUGAR);
  });

  it("reta: participación + victoria", () => {
    expect(
      calcularPuntosEvento({ formato: "reta", posicion_final: 1 })
    ).toBe(PUNTOS_RETA.PARTICIPACION + PUNTOS_RETA.VICTORIA);
  });

  it("reta equipos: solo participación si pierde", () => {
    expect(
      calcularPuntosEvento({ formato: "reta_equipos", equipo_ganador: false })
    ).toBe(20);
  });

  it("americano: base + victorias + podio", () => {
    expect(
      calcularPuntosEvento({
        formato: "americano",
        victorias_americano: 4,
        posicion_final: 2,
      })
    ).toBe(
      PUNTOS_AMERICANO.PARTICIPACION +
        4 * PUNTOS_AMERICANO.POR_VICTORIA +
        PUNTOS_AMERICANO.SEGUNDO_LUGAR
    );
  });

  it("express: campeón", () => {
    expect(
      calcularPuntosEvento({ formato: "express", posicion_final: 1 })
    ).toBe(PUNTOS_EXPRESS.PARTICIPACION + PUNTOS_EXPRESS.PRIMER_LUGAR);
  });

  it("express: semifinalista 3er puesto", () => {
    expect(
      calcularPuntosEvento({ formato: "express", posicion_final: 3 })
    ).toBe(PUNTOS_EXPRESS.PARTICIPACION + PUNTOS_EXPRESS.TERCER_LUGAR);
  });

  it("nunca devuelve negativos", () => {
    expect(
      calcularPuntosEvento({ formato: "reta", posicion_final: 5 })
    ).toBe(PUNTOS_RETA.PARTICIPACION);
  });
});
