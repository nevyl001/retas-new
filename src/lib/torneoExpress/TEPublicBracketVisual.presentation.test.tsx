import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TEPublicBracketVisual } from "../../components/torneo-express/public/TEPublicBracketVisual";
import { getJugadorInitials } from "../../components/jugadores/JugadorAvatar";
import { RONDA_TERCER_LUGAR } from "./bracketRounds";
import type { PublicMatchupCard } from "./publicBracketModel";

function card(
  id: string,
  ronda: number,
  cruceIndex: number,
  localLabel: string,
  visitLabel: string
): PublicMatchupCard {
  return {
    id,
    ronda,
    cruceIndex,
    roundLabel: ronda === 1 ? "Cuartos de final" : ronda === 2 ? "Semifinal" : "Final",
    matchTitle: `MATCH ${cruceIndex + 1}`,
    local: {
      parejaId: `${id}-l`,
      label: localLabel,
      seed: 1,
      originBadge: null,
      isBye: false,
      isWinner: false,
      score: null,
    },
    visit: {
      parejaId: `${id}-v`,
      label: visitLabel,
      seed: 2,
      originBadge: null,
      isBye: false,
      isWinner: false,
      score: null,
    },
    status: "pending",
    horaDisplay: "13:50",
    scheduleMs: null,
    puntosLocal: null,
    puntosVisitante: null,
    sets: [],
    canchaLabel: "3",
  };
}

