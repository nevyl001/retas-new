/**
 * Catálogo único de mensajes motivantes para recordatorios de jornada.
 * Selección determinista (sin Math.random) por jugador + liga + jornada.
 */

export const MENSAJES_MOTIVANTES_RECORDATORIO = [
  "Una nueva jornada, una nueva oportunidad para demostrar tu juego. Entra con confianza, pelea cada punto y disfruta la competencia en la cancha.",
  "Cada partido es una oportunidad para mejorar. Confía en tu juego, apoya a tu pareja y deja que el esfuerzo hable en la cancha.",
  "Los grandes partidos se construyen punto a punto. Mantén la concentración, lee cada jugada con calma y disfruta cada intercambio.",
  "Tu mejor versión se construye jugando. Hoy tienes una nueva oportunidad de demostrarlo con actitud firme, foco y juego limpio.",
  "La diferencia está en los detalles: actitud, concentración y ganas de competir. Llega listo, comunica bien y disfruta la cancha.",
  "Cada punto cuenta, pero también cada experiencia. Juega con inteligencia, compite con pasión y sigue creciendo partido tras partido en la cancha.",
  "Llega con la mente clara y las piernas listas. Hoy se trata de competir limpio, comunicar bien y disfrutar el pádel.",
  "La constancia se nota en cada partido. Confía en tu preparación, disputa cada punto con intención y mantén el ritmo.",
  "No hace falta forzar el resultado: juega con calma, lee la cancha y mantén tu nivel de principio a fin del partido.",
  "El pádel premia a quien insiste. Mantén la actitud, comunica con tu pareja, pelea los balls difíciles y disfruta el duelo.",
  "Hoy vuelve la competencia. Enfócate en tu primer saque, en el siguiente volley y en cada decisión dentro de la cancha.",
  "Entrena la cabeza tanto como el brazo. Concentración, paciencia y juego limpio te llevan lejos en cada jornada bien disputada.",
  "Una jornada más para medir tu progreso. Compite con respeto, exige tu nivel y sal de la cancha mejor que llegaste.",
  "Cuando llega el momento, lo importante es estar presente. Respira, confía en tu juego y disfruta cada rally con atención.",
  "La superación se construye partido a partido. Hoy es otra chance de demostrar tu compromiso y tu lectura de juego.",
  "Juega con carácter sin perder la cabeza. El control emocional también forma parte del buen pádel competitivo de alto nivel.",
  "Confía en tu pareja y en tu lectura de juego. Juntos suman más en cada punto disputado y en cada transición.",
  "El ritmo lo marcas tú. Empieza sólido, mantén la intensidad en los momentos clave y cierra el partido con inteligencia.",
  "Hoy no se trata de impresionar: se trata de competir bien, punto a punto, con orden y hasta el final del cruce.",
  "La cancha espera tu mejor actitud. Disfruta el cruce, pelea los balls difíciles y sigue creciendo con cada partido jugado.",
  "Cada jornada deja una lección. Entra con ganas de aprender, de competir al máximo y de disfrutar el juego limpio.",
  "El buen pádel combina precisión y garra. Busca ese equilibrio hoy en cada intercambio y en cada decisión importante en la cancha.",
  "Mantén la energía alta y el ego bajo. El juego limpio también es una forma clara de ganar respeto en la cancha.",
  "Si el punto se complica, vuelve a lo básico: buena posición, comunicación clara y una decisión firme en la cancha.",
  "Hoy tienes espacio para mejorar un detalle. Elige uno, concéntrate en él y compite con intención de principio a fin.",
  "La rivalidad sana empuja hacia arriba. Respeta al rival, exige tu mejor versión y disfruta cada cruce con buena cabeza.",
  "No subestimes un partido corto ni te apures en uno largo. Juega el punto que tienes delante con cabeza fría.",
  "La constancia vence a la prisa. Llega enfocado, mantén el plan de juego y cierra cada set con claridad total.",
  "Tu progreso se nota cuando compites con propósito. Hoy es otro paso firme en tu camino dentro de la liga.",
  "Disfruta el sonido de la pelota y el reto de cada jugada. Estás aquí para competir limpio y seguir creciendo.",
  "Actitud firme y manos suaves. Ese equilibrio define partidos difíciles, jornadas largas y duelos bien jugados durante toda la competencia.",
  "Que la presión no te robe el gusto por jugar. Compite en serio, respira entre puntos y disfruta el pádel de verdad.",
] as const;

