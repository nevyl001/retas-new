/**
 * Plantillas iniciales del compositor manual.
 * El cuerpo se personaliza en UI; variables se resuelven y escapan al renderizar.
 */

import {
  type LigaMailBranding,
  resolveLigaMailBranding,
} from "./ligaMailBranding";
import {
  escapeHtml,
  renderPremiumEmailHtml,
} from "./renderPremiumEmailHtml";

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

export function extractJornadaDetailsFromText(
  cuerpo: string,
  fallbackSede?: string
): {
  cleanBody: string;
  jornadaCard: { fecha: string; horario: string; sede: string } | null;
} {
  const fechaMatch = cuerpo.match(/^[ \t]*Fecha:[ \t]*(.+)$/im);
  const horarioMatch = cuerpo.match(/^[ \t]*Horario:[ \t]*(.+)$/im);
  const sedeMatch = cuerpo.match(/^[ \t]*Sede:[ \t]*(.+)$/im);

  if (!fechaMatch && !horarioMatch) {
    return { cleanBody: cuerpo, jornadaCard: null };
  }

  const fecha = fechaMatch ? fechaMatch[1].trim() : "Por definir";
  const horario = horarioMatch ? horarioMatch[1].trim() : "Por definir";
  const sede = sedeMatch ? sedeMatch[1].trim() : fallbackSede || "Por definir";

  const cleanBody = cuerpo
    .replace(/^[ \t]*Fecha:[ \t]*.+$/gim, "")
    .replace(/^[ \t]*Horario:[ \t]*.+$/gim, "")
    .replace(/^[ \t]*Sede:[ \t]*.+$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    cleanBody,
    jornadaCard: {
      fecha: fecha || "Por definir",
      horario: horario || "Por definir",
      sede: sede || "Por definir",
    },
  };
}

/** HTML seguro: texto plano con saltos → párrafos escapados con diseño premium. */
export function renderComunicacionEmail(input: {
  clubNombre: string;
  ligaNombre: string;
  jugadorNombre: string;
  asunto: string;
  cuerpo: string;
  vistaPrevia: boolean;
  branding?: LigaMailBranding;
  replyTo?: string | null;
  tipo?: TipoComunicacionLiga;
  fecha?: string | null;
  horario?: string | null;
  ligaUrl?: string | null;
  jornadaUrl?: string | null;
  maxWidth?: number;
}): { subject: string; html: string; text: string } {
  const vars: VariablesComunicacion = {
    nombre: input.jugadorNombre.trim() || "Jugador",
    liga: input.ligaNombre.trim() || "la liga",
    club: input.clubNombre.trim() || "el club",
    fecha: input.fecha,
    horario: input.horario,
  };
  const subject = resolverVariablesComunicacion(input.asunto, vars).slice(0, 180);
  const cuerpoResuelto = resolverVariablesComunicacion(input.cuerpo, vars);
  const branding =
    input.branding ??
    resolveLigaMailBranding({
      clubNombre: vars.club,
    });

  const parsed = extractJornadaDetailsFromText(cuerpoResuelto, vars.club);
  const esJornada = input.tipo === "jornada" || Boolean(parsed.jornadaCard);

  const paragraphsHtml = parsed.cleanBody
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = escapeHtml(block).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">${lines}</p>`;
    })
    .join("");

  const reply = input.replyTo?.trim() ?? "";
  const footerNotice = reply
    ? "Puedes responder directamente a este correo para comunicarte con el club."
    : "Este aviso no recibe respuestas por correo. El club administra las comunicaciones de la liga.";

  const jornadaUrl = input.jornadaUrl?.trim() ?? "";
  let actionButton = null;
  if (esJornada && esUrlPublicaJornada(jornadaUrl)) {
    actionButton = {
      label: "VER MI JORNADA",
      url: jornadaUrl,
    };
  }

  const cierreDetalleHtml = esJornada
    ? `<div style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E5E7EB;">
        <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#111827;">
          RIVIERA OPEN
        </p>
        <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#475569;font-style:italic;">
          Compite. Juega limpio. Vive Riviera Open.
        </p>
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#0D0F12;">
          Cada partido cuenta.
        </p>
      </div>`
    : null;

  const title = esJornada && subject.toLowerCase().includes("jornada")
    ? "¡Tu próxima jornada te espera!"
    : subject;

  const html = renderPremiumEmailHtml({
    branding,
    asunto: subject,
    preheaderSnippet: parsed.cleanBody.slice(0, 140).replace(/\s+/g, " "),
    badgeLabel: vars.liga,
    title,
    paragraphsHtml: paragraphsHtml || `<p style="margin:0;color:#374151;"> </p>`,
    jornadaCard: parsed.jornadaCard,
    actionButton,
    cierreDetalleHtml,
    footerNotice,
    ligaUrl: input.ligaUrl,
    vistaPrevia: input.vistaPrevia,
    maxWidth: input.maxWidth ?? (esJornada ? 640 : 600),
  });

  const textLines = [
    input.vistaPrevia ? "VISTA PREVIA — este mensaje no se ha enviado" : "",
    branding.brandName,
    branding.isClubBranded ? branding.brandSupportLabel : "by Riviera Open",
    vars.liga,
    title,
    parsed.cleanBody,
    parsed.jornadaCard
      ? `TARJETA DE JORNADA:\nFecha: ${parsed.jornadaCard.fecha}\nHorario: ${parsed.jornadaCard.horario}\nSede: ${parsed.jornadaCard.sede}`
      : "",
    actionButton ? `${actionButton.label}: ${actionButton.url}` : "",
    esJornada
      ? "RIVIERA OPEN\nCompite. Juega limpio. Vive Riviera Open.\nCada partido cuenta."
      : "",
    footerNotice,
    input.ligaUrl ? `Ver la liga: ${input.ligaUrl}` : "",
    "Gestionado con Riviera Open",
  ].filter(Boolean);

  return { subject, html, text: textLines.join("\n\n") };
}
