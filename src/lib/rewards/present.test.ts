import { suggestDuplicateCampaign, summarizeRewards } from "./present";

describe("campañas mensuales en el panel", () => {
  it("duplica fechas y puntos, nunca saldos ni canjes", () => {
    const copy = suggestDuplicateCampaign({
      nombre: "Octubre",
      acumulaDesde: "2026-10-01T06:00:00.000Z",
      acumulaHasta: "2026-11-01T06:00:00.000Z",
      canjeDesde: "2026-11-01T06:00:00.000Z",
      canjeHasta: "2026-12-01T06:00:00.000Z",
      puntosPorParticipacion: 10,
    });
    expect(copy).toEqual({
      nombre: "Octubre (siguiente)",
      acumula_desde: "2026-11-01T06:00:00.000Z",
      acumula_hasta: "2026-12-01T06:00:00.000Z",
      canje_desde: "2026-12-01T06:00:00.000Z",
      canje_hasta: "2027-01-01T06:00:00.000Z",
      puntos_por_participacion: 10,
      estado: "borrador",
    });
    expect(copy).not.toHaveProperty("lotes");
    expect(copy).not.toHaveProperty("canjes");
  });

  it("separa puntos emitidos, disponibles y entregados por campaña", () => {
    const stats = summarizeRewards({
      now: new Date("2026-11-15T12:00:00.000Z"),
      names: { a: "Ana", b: "Beto" },
      campaigns: [
        {
          id: "oct",
          nombre: "Octubre",
          canje_desde: "2026-11-01T06:00:00.000Z",
          canje_hasta: "2026-12-01T06:00:00.000Z",
        },
        {
          id: "nov",
          nombre: "Noviembre",
          canje_desde: "2026-12-01T06:00:00.000Z",
          canje_hasta: "2027-01-01T06:00:00.000Z",
        },
      ],
      reviews: [
        { jugador_id: "a", estado: "aprobada", campaign_id: "oct" },
        { jugador_id: "a", estado: "aprobada", campaign_id: "oct" },
        { jugador_id: "b", estado: "aprobada", campaign_id: "nov" },
        { jugador_id: "b", estado: "pendiente", campaign_id: null },
      ],
      lots: [
        { jugador_id: "a", campaign_id: "oct", puntos_restantes: 10, anulado: false },
        { jugador_id: "b", campaign_id: "nov", puntos_restantes: 40, anulado: false },
      ],
      ledger: [
        { jugador_id: "a", campaign_id: "oct", tipo: "acreditacion", puntos: 20 },
        { jugador_id: "a", campaign_id: "oct", tipo: "canje", puntos: -10 },
        { jugador_id: "b", campaign_id: "nov", tipo: "acreditacion", puntos: 40 },
      ],
      redemptions: [
        { jugador_id: "a", campaign_id: "oct", estado: "entregado" },
        { jugador_id: "b", campaign_id: "nov", estado: "solicitado" },
      ],
    });
    expect(stats.activePlayers).toBe(2);
    expect(stats.approved).toBe(3);
    expect(stats.issued).toBe(60);
    expect(stats.available).toBe(10);
    expect(stats.used).toBe(10);
    expect(stats.delivered).toBe(1);
    expect(stats.consistent[0]).toMatchObject({ nombre: "Ana", participaciones: 2 });
    expect(stats.comparison.find((row) => row.id === "nov")?.disponibles).toBe(0);
    expect(stats.comparison.find((row) => row.id === "oct")?.disponibles).toBe(10);
  });
});
