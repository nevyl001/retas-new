import { supabase } from "../lib/supabaseClient";
import {
  mapContactoInscritoRow,
  type ContactoInscritoResuelto,
} from "../lib/liga/notificaciones/resolveInscritoContacto";

export interface PreferenciaNotificacionRow {
  liga_jugador_id: string;
  riviera_jugador_id: string | null;
  admin_habilitado: boolean;
  consentimiento_estado: "sin_autorizacion" | "autorizado" | "revocado";
  consentimiento_origen: string | null;
  consentimiento_registrado_at: string | null;
  correo_verificado: boolean;
  correo_verificacion_origen: "enlace_de_confirmacion" | null;
  correo_verificado_email: string | null;
}

export interface VerificacionSolicitudRow {
  id: string;
  liga_jugador_id: string;
  estado: "pendiente" | "confirmado" | "vencido" | "invalidado" | "cancelado";
  expires_at: string;
  confirmed_at: string | null;
  created_at: string;
}

export type ModoOperacionNotificaciones = "manual" | "automatico";

export interface ConfigNotificacionLiga {
  bienvenida_pausada: boolean;
  modo_prueba: boolean;
  /** manual = default. automatico = opt-in persistido; no dispara envíos reales en Fase 1. */
  modo_operacion: ModoOperacionNotificaciones;
}

/** Automatización de envíos reales: apagada hasta activación expresa de producto. */
export function automatizacionEnviosRealesDisponible(): boolean {
  return process.env.REACT_APP_LIGA_NOTIFICACIONES_AUTO === "true";
}

export interface HistorialNotificacionRow {
  id: string;
  liga_jugador_id: string;
  tipo: string;
  estado: string;
  attempts: number;
  motivo: string | null;
  proveedor_estado: string | null;
  created_at: string;
}

export interface ColaNotificacionRow {
  id?: string;
  liga_jugador_id: string;
  estado: string;
  attempts: number;
  motivo: string | null;
  lote_id?: string | null;
}

export interface ResultadoDescarte {
  ok: boolean;
  descartados: number;
  motivo: string | null;
}

export interface ResultadoProcesamientoLote {
  ok: boolean;
  enviosReales: boolean;
  enviados: number;
  omitidos: number;
  errores: number;
  procesados: number;
  fueraAllowlist: number;
  pendientes: number;
  motivo: string | null;
}

export interface NotificacionesLigaSnapshot {
  disponible: boolean;
  /**
   * Preferencias/config/cola de 0100 utilizables (toggles, consentimiento,
   * encolar). Independiente de verificación (0101) y modo_operacion (0103).
   */
  escriturasActivas: boolean;
  /** Tabla/RPC de verificación de correo (0101) disponible. */
  verificacionDisponible: boolean;
  preferencias: PreferenciaNotificacionRow[];
  config: ConfigNotificacionLiga;
  historial: HistorialNotificacionRow[];
  cola: ColaNotificacionRow[];
  verificaciones: VerificacionSolicitudRow[];
  /** La cola o el log no pudieron leerse. Los registros que sí llegaron se conservan. */
  errorCarga?: string | null;
}

export interface ResultadoNotificacion {
  ok: boolean;
  motivo: string | null;
}

const CONFIG_INICIAL: ConfigNotificacionLiga = {
  bienvenida_pausada: true,
  modo_prueba: true,
  modo_operacion: "manual",
};

function normalizarModoOperacion(raw: unknown): ModoOperacionNotificaciones {
  return raw === "automatico" ? "automatico" : "manual";
}

const VACIO: NotificacionesLigaSnapshot = {
  disponible: false,
  escriturasActivas: false,
  verificacionDisponible: false,
  preferencias: [],
  config: CONFIG_INICIAL,
  historial: [],
  cola: [],
  verificaciones: [],
};

export function esEsquemaAusente(message: string): boolean {
  return /does not exist|schema cache|could not find the function|PGRST202|PGRST205|404/i.test(
    message
  );
}

function motivoSeguro(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return /^[a-z_]{1,40}$/.test(raw) ? raw : "no_disponible";
}

function aviso(motivo: string | null): void {
  // Solo códigos cortos. Nunca tokens, enlaces ni correos.
  if (motivo && motivo !== "esquema_pendiente") {
    console.warn("[liga-notificaciones]", motivo);
  }
}

