import { resolveParticipacionOrganizadorId } from "./participacionesOrganizadorScope";
import type { JugadorParticipacion } from "./types";

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

    const row = {
      id: "part-1",
      jugador_id: "j1",
      evento_id: "e1",
      tipo_evento: "reta",
      puntos_obtenidos: 50,
      metadata: {},
    } as JugadorParticipacion;

    expect(resolveParticipacionOrganizadorId(row)).toBeNull();
    expect(resolveParticipacionOrganizadorId(row)).toBeNull();
    expect(resolveParticipacionOrganizadorId(row)).toBeNull();

    const orphanWarns = warnSpy.mock.calls.filter((c) =>
      String(c[0]).includes("participación huérfana")
    );
    expect(orphanWarns.length).toBeLessThanOrEqual(1);
  });

  it("con metadata.organizador_id no loguea", () => {
    const row = {
      id: "part-ok",
      jugador_id: "j1",
      evento_id: "e1",
      tipo_evento: "reta",
      puntos_obtenidos: 50,
      metadata: { organizador_id: "org-1" },
    } as JugadorParticipacion;

    expect(resolveParticipacionOrganizadorId(row)).toBe("org-1");
    expect(
      warnSpy.mock.calls.filter((c) =>
        String(c[0]).includes("participación huérfana")
      )
    ).toHaveLength(0);
  });
});
