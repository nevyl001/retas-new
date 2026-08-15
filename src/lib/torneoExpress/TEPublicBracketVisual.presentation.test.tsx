import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TEPublicBracketVisual } from "../../components/torneo-express/public/TEPublicBracketVisual";
import { getJugadorInitials } from "../../components/jugadores/JugadorAvatar";
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

  it("renders both pair names once and no standalone VS badge", () => {
    render(
      <TEPublicBracketVisual
        allCards={cards}
        totalRondas={3}
        activeRonda={1}
      />
    );

    expect(screen.getAllByText("Carlos Méndez").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Diego Ramírez").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/^vs$/i)).toBeNull();
    expect(screen.queryByText(/^VS$/)).toBeNull();
  });

  it("does not show future-round dependency placeholders while cuartos are active", () => {
    render(
      <TEPublicBracketVisual
        allCards={cards}
        totalRondas={3}
        activeRonda={1}
      />
    );
    expect(screen.queryByText(/Ganador Cuartos 1/i)).toBeNull();
    expect(screen.queryByText(/^SEMIFINALES$/)).toBeNull();
    expect(screen.queryByText(/^FINAL$/)).toBeNull();
  });

  it("keeps completed history when semifinals become available", () => {
    const progressedCards = [
      ...cards.map((match) => ({
        ...match,
        status: "finished" as const,
        local: { ...match.local, isWinner: true },
      })),
      card("s1", 2, 0, "Carlos Méndez / Diego Ramírez", "Luis Pérez / Mario Soto"),
      card("s2", 2, 1, "Ana Ruiz / Eva López", "Nora Díaz / Paz Luna"),
    ];
    render(
      <TEPublicBracketVisual
        allCards={progressedCards}
        totalRondas={3}
        activeRonda={2}
      />
    );
    expect(screen.getByText(/^CUARTOS$/)).toBeInTheDocument();
    expect(screen.getByText(/^SEMIFINALES$/)).toBeInTheDocument();
    expect(screen.queryByText(/^FINAL$/)).toBeNull();
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