/** El cliente solo muestra enlace_simulado si el build lo autorizó de forma explícita. */
export function simulacionNotificacionesClienteActiva(): boolean {
  return process.env.REACT_APP_LIGA_NOTIFICACIONES_SIMULACION === "true";
}

/**
 * Contacto canónico de inscritos (Riviera ID / cesión). Solo lectura.
 * Si 0105 no está aplicada, devuelve [] y el panel usa el email local.
 */
export async function cargarContactoInscritosLiga(
  ligaId: string
): Promise<ContactoInscritoResuelto[]> {
  const { data, error } = await supabase.rpc(
    "liga_inscritos_contacto_autorizado",
    { p_liga_id: ligaId }
  );
  if (error) {
    if (esEsquemaAusente(error.message)) return [];
    aviso("no_disponible");
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[])
    .map((row) => mapContactoInscritoRow(row))
    .filter((row): row is ContactoInscritoResuelto => row !== null);
}

const PREFERENCIAS_SELECT_0101 =
  "liga_jugador_id, riviera_jugador_id, admin_habilitado, consentimiento_estado, consentimiento_origen, consentimiento_registrado_at, correo_verificado, correo_verificacion_origen, correo_verificado_email";

const PREFERENCIAS_SELECT_0100 =
  "liga_jugador_id, riviera_jugador_id, admin_habilitado, consentimiento_estado, consentimiento_origen, consentimiento_registrado_at, correo_verificado";

type ConsultaDominioError = { message: string };

type PreferenciasConsultaResultado = {
  rows: PreferenciaNotificacionRow[];
  error: ConsultaDominioError | null;
};

type ConfigConsultaResultado = {
  data: ConfigNotificacionLiga;
  modoOperacionPresente: boolean;
  error: ConsultaDominioError | null;
};

function mapPreferenciaRow(row: Record<string, unknown>): PreferenciaNotificacionRow {
  const origenRaw = row.correo_verificacion_origen;
  const origen =
    origenRaw === "enlace_de_confirmacion" ? "enlace_de_confirmacion" : null;
  const emailRaw = row.correo_verificado_email;
  const estadoRaw = row.consentimiento_estado;
  const consentimiento_estado: PreferenciaNotificacionRow["consentimiento_estado"] =
    estadoRaw === "autorizado" || estadoRaw === "revocado"
      ? estadoRaw
      : "sin_autorizacion";

  return {
    liga_jugador_id: String(row.liga_jugador_id ?? ""),
    riviera_jugador_id:
      typeof row.riviera_jugador_id === "string" ? row.riviera_jugador_id : null,
    admin_habilitado: row.admin_habilitado === true,
    consentimiento_estado,
    consentimiento_origen:
      typeof row.consentimiento_origen === "string"
        ? row.consentimiento_origen
        : null,
    consentimiento_registrado_at:
      typeof row.consentimiento_registrado_at === "string"
        ? row.consentimiento_registrado_at
        : null,
    correo_verificado: row.correo_verificado === true,
    // 0100 no trae estas columnas; quedan null hasta 0101.
    correo_verificacion_origen: origen,
    correo_verificado_email: typeof emailRaw === "string" ? emailRaw : null,
  };
}

function esFalloColumnasPreferencias0101(message: string): boolean {
  if (!esEsquemaAusente(message)) return false;
  return (
    /correo_verificacion_origen|correo_verificado_email/i.test(message) ||
    /column|schema cache/i.test(message)
  );
}

/**
 * Intenta select 0101; si faltan columnas, cae a 0100 y normaliza al dominio.
 * No reasigna variables inferidas con shapes PostgREST incompatibles.
 */
async function consultarPreferenciasLiga(
  ligaId: string
): Promise<PreferenciasConsultaResultado> {
  const intento0101 = await supabase
    .from("liga_notificaciones_preferencias")
    .select(PREFERENCIAS_SELECT_0101)
    .eq("liga_id", ligaId);

  if (!intento0101.error) {
    return {
      rows: ((intento0101.data ?? []) as Record<string, unknown>[]).map(
        mapPreferenciaRow
      ),
      error: null,
    };
  }

  if (!esFalloColumnasPreferencias0101(intento0101.error.message)) {
    return {
      rows: [],
      error: { message: intento0101.error.message },
    };
  }

  const intento0100 = await supabase
    .from("liga_notificaciones_preferencias")
    .select(PREFERENCIAS_SELECT_0100)
    .eq("liga_id", ligaId);

  if (intento0100.error) {
    return {
      rows: [],
      error: { message: intento0100.error.message },
    };
  }

  return {
    rows: ((intento0100.data ?? []) as Record<string, unknown>[]).map(
      mapPreferenciaRow
    ),
    error: null,
  };
}

