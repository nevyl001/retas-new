/** Helpers puros para UI de creación de pareja (testeables sin React). */

export function canStartPairCreate(state: {
  isCreatingPair: boolean;
}): boolean {
  return !state.isCreatingPair;
}

export function shouldClearSelectionAfterPairCreate(result: {
  ok: boolean;
}): boolean {
  return result.ok === true;
}
