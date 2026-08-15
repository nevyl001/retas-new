import {
  buildBracketPresentationModel,
  formatMatchLogistics,
  formatMatchMetaLine,
  formatOriginLabel,
  statusLabelEs,
} from "./publicBracketPresentation";
import type { PublicMatchupCard } from "./publicBracketModel";

function card(
  id: string,
  ronda: number,
  cruceIndex: number,
  opts: Partial<PublicMatchupCard> & {
    localLabel?: string;
    visitLabel?: string;
    localWinner?: boolean;
    visitWinner?: boolean;
  } = {}
): PublicMatchupCard {
  const {
    localLabel = `Local ${id} A / Local ${id} B`,
    visitLabel = `Visit ${id} A / Visit ${id} B`,
    localWinner = false,
    visitWinner = false,
    ...rest
  } = opts;
  return {
    id,
    ronda,
    cruceIndex,
    roundLabel:
      ronda === 3 ? "Final" : ronda === 2 ? "Semifinal" : "Cuartos de final",
    matchTitle:
      ronda === 3
        ? "FINAL"
        : ronda === 2
          ? `SEMIFINAL ${cruceIndex + 1}`
          : `CUARTOS ${cruceIndex + 1}`,
    local: {
      parejaId: `${id}-l`,
      label: localLabel,
      seed: 1,
      originBadge: "3°C",
      isBye: false,
      isWinner: localWinner,
      score: null,
    },
    visit: {
      parejaId: `${id}-v`,
      label: visitLabel,
      seed: 4,
      originBadge: null,
      isBye: false,
      isWinner: visitWinner,
      score: null,
    },
    status: "pending",
    horaDisplay: "13:50",
    scheduleMs: null,
    puntosLocal: null,
    puntosVisitante: null,
    sets: [],
    canchaLabel: "3",
    ...rest,
  };
}

