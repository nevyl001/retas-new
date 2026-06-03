export type GameModeId =
  | "reta-equipos"
  | "round-robin"
  | "americano"
  | "mini-torneo"
  | "liga";

export interface GameModeConfig {
  id: GameModeId;
  title: string;
  description: string;
  icon: string;
  badge?: string;
  gradient: string;
  accentColor: string;
  disabled?: boolean;
}

export const GAME_MODES: GameModeConfig[] = [
  {
    id: "reta-equipos",
    title: "Reta por Equipos",
    description: "Parejas agrupadas compiten por equipos",
    icon: "🏆",
    badge: "Popular",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#c9a227",
  },
  {
    id: "round-robin",
    title: "Round Robin",
    description: "Todos contra todos, tabla en vivo",
    icon: "🔄",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#c9a227",
  },
  {
    id: "americano",
    title: "Pádel Americano",
    description: "Rotación dinámica por rondas y canchas",
    icon: "🎾",
    badge: "Rápido",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#c9a227",
  },
  {
    id: "mini-torneo",
    title: "Torneos",
    description: "Grupos + round robin, tabla pública",
    icon: "⚡",
    badge: "Nuevo",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#c9a227",
  },
  {
    id: "liga",
    title: "Liga",
    description: "Temporada con jornadas y ranking acumulado",
    icon: "🏅",
    badge: "Nuevo",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#c9a227",
  },
];
