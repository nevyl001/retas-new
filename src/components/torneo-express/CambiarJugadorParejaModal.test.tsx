import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CambiarJugadorParejaModal } from "./CambiarJugadorParejaModal";
import { getPlayers } from "../../lib/database";
import { changePairPlayer } from "../../services/torneoExpressGrupoOps";
import type {
  TorneoExpressGrupo,
  TorneoExpressGrupoPareja,
} from "../../lib/torneoExpress/types";

jest.mock("../../lib/database", () => ({
  getPlayers: jest.fn(),
}));

jest.mock("../../lib/rivieraJugadores/playersPoolCache", () => ({
  invalidatePlayersPool: jest.fn(),
}));

jest.mock("../jugadores/jugadoresGeneroNav", () => ({
  navigateJugadoresLista: jest.fn(),
}));

jest.mock("../../services/torneoExpressGrupoOps", () => {
  const actual = jest.requireActual("../../services/torneoExpressGrupoOps");
  return { ...actual, changePairPlayer: jest.fn() };
});

const grupo: TorneoExpressGrupo = {
  id: "g1",
  torneo_id: "t1",
  nombre: "Grupo F",
  orden: 1,
  version: 4,
  created_at: "2026-10-06T00:00:00Z",
};

const pareja: TorneoExpressGrupoPareja = {
  id: "gp1",
  grupo_id: "g1",
  pareja_id: "pair1",
  pareja_display: "Paco / Erick M",
  player1_id: "a",
  player2_id: "b",
  is_virtual: false,
  created_at: "2026-10-06T00:00:00Z",
};

describe("CambiarJugadorParejaModal", () => {
  beforeEach(() => {
    (getPlayers as jest.Mock).mockResolvedValue([
      { id: "a", name: "Paco" },
      { id: "b", name: "Erick M" },
      { id: "c", name: "Luis Nuevo" },
    ]);
  });

  it("cambia solo al jugador elegido y manda la versión del grupo", async () => {
    (changePairPlayer as jest.Mock).mockResolvedValue({
      parejaId: "pair1",
      mode: "in_place",
      version: 5,
    });
    const onChanged = jest.fn();
    const onClose = jest.fn();
    render(
      <CambiarJugadorParejaModal
        open
        userId="u1"
        grupos={[grupo]}
        parejasPorGrupo={{ g1: [pareja] }}
        occupiedPlayerIds={new Set(["a", "b"])}
        onClose={onClose}
        onChanged={onChanged}
        onStale={jest.fn()}
      />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Erick M" }));
    fireEvent.click(await screen.findByRole("option", { name: /Luis Nuevo/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cambiar jugador" }));

    await waitFor(() =>
      expect(changePairPlayer).toHaveBeenCalledWith({
        grupoId: "g1",
        parejaId: "pair1",
        outgoingPlayerId: "b",
        incomingPlayerId: "c",
        expectedVersion: 4,
      })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalled();
  });
});
