export interface TournamentTeamConfig {
  teamNames: string[];
  pairToTeam: Record<string, number>;
}

export interface Tournament {
  id: string;
  name: string;
  description?: string;
  courts: number;
  is_started: boolean;
  is_finished: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
  format?: "round_robin" | "teams";
  team_config?: TournamentTeamConfig;
  /** Soft-archive desde Mis retas. NULL/undefined = visible en admin. */
  archived_at?: string | null;
  /** Sede del encuentro (SoT para /jugar). Requiere patch-convocatoria-public-meta-from-entity. */
  lugar?: string | null;
  mostrar_lugar?: boolean | null;
  /** Etiqueta de cancha (distinto de `courts`). */
  cancha?: string | null;
  programado_en?: string | null;
  programado_hasta?: string | null;
}

export interface Player {
  id: string;
  name: string;
  email: string;
  created_at: string;
}

export interface Pair {
  id: string;
  tournament_id: string;
  player1_id: string;
  player2_id: string;
  player1_name: string;
  player2_name: string;
  created_at: string;
  player1?: Player;
  player2?: Player;
}

export type RoundRobinMatchType = "roundrobin" | "championship";

export interface Match {
  id: string;
  tournament_id: string;
  pair1_id: string;
  pair2_id: string;
  pair1_name: string;
  pair2_name: string;
  court: number;
  round?: number;
  /** Ronda regular vs remontada final (si la columna existe en Supabase). */
  match_type?: RoundRobinMatchType | string | null;
  status: string;
  pair1_score?: number;
  pair2_score?: number;
  created_at: string;
  pair1?: Pair;
  pair2?: Pair;
}

export interface Game {
  id: string;
  match_id: string;
  game_number: number;
  pair1_games: number;
  pair2_games: number;
  is_tie_break: boolean;
  tie_break_pair1_points: number;
  tie_break_pair2_points: number;
  created_at: string;
  updated_at: string;
}

export interface AmericanoPlayer {
  id: string;
  name: string;
  stats: AmericanoStats;
}

export interface AmericanoStats {
  pointsFor: number;
  pointsAgainst: number;
  gamesPlayed: number;
  roundsOnBench: number;
}

export interface AmericanoMatch {
  id: string;
  teamA: [AmericanoPlayer, AmericanoPlayer];
  teamB: [AmericanoPlayer, AmericanoPlayer];
  court: number;
  scoreA?: number;
  scoreB?: number;
}

export interface AmericanoRound {
  roundNumber: number;
  /**
   * Compatibilidad de snapshot. En el modo actual `generateAmericanoRound()` siempre
   * asigna `1` (rotación americana equilibrada). No hay fase 2 ni emparejamientos por ranking.
   * El valor `2` puede aparecer solo en snapshots legacy.
   */
  phase: 1 | 2;
  matches: AmericanoMatch[];
  benchPlayers: AmericanoPlayer[];
}

export type PartnerMatrix = Record<string, Record<string, number>>;
export type RivalMatrix = Record<string, Record<string, number>>;
