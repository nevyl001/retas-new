import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { AsignarParejasGrupos } from "./AsignarParejasGrupos";
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
    virtualLabel: "Pareja por definir 1",
  },
];

describe("AsignarParejasGrupos con pareja virtual", () => {
  it("cuenta la virtual como una plaza y deja moverla de grupo", () => {
    const onTogglePair = jest.fn();
    const onAssignmentsChange = jest.fn();
    const view = render(
      <AsignarParejasGrupos
        parejas={PAREJAS}
        assignments={[
          { nombre: "Grupo A", orden: 0, parejaIds: ["real-1", "virtual-1"] },
          { nombre: "Grupo B", orden: 1, parejaIds: [] },
        ]}
        assignedIds={new Set(["real-1", "virtual-1"])}
        onAssignmentsChange={onAssignmentsChange}
        onTogglePair={onTogglePair}
      />
    );

    expect(screen.getByText("2 parejas en este grupo")).toBeTruthy();
    expect(screen.getAllByText("Pareja por definir 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("POR DEFINIR").length).toBeGreaterThan(0);

    const inGroupA = screen.getAllByRole("button", { name: "Pareja por definir 1" })[0];
    fireEvent.click(inGroupA);
    expect(onTogglePair).toHaveBeenCalledWith(0, "virtual-1");

    view.rerender(
      <AsignarParejasGrupos
        parejas={PAREJAS}
        assignments={[
          { nombre: "Grupo A", orden: 0, parejaIds: ["real-1"] },
          { nombre: "Grupo B", orden: 1, parejaIds: ["virtual-1"] },
        ]}
        assignedIds={new Set(["real-1", "virtual-1"])}
        onAssignmentsChange={onAssignmentsChange}
        onTogglePair={onTogglePair}
      />
    );

    const buttons = screen.getAllByRole("button", { name: "Pareja por definir 1" });
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
  });
});
