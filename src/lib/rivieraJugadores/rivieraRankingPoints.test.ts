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

  it("liga: cada jornada ganada suma +50 (acumulable entre jornadas)", () => {
    const unaJornada = calcularPuntosEvento({
      formato: "liga",
      jornadas_ganadas: 1,
    });
    expect(unaJornada).toBe(PUNTOS_LIGA.GANAR_JORNADA);
    expect(unaJornada + unaJornada + unaJornada).toBe(3 * PUNTOS_LIGA.GANAR_JORNADA);
  });

  it("liga: ejemplo 5 jornadas ganadas + campeón", () => {
    expect(
      PUNTOS_LIGA.BASE_INSCRIPCION +
        5 * PUNTOS_LIGA.GANAR_JORNADA +
        PUNTOS_LIGA.PRIMER_LUGAR
    ).toBe(850);
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

  it("express: campeón con hitos eliminatorios", () => {
    expect(
      calcularPuntosEvento({
        formato: "express",
        posicion_final: 1,
        paso_fase_grupos: true,
        paso_semifinal: true,
        llego_final: true,
      })
    ).toBe(
      PUNTOS_EXPRESS.PARTICIPACION +
        PUNTOS_EXPRESS.PASAR_FASE_GRUPOS +
        PUNTOS_EXPRESS.PASAR_SEMIFINAL +
        PUNTOS_EXPRESS.LLEGAR_FINAL +
        PUNTOS_EXPRESS.PRIMER_LUGAR
    );
  });

  it("express: clasificado pierde en cuartos", () => {
    expect(
      calcularPuntosEvento({ formato: "express", paso_fase_grupos: true })
    ).toBe(PUNTOS_EXPRESS.PARTICIPACION + PUNTOS_EXPRESS.PASAR_FASE_GRUPOS);
  });

  it("express: 3.º con grupos y semifinal", () => {
    expect(
      calcularPuntosEvento({
        formato: "express",
        posicion_final: 3,
        paso_fase_grupos: true,
        paso_semifinal: true,
      })
    ).toBe(
      PUNTOS_EXPRESS.PARTICIPACION +
        PUNTOS_EXPRESS.PASAR_FASE_GRUPOS +
        PUNTOS_EXPRESS.PASAR_SEMIFINAL +
        PUNTOS_EXPRESS.TERCER_LUGAR
    );
  });

  it("express: finalista", () => {
    expect(
      calcularPuntosEvento({
        formato: "express",
        posicion_final: 2,
        paso_fase_grupos: true,
        paso_semifinal: true,
        llego_final: true,
      })
    ).toBe(
      PUNTOS_EXPRESS.PARTICIPACION +
        PUNTOS_EXPRESS.PASAR_FASE_GRUPOS +
        PUNTOS_EXPRESS.PASAR_SEMIFINAL +
        PUNTOS_EXPRESS.LLEGAR_FINAL +
        PUNTOS_EXPRESS.SEGUNDO_LUGAR
    );
  });

  it("nunca devuelve negativos", () => {
    expect(
      calcularPuntosEvento({ formato: "reta", posicion_final: 5 })
    ).toBe(PUNTOS_RETA.PARTICIPACION);
  });
});
