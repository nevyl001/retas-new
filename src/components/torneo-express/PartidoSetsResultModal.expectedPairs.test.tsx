import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PartidoSetsResultModal } from "./PartidoSetsResultModal";
import { TorneoExpressComposicionCambiadaError } from "../../services/torneoExpressService";
import type { ExpectedPairs } from "../../lib/torneoExpress/types";

const JUAN_PEDRO: ExpectedPairs = {
  local: { pair_id: "local", player1_id: "juan", player2_id: "pedro", is_virtual: false },
  visitante: { pair_id: "visit", player1_id: "luis", player2_id: "mario", is_virtual: false },
};

const JUAN_CARLOS: ExpectedPairs = {
  local: { pair_id: "local", player1_id: "juan", player2_id: "carlos", is_virtual: false },
  visitante: { pair_id: "visit", player1_id: "luis", player2_id: "mario", is_virtual: false },
};

describe("PartidoSetsResultModal expectedPairs", () => {
  it("guarda el snapshot de la apertura aunque después cambie la prop", async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    const view = render(
      <PartidoSetsResultModal
        open
        onClose={onClose}
        localLabel="Juan / Pedro"
        visitLabel="Luis / Mario"
        initialPartido={{ estado: "pendiente" }}
        expectedPairs={JUAN_PEDRO}
        onSave={onSave}
      />
    );

    view.rerender(
      <PartidoSetsResultModal
        open
        onClose={onClose}
        localLabel="Juan / Carlos"
        visitLabel="Luis / Mario"
        initialPartido={{ estado: "pendiente" }}
        expectedPairs={JUAN_CARLOS}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "6" } });
    fireEvent.change(screen.getAllByRole("textbox")[1], { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar resultado" }));

    expect(onSave).toHaveBeenCalledWith(
      [{ local: 6, visitante: 4 }],
      JUAN_PEDRO
    );
  });

  it("si la composición cambió, cierra el formulario y no muestra un aviso de sobrescribir", async () => {
    const onSave = jest.fn().mockRejectedValue(new TorneoExpressComposicionCambiadaError());
    const onClose = jest.fn();
    const alert = jest.spyOn(window, "alert").mockImplementation(() => undefined);

    render(
      <PartidoSetsResultModal
        open
        onClose={onClose}
        localLabel="Juan / Pedro"
        visitLabel="Luis / Mario"
        initialPartido={{ estado: "pendiente" }}
        expectedPairs={JUAN_PEDRO}
        onSave={onSave}
      />
    );

    fireEvent.change(screen.getAllByRole("textbox")[0], { target: { value: "6" } });
    fireEvent.change(screen.getAllByRole("textbox")[1], { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar resultado" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
