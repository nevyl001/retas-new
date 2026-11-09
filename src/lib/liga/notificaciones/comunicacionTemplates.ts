/**
 * Plantillas iniciales del compositor manual.
 * El cuerpo se personaliza en UI; variables se resuelven y escapan al renderizar.
 */

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

/** HTML seguro: texto plano con saltos → párrafos escapados. */
export function renderComunicacionEmail(input: {
  clubNombre: string;
  ligaNombre: string;
  jugadorNombre: string;
  asunto: string;
  cuerpo: string;
  vistaPrevia: boolean;
}): { subject: string; html: string } {
  const vars = {
    nombre: input.jugadorNombre.trim() || "Jugador",
    liga: input.ligaNombre.trim() || "la liga",
    club: input.clubNombre.trim() || "el club",
  };
  const subject = resolverVariablesComunicacion(input.asunto, vars).slice(0, 180);
  const cuerpoResuelto = resolverVariablesComunicacion(input.cuerpo, vars);
  const paragraphs = cuerpoResuelto
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = escapeHtml(block).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#111;">${lines}</p>`;
    })
    .join("");

  const previewBanner = input.vistaPrevia
    ? `<div style="background:#111;color:#fff;text-align:center;padding:8px 12px;font-size:12px;letter-spacing:.08em;">VISTA PREVIA</div>`
    : "";

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
${previewBanner}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e5e5e5;">
      <tr><td style="padding:28px 28px 8px;">
        <p style="margin:0 0 4px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#666;">${escapeHtml(vars.club)}</p>
        <h1 style="margin:0 0 20px;font-size:22px;line-height:1.25;color:#111;">${escapeHtml(subject)}</h1>
        ${paragraphs || `<p style="margin:0;color:#111;"> </p>`}
      </td></tr>
      <tr><td style="padding:8px 28px 28px;">
        <p style="margin:0;font-size:12px;color:#777;">Comunicación deportiva de ${escapeHtml(vars.liga)}. Este aviso no recibe respuestas por correo.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html };
}
