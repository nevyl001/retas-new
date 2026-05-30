import {
  buildPublicBracketVisualLayout,
  type PublicBracketVisualLayout,
} from "./publicBracketLayout";
import type { PublicMatchupCard } from "./publicBracketModel";

describe("publicBracketLayout", () => {
  function card(
    id: string,
    ronda: number,
    cruceIndex: number,
    title: string
  ): PublicMatchupCard {
    return {
      id,
      ronda,
      cruceIndex,
      roundLabel: ronda === 2 ? "Final" : "Semifinal",
      matchTitle: title,
      local: {
        parejaId: id + "l",
        label: `Local ${id}`,
        seed: null,
        originBadge: null,
        isBye: false,
        isWinner: false,
        score: null,
      },
      visit: {
        parejaId: id + "v",
        label: `Visit ${id}`,
        seed: null,
        originBadge: null,
        isBye: false,
        isWinner: false,
        score: null,
      },
      status: "pending",
      horaDisplay: "18:00",
      scheduleMs: null,
      puntosLocal: null,
      puntosVisitante: null,
      sets: [],
      canchaLabel: null,
    };
  }

  it("builds 3 columns for semifinal + final", () => {
    const semi1 = card("s1", 1, 0, "SEMIFINAL 1");
    const semi2 = card("s2", 1, 1, "SEMIFINAL 2");
    const layout: PublicBracketVisualLayout = buildPublicBracketVisualLayout(
      [semi1, semi2],
      2
    );

    expect(layout.columnCount).toBe(3);
    expect(layout.centerColumnIndex).toBe(1);
    expect(layout.columns[0].slots).toHaveLength(1);
    expect(layout.columns[0].slots[0].card?.id).toBe("s1");
    expect(layout.columns[2].slots[0].card?.id).toBe("s2");
    expect(layout.columns[1].slots[0].kind).toBe("final-placeholder");
    expect(layout.mobileSlots).toHaveLength(3);
  });

  it("places final match in center column", () => {
    const semi1 = card("s1", 1, 0, "SEMIFINAL 1");
    const semi2 = card("s2", 1, 1, "SEMIFINAL 2");
    const final = card("f", 2, 0, "FINAL");
    const layout = buildPublicBracketVisualLayout(
      [semi1, semi2, final],
      2
    );

    expect(layout.columns[1].slots[0].card?.id).toBe("f");
    expect(layout.columns[1].slots[0].kind).toBe("match");
  });
});
