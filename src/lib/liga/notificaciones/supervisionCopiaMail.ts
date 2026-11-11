/**
 * Composer de copia de supervisión para el worker y pruebas.
 * Sin dependencias de jornadaTemporal para que el bundler de Edge lo resuelva.
 */
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import type { LigaMailBranding } from "./ligaMailBranding.ts";
import {
  extractJornadaDetailsFromText,
  renderCorreoComunicacion,
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
} from "./correoCompartido.ts";
// @ts-expect-error El empaquetador de Edge Functions exige la extensión .ts.
import { escapeHtml } from "./renderPremiumEmailHtml.ts";

/** Nombre de ejemplo en copias de supervisión (no es un destinatario real). */
export const NOMBRE_EJEMPLO_SUPERVISION = "Jugador (ejemplo)";

function etiquetaTipoSupervision(tipo: string | null | undefined): string {
  switch (tipo) {
    case "resultados_jornada":
      return "Resultados de jornada";
    case "recordatorio_jornada":
      return "Recordatorio de jornada";
    case "bienvenida":
      return "Bienvenida";
    default:
      return "Comunicación";
  }
}

function urlPublicaJornadaValida(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return /^\/public\/liga\/[^/]+\/jornada\/\d+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function resumenSupervisionTexto(input: {
  procesados: number;
  aceptados: number;
  errores: number;
  reintentos: number;
}): string {
  const pendiente =
    input.reintentos > 0
      ? `Hay ${input.reintentos} reintentos pendientes.`
      : "No hay reintentos pendientes.";
  return [
    `Destinatarios procesados: ${input.procesados}`,
    `Aceptados por el proveedor: ${input.aceptados}`,
    `Errores: ${input.errores}`,
    pendiente,
  ].join("\n");
}

function resumenSupervisionHtml(input: {
  liga: string;
  club: string;
  jornada: string;
  tipo: string;
  procesados: number;
  aceptados: number;
  errores: number;
  reintentos: number;
  avisos: string[];
}): string {
  const lineas = [
    ["Liga", input.liga],
    ["Club", input.club],
    ["Jornada", input.jornada || "—"],
    ["Tipo", etiquetaTipoSupervision(input.tipo)],
    ["Destinatarios procesados", String(input.procesados)],
    ["Aceptados por proveedor", String(input.aceptados)],
    ["Errores", String(input.errores)],
    [
      "Reintentos",
      input.reintentos > 0 ? `${input.reintentos} pendientes` : "Ninguno",
    ],
  ];
  const filas = lineas
    .map(
      ([k, v]) =>
        `<tr>
          <td style="padding:6px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#6B7280;white-space:nowrap;">${escapeHtml(k)}</td>
          <td style="padding:6px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827;">${escapeHtml(v)}</td>
        </tr>`
    )
    .join("");
  const avisosHtml = input.avisos
    .map(
      (a) =>
        `<p style="margin:10px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.45;font-weight:600;color:#92400E;">${escapeHtml(a)}</p>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;background-color:#F8FAFC;border:1px solid #E5E7EB;border-radius:10px;">
    <tr><td style="padding:14px 16px 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#111827;">Supervisión de envío</td></tr>
    <tr><td style="padding:0 6px 10px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${filas}</table>${avisosHtml}</td></tr>
    <tr><td style="padding:0 16px 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.45;color:#6B7280;">Aceptado por el proveedor no implica entrega en bandeja. La copia visual usa el mismo diseño del correo a jugadores; el saludo muestra un nombre de ejemplo.</td></tr>
  </table>`;
}

/**
 * Copia de supervisión: resumen del lote + HTML del mismo renderizador
 * que reciben los jugadores (snapshot del cuerpo/asunto enviados).
 */
export function construirCorreoSupervision(input: {
  liga: string;
  club: string;
  jornada: string;
  tipo: string;
  procesados: number;
  aceptados: number;
  errores: number;
  reintentos: number;
  branding: LigaMailBranding;
  asuntoEnviado: string;
  cuerpoEnviado: string;
  ligaUrl: string;
  jornadaUrl?: string | null;
  nombreEjemplo?: string;
}):
  | { ok: true; asunto: string; html: string; text: string }
  | { ok: false; motivo: "datos_privados" | "sin_url_publica" | "plantilla_incompleta" } {
  const nombreEjemplo =
    (input.nombreEjemplo ?? NOMBRE_EJEMPLO_SUPERVISION).trim() ||
    NOMBRE_EJEMPLO_SUPERVISION;
  const liga = input.liga.trim();
  const club = input.club.trim();
  const tipoLabel = etiquetaTipoSupervision(input.tipo);
  const meta = [
    liga,
    club,
    input.jornada,
    input.tipo,
    input.asuntoEnviado,
    input.cuerpoEnviado,
  ].join("\n");
  if (meta.includes("@") || /\{\{/.test(meta)) {
    return { ok: false, motivo: "datos_privados" };
  }
  const resultados = input.tipo === "resultados_jornada";
  const jornadaUrl = input.jornadaUrl?.trim() || null;
  if (resultados && !input.ligaUrl.trim()) {
    return { ok: false, motivo: "sin_url_publica" };
  }
  if (
    input.tipo === "recordatorio_jornada" &&
    !urlPublicaJornadaValida(jornadaUrl)
  ) {
    return { ok: false, motivo: "sin_url_publica" };
  }
  if (input.asuntoEnviado.includes("{{") || input.cuerpoEnviado.includes("{{")) {
    return { ok: false, motivo: "plantilla_incompleta" };
  }

  const parsed = extractJornadaDetailsFromText(input.cuerpoEnviado, club);
  const avisos: string[] = [];
  if (input.tipo === "recordatorio_jornada") {
    if (!parsed.jornadaCard?.fecha || parsed.jornadaCard.fecha === "Por definir") {
      avisos.push("Dato faltante: fecha oficial de la jornada.");
    }
    if (
      !parsed.jornadaCard?.horario ||
      parsed.jornadaCard.horario === "Por definir"
    ) {
      avisos.push("Dato faltante: horario oficial de la jornada.");
    }
    if (!jornadaUrl) {
      avisos.push("Dato faltante: URL pública de la jornada.");
    }
  }
  if (resultados && !input.ligaUrl.trim()) {
    avisos.push("Dato faltante: URL pública de la liga.");
  }

  const asunto = `Supervisión — ${liga} | ${tipoLabel}`.slice(0, 180);
  const resumenTexto = [
    "SUPERVISIÓN DE ENVÍO",
    `Liga: ${liga}`,
    `Club: ${club}`,
    `Jornada: ${input.jornada || "—"}`,
    `Tipo: ${tipoLabel}`,
    resumenSupervisionTexto(input),
    ...avisos,
    `Copia visual de referencia (saludo: ${nombreEjemplo}). El diseño y los datos de jornada coinciden con el envío a jugadores; el nombre es un ejemplo.`,
  ].join("\n");

  const resumenHtml = resumenSupervisionHtml({
    liga,
    club,
    jornada: input.jornada,
    tipo: input.tipo,
    procesados: input.procesados,
    aceptados: input.aceptados,
    errores: input.errores,
    reintentos: input.reintentos,
    avisos,
  });

  if (avisos.length > 0 && !parsed.jornadaCard) {
    const htmlAviso = `<div style="max-width:640px;margin:0 auto;padding:20px;">${resumenHtml}<p style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#92400E;">No se generó la copia visual porque faltan datos oficiales obligatorios. No se inventaron fecha, horario ni sede.</p></div>`;
    return { ok: true, asunto, html: htmlAviso, text: resumenTexto };
  }

  const jornadaNumeroMatch = String(input.jornada || "").match(/\d+/);
  const visual = renderCorreoComunicacion({
    clubNombre: club,
    ligaNombre: liga,
    asunto: input.asuntoEnviado,
    cuerpo: input.cuerpoEnviado,
    branding: input.branding,
    tipo: input.tipo,
    ligaUrl: input.ligaUrl,
    jornadaUrl,
    vistaPrevia: false,
    aviso: `COPIA DE SUPERVISIÓN — saludo con nombre de ejemplo: ${nombreEjemplo}. El diseño, la jornada y el enlace son los del envío real.`,
    jugadorId: "supervision-preview",
    ligaId: liga,
    jornadaNumero: jornadaNumeroMatch ? Number(jornadaNumeroMatch[0]) : 0,
  });

  return {
    ok: true,
    asunto,
    html: `<div style="max-width:640px;margin:0 auto;padding:16px 12px 0;">${resumenHtml}</div>${visual.html}`,
    text: `${resumenTexto}\n\n---\n\n${visual.text}`,
  };
}
