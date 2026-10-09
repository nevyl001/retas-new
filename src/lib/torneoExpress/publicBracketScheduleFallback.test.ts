import { buildEliminatoriaLabelMap } from "./eliminatoriaLabels";
import { projectEliminatoriaMatchSlots } from "./eliminatoriaPreviewBracket";
import { buildPublicBracketViewModel } from "./publicBracketModel";
import type {
  TorneoExpress,
  TorneoExpressEliminatoriaPartido,
  TorneoExpressGrupo,
} from "./types";

const torneo = {
  id: "t1",
  nombre: "Express",
  organizador_id: "org",
  estado: "en_curso",
  source_tournament_id: null,
  created_at: "2026-10-09T02:44:00.000Z",
  fase_torneo: "eliminatoria",
  fase_eliminacion: "cuartos",
  bracket_slots: null,
} as TorneoExpress;

const grupo: TorneoExpressGrupo = {
  id: "g1",
  torneo_id: "t1",
  nombre: "Grupo A",
  orden: 1,
  created_at: "",
};

function partido(
  cruce: number,
  createdAt: string
): TorneoExpressEliminatoriaPartido {
  return {
    id: `elim-${cruce}`,
    torneo_id: "t1",
    ronda: 1,
    orden: cruce + 1,
    cruce_index: cruce,
    pareja_local_id: `l${cruce}`,
    pareja_visitante_id: `v${cruce}`,
    puntos_local: null,
    puntos_visitante: null,
    ganador_id: null,
    estado: "pendiente",
    es_bye: false,
    programado_en: null,
    created_at: createdAt,
  };
}

describe("horario público de eliminatoria", () => {
  const createdAt = "2026-10-09T02:44:00.000Z";
  const partidos = [0, 1, 2, 3].map((i) => partido(i, createdAt));
  const bundle = {
    torneo,
    grupos: [grupo],
    parejasPorGrupo: {},
    partidosPorGrupo: {},
    eliminatoriaPartidos: partidos,
    clasificacion_modo: "dif_puntos" as const,
    partido_formato: "flexible" as const,
  };
  const labels = buildEliminatoriaLabelMap(bundle);

  it("no usa created_at como si fuera el horario programado", () => {
    const model = buildPublicBracketViewModel(bundle, labels);
    for (const card of model.currentRoundCards) {
      expect(card.horaDisplay).toMatch(/por confirmar/i);
      expect(card.scheduleMs).toBeNull();
      expect(card.status).toBe("pending");
    }
  });

  it("usa el inicio del evento, no la hora en que se publicó el cuadro", () => {
    jest
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2026-10-08T02:44:00.000Z"));
    const startAt = new Date("2026-10-09T14:00:00.000Z");
    const projected = projectEliminatoriaMatchSlots({
      fase: "cuartos",
      startAt,
      courts: ["1", "2", "3"],
      duraciones: { octavos: 60, cuartos: 60, semifinal: 60, final: 60 },
    });
    const model = buildPublicBracketViewModel(bundle, labels, {
      slots: projected.slots,
      timeZone: "America/Mexico_City",
    });
    const qf = model.currentRoundCards;
    expect(qf).toHaveLength(4);
    expect(qf[0].scheduleMs).toBe(Date.parse("2026-10-09T14:00:00.000Z"));
    expect(qf[3].scheduleMs).toBe(Date.parse("2026-10-09T15:00:00.000Z"));
    expect(qf[0].horaDisplay).toMatch(/vie/i);
    expect(qf[0].horaDisplay).toMatch(/9/);
    expect(qf[0].horaDisplay).toMatch(/oct/i);
    expect(qf[0].horaDisplay).toMatch(/08:00/);
    expect(qf[0].canchaLabel).toBe("Cancha 1");
    expect(qf.every((card) => card.status === "pending")).toBe(true);
  });
});