describe("TEPublicBracketVisual presentation", () => {
  const cards = [
    card("q1", 1, 0, "Carlos Méndez / Diego Ramírez", "Ana Ruiz / Eva López"),
    card("q2", 1, 1, "Luis Pérez / Mario Soto", "Nora Díaz / Paz Luna"),
    card("q3", 1, 2, "A1 / A2", "B1 / B2"),
    card("q4", 1, 3, "C1 / C2", "D1 / D2"),
  ];

  it("derives player-specific initials instead of a generic first letter", () => {
    expect(getJugadorInitials("Carlos Méndez")).toBe("CM");
    expect(getJugadorInitials("Diego Ruiz")).toBe("DR");
    expect(getJugadorInitials("Tpvs1")).toBe("T1");
    expect(getJugadorInitials("Tpvs11")).toBe("T11");
  });

  it("renders both pair names without decorative VS labels", () => {
    render(
      <TEPublicBracketVisual
        allCards={cards}
        totalRondas={3}
        activeRonda={1}
      />
    );

    expect(screen.getAllByText("Carlos Méndez").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Diego Ramírez").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^VS$/)).toBeNull();
  });

  it("binds each active semifinal portrait to its stable player identity", () => {
    const semifinals = [
      {
        ...card("s1", 1, 0, "Carlos Méndez / Diego Ramírez", "Luis Pérez / Mario Soto"),
        roundLabel: "Semifinal",
      },
      {
        ...card("s2", 1, 1, "Ana Ruiz / Eva López", "Nora Díaz / Paz Luna"),
        roundLabel: "Semifinal",
      },
    ];

    render(
      <TEPublicBracketVisual
        allCards={semifinals}
        totalRondas={2}
        activeRonda={1}
        pairPlayersById={{
          "s1-l": [
            {
              id: "player-carlos",
              name: "Carlos Méndez",
              fotoUrl: "https://cdn.example/carlos.jpg",
              rating: 3.17,
            },
            {
              id: "player-diego",
              name: "Diego Ramírez",
              fotoUrl: null,
              rating: 3.09,
            },
          ],
        }}
      />
    );

    expect(screen.getAllByLabelText(/^Jugador /)).toHaveLength(8);
    expect(screen.getByLabelText("Jugador Carlos Méndez")).toHaveAttribute(
      "data-player-id",
      "player-carlos"
    );
    expect(screen.getByLabelText("Jugador Carlos Méndez")).toHaveAttribute(
      "data-photo-state",
      "provided"
    );
    expect(
      screen.getByRole("img", { name: "Foto de Carlos Méndez" })
    ).toHaveAttribute("src", "https://cdn.example/carlos.jpg");
    expect(screen.queryByRole("img", { name: "Foto de Diego Ramírez" })).toBeNull();
    expect(screen.getByText("DR")).toBeInTheDocument();
  });

  it("exposes each pair score as its own scoreboard rail", () => {
    const semifinal = {
      ...card("s1", 1, 0, "Carlos Méndez / Diego Ramírez", "Luis Pérez / Mario Soto"),
      roundLabel: "Semifinal",
      status: "finished" as const,
      sets: [
        { local: 6, visitante: 2 },
        { local: 6, visitante: 4 },
      ],
    };

    render(
      <TEPublicBracketVisual
        allCards={[semifinal]}
        totalRondas={2}
        activeRonda={1}
      />
    );

    expect(
      screen.getByRole("group", {
        name: "Marcador de Carlos Méndez / Diego Ramírez: 6, 6",
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", {
        name: "Marcador de Luis Pérez / Mario Soto: 2, 4",
      })
    ).toBeInTheDocument();
  });

  const renderStage = (
    allCards: PublicMatchupCard[],
    totalRondas = 3,
    activeRonda?: number
  ) => {
    render(
      <TEPublicBracketVisual
        allCards={allCards}
        totalRondas={totalRondas}
        activeRonda={activeRonda}
      />
    );
  };

  it("shows only quarterfinals until a real semifinal exists", () => {
    renderStage(cards, 3, 1);
    expect(screen.getByText(/^CUARTOS DE FINAL$/)).toBeInTheDocument();
    expect(screen.getAllByText(/^QF[1-4]$/)).toHaveLength(4);
    expect(screen.queryByText(/^SEMIFINALES$/)).toBeNull();
    expect(screen.queryByText(/^GRAN FINAL$/)).toBeNull();
  });

  it("keeps finished quarterfinals visible while semifinals are unavailable", () => {
    const finishedQf = cards.map((match) => ({
      ...match,
      status: "finished" as const,
      local: { ...match.local, isWinner: true },
    }));
    renderStage(finishedQf, 3, 1);
    expect(screen.getByText(/^CUARTOS DE FINAL$/)).toBeInTheDocument();
    expect(screen.queryByText(/^SEMIFINALES$/)).toBeNull();
  });

  it("keeps quarterfinals as compact history beneath real semifinals", () => {
    const progressedCards = [
      ...cards.map((match) => ({
        ...match,
        status: "finished" as const,
        local: { ...match.local, isWinner: true },
      })),
      card("s1", 2, 0, "Carlos Méndez / Diego Ramírez", "Luis Pérez / Mario Soto"),
      card("s2", 2, 1, "Ana Ruiz / Eva López", "Nora Díaz / Paz Luna"),
    ];
    renderStage(progressedCards, 3, 2);
    expect(screen.getByText(/^SEMIFINALES$/)).toBeInTheDocument();
    expect(
      screen.getByText(/^Felicidades, semifinalistas\.$/)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^SF[1-2]$/)).toHaveLength(2);
    expect(screen.getByText(/^CUARTOS DE FINAL$/)).toBeInTheDocument();
    expect(screen.getAllByText(/^QF[1-4]$/)).toHaveLength(4);
    expect(screen.queryByText(/^GRAN FINAL$/)).toBeNull();
    expect(
      screen.getAllByText(/^Felicidades, semifinalistas\.$/)
    ).toHaveLength(1);
    expect(screen.getByRole("article", { name: /^SF1:/ })).toHaveAttribute(
      "data-variant",
      "semifinal"
    );
    expect(screen.getByRole("article", { name: /^QF1:/ })).toHaveAttribute(
      "data-variant",
      "history"
    );
  });

  it("keeps finished semifinals visible while the final is unavailable", () => {
    const finishedSemis = [
      {
        ...card("s1", 2, 0, "Carlos Méndez / Diego Ramírez", "Luis Pérez / Mario Soto"),
        status: "finished" as const,
      },
      {
        ...card("s2", 2, 1, "Ana Ruiz / Eva López", "Nora Díaz / Paz Luna"),
        status: "finished" as const,
      },
    ];
    renderStage(finishedSemis, 3, 2);
    expect(screen.getByText(/^SEMIFINALES$/)).toBeInTheDocument();
    expect(screen.queryByText(/^GRAN FINAL$/)).toBeNull();
  });

  it("keeps previous stages as history while the final owns the current stage", () => {
    const finalCards = [
      card("s1", 2, 0, "Carlos Méndez / Diego Ramírez", "Luis Pérez / Mario Soto"),
      card("s2", 2, 1, "Ana Ruiz / Eva López", "Nora Díaz / Paz Luna"),
      {
        ...card("f1", 3, 0, "Carlos Méndez / Diego Ramírez", "Ana Ruiz / Eva López"),
        status: "finished" as const,
        local: {
          ...card("f1", 3, 0, "Carlos Méndez / Diego Ramírez", "Ana Ruiz / Eva López")
            .local,
          isWinner: true,
        },
      },
    ].map((match, index) =>
      index < 2
        ? {
            ...match,
            status: "finished" as const,
            local: { ...match.local, isWinner: true },
          }
        : match
    );

    renderStage(finalCards, 3, 3);
    expect(screen.getByText(/^RESULTADO FINAL$/)).toBeInTheDocument();
    expect(screen.getByLabelText("Campeones")).toBeInTheDocument();
    expect(screen.getAllByText(/^CAMPEONES$/)).toHaveLength(1);
    expect(screen.getByRole("article", { name: /^Final:/ })).toHaveAttribute(
      "data-variant",
      "final"
    );
    expect(screen.getByText(/^SEMIFINALES$/)).toBeInTheDocument();
  });

  it("keeps the real third-place match secondary to the visible final", () => {
    const final = {
      ...card("f1", 3, 0, "Carlos Méndez / Diego Ramírez", "Ana Ruiz / Eva López"),
      status: "finished" as const,
      local: {
        ...card("f1", 3, 0, "Carlos Méndez / Diego Ramírez", "Ana Ruiz / Eva López")
          .local,
        isWinner: true,
      },
    };
    const bronze = {
      ...card("b1", RONDA_TERCER_LUGAR, 0, "Luis Pérez / Mario Soto", "Nora Díaz / Paz Luna"),
      status: "finished" as const,
    };
    renderStage([final, bronze], 3, 3);

    expect(screen.getByText(/^RESULTADO FINAL$/)).toBeInTheDocument();
    expect(screen.getByText(/^3\.ER LUGAR$/)).toBeInTheDocument();
    expect(screen.queryByText(/^SEMIFINALES$/)).toBeNull();
  });

  it("shows tournaments that start in semifinals without fabricating an earlier round", () => {
    renderStage(
      [
        {
          ...card("s1", 1, 0, "Carlos Méndez / Diego Ramírez", "Luis Pérez / Mario Soto"),
          roundLabel: "Semifinal",
        },
        {
          ...card("s2", 1, 1, "Ana Ruiz / Eva López", "Nora Díaz / Paz Luna"),
          roundLabel: "Semifinal",
        },
      ],
      2,
      1
    );

    expect(screen.getByText(/^SEMIFINALES$/)).toBeInTheDocument();
    expect(screen.queryByText(/^CUARTOS DE FINAL$/)).toBeNull();
    expect(screen.queryByText(/^GRAN FINAL$/)).toBeNull();
  });

  it("omits third-place UI when bronze card is absent", () => {
    render(
      <TEPublicBracketVisual
        allCards={cards}
        totalRondas={3}
        activeRonda={1}
      />
    );
    expect(screen.queryByText(/^3\.ER LUGAR$/)).toBeNull();
  });

  it("shows time and court in each match header, not as muted footer metadata", () => {
    render(
      <TEPublicBracketVisual
        allCards={cards}
        totalRondas={3}
        activeRonda={1}
      />
    );

    const times = screen.getAllByText("13:50");
    const courts = screen.getAllByText("CANCHA 3");
    expect(times).toHaveLength(4);
    expect(courts).toHaveLength(4);
    times.forEach((node) => expect(node).toHaveClass("te-pb-match__time"));
    courts.forEach((node) =>
      expect(node).toHaveClass("te-pb-match__court--confirmed")
    );
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("keeps pending court readable without alarm styling", () => {
    const pendingCourtCards = cards.map((match, index) =>
      index === 0 ? { ...match, canchaLabel: null } : match
    );
    render(
      <TEPublicBracketVisual
        allCards={pendingCourtCards}
        totalRondas={3}
        activeRonda={1}
      />
    );
    expect(screen.getByText("Cancha por confirmar")).toHaveClass(
      "te-pb-match__court--pending"
    );
  });
});
