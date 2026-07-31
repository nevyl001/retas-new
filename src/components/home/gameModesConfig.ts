export type GameModeId =
  | "reta-equipos"
  | "round-robin"
  | "americano"
  | "mini-torneo"
  | "liga"
  | "duelo-2v2";

export type GameModeCategory = "reta-rapida" | "competencia";

export interface GameModeConfig {
  id: GameModeId;
  title: string;
  description: string;
  icon: string;
  accentColor: string;
  category: GameModeCategory;
  typeLabel: string;
  disabled?: boolean;
}

export const GAME_MODES: GameModeConfig[] = [
  {
    id: "reta-equipos",
    title: "Reta por Equipos",
    description: "Parejas agrupadas por equipos.",
    icon: "👥",
    accentColor: "#ffffff",
    category: "reta-rapida",
    typeLabel: "Reta rápida",
  },
  {
    id: "round-robin",
    title: "Round Robin",
    description: "Todos contra todos.",
    icon: "🔄",
    accentColor: "#ffffff",
    category: "reta-rapida",
    typeLabel: "Reta rápida",
  },
  {
    id: "americano",
    title: "Reta Pádel Americano",
    description: "Rotación dinámica por rondas.",
    icon: "🎾",
    accentColor: "#10b981",
    category: "reta-rapida",
    typeLabel: "Reta rápida",
  },
  {
    id: "duelo-2v2",
    title: "Duelo 2 vs 2",
    description: "Dos parejas, suma al ranking.",
    icon: "⚔️",
    accentColor: "#f59e0b",
    category: "reta-rapida",
    typeLabel: "Reta rápida",
  },
  {
    id: "mini-torneo",
    title: "Torneos",
    description: "Grupos y fase final.",
    icon: "🏆",
    accentColor: "#8b5cf6",
    category: "competencia",
    typeLabel: "Competencia",
  },
  {
    id: "liga",
    title: "Liga",
    description: "Temporada con jornadas.",
    icon: "📅",
    accentColor: "#3b82f6",
    category: "competencia",
    typeLabel: "Competencia",
  },
];

export const QUICK_GAME_MODES = GAME_MODES.filter((m) => m.category === "reta-rapida");
export const ORGANIZED_GAME_MODES = GAME_MODES.filter((m) => m.category === "competencia");
