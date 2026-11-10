import {
  LIGA_TEMPORAL_TZ,
  resolveLigaProgramadoStartMs,
} from "../jornadaTemporal";
import { jornadaHoraInicioLabel } from "../programacion";
import {
  extractJornadaDetailsFromText,
  renderCorreoComunicacion,
} from "./correoCompartido";
import {
  resolveLigaMailBranding,
  type LigaMailBranding,
} from "./ligaMailBranding";
import {
  escapeHtml,
  renderPremiumEmailHtml,
} from "./renderPremiumEmailHtml";

/** Nombre de ejemplo en copias de supervisión (no es un destinatario real). */
export const NOMBRE_EJEMPLO_SUPERVISION = "Jugador (ejemplo)";

export const ESPERAS_RESULTADOS_MINUTOS = [0, 5, 15] as const;
export const HORAS_RECORDATORIO = [24, 12, 6, 2] as const;

export type EsperaResultadosMinutos = (typeof ESPERAS_RESULTADOS_MINUTOS)[number];
export type HorasRecordatorio = (typeof HORAS_RECORDATORIO)[number];

export interface ConfigAutomaticaLiga {
  resultados_auto: boolean;
  resultados_espera_minutos: EsperaResultadosMinutos;
  recordatorio_auto: boolean;
  recordatorio_horas: HorasRecordatorio;
  bienvenida_auto: boolean;
}

export const CONFIG_AUTOMATICA_INICIAL: ConfigAutomaticaLiga = {
  resultados_auto: false,
  resultados_espera_minutos: 5,
  recordatorio_auto: false,
  recordatorio_horas: 24,
  bienvenida_auto: false,
};

export function normalizarEsperaResultados(raw: unknown): EsperaResultadosMinutos {
  const n = typeof raw === "number" ? raw : Number(raw);
  return n === 0 || n === 15 ? n : 5;
}

export function normalizarHorasRecordatorio(raw: unknown): HorasRecordatorio {
  const n = typeof raw === "number" ? raw : Number(raw);
  return n === 12 || n === 6 || n === 2 ? n : 24;
}

export function completarConfigAutomatica(raw: Partial<ConfigAutomaticaLiga> | null | undefined): ConfigAutomaticaLiga {
  return {
    resultados_auto: raw?.resultados_auto === true,
    resultados_espera_minutos: normalizarEsperaResultados(raw?.resultados_espera_minutos),
    recordatorio_auto: raw?.recordatorio_auto === true,
    recordatorio_horas: normalizarHorasRecordatorio(raw?.recordatorio_horas),
    bienvenida_auto: raw?.bienvenida_auto === true,
  };
}

/** El modo manual no se bloquea aunque haya automatizaciones guardadas. */
export function manualSigueDisponible(_config: ConfigAutomaticaLiga): boolean {
  return true;
}

export interface PartidoCierre {
  estado: string;
  fase?: string | null;
  bracket_slot?: string | null;
}

export function puedeProgramarResultados(input: {
  estadoJornada: string;
  partidos: PartidoCierre[];
  automatizacionActiva: boolean;
  urlPublica: string | null;
}): { ok: true } | { ok: false; motivo: string } {
  if (!input.automatizacionActiva) {
    return { ok: false, motivo: "automatizacion_apagada" };
  }
  if (input.estadoJornada !== "completed") {
    return { ok: false, motivo: "jornada_no_finalizada" };
  }
  if (input.partidos.length === 0) {
    return { ok: false, motivo: "sin_partidos" };
  }
  if (input.partidos.some((partido) => partido.estado !== "completed")) {
    return { ok: false, motivo: "partidos_pendientes" };
  }
  if (!urlPublicaJornadaValida(input.urlPublica)) {
    return { ok: false, motivo: "sin_url_publica" };
  }
  return { ok: true };
}

export function claveResultados(ligaId: string, jornadaId: string, jugadorId: string): string {
  return `auto:resultados:${ligaId}:${jornadaId}:${jugadorId}`;
}

