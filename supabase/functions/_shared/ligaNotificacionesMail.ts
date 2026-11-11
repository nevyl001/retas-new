/**
 * Plantillas premium para el worker de liga y comunicaciones.
 * El HTML de la comunicación sale de correoCompartido, el mismo de la vista previa.
 */
import { getManifestByKey, listRegisteredManifestKeys } from "../../../src/club-experience/manifestCatalog.ts";
import { renderCorreoComunicacion } from "../../../src/lib/liga/notificaciones/correoCompartido.ts";
import { resolveLigaMailBranding } from "../../../src/lib/liga/notificaciones/ligaMailBranding.ts";

export interface LigaMailBranding {
  brandName: string;
  brandLogoUrl: string | null;
  brandPrimaryColor: string;
  brandSecondaryColor: string;
  brandAccentColor: string;
  brandTextOnPrimary: string;
  brandSupportLabel: string;
  isClubBranded: boolean;
  initials: string;
}

/** Misma resolución que la vista previa: el manifiesto del club, no un mapa aparte. */
export function resolveLigaMailBrandingWorker(options: {
  clubNombre?: string | null;
  brandingKey?: string | null;
  premiumBrandingEnabled?: boolean;
  appBaseUrl?: string;
}): LigaMailBranding {
  const key = (options.brandingKey || "").trim().toLowerCase();
  const premium = options.premiumBrandingEnabled !== false;
  const registrado = key.length > 0
    && key !== "riviera"
    && listRegisteredManifestKeys().includes(key);
  if (premium && registrado) {
    const manifest = getManifestByKey(key);
    if (manifest.active && manifest.brandingKey !== "riviera") {
      return resolveLigaMailBranding({
        clubNombre: manifest.displayName,
        manifest,
        appBaseUrl: options.appBaseUrl,
      });
    }
  }
  return resolveLigaMailBranding({
    clubNombre: options.clubNombre,
    appBaseUrl: options.appBaseUrl,
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface WorkerEmailLayoutInput {
  branding: LigaMailBranding;
  asunto: string;
  preheaderSnippet?: string;
  badgeLabel?: string | null;
  title: string;
  paragraphsHtml: string;
  infoCards?: Array<{ label: string; value: string | null | undefined }>;
  jornadaCard?: { fecha: string; horario: string; sede: string } | null;
  actionButton?: {
    label: string;
    url: string;
  } | null;
  cierreTexto?: string | null;
  cierreDetalleHtml?: string | null;
  footerNotice?: string | null;
  ligaUrl?: string | null;
  vistaPrevia?: boolean;
  maxWidth?: number;
}

export function renderPremiumEmailLayout(input: WorkerEmailLayoutInput): string {
  const { branding } = input;
  const asunto = input.asunto.trim();
  const preheaderSnippet = input.preheaderSnippet || asunto;
  const brandName = branding.brandName || "Riviera Open";
  const brandSupport = branding.isClubBranded ? branding.brandSupportLabel : "";

  const previewBanner = input.vistaPrevia
    ? `<tr><td style="background-color:#111827;color:#F9FAFB;text-align:center;padding:10px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">VISTA PREVIA — este mensaje no se ha enviado</td></tr>`
    : "";

  // Header fijo: misma altura/logo en recordatorio, resultados y el resto.
  const logoOrMonogram = branding.brandLogoUrl
    ? `<img src="${escapeHtml(branding.brandLogoUrl)}" alt="${escapeHtml(brandName)}" width="160" height="40" style="display:block;border:0;outline:none;text-decoration:none;height:40px;width:auto;max-height:40px;max-width:160px;">`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="width:40px;height:40px;border-radius:6px;background-color:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.24);text-align:center;vertical-align:middle;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#FFFFFF;line-height:40px;">
            ${escapeHtml(branding.initials)}
          </td>
          <td style="padding-left:12px;height:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:#FFFFFF;letter-spacing:-0.01em;line-height:40px;">
            ${escapeHtml(brandName)}
          </td>
        </tr>
      </table>`;

  const coBrandPill = brandSupport
    ? `<td align="right" valign="middle" style="padding-left:12px;height:40px;">
        <span style="display:inline-block;padding:4px 10px;border-radius:9999px;background-color:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.04em;color:#E5E7EB;text-transform:uppercase;white-space:nowrap;line-height:1.2;">
          ${escapeHtml(brandSupport)}
        </span>
      </td>`
    : "";

  const badgeHtml = input.badgeLabel?.trim()
    ? `<div style="display:inline-block;padding:3px 9px;border-radius:4px;background-color:#F3F4F6;border:1px solid #E5E7EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;color:#4B5563;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:14px;">
        ${escapeHtml(input.badgeLabel.trim())}
      </div>`
    : "";

  let jornadaCardHtml = "";
  if (input.jornadaCard) {
    jornadaCardHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;margin:22px 0 24px;">
        <tr>
          <td style="padding:22px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748B;">
                  FECHA
                </td>
              </tr>
              <tr>
                <td style="padding:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.4;color:#111827;">
                  ${escapeHtml(input.jornadaCard.fecha)}
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #E5E7EB;padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748B;">
                  HORARIO
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.4;color:#111827;">
                  ${escapeHtml(input.jornadaCard.horario)}
                </td>
              </tr>
              <tr>
                <td style="border-top:1px solid #E5E7EB;padding-top:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748B;">
                  SEDE
                </td>
              </tr>
              <tr>
                <td style="padding:4px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.4;color:#111827;">
                  ${escapeHtml(input.jornadaCard.sede)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
  }

  const cards = (input.infoCards || []).filter((c) => c.value && String(c.value).trim());
  let infoCardsHtml = "";
  if (cards.length > 0) {
    const rows = cards
      .map(
        (c) =>
          `<tr>
            <td style="padding:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;">
              ${escapeHtml(c.label)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1.4;color:#111827;">
              ${escapeHtml(String(c.value).trim())}
            </td>
          </tr>`
      )
      .join("");
    infoCardsHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;margin:20px 0 24px;">
        <tr>
          <td style="padding:18px 20px 4px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${rows}
            </table>
          </td>
        </tr>
      </table>`;
  }

  let actionButtonHtml = "";
  if (input.actionButton?.url?.trim()) {
    actionButtonHtml = `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 24px;">
        <tr>
          <td align="center" style="border-radius:6px;background-color:#0D0F12;">
            <a href="${escapeHtml(input.actionButton.url.trim())}" style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1;letter-spacing:0.08em;color:#FFFFFF;text-decoration:none;font-weight:700;border-radius:6px;background-color:#0D0F12;border:1px solid rgba(255,255,255,0.12);text-transform:uppercase;">
              ${escapeHtml(input.actionButton.label)}
            </a>
          </td>
        </tr>
      </table>`;
  }

  const cierreTextoHtml = input.cierreDetalleHtml?.trim()
    ? input.cierreDetalleHtml
    : input.cierreTexto?.trim()
    ? `<p style="margin:24px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#4B5563;font-style:italic;">
        ${escapeHtml(input.cierreTexto.trim())}
      </p>`
    : "";

  const footerNoticeHtml = input.footerNotice?.trim()
    ? `<p style="margin:6px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#6B7280;">
        ${escapeHtml(input.footerNotice.trim())}
      </p>`
    : "";

  const ligaLinkHtml = input.ligaUrl?.trim()
    ? `<p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.4;">
        <a href="${escapeHtml(input.ligaUrl.trim())}" style="color:#111827;text-decoration:underline;font-weight:600;">Ver la liga</a>
      </p>`
    : "";

  const maxWidth = input.maxWidth || 640;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(asunto)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F3F4F6;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">
${escapeHtml(preheaderSnippet)}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;margin:0;padding:24px 12px;">
<tr>
<td align="center" valign="top">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${maxWidth}px;margin-bottom:8px;">
    <tr>
      <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:#6B7280;letter-spacing:0.02em;text-align:left;padding:0 4px;">
        Comunicación deportiva oficial · ${escapeHtml(brandName)}
      </td>
    </tr>
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${maxWidth}px;background-color:#FFFFFF;border:1px solid #E5E7EB;border-top:3px solid ${escapeHtml(branding.brandAccentColor)};border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    ${previewBanner}
    <tr>
      <td style="background-color:#0D0F12;padding:18px 28px;height:76px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="height:40px;">
          <tr>
            <td align="left" valign="middle" style="height:40px;">
              ${logoOrMonogram}
            </td>
            ${coBrandPill}
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background-color:${escapeHtml(branding.brandAccentColor)};height:3px;font-size:0;line-height:0;" height="3">&nbsp;</td>
    </tr>
    <tr>
      <td style="padding:32px 28px 24px;background-color:#FFFFFF;">
        ${badgeHtml}
        <h1 style="margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;line-height:1.25;color:#111827;letter-spacing:-0.02em;">
          ${escapeHtml(input.title)}
        </h1>
        ${input.paragraphsHtml}
        ${jornadaCardHtml}
        ${infoCardsHtml}
        ${actionButtonHtml}
        ${cierreTextoHtml}
      </td>
    </tr>
    <tr>
      <td style="padding:22px 28px;background-color:#F9FAFB;border-top:1px solid #E5E7EB;">
        <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;line-height:1.4;color:#374151;">
          Enviado por ${escapeHtml(brandName)}
        </p>
        <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.45;color:#6B7280;">
          Gestionado con Riviera Open · Comunicación deportiva oficial.
        </p>
        ${footerNoticeHtml}
        ${ligaLinkHtml}
      </td>
    </tr>
  </table>
</td>
</tr>
</table>
</body>
</html>`;
}

export function renderBienvenidaWorker(input: {
  clubNombre: string;
  ligaNombre: string;
  jugadorNombre: string;
  perfilUrl: string;
  ligaUrl: string;
  branding?: LigaMailBranding;
}): { asunto: string; html: string; text: string } {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const jugador = input.jugadorNombre.trim() || "jugador";
  const asunto = `Bienvenido a ${liga}`;
  const branding = input.branding ?? resolveLigaMailBrandingWorker({ clubNombre: club });

  const paragraphsHtml = `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">Hola, ${escapeHtml(jugador)}:<br><br>Tu inscripción a ${escapeHtml(liga)} ha sido confirmada.<br><br>Nos alegra que formes parte de esta temporada.<br><br>Desde tu perfil podrás consultar tu participación, resultados e historial deportivo conforme avance la competencia.</p>`;

  const html = renderPremiumEmailLayout({
    branding,
    asunto,
    preheaderSnippet: `Tu inscripción a ${liga} ha sido confirmada.`,
    badgeLabel: liga,
    title: "¡Bienvenido a tu liga!",
    paragraphsHtml,
    infoCards: [
      { label: "Club", value: club },
      { label: "Liga", value: liga },
    ],
    actionButton: {
      label: "VER MI PERFIL",
      url: input.perfilUrl,
    },
    cierreTexto: "Compite. Juega limpio. Vive Riviera Open.",
    footerNotice:
      "Las preferencias de comunicación de esta liga las administra el club. Si no deseas recibir estos avisos, solicita al organizador que desactive tus notificaciones.",
    ligaUrl: input.ligaUrl,
  });

  const text = [
    club,
    branding.isClubBranded ? branding.brandSupportLabel : "",
    "¡Bienvenido a tu liga!",
    `Hola, ${jugador}:`,
    `Tu inscripción a ${liga} ha sido confirmada.`,
    `VER MI PERFIL: ${input.perfilUrl}`,
    `Ver la liga: ${input.ligaUrl}`,
    "Compite. Juega limpio. Vive Riviera Open.",
    "Gestionado con Riviera Open",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { asunto, html, text };
}

export function renderVerificacionWorker(input: {
  clubNombre: string;
  ligaNombre: string;
  jugadorNombre: string | null;
  verificarUrl: string;
  branding?: LigaMailBranding;
}): { asunto: string; html: string; text: string } {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const nombre = input.jugadorNombre?.trim() || null;
  const saludo = nombre ? `Hola, ${escapeHtml(nombre)}:` : "Hola:";
  const saludoTexto = nombre ? `Hola, ${nombre}:` : "Hola:";
  const asunto = `Verifica tu correo · ${liga}`;
  const branding = input.branding ?? resolveLigaMailBrandingWorker({ clubNombre: club });

  const paragraphsHtml = `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">${saludo}<br><br>Estamos verificando que esta dirección te pertenece para avisos de tu participación en ${escapeHtml(liga)}.<br><br>Este enlace caduca en 24 horas. Si no solicitaste esta verificación, puedes ignorar este mensaje.</p>`;

  const html = renderPremiumEmailLayout({
    branding,
    asunto,
    preheaderSnippet: `Estamos verificando que esta dirección de correo te pertenece para avisos de tu participación en ${liga}.`,
    badgeLabel: liga,
    title: "Confirma tu correo electrónico",
    paragraphsHtml,
    actionButton: {
      label: "VERIFICAR MI CORREO",
      url: input.verificarUrl,
    },
    footerNotice: "Confirmar el correo no activa notificaciones por sí solo. El club administra esas preferencias.",
  });

  const text = [
    club,
    branding.isClubBranded ? branding.brandSupportLabel : "",
    liga,
    "Confirma tu correo electrónico",
    saludoTexto,
    `VERIFICAR MI CORREO: ${input.verificarUrl}`,
    "Gestionado con Riviera Open",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { asunto, html, text };
}

/** Misma regla que recordatorioTieneHorarioOficial en el cliente. */
export function recordatorioTieneHorarioOficial(cuerpo: string | null | undefined): boolean {
  return /^[ \t]*Horario:[ \t]*([01]\d|2[0-3]):[0-5]\d hrs[ \t]*$/im.test(cuerpo ?? "");
}

const MARCA_RESULTADOS = /^RESULTADOS_URL:(\S+)\s*$/m;

/** Acepta la ruta pública real de la jornada. Rechaza el panel /liga/. */
export function extraerUrlPublicaJornadaWorker(cuerpo: string, base: string): string | null {
  const match = cuerpo.match(MARCA_RESULTADOS);
  if (!match) return null;
  const raw = match[1];
  const origen = base.trim().replace(/\/+$/, "");
  const absoluta = raw.startsWith("/public/liga/")
    ? `${origen}${raw}`
    : raw;
  try {
    const parsed = new URL(absoluta);
    if (parsed.protocol !== "https:") return null;
    if (!/^\/public\/liga\/[^/]+\/jornada\/\d+$/.test(parsed.pathname)) return null;
    return absoluta;
  } catch {
    return null;
  }
}

/** Mismo HTML que la vista previa. El asunto y el cuerpo ya vienen resueltos. */
export function renderComunicacionWorker(input: {
  clubNombre: string;
  ligaNombre: string;
  asunto: string;
  cuerpoTexto: string;
  replyTo?: string | null;
  branding?: LigaMailBranding;
  tipo?: string | null;
  ligaUrl?: string | null;
  jornadaUrl?: string | null;
  aviso?: string | null;
}): { asunto: string; html: string; text: string } {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const branding = input.branding ?? resolveLigaMailBrandingWorker({ clubNombre: club });
  return renderCorreoComunicacion({
    clubNombre: club,
    ligaNombre: liga,
    asunto: input.asunto,
    cuerpo: input.cuerpoTexto,
    branding,
    tipo: input.tipo,
    ligaUrl: input.ligaUrl,
    jornadaUrl: input.jornadaUrl,
    replyTo: input.replyTo,
    aviso: input.aviso,
    vistaPrevia: false,
  });
}

export function isFakeOrInvalidEmail(email: string | null | undefined): boolean {
  const value = email?.trim().toLowerCase() ?? "";
  if (!value || value.endsWith("@padel.local")) return true;
  return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
