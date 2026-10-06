import { formatCanchaDisplay } from "./canchaDisplay";
import { formatPartidoHora, partidoScheduleIso } from "./partidoSchedule";
import { mexicoScheduleSlotKey } from "./teScheduleTime";
import type {
  TorneoExpressEliminatoriaPartido,
  TorneoExpressPartido,
} from "./types";

/** Slot ocupado (cancha + horario) para el motor de programación. */
export type TeOccupiedCourtSlot = {
  programado_en: string;
  cancha: string;
  /** Categoría que ya usa ese horario, si se conoce. */
  categoriaLabel?: string;
};

function courtKeyForOccupancy(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) return "";
  const prefixed = v.match(/^cancha\s+(.+)$/i);
  const normalized = prefixed ? prefixed[1].trim() : v;
  return normalized.toLowerCase();
}

export type TeCourtCheckSource = "grupo" | "eliminatoria";

export type TeCourtCheckMeta = {
  categoriaLabel: string;
  parejaLocalLabel: string;
  parejaVisitanteLabel: string;
  source: TeCourtCheckSource;
  torneoId: string;
};

/** Partido usable en checks de cancha/horario, con meta opcional entre categorías. */
export type TeCourtCheckPartido = TorneoExpressPartido & {
  __teCourtMeta?: TeCourtCheckMeta;
};

export function getCourtCheckMeta(
  partido: TorneoExpressPartido | TeCourtCheckPartido
): TeCourtCheckMeta | undefined {
  return (partido as TeCourtCheckPartido).__teCourtMeta;
}

export function withCourtCheckMeta(
  partido: TorneoExpressPartido,
  meta: TeCourtCheckMeta
): TeCourtCheckPartido {
  return { ...partido, __teCourtMeta: meta };
}

export function eliminatoriaAsCourtCheckPartido(
  p: TorneoExpressEliminatoriaPartido,
  meta: TeCourtCheckMeta
): TeCourtCheckPartido {
  return withCourtCheckMeta(
    {
      id: p.id,
      grupo_id: "",
      pareja_local_id: p.pareja_local_id ?? "",
      pareja_visitante_id: p.pareja_visitante_id ?? "",
      puntos_local: p.puntos_local,
      puntos_visitante: p.puntos_visitante,
      sets_resultado: p.sets_resultado,
      ganador_id: p.ganador_id,
      estado: p.estado,
      cancha: p.cancha,
      programado_en: p.programado_en,
      created_at: p.created_at,
    },
    meta
  );
}

export function formatMatchupLabel(
  localLabel: string,
  visitLabel: string
): string {
  const a = localLabel.trim() || "Pareja";
  const b = visitLabel.trim() || "Pareja";
  return `${a} vs ${b}`;
}

export function formatCourtConflictDetails(
  conflict: TorneoExpressPartido | TeCourtCheckPartido
): string {
  const meta = getCourtCheckMeta(conflict);
  const hora = formatPartidoHora(partidoScheduleIso(conflict));
  const cancha = formatCanchaDisplay(conflict.cancha);
  if (!meta) {
    return `${cancha} a las ${hora}`;
  }
  const fase = meta.source === "eliminatoria" ? "eliminatoria" : "grupos";
  return `${cancha} · ${hora} · ${meta.categoriaLabel} (${fase}) · ${formatMatchupLabel(
    meta.parejaLocalLabel,
    meta.parejaVisitanteLabel
  )}`;
}

export function formatCourtOccupiedError(
  conflict: TorneoExpressPartido | TeCourtCheckPartido
): string {
  return `Cancha ocupada: ${formatCourtConflictDetails(
    conflict
  )}. Elige otra cancha u otro horario, o intercambia si te lo propone el sistema.`;
}

export function formatCourtSwapPrompt(input: {
  occupiedProgramadoEn: string;
  freedProgramadoEn: string;
  conflict: TorneoExpressPartido | TeCourtCheckPartido;
}): string {
  const horaOcupada = formatPartidoHora(input.occupiedProgramadoEn);
  const horaLiberada = formatPartidoHora(input.freedProgramadoEn);
  const details = formatCourtConflictDetails(input.conflict);
  return `Choque en ${details}. ¿Intercambiar horarios? Ese partido pasaría a las ${horaLiberada} y el tuyo quedaría a las ${horaOcupada}.`;
}

/** Clave estable `slot|cancha` para comparar ocupación entre categorías. */
export function occupiedCourtSlotKey(
  programadoEn: string | null | undefined,
  cancha: string | null | undefined
): string | null {
  if (!programadoEn?.trim()) return null;
  let slotKey: string;
  try {
    slotKey = mexicoScheduleSlotKey(programadoEn);
  } catch {
    return null;
  }
  const courtKey = courtKeyForOccupancy(cancha);
  if (!courtKey) return null;
  return `${slotKey}|${courtKey}`;
}

export function buildOccupiedCourtSlotSet(
  slots: TeOccupiedCourtSlot[]
): Set<string> {
  const set = new Set<string>();
  for (const slot of slots) {
    const key = occupiedCourtSlotKey(slot.programado_en, slot.cancha);
    if (key) set.add(key);
  }
  return set;
}

/** Convierte partidos (con o sin meta) a slots ocupados, omitiendo ids. */
export function courtSlotsFromPartidos(
  partidos: Array<TorneoExpressPartido | TeCourtCheckPartido>,
  options?: { excludeIds?: ReadonlySet<string> }
): TeOccupiedCourtSlot[] {
  const exclude = options?.excludeIds;
  const out: TeOccupiedCourtSlot[] = [];
  for (const partido of partidos) {
    if (exclude?.has(partido.id)) continue;
    const iso = partido.programado_en?.trim();
    if (!iso || !partido.cancha?.trim()) continue;
    const categoriaLabel = getCourtCheckMeta(partido)?.categoriaLabel?.trim();
    out.push({
      programado_en: iso,
      cancha: partido.cancha,
      ...(categoriaLabel ? { categoriaLabel } : {}),
    });
  }
  return out;
}