describe("publicBracketPresentation", () => {
  it("formats origin badges for readability", () => {
    expect(formatOriginLabel("3°C")).toBe("3º · C");
    expect(formatOriginLabel(null)).toBeNull();
  });

  it("formats schedule logistics with confirmed vs pending court hierarchy", () => {
    expect(formatMatchLogistics("13:50", null)).toEqual({
      timeLabel: "13:50",
      courtLabel: "Cancha por confirmar",
      timeConfirmed: true,
      courtConfirmed: false,
      metaLine: "13:50 · Cancha por confirmar",
    });
    expect(formatMatchLogistics("Por confirmar", "2")).toEqual({
      timeLabel: "Horario por confirmar",
      courtLabel: "CANCHA 2",
      timeConfirmed: false,
      courtConfirmed: true,
      metaLine: "Horario por confirmar · CANCHA 2",
    });
    expect(formatMatchMetaLine("13:50", "3")).toBe("13:50 · CANCHA 3");
  });

  it("exposes first-class time/court fields on each match presentation", () => {
    const model = buildBracketPresentationModel(
      [card("q1", 1, 0, { horaDisplay: "13:50", canchaLabel: "3" })],
      3,
      1
    );
    const match = model.rounds[0].matches[0];
    expect(match.timeLabel).toBe("13:50");
    expect(match.courtLabel).toBe("CANCHA 3");
    expect(match.timeConfirmed).toBe(true);
    expect(match.courtConfirmed).toBe(true);
    expect(match.metaLine).toBe("13:50 · CANCHA 3");
  });

  it("maps status labels without relying on color alone", () => {
    expect(statusLabelEs("live")).toBe("En juego");
    expect(statusLabelEs("finished")).toBe("Finalizado");
    expect(statusLabelEs("pending")).toBe("Pendiente");
  });

  it("renders pair names exactly once per side (no duplicated player rows)", () => {
    const qf = card("q1", 1, 0, {
      localLabel: "Carlos Méndez / Diego Ramírez",
    });
    const model = buildBracketPresentationModel([qf], 3, 1);
    const match = model.rounds[0].matches[0];
    expect(match.local.names).toEqual(["Carlos Méndez", "Diego Ramírez"]);
    expect(match.local.names).toHaveLength(2);
  });

  it("keeps each photo, name, and rating bound to its stable player ID", () => {
    const qf = card("q1", 1, 0, {
      localLabel: "Carlos Méndez / Diego Ramírez",
    });
    const model = buildBracketPresentationModel([qf], 3, 1, {
      "q1-l": [
        {
          id: "player-diego",
          name: "Diego Ramírez",
          fotoUrl: "https://cdn.example/diego.jpg",
          rating: 3.03,
        },
        {
          id: "player-carlos",
          name: "Carlos Méndez",
          fotoUrl: "https://cdn.example/carlos.jpg",
          rating: 3.13,
        },
      ],
    });

    expect(model.rounds[0].matches[0].local.players).toEqual([
      {
        id: "player-diego",
        name: "Diego Ramírez",
        fotoUrl: "https://cdn.example/diego.jpg",
        rating: 3.03,
      },
      {
        id: "player-carlos",
        name: "Carlos Méndez",
        fotoUrl: "https://cdn.example/carlos.jpg",
        rating: 3.13,
      },
    ]);
  });

  it("reveals only the active starting round until a real next round exists", () => {
    const cards = [
      card("q1", 1, 0),
      card("q2", 1, 1),
      card("q3", 1, 2),
      card("q4", 1, 3),
    ];
    const model = buildBracketPresentationModel(cards, 3, 1);
    expect(model.rounds).toHaveLength(1);
    expect(model.rounds[0].title).toBe("CUARTOS");
    expect(model.rounds[0].isActive).toBe(true);
    expect(model.rounds[0].matches).toHaveLength(4);
  });

  it("keeps completed cuartos visible when semifinals become available", () => {
    const cards = [
      card("q1", 1, 0, { status: "finished", localWinner: true }),
      card("q2", 1, 1, { status: "finished", localWinner: true }),
      card("q3", 1, 2, { status: "finished", localWinner: true }),
      card("q4", 1, 3, { status: "finished", localWinner: true }),
      card("s1", 2, 0, { status: "live", roundLabel: "Semifinal" }),
      card("s2", 2, 1, { status: "pending", roundLabel: "Semifinal" }),
    ];
    const model = buildBracketPresentationModel(cards, 3, 2);
    expect(model.rounds.map((round) => round.title)).toEqual([
      "CUARTOS",
      "SEMIFINALES",
    ]);
    expect(model.rounds[0].isCompleted).toBe(true);
    expect(model.rounds[1].isActive).toBe(true);
  });

  it("keeps every existing chapter once a final is available", () => {
    const cards = [
      card("q1", 1, 0), card("q2", 1, 1),
      card("q3", 1, 2), card("q4", 1, 3),
      card("s1", 2, 0, { roundLabel: "Semifinal" }),
      card("s2", 2, 1, { roundLabel: "Semifinal" }),
      card("f", 3, 0, { roundLabel: "Final" }),
    ];
    const model = buildBracketPresentationModel(cards, 3, 3);
    expect(model.rounds.map((round) => round.title)).toEqual([
      "CUARTOS",
      "SEMIFINALES",
      "FINAL",
    ]);
    expect(model.rounds[2].isActive).toBe(true);
  });

  it("does not invent a previous round for a tournament starting in semifinals", () => {
    const model = buildBracketPresentationModel(
      [
        card("s1", 1, 0, { roundLabel: "Semifinal" }),
        card("s2", 1, 1, { roundLabel: "Semifinal" }),
      ],
      2,
      1
    );
    expect(model.rounds.map((round) => round.title)).toEqual(["SEMIFINALES"]);
  });

  it("shows third-place round only when a bronze card exists", () => {
    const withThird = [
      card("s1", 1, 0),
      card("s2", 1, 1),
      card("f", 2, 0),
      card("t", 90, 0, {
        roundLabel: "Tercer lugar",
        matchTitle: "TERCER LUGAR",
      }),
    ];

    const on = buildBracketPresentationModel(withThird, 2, 2);
    expect(on.thirdPlace).not.toBeNull();
    expect(on.mobileTabs.some((t) => t.label === "3.er lugar")).toBe(true);

    const off = buildBracketPresentationModel(
      [card("s1", 1, 0), card("s2", 1, 1), card("f", 2, 0)],
      2,
      2
    );
    expect(off.thirdPlace).toBeNull();
    expect(off.mobileTabs.some((t) => t.label === "3.er lugar")).toBe(false);
  });

  it("completed matches expose winner and set scores from existing data", () => {
    const finished = card("f", 2, 0, {
      status: "finished",
      localWinner: true,
      visitWinner: false,
      sets: [
        { local: 6, visitante: 3 },
        { local: 6, visitante: 4 },
      ],
      localLabel: "Carlos / Diego",
      visitLabel: "Andrés / Pablo",
    });
    const model = buildBracketPresentationModel([finished], 2, 2);
    const match = model.rounds[0].matches[0];
    expect(match.local.isWinner).toBe(true);
    expect(match.visit.isLoser).toBe(true);
    expect(match.local.setScores).toEqual([6, 6]);
    expect(match.visit.setScores).toEqual([3, 4]);
  });

  it("defaults mobile tab to the active round from the snapshot", () => {
    const cards = [
      card("q1", 1, 0),
      card("q2", 1, 1),
      card("q3", 1, 2),
      card("q4", 1, 3),
      card("s1", 2, 0, { status: "live" }),
      card("s2", 2, 1, { status: "pending" }),
    ];
    const model = buildBracketPresentationModel(cards, 3, 2);
    expect(model.defaultMobileTabId).toBe("ronda-2");
  });
});
