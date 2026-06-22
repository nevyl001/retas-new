import {
  mergeMetadataWithPartidosDetalle,
  parsePartidosDetalle,
  summarizePartidosDetalle,
  type PartidoDetalle,
} from "./buildPartidosDetalle";

const sampleDetalle: PartidoDetalle[] = [
  {
    id: "m1",
    ronda: 1,
    fase: "Ronda 1",
    rival: "A / B",
    games_favor: 6,
    games_contra: 4,
    resultado: "win",
    fecha: "2026-06-01T12:00:00Z",
  },
  {
    id: "m2",
    ronda: 2,
    fase: "Ronda 2",
    rival: "C / D",
    games_favor: 3,
    games_contra: 6,
    resultado: "loss",
    fecha: "2026-06-02T12:00:00Z",
  },
];

describe("buildPartidosDetalle shared", () => {
  it("summarizePartidosDetalle cuadra G/P/E y sets", () => {
    const s = summarizePartidosDetalle(sampleDetalle);
    expect(s).toEqual({
      ganados: 1,
      perdidos: 1,
      empatados: 0,
      jugados: 2,
      setsFavor: 9,
      setsContra: 10,
    });
  });

  it("mergeMetadataWithPartidosDetalle no sobrescribe detalle existente", () => {
    const existing = {
      subtipo: "reta_cierre",
      partidos_detalle: sampleDetalle,
      partidos_ganados: 1,
      partidos_perdidos: 1,
      partidos_jugados: 2,
    };
    const incoming: PartidoDetalle[] = [
      {
        ronda: 99,
        rival: "X / Y",
        games_favor: 1,
        games_contra: 0,
        resultado: "win",
        fecha: "",
      },
    ];
    const merged = mergeMetadataWithPartidosDetalle(
      existing,
      { posicion: 1 },
      incoming
    );
    expect(parsePartidosDetalle(merged.partidos_detalle)).toHaveLength(2);
    expect(merged.partidos_ganados).toBe(1);
    expect(merged.posicion).toBe(1);
  });

  it("mergeMetadataWithPartidosDetalle permite force", () => {
    const existing = { partidos_detalle: sampleDetalle };
    const incoming: PartidoDetalle[] = [
      {
        ronda: 1,
        rival: "Nuevo / Rival",
        games_favor: 6,
        games_contra: 0,
        resultado: "win",
        fecha: "",
      },
    ];
    const merged = mergeMetadataWithPartidosDetalle(
      existing,
      {},
      incoming,
      { force: true }
    );
    expect(parsePartidosDetalle(merged.partidos_detalle)).toHaveLength(1);
    expect(merged.partidos_ganados).toBe(1);
  });
});
