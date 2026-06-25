export type GameModeId =
  | "reta-equipos"
  | "round-robin"
  | "americano"
  | "mini-torneo"
  | "liga"
  | "duelo-2v2";

export interface GameModeConfig {
  id: GameModeId;
  title: string;
  description: string;
  icon: string;
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
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#ffffff",
  },
  {
    id: "round-robin",
    title: "Round Robin",
    description: "Todos contra todos, tabla en vivo",
    icon: "🔄",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#ffffff",
  },
  {
    id: "americano",
    title: "Pádel Americano",
    description: "Rotación dinámica por rondas y canchas",
    icon: "🎾",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#10b981",
  },
  {
    id: "mini-torneo",
    title: "Torneos",
    description: "Grupos + round robin, tabla pública",
    icon: "⚡",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#8b5cf6",
  },
  {
    id: "liga",
    title: "Liga",
    description: "Temporada con jornadas y ranking acumulado",
    icon: "🏅",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#3b82f6",
  },
  {
    id: "duelo-2v2",
    title: "Duelo 2 vs 2",
    description: "Dos parejas del registro · suma al ranking Riviera Open",
    icon: "⚔️",
    gradient: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
    accentColor: "#f59e0b",
  },
];
