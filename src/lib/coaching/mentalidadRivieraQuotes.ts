/**
 * Colección local de frases motivacionales para el dashboard Mi Coaching ("MENTALIDAD RIVIERA").
 *
 * Reglas de diseño:
 * - Mínimo 60 frases originales, naturales y profesionales sobre entrenamiento,
 *   disciplina, progreso y mentalidad competitiva en pádel.
 * - Selección determinística por fecha calendario local (YYYY-MM-DD).
 * - Sin llamadas externas, sin consultas a Supabase y sin emojis.
 * - Sin repeticiones en días consecutivos (permutación coprima sobre el día calendario).
 */

export const MENTALIDAD_RIVIERA_QUOTES: readonly string[] = [
  "La constancia en cada entrenamiento construye la confianza en cada partido.",
  "En pádel no gana quien pega más fuerte, sino quien toma mejores decisiones.",
  "Cada sesión en cancha te acerca al jugador que quieres ser.",
  "La técnica mejora con repetición; la mentalidad mejora con disciplina.",
  "Dominar el ritmo del punto es parte de tu evolución como jugador.",
  "Un buen golpe suma un punto; una buena lectura cambia el partido.",
  "Entrenar con intención marca la diferencia cuando el marcador aprieta.",
  "Tu progreso se construye pelota a pelota.",
  "La paciencia en defensa abre el espacio para definir en la red.",
  "Hoy entrenas los recursos que mañana saldrán de forma natural.",
  "Preparar los pies antes del impacto es el primer secreto de un golpe limpio.",
  "El cristal no es un obstáculo, es un aliado que te da tiempo para reorganizarte.",
  "Un globo profundo y bien medido vale tanto como un remate ganador.",
  "Mantener la calma en el punto de oro refleja la calidad de tu entrenamiento.",
  "La posición en la cancha se gana con orden táctico, no con prisa.",
  "Cada corrección técnica en clase es una ventaja futura en competencia.",
  "Saber cuándo acelerar y cuándo pausar la bola define a un jugador completo.",
  "El trabajo silencioso en el cesto sostiene la seguridad en el tie-break.",
  "Defender una bola difícil construye carácter y desgasta la iniciativa del rival.",
  "La comunicación con tu compañero empieza desde cómo ocupas los espacios.",
  "No busques el golpe perfecto en cada bola; busca la decisión correcta para cada situación.",
  "La bandeja no busca terminar el punto, sino conservar la iniciativa en la red.",
  "Cerrar los ángulos en la volea exige atención constante y piernas activas.",
  "El jugador que aprende a disfrutar el proceso de ajuste nunca deja de crecer.",
  "Una buena transición del fondo a la red empieza con un golpe que te dé tiempo.",
  "La regularidad no es jugar conservador, es ejecutar con alto margen y propósito.",
  "Recuperar el centro después de cada golpe mantiene sólida a toda la pareja.",
  "Los partidos cerrados se definen por los detalles que entrenas cuando nadie mira.",
  "Controlar la altura sobre la red reduce errores y presiona al rival a levantar la bola.",
  "La lectura del bote después del cristal mejora cuando anticipas la trayectoria con calma.",
  "Un entrenamiento productivo se mide por la claridad de tu objetivo al entrar a cancha.",
  "Aceptar el error y ajustar en el siguiente punto es la base de la fortaleza mental.",
  "La volea de bloqueo firme transforma la velocidad del rival en una ventaja propia.",
  "Mantener el armado corto en el fondo te permite responder con solvencia ante bolas rápidas.",
  "La disciplina táctica convierte una defensa incómoda en una oportunidad de contraataque.",
  "Escuchar el ritmo del partido te permite elegir cuándo cambiar la dirección del juego.",
  "La confianza real nace de saber que has practicado ese golpe cientos de veces.",
  "Jugar cruzado ofrece margen y distancia; cambiar al paralelo exige el momento justo.",
  "El calentamiento consciente prepara el cuerpo para reaccionar medio segundo antes.",
  "Un jugador inteligente adapta su estrategia según las condiciones de la cancha y del rival.",
  "La chiquita bien ejecutada obliga al rival a volear desde abajo y te entrega la red.",
  "Acompañar la bola con el peso del cuerpo da profundidad sin necesidad de forzar el brazo.",
  "La verdadera evolución se nota cuando tus golpes de seguridad son cada vez más firmes.",
  "Respirar entre punto y punto limpia la mente y renueva el enfoque táctico.",
  "Sostener el peloteo un golpe más que el rival suele abrir el hueco definitivo.",
  "La precisión en el saque te permite tomar la red con ventaja desde el primer impacto.",
  "Entender por qué fallaste una bola es más valioso que lamentar el punto perdido.",
  "El respeto por los fundamentos técnicos hace que tu juego sea confiable bajo presión.",
  "Un paso de ajuste a tiempo evita tener que resolver el golpe en postura forzada.",
  "Ganar la red es importante; saber mantenerla con paciencia es lo que consolida el set.",
  "La víbora bien dirigida presiona la esquina y limita las opciones de salida del rival.",
  "Cada sesión con tu entrenador suma herramientas a tu repertorio en cancha.",
  "La concentración no es tensión; es estar plenamente presente en la bola que viene.",
  "Cuando el partido se complica, volver a los básicos ordena tu juego de inmediato.",
  "La salida de pared sólida empieza por dejar entrar la bola y acompañarla hacia adelante.",
  "Medir tu avance contra ti mismo hace que cada semana de práctica tenga sentido.",
  "Un jugador completo cuida tanto su golpe de definición como su capacidad de recuperación.",
  "La lectura del hombro del rival te anticipa hacia dónde cubrir antes del impacto.",
  "Convertir un hábito técnico en automático requiere paciencia, enfoque y repetición.",
  "En la red, menos swing y más firmeza de muñeca garantizan control y profundidad.",
  "La actitud entre puntos define cómo vas a competir el siguiente juego.",
  "Construir el punto con orden hace que la definición llegue como consecuencia natural.",
  "El progreso sostenible en pádel combina técnica depurada, criterio táctico y temple.",
  "Cada hora de entrenamiento bien aprovechada eleva tu piso competitivo en cancha.",
] as const;

