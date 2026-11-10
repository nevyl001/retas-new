import { zonedDayStartMs } from "../../torneoExpress/eventoTemporal";
import type {
  ColaNotificacionRow,
  HistorialNotificacionRow,
} from "../../../services/ligaNotificacionesService";
import {
  esCorreoDeJugador,
  etiquetaOrigenComunicacion,
  etiquetaTipoComunicacion,
} from "./automatizacion";
import { presentarInstanteLiga } from "./datosOficialesJornada";
import {
  esComunicacionOperativaHistorial,
  esExclusionElegibilidadHistorial,
  etiquetaEntregaComunicacion,
} from "./historialComunicaciones";

export const ZONA_HORARIA_HISTORIAL = "America/Mexico_City";
export const HISTORIAL_PAGE_SIZE = 20;

export type FiltroEstadoHistorial =
  | "todos"
  | "aceptados"
  | "pendientes"
  | "errores"
  | "pruebas";

export type CategoriaFiltroHistorial =
  | "aceptados"
  | "pendientes"
  | "errores"
  | "pruebas"
  | "otros"
  | "exclusion";

export const FILTROS_ESTADO_HISTORIAL: ReadonlyArray<{
  id: FiltroEstadoHistorial;
  label: string;
}> = [
  { id: "todos", label: "TODOS" },
  { id: "aceptados", label: "ACEPTADOS" },
  { id: "pendientes", label: "PENDIENTES" },
  { id: "errores", label: "ERRORES" },
  { id: "pruebas", label: "PRUEBAS" },
];

export interface PeriodoMensualHistorial {
  year: number;
  month: number; // 1..12
}

export interface RangoPeriodoMensual extends PeriodoMensualHistorial {
  desdeIso: string;
  hastaIso: string;
  desdeMs: number;
  hastaMs: number;
  etiqueta: string;
}

export type TipoFechaEfectivaHistorial =
  | "enviado"
  | "programado"
  | "procesando"
  | "error"
  | "prueba"
  | "registrado"
  | "sin_fecha";

export interface FechaEfectivaResuelta {
  iso: string | null;
  timestampMs: number | null;
  diaClaveCdmx: string | null;
  yearCdmx: number | null;
  monthCdmx: number | null;
  tipoFecha: TipoFechaEfectivaHistorial;
  etiquetaFecha: string;
}

export interface ResumenPeriodoHistorial {
  aceptados: number;
  pendientes: number;
  errores: number;
  pruebas: number;
}

export interface RegistroHistorialUnificado {
  claveUnica: string;
  ordenId: string;
  fuente: "log" | "cola";
  logId?: string;
  queueId?: string;
  loteId?: string | null;
  jugadorId: string | null;
  jugadorNombre: string;
  esDeJugador: boolean;
  tipo: string;
  tipoLabel: string;
  origen: string | null;
  origenLabel: "Automático" | "Manual" | "Prueba";
  jornadaNumero: number | null;
  estado: string;
  proveedorEstado: string | null;
  motivo: string | null;
  attempts: number;
  estadoBadge: string;
  tonoEstado: "accepted" | "pending" | "error" | "test" | "neutral";
  categoriaFiltro: Exclude<CategoriaFiltroHistorial, "exclusion">;
  fechaEfectiva: FechaEfectivaResuelta;
  programadoPara: string | null;
  cuerpoTexto: string | null;
  asuntoTexto: string | null;
  procesados?: number | null;
  aceptadosCount?: number | null;
  erroresCount?: number | null;
  reintentosCount?: number | null;
  puedeBorrar: boolean;
  puedeReintentar: boolean;
}

export interface GrupoDiaHistorial {
  diaClave: string;
  etiquetaDia: string;
  etiquetaConteo: string;
  registros: RegistroHistorialUnificado[];
}

