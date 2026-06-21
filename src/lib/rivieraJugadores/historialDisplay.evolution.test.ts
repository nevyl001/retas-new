import {
  computeRankingEvolution,
  type RankingEvolutionPoint,
} from "./historialDisplay";
import type { JugadorParticipacion } from "./types";

function row(
  partial: Partial<JugadorParticipacion> & Pick<JugadorParticipacion, "fecha" | "puntos_obtenidos">
): JugadorParticipacion {
  return {
    id: partial.id ?? "1",
    jugador_id: partial.jugador_id ?? "j1",
    tipo_evento: partial.tipo_evento ?? "reta",
    evento_id: partial.evento_id ?? "e1",
    evento_nombre: partial.evento_nombre ?? "Evento",
    fecha: partial.fecha,
    resultado: partial.resultado ?? "participación",
    sets_favor: partial.sets_favor ?? 0,
    sets_contra: partial.sets_contra ?? 0,
    puntos_obtenidos: partial.puntos_obtenidos,
    pareja_con: partial.pareja_con ?? null,
    metadata: partial.metadata ?? {},
    created_at: partial.created_at ?? partial.fecha,
  };
}

describe("computeRankingEvolution", () => {
  it("acumula puntos en orden cronológico", () => {
    const points = computeRankingEvolution([
      row({ fecha: "2026-03-01", puntos_obtenidos: 100, evento_nombre: "Reta A" }),
      row({ id: "2", fecha: "2026-04-01", puntos_obtenidos: 140, evento_nombre: "Americano B" }),
    ]);

    expect(points).toHaveLength(2);
    expect(points[0].puntosAcumulados).toBe(100);
    expect(points[1].puntosAcumulados).toBe(240);
    expect(points[1].delta).toBe(140);
  });

  it("ignora ajustes manuales y eventos sin puntos", () => {
    const points = computeRankingEvolution([
      row({ fecha: "2026-01-01", puntos_obtenidos: 50 }),
      row({
        id: "2",
        fecha: "2026-01-02",
        puntos_obtenidos: 0,
        evento_nombre: "Sin puntos",
      }),
      row({
        id: "3",
        fecha: "2026-01-03",
        puntos_obtenidos: 25,
        evento_nombre: "Ajuste manual",
        metadata: { subtipo: "ajuste_manual" },
      }),
    ]);

    expect(points).toHaveLength(1);
    expect((points[0] as RankingEvolutionPoint).puntosAcumulados).toBe(50);
  });
});
