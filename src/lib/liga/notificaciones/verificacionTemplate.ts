import {
  isRivieraOwnAccountName,
  RIVIERA_CO_BRAND_ATTRIBUTION,
} from "../../../club-experience/motherBrand";
import { acentoSeguro, logoSeguro } from "./bienvenidaTemplate";
import { VERIFICACION_VIGENCIA_HORAS } from "./verificacionPolicy";

export interface VerificacionTemplateInput {
  clubNombre: string;
  logoUrl: string | null;
  acentoHex: string | null;
  ligaNombre: string;
  jugadorNombre: string | null;
  verificarUrl: string;
  footerLine: string | null;
  vistaPrevia: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderVerificacionEmail(input: VerificacionTemplateInput): {
  asunto: string;
  html: string;
  text: string;
} {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const mostrarAtribucion = !isRivieraOwnAccountName(club);
  const acento = acentoSeguro(input.acentoHex) ?? "#f5f5f5";
  const logo = logoSeguro(input.logoUrl);
  const url = input.verificarUrl.trim();
  const nombre =
    input.jugadorNombre?.trim() && !input.jugadorNombre.includes("@")
      ? input.jugadorNombre.trim()
      : null;
  const asunto = `Verifica tu correo · ${liga}`;

  const saludo = nombre ? `Hola, ${escapeHtml(nombre)}:` : "Hola:";
  const saludoTexto = nombre ? `Hola, ${nombre}:` : "Hola:";

  const atribucion = mostrarAtribucion
    ? `<p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;letter-spacing:0.08em;color:#a3a3a3;">${escapeHtml(RIVIERA_CO_BRAND_ATTRIBUTION)}</p>`
    : "";

  const logoHtml = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(club)}" width="120" style="display:block;border:0;outline:none;text-decoration:none;max-width:120px;height:auto;">`
    : `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.3;color:#f5f5f5;">${escapeHtml(club)}</p>`;

  const avisoPrevia = input.vistaPrevia
    ? `<tr><td style="padding:14px 28px;background:#171717;border-bottom:1px solid #2a2a2a;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;letter-spacing:0.12em;color:#f5f5f5;">VISTA PREVIA — este mensaje no se ha enviado</td></tr>`
    : "";

  const footerExtra = input.footerLine?.trim()
    ? `<p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#d4d4d4;">${escapeHtml(input.footerLine.trim())}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(asunto)}</title>
</head>
<body style="margin:0;padding:0;background:#050505;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0c0c0c;border:1px solid #2a2a2a;border-top:3px solid ${acento};">
${avisoPrevia}
<tr><td style="padding:32px 28px 12px;">${logoHtml}${atribucion}</td></tr>
<tr><td style="padding:12px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;letter-spacing:0.14em;color:#a3a3a3;">${escapeHtml(liga)}</td></tr>
<tr><td style="padding:12px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.2;color:#ffffff;">Confirma tu correo electrónico</td></tr>
<tr><td style="padding:22px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#f5f5f5;">${saludo}<br><br>Estamos verificando que esta dirección de correo te pertenece para mantenerte informado sobre tu participación en ${escapeHtml(liga)}.<br><br>Este enlace caduca en ${VERIFICACION_VIGENCIA_HORAS} horas. Si no pediste esta verificación, ignora el mensaje.</td></tr>
<tr><td style="padding:28px 28px 8px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#f5f5f5" style="border-radius:2px;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1;letter-spacing:0.12em;color:#0a0a0a;text-decoration:none;font-weight:700;">VERIFICAR MI CORREO</a></td></tr></table></td></tr>
<tr><td style="padding:16px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#a3a3a3;">Riviera Open<br>Confirmar el correo no activa notificaciones por sí solo. El club administra esas preferencias.${footerExtra}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    input.vistaPrevia ? "VISTA PREVIA — este mensaje no se ha enviado" : "",
    club,
    mostrarAtribucion ? RIVIERA_CO_BRAND_ATTRIBUTION : "",
    liga,
    "Confirma tu correo electrónico",
    saludoTexto,
    `Estamos verificando que esta dirección de correo te pertenece para mantenerte informado sobre tu participación en ${liga}.`,
    `Este enlace caduca en ${VERIFICACION_VIGENCIA_HORAS} horas. Si no pediste esta verificación, ignora el mensaje.`,
    `VERIFICAR MI CORREO: ${url}`,
    "Riviera Open",
    "Confirmar el correo no activa notificaciones por sí solo. El club administra esas preferencias.",
    input.footerLine?.trim() ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { asunto, html, text };
}
