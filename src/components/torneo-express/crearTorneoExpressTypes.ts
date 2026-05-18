import type { Player } from "../../lib/database";

export type ParejaDraft = {
  id: string;
  jugador1: Player;
  jugador2: Player;
};

export const TE_DRAFT_TOURNAMENT_KEY = "torneo_express_draft_tournament_id";
