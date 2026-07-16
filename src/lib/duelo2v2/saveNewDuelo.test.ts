import { saveNewDuelo2v2 } from "./saveNewDuelo";
import { clearDuelo2v2CreateSession } from "./duelo2v2CreateDraft";

jest.mock("./duelo2v2CreateDraft", () => ({
  clearDuelo2v2CreateSession: jest.fn(),
}));

describe("saveNewDuelo2v2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("crea fila nueva, limpia sesión y navega a Gestionar", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "duelo-nuevo-99",
      nombre: "Nuevo encuentro",
      estado: "configuracion",
    });
    const navigate = jest.fn();
    const gestionarPath = (id: string) => `/duelo-2v2/${id}/gestionar`;

    await saveNewDuelo2v2(
      {
        organizadorId: "org-1",
        nombre: "Nuevo encuentro",
        cancha: "1",
        draftDate: "2026-07-20",
        draftTimeStart: "15:00",
        draftTimeEnd: "17:00",
      },
      { createDuelo2v2OpenDraft: create, navigate, gestionarPath }
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: "Nuevo encuentro",
        cancha: "1",
      })
    );
    expect(clearDuelo2v2CreateSession).toHaveBeenCalledWith("org-1");
    expect(navigate).toHaveBeenCalledWith(
      "/duelo-2v2/duelo-nuevo-99/gestionar"
    );
  });

  it("no reutiliza openDueloId (create sin existingId)", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "fresh-1",
      nombre: "X",
      estado: "configuracion",
    });
    await saveNewDuelo2v2(
      {
        organizadorId: "org-1",
        nombre: "X",
        cancha: "1",
        draftDate: "2026-07-20",
        draftTimeStart: "15:00",
        draftTimeEnd: "17:00",
      },
      {
        createDuelo2v2OpenDraft: create,
        navigate: jest.fn(),
        gestionarPath: (id) => `/duelo-2v2/${id}/gestionar`,
      }
    );
    expect(create.mock.calls[0]).toHaveLength(1);
    expect(create.mock.calls[0][0]).not.toHaveProperty("existingId");
  });

  it("dos llamadas paralelas: cada una invoca create (lock es responsabilidad UI)", async () => {
    const create = jest.fn().mockResolvedValue({
      id: "once-1",
      nombre: "Idempotente",
      estado: "configuracion",
    });
    const deps = {
      createDuelo2v2OpenDraft: create,
      navigate: jest.fn(),
      gestionarPath: (id: string) => `/duelo-2v2/${id}/gestionar`,
    };
    const form = {
      organizadorId: "org-1",
      nombre: "Idempotente",
      cancha: "1",
      draftDate: "2026-07-20",
      draftTimeStart: "15:00",
      draftTimeEnd: "17:00",
    };
    await Promise.all([saveNewDuelo2v2(form, deps), saveNewDuelo2v2(form, deps)]);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