export interface DailyMentalidadQuote {
  quote: string;
  index: number;
  dateKey: string;
}

/**
 * Formatea una instancia Date como fecha calendario local YYYY-MM-DD.
 */
export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Convierte una clave YYYY-MM-DD (o Date local) en un contador entero de días calendario
 * sin verse afectado por cambios de horario de verano (DST).
 */
export function getCalendarDayNumberFromDateKey(dateKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) {
    const now = new Date();
    return Math.floor(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000,
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Obtiene la frase motivacional determinística correspondiente a la fecha local.
 * Usa un paso multiplicativo coprimo con la longitud de la colección (gcd(19, 64) = 1),
 * garantizando recorrido completo y cero repeticiones en días consecutivos.
 */
export function getDailyMentalidadRivieraQuote(
  dateOrKey: Date | string = new Date(),
): DailyMentalidadQuote {
  const dateKey =
    typeof dateOrKey === "string"
      ? dateOrKey.trim()
      : getLocalDateKey(dateOrKey);
  const dayNumber = getCalendarDayNumberFromDateKey(dateKey);
  const total = MENTALIDAD_RIVIERA_QUOTES.length;
  // 19 es coprimo con 64 (2^6), por lo que recorre las 64 frases sin repetir hasta agotar el ciclo.
  const step = 19;
  const offset = 11;
  const index = (((dayNumber * step + offset) % total) + total) % total;

  return {
    quote: MENTALIDAD_RIVIERA_QUOTES[index],
    index,
    dateKey,
  };
}
