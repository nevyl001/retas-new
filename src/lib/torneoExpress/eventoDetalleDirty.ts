import type {
  TorneoExpressClasificacionModo,
  TorneoExpressEvento,
  TorneoExpressEventoLogoSource,
  TorneoExpressFaseEliminacion,
  TorneoExpressPartidoFormato,
} from "./types";
import {
  defaultFaseBloques,
  faseBloqueKey,
  normalizeEliminatoriaCanchas,
  parseFaseOrden,
  reconcileFaseBloques,
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

function parseInicioMs(value: string): number {
  const trimmed = value.trim();
  const direct = new Date(trimmed).getTime();
  if (Number.isFinite(direct)) return direct;
  const normalized = trimmed
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const fallback = new Date(normalized).getTime();
  return Number.isFinite(fallback) ? fallback : Number.NaN;
}

function sameInicioIso(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = a?.trim() || "";
  const right = b?.trim() || "";
  if (left === right) return true;
  if (!left || !right) return false;
  const leftMs = parseInicioMs(left);
  const rightMs = parseInicioMs(right);
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
    faseOrden?: readonly string[] | null;
  },
  defaultCategoriaOrden: readonly string[] = [],
  categorias: ReadonlyArray<{
    id: string;
    nombre?: string;
    categoria?: string | null;
    fase_eliminacion?: TorneoExpressFaseEliminacion | null;
  }> = []
): boolean {
  if (!evento) return false;
  const savedInicio = evento.eliminatoria_inicio ?? null;
  const draftInicio = draft.eliminatoriaInicio ?? null;
  const draftOrden = draft.eliminatoriaCategoriaOrden ?? defaultCategoriaOrden;
  const ordenHydrating =
    draftOrden.length === 0 && categorias.length > 0;
  const savedCanchas = normalizeEliminatoriaCanchas(
    evento.eliminatoria_canchas
  );
  const draftCanchas = normalizeEliminatoriaCanchas(draft.eliminatoriaCanchas);
  const faseDirty = (() => {
    if (!draft.faseOrden) return false;
    const expected = reconcileFaseBloques(
      parseFaseOrden(evento.eliminatoria_duraciones),
      defaultFaseBloques(
        categorias.map((cat) => ({
          ...cat,
          nombre: cat.nombre ?? cat.id,
        })),
        defaultCategoriaOrden,
        draft.categoriaRondas
      )
    ).map(faseBloqueKey);
    return !sameIdList(expected, draft.faseOrden);
  })();
  return (
    !sameInicioIso(draftInicio, savedInicio) ||
    (!ordenHydrating && !sameIdList(defaultCategoriaOrden, draftOrden)) ||
    !sameIdList(savedCanchas, draftCanchas) ||
    !sameEliminatoriaDuraciones(
      evento.eliminatoria_duraciones,
      draft.eliminatoriaDuraciones
    ) ||
    !sameCategoriaRondas(categorias, draft.categoriaRondas ?? {}) ||
    faseDirty
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
