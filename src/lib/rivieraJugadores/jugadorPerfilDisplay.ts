import { EN_CANCHA_LABELS, MANO_DOMINANTE_LABELS } from "./constants";
import type { EnCancha, ManoDominante, RivieraJugador } from "./types";

export type JugadorPerfilMetaItem = {
  label: string;
  value: string;
};

export function getJugadorPerfilMeta(
  jugador: Pick<RivieraJugador, "edad" | "mano_dominante" | "en_cancha">
): JugadorPerfilMetaItem[] {
  const items: JugadorPerfilMetaItem[] = [];
  if (jugador.edad != null) {
    items.push({ label: "Edad", value: `${jugador.edad} años` });
  }
  if (jugador.mano_dominante) {
    items.push({
      label: "Mano dominante",
      value: MANO_DOMINANTE_LABELS[jugador.mano_dominante as ManoDominante],
    });
  }
  if (jugador.en_cancha) {
    items.push({
      label: "En la cancha",
      value: EN_CANCHA_LABELS[jugador.en_cancha as EnCancha],
    });
  }
  return items;
}
