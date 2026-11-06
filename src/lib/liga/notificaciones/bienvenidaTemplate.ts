import {
  isRivieraOwnAccountName,
  RIVIERA_CO_BRAND_ATTRIBUTION,
} from "../../../club-experience/motherBrand";
import {
  buildOfficialPlayerUrl,
  getRivieraAppPublicBase,
} from "../../rivieraOfficialSite";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CIERRE = "Compite. Juega limpio. Vive Riviera Open.";

export interface BienvenidaTemplateInput {
  clubNombre: string;
  logoUrl: string | null;
  acentoHex: string | null;
  ligaNombre: string;
  jugadorNombre: string;
  categoria: string | null;
  temporada: string | null;
  perfilUrl: string;
  ligaUrl: string;
  footerLine: string | null;
  vistaPrevia: boolean;
}

export function enlacePerfilBienvenida(input: {
  rivieraJugadorId: string | null | undefined;
  ligaId: string;
}): { perfilUrl: string; ligaUrl: string } {
  const base = getRivieraAppPublicBase().replace(/\/+$/, "");
  const ligaId = input.ligaId.trim();
  const ligaUrl = `${base}/public/liga/${encodeURIComponent(ligaId)}`;
  const rivieraId = input.rivieraJugadorId?.trim() ?? "";
  if (!UUID.test(rivieraId)) return { perfilUrl: ligaUrl, ligaUrl };
  return { perfilUrl: buildOfficialPlayerUrl(rivieraId), ligaUrl };
}

export function acentoSeguro(hex: string | null | undefined): string | null {
  const value = hex?.trim().toLowerCase() ?? "";
  if (!/^#[0-9a-f]{6}$/.test(value)) return null;
  const r = Number.parseInt(value.slice(1, 3), 16);
  const g = Number.parseInt(value.slice(3, 5), 16);
  const b = Number.parseInt(value.slice(5, 7), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const saturation = max === 0 ? 0 : delta / max;
  const esDorado = saturation > 0.35 && hue >= 35 && hue <= 55;
  const esVerde = saturation > 0.35 && hue >= 80 && hue <= 160;
  const esMorado = saturation > 0.25 && hue >= 260 && hue <= 320;
  if (esDorado || esVerde || esMorado) return null;
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function logoSeguro(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    if (parsed.search.includes("@") || parsed.hash.includes("@")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function filaDato(etiqueta: string, valor: string | null): string {
  if (!valor?.trim()) return "";
  return (
    `<tr><td style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#a3a3a3;">` +
    `${escapeHtml(etiqueta)}</td></tr>` +
    `<tr><td style="padding:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.4;color:#f5f5f5;">` +
    `${escapeHtml(valor.trim())}</td></tr>`
  );
}

export function renderBienvenidaEmail(input: BienvenidaTemplateInput): {
  asunto: string;
  html: string;
  text: string;
} {
  const club = input.clubNombre.trim() || "Riviera Open";
  const liga = input.ligaNombre.trim() || "tu liga";
  const jugador = input.jugadorNombre.trim() || "jugador";
  const mostrarAtribucion = !isRivieraOwnAccountName(club);
  const acento = acentoSeguro(input.acentoHex) ?? "#f5f5f5";
  const logo = logoSeguro(input.logoUrl);
  const perfil = input.perfilUrl.trim();
  const ligaUrl = input.ligaUrl.trim();
  const asunto = `Bienvenido a ${liga}`;

  const datos = [
    filaDato("Club", club),
    filaDato("Liga", liga),
    filaDato("Categoría", input.categoria),
    filaDato("Temporada", input.temporada),
  ].join("");

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
<tr><td style="padding:12px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:1.15;color:#ffffff;">¡Bienvenido a tu liga!</td></tr>
<tr><td style="padding:22px 28px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#f5f5f5;">Hola, ${escapeHtml(jugador)}:<br><br>Tu inscripción a ${escapeHtml(liga)} ha sido confirmada.<br><br>Nos alegra que formes parte de esta temporada.<br><br>Desde tu perfil podrás consultar tu participación, resultados e historial deportivo conforme avance la competencia.</td></tr>
<tr><td style="padding:28px 28px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${datos}</table></td></tr>
<tr><td style="padding:8px 28px 8px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#f5f5f5" style="border-radius:2px;"><a href="${escapeHtml(perfil)}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1;letter-spacing:0.12em;color:#0a0a0a;text-decoration:none;font-weight:700;">VER MI PERFIL</a></td></tr></table></td></tr>
<tr><td style="padding:28px 28px 8px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.5;color:#f5f5f5;">${escapeHtml(CIERRE)}</td></tr>
<tr><td style="padding:8px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#a3a3a3;">Riviera Open<br>Las preferencias de comunicación de esta liga las administra el club. Si no deseas recibir estos avisos, solicita al organizador que desactive tus notificaciones.<br><a href="${escapeHtml(ligaUrl)}" style="color:#f5f5f5;text-decoration:underline;">Ver la liga</a>${footerExtra}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const lineas = [
    input.vistaPrevia ? "VISTA PREVIA — este mensaje no se ha enviado" : "",
    club,
    mostrarAtribucion ? RIVIERA_CO_BRAND_ATTRIBUTION : "",
    liga,
    "¡Bienvenido a tu liga!",
    `Hola, ${jugador}:`,
    `Tu inscripción a ${liga} ha sido confirmada.`,
    "Nos alegra que formes parte de esta temporada.",
    "Desde tu perfil podrás consultar tu participación, resultados e historial deportivo conforme avance la competencia.",
    `Club: ${club}`,
    `Liga: ${liga}`,
    input.categoria?.trim() ? `Categoría: ${input.categoria.trim()}` : "",
    input.temporada?.trim() ? `Temporada: ${input.temporada.trim()}` : "",
    `VER MI PERFIL: ${perfil}`,
    CIERRE,
    "Riviera Open",
    "Las preferencias de comunicación de esta liga las administra el club. Si no deseas recibir estos avisos, solicita al organizador que desactive tus notificaciones.",
    `Ver la liga: ${ligaUrl}`,
    input.footerLine?.trim() ?? "",
  ].filter(Boolean);

  return { asunto, html, text: lineas.join("\n\n") };
}