export interface ResultadoPaginaHistorialPeriodo {
  registrosPagina: RegistroHistorialUnificado[];
  gruposDia: GrupoDiaHistorial[];
  resumenPeriodo: ResumenPeriodoHistorial;
  totalPeriodo: number;
  totalFiltrados: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizarTextoBusqueda(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

function partesFechaCdmx(
  ms: number
): { year: number; month: number; day: number } | null {
  if (!Number.isFinite(ms)) return null;
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA_HISTORIAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const part of dtf.formatToParts(new Date(ms))) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }
  if (!parts.year || !parts.month || !parts.day) return null;
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function mesActualCdmx(ahora: Date = new Date()): PeriodoMensualHistorial {
  const partes = partesFechaCdmx(ahora.getTime());
  if (!partes) {
    return { year: ahora.getUTCFullYear(), month: ahora.getUTCMonth() + 1 };
  }
  return { year: partes.year, month: partes.month };
}

export function periodoDeInstanteCdmx(
  iso: string | null | undefined
): PeriodoMensualHistorial | null {
  if (!iso || typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const partes = partesFechaCdmx(ms);
  if (!partes) return null;
  return { year: partes.year, month: partes.month };
}

export function navegarMesHistorial(
  periodo: PeriodoMensualHistorial,
  delta: number
): PeriodoMensualHistorial {
  const totalMeses = periodo.year * 12 + (periodo.month - 1) + Math.trunc(delta);
  const year = Math.floor(totalMeses / 12);
  const month = ((totalMeses % 12) + 12) % 12 + 1;
  return { year, month };
}

export function etiquetaPeriodoMensual(periodo: PeriodoMensualHistorial): string {
  const mes = MESES_ES[periodo.month - 1] ?? MESES_ES[0];
  return `${mes.toLocaleUpperCase("es-MX")} ${periodo.year}`;
}

export function rangoMesCdmx(
  periodo: PeriodoMensualHistorial
): RangoPeriodoMensual {
  const year = periodo.year;
  const month = Math.min(12, Math.max(1, Math.trunc(periodo.month)));
  const siguiente = navegarMesHistorial({ year, month }, 1);
  const desdeDay = `${year}-${pad2(month)}-01`;
  const hastaDay = `${siguiente.year}-${pad2(siguiente.month)}-01`;
  const desdeMs =
    zonedDayStartMs(desdeDay, ZONA_HORARIA_HISTORIAL) ??
    Date.parse(`${desdeDay}T06:00:00.000Z`);
  const hastaMs =
    zonedDayStartMs(hastaDay, ZONA_HORARIA_HISTORIAL) ??
    Date.parse(`${hastaDay}T06:00:00.000Z`);
  return {
    year,
    month,
    desdeIso: new Date(desdeMs).toISOString(),
    hastaIso: new Date(hastaMs).toISOString(),
    desdeMs,
    hastaMs,
    etiqueta: etiquetaPeriodoMensual({ year, month }),
  };
}

export function formatearInstanteCdmx(
  iso: string | null | undefined
): string | null {
  return presentarInstanteLiga(iso, ZONA_HORARIA_HISTORIAL);
}

export function etiquetaDiaCdmx(diaClave: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(diaClave)) {
    return "SIN FECHA REGISTRADA";
  }
  const [year, month, day] = diaClave.split("-").map(Number);
  const mes = MESES_ES[month - 1];
  if (!year || !month || !day || !mes) {
    return "SIN FECHA REGISTRADA";
  }
  const mediodiaUtc = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const diaSemana = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    timeZone: "UTC",
  }).format(mediodiaUtc);
  return `${diaSemana.toLocaleUpperCase("es-MX")} ${day} DE ${mes.toLocaleUpperCase("es-MX")}`;
}