export function claveRecordatorio(ligaId: string, jornadaId: string, jugadorId: string): string {
  return `auto:recordatorio:${ligaId}:${jornadaId}:${jugadorId}`;
}

export function claveBienvenida(ligaId: string, inscripcionId: string, jugadorId: string): string {
  return `auto:bienvenida:${ligaId}:${inscripcionId}:${jugadorId}`;
}

export function programadoResultados(cerradaEn: Date, esperaMinutos: unknown): Date {
  const minutos = normalizarEsperaResultados(esperaMinutos);
  return new Date(cerradaEn.getTime() + minutos * 60_000);
}

export function urlPublicaJornada(base: string, ligaId: string, numero: number): string | null {
  if (!ligaId || !Number.isInteger(numero) || numero < 1) return null;
  const origen = base.trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/]+$/i.test(origen)) return null;
  return `${origen}/public/liga/${encodeURIComponent(ligaId)}/jornada/${numero}`;
}

export function urlPublicaJornadaValida(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return /^\/public\/liga\/[^/]+\/jornada\/\d+$/.test(parsed.pathname);
  } catch {
    return false;
  }
}

export function rutaRelativaJornada(ligaId: string, numero: number): string | null {
  if (!ligaId || !Number.isInteger(numero) || numero < 1) return null;
  return `/public/liga/${ligaId}/jornada/${numero}`;
}

const URL_RESULTADOS = /^RESULTADOS_URL:(\S+)\s*$/m;

export function extraerUrlPublicaJornada(cuerpo: string, base: string): string | null {
  const match = cuerpo.match(URL_RESULTADOS);
  if (!match) return null;
  const raw = match[1];
  if (raw.startsWith("/public/liga/") && /\/jornada\/\d+$/.test(raw)) {
    const absoluta = `${base.replace(/\/+$/, "")}${raw}`;
    return urlPublicaJornadaValida(absoluta) ? absoluta : null;
  }
  return urlPublicaJornadaValida(raw) ? raw : null;
}

export function sustituirVariablesCorreo(
  texto: string,
  vars: { nombre: string; liga: string; club: string; fecha: string; jornada: string }
): string {
  return texto
    .replace(/\{\{\s*nombre\s*\}\}/gi, vars.nombre)
    .replace(/\{\{\s*liga\s*\}\}/gi, vars.liga)
    .replace(/\{\{\s*club\s*\}\}/gi, vars.club)
    .replace(/\{\{\s*fecha\s*\}\}/gi, vars.fecha)
    .replace(/\{\{\s*jornada\s*\}\}/gi, vars.jornada);
}

export function plantillaResuelta(texto: string): boolean {
  return !texto.includes("{{") && !texto.includes("}}");
}

export interface HorarioJornada {
  fecha: string | null;
  horaInicio: string | null;
  estado: string;
}

export function inicioJornadaMs(horario: HorarioJornada): number | null {
  return resolveLigaProgramadoStartMs(
    horario.fecha,
    horario.horaInicio,
    LIGA_TEMPORAL_TZ
  );
}

export function programarRecordatorio(input: {
  horario: HorarioJornada;
  horas: unknown;
  ahora: Date;
  automatizacionActiva: boolean;
}): { ok: true; cuando: Date } | { ok: false; motivo: string } {
  if (!input.automatizacionActiva) {
    return { ok: false, motivo: "automatizacion_apagada" };
  }
  if (input.horario.estado === "completed") {
    return { ok: false, motivo: "jornada_finalizada" };
  }
  if (!input.horario.fecha) {
    return { ok: false, motivo: "jornada_sin_horario" };
  }
  const inicio = inicioJornadaMs(input.horario);
  if (inicio == null) return { ok: false, motivo: "jornada_sin_horario" };
  const horas = normalizarHorasRecordatorio(input.horas);
  const cuando = new Date(inicio - horas * 3_600_000);
  if (input.ahora.getTime() >= inicio) {
    return { ok: false, motivo: "recordatorio_vencido" };
  }
  if (cuando.getTime() <= input.ahora.getTime()) {
    return { ok: false, motivo: "recordatorio_vencido" };
  }
  return { ok: true, cuando };
}

