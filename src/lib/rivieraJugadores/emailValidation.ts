/**
 * Validación de correo para alta de jugadores NUEVOS de Riviera.
 *
 * Aplica únicamente a los formularios/servicios de alta de producto
 * (NuevoJugadorModal, AccountControlsPanel → createJugadorForAdmin →
 * createRivieraJugador). NO aplica a jugadores históricos ni a la creación
 * silenciosa vía sync/import de eventos (getOrCreateJugadorId), que sigue
 * funcionando igual que antes — ver comentarios en esos archivos.
 *
 * No implica confirmación de correo ni envío de emails: solo captura y
 * validación de formato.
 */

export const EMAIL_REQUIRED_MESSAGE = "El correo electrónico es obligatorio.";
export const EMAIL_INVALID_MESSAGE = "El correo electrónico no es válido.";

// Formato simple y permisivo (usuario@dominio.tld), suficiente para captura
// sin verificación real de entrega — no se envía ningún correo.
const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: string): boolean {
  return EMAIL_FORMAT_REGEX.test(email);
}

/** trim + lowercase, sin validar presencia ni formato. */
export function normalizeEmailInput(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * Para altas NUEVAS: normaliza y exige presencia + formato válido.
 * Lanza el mensaje exacto pedido por producto si falta o es inválido.
 */
export function normalizeRequiredEmail(raw: string | null | undefined): string {
  const normalized = normalizeEmailInput(raw);
  if (!normalized) throw new Error(EMAIL_REQUIRED_MESSAGE);
  if (!isValidEmailFormat(normalized)) throw new Error(EMAIL_INVALID_MESSAGE);
  return normalized;
}

/**
 * Para rutas históricas/sync (no son alta de producto): normaliza si hay
 * valor, pero nunca exige presencia. Devuelve null si viene vacío.
 */
export function normalizeOptionalEmail(
  raw: string | null | undefined
): string | null {
  const normalized = normalizeEmailInput(raw);
  return normalized || null;
}
