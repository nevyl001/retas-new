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
    asunto: "Próxima jornada — {{liga}}",
    cuerpo:
      "Hola {{nombre}},\n\nTe informamos sobre la próxima jornada de {{liga}}.\n\nFecha:\nHorario:\nSede:\n\n{{club}}",
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

export function resolverVariablesComunicacion(
  plantilla: string,
  vars: { nombre: string; liga: string; club: string }
): string {
  return plantilla
    .replace(/\{\{\s*nombre\s*\}\}/gi, vars.nombre)
    .replace(/\{\{\s*liga\s*\}\}/gi, vars.liga)
    .replace(/\{\{\s*club\s*\}\}/gi, vars.club);
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
}): { subject: string; html: string; text: string } {
  const vars = {
    nombre: input.jugadorNombre.trim() || "Jugador",
    liga: input.ligaNombre.trim() || "la liga",
    club: input.clubNombre.trim() || "el club",
  };
  const subject = resolverVariablesComunicacion(input.asunto, vars).slice(0, 180);
  const cuerpoResuelto = resolverVariablesComunicacion(input.cuerpo, vars);
  const branding =
    input.branding ??
    resolveLigaMailBranding({
      clubNombre: vars.club,
    });

  const paragraphsHtml = cuerpoResuelto
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

  const html = renderPremiumEmailHtml({
    branding,
    asunto: subject,
    preheaderSnippet: cuerpoResuelto.slice(0, 140).replace(/\s+/g, " "),
    badgeLabel: vars.liga,
    title: subject,
    paragraphsHtml: paragraphsHtml || `<p style="margin:0;color:#374151;"> </p>`,
    footerNotice,
    vistaPrevia: input.vistaPrevia,
  });

  const textLines = [
    input.vistaPrevia ? "VISTA PREVIA — este mensaje no se ha enviado" : "",
    branding.brandName,
    branding.isClubBranded ? branding.brandSupportLabel : "",
    vars.liga,
    subject,
    cuerpoResuelto,
    footerNotice,
    "Gestionado con Riviera Open",
  ].filter(Boolean);

  return { subject, html, text: textLines.join("\n\n") };
}