export function recordatorioDebeCancelarse(estadoJornada: string, fecha: string | null): boolean {
  return estadoJornada === "completed" || !fecha;
}

/**
 * Activar la bienvenida no recorre inscritos anteriores.
 * Solo una inscripción nueva, posterior al momento en que se encendió.
 */
export function debeEnviarBienvenida(input: {
  automatizacionActiva: boolean;
  inscritoAt: string | null;
  activadaDesde: string | null;
  autorizado: boolean;
  yaEnviada: boolean;
}): { ok: true } | { ok: false; motivo: string } {
  if (!input.automatizacionActiva) return { ok: false, motivo: "automatizacion_apagada" };
  if (input.yaEnviada) return { ok: false, motivo: "ya_enviada" };
  if (!altaPosteriorALaActivacion(input.inscritoAt, input.activadaDesde)) {
    return { ok: false, motivo: "sin_alta_nueva" };
  }
  if (!input.autorizado) return { ok: false, motivo: "sin_autorizacion" };
  return { ok: true };
}

function altaPosteriorALaActivacion(
  inscritoAt: string | null,
  activadaDesde: string | null
): boolean {
  if (!inscritoAt || !activadaDesde) return false;
  const alta = Date.parse(inscritoAt);
  const desde = Date.parse(activadaDesde);
  return Number.isFinite(alta) && Number.isFinite(desde) && alta >= desde;
}

export function horaDeRondaUno(
  partidos: Array<{ ronda?: number; hora_inicio?: string | null }>
): string | null {
  return jornadaHoraInicioLabel(partidos);
}

export type EstadoCola = "pendiente" | "procesando" | "enviado" | "error" | "omitido" | "pausado";

export function reclamarTrabajo(input: {
  estado: EstadoCola;
  programadoPara: Date | null;
  ahora: Date;
  attempts: number;
}): "reclamado" | "esperando" | "agotado" | "cerrado" {
  if (input.estado !== "pendiente") return "cerrado";
  if (input.attempts >= 3) return "agotado";
  if (input.programadoPara && input.programadoPara.getTime() > input.ahora.getTime()) {
    return "esperando";
  }
  return "reclamado";
}

/** El segundo trabajador ya no ve pendiente: la reclamación es de un solo ganador. */
export function reclamarUnaVez(estados: EstadoCola[]): { ganador: number | null; estados: EstadoCola[] } {
  const siguiente = [...estados];
  const ganador = siguiente.findIndex((estado) => estado === "pendiente");
  if (ganador >= 0) siguiente[ganador] = "procesando";
  return { ganador: ganador >= 0 ? ganador : null, estados: siguiente };
}

export function falloProveedor(status: number, tieneLoteManual: boolean): {
  reintentar: boolean;
  motivo: string;
} {
  if (status === 0 && !tieneLoteManual) {
    return { reintentar: false, motivo: "respuesta_ambigua" };
  }
  if (status === 429 || status >= 500 || status === 0) {
    return { reintentar: true, motivo: "error_temporal" };
  }
  return { reintentar: false, motivo: "error_proveedor" };
}

const ASUNTO_RESULTADOS = "Resultados oficiales — {{liga}} | Jornada {{jornada}}";

const CUERPO_RESULTADOS = [
  "¡Tu jornada ha terminado, pero tu historia continúa!",
  "",
  "Hola {{nombre}},",
  "",
  "Una jornada más de {{liga}} ha llegado a su fin.",
  "",
  "Cada game ganado, cada punto disputado y cada partido jugado forman parte de tu crecimiento deportivo.",
  "",
  "Los resultados oficiales de la Jornada {{jornada}} ya están disponibles.",
  "",
  "Fecha: {{fecha}}",
  "Sede: {{club}}",
].join("\n");

