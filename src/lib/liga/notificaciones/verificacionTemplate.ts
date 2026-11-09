import {
  isRivieraOwnAccountName,
  RIVIERA_CO_BRAND_ATTRIBUTION,
} from "../../../club-experience/motherBrand";
import { acentoSeguro, logoSeguro } from "./bienvenidaTemplate";
import {
  type LigaMailBranding,
  resolveLigaMailBranding,
} from "./ligaMailBranding";
import {
  escapeHtml,
  renderPremiumEmailHtml,
} from "./renderPremiumEmailHtml";
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
  branding?: LigaMailBranding;
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

  const branding: LigaMailBranding =
    input.branding ??
    resolveLigaMailBranding({
      clubNombre: club,
      logoUrl: logo,
      acentoHex: acento,
    });

  const paragraphsHtml = `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">${saludo}<br><br>Estamos verificando que esta dirección de correo te pertenece para mantenerte informado sobre tu participación en ${escapeHtml(liga)}.<br><br>Este enlace caduca en ${VERIFICACION_VIGENCIA_HORAS} horas. Si no pediste esta verificación, ignora el mensaje.</p>`;

  const html = renderPremiumEmailHtml({
    branding,
    asunto,
    preheaderSnippet: `Estamos verificando que esta dirección de correo te pertenece para avisos de tu participación en ${liga}.`,
    badgeLabel: liga,
    title: "Confirma tu correo electrónico",
    paragraphsHtml,
    actionButton: {
      label: "VERIFICAR MI CORREO",
      url,
    },
    footerNotice:
      "Confirmar el correo no activa notificaciones por sí solo. El club administra esas preferencias.",
    footerLine: input.footerLine,
    vistaPrevia: input.vistaPrevia,
  });

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
