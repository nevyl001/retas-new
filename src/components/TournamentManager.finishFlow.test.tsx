/**
 * @jest-environment jsdom
 *
 * Regresiones del incidente de cierre de retas (2026-08-05):
 *  1. Finalizar compartía el estado `loading` con la lista → un cierre lento
 *     dejaba toda la vista en "Cargando retas…" sin salida.
 *  2. Doble click / doble submit disparaba el pipeline dos veces.
 *  3. Los errores se mostraban como "[object Object]".
 *  4. Si el cierre fallaba, la lista quedaba desactualizada.
 */
import React from "react";
// setupTests.ts no carga jest-dom globalmente; se importa aquí para no
// modificar el setup compartido por toda la suite.
import "@testing-library/jest-dom";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getMatches, getPairs, updateTournament } from "../lib/database";
import { finalizeCareerEvent } from "../lib/rivieraJugadores/careerEventPipeline";
import { loadUserRetasForHome } from "../lib/retasList";
import { TournamentManager } from "./TournamentManager";

jest.mock("../club-experience", () => ({
  useClubModeEyebrow: () => "Club Test",
}));

jest.mock("../contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "org-1" } }),
}));

jest.mock("../services/duelo2v2Service", () => ({
  archiveDuelo2v2: jest.fn(),
  getDuelos2v2: jest.fn().mockResolvedValue([]),
}));

jest.mock("./duelo-2v2/duelo2v2Nav", () => ({
  duelo2v2GestionarPath: jest.fn(),
  navigateDuelo2v2: jest.fn(),
}));

jest.mock("../lib/database", () => ({
  archiveTournament: jest.fn().mockResolvedValue(undefined),
  getMatches: jest.fn().mockResolvedValue([]),
  getPairs: jest.fn().mockResolvedValue([]),
  updateTournament: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/rivieraJugadores/careerEventPipeline", () => ({
  finalizeCareerEvent: jest.fn(),
  formatCareerPipelineFailureMessage: (
    result: { failures?: { message: string }[] },
    name: string
  ) =>
    `No se pudo cerrar «${name}»: ${(result.failures ?? [])
      .map((f) => f.message)
      .join("; ")}`,
  formatCareerPipelineSuccessMessage: (_r: unknown, name: string) =>
    `Reta «${name}» finalizada`,
}));

jest.mock("../lib/retasList", () => ({
  ...jest.requireActual("../lib/retasList"),
  loadUserRetasForHome: jest.fn(),
}));

const mockLoadRetas = loadUserRetasForHome as jest.Mock;
const mockFinalize = finalizeCareerEvent as jest.Mock;
const mockUpdateTournament = updateTournament as jest.Mock;

const RETA = {
  id: "reta-1",
  name: "Batalla Equipos",
  description: null,
  courts: 2,
  is_started: true,
  is_finished: false,
  user_id: "org-1",
  created_at: "2026-08-01T10:00:00.000Z",
  updated_at: "2026-08-01T10:00:00.000Z",
  format: "teams",
};

function retaItem(overrides: Record<string, unknown> = {}) {
  return [{ kind: "tournament" as const, tournament: { ...RETA, ...overrides } }];
}

