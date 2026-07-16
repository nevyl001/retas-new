import { updateTournament } from "../database";
import { updateDuelo2v2Details } from "../../services/duelo2v2Service";
import { looksLikeCanchaOnly } from "./whatsappShareMessage";
import type { OpenGameModeType } from "./types";

export type EntityConvocatoriaMetaInput = {
  mode: OpenGameModeType;
  entityId: string;
  /** Nombre del encuentro (entity title). */
  name?: string | null;
  /** Sede. Si parece solo cancha, se ignora como lugar. */
  locationLabel?: string | null;
  canchaLabel?: string | null;
  includeLugar?: boolean;
  scheduledAt?: string | null;
  /** Fin explícito; si falta, se deriva de durationMinutes. */
  scheduledUntil?: string | null;
  durationMinutes?: number | null;
};

function resolveUntil(
  startIso: string | null | undefined,
  untilIso: string | null | undefined,
  durationMinutes: number | null | undefined
): string | null {
  if (untilIso?.trim()) return untilIso.trim();
  if (!startIso?.trim()) return null;
  const mins =
    durationMinutes != null &&
    Number.isFinite(durationMinutes) &&
    durationMinutes > 0
      ? Math.round(durationMinutes)
      : null;
  if (mins == null) return null;
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  return new Date(start + mins * 60_000).toISOString();
}

function splitLugarCancha(
  locationLabel: string | null | undefined,
  canchaLabel: string | null | undefined
): { lugar: string | null; cancha: string | null } {
  const canchaExplicit = canchaLabel?.trim() || null;
  const loc = locationLabel?.trim() || null;
  if (canchaExplicit) {
    if (loc && !looksLikeCanchaOnly(loc)) {
      return { lugar: loc, cancha: canchaExplicit };
    }
    return { lugar: null, cancha: canchaExplicit };
  }
  if (loc && looksLikeCanchaOnly(loc)) {
    return { lugar: null, cancha: loc };
  }
  return { lugar: loc, cancha: null };
}

/**
 * Escribe meta de convocatoria en la entidad (SoT).
 * Best-effort: si faltan columnas en tournaments (patch no aplicado), no tumba el flujo.
 */
export async function syncConvocatoriaMetaToEntity(
  input: EntityConvocatoriaMetaInput
): Promise<void> {
  const id = input.entityId.trim();
  if (!id) return;

  const { lugar, cancha } = splitLugarCancha(
    input.locationLabel,
    input.canchaLabel
  );
  const programado_en = input.scheduledAt?.trim() || null;
  const programado_hasta = resolveUntil(
    programado_en,
    input.scheduledUntil,
    input.durationMinutes
  );
  const mostrar_lugar = input.includeLugar !== false;

  if (input.mode === "duelo_2v2") {
    const nombre = input.name?.trim();
    if (!nombre) {
      // updateDuelo2v2Details exige nombre; el caller debe pasar el de la entidad.
      return;
    }
    await updateDuelo2v2Details(id, {
      nombre,
      lugar: mostrar_lugar ? lugar ?? "" : "",
      mostrar_lugar,
      ...(cancha != null ? { cancha } : {}),
      programado_en,
      programado_hasta,
    });
    return;
  }

  try {
    await updateTournament(id, {
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      lugar: mostrar_lugar ? lugar : null,
      mostrar_lugar,
      cancha,
      programado_en,
      programado_hasta,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/lugar|cancha|programado_|column .* does not exist|42703/i.test(msg)) {
      // Patch tournaments aún no aplicado — el upsert open_reg sigue como fallback.
      return;
    }
    throw e;
  }
}