export function construirCorreoResultados(input: {
  nombre: string;
  liga: string;
  club: string;
  fecha: string;
  jornada: string;
  url: string;
  logoUrl?: string | null;
  acentoHex?: string | null;
}): { ok: true; asunto: string; html: string; text: string } | { ok: false; motivo: "plantilla_incompleta" | "sin_url_publica" } {
  if (!urlPublicaJornadaValida(input.url)) {
    return { ok: false, motivo: "sin_url_publica" };
  }
  const vars = {
    nombre: input.nombre.trim(),
    liga: input.liga.trim(),
    club: input.club.trim(),
    fecha: input.fecha.trim(),
    jornada: input.jornada.trim(),
  };
  if (Object.values(vars).some((valor) => valor.length === 0)) {
    return { ok: false, motivo: "plantilla_incompleta" };
  }
  const asunto = sustituirVariablesCorreo(ASUNTO_RESULTADOS, vars).slice(0, 180);
  const cuerpo = sustituirVariablesCorreo(CUERPO_RESULTADOS, vars);
  if (!plantillaResuelta(asunto) || !plantillaResuelta(cuerpo)) {
    return { ok: false, motivo: "plantilla_incompleta" };
  }
  const branding = resolveLigaMailBranding({
    clubNombre: vars.club,
    logoUrl: input.logoUrl,
    acentoHex: input.acentoHex,
  });
  const paragraphs = cuerpo
    .split(/\n{2,}/)
    .map((bloque) => bloque.trim())
    .filter((bloque) => !bloque.startsWith("Fecha:") && !bloque.startsWith("Sede:"))
    .map((bloque) => {
      const lines = escapeHtml(bloque).replace(/\n/g, "<br />");
      return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">${lines}</p>`;
    })
    .join("");
  const html = renderPremiumEmailHtml({
    branding,
    asunto,
    title: "¡Tu jornada ha terminado, pero tu historia continúa!",
    paragraphsHtml: paragraphs,
    jornadaCard: {
      fecha: vars.fecha,
      horario: `Jornada ${vars.jornada}`,
      sede: vars.club,
    },
    actionButton: {
      label: "VER RESULTADOS DE LA JORNADA",
      url: input.url,
    },
    cierreDetalleHtml: `<div style="margin:28px 0 0;padding-top:20px;border-top:1px solid #E5E7EB;">
      <p style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#4B5563;">Sigue compitiendo, superándote y construyendo tu historia dentro de Riviera Open.</p>
      <p style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#4B5563;font-style:italic;">¡Nos vemos en la próxima jornada!</p>
      <p style="margin:0 0 6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#111827;">RIVIERA OPEN</p>
      <p style="margin:0 0 4px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#475569;font-style:italic;">Compite. Juega limpio. Vive Riviera Open.</p>
      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#0D0F12;">Cada partido cuenta.</p>
    </div>`,
    ligaUrl: input.url,
  });
  if (!plantillaResuelta(html) || html.includes("**") || html.includes("<script")) {
    return { ok: false, motivo: "plantilla_incompleta" };
  }
  const text = [
    cuerpo,
    `VER RESULTADOS DE LA JORNADA: ${input.url}`,
    "Sigue compitiendo, superándote y construyendo tu historia dentro de Riviera Open.",
    "¡Nos vemos en la próxima jornada!",
    "RIVIERA OPEN",
    "Compite. Juega limpio. Vive Riviera Open.",
    "Cada partido cuenta.",
  ].join("\n\n");
  return { ok: true, asunto, html, text };
}

export function etiquetaTipoComunicacion(tipo: string | null | undefined): string {
  switch (tipo) {
    case "resultados_jornada":
      return "Resultados de jornada";
    case "recordatorio_jornada":
      return "Recordatorio de jornada";
    case "aviso_general":
      return "Aviso";
    case "cambio_horario":
      return "Cambio de horario";
    case "felicitacion":
      return "Felicitación";
    case "personalizado":
      return "Mensaje";
    case "supervision":
      return "Copia de supervisión";
    case "prueba":
      return "Prueba";
    case "jornada":
      return "Jornada";
    default:
      return "Bienvenida";
  }
}

