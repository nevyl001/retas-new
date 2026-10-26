import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoundHistory } from "./RoundHistory";
import type { AmericanoRound } from "../../lib/db/types";

const rounds: AmericanoRound[] = [
  {
    roundNumber: 1,
    phase: 1,
    benchPlayers: [],
    matches: [
      {
        id: "m1",
        court: 1,
        scoreA: 6,
        scoreB: 3,
        teamA: [
          { id: "a", name: "Ana", stats: { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0, roundsOnBench: 0 } },
          { id: "b", name: "Ana", stats: { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0, roundsOnBench: 0 } },
        ],
        teamB: [
          { id: "c", name: "Luis", stats: { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0, roundsOnBench: 0 } },
          { id: "d", name: "María", stats: { pointsFor: 0, pointsAgainst: 0, gamesPlayed: 0, roundsOnBench: 0 } },
        ],
      },
    ],
  },
];

describe("RoundHistory", () => {
  it("no muestra Corregir sin permiso de edición", () => {
    render(<RoundHistory rounds={rounds} />);
    expect(screen.queryByRole("button", { name: /corregir/i })).toBeNull();
    expect(screen.getAllByText("Ana")).toHaveLength(2);
  });

  it("solo anuncia éxito cuando la corrección se confirma", async () => {
    const user = userEvent.setup();
    const onEditScore = jest.fn().mockResolvedValue({
      ok: false,
      error: "El servidor rechazó el marcador.",
    });
    render(<RoundHistory rounds={rounds} onEditScore={onEditScore} />);
    await user.click(screen.getByRole("button", { name: /corregir/i }));
    const scoreA = screen.getByRole("textbox", { name: "Pareja A" });
    await user.clear(scoreA);
    await user.type(scoreA, "1");
    await user.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(onEditScore).toHaveBeenCalledWith(0, "m1", 1, 3);
    expect(screen.getByRole("alert").textContent).toMatch(/rechazó/);
    expect(screen.queryByText("Resultado corregido y ranking actualizado")).toBeNull();

    onEditScore.mockResolvedValueOnce({ ok: true });
    await user.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(await screen.findByText("Resultado corregido y ranking actualizado")).toBeTruthy();
  });

  it("pide confirmación extra si el americano ya finalizó", async () => {
    const user = userEvent.setup();
    const onEditScore = jest.fn();
    render(
      <RoundHistory rounds={rounds} phase="finished" onEditScore={onEditScore} />
    );
    await user.click(screen.getByRole("button", { name: /corregir/i }));
    await user.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(onEditScore).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/finalizado/);
  });
});
