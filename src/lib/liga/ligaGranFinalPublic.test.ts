import {
  findLigaGranFinalPartido,
  isLigaGranFinalPartido,
  jornadaHasLigaGranFinal,
  ligaGranFinalHeroMeta,
  ligaGranFinalSubtitle,
  ligaTemporadaLabelFromNombre,
  resolveLigaGranFinalPresentationState,
} from "./ligaGranFinalPublic";
import { PLAYOFFS_SCORE_FORMAT } from "./parejasFijasPlayoffsMatchScore";
import type { LigaPartido } from "./types";

function partido(
  partial: Partial<LigaPartido> & Pick<LigaPartido, "id">
): LigaPartido {
  return {
    jornada_id: "j",
    pareja1_id: "p1",
    pareja2_id: "p2",
    ronda: 1,
    cancha: 1,
    estado: "upcoming",
    score_pareja1: null,
    score_pareja2: null,
    set_scores: null,
    created_at: "",
    ...partial,
  };
}

describe("ligaGranFinalPublic", () => {
  it("detecta FINAL por fase y bracket_slot, no por número de jornada", () => {
    expect(
      isLigaGranFinalPartido({ fase: "final", bracket_slot: null })
    ).toBe(true);
    expect(
      isLigaGranFinalPartido({ fase: "semifinal", bracket_slot: "FINAL" })
    ).toBe(true);
    expect(
      isLigaGranFinalPartido({ fase: "semifinal", bracket_slot: "SF1" })
    ).toBe(false);
    expect(
      isLigaGranFinalPartido({ fase: "regular", bracket_slot: null })
    ).toBe(false);
  });

  it("encuentra el partido de Gran Final entre varios", () => {
    const rows = [
      partido({ id: "sf", fase: "semifinal", bracket_slot: "SF1" }),
      partido({ id: "gf", fase: "final", bracket_slot: "FINAL" }),
    ];
    expect(findLigaGranFinalPartido(rows)?.id).toBe("gf");
    expect(jornadaHasLigaGranFinal(rows)).toBe(true);
    expect(jornadaHasLigaGranFinal([rows[0]!])).toBe(false);
  });

  it("meta de cabecera usa partidos/canchas reales", () => {
    expect(
      ligaGranFinalHeroMeta([
        partido({ id: "a", cancha: 1 }),
      ])
    ).toBe("1 partido · 1 cancha");
    expect(
      ligaGranFinalHeroMeta([
        partido({ id: "a", cancha: 1 }),
        partido({ id: "b", cancha: 2 }),
        partido({ id: "c", cancha: 1 }),
      ])
    ).toBe("3 partidos · 2 canchas");
  });

  it("estados: pendiente / en juego / campeones solo con ganador válido", () => {
    expect(
      resolveLigaGranFinalPresentationState(
        partido({ id: "1", estado: "upcoming" }),
        true
      )
    ).toBe("pending");
    expect(
      resolveLigaGranFinalPresentationState(
        partido({ id: "2", estado: "in_progress" }),
        true
      )
    ).toBe("live");
    expect(
      resolveLigaGranFinalPresentationState(
        partido({
          id: "3",
          estado: "completed",
          score_pareja1: 12,
          score_pareja2: 7,
          set_scores: {
            format: PLAYOFFS_SCORE_FORMAT,
            sets: [
              { p1: 6, p2: 4 },
              { p1: 6, p2: 3 },
            ],
            stb: null,
            wo: false,
          },
        }),
        true
      )
    ).toBe("champions");
    expect(
      resolveLigaGranFinalPresentationState(
        partido({
          id: "4",
          estado: "completed",
          score_pareja1: 10,
          score_pareja2: 9,
          set_scores: {
            format: PLAYOFFS_SCORE_FORMAT,
            sets: [
              { p1: 4, p2: 6 },
              { p1: 6, p2: 3 },
            ],
            stb: null,
            wo: false,
          },
        }),
        true
      )
    ).toBe("pending");
  });

  it("subtitulo y temporada desde nombre de liga", () => {
    expect(
      ligaGranFinalSubtitle("Liga Padelito Warehouse Temporada 1")
    ).toBe("Liga Padelito Warehouse · Temporada 1");
    expect(ligaTemporadaLabelFromNombre("Liga X Temporada 2")).toBe(
      "Temporada 2"
    );
  });
});
