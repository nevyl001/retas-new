import {
  americanoInPlayRoundIndex,
  americanoRoundIsInPlay,
} from "./publicRoundFocus";

const open = { matches: [{}, {}] };
const scored = {
  matches: [
    { scoreA: 4, scoreB: 4 },
    { scoreA: 6, scoreB: 2 },
  ],
};
const partial = {
  matches: [{ scoreA: 3, scoreB: 2 }, {}],
};

describe("americano public round focus", () => {
  it("opens on the first round that still has no full result", () => {
    expect(americanoInPlayRoundIndex([scored, scored, open])).toBe(2);
  });

  it("stays on the last round when every round is complete", () => {
    expect(americanoInPlayRoundIndex([scored, scored])).toBe(1);
  });

  it("treats the next round as in play once the previous one has results", () => {
    const rounds = [scored, scored, open];
    expect(americanoRoundIsInPlay(rounds, 2)).toBe(true);
    expect(americanoRoundIsInPlay(rounds, 0)).toBe(false);
  });

  it("keeps a later round pending while an earlier one is still open", () => {
    const rounds = [scored, open, open];
    expect(americanoInPlayRoundIndex(rounds)).toBe(1);
    expect(americanoRoundIsInPlay(rounds, 1)).toBe(true);
    expect(americanoRoundIsInPlay(rounds, 2)).toBe(false);
  });

  it("marks the current round in play as soon as it has a score", () => {
    expect(americanoRoundIsInPlay([partial], 0)).toBe(true);
    expect(americanoRoundIsInPlay([open], 0)).toBe(false);
  });
});
