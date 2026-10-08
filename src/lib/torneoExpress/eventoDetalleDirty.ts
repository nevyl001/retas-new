import type {
  TorneoExpressClasificacionModo,
  TorneoExpressEvento,
  TorneoExpressEventoLogoSource,
  TorneoExpressPartidoFormato,
} from "./types";

type EventoGuardado = Pick<
  TorneoExpressEvento,
  | "clasificacion_modo"
  | "partido_formato"
  | "logo_source"
  | "flyer_url"
  | "eliminatoria_inicio"
  | "eliminatoria_categoria_orden"
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

/** Reglas del formulario distintas a las guardadas en el evento. */
export function isReglasDirty(
  evento: EventoGuardado | null,
  draft: {
    clasificacionModo: TorneoExpressClasificacionModo;
    partidoFormato: TorneoExpressPartidoFormato;
    eliminatoriaInicio?: string | null;
    eliminatoriaCategoriaOrden?: readonly string[] | null;
  },
  defaultCategoriaOrden: readonly string[] = []
): boolean {
  if (!evento) return false;
  const savedInicio = evento.eliminatoria_inicio ?? null;
  const draftInicio = draft.eliminatoriaInicio ?? null;
  const draftOrden = draft.eliminatoriaCategoriaOrden ?? defaultCategoriaOrden;
  return (
    draft.clasificacionModo !== evento.clasificacion_modo ||
    draft.partidoFormato !== evento.partido_formato ||
    draftInicio !== savedInicio ||
    !sameIdList(defaultCategoriaOrden, draftOrden)
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