export function etiquetaConteoComunicaciones(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? "comunicación" : "comunicaciones"}`;
}

export function clasificarFiltroEstadoHistorial(input: {
  estado: string;
  tipo?: string | null;
  proveedor_estado?: string | null;
  motivo?: string | null;
}): CategoriaFiltroHistorial {
  if (
    esExclusionElegibilidadHistorial({
      estado: input.estado,
      motivo: input.motivo,
    })
  ) {
    return "exclusion";
  }
  if (input.tipo === "prueba") {
    return "pruebas";
  }
  if (
    input.proveedor_estado === "rebote" ||
    input.motivo === "rebote" ||
    input.estado === "error"
  ) {
    return "errores";
  }
  if (
    input.proveedor_estado === "aceptado" ||
    input.proveedor_estado === "entregado" ||
    input.estado === "enviado"
  ) {
    return "aceptados";
  }
  if (input.estado === "pendiente") {
    return "pendientes";
  }
  return "otros";
}

export function coincideFiltroEstadoHistorial(
  categoria: CategoriaFiltroHistorial,
  filtro: FiltroEstadoHistorial
): boolean {
  if (categoria === "exclusion") return false;
  if (filtro === "todos") return true;
  return categoria === filtro;
}

function resolverIsoValido(
  candidatos: ReadonlyArray<string | null | undefined>
): { iso: string; ms: number } | null {
  for (const raw of candidatos) {
    if (!raw || typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const ms = Date.parse(trimmed);
    if (Number.isFinite(ms)) {
      return { iso: trimmed, ms };
    }
  }
  return null;
}

export function determinarFechaEfectivaHistorial(input: {
  fuente: "log" | "cola";
  estado: string;
  tipo?: string | null;
  proveedor_estado?: string | null;
  motivo?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  processed_at?: string | null;
  programado_para?: string | null;
}): FechaEfectivaResuelta {
  const esPrueba = input.tipo === "prueba";
  const esError =
    input.proveedor_estado === "rebote" ||
    input.motivo === "rebote" ||
    input.estado === "error";
  const esAceptado =
    Boolean(
      input.proveedor_estado === "aceptado" ||
        input.proveedor_estado === "entregado"
    ) || input.estado === "enviado";

  let tipoFecha: TipoFechaEfectivaHistorial = "registrado";
  let resuelto: { iso: string; ms: number } | null = null;

  if (esPrueba) {
    tipoFecha = "prueba";
    resuelto = resolverIsoValido([
      input.created_at,
      input.processed_at,
      input.updated_at,
    ]);
  } else if (esAceptado) {
    tipoFecha = "enviado";
    resuelto =
      input.fuente === "log"
        ? resolverIsoValido([input.created_at, input.processed_at])
        : resolverIsoValido([
            input.processed_at,
            input.updated_at,
            input.created_at,
          ]);
  } else if (input.estado === "pendiente") {
    const programado = resolverIsoValido([input.programado_para]);
    if (programado) {
      tipoFecha = "programado";
      resuelto = programado;
    } else {
      tipoFecha = "registrado";
      resuelto = resolverIsoValido([input.created_at, input.updated_at]);
    }
  } else if (input.estado === "procesando") {
    tipoFecha = "procesando";
    resuelto = resolverIsoValido([
      input.updated_at,
      input.created_at,
      input.programado_para,
    ]);
  } else if (esError) {
    tipoFecha = "error";
    resuelto =
      input.fuente === "log"
        ? resolverIsoValido([input.created_at, input.processed_at])
        : resolverIsoValido([
            input.processed_at,
            input.updated_at,
            input.created_at,
            input.programado_para,
          ]);
  } else {
    tipoFecha = "registrado";
    resuelto = resolverIsoValido([
      input.processed_at,
      input.updated_at,
      input.created_at,
      input.programado_para,
    ]);
  }

  if (!resuelto) {
    return {
      iso: null,
      timestampMs: null,
      diaClaveCdmx: null,
      yearCdmx: null,
      monthCdmx: null,
      tipoFecha: "sin_fecha",
      etiquetaFecha: "Sin fecha registrada",
    };
  }

  const partes = partesFechaCdmx(resuelto.ms);
  const diaClaveCdmx = partes
    ? `${partes.year}-${pad2(partes.month)}-${pad2(partes.day)}`
    : null;
  const legible = formatearInstanteCdmx(resuelto.iso) ?? resuelto.iso;

  let etiquetaFecha: string;
  switch (tipoFecha) {
    case "enviado":
      etiquetaFecha = `Enviado ${legible}`;
      break;
    case "programado":
      etiquetaFecha = `Programado ${legible} (Ciudad de México)`;
      break;
    case "procesando":
      etiquetaFecha = `Procesando ${legible}`;
      break;
    case "error":
      etiquetaFecha = `Intento ${legible}`;
      break;
    case "prueba":
      etiquetaFecha = esAceptado
        ? `Prueba enviada ${legible}`
        : `Prueba ${legible}`;
      break;
    default:
      etiquetaFecha = `Registrado ${legible}`;
      break;
  }

  return {
    iso: resuelto.iso,
    timestampMs: resuelto.ms,
    diaClaveCdmx,
    yearCdmx: partes?.year ?? null,
    monthCdmx: partes?.month ?? null,
    tipoFecha,
    etiquetaFecha,
  };
}

function rangoEntregaInterno(row: {
  estado: string;
  proveedor_estado?: string | null;
}): number {
  if (row.proveedor_estado === "entregado") return 5;
  if (row.proveedor_estado === "aceptado" || row.estado === "enviado") return 4;
  if (row.estado === "error") return 3;
  if (row.estado === "omitido" || row.estado === "pausado") return 2;
  return 1;
}

export function deduplicarLogsHistorial(
  logs: ReadonlyArray<HistorialNotificacionRow>
): HistorialNotificacionRow[] {
  const elegidos = new Map<string, HistorialNotificacionRow>();
  for (const log of logs) {
    const clave = log.queue_id || log.id;
    const previo = elegidos.get(clave);
    if (
      !previo ||
      rangoEntregaInterno(log) > rangoEntregaInterno(previo) ||
      (rangoEntregaInterno(log) === rangoEntregaInterno(previo) &&
        (log.created_at ?? "") > (previo.created_at ?? ""))
    ) {
      elegidos.set(clave, log);
    }
  }
  return Array.from(elegidos.values());
}

function colaDuplicadaEnLogs(
  item: ColaNotificacionRow,
  logsOperativos: ReadonlyArray<HistorialNotificacionRow>
): boolean {
  if (item.id && logsOperativos.some((log) => log.queue_id === item.id)) {
    return true;
  }
  if (item.estado !== "enviado") return false;
  return logsOperativos.some((log) => {
    const mismo =
      log.queue_id && item.id
        ? log.queue_id === item.id
        : log.liga_jugador_id === item.liga_jugador_id;
    return mismo && rangoEntregaInterno(log) >= 4;
  });
}

function tonoEstadoParaCategoria(
  categoria: Exclude<CategoriaFiltroHistorial, "exclusion">
): "accepted" | "pending" | "error" | "test" | "neutral" {
  switch (categoria) {
    case "aceptados":
      return "accepted";
    case "pendientes":
      return "pending";
    case "errores":
      return "error";
    case "pruebas":
      return "test";
    default:
      return "neutral";
  }
}

export function unificarRegistrosHistorial(input: {
  logs: ReadonlyArray<HistorialNotificacionRow>;
  cola: ReadonlyArray<ColaNotificacionRow>;
  nombresPorJugadorId: ReadonlyMap<string, string>;
}): RegistroHistorialUnificado[] {
  const colaPorId = new Map<string, ColaNotificacionRow>();
  for (const item of input.cola) {
    if (item.id) colaPorId.set(item.id, item);
  }

  const logsDeduplicados = deduplicarLogsHistorial(input.logs).filter((item) =>
    esComunicacionOperativaHistorial(item)
  );

  const registros: RegistroHistorialUnificado[] = [];
  const clavesVistas = new Set<string>();

  for (const log of logsDeduplicados) {
    const categoria = clasificarFiltroEstadoHistorial({
      estado: log.estado,
      tipo: log.tipo,
      proveedor_estado: log.proveedor_estado,
      motivo: log.motivo,
    });
    if (categoria === "exclusion") continue;

    const colaVinculada = log.queue_id ? colaPorId.get(log.queue_id) : undefined;
    const tipo = log.tipo || colaVinculada?.tipo || "bienvenida";
    const origen = log.origen ?? colaVinculada?.origen ?? null;
    const jornadaNumero =
      log.jornada_numero ?? colaVinculada?.jornada_numero ?? null;
    const deJugador = esCorreoDeJugador(tipo);
    const jugadorNombre = deJugador
      ? (log.liga_jugador_id
          ? input.nombresPorJugadorId.get(log.liga_jugador_id)
          : null) ?? "Jugador"
      : etiquetaTipoComunicacion(tipo);

    const fechaEfectiva = determinarFechaEfectivaHistorial({
      fuente: "log",
      estado: log.estado,
      tipo,
      proveedor_estado: log.proveedor_estado,
      motivo: log.motivo,
      created_at: log.created_at,
      processed_at: colaVinculada?.processed_at ?? null,
      programado_para: colaVinculada?.programado_para ?? null,
    });

    const claveUnica = log.id;
    if (clavesVistas.has(claveUnica)) continue;
    clavesVistas.add(claveUnica);

    registros.push({
      claveUnica,
      ordenId: log.id,
      fuente: "log",
      logId: log.id,
      queueId: log.queue_id ?? undefined,
      loteId: colaVinculada?.lote_id ?? null,
      jugadorId: log.liga_jugador_id ?? null,
      jugadorNombre,
      esDeJugador: deJugador,
      tipo,
      tipoLabel: etiquetaTipoComunicacion(tipo),
      origen,
      origenLabel: etiquetaOrigenComunicacion(origen, tipo),
      jornadaNumero,
      estado: log.estado,
      proveedorEstado: log.proveedor_estado ?? null,
      motivo: log.motivo ?? null,
      attempts: log.attempts ?? 0,
      estadoBadge: etiquetaEntregaComunicacion(
        log.estado,
        log.proveedor_estado,
        log.motivo
      ),
      tonoEstado: tonoEstadoParaCategoria(categoria),
      categoriaFiltro: categoria,
      fechaEfectiva,
      programadoPara: colaVinculada?.programado_para ?? null,
      cuerpoTexto: colaVinculada?.cuerpo_texto ?? null,
      asuntoTexto: colaVinculada?.asunto ?? null,
      procesados: log.procesados ?? null,
      aceptadosCount: log.aceptados ?? null,
      erroresCount: log.errores ?? null,
      reintentosCount: log.reintentos ?? null,
      puedeBorrar: log.estado !== "procesando",
      puedeReintentar: false,
    });
  }

  const colaOperativa = input.cola.filter(
    (item) =>
      esComunicacionOperativaHistorial(item) &&
      !colaDuplicadaEnLogs(item, logsDeduplicados)
  );

  colaOperativa.forEach((item, index) => {
    const categoria = clasificarFiltroEstadoHistorial({
      estado: item.estado,
      tipo: item.tipo,
      proveedor_estado: null,
      motivo: item.motivo,
    });
    if (categoria === "exclusion") return;

    const tipo = item.tipo || "bienvenida";
    const origen = item.origen ?? null;
    const deJugador = esCorreoDeJugador(tipo);
    const jugadorNombre = deJugador
      ? input.nombresPorJugadorId.get(item.liga_jugador_id) ?? "Jugador"
      : etiquetaTipoComunicacion(tipo);

    const fechaEfectiva = determinarFechaEfectivaHistorial({
      fuente: "cola",
      estado: item.estado,
      tipo,
      proveedor_estado: null,
      motivo: item.motivo,
      created_at: item.created_at ?? null,
      updated_at: item.updated_at ?? null,
      processed_at: item.processed_at ?? null,
      programado_para: item.programado_para ?? null,
    });

    const claveUnica = item.id
      ? `cola-${item.id}`
      : `${item.liga_jugador_id}-${item.estado}-${index}`;
    if (clavesVistas.has(claveUnica)) return;
    clavesVistas.add(claveUnica);

    registros.push({
      claveUnica,
      ordenId: item.id ?? claveUnica,
      fuente: "cola",
      queueId: item.id,
      loteId: item.lote_id ?? null,
      jugadorId: item.liga_jugador_id,
      jugadorNombre,
      esDeJugador: deJugador,
      tipo,
      tipoLabel: etiquetaTipoComunicacion(tipo),
      origen,
      origenLabel: etiquetaOrigenComunicacion(origen, tipo),
      jornadaNumero: item.jornada_numero ?? null,
      estado: item.estado,
      proveedorEstado: null,
      motivo: item.motivo ?? null,
      attempts: item.attempts ?? 0,
      estadoBadge: etiquetaEntregaComunicacion(item.estado, null, item.motivo),
      tonoEstado: tonoEstadoParaCategoria(categoria),
      categoriaFiltro: categoria,
      fechaEfectiva,
      programadoPara: item.programado_para ?? null,
      cuerpoTexto: item.cuerpo_texto ?? null,
      asuntoTexto: item.asunto ?? null,
      puedeBorrar: Boolean(item.id) && item.estado !== "procesando",
      puedeReintentar:
        (item.estado === "error" || item.estado === "pendiente") &&
        Boolean(item.lote_id),
    });
  });

  registros.sort((a, b) => {
    const aSinFecha = a.fechaEfectiva.timestampMs === null;
    const bSinFecha = b.fechaEfectiva.timestampMs === null;
    if (aSinFecha !== bSinFecha) {
      return aSinFecha ? 1 : -1;
    }
    if (
      a.fechaEfectiva.timestampMs !== null &&
      b.fechaEfectiva.timestampMs !== null &&
      a.fechaEfectiva.timestampMs !== b.fechaEfectiva.timestampMs
    ) {
      return b.fechaEfectiva.timestampMs - a.fechaEfectiva.timestampMs;
    }
    return b.ordenId.localeCompare(a.ordenId);
  });

  return registros;
}

export function perteneceAPeriodoCdmx(
  registro: RegistroHistorialUnificado,
  periodo: PeriodoMensualHistorial,
  incluirSinFecha = false
): boolean {
  if (registro.fechaEfectiva.timestampMs === null) {
    return incluirSinFecha;
  }
  return (
    registro.fechaEfectiva.yearCdmx === periodo.year &&
    registro.fechaEfectiva.monthCdmx === periodo.month
  );
}

export function coincideBusquedaHistorial(
  registro: Pick<
    RegistroHistorialUnificado,
    | "jugadorNombre"
    | "tipo"
    | "tipoLabel"
    | "origenLabel"
    | "jornadaNumero"
    | "estadoBadge"
  >,
  busqueda: string
): boolean {
  const query = normalizarTextoBusqueda(busqueda);
  if (!query) return true;

  const jornadaTexto =
    registro.jornadaNumero !== null
      ? `jornada ${registro.jornadaNumero}`
      : "";
  const numeroDirecto =
    /^\d+$/.test(query) &&
    registro.jornadaNumero !== null &&
    String(registro.jornadaNumero) === query;

  if (numeroDirecto) return true;

  const campos = [
    registro.jugadorNombre,
    registro.tipoLabel,
    registro.tipo.replace(/_/g, " "),
    registro.origenLabel,
    jornadaTexto,
    registro.estadoBadge,
  ]
    .map(normalizarTextoBusqueda)
    .filter(Boolean);

  return campos.some((campo) => campo.includes(query));
}

export function calcularResumenPeriodoHistorial(
  registrosDelPeriodo: ReadonlyArray<RegistroHistorialUnificado>
): ResumenPeriodoHistorial {
  let aceptados = 0;
  let pendientes = 0;
  let errores = 0;
  let pruebas = 0;

  for (const item of registrosDelPeriodo) {
    if (item.categoriaFiltro === "aceptados") aceptados += 1;
    else if (item.categoriaFiltro === "pendientes") pendientes += 1;
    else if (item.categoriaFiltro === "errores") errores += 1;
    else if (item.categoriaFiltro === "pruebas") pruebas += 1;
  }

  return { aceptados, pendientes, errores, pruebas };
}

export function agruparHistorialPorDiaCdmx(
  registros: ReadonlyArray<RegistroHistorialUnificado>
): GrupoDiaHistorial[] {
  const porDia = new Map<string, RegistroHistorialUnificado[]>();

  for (const registro of registros) {
    const clave = registro.fechaEfectiva.diaClaveCdmx ?? "sin-fecha";
    const lista = porDia.get(clave);
    if (lista) {
      lista.push(registro);
    } else {
      porDia.set(clave, [registro]);
    }
  }

  const clavesOrdenadas = Array.from(porDia.keys()).sort((a, b) => {
    if (a === "sin-fecha") return 1;
    if (b === "sin-fecha") return -1;
    return b.localeCompare(a);
  });

  return clavesOrdenadas.map((diaClave) => {
    const items = porDia.get(diaClave) ?? [];
    return {
      diaClave,
      etiquetaDia: etiquetaDiaCdmx(diaClave),
      etiquetaConteo: etiquetaConteoComunicaciones(items.length),
      registros: items,
    };
  });
}

export function resolverDiasExpandidosHistorial(
  grupos: ReadonlyArray<GrupoDiaHistorial>,
  overridesUsuario: Readonly<Record<string, boolean>>
): Record<string, boolean> {
  const resultado: Record<string, boolean> = {};
  const diaMasReciente =
    grupos.find((grupo) => grupo.diaClave !== "sin-fecha")?.diaClave ?? null;

  for (const grupo of grupos) {
    if (Object.prototype.hasOwnProperty.call(overridesUsuario, grupo.diaClave)) {
      resultado[grupo.diaClave] = Boolean(overridesUsuario[grupo.diaClave]);
    } else if (grupo.diaClave === diaMasReciente) {
      resultado[grupo.diaClave] = true;
    } else if (grupo.diaClave === "sin-fecha") {
      resultado[grupo.diaClave] = true;
    } else {
      resultado[grupo.diaClave] = false;
    }
  }
  return resultado;
}

export function filtrarYPaginarHistorialPeriodo(input: {
  registros: ReadonlyArray<RegistroHistorialUnificado>;
  periodo: PeriodoMensualHistorial;
  filtro: FiltroEstadoHistorial;
  busqueda: string;
  page: number;
  pageSize?: number;
  incluirSinFecha?: boolean;
}): ResultadoPaginaHistorialPeriodo {
  const pageSize = Math.max(1, input.pageSize ?? HISTORIAL_PAGE_SIZE);
  const page = Math.max(0, Math.trunc(input.page));

  const delPeriodo = input.registros.filter((item) =>
    perteneceAPeriodoCdmx(item, input.periodo, input.incluirSinFecha === true)
  );

  const resumenPeriodo = calcularResumenPeriodoHistorial(delPeriodo);

  const filtrados = delPeriodo.filter(
    (item) =>
      coincideFiltroEstadoHistorial(item.categoriaFiltro, input.filtro) &&
      coincideBusquedaHistorial(item, input.busqueda)
  );

  const limiteAcumulado = (page + 1) * pageSize;
  const registrosPagina = filtrados.slice(0, limiteAcumulado);
  const gruposDia = agruparHistorialPorDiaCdmx(registrosPagina);

  return {
    registrosPagina,
    gruposDia,
    resumenPeriodo,
    totalPeriodo: delPeriodo.length,
    totalFiltrados: filtrados.length,
    hasMore: filtrados.length > limiteAcumulado,
    page,
    pageSize,
  };
}

