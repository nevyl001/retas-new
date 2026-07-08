import { resolveParticipacionOrganizadorId } from "./participacionesOrganizadorScope";
import type { JugadorParticipacion } from "./types";

function participacion(
  partial: Pick<JugadorParticipacion, "jugador_id" | "evento_id" | "tipo_evento"> &
    Partial<JugadorParticipacion>
): JugadorParticipacion {
  return {
    id: partial.id ?? "part-id",
    evento_nombre: partial.evento_nombre ?? "Evento test",
    fecha: partial.fecha ?? "2026-07-08",
    pareja_con: partial.pareja_con ?? null,
    resultado: partial.resultado ?? "victoria",
    sets_favor: partial.sets_favor ?? 0,
    sets_contra: partial.sets_contra ?? 0,
    puntos_obtenidos: partial.puntos_obtenidos ?? 0,
    metadata: partial.metadata ?? {},
    created_at: partial.created_at ?? "2026-07-08T00:00:00Z",
    ...partial,
  };
}

describe("resolveParticipacionOrganizadorId logging", () => {
  const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

  afterAll(() => {
    warnSpy.mockRestore();
  });

  beforeEach(() => {
    warnSpy.mockClear();
  });

  it("no spamea: misma huérfana se loguea como máximo una vez (dev)", () => {
    if (process.env.NODE_ENV === "production") return;

    const row = participacion({
      id: "part-1",
      jugador_id: "j1",
      evento_id: "e1",
      tipo_evento: "reta",
      puntos_obtenidos: 50,
      metadata: {},
    });

    expect(resolveParticipacionOrganizadorId(row)).toBeNull();
    expect(resolveParticipacionOrganizadorId(row)).toBeNull();
    expect(resolveParticipacionOrganizadorId(row)).toBeNull();

    const orphanWarns = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes("participación huérfana")
    );
    expect(orphanWarns.length).toBeLessThanOrEqual(1);
  });

  it("con metadata.organizador_id no loguea", () => {
    const row = participacion({
      id: "part-ok",
      jugador_id: "j1",
      evento_id: "e1",
      tipo_evento: "reta",
      puntos_obtenidos: 50,
      metadata: { organizador_id: "org-1" },
    });

    expect(resolveParticipacionOrganizadorId(row)).toBe("org-1");
    expect(
      warnSpy.mock.calls.filter((c) =>
        String(c[0]).includes("participación huérfana")
      )
    ).toHaveLength(0);
  });
});