async function consultarConfigLiga(
  ligaId: string
): Promise<ConfigConsultaResultado> {
  const intento0103 = await supabase
    .from("liga_notificaciones_config")
    .select("bienvenida_pausada, modo_prueba, modo_operacion")
    .eq("liga_id", ligaId)
    .maybeSingle();

  if (!intento0103.error) {
    const row = (intento0103.data ?? null) as Record<string, unknown> | null;
    return {
      data: {
        bienvenida_pausada: row?.bienvenida_pausada !== false,
        modo_prueba: row?.modo_prueba !== false,
        modo_operacion: normalizarModoOperacion(row?.modo_operacion),
      },
      modoOperacionPresente: true,
      error: null,
    };
  }

  if (
    !/modo_operacion/i.test(intento0103.error.message) ||
    !esEsquemaAusente(intento0103.error.message)
  ) {
    return {
      data: CONFIG_INICIAL,
      modoOperacionPresente: false,
      error: { message: intento0103.error.message },
    };
  }

  const intento0100 = await supabase
    .from("liga_notificaciones_config")
    .select("bienvenida_pausada, modo_prueba")
    .eq("liga_id", ligaId)
    .maybeSingle();

  if (intento0100.error) {
    return {
      data: CONFIG_INICIAL,
      modoOperacionPresente: false,
      error: { message: intento0100.error.message },
    };
  }

  const row = (intento0100.data ?? null) as Record<string, unknown> | null;
  return {
    data: {
      bienvenida_pausada: row?.bienvenida_pausada !== false,
      modo_prueba: row?.modo_prueba !== false,
      modo_operacion: "manual",
    },
    modoOperacionPresente: false,
    error: null,
  };
}

/**
 * Carga el snapshot. Los toggles (admin_habilitado) requieren solo tablas 0100.
 * Columnas/tablas de 0101–0103 ausentes NO deben apagar escriturasActivas.
 */
