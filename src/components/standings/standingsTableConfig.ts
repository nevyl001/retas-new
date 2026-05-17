export type StandingsEntityColumn = "pareja" | "equipo" | "jugador";

export const STANDINGS_ENTITY_HEADERS: Record<
  StandingsEntityColumn,
  { label: string; title: string }
> = {
  pareja: { label: "PAREJA", title: "Nombre de la pareja" },
  equipo: { label: "EQUIPO", title: "Nombre del equipo" },
  jugador: { label: "JUGADOR", title: "Nombre del jugador" },
};

export const STANDINGS_PTS_TABLE_TITLE =
  "Puntos de tabla: victoria 2, empate 1, derrota 0";