function okResult() {
  return {
    ok: true,
    processed: true,
    resultSaved: true,
    careerSynced: true,
    touchedJugadorIds: ["j1"],
    failures: [],
    criticalFailures: [],
    warnings: [],
    durationMs: 10,
    context: {
      kind: "reta",
      organizadorId: "org-1",
      hostOrganizadorId: "org-1",
      eventoId: "reta-1",
      tipoEvento: "reta",
    },
  };
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadRetas.mockResolvedValue(retaItem());
  (getPairs as jest.Mock).mockResolvedValue([]);
  (getMatches as jest.Mock).mockResolvedValue([]);
  mockUpdateTournament.mockResolvedValue(undefined);
  jest.spyOn(window, "confirm").mockReturnValue(true);
  alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderManager() {
  return render(
    <TournamentManager onTournamentSelect={jest.fn()} />
  );
}

async function findFinishButton() {
  return screen.findByRole("button", { name: /^Finalizar$/ });
}

describe("Finalizar reta — resiliencia de UI", () => {
  it("no muestra «Cargando retas…» mientras finaliza (spinner sin salida)", async () => {
    let resolvePipeline: (v: unknown) => void = () => {};
    mockFinalize.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePipeline = resolve;
        })
    );

    renderManager();
    const button = await findFinishButton();

    await userEvent.click(button);

    // Cierre en vuelo: la lista sigue visible, el botón indica progreso.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Finalizando…" })).toBeDisabled();
    });
    expect(screen.queryByText(/Cargando retas/)).not.toBeInTheDocument();
    expect(screen.getByText("Batalla Equipos")).toBeInTheDocument();

    await act(async () => {
      resolvePipeline(okResult());
    });

    await waitFor(() => {
      expect(mockUpdateTournament).toHaveBeenCalledWith("reta-1", {
        is_finished: true,
      });
    });
  });

  it("ignora el doble click: ejecuta el pipeline una sola vez", async () => {
    let resolvePipeline: (v: unknown) => void = () => {};
    mockFinalize.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePipeline = resolve;
        })
    );

    renderManager();
    const button = await findFinishButton();

    // Dos clicks seguidos sobre el mismo botón.
    await userEvent.click(button);
    await userEvent.click(button).catch(() => {});

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Finalizando…" })).toBeDisabled();
    });
    expect(mockFinalize).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePipeline(okResult());
    });

    await waitFor(() => expect(mockUpdateTournament).toHaveBeenCalledTimes(1));
  });

  it("muestra el mensaje real de un PostgrestError, nunca [object Object]", async () => {
    // Objeto plano de PostgREST: el caso que producía "[object Object]".
    mockFinalize.mockRejectedValue({
      code: "PGRST202",
      message: "Could not find the function in the schema cache",
      hint: "Perhaps you meant registrar_participacion_jugador",
    });

    renderManager();
    await userEvent.click(await findFinishButton());

    const alerted = await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
      return String(alertSpy.mock.calls[0][0]);
    });

    expect(alerted).not.toContain("[object Object]");
    expect(alerted).toContain("Could not find the function in the schema cache");

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).not.toContain("[object Object]");
    expect(banner.textContent).toContain(
      "Could not find the function in the schema cache"
    );
  });

  it("indica que se puede reintentar y no pierde los resultados", async () => {
    mockFinalize.mockRejectedValue(new Error("red inestable"));

    renderManager();
    await userEvent.click(await findFinishButton());

    const alerted = await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
      return String(alertSpy.mock.calls[0][0]);
    });

    expect(alerted).toMatch(/no se pierden/i);
    expect(alerted).toMatch(/volver a pulsar\s+Finalizar/i);
  });

  it("tras un fallo recarga la lista para reflejar el estado real del backend", async () => {
    mockFinalize.mockRejectedValue(new Error("timeout"));
    // El backend sí terminó: al recargar, la reta ya aparece finalizada.
    mockLoadRetas
      .mockResolvedValueOnce(retaItem())
      .mockResolvedValueOnce(retaItem({ is_finished: true }));

    renderManager();
    await userEvent.click(await findFinishButton());

    await waitFor(() => expect(mockLoadRetas).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /^Finalizar$/ })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^Reparar historial$/ })
      ).toBeInTheDocument();
    });
  });

  it("reta ya cerrada: Reparar historial reintenta pipeline sin update is_finished", async () => {
    mockLoadRetas.mockResolvedValue(retaItem({ is_finished: true }));
    mockFinalize
      .mockResolvedValueOnce({
        ...okResult(),
        ok: false,
        careerSynced: false,
        criticalFailures: [{ code: "x", message: "fail" }],
        failures: [{ code: "x", message: "fail" }],
      })
      .mockResolvedValueOnce(okResult());

    renderManager();
    const repair = await screen.findByRole("button", {
      name: /^Reparar historial$/,
    });
    await userEvent.click(repair);
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(mockUpdateTournament).not.toHaveBeenCalled();

    const retry = await screen.findByRole("button", {
      name: /^Reparar historial$/,
    });
    await userEvent.click(retry);
    await waitFor(() => {
      expect(mockFinalize).toHaveBeenCalledTimes(2);
    });
    expect(mockUpdateTournament).not.toHaveBeenCalled();
  });

  it("permite reintentar después de un error y cerrar correctamente", async () => {
    mockFinalize
      .mockRejectedValueOnce(new Error("fallo transitorio"))
      .mockResolvedValueOnce(okResult());

    renderManager();
    await userEvent.click(await findFinishButton());
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());

    // El botón vuelve a estar disponible: el cierre es reintentable.
    const retry = await findFinishButton();
    expect(retry).toBeEnabled();

    await userEvent.click(retry);

    await waitFor(() => {
      expect(mockUpdateTournament).toHaveBeenCalledWith("reta-1", {
        is_finished: true,
      });
    });
    expect(mockFinalize).toHaveBeenCalledTimes(2);
  });

  it("apaga el spinner de la lista aunque la carga falle", async () => {
    mockLoadRetas.mockRejectedValue({ message: "network request failed" });

    renderManager();

    await waitFor(() => {
      expect(screen.queryByText(/Cargando retas/)).not.toBeInTheDocument();
    });
    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain("network request failed");
    expect(banner.textContent).not.toContain("[object Object]");
  });
});
