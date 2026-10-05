import React from "react";
import { readFileSync } from "fs";
import path from "path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TeProgramacionMenu } from "./TeProgramacionMenu";
import { TeReiniciarFaseGruposAction } from "./TeReiniciarFaseGruposAction";
import { resetGroup } from "../../services/torneoExpressGrupoOps";
import { puedeReiniciarFaseDeGrupos } from "../../lib/torneoExpress/resetFaseGrupos";

jest.mock("../../services/torneoExpressGrupoOps", () => ({
  resetGroup: jest.fn(),
}));

const resetGroupMock = resetGroup as jest.Mock;

const grupos = [
  { id: "g2", orden: 2, version: 4 },
  { id: "g1", orden: 1, version: 3 },
];

function renderAction(overrides?: Partial<React.ComponentProps<typeof TeReiniciarFaseGruposAction>>) {
  const onReload = jest.fn().mockResolvedValue(undefined);
  const onDone = jest.fn();
  render(
    <TeReiniciarFaseGruposAction
      grupos={grupos}
      onReload={onReload}
      onDone={onDone}
      {...overrides}
    />
  );
  return { onReload, onDone };
}

function openConfirm() {
  fireEvent.click(screen.getByRole("button", { name: "Reiniciar fase de grupos" }));
}

describe("puedeReiniciarFaseDeGrupos", () => {
  it("está disponible en fase de grupos sin eliminatoria", () => {
    expect(
      puedeReiniciarFaseDeGrupos({
        faseTorneo: "grupos",
        estado: "en_curso",
        eliminatoriaCount: 0,
        gruposCount: 2,
      })
    ).toBe(true);
  });

  it("se oculta en eliminatoria, cerrado, finalizado o si ya hay cuadro", () => {
    expect(
      puedeReiniciarFaseDeGrupos({
        faseTorneo: "eliminatoria",
        estado: "en_curso",
        eliminatoriaCount: 0,
        gruposCount: 1,
      })
    ).toBe(false);
    expect(
      puedeReiniciarFaseDeGrupos({
        faseTorneo: "cerrado",
        estado: "en_curso",
        eliminatoriaCount: 0,
        gruposCount: 1,
      })
    ).toBe(false);
    expect(
      puedeReiniciarFaseDeGrupos({
        faseTorneo: "grupos",
        estado: "finalizado",
        eliminatoriaCount: 0,
        gruposCount: 1,
      })
    ).toBe(false);
    expect(
      puedeReiniciarFaseDeGrupos({
        faseTorneo: "grupos",
        estado: "en_curso",
        eliminatoriaCount: 1,
        gruposCount: 1,
      })
    ).toBe(false);
  });
});

describe("TeReiniciarFaseGruposAction", () => {
  beforeEach(() => {
    resetGroupMock.mockReset();
    resetGroupMock.mockResolvedValue({ matchesReset: 1, ratingsReverted: 1, version: 2 });
  });

  it("abre la confirmación y cancelar no llama al reset", () => {
    renderAction();
    expect(screen.getByRole("button", { name: "Reiniciar fase de grupos" })).toBeTruthy();
    openConfirm();
    expect(screen.getByRole("dialog", { name: "Reiniciar fase de grupos" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(resetGroupMock).not.toHaveBeenCalled();
  });

  it("confirmar llama reset_torneo_express_grupo por cada grupo, en orden", async () => {
    const { onReload, onDone } = renderAction();
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar fase" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(resetGroupMock).toHaveBeenNthCalledWith(1, { grupoId: "g1", expectedVersion: 3 });
    expect(resetGroupMock).toHaveBeenNthCalledWith(2, { grupoId: "g2", expectedVersion: 4 });
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("un segundo click mientras corre no vuelve a llamar", async () => {
    let release: (value: unknown) => void = () => undefined;
    resetGroupMock.mockImplementation(
      () => new Promise((resolve) => { release = resolve; })
    );
    renderAction({ grupos: [{ id: "g1", orden: 1, version: 3 }] });
    openConfirm();
    const confirm = screen.getByRole("button", { name: "Reiniciar fase" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(resetGroupMock).toHaveBeenCalledTimes(1);
    release({ matchesReset: 0, ratingsReverted: 0, version: 4 });
    await waitFor(() => expect(resetGroupMock).toHaveBeenCalledTimes(1));
  });

  it("un error se muestra y no cierra el modal", async () => {
    resetGroupMock.mockRejectedValue(Object.assign(new Error("GROUP_NOT_EDITABLE"), {
      code: "GROUP_NOT_EDITABLE",
      name: "TorneoExpressGrupoOpError",
    }));
    const { onDone } = renderAction();
    openConfirm();
    fireEvent.click(screen.getByRole("button", { name: "Reiniciar fase" }));
    expect((await screen.findByRole("alert")).textContent).toContain("ya tiene eliminatoria");
    expect(screen.getByRole("dialog", { name: "Reiniciar fase de grupos" })).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("no mete el reinicio dentro de Editar programación", () => {
    render(
      <>
        <TeProgramacionMenu
          onProgramarFaltantes={jest.fn()}
          onReorganizar={jest.fn()}
          onEditarCalendario={jest.fn()}
        />
        <TeReiniciarFaseGruposAction grupos={grupos} onReload={jest.fn()} onDone={jest.fn()} />
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar programación" }));
    const items = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Programar faltantes",
      "Reorganizar pendientes",
      "Editar calendario",
    ]);
  });

  it("la gestión lo monta en el header y en Config.", () => {
    const source = readFileSync(
      path.join(__dirname, "GestionGrupos.tsx"),
      "utf8"
    );
    expect(source.split("{renderReiniciarFase()}").length - 1).toBe(2);
    expect(source).toContain("<TeReiniciarFaseGruposAction");
    expect(source).toContain("puedeReiniciarFaseDeGrupos");
    expect(source).toContain('id="configuracion"');
    expect(source).toContain("te-gestion-header__actions");
  });
});
