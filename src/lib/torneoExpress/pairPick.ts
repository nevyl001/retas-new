export type PairPickAction =
  | { type: "clear" }
  | { type: "select"; id: string }
  | { type: "form"; id1: string; id2: string };

/**
 * Reglas del picker de parejas (un toque = selecciona, segundo toque = forma).
 * Sin botón «Formar pareja»: al elegir el segundo jugador ya queda armada.
 */
export function nextPairPick(
  pickedId: string | null,
  tappedId: string
): PairPickAction {
  if (pickedId === tappedId) return { type: "clear" };
  if (!pickedId) return { type: "select", id: tappedId };
  return { type: "form", id1: pickedId, id2: tappedId };
}
