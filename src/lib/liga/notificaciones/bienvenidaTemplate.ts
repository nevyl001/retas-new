import {
  isRivieraOwnAccountName,
  RIVIERA_CO_BRAND_ATTRIBUTION,
} from "../../../club-experience/motherBrand";
import {
  buildOfficialPlayerUrl,
  getRivieraAppPublicBase,
} from "../../rivieraOfficialSite";
import {
  type LigaMailBranding,
  resolveLigaMailBranding,
} from "./ligaMailBranding";
import {
  escapeHtml,
  renderPremiumEmailHtml,
} from "./renderPremiumEmailHtml";

/** Misma forma que parseJugadoresPath: la ficha abre UUID versión 1 a 5. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  branding?: LigaMailBranding;
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

  const branding: LigaMailBranding =
    input.branding ??
    resolveLigaMailBranding({
      clubNombre: club,
      logoUrl: logo,
      acentoHex: acento,
    });

  const paragraphsHtml = `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">Hola, ${escapeHtml(jugador)}:<br><br>Tu inscripción a ${escapeHtml(liga)} ha sido confirmada.<br><br>Nos alegra que formes parte de esta temporada.<br><br>Desde tu perfil podrás consultar tu participación, resultados e historial deportivo conforme avance la competencia.</p>`;

  const infoCards = [
    { label: "Club", value: club },
    { label: "Liga", value: liga },
    { label: "Categoría", value: input.categoria },
    { label: "Temporada", value: input.temporada },
  ];

  const html = renderPremiumEmailHtml({
    branding,
    asunto,
    preheaderSnippet: `Tu inscripción a ${liga} ha sido confirmada.`,
    badgeLabel: liga,
    title: "¡Bienvenido a tu liga!",
    paragraphsHtml,
    infoCards,
    actionButton: {
      label: "VER MI PERFIL",
      url: perfil,
    },
    cierreTexto: CIERRE,
    footerNotice:
      "Las preferencias de comunicación de esta liga las administra el club. Si no deseas recibir estos avisos, solicita al organizador que desactive tus notificaciones.",
    ligaUrl,
    footerLine: input.footerLine,
    vistaPrevia: input.vistaPrevia,
  });

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