export async function cargarNotificacionesLiga(
  ligaId: string
): Promise<NotificacionesLigaSnapshot> {
  const [preferencias, config, historial, cola, verificaciones] =
    await Promise.all([
      consultarPreferenciasLiga(ligaId),
      consultarConfigLiga(ligaId),
      supabase
        .from("liga_notificaciones_log")
        .select(
          "id, liga_jugador_id, tipo, estado, attempts, motivo, proveedor_estado, created_at"
        )
        .eq("liga_id", ligaId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("liga_notificaciones_queue")
        .select("id, liga_jugador_id, estado, attempts, motivo, lote_id")
        .eq("liga_id", ligaId)
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("liga_notificaciones_verificaciones")
        .select(
          "id, liga_jugador_id, estado, expires_at, confirmed_at, created_at"
        )
        .eq("liga_id", ligaId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  // Núcleo 0100 ausente → sin escrituras.
  if (
    (preferencias.error && esEsquemaAusente(preferencias.error.message)) ||
    (config.error && esEsquemaAusente(config.error.message))
  ) {
    return VACIO;
  }

  if (preferencias.error || config.error) {
    aviso("no_disponible");
    return {
      ...VACIO,
      disponible: true,
      escriturasActivas: false,
      verificacionDisponible: false,
    };
  }

  const historialRows =
    historial.error && esEsquemaAusente(historial.error.message)
      ? []
      : historial.error
        ? null
        : ((historial.data ?? []) as HistorialNotificacionRow[]);
  const colaRows =
    cola.error && esEsquemaAusente(cola.error.message)
      ? []
      : cola.error
        ? null
        : ((cola.data ?? []) as ColaNotificacionRow[]);

  const errorCarga =
    historialRows === null || colaRows === null ? "no_disponible" : null;
  if (errorCarga) aviso("no_disponible");

  const verificacionDisponible = !(
    verificaciones.error && esEsquemaAusente(verificaciones.error.message)
  );
  if (verificaciones.error && !esEsquemaAusente(verificaciones.error.message)) {
    aviso("no_disponible");
  }

  return {
    disponible: true,
    // Toggles/consentimiento: 0100 basta. Verificación/envíos son independientes.
    escriturasActivas: true,
    verificacionDisponible,
    preferencias: preferencias.rows,
    config: config.data,
    historial: historialRows ?? [],
    cola: colaRows ?? [],
    errorCarga,
    verificaciones: verificacionDisponible
      ? ((verificaciones.data ?? []) as VerificacionSolicitudRow[])
      : [],
  };
}

async function asegurarPreferencia(
  ligaId: string,
  jugadorId: string,
  rivieraJugadorId: string | null,
  patch: Record<string, unknown>
): Promise<ResultadoNotificacion> {
  const updated = await supabase
    .from("liga_notificaciones_preferencias")
    .update(patch)
    .eq("liga_id", ligaId)
    .eq("liga_jugador_id", jugadorId)
    .select("liga_jugador_id");

  if (updated.error) {
    if (esEsquemaAusente(updated.error.message)) {
      return { ok: false, motivo: "esquema_pendiente" };
    }
    if (/consentimiento_sin_evidencia/i.test(updated.error.message)) {
      return { ok: false, motivo: "consentimiento_sin_evidencia" };
    }
    aviso("no_disponible");
    return { ok: false, motivo: "no_disponible" };
  }

  if ((updated.data ?? []).length > 0) return { ok: true, motivo: null };

  const inserted = await supabase.from("liga_notificaciones_preferencias").insert({
    liga_id: ligaId,
    liga_jugador_id: jugadorId,
    riviera_jugador_id: rivieraJugadorId,
    admin_habilitado: false,
    consentimiento_estado: "sin_autorizacion",
    correo_verificado: false,
    ...patch,
  });

  if (inserted.error) {
    if (esEsquemaAusente(inserted.error.message)) {
      return { ok: false, motivo: "esquema_pendiente" };
    }
    if (/consentimiento_sin_evidencia/i.test(inserted.error.message)) {
      return { ok: false, motivo: "consentimiento_sin_evidencia" };
    }
    aviso("no_disponible");
    return { ok: false, motivo: "no_disponible" };
  }

  return { ok: true, motivo: null };
}

export async function establecerHabilitacionJugador(input: {
  ligaId: string;
  jugadorId: string;
  rivieraJugadorId: string | null;
  habilitado: boolean;
}): Promise<ResultadoNotificacion> {
  const guardado = await asegurarPreferencia(
    input.ligaId,
    input.jugadorId,
    input.rivieraJugadorId,
    { admin_habilitado: input.habilitado }
  );
  if (!guardado.ok || input.habilitado) return guardado;

  const pausa = await supabase.rpc("pausar_bienvenida_pendiente_liga", {
    p_liga_id: input.ligaId,
    p_liga_jugador_id: input.jugadorId,
  });
  if (pausa.error && !esEsquemaAusente(pausa.error.message)) {
    aviso("no_disponible");
  }
  return guardado;
}

export async function registrarConsentimientoJugador(input: {
  ligaId: string;
  jugadorId: string;
  rivieraJugadorId: string | null;
  origen: string;
  /** Fecha real del consentimiento previo; el trigger la conserva si viene. */
  registradoAt?: string | null;
}): Promise<ResultadoNotificacion> {
  const actual = await supabase
    .from("liga_notificaciones_preferencias")
    .select("consentimiento_estado")
    .eq("liga_id", input.ligaId)
    .eq("liga_jugador_id", input.jugadorId)
    .maybeSingle();

  if (actual.error) {
    if (esEsquemaAusente(actual.error.message)) {
      return { ok: false, motivo: "esquema_pendiente" };
    }
    aviso("no_disponible");
    return { ok: false, motivo: "no_disponible" };
  }

  const estado = actual.data?.consentimiento_estado;
  if (estado === "revocado") return { ok: false, motivo: "revocado" };
  if (estado === "autorizado") return { ok: false, motivo: "ya_autorizado" };

  const patch: Record<string, unknown> = {
    consentimiento_estado: "autorizado",
    consentimiento_origen: input.origen,
  };
  if (input.registradoAt?.trim()) {
    patch.consentimiento_registrado_at = input.registradoAt.trim();
  }
  return asegurarPreferencia(
    input.ligaId,
    input.jugadorId,
    input.rivieraJugadorId,
    patch
  );
}

export async function revocarConsentimientoJugador(input: {
  ligaId: string;
  jugadorId: string;
  rivieraJugadorId: string | null;
}): Promise<ResultadoNotificacion> {
  const guardado = await asegurarPreferencia(
    input.ligaId,
    input.jugadorId,
    input.rivieraJugadorId,
    { consentimiento_estado: "revocado" }
  );
  if (!guardado.ok) return guardado;
  await supabase.rpc("pausar_bienvenida_pendiente_liga", {
    p_liga_id: input.ligaId,
    p_liga_jugador_id: input.jugadorId,
  });
  return guardado;
}

export async function establecerCorreoVerificado(_input: {
  ligaId: string;
  jugadorId: string;
  rivieraJugadorId: string | null;
  verificado: boolean;
}): Promise<ResultadoNotificacion> {
  return { ok: false, motivo: "correo_sin_verificacion" };
}

export async function solicitarVerificacionCorreo(input: {
  ligaId: string;
  jugadorId: string;
}): Promise<
  ResultadoNotificacion & {
    simulado: boolean;
    enlaceSimulado: string | null;
    solicitudId: string | null;
  }
> {
  const { data, error } = await supabase.rpc(
    "solicitar_verificacion_correo_liga",
    {
      p_liga_id: input.ligaId,
      p_liga_jugador_id: input.jugadorId,
    }
  );
  if (error) {
    if (esEsquemaAusente(error.message)) {
      return {
        ok: false,
        motivo: "esquema_pendiente",
        simulado: false,
        enlaceSimulado: null,
        solicitudId: null,
      };
    }
    aviso("no_disponible");
    return {
      ok: false,
      motivo: "no_disponible",
      simulado: false,
      enlaceSimulado: null,
      solicitudId: null,
    };
  }
  const row = (data ?? {}) as {
    ok?: boolean;
    motivo?: unknown;
    simulado?: boolean;
    enlace_simulado?: unknown;
    solicitud_id?: unknown;
  };
  // Doble candado: el RPC solo incluye el token con GUC de servidor;
  // el cliente lo ignora salvo build local con REACT_APP_LIGA_NOTIFICACIONES_SIMULACION=true.
  const enlace =
    simulacionNotificacionesClienteActiva() &&
    typeof row.enlace_simulado === "string" &&
    /^https:\/\/[^?\s]+\/public\/verificar-correo\?t=[a-f0-9]{48,128}$/i.test(
      row.enlace_simulado
    )
      ? row.enlace_simulado
      : null;
  return {
    ok: row.ok === true,
    motivo: motivoSeguro(row.motivo),
    simulado: row.simulado === true && enlace !== null,
    enlaceSimulado: enlace,
    solicitudId:
      typeof row.solicitud_id === "string" ? row.solicitud_id : null,
  };
}

export async function inspeccionarVerificacionCorreo(
  token: string
): Promise<{ ok: boolean; estado: string }> {
  const { data, error } = await supabase.rpc(
    "inspeccionar_verificacion_correo_liga",
    { p_token: token }
  );
  if (error) {
    if (esEsquemaAusente(error.message)) {
      return { ok: false, estado: "invalido" };
    }
    return { ok: false, estado: "error_temporal" };
  }
  const row = (data ?? {}) as { ok?: boolean; estado?: unknown };
  const estado =
    typeof row.estado === "string" && /^[a-z_]{1,40}$/.test(row.estado)
      ? row.estado
      : "invalido";
  return { ok: row.ok !== false, estado };
}

export async function confirmarVerificacionCorreo(
  token: string
): Promise<{ ok: boolean; estado: string }> {
  const { data, error } = await supabase.rpc(
    "confirmar_verificacion_correo_liga",
    { p_token: token }
  );
  if (error) {
    if (esEsquemaAusente(error.message)) {
      return { ok: false, estado: "invalido" };
    }
    return { ok: false, estado: "error_temporal" };
  }
  const row = (data ?? {}) as { ok?: boolean; estado?: unknown };
  const estado =
    typeof row.estado === "string" && /^[a-z_]{1,40}$/.test(row.estado)
      ? row.estado
      : "invalido";
  return { ok: row.ok === true, estado };
}

export async function guardarConfigLiga(
  ligaId: string,
  config: ConfigNotificacionLiga
): Promise<ResultadoNotificacion> {
  const payloadBase = {
    liga_id: ligaId,
    bienvenida_pausada: config.bienvenida_pausada,
    modo_prueba: config.modo_prueba,
    updated_at: new Date().toISOString(),
  };
  const conModo = {
    ...payloadBase,
    modo_operacion: normalizarModoOperacion(config.modo_operacion),
  };
  let { error } = await supabase
    .from("liga_notificaciones_config")
    .upsert(conModo, { onConflict: "liga_id" });
  if (
    error &&
    /modo_operacion/i.test(error.message) &&
    esEsquemaAusente(error.message)
  ) {
    ({ error } = await supabase
      .from("liga_notificaciones_config")
      .upsert(payloadBase, { onConflict: "liga_id" }));
  }
  if (error) {
    if (esEsquemaAusente(error.message)) {
      return { ok: false, motivo: "esquema_pendiente" };
    }
    aviso("no_disponible");
    return { ok: false, motivo: "no_disponible" };
  }
  return { ok: true, motivo: null };
}

/**
 * Encola una comunicación manual del compositor (plantilla + asunto + cuerpo).
 * Requiere migración 0106. No envía: solo escribe en la cola.
 */
export async function solicitarComunicacionManual(input: {
  ligaId: string;
  jugadorId: string;
  tipo: string;
  asunto: string;
  cuerpo: string;
  loteId: string;
}): Promise<ResultadoNotificacion & { encolado: boolean }> {
  const { data, error } = await supabase.rpc("encolar_comunicacion_manual_liga", {
    p_liga_id: input.ligaId,
    p_liga_jugador_id: input.jugadorId,
    p_tipo: input.tipo,
    p_asunto: input.asunto,
    p_cuerpo: input.cuerpo,
    p_lote_id: input.loteId,
  });
  if (error) {
    if (esEsquemaAusente(error.message)) {
      // Sin 0106: bienvenida legacy sigue disponible para ese tipo.
      if (input.tipo === "bienvenida") {
        return solicitarBienvenidaJugador(input.ligaId, input.jugadorId);
      }
      return { ok: false, encolado: false, motivo: "esquema_pendiente" };
    }
    aviso("no_disponible");
    return { ok: false, encolado: false, motivo: "no_disponible" };
  }
  const row = (data ?? {}) as { ok?: boolean; encolado?: boolean; motivo?: unknown };
  return {
    ok: row.ok !== false,
    encolado: row.encolado === true,
    motivo: motivoSeguro(row.motivo),
  };
}

/**
 * Pide al servidor procesar solo este lote. No lleva secretos.
 * Con envíos reales apagados el servidor no escribe la cola.
 */
export async function solicitarProcesamientoLote(input: {
  ligaId: string;
  loteId: string;
  reintentar?: boolean;
  tipo?: string;
  jugadores?: { jugadorId: string; asunto: string; cuerpo: string }[];
}): Promise<ResultadoProcesamientoLote> {
  const vacio: ResultadoProcesamientoLote = {
    ok: false,
    enviosReales: false,
    enviados: 0,
    omitidos: 0,
    errores: 0,
    procesados: 0,
    fueraAllowlist: 0,
    pendientes: 0,
    motivo: "no_disponible",
  };
  const { data, error } = await supabase.functions.invoke(
    "procesar-lote-liga-notificaciones",
    {
      body: {
        liga_id: input.ligaId,
        lote_id: input.loteId,
        reintentar: input.reintentar === true,
        tipo: input.tipo,
        jugadores: (input.jugadores ?? []).slice(0, 50).map((jugador) => ({
          jugador_id: jugador.jugadorId,
          asunto: jugador.asunto,
          cuerpo: jugador.cuerpo,
        })),
      },
      timeout: 55000,
    }
  );
  if (error) {
    const http = error as { message?: string; context?: { status?: number } };
    const status = http.context?.status;
    if (status === 401) return { ...vacio, motivo: "sesion_invalida" };
    if (status === 403) return { ...vacio, motivo: "sin_permiso" };
    if (status === 404) return { ...vacio, motivo: "lote_no_encontrado" };
    if (esEsquemaAusente(http.message ?? "")) {
      return { ...vacio, motivo: "funcion_no_disponible" };
    }
    aviso("no_disponible");
    return { ...vacio, motivo: "procesador_no_disponible" };
  }
  const row = (data ?? {}) as Partial<ResultadoProcesamientoLote> & {
    fuera_allowlist?: number;
  };
  return {
    ok: row.ok === true,
    enviosReales: row.enviosReales === true,
    enviados: Number(row.enviados ?? 0),
    omitidos: Number(row.omitidos ?? 0),
    errores: Number(row.errores ?? 0),
    procesados: Number(row.procesados ?? 0),
    fueraAllowlist: Number(row.fueraAllowlist ?? row.fuera_allowlist ?? 0),
    pendientes: Number(row.pendientes ?? row.fuera_allowlist ?? 0),
    motivo: motivoSeguro(row.motivo ?? (row as { error?: unknown }).error),
  };
}

/**
 * Sin id, limpia los no enviados de la liga.
 * Con id, también quita un aceptado o entregado. No toca uno en proceso.
 */
export async function descartarCorreosNoEnviados(input: {
  ligaId: string;
  queueId?: string;
  logId?: string;
}): Promise<ResultadoDescarte> {
  const { data, error } = await supabase.functions.invoke(
    "descartar-liga-notificaciones-no-enviadas",
    {
      body: {
        liga_id: input.ligaId,
        queue_id: input.queueId,
        log_id: input.logId,
      },
    }
  );
  if (error) {
    if (esEsquemaAusente(error.message)) {
      return { ok: false, descartados: 0, motivo: "funcion_no_disponible" };
    }
    aviso("no_disponible");
    return { ok: false, descartados: 0, motivo: "no_disponible" };
  }
  const row = (data ?? {}) as { ok?: boolean; descartados?: number; error?: unknown };
  return {
    ok: row.ok === true,
    descartados: Number(row.descartados ?? 0),
    motivo: row.ok === true ? null : motivoSeguro(row.error),
  };
}

export async function solicitarBienvenidaJugador(
  ligaId: string,
  jugadorId: string,
  origen: "accion_admin" | "inscripcion_confirmada" = "accion_admin"
): Promise<ResultadoNotificacion & { encolado: boolean }> {
  const { data, error } = await supabase.rpc("encolar_bienvenida_liga", {
    p_liga_id: ligaId,
    p_liga_jugador_id: jugadorId,
    p_origen: origen,
  });
  if (error) {
    const firmaAntigua =
      origen === "accion_admin" &&
      (/Could not find the function[^\n]*encolar_bienvenida_liga/i.test(
        error.message
      ) ||
        /p_origen/i.test(error.message));
    if (firmaAntigua) {
      const fallback = await supabase.rpc("encolar_bienvenida_liga", {
        p_liga_id: ligaId,
        p_liga_jugador_id: jugadorId,
      });
      if (!fallback.error) {
        const row = (fallback.data ?? {}) as {
          ok?: boolean;
          encolado?: boolean;
          motivo?: unknown;
        };
        return {
          ok: row.ok !== false,
          encolado: row.encolado === true,
          motivo: motivoSeguro(row.motivo),
        };
      }
      if (esEsquemaAusente(fallback.error.message)) {
        return { ok: false, encolado: false, motivo: "esquema_pendiente" };
      }
    }
    if (esEsquemaAusente(error.message)) {
      return { ok: false, encolado: false, motivo: "esquema_pendiente" };
    }
    aviso("no_disponible");
    return { ok: false, encolado: false, motivo: "no_disponible" };
  }
  const row = (data ?? {}) as { ok?: boolean; encolado?: boolean; motivo?: unknown };
  return {
    ok: row.ok !== false,
    encolado: row.encolado === true,
    motivo: motivoSeguro(row.motivo),
  };
}

/**
 * Hook post-inscripción.
 * MANUAL (default en Postgres): no encola.
 * AUTOMÁTICO requiere flag de producto + modo_operacion=automatico;
 * el RPC rechaza origen automático si la liga sigue en manual.
 */
export async function encolarBienvenidaTrasInscripcion(
  ligaId: string,
  jugadorId: string
): Promise<void> {
  if (!automatizacionEnviosRealesDisponible()) {
    return;
  }
  try {
    const snapshot = await cargarNotificacionesLiga(ligaId);
    if (!snapshot.disponible || snapshot.config.modo_operacion !== "automatico") {
      return;
    }
    if (snapshot.config.bienvenida_pausada) {
      return;
    }
    await solicitarBienvenidaJugador(
      ligaId,
      jugadorId,
      "inscripcion_confirmada"
    );
  } catch {
    aviso("no_disponible");
  }
}
