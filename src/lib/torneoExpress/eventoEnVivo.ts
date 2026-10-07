import { formatCanchaDisplay } from "./canchaDisplay";
import {
  DEFAULT_PARTIDO_EN_VIVO_DURATION_MINUTES,
  isPartidoEnVivoWindow,
} from "./partidoEnVivo";

/**
 * Modelo de la pantalla pública de canchas de un Evento (TV / proyector).
 * Solo derivación pura: no consulta datos ni conoce Supabase.
 */

export type EnVivoPartidoOrigen = "grupo" | "eliminatoria";

export type EnVivoPairSide = {
  pairId: string | null;
  /** «Nombre / Nombre» o un texto de plaza («Por definir»). */
  display: string;
  player1Id: string | null;
  player2Id: string | null;
  isVirtual: boolean;
};

export type EnVivoPartido = {
  id: string;
  origen: EnVivoPartidoOrigen;
  torneoId: string;
  /** Etiqueta pública de la categoría (4ta, Mixtos D…). */
  categoria: string;
  /** «Grupo A · Ronda 2», «Semifinal», «Final»… */
  etapa: string;
  /** Valor guardado (puede ser null → se muestra Cancha 1 como en el resto de la app). */
  cancha: string | null;
  programadoEn: string;
  startMs: number;
  estado: "pendiente" | "jugado";
  local: EnVivoPairSide;
  visitante: EnVivoPairSide;
};

export type EnVivoCourtLane = {
  key: string;
  label: string;
  /** Partido en ventana «en vivo» en esta cancha (el que empezó primero). */
  live: EnVivoPartido | null;
  /** Siguiente partido pendiente de esta cancha que aún no empieza. */
  next: EnVivoPartido | null;
};

export type EnVivoBoard = {
  /** Todos los partidos en ventana en vivo, ordenados por cancha. */
  live: EnVivoPartido[];
  /** Una fila por cancha conocida, en orden estable (no se reordena al cambiar de partido). */
  courts: EnVivoCourtLane[];
  /** Pendientes que aún no empiezan, por hora y luego cancha. */
  upcoming: EnVivoPartido[];
};

export function enVivoCourtKey(cancha: string | null | undefined): string {
  return formatCanchaDisplay(cancha).toLowerCase();
}

/** «Cancha 2» antes que «Cancha 10»; los nombres sin número, al final por orden alfabético. */
export function compareCourtLabels(a: string, b: string): number {
  const na = a.match(/(\d+)/);
  const nb = b.match(/(\d+)/);
  if (na && nb) {
    const diff = Number(na[1]) - Number(nb[1]);
    if (diff !== 0) return diff;
  } else if (na) {
    return -1;
  } else if (nb) {
    return 1;
  }
  return a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
}

function compareByStartThenCourt(a: EnVivoPartido, b: EnVivoPartido): number {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs;
  return compareCourtLabels(
    formatCanchaDisplay(a.cancha),
    formatCanchaDisplay(b.cancha)
  );
}

export function isEnVivoPartidoLive(
  partido: Pick<EnVivoPartido, "estado" | "programadoEn">,
  now: Date,
  durationMinutes: number = DEFAULT_PARTIDO_EN_VIVO_DURATION_MINUTES
): boolean {
  return isPartidoEnVivoWindow({
    estado: partido.estado,
    programado_en: partido.programadoEn,
    now,
    durationMinutes,
  });
}

export function buildEnVivoBoard(
  partidos: readonly EnVivoPartido[],
  now: Date,
  options?: { durationMinutes?: number }
): EnVivoBoard {
  const durationMinutes =
    options?.durationMinutes ?? DEFAULT_PARTIDO_EN_VIVO_DURATION_MINUTES;
  const nowMs = now.getTime();

  const lanes = new Map<string, EnVivoCourtLane>();
  const laneFor = (partido: EnVivoPartido): EnVivoCourtLane => {
    const key = enVivoCourtKey(partido.cancha);
    let lane = lanes.get(key);
    if (!lane) {
      lane = {
        key,
        label: formatCanchaDisplay(partido.cancha),
        live: null,
        next: null,
      };
      lanes.set(key, lane);
    }
    return lane;
  };

  const sorted = [...partidos].sort(compareByStartThenCourt);
  const live: EnVivoPartido[] = [];
  const upcoming: EnVivoPartido[] = [];

  for (const partido of sorted) {
    const lane = laneFor(partido);
    if (partido.estado === "jugado") continue;

    if (isEnVivoPartidoLive(partido, now, durationMinutes)) {
      live.push(partido);
      if (!lane.live) lane.live = partido;
      continue;
    }

    if (partido.startMs > nowMs) {
      upcoming.push(partido);
      if (!lane.next) lane.next = partido;
    }
  }

  live.sort((a, b) =>
    compareCourtLabels(formatCanchaDisplay(a.cancha), formatCanchaDisplay(b.cancha))
  );

  const courts = Array.from(lanes.values()).sort((a, b) =>
    compareCourtLabels(a.label, b.label)
  );

  return { live, courts, upcoming };
}

/** Minutos que faltan para `startMs` (redondeado hacia arriba, mínimo 0). */
export function minutesUntil(startMs: number, now: Date): number {
  return Math.max(0, Math.ceil((startMs - now.getTime()) / 60_000));
}

/** «en 5 min», «en 1 h 10 min»; null si falta más de 3 h. */
export function formatStartsIn(startMs: number, now: Date): string | null {
  const total = minutesUntil(startMs, now);
  if (total > 180) return null;
  if (total <= 1) return "en 1 min";
  if (total < 60) return `en ${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `en ${h} h` : `en ${h} h ${m} min`;
}
