import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArmarParejasPicker } from "./ArmarParejasPicker";
import type { DraftTournamentPair } from "../../lib/torneoExpress/virtualPairDraft";
import type { Player } from "../../lib/database";

function player(id: string, name: string): Player {
  return { id, name, email: "", created_at: "" };
}

const PAREJAS: DraftTournamentPair[] = [
  {
    kind: "real",
    id: "real-1",
    jugador1: player("j1", "Juan"),
    jugador2: player("j2", "Pedro"),
  },
  {
    kind: "virtual",
    id: "virtual-1",
    virtualLabel: "Pareja por definir 2",
  },
];

describe("ArmarParejasPicker pareja virtual", () => {
  it("lista real y virtual, borra la virtual y permite editar su label", () => {
    const onEliminarPareja = jest.fn();
    const onRenombrarParejaVirtual = jest.fn();
    render(
      <ArmarParejasPicker
        jugadoresPool={[]}
        parejas={PAREJAS}
        addingPair={false}
        onFormarPareja={jest.fn()}
        onAgregarParejaVirtual={jest.fn()}
        onRenombrarParejaVirtual={onRenombrarParejaVirtual}
        onEliminarPareja={onEliminarPareja}
      />
    );

    expect(screen.getByText("Juan")).toBeTruthy();
    expect(screen.getByText("Pedro")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Parejas armadas \(2\)/ })).toBeTruthy();
    expect(screen.getByDisplayValue("Pareja por definir 2")).toBeTruthy();
    expect(screen.getByText("POR DEFINIR")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Borrar Pareja por definir 2" }));
    expect(onEliminarPareja).toHaveBeenCalledWith(PAREJAS[1]);

    const input = screen.getByLabelText("Nombre de la pareja virtual");
    fireEvent.change(input, { target: { value: "Clasificado Qualy" } });
    fireEvent.blur(input);
    expect(onRenombrarParejaVirtual).toHaveBeenCalledWith(
      "virtual-1",
      "Clasificado Qualy"
    );
  });
});
