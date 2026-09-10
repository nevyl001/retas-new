import type {
  EnCancha,
  ManoDominante,
  RivieraJugadorCategoria,
} from "../rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../rivieraJugadores/genero";

export type CoachMembershipStatus = "ACTIVE" | "INACTIVE";
export type CoachPlayerStatus = "ACTIVE" | "PAUSED" | "ENDED";

/** Alta / edición de coach (mismo núcleo que jugador + campos coach). */
export type CreateCoachInput = {
  nombre: string;
  email: string;
  telefono?: string;
  paisCodigo?: string | null;
  genero: RivieraJugadorGenero;
  /** Fuerza propia del coach (como categoría de jugador). */
  categoria: RivieraJugadorCategoria;
  edad?: number | null;
  manoDominante?: ManoDominante | null;
  enCancha?: EnCancha | null;
  /** Fuerzas que entrena (schema `riviera_coaches.fuerzas`). */
  fuerzas: RivieraJugadorCategoria[];
  /** Enfoque de entrenamiento (schema `especialidades`). */
  especialidades: string[];
  bio?: string | null;
};

export type CoachingCoach = {
  id: string;
  coachCode: string;
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  paisCodigo?: string | null;
  genero?: RivieraJugadorGenero | null;
  categoria?: RivieraJugadorCategoria | null;
  edad?: number | null;
  manoDominante?: ManoDominante | null;
  enCancha?: EnCancha | null;
  fotoUrl?: string | null;
  bio?: string | null;
  especialidades: string[];
  fuerzas: RivieraJugadorCategoria[];
  membershipStatus: CoachMembershipStatus;
};

export type CoachingPlayerLink = {
  id: string;
  coachId: string;
  coachNombre: string;
  jugadorId: string;
  jugadorNombre: string;
  /** Riviera ID exacto (RIV-########) — vínculo canónico. */
  rivieraId: string;
  status: CoachPlayerStatus;
  isPrimary: boolean;
};

export type CoachingClubSnapshot = {
  coaches: CoachingCoach[];
  links: CoachingPlayerLink[];
  source: "live" | "demo";
};
