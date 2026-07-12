import {
  canStartPairCreate,
  shouldClearSelectionAfterPairCreate,
} from "./pairCreateUiState";

describe("pairCreateUiState", () => {
  it("botón/acción deshabilitada durante request", () => {
    expect(canStartPairCreate({ isCreatingPair: true })).toBe(false);
    expect(canStartPairCreate({ isCreatingPair: false })).toBe(true);
  });

  it("selección se limpia solo tras éxito", () => {
    expect(shouldClearSelectionAfterPairCreate({ ok: true })).toBe(true);
    expect(shouldClearSelectionAfterPairCreate({ ok: false })).toBe(false);
  });
});
