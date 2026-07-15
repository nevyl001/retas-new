/** WhatsApp de contacto para solicitar el desbloqueo de modos de juego.
 * Único punto de verdad: usado por GameModeCard (grid de inicio) y
 * HomeCreateEventCta (selector "Nuevo evento"), para que ambas superficies
 * de modos bloqueados abran exactamente el mismo mensaje.
 */
const UNLOCK_WHATSAPP_NUMBER = "525514745677";
const UNLOCK_WHATSAPP_MESSAGE = "Me gustaría desbloquear todos los modos de juego";

export const UNLOCK_GAME_MODES_WHATSAPP_URL = `https://wa.me/${UNLOCK_WHATSAPP_NUMBER}?text=${encodeURIComponent(
  UNLOCK_WHATSAPP_MESSAGE
)}`;
