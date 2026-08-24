import {
  buildDraftScheduleMatches,
  buildGrupoAssignmentsFromBundle,
  mapScheduledMatchesToPartidoUpdates,
} from "./draftScheduleMatch";
import { assignRoundRobinSchedule } from "./assignRoundRobinSchedule";
import { validateScheduleInvariants } from "./scheduleInvariants";
import { partidoTimeInputValue24 } from "./teScheduleTime";
import type { TorneoExpressBundle, TorneoExpressPartido } from "./types";

function partido(
  id: string,
  grupoId: string,
  localId: string,
  visitId: string,
  ronda: number,
  orden: number
): TorneoExpressPartido {
  return {
    id,
    grupo_id: grupoId,
    pareja_local_id: localId,
    pareja_visitante_id: visitId,
    puntos_local: null,
    puntos_visitante: null,
    ganador_id: null,
    estado: "pendiente",
    ronda,
    orden,
    created_at: "2026-08-24T14:00:00.000Z",
  };
}

describe("reschedule mapping across groups", () => {
  it("reprograma todos los partidos pendientes de ambos grupos", () => {
    const g1 = "grupo-1";
    const g2 = "grupo-2";
    const bundle: Pick<
      TorneoExpressBundle,
      "grupos" | "parejasPorGrupo" | "partidosPorGrupo"
    > = {
      grupos: [
        { id: g1, torneo_id: "t1", nombre: "Grupo 1", orden: 0, created_at: "" },
        { id: g2, torneo_id: "t1", nombre: "Grupo 2", orden: 1, created_at: "" },
      ],
      parejasPorGrupo: {
        [g1]: [
          { id: "gp1", grupo_id: g1, pareja_id: "a1", created_at: "" },
          { id: "gp2", grupo_id: g1, pareja_id: "a2", created_at: "" },
          { id: "gp3", grupo_id: g1, pareja_id: "a3", created_at: "" },
          { id: "gp4", grupo_id: g1, pareja_id: "a4", created_at: "" },
        ],
        [g2]: [
          { id: "gp5", grupo_id: g2, pareja_id: "b1", created_at: "" },
          { id: "gp6", grupo_id: g2, pareja_id: "b2", created_at: "" },
          { id: "gp7", grupo_id: g2, pareja_id: "b3", created_at: "" },
          { id: "gp8", grupo_id: g2, pareja_id: "b4", created_at: "" },
        ],
      },
      partidosPorGrupo: {},
    };

    const assignments = buildGrupoAssignmentsFromBundle(bundle);
    const draft = buildDraftScheduleMatches(assignments);

    const scheduled = assignRoundRobinSchedule({
      matches: draft,
      courts: ["Estadio", "2"],
      date: "2026-08-24",
      startTime: "08:00",
      durationMinutes: 45,
    });
    validateScheduleInvariants(draft, scheduled);

    // Simula filas legacy con ronda/orden incorrectos en BD
    bundle.partidosPorGrupo = {
      [g1]: draft
        .filter((m) => m.groupKey === 0)
        .map((m, i) =>
          partido(`p1-${i}`, g1, m.parejaLocalId, m.parejaVisitanteId, 1, 1)
        ),
      [g2]: draft
        .filter((m) => m.groupKey === 1)
        .map((m, i) =>
          partido(`p2-${i}`, g2, m.parejaLocalId, m.parejaVisitanteId, 1, 1)
        ),
    };

    const updates = mapScheduledMatchesToPartidoUpdates(scheduled, bundle);
    expect(updates).toHaveLength(12);

    const g1Updates = updates.filter((u) => u.partidoId.startsWith("p1-"));
    const g2Updates = updates.filter((u) => u.partidoId.startsWith("p2-"));
    expect(g1Updates).toHaveLength(6);
    expect(g2Updates).toHaveLength(6);
  });

  it("con 45 min y 2 canchas, cada grupo queda en slots intercalados sin mezclar", () => {
    const g1 = "grupo-1";
    const g2 = "grupo-2";
    const draft = buildDraftScheduleMatches([
      {
        nombre: "Grupo 1",
        orden: 0,
        parejaIds: ["a1", "a2", "a3", "a4"],
      },
      {
        nombre: "Grupo 2",
        orden: 1,
        parejaIds: ["b1", "b2", "b3", "b4"],
      },
    ]);

    // BD legacy: ronda/orden incorrectos
    const bundle: Pick<
      TorneoExpressBundle,
      "grupos" | "partidosPorGrupo"
    > = {
      grupos: [
        { id: g1, torneo_id: "t1", nombre: "Grupo 1", orden: 0, created_at: "" },
        { id: g2, torneo_id: "t1", nombre: "Grupo 2", orden: 1, created_at: "" },
      ],
      partidosPorGrupo: {
        [g1]: draft
          .filter((m) => m.groupKey === 0)
          .map((m, i) =>
            partido(`p1-${i}`, g1, m.parejaLocalId, m.parejaVisitanteId, 1, 1)
          ),
        [g2]: draft
          .filter((m) => m.groupKey === 1)
          .map((m, i) =>
            partido(`p2-${i}`, g2, m.parejaLocalId, m.parejaVisitanteId, 1, 1)
          ),
      },
    };

    const scheduled = assignRoundRobinSchedule({
      matches: draft,
      courts: ["1", "Estadio"],
      date: "2026-08-24",
      startTime: "09:00",
      durationMinutes: 45,
    });
    validateScheduleInvariants(draft, scheduled);

    const updates = mapScheduledMatchesToPartidoUpdates(scheduled, bundle);
    expect(updates).toHaveLength(12);

    const g1Times = Array.from(
      new Set(
        updates
          .filter((u) => u.partidoId.startsWith("p1-"))
          .map((u) => partidoTimeInputValue24(u.programado_en))
      )
    ).sort();
    const g2Times = Array.from(
      new Set(
        updates
          .filter((u) => u.partidoId.startsWith("p2-"))
          .map((u) => partidoTimeInputValue24(u.programado_en))
      )
    ).sort();

    expect(g1Times).toEqual(["09:00", "09:45", "10:30"]);
    expect(g2Times).toEqual(["11:15", "12:00", "12:45"]);
    expect(updates.every((u) => u.ronda >= 1 && u.orden >= 1)).toBe(true);
  });
});
