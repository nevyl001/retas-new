import { supabase } from "../lib/supabaseClient";

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

export interface ConfigNotificacionLiga {
  bienvenida_pausada: boolean;
  modo_prueba: boolean;
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
  liga_jugador_id: string;
  estado: string;
  attempts: number;
  motivo: string | null;
}

export interface NotificacionesLigaSnapshot {
  disponible: boolean;
  preferencias: PreferenciaNotificacionRow[];
  config: ConfigNotificacionLiga;
  historial: HistorialNotificacionRow[];
  cola: ColaNotificacionRow[];
  verificaciones: VerificacionSolicitudRow[];
}

export interface ResultadoNotificacion {
  ok: boolean;
  motivo: string | null;
}

const CONFIG_INICIAL: ConfigNotificacionLiga = {
  bienvenida_pausada: true,
  modo_prueba: true,
};

const VACIO: NotificacionesLigaSnapshot = {
  disponible: false,
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

export async function cargarNotificacionesLiga(
  ligaId: string
): Promise<NotificacionesLigaSnapshot> {
  const [preferencias, config, historial, cola, verificaciones] =
    await Promise.all([
      supabase
        .from("liga_notificaciones_preferencias")
        .select(
          "liga_jugador_id, riviera_jugador_id, admin_habilitado, consentimiento_estado, consentimiento_origen, consentimiento_registrado_at, correo_verificado, correo_verificacion_origen, correo_verificado_email"
        )
        .eq("liga_id", ligaId),
      supabase
        .from("liga_notificaciones_config")
        .select("bienvenida_pausada, modo_prueba")
        .eq("liga_id", ligaId)
        .maybeSingle(),
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
        .select("liga_jugador_id, estado, attempts, motivo")
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

  const errores = [
    preferencias.error,
    config.error,
    historial.error,
    cola.error,
    verificaciones.error,
  ].flatMap((error) => (error ? [error.message] : []));

  if (errores.some(esEsquemaAusente)) {
    // 0100 sin 0101: el panel de bienvenida sigue usable.
    if (
      !preferencias.error &&
      !config.error &&
      !historial.error &&
      !cola.error &&
      verificaciones.error &&
      esEsquemaAusente(verificaciones.error.message)
    ) {
      return {
        disponible: true,
        preferencias: (preferencias.data ?? []).map((row) => ({
          ...(row as PreferenciaNotificacionRow),
          correo_verificacion_origen:
            (row as PreferenciaNotificacionRow).correo_verificacion_origen ??
            null,
          correo_verificado_email:
            (row as PreferenciaNotificacionRow).correo_verificado_email ?? null,
        })),
        config: (config.data as ConfigNotificacionLiga | null) ?? CONFIG_INICIAL,
        historial: (historial.data ?? []) as HistorialNotificacionRow[],
        cola: (cola.data ?? []) as ColaNotificacionRow[],
        verificaciones: [],
      };
    }
    return VACIO;
  }
  if (errores.length > 0) {
    aviso("no_disponible");
    return { ...VACIO, disponible: true };
  }

  const configRow = config.data as ConfigNotificacionLiga | null;

  return {
    disponible: true,
    preferencias: (preferencias.data ?? []) as PreferenciaNotificacionRow[],
    config: configRow ?? CONFIG_INICIAL,
    historial: (historial.data ?? []) as HistorialNotificacionRow[],
    cola: (cola.data ?? []) as ColaNotificacionRow[],
    verificaciones: (verificaciones.data ?? []) as VerificacionSolicitudRow[],
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
}): Promise<ResultadoNotificacion> {
  return asegurarPreferencia(
    input.ligaId,
    input.jugadorId,
    input.rivieraJugadorId,
    {
      consentimiento_estado: "autorizado",
      consentimiento_origen: input.origen,
    }
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
  const { error } = await supabase.from("liga_notificaciones_config").upsert(
    {
      liga_id: ligaId,
      bienvenida_pausada: config.bienvenida_pausada,
      modo_prueba: config.modo_prueba,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "liga_id" }
  );
  if (error) {
    if (esEsquemaAusente(error.message)) {
      return { ok: false, motivo: "esquema_pendiente" };
    }
    aviso("no_disponible");
    return { ok: false, motivo: "no_disponible" };
  }
  return { ok: true, motivo: null };
}

export async function solicitarBienvenidaJugador(
  ligaId: string,
  jugadorId: string
): Promise<ResultadoNotificacion & { encolado: boolean }> {
  const { data, error } = await supabase.rpc("encolar_bienvenida_liga", {
    p_liga_id: ligaId,
    p_liga_jugador_id: jugadorId,
  });
  if (error) {
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

/** Tras una inscripción nueva. No lanza y no crea fila si el jugador no está listo. */
export async function encolarBienvenidaTrasInscripcion(
  ligaId: string,
  jugadorId: string
): Promise<void> {
  try {
    await solicitarBienvenidaJugador(ligaId, jugadorId);
  } catch {
    aviso("no_disponible");
  }
}
