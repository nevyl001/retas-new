import React from "react";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TEPublicBracketVisual } from "../../components/torneo-express/public/TEPublicBracketVisual";
import { getJugadorInitials } from "../../components/jugadores/JugadorAvatar";
import { RONDA_TERCER_LUGAR } from "./bracketRounds";
import type { PublicMatchupCard } from "./publicBracketModel";
import type { PublicEliminatoriaPodiumStats } from "./publicEliminatoriaPodiumStats";

function card(
  id: string,
  ronda: number,
  cruceIndex: number,
  localLabel: string,
  visitLabel: string,
): PublicMatchupCard {
  return {
    id,
    ronda,
    cruceIndex,
    roundLabel:
      ronda === 1 ? "Cuartos de final" : ronda === 2 ? "Semifinal" : "Final",
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
      />,
    );

    expect(screen.getAllByText("Carlos Méndez").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.getAllByText("Diego Ramírez").length).toBeGreaterThanOrEqual(
      1,
    );
    expect(screen.queryByText(/^VS$/)).toBeNull();
  });

  it("binds each active semifinal portrait to its stable player identity", () => {
    const semifinals = [
      {
        ...card(
          "s1",
          1,
          0,
          "Carlos Méndez / Diego Ramírez",
          "Luis Pérez / Mario Soto",
        ),
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
      />,
    );

    expect(screen.getAllByLabelText(/^Jugador /)).toHaveLength(8);
    expect(screen.getByLabelText("Jugador Carlos Méndez")).toHaveAttribute(
      "data-player-id",
      "player-carlos",
    );
    expect(screen.getByLabelText("Jugador Carlos Méndez")).toHaveAttribute(
      "data-photo-state",
      "provided",
    );
    expect(
      screen.getByRole("img", { name: "Foto de Carlos Méndez" }),
    ).toHaveAttribute("src", "https://cdn.example/carlos.jpg");
    expect(
      screen.queryByRole("img", { name: "Foto de Diego Ramírez" }),
    ).toBeNull();
    expect(screen.getByText("DR")).toBeInTheDocument();
  });

  it("exposes each pair score as its own scoreboard rail", () => {
    const semifinal = {
      ...card(
        "s1",
        1,
        0,
        "Carlos Méndez / Diego Ramírez",
        "Luis Pérez / Mario Soto",
      ),
      roundLabel: "Semifinal",
      status: "finished" as const,
      local: {
        ...card(
          "s1",
          1,
          0,
          "Carlos Méndez / Diego Ramírez",
          "Luis Pérez / Mario Soto",
        ).local,
        isWinner: true,
      },
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
      />,
    );

    expect(
      screen.getByRole("group", {
        name: "Marcador de Carlos Méndez / Diego Ramírez: 6, 6",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", {
        name: "Marcador de Luis Pérez / Mario Soto: 2, 4",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("✓ GANADORES")).toHaveLength(1);
    expect(screen.getByText("Luis Pérez")).toBeInTheDocument();
    expect(screen.queryByText(/^VS$/)).toBeNull();
  });

  const renderStage = (
    allCards: PublicMatchupCard[],
    totalRondas = 3,
    activeRonda?: number,
    pairStatsById?: Record<string, PublicEliminatoriaPodiumStats | null>,
  ) => {
    render(
      <TEPublicBracketVisual
        allCards={allCards}
        totalRondas={totalRondas}
        activeRonda={activeRonda}
        pairStatsById={pairStatsById}
      />,
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
      card(
        "s1",
        2,
        0,
        "Carlos Méndez / Diego Ramírez",
        "Luis Pérez / Mario Soto",
      ),
      card("s2", 2, 1, "Ana Ruiz / Eva López", "Nora Díaz / Paz Luna"),
    ];
    renderStage(progressedCards, 3, 2);
    expect(screen.getByText(/^SEMIFINALES$/)).toBeInTheDocument();
    expect(
      screen.getByText(/^Felicidades, semifinalistas\.$/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^SF[1-2]$/)).toHaveLength(2);
    expect(screen.getByText(/^CUARTOS DE FINAL$/)).toBeInTheDocument();
    expect(screen.getAllByText(/^QF[1-4]$/)).toHaveLength(4);
    expect(screen.queryByText(/^GRAN FINAL$/)).toBeNull();
    expect(screen.getAllByText(/^Felicidades, semifinalistas\.$/)).toHaveLength(
      1,
    );
    expect(screen.getByRole("article", { name: /^SF1:/ })).toHaveAttribute(
      "data-variant",
      "semifinal",
    );
    expect(screen.getByRole("article", { name: /^QF1:/ })).toHaveAttribute(
      "data-variant",
      "history",
    );
  });

  it("keeps finished semifinals visible while the final is unavailable", () => {
    const finishedSemis = [
      {
        ...card(
          "s1",
          2,
          0,
          "Carlos Méndez / Diego Ramírez",
          "Luis Pérez / Mario Soto",
        ),
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
      card(
        "s1",
        2,
        0,
        "Carlos Méndez / Diego Ramírez",
        "Luis Pérez / Mario Soto",
      ),
      card("s2", 2, 1, "Ana Ruiz / Eva López", "Nora Díaz / Paz Luna"),
      {
        ...card(
          "f1",
          3,
          0,
          "Carlos Méndez / Diego Ramírez",
          "Ana Ruiz / Eva López",
        ),
        status: "finished" as const,
        local: {
          ...card(
            "f1",
            3,
            0,
            "Carlos Méndez / Diego Ramírez",
            "Ana Ruiz / Eva López",
          ).local,
          isWinner: true,
        },
        sets: [
          { local: 6, visitante: 2 },
          { local: 6, visitante: 4 },
        ],
      },
    ].map((match, index) =>
      index < 2
        ? {
            ...match,
            status: "finished" as const,
            local: { ...match.local, isWinner: true },
          }
        : match,
    );

    render(
      <TEPublicBracketVisual
        allCards={finalCards}
        totalRondas={3}
        activeRonda={3}
        tournamentName="Summer Open"
        category="3ra fuerza"
        clubName="Valvidub Sports"
        clubLogoUrl="https://cdn.example/valvidub-logo.png"
        pairStatsById={{
          "f1-l": {
            partidos: 4,
            victorias: 4,
            derrotas: 0,
            juegosFavor: 48,
            juegosContra: 22,
            dif: 26,
          },
          "f1-v": {
            partidos: 4,
            victorias: 3,
            derrotas: 1,
            juegosFavor: 42,
            juegosContra: 31,
            dif: 11,
          },
        }}
      />,
    );
    expect(screen.getByText(/^RESULTADO FINAL$/)).toBeInTheDocument();
    const championsCard = screen.getByLabelText("Tarjeta de campeones");
    const runnersUpCard = screen.getByLabelText("Tarjeta de subcampeones");
    expect(championsCard).toBeInTheDocument();
    expect(championsCard).toHaveClass("te-pb-closing-card");
    expect(runnersUpCard).toHaveClass("te-pb-closing-card");
    expect(championsCard).toHaveAttribute(
      "data-closing-layout",
      "tournament-recognition",
    );
    expect(runnersUpCard).toHaveAttribute(
      "data-closing-layout",
      "tournament-recognition",
    );
    expect(championsCard).toHaveAttribute("data-podium-tone", "gold");
    expect(runnersUpCard).toHaveAttribute("data-podium-tone", "silver");
    expect(screen.getAllByText(/^CAMPEONES$/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/^Felicidades, campeones\.$/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Llegaron hasta el final y dejaron su nombre en lo más alto del torneo\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Disfruten este triunfo\. La próxima competencia será una nueva oportunidad para defender lo conseguido\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Llegar a la Final ya habla del nivel que mostraron durante toda la competencia\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^SUBCAMPEONES$/).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      within(championsCard).getAllByText("4", { selector: "dd" }),
    ).toHaveLength(2);
    expect(
      within(championsCard).getByText("0", { selector: "dd" }),
    ).toBeVisible();
    expect(
      within(championsCard).getByText("+26", { selector: "dd" }),
    ).toBeVisible();
    expect(
      within(runnersUpCard).getByText("3", { selector: "dd" }),
    ).toBeVisible();
    expect(
      within(runnersUpCard).getByText("1", { selector: "dd" }),
    ).toBeVisible();
    expect(
      within(runnersUpCard).getByText("+11", { selector: "dd" }),
    ).toBeVisible();
    expect(
      within(championsCard).getByLabelText(
        "Estadísticas de la pareja en este torneo",
      ),
    ).toBeInTheDocument();
    expect(within(championsCard).getByText("Summer Open")).toBeInTheDocument();
    expect(within(championsCard).getByText("3ra fuerza")).toBeInTheDocument();
    expect(within(championsCard).getByText("1.er lugar")).toBeInTheDocument();
    expect(within(runnersUpCard).getByText("2.º lugar")).toBeInTheDocument();
    const organizer = within(championsCard).getByLabelText(
      "Organizado por Valvidub Sports",
    );
    expect(organizer).toHaveTextContent("Valvidub Sports");
    expect(within(organizer).getByRole("img", { name: "" })).toHaveAttribute(
      "src",
      "https://cdn.example/valvidub-logo.png",
    );
    expect(
      screen.getAllByText(/^by Riviera Open$/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByText(
        /Esto no termina aquí\. Nos vemos en la próxima competencia\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Campeones · Pareja A$/)).toBeInTheDocument();
    expect(screen.getByText(/^Subcampeones · Pareja B$/)).toBeInTheDocument();
    const finalArticle = screen.getByRole("article", { name: /^Final:/ });
    expect(finalArticle).toHaveAttribute("data-variant", "final");
    expect(
      screen.getByLabelText("Pareja finalista: Carlos Méndez / Diego Ramírez"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Pareja finalista: Ana Ruiz / Eva López"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Marcador de la Gran Final"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Carlos Méndez / Diego Ramírez, S1: 6"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Ana Ruiz / Eva López, S2: 4"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^66$/)).toBeNull();
    expect(screen.queryByText(/^24$/)).toBeNull();
    expect(
      finalArticle.compareDocumentPosition(championsCard) & 4,
    ).toBeTruthy();
    expect(screen.getAllByText(/^Camino a la final$/)).toHaveLength(2);
    expect(screen.getByText(/^SEMIFINALES$/)).toBeInTheDocument();
  });

  it("keeps the real third-place match secondary to the visible final", () => {
    const final = {
      ...card(
        "f1",
        3,
        0,
        "Carlos Méndez / Diego Ramírez",
        "Ana Ruiz / Eva López",
      ),
      status: "finished" as const,
      local: {
        ...card(
          "f1",
          3,
          0,
          "Carlos Méndez / Diego Ramírez",
          "Ana Ruiz / Eva López",
        ).local,
        isWinner: true,
      },
    };
    const bronzeCard = card(
      "b1",
      RONDA_TERCER_LUGAR,
      0,
      "Luis Pérez / Mario Soto",
      "Nora Díaz / Paz Luna",
    );
    const bronze = {
      ...bronzeCard,
      status: "finished" as const,
      local: { ...bronzeCard.local, isWinner: true },
    };
    renderStage([final, bronze], 3, 3);

    expect(screen.getByText(/^RESULTADO FINAL$/)).toBeInTheDocument();
    expect(screen.getByText(/^3\.ER LUGAR$/)).toBeInTheDocument();
    expect(
      screen.getByLabelText("Tarjeta de tercer lugar"),
    ).toBeInTheDocument();
    const thirdPlaceResult = screen.getByRole("article", {
      name: /^3\.er lugar:/,
    });
    const championsCard = screen.getByLabelText("Tarjeta de campeones");
    expect(
      thirdPlaceResult.compareDocumentPosition(championsCard) & 4,
    ).toBeTruthy();
    expect(screen.queryByText(/^SEMIFINALES$/)).toBeNull();
  });

  it("shows tournaments that start in semifinals without fabricating an earlier round", () => {
    renderStage(
      [
        {
          ...card(
            "s1",
            1,
            0,
            "Carlos Méndez / Diego Ramírez",
            "Luis Pérez / Mario Soto",
          ),
          roundLabel: "Semifinal",
        },
        {
          ...card("s2", 1, 1, "Ana Ruiz / Eva López", "Nora Díaz / Paz Luna"),
          roundLabel: "Semifinal",
        },
      ],
      2,
      1,
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
      />,
    );
    expect(screen.queryByText(/^3\.ER LUGAR$/)).toBeNull();
  });

  it("shows time and court in each match header, not as muted footer metadata", () => {
    render(
      <TEPublicBracketVisual
        allCards={cards}
        totalRondas={3}
        activeRonda={1}
      />,
    );

    const times = screen.getAllByText("13:50");
    const courts = screen.getAllByText("CANCHA 3");
    expect(times).toHaveLength(4);
    expect(courts).toHaveLength(4);
    times.forEach((node) => expect(node).toHaveClass("te-pb-match__time"));
    courts.forEach((node) =>
      expect(node).toHaveClass("te-pb-match__court--confirmed"),
    );
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("keeps pending court readable without alarm styling", () => {
    const pendingCourtCards = cards.map((match, index) =>
      index === 0 ? { ...match, canchaLabel: null } : match,
    );
    render(
      <TEPublicBracketVisual
        allCards={pendingCourtCards}
        totalRondas={3}
        activeRonda={1}
      />,
    );
    expect(screen.getByText("Cancha por confirmar")).toHaveClass(
      "te-pb-match__court--pending",
    );
  });
});
