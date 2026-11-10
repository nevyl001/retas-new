/**
 * Único generador HTML de las comunicaciones de liga.
 * Lo usan la vista previa y el worker. No envía correos ni lee secretos.
 */
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import type { LigaMailBranding } from "./ligaMailBranding.ts";
import {
  escapeHtml,
  renderPremiumEmailHtml,
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
} from "./renderPremiumEmailHtml.ts";

const MARCA_RESULTADOS = /^RESULTADOS_URL:(\S+)\s*$/m;
const AVISO_PRUEBA =
  "ESTE ES UN CORREO DE PRUEBA. NO CORRESPONDE A UNA NOTIFICACIÓN OFICIAL.";

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

export function cuerpoSinMarcaResultados(cuerpo: string): string {
  return cuerpo.replace(MARCA_RESULTADOS, "").replace(/\n{3,}/g, "\n\n").trim();
}

/** Enlace absoluto de la jornada. La URL explícita gana; si no, la marca del texto. */
export function enlacePublicoJornada(input: {
  cuerpo: string;
  ligaUrl?: string | null;
  jornadaUrl?: string | null;
}): string | null {
  const explicita = urlJornadaAbsoluta(input.jornadaUrl);
  if (explicita) return explicita;
  const match = input.cuerpo.match(MARCA_RESULTADOS);
  if (!match) return null;
  const raw = match[1];
  if (raw.startsWith("/public/liga/")) {
    let origin = "";
    try {
      origin = new URL(input.ligaUrl ?? "").origin;
    } catch {
      origin = "";
    }
    if (!origin || origin === "null") return null;
    return urlJornadaAbsoluta(`${origin}${raw}`);
  }
  return urlJornadaAbsoluta(raw);
}

