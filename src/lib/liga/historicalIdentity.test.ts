import {
  attributeMatches,
  collectMissingJugadorIds,
  inheritedPointsStayOnPlaza,
  occupantForUnplayedJornada,
  resolveSlotPlayerId,
} from "./historicalIdentity";

const ARTURO = "arturo";
const SAUL = "saul";
const B = "jugador-b";
const C = "jugador-c";

describe("identidad histórica de sustitución", () => {
  it("A — jornada 1 conserva a Arturo y desde la 2 el futuro es Saúl", () => {
    const chain = [
      { fromJugadorId: ARTURO, toJugadorId: SAUL, ingresoJornadaNumero: 2 },
    ];
    expect(
      resolveSlotPlayerId(
        { jornadaNumero: 1, storedJugadorId: ARTURO, played: true },
        ARTURO,
        chain
      )
    ).toBe(ARTURO);
    expect(
      resolveSlotPlayerId(
        { jornadaNumero: 2, storedJugadorId: SAUL, played: false },
        ARTURO,
        chain
      )
    ).toBe(SAUL);
    expect(
      resolveSlotPlayerId(
        { jornadaNumero: 5, storedJugadorId: SAUL, played: false },
        ARTURO,
        chain
      )
    ).toBe(SAUL);
    expect(occupantForUnplayedJornada(ARTURO, 1, chain)).toBe(ARTURO);
  });

  it("B — sustitución desde la jornada 5 deja intactas las cuatro anteriores", () => {
    const chain = [
      { fromJugadorId: ARTURO, toJugadorId: SAUL, ingresoJornadaNumero: 5 },
    ];
    for (const n of [1, 2, 3, 4]) {
      expect(
        resolveSlotPlayerId(
          { jornadaNumero: n, storedJugadorId: ARTURO, played: true },
          ARTURO,
          chain
        )
      ).toBe(ARTURO);
    }
    expect(
      resolveSlotPlayerId(
        { jornadaNumero: 5, storedJugadorId: ARTURO, played: false },
        ARTURO,
        chain
      )
    ).toBe(SAUL);
  });

  it("C — dos sustituciones sucesivas conservan a quien jugó cada tramo", () => {
    const chain = [
      { fromJugadorId: ARTURO, toJugadorId: B, ingresoJornadaNumero: 4 },
      { fromJugadorId: B, toJugadorId: C, ingresoJornadaNumero: 7 },
    ];
    expect(
      resolveSlotPlayerId(
        { jornadaNumero: 3, storedJugadorId: ARTURO, played: true },
        ARTURO,
        chain
      )
    ).toBe(ARTURO);
    expect(
      resolveSlotPlayerId(
        { jornadaNumero: 5, storedJugadorId: B, played: true },
        ARTURO,
        chain
      )
    ).toBe(B);
    expect(
      resolveSlotPlayerId(
        { jornadaNumero: 8, storedJugadorId: C, played: false },
        ARTURO,
        chain
      )
    ).toBe(C);
    expect(occupantForUnplayedJornada(ARTURO, 6, chain)).toBe(B);
    expect(occupantForUnplayedJornada(ARTURO, 7, chain)).toBe(C);
  });

  it("D — los puntos heredados no se duplican y el partido queda con quien jugó", () => {
    expect(inheritedPointsStayOnPlaza(18, 18)).toEqual({
      plaza: 18,
      duplicado: 0,
    });
    const stats = attributeMatches([
      { jugadorId: ARTURO, won: true },
      { jugadorId: ARTURO, won: false },
      { jugadorId: SAUL, won: true },
    ]);
    expect(stats.find((s) => s.jugadorId === ARTURO)).toEqual({
      jugadorId: ARTURO,
      victorias: 1,
      derrotas: 1,
    });
    expect(stats.find((s) => s.jugadorId === SAUL)).toEqual({
      jugadorId: SAUL,
      victorias: 1,
      derrotas: 0,
    });
  });

  it("E — un resultado guardado no cambia de jugador ni se regenera", () => {
    const chain = [
      { fromJugadorId: ARTURO, toJugadorId: SAUL, ingresoJornadaNumero: 2 },
    ];
    const before = { jornadaNumero: 1, storedJugadorId: ARTURO, played: true };
    expect(resolveSlotPlayerId(before, ARTURO, chain)).toBe(before.storedJugadorId);
  });

  it("F — la vista pública lee el id persistido y no repara nada", () => {
    const known = new Set([SAUL]);
    const missing = collectMissingJugadorIds([ARTURO, SAUL, ARTURO], known);
    expect(missing).toEqual([ARTURO]);
    const chain = [
      { fromJugadorId: ARTURO, toJugadorId: SAUL, ingresoJornadaNumero: 2 },
    ];
    const shown = resolveSlotPlayerId(
      { jornadaNumero: 1, storedJugadorId: ARTURO, played: true },
      ARTURO,
      chain
    );
    expect(shown).toBe(ARTURO);
    expect(shown).not.toBe(SAUL);
  });

  it("G — una jornada ya disputada no se reescribe aunque coincida con el ingreso", () => {
    const chain = [
      { fromJugadorId: ARTURO, toJugadorId: SAUL, ingresoJornadaNumero: 2 },
    ];
    expect(
      resolveSlotPlayerId(
        { jornadaNumero: 2, storedJugadorId: ARTURO, played: true },
        ARTURO,
        chain
      )
    ).toBe(ARTURO);
    expect(
      resolveSlotPlayerId(
        { jornadaNumero: 2, storedJugadorId: SAUL, played: false },
        ARTURO,
        chain
      )
    ).toBe(SAUL);
  });
});