export function etiquetaOrigenComunicacion(
  origen: string | null | undefined,
  tipo: string | null | undefined
): "Automático" | "Manual" | "Prueba" {
  if (tipo === "prueba") return "Prueba";
  if (tipo === "supervision" || origen === "automatico") return "Automático";
  if (tipo === "resultados_jornada" || tipo === "recordatorio_jornada") {
    return "Automático";
  }
  return "Manual";
}

export const MOTIVOS_AUTOMATICOS = [
  "automatizacion_apagada",
  "jornada_no_finalizada",
  "sin_partidos",
  "partidos_pendientes",
  "sin_url_publica",
  "plantilla_incompleta",
  "jornada_finalizada",
  "jornada_sin_horario",
  "horarios_distintos",
  "recordatorio_vencido",
  "sin_alta_nueva",
  "ya_enviada",
  "respuesta_ambigua",
  "cancelado",
] as const;

export type AlcanceSupervision = "resultados" | "todas";

export const SUPERVISION_MAX_INTENTOS = 5;
export const SUPERVISION_VIGENCIA_MINUTOS = 30;
export const SUPERVISION_MAX_SOLICITUDES = 3;
export const PRUEBA_MAX_POR_HORA = 3;

export function correoSupervisionValido(email: string | null | undefined): boolean {
  const value = email?.trim().toLowerCase() ?? "";
  if (!value || value.length > 180 || value.endsWith("@padel.local")) return false;
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

export function normalizarAlcanceSupervision(raw: unknown): AlcanceSupervision {
  return raw === "todas" ? "todas" : "resultados";
}

export function puedeActivarCopia(input: {
  activa: boolean;
  email: string | null | undefined;
  alcance: unknown;
  tipo: string;
}): boolean {
  if (!input.activa) return false;
  if (!correoSupervisionValido(input.email)) return false;
  const alcance = normalizarAlcanceSupervision(input.alcance);
  if (alcance === "resultados") return input.tipo === "resultados_jornada";
  return (
    input.tipo === "resultados_jornada" ||
    input.tipo === "recordatorio_jornada" ||
    input.tipo === "bienvenida"
  );
}

export function claveSupervision(ligaId: string, tipo: string, eventoId: string): string {
  return `supervision:${tipo}:${ligaId}:${eventoId}`;
}

export function copiaYaRegistrada(claves: string[], clave: string): boolean {
  return claves.includes(clave);
}

export function permiteOtroEnvio(input: {
  conteo: number;
  ventana: Date | null;
  ahora: Date;
  maximo: number;
}): boolean {
  if (!input.ventana || input.ahora.getTime() - input.ventana.getTime() >= 3_600_000) {
    return true;
  }
  return input.conteo < input.maximo;
}

export function decidirConfirmacionToken(input: {
  expira: Date;
  intentos: number;
  ahora: Date;
}): "ok" | "vencido" | "limite" {
  if (input.ahora.getTime() > input.expira.getTime()) return "vencido";
  if (input.intentos >= SUPERVISION_MAX_INTENTOS) return "limite";
  return "ok";
}

export function resumenSupervision(input: {
  procesados: number;
  aceptados: number;
  errores: number;
  reintentos: number;
}): string {
  const pendiente = input.reintentos > 0
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
    ["Tipo", etiquetaTipoComunicacion(input.tipo)],
    ["Destinatarios procesados", String(input.procesados)],
    ["Aceptados por proveedor", String(input.aceptados)],
    ["Errores", String(input.errores)],
    [
      "Reintentos",
      input.reintentos > 0
        ? `${input.reintentos} pendientes`
        : "Ninguno",
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
  const nombreEjemplo = (input.nombreEjemplo ?? NOMBRE_EJEMPLO_SUPERVISION).trim() || NOMBRE_EJEMPLO_SUPERVISION;
  const liga = input.liga.trim();
  const club = input.club.trim();
  const tipoLabel = etiquetaTipoComunicacion(input.tipo);
  const meta = [liga, club, input.jornada, input.tipo, input.asuntoEnviado, input.cuerpoEnviado].join("\n");
  if (meta.includes("@") || /\{\{/.test(meta)) {
    return { ok: false, motivo: "datos_privados" };
  }
  const resultados = input.tipo === "resultados_jornada";
  const jornadaUrl = input.jornadaUrl?.trim() || null;
  if (resultados && !urlPublicaJornadaValida(jornadaUrl)) {
    return { ok: false, motivo: "sin_url_publica" };
  }
  if (input.asuntoEnviado.includes("{{") || input.cuerpoEnviado.includes("{{")) {
    return { ok: false, motivo: "plantilla_incompleta" };
  }

  const parsed = extractJornadaDetailsFromText(input.cuerpoEnviado, club);
  const avisos: string[] = [];
  if (input.tipo === "recordatorio_jornada" || resultados) {
    if (!parsed.jornadaCard?.fecha || parsed.jornadaCard.fecha === "Por definir") {
      avisos.push("Dato faltante: fecha oficial de la jornada.");
    }
    if (
      input.tipo === "recordatorio_jornada" &&
      (!parsed.jornadaCard?.horario || parsed.jornadaCard.horario === "Por definir")
    ) {
      avisos.push("Dato faltante: horario oficial de la jornada.");
    }
  }
  if ((input.tipo === "recordatorio_jornada" || resultados) && !jornadaUrl) {
    avisos.push("Dato faltante: URL pública de la jornada.");
  }

  const asunto = `Supervisión — ${liga} | ${tipoLabel}`.slice(0, 180);
  const resumenTexto = [
    "SUPERVISIÓN DE ENVÍO",
    `Liga: ${liga}`,
    `Club: ${club}`,
    `Jornada: ${input.jornada || "—"}`,
    `Tipo: ${tipoLabel}`,
    resumenSupervision(input),
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
  });

  return {
    ok: true,
    asunto,
    html: `<div style="max-width:640px;margin:0 auto;padding:16px 12px 0;">${resumenHtml}</div>${visual.html}`,
    text: `${resumenTexto}\n\n---\n\n${visual.text}`,
  };
}

export function construirCorreoPrueba(): {
  asunto: string;
  html: string;
  text: string;
} {
  const asunto = "[PRUEBA] AppRiviera — Notificación de jornada";
  const aviso = "ESTE ES UN CORREO DE PRUEBA. NO CORRESPONDE A UNA NOTIFICACIÓN OFICIAL.";
  const cuerpo = [
    aviso,
    "Liga de ejemplo",
    "Club de ejemplo",
    "Jornada de ejemplo",
    "Fecha de ejemplo",
    "Horario de ejemplo",
    "Los datos de esta vista son ficticios.",
    "Esta demostración no abre resultados oficiales ni acciones de administración.",
  ].join("\n\n");
  const branding = resolveLigaMailBranding({ clubNombre: "Club de ejemplo" });
  const html = renderPremiumEmailHtml({
    branding,
    asunto,
    title: aviso,
    paragraphsHtml: cuerpo
      .split(/\n{2,}/)
      .map((bloque) => `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#374151;">${escapeHtml(bloque)}</p>`)
      .join(""),
    actionButton: {
      label: "DEMOSTRACIÓN",
      url: "https://appriviera.rivieraopen.com/",
    },
  });
  return { asunto, html, text: `${cuerpo}\n\nDEMOSTRACIÓN: https://appriviera.rivieraopen.com/` };
}

export function esCorreoDeJugador(tipo: string | null | undefined): boolean {
  return tipo !== "supervision" && tipo !== "prueba" && tipo !== "verificacion";
}