export type MensajeMotivanteRecordatorio =
  (typeof MENSAJES_MOTIVANTES_RECORDATORIO)[number];

const PARRAFO_FECHA_HORARIO_DUPLICADO =
  /^[ \t]*La Jornada \d+ de .+ es el \d{2}\/\d{2}\/\d{4} a las \d{2}:\d{2} hrs\.?[ \t]*$/gim;

export type SemillaMensajeRecordatorio = {
  jugadorId: string;
  ligaId: string;
  jornadaNumero: number;
  jornadaId?: string | null;
};

/** Hash estable FNV-1a 32-bit (sin crypto, idéntico en Node y Edge). */
export function hashEstableMensaje(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function semillaCanonina(input: SemillaMensajeRecordatorio): string {
  const jugador = input.jugadorId.trim().toLowerCase();
  const liga = input.ligaId.trim().toLowerCase();
  const jornada = String(Math.max(0, Math.floor(Number(input.jornadaNumero) || 0)));
  const jornadaId = (input.jornadaId ?? "").trim().toLowerCase();
  return `${jugador}|${liga}|${jornada}|${jornadaId}`;
}

/**
 * Elige un mensaje del catálogo de forma determinista.
 * Si el índice coincidiría con el de la jornada anterior, avanza uno
 * (cuando el catálogo tiene más de un mensaje).
 */
export function seleccionarMensajeMotivanteRecordatorio(
  input: SemillaMensajeRecordatorio
): MensajeMotivanteRecordatorio {
  const catalogo: readonly string[] = MENSAJES_MOTIVANTES_RECORDATORIO;
  const n = catalogo.length;
  const actual = hashEstableMensaje(semillaCanonina(input)) % n;
  if (n <= 1) return catalogo[0] as MensajeMotivanteRecordatorio;
  const previa = seleccionarIndiceSinAntiRepeticion({
    ...input,
    jornadaNumero: Math.max(0, Math.floor(Number(input.jornadaNumero) || 0) - 1),
  });
  const elegido =
    actual === previa ? catalogo[(actual + 1) % n] : catalogo[actual];
  return elegido as MensajeMotivanteRecordatorio;
}

function seleccionarIndiceSinAntiRepeticion(
  input: SemillaMensajeRecordatorio
): number {
  const n = MENSAJES_MOTIVANTES_RECORDATORIO.length;
  return hashEstableMensaje(semillaCanonina(input)) % n;
}

/** Quita el párrafo que repetía fecha/horario junto a la tarjeta. */
export function cuerpoRecordatorioSinFechaDuplicada(cuerpo: string): string {
  return cuerpo
    .replace(PARRAFO_FECHA_HORARIO_DUPLICADO, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cuerpoYaTieneMensajeMotivante(cuerpo: string): boolean {
  const texto = cuerpo.trim();
  return MENSAJES_MOTIVANTES_RECORDATORIO.some((mensaje) => texto.includes(mensaje));
}

/**
 * Normaliza el cuerpo del recordatorio: sin párrafo de fecha duplicado y
 * con mensaje motivante estable si se aporta semilla.
 */
export function asegurarCuerpoRecordatorioMotivante(
  cuerpo: string,
  semilla?: SemillaMensajeRecordatorio | null
): string {
  let limpio = cuerpoRecordatorioSinFechaDuplicada(cuerpo);
  if (cuerpoYaTieneMensajeMotivante(limpio)) return limpio;
  if (!semilla?.jugadorId?.trim() || !semilla.ligaId?.trim()) return limpio;
  const mensaje = seleccionarMensajeMotivanteRecordatorio(semilla);
  const saludo = limpio.match(/^Hola[^\n]*,[ \t]*\n*/i);
  if (saludo) {
    const resto = limpio.slice(saludo[0].length).replace(/^\n+/, "");
    return `${saludo[0].trim()}\n\n${mensaje}${resto ? `\n\n${resto}` : ""}`.trim();
  }
  return `${mensaje}\n\n${limpio}`.trim();
}
