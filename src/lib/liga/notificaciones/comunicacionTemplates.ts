/**
 * Plantillas iniciales del compositor manual.
 * El cuerpo se personaliza en UI; variables se resuelven y escapan al renderizar.
 */

import {
  type LigaMailBranding,
  resolveLigaMailBranding,
} from "./ligaMailBranding";
import { extractJornadaDetailsFromText, renderCorreoComunicacion } from "./correoCompartido";

export { extractJornadaDetailsFromText };

export type TipoComunicacionLiga =
  | "bienvenida"
  | "aviso_general"
  | "jornada"
  | "cambio_horario"
  | "felicitacion"
  | "personalizado";

export interface PlantillaComunicacion {
  id: TipoComunicacionLiga;
  label: string;
  asunto: string;
  cuerpo: string;
}

export const PLANTILLAS_COMUNICACION: PlantillaComunicacion[] = [
  {
    id: "bienvenida",
    label: "Bienvenida a la liga",
    asunto: "Bienvenido a {{liga}}",
    cuerpo:
      "Hola {{nombre}},\n\nTe damos la bienvenida a {{liga}} de {{club}}.\n\nPronto recibirás más información sobre jornadas y resultados.\n\n¡Nos vemos en la cancha!",
  },
  {
    id: "aviso_general",
    label: "Aviso general",
    asunto: "Aviso de {{liga}}",
    cuerpo:
      "Hola {{nombre}},\n\nTe compartimos un aviso de {{liga}}:\n\n[Escribe aquí el aviso]\n\nGracias,\n{{club}}",
  },
  {
    id: "jornada",
    label: "Información de próxima jornada",
    asunto: "¡Tu próxima jornada te espera! — {{liga}}",
    cuerpo:
      "Hola {{nombre}},\n\n¡La emoción continúa en {{liga}}!\n\nUna nueva jornada está por comenzar y es momento de volver a la cancha, demostrar tu nivel y seguir superándote.\n\nCada game cuenta, cada partido suma y cada jornada es una oportunidad para mejorar tu ranking y seguir construyendo tu historia deportiva.\n\nLlega con toda la actitud, disfruta cada punto y deja todo en la cancha.\n\n¡Nos vemos en la próxima jornada!\n\nFecha: {{fecha}}\nHorario: {{horario}}\nSede: {{club}}",
  },
  {
    id: "cambio_horario",
    label: "Cambio de horario o sede",
    asunto: "Cambio de horario/sede — {{liga}}",
    cuerpo:
      "Hola {{nombre}},\n\nHubo un cambio en {{liga}}:\n\nAntes:\nAhora:\n\nDisculpa las molestias.\n\n{{club}}",
  },
  {
    id: "felicitacion",
    label: "Felicitación o comunicado",
    asunto: "Comunicado — {{liga}}",
    cuerpo:
      "Hola {{nombre}},\n\nQueremos compartirte un mensaje de {{liga}}.\n\n[Escribe aquí el comunicado]\n\n{{club}}",
  },
  {
    id: "personalizado",
    label: "Mensaje personalizado",
    asunto: "Mensaje de {{liga}}",
    cuerpo: "Hola {{nombre}},\n\n[Escribe tu mensaje]\n\n{{club}}",
  },
];

export function plantillaPorId(
  id: string | null | undefined
): PlantillaComunicacion {
  return (
    PLANTILLAS_COMUNICACION.find((item) => item.id === id) ??
    PLANTILLAS_COMUNICACION[0]
  );
}

/** La jornada que el correo debe abrir: la que está en juego, o la próxima si ninguna empezó. */
export function jornadaEnCursoParaCorreo(
  jornadas: ReadonlyArray<{ numero: number; estado: string }>
): { numero: number; estado: "in_progress" | "upcoming" } | null {
  const validas = jornadas.filter(
    (jornada) => Number.isInteger(jornada.numero) && jornada.numero >= 1
  );
  const enCurso = validas
    .filter((jornada) => jornada.estado === "in_progress")
    .sort((a, b) => a.numero - b.numero)[0];
  if (enCurso) return { numero: enCurso.numero, estado: "in_progress" };
  const proxima = validas
    .filter((jornada) => jornada.estado === "upcoming")
    .sort((a, b) => a.numero - b.numero)[0];
  if (proxima) return { numero: proxima.numero, estado: "upcoming" };
  return null;
}

export function rutaPublicaJornada(ligaId: string, numero: number): string | null {
  if (!/^[A-Za-z0-9-]+$/.test(ligaId)) return null;
  if (!Number.isInteger(numero) || numero < 1) return null;
  return `/public/liga/${ligaId}/jornada/${numero}`;
}

export function esUrlPublicaJornada(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim(), "https://appriviera.rivieraopen.com");
    return (
      parsed.protocol === "https:" || parsed.protocol === "http:"
    ) && /^\/public\/liga\/[^/]+\/jornada\/\d+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export interface VariablesComunicacion {
  nombre: string;
  liga: string;
  club: string;
  fecha?: string | null;
  horario?: string | null;
}

export function resolverVariablesComunicacion(
  plantilla: string,
  vars: VariablesComunicacion
): string {
  const fechaVal = vars.fecha?.trim() || "Por definir";
  const horarioVal = vars.horario?.trim() || "Por definir";
  return plantilla
    .replace(/\{\{\s*nombre\s*\}\}/gi, vars.nombre)
    .replace(/\{\{\s*liga\s*\}\}/gi, vars.liga)
    .replace(/\{\{\s*club\s*\}\}/gi, vars.club)
    .replace(/\{\{\s*fecha\s*\}\}/gi, fechaVal)
    .replace(/\{\{\s*horario\s*\}\}/gi, horarioVal);
}

/** HTML seguro: resuelve variables y usa el mismo generador que el worker. */
export function renderComunicacionEmail(input: {
  clubNombre: string;
  ligaNombre: string;
  jugadorNombre: string;
  asunto: string;
  cuerpo: string;
  vistaPrevia: boolean;
  branding?: LigaMailBranding;
  replyTo?: string | null;
  tipo?: string | null;
  fecha?: string | null;
  horario?: string | null;
  ligaUrl?: string | null;
  jornadaUrl?: string | null;
  etiquetaBoton?: string | null;
  jugadorId?: string | null;
  ligaId?: string | null;
  jornadaId?: string | null;
  jornadaNumero?: number | null;
}): { subject: string; html: string; text: string } {
  const vars: VariablesComunicacion = {
    nombre: input.jugadorNombre.trim() || "Jugador",
    liga: input.ligaNombre.trim() || "la liga",
    club: input.clubNombre.trim() || "el club",
    fecha: input.fecha,
    horario: input.horario,
  };
  const branding =
    input.branding ??
    resolveLigaMailBranding({
      clubNombre: vars.club,
    });
  const render = renderCorreoComunicacion({
    clubNombre: vars.club,
    ligaNombre: vars.liga,
    asunto: resolverVariablesComunicacion(input.asunto, vars),
    cuerpo: resolverVariablesComunicacion(input.cuerpo, vars),
    branding,
    tipo: input.tipo,
    ligaUrl: input.ligaUrl,
    jornadaUrl: input.jornadaUrl,
    etiquetaBoton: input.etiquetaBoton,
    vistaPrevia: input.vistaPrevia,
    replyTo: input.replyTo,
    jugadorId: input.jugadorId,
    ligaId: input.ligaId,
    jornadaId: input.jornadaId,
    jornadaNumero: input.jornadaNumero,
  });
  return { subject: render.asunto, html: render.html, text: render.text };
}
