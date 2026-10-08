import type {
  TorneoExpressClasificacionModo,
  TorneoExpressEvento,
  TorneoExpressEventoLogoSource,
  TorneoExpressFaseEliminacion,
  TorneoExpressPartidoFormato,
} from "./types";
import {
  normalizeEliminatoriaCanchas,
  sameCategoriaRondas,
  sameEliminatoriaDuraciones,
  type EliminatoriaRondaKey,
} from "./eliminatoriaCategoriaOrden";

type EventoGuardado = Pick<
  TorneoExpressEvento,
  | "clasificacion_modo"
  | "partido_formato"
  | "logo_source"
  | "flyer_url"
  | "eliminatoria_inicio"
  | "eliminatoria_categoria_orden"
  | "eliminatoria_canchas"
  | "eliminatoria_duraciones"
>;

function sameIdList(
  a: readonly string[] | null | undefined,
  b: readonly string[] | null | undefined
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

function sameInicioIso(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = a?.trim() || "";
  const right = b?.trim() || "";
  if (left === right) return true;
  if (!left || !right) return false;
  const leftMs = new Date(left).getTime();
  const rightMs = new Date(right).getTime();
  return Number.isFinite(leftMs) && leftMs === rightMs;
}

/** Reglas del formulario distintas a las guardadas en el evento. */
export function isReglasDirty(
  evento: EventoGuardado | null,
  draft: {
    clasificacionModo: TorneoExpressClasificacionModo;
    partidoFormato: TorneoExpressPartidoFormato;
  }
): boolean {
  if (!evento) return false;
  return (
    draft.clasificacionModo !== evento.clasificacion_modo ||
    draft.partidoFormato !== evento.partido_formato
  );
}

/** Horario, orden y canchas de eliminatoria distintos a lo guardado. */
export function isEliminatoriaConfigDirty(
  evento: EventoGuardado | null,
  draft: {
    eliminatoriaInicio?: string | null;
    eliminatoriaCategoriaOrden?: readonly string[] | null;
    eliminatoriaCanchas?: readonly string[] | null;
    eliminatoriaDuraciones?: unknown;
    categoriaRondas?: Record<string, readonly EliminatoriaRondaKey[]>;
  },
  defaultCategoriaOrden: readonly string[] = [],
  categorias: ReadonlyArray<{
    id: string;
    fase_eliminacion?: TorneoExpressFaseEliminacion | null;
  }> = []
): boolean {
  if (!evento) return false;
  const savedInicio = evento.eliminatoria_inicio ?? null;
  const draftInicio = draft.eliminatoriaInicio ?? null;
  const draftOrden = draft.eliminatoriaCategoriaOrden ?? defaultCategoriaOrden;
  const savedCanchas = normalizeEliminatoriaCanchas(
    evento.eliminatoria_canchas
  );
  const draftCanchas = normalizeEliminatoriaCanchas(draft.eliminatoriaCanchas);
  return (
    !sameInicioIso(draftInicio, savedInicio) ||
    !sameIdList(defaultCategoriaOrden, draftOrden) ||
    !sameIdList(savedCanchas, draftCanchas) ||
    !sameEliminatoriaDuraciones(
      evento.eliminatoria_duraciones,
      draft.eliminatoriaDuraciones
    ) ||
    !sameCategoriaRondas(categorias, draft.categoriaRondas ?? {})
  );
}

/**
 * Branding del formulario distinto al guardado. Compara con los mismos valores
 * con que `load` inicializa el formulario (flyer sin espacios, null ≡ ""), de modo
 * que un evento recién cargado nunca aparece como modificado.
 */
export function isBrandingDirty(
  evento: EventoGuardado | null,
  draft: { logoSource: TorneoExpressEventoLogoSource; flyerUrl: string }
): boolean {
  if (!evento) return false;
  return (
    draft.logoSource !== evento.logo_source ||
    draft.flyerUrl.trim() !== (evento.flyer_url ?? "").trim()
  );
}
