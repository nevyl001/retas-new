import type {
  TorneoExpressClasificacionModo,
  TorneoExpressEvento,
  TorneoExpressEventoLogoSource,
  TorneoExpressPartidoFormato,
} from "./types";

type EventoGuardado = Pick<
  TorneoExpressEvento,
  "clasificacion_modo" | "partido_formato" | "logo_source" | "flyer_url"
>;

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