function urlJornadaAbsoluta(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) return null;
    if (!/^\/public\/liga\/[^/]+\/jornada\/\d+$/.test(parsed.pathname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function renderCorreoComunicacion(input: {
  clubNombre: string;
  ligaNombre: string;
  asunto: string;
  cuerpo: string;
  branding: LigaMailBranding;
  tipo?: string | null;
  ligaUrl?: string | null;
  jornadaUrl?: string | null;
  etiquetaBoton?: string | null;
  vistaPrevia?: boolean;
  replyTo?: string | null;
  aviso?: string | null;
}): { asunto: string; html: string; text: string } {
  const rawClub = input.clubNombre.trim();
  const rawLiga = input.ligaNombre.trim();
  const liga = rawLiga || "la liga";
  const club =
    !rawClub || rawClub.toLowerCase() === rawLiga.toLowerCase()
      ? input.branding.isClubBranded
        ? input.branding.brandName
        : "el club"
      : rawClub;
  const asunto = input.asunto.trim().slice(0, 180) || `Mensaje de ${liga}`;
  const enlace = enlacePublicoJornada(input);
  const cuerpo = cuerpoSinMarcaResultados(input.cuerpo).slice(0, 8000);
  const parsed = extractJornadaDetailsFromText(cuerpo, club);
  const esResultados = input.tipo === "resultados_jornada";
  const esJornada = input.tipo === "jornada" || Boolean(parsed.jornadaCard);
  const reply = input.replyTo?.trim() ?? "";
  const footerNotice = reply
    ? "Puedes responder directamente a este correo para comunicarte con el club."
    : "Este aviso no recibe respuestas por correo. El club administra las comunicaciones de la liga.";

  const aviso = input.aviso?.trim() ?? "";
  const avisoHtml = aviso
    ? `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;font-weight:700;color:#111827;">${escapeHtml(aviso)}</p>`
    : "";
  const paragraphsHtml =
    avisoHtml +
    (parsed.cleanBody
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const lines = escapeHtml(block).replace(/\n/g, "<br />");
        return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">${lines}</p>`;
      })
      .join("") || `<p style="margin:0;color:#374151;"> </p>`);

  let actionButton: { label: string; url: string } | null = null;
  if (enlace) {
    const etiqueta = input.etiquetaBoton?.trim();
    if (etiqueta) {
      actionButton = { label: etiqueta, url: enlace };
    } else if (esResultados) {
      actionButton = { label: "VER RESULTADOS DE LA JORNADA", url: enlace };
    } else if (input.tipo === "recordatorio_jornada" || esJornada) {
      actionButton = {
        label: input.tipo === "recordatorio_jornada" ? "VER LA JORNADA" : "VER MI JORNADA",
        url: enlace,
      };
    }
  }

  const cierreDetalleHtml = esResultados
    ? `<div style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E5E7EB;">
        <p style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#4B5563;">Sigue compitiendo, superándote y construyendo tu historia dentro de Riviera Open.</p>
        <p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#4B5563;font-style:italic;">¡Nos vemos en la próxima jornada!</p>
        <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#111827;">RIVIERA OPEN</p>
        <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#64748B;font-style:italic;">Compite. Juega limpio. Vive Riviera Open.</p>
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#0D0F12;">Cada partido cuenta.</p>
      </div>`
    : esJornada
      ? `<div style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E5E7EB;">
        <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#111827;">
          RIVIERA OPEN
        </p>
        <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#64748B;font-style:italic;">
          Compite. Juega limpio. Vive Riviera Open.
        </p>
        <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#0D0F12;">
          Cada partido cuenta.
        </p>
      </div>`
      : null;

  const title = esResultados
    ? "¡Tu jornada ha terminado, pero tu historia continúa!"
    : esJornada && asunto.toLowerCase().includes("jornada")
      ? "¡Tu próxima jornada te espera!"
      : asunto;

  const html = renderPremiumEmailHtml({
    branding: input.branding,
    asunto,
    preheaderSnippet: parsed.cleanBody.slice(0, 140).replace(/\s+/g, " "),
    badgeLabel: liga,
    title,
    paragraphsHtml,
    jornadaCard: parsed.jornadaCard,
    actionButton,
    cierreDetalleHtml,
    footerNotice,
    ligaUrl: input.ligaUrl,
    vistaPrevia: input.vistaPrevia === true,
    maxWidth: esJornada ? 640 : 600,
  });

  const textLines = [
    input.vistaPrevia ? "VISTA PREVIA — este mensaje no se ha enviado" : "",
    aviso,
    input.branding.brandName,
    input.branding.isClubBranded ? input.branding.brandSupportLabel : "by Riviera Open",
    liga,
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

  return { asunto, html, text: textLines.join("\n\n") };
}

const TIPOS_PRUEBA = new Set([
  "bienvenida",
  "aviso_general",
  "jornada",
  "cambio_horario",
  "felicitacion",
  "personalizado",
  "resultados_jornada",
  "recordatorio_jornada",
]);

/**
 * La prueba no consulta el flag de envíos a jugadores.
 * El destinatario y el cupo los confirma después la base.
 */
export function autorizarPruebaSupervision(input: {
  pruebaHabilitada: boolean;
  admin: boolean;
  confirmada: boolean;
  enviosEnLaUltimaHora: number;
}): { ok: true } | { ok: false; motivo: string } {
  if (input.pruebaHabilitada !== true) return { ok: false, motivo: "prueba_apagada" };
  if (input.admin !== true) return { ok: false, motivo: "sin_permiso" };
  if (input.confirmada !== true) return { ok: false, motivo: "confirmacion_requerida" };
  if (!Number.isInteger(input.enviosEnLaUltimaHora) || input.enviosEnLaUltimaHora >= 3) {
    return { ok: false, motivo: "limite_alcanzado" };
  }
  return { ok: true };
}

/** Arma la prueba con el mismo HTML del envío. No elige destinatario. */
export function prepararPruebaSupervision(input: {
  asunto: string;
  cuerpo: string;
  tipo?: string | null;
  clubNombre: string;
  ligaNombre: string;
  branding: LigaMailBranding;
  ligaUrl?: string | null;
  jornadaUrl?: string | null;
}): { ok: true; asunto: string; html: string; text: string } | { ok: false; motivo: string } {
  const asunto = input.asunto?.trim() ?? "";
  const cuerpo = input.cuerpo?.trim() ?? "";
  if (!asunto || !cuerpo) return { ok: false, motivo: "plantilla_incompleta" };
  if (asunto.length > 180 || cuerpo.length > 4000) return { ok: false, motivo: "plantilla_larga" };
  if (asunto.includes("{{") || cuerpo.includes("{{")) {
    return { ok: false, motivo: "plantilla_incompleta" };
  }
  const tipo = input.tipo && TIPOS_PRUEBA.has(input.tipo) ? input.tipo : "personalizado";
  const render = renderCorreoComunicacion({
    clubNombre: input.clubNombre,
    ligaNombre: input.ligaNombre,
    asunto: asunto.startsWith("[PRUEBA]") ? asunto : `[PRUEBA] ${asunto}`,
    cuerpo,
    branding: input.branding,
    tipo,
    ligaUrl: input.ligaUrl,
    jornadaUrl: input.jornadaUrl,
    aviso: AVISO_PRUEBA,
    vistaPrevia: false,
  });
  return { ok: true, asunto: render.asunto, html: render.html, text: render.text };
}

export function brandingNeutro(nombre: string): LigaMailBranding {
  const brandName = nombre.trim() || "Riviera Open";
  return {
    brandName,
    brandLogoUrl: null,
    brandPrimaryColor: "#15191F",
    brandSecondaryColor: "#232830",
    brandAccentColor: "#BFFF00",
    brandTextOnPrimary: "#FFFFFF",
    brandSupportLabel: brandName === "Riviera Open" ? "" : "by Riviera Open",
    isClubBranded: brandName !== "Riviera Open",
    initials: "RO",
  };
}

/** El enlace solo confirma si el dueño abre /public/verificar-correo?s= */
export function renderVerificacionSupervision(input: {
  branding: LigaMailBranding;
  enlace: string;
}): { asunto: string; html: string; text: string } | null {
  if (!/^https:\/\/[^/?#\s]+\/public\/verificar-correo\?s=[a-f0-9]{64}$/i.test(input.enlace)) {
    return null;
  }
  const asunto = "Confirma tu correo de supervisión";
  const cuerpo = "Confirma que este correo puede recibir copias de supervisión de tu liga. El enlace caduca en 30 minutos.";
  const html = renderPremiumEmailHtml({
    branding: input.branding,
    asunto,
    title: asunto,
    paragraphsHtml: `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">${escapeHtml(cuerpo)}</p>`,
    actionButton: { label: "CONFIRMAR CORREO DE SUPERVISIÓN", url: input.enlace },
    footerNotice: "Abrir este enlace no envía avisos a los jugadores.",
    maxWidth: 600,
  });
  return {
    asunto,
    html,
    text: `${cuerpo}\n\nCONFIRMAR CORREO DE SUPERVISIÓN: ${input.enlace}`,
  };
}
