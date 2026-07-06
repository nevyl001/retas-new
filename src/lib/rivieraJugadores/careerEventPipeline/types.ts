import type { Match, Pair, Tournament } from "../../database";
import type { AmericanoPlayer, AmericanoRound } from "../../db/types";
import type { Duelo2v2 } from "../../duelo2v2/types";
import type { JugadorTipoEvento } from "../types";

/** Modalidades soportadas por el pipeline canónico de carrera deportiva. */
export type CareerEventKind =
  | "reta"
  | "duelo_2v2"
  | "americano"
  | "torneo_express"
  | "liga_jornada"
  | "liga_podio"
  | "liga_inscripcion";

export type CareerEventAssertionCode =
  | "missing_historial"
  | "missing_rating"
  | "missing_local_points"
  | "missing_global_points"
  | "missing_organizador_id"
  | "missing_club_name"
  | "missing_riviera_id"
  | "missing_player_identity"
  | "missing_stats"
  | "duplicate_participacion"
  | "sync_failed"
  | "missing_parent_event"
  | "ambiguous_profile_link"
  | "career_integrity_blocked";

export type CareerEventAssertionFailure = {
  code: CareerEventAssertionCode;
  message: string;
  jugadorId?: string;
  details?: Record<string, unknown>;
};

export type CareerEventPipelineOptions = {
  /** Si true, exige movimiento de rating para cada jugador (partidos con rating). */
  requireRating?: boolean;
  /** Referencias de partido para validar rating (ej. duelo2v2:{id}). */
  ratingPartidoRefs?: string[];
  /** Omite assertions (solo backfill masivo). */
  skipAssertions?: boolean;
  /** Omite ensure de identidad (backfill). */
  skipIdentityEnsure?: boolean;
};

export type CareerEventContext = {
  kind: CareerEventKind;
  organizadorId: string;
  hostOrganizadorId: string;
  eventoId: string;
  tipoEvento: JugadorTipoEvento;
};

export type CareerEventPipelineResult = {
  ok: boolean;
  processed: boolean;
  context: CareerEventContext;
  touchedJugadorIds: string[];
  failures: CareerEventAssertionFailure[];
  durationMs: number;
};

export type FinalizeCareerEventInput =
  | {
      kind: "reta";
      organizadorId: string;
      tournament: Tournament;
      pairs: Pair[];
      matches: Match[];
      options?: CareerEventPipelineOptions;
    }
  | {
      kind: "duelo_2v2";
      organizadorId: string;
      duelo: Duelo2v2;
      options?: CareerEventPipelineOptions;
    }
  | {
      kind: "americano";
      organizadorId: string;
      sesionId: string;
      nombre: string;
      roster: AmericanoPlayer[];
      rounds: AmericanoRound[];
      options?: CareerEventPipelineOptions;
    }
  | {
      kind: "torneo_express";
      organizadorId: string;
      torneoId: string;
      options?: CareerEventPipelineOptions;
    }
  | {
      kind: "liga_jornada";
      organizadorId: string;
      ligaId: string;
      jornadaNumero: number;
      options?: CareerEventPipelineOptions;
    }
  | {
      kind: "liga_podio";
      organizadorId: string;
      ligaId: string;
      options?: CareerEventPipelineOptions;
    }
  | {
      kind: "liga_inscripcion";
      organizadorId: string;
      ligaId: string;
      jugadorId: string;
      options?: CareerEventPipelineOptions;
    };

export const CAREER_EVENT_KIND_TO_TIPO: Record<
  CareerEventKind,
  JugadorTipoEvento
> = {
  reta: "reta",
  duelo_2v2: "duelo_2v2",
  americano: "americano",
  torneo_express: "torneo_express",
  liga_jornada: "liga",
  liga_podio: "liga",
  liga_inscripcion: "liga",
};
