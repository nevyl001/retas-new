import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useClubExperience } from "../../club-experience/ClubExperienceContext";
import type {
  LigaEquipo,
  LigaInscripcion,
  LigaJugadorPoolItem,
  LigaSustitucion,
} from "../../lib/liga/types";
import {
  contarDestinatarios,
  estadoVisual,
  normalizarCorreo,
  preferenciaEfectiva,
  puedeEncolarBienvenida,
  registrarConsentimiento,
  type EstadoVisualNotificacion,
} from "../../lib/liga/notificaciones/bienvenidaPolicy";
import { puedeDocumentarAutorizacionVerbal, MAX_DESTINATARIOS_LOTE } from "../../lib/liga/notificaciones/envioManualGate";
import {
  contarPerfilesPorCorreo,
  correoEfectivoDestinatario,
  type ContactoInscritoResuelto,
} from "../../lib/liga/notificaciones/resolveInscritoContacto";
import {
  PLANTILLAS_COMUNICACION,
  renderComunicacionEmail,
  resolverVariablesComunicacion,
  type TipoComunicacionLiga,
} from "../../lib/liga/notificaciones/comunicacionTemplates";
import {
  guardarPlantillaLiga,
  plantillaParaRedactar,
} from "../../lib/liga/notificaciones/plantillasGuardadas";
import { resolveLigaMailBranding } from "../../lib/liga/notificaciones/ligaMailBranding";
import {
  completarConfigAutomatica,
  etiquetaOrigenComunicacion,
  etiquetaTipoComunicacion,
} from "../../lib/liga/notificaciones/automatizacion";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import {
  cargarContactoInscritosLiga,
  cargarNotificacionesLiga,
  descartarCorreosNoEnviados,
  solicitarProcesamientoLote,
  establecerHabilitacionJugador,
  guardarConfigLiga,
  registrarConsentimientoJugador,
  revocarConsentimientoJugador,
  solicitarComunicacionManual,
  type ConfigNotificacionLiga,
  type HistorialNotificacionRow,
  type ColaNotificacionRow,
  type NotificacionesLigaSnapshot,
  type PreferenciaNotificacionRow,
} from "../../services/ligaNotificacionesService";
import { useMobileViewport } from "../../hooks/useMobileViewport";
import { useRetryableImage } from "../../hooks/useRetryableImage";
import { getJugadorInitials } from "../jugadores/JugadorAvatar";
import "./liga-notificaciones.css";

type Area = "destinatarios" | "bienvenida" | "historial" | "configuracion";
type Filtro = "todos" | "habilitados" | "pendientes" | "excluidos";

const AREAS: { id: Area; label: string }[] = [
  { id: "destinatarios", label: "Destinatarios" },
  { id: "bienvenida", label: "Redactar correo" },
  { id: "historial", label: "Historial" },
  { id: "configuracion", label: "Configuración" },
];

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "habilitados", label: "Habilitados" },
  { id: "pendientes", label: "Pendientes" },
  { id: "excluidos", label: "Excluidos" },
];

const ORIGENES = [
  { id: "manifestacion_presencial", label: "En persona" },
  { id: "mensaje_del_jugador", label: "Por mensaje" },
  { id: "formulario_registro", label: "En un formulario" },
  { id: "documento_firmado", label: "En un documento" },
  { id: "consentimiento_previo_registro", label: "Constancia previa" },
] as const;

const ORIGEN_LABEL: Record<string, string> = Object.fromEntries(
  ORIGENES.map((origen) => [origen.id, origen.label])
);

const MOTIVO_LABEL: Record<string, string> = {
  deshabilitado: "Sigue deshabilitado",
  sin_autorizacion: "Falta autorización documentada",
  sin_correo: "No hay correo",
  correo_invalido: "El correo no es válido",
  correo_ambiguo: "El correo está repetido entre identidades",
  correo_por_verificar: "Falta autorización documentada",
  excluido: "Contacto excluido / autorización revocada",
  rebote: "El proveedor reportó un rebote",
  ya_enviado: "Este mensaje ya figura como enviado",
  ya_encolado: "Ya hay un envío pendiente",
  liga_pausada: "Las comunicaciones automáticas están en pausa",
  ya_no_inscrito: "Ya no está inscrito",
  esquema_pendiente: "Falta aplicar la migración de comunicaciones en el servidor",
  no_disponible: "No se pudo guardar",
  consentimiento_sin_evidencia: "Falta una constancia del consentimiento",
  revocado: "La autorización está revocada y no se sobrescribe",
  ya_autorizado: "Ya hay una autorización documentada",
  fecha_invalida: "Indica la fecha real en que el jugador autorizó",
  anon: "Hace falta una sesión",
  sin_permiso: "No tienes permiso en esta liga",
  mensaje_incompleto: "Completa asunto y mensaje",
  lote_requerido: "Confirma el envío desde el compositor",
  tipo_no_soportado: "Plantilla no soportada",
  modo_manual: "Esta liga está en modo manual",
  envios_apagados: "El envío real sigue apagado",
  partidos_pendientes: "La jornada todavía tiene partidos pendientes",
  sin_url_publica: "No hay un enlace público de la jornada",
  plantilla_incompleta: "Faltó resolver el mensaje",
  respuesta_ambigua: "El proveedor no confirmó el envío",
  cancelado: "La jornada cambió y el envío se canceló",
  automatizacion_apagada: "La automatización está desactivada",
  recordatorio_vencido: "El horario del recordatorio ya pasó",
  funcion_no_disponible: "El procesamiento del lote todavía no está disponible",
  procesador_no_disponible: "No se pudo pedir el procesamiento",
  sesion_invalida: "La sesión no pudo autorizar el procesamiento",
  lote_no_encontrado: "Ese lote no está en esta liga",
  conserva_enviado: "Ese correo ya fue aceptado y se conserva",
  en_proceso: "Ese correo se está procesando y no se puede quitar",
  no_encontrado: "Ese correo ya no está en el historial",
  identificador_invalido: "No se pudo identificar el correo",
};

function esCorreoNoEnviado(
  estado: string,
  proveedor: string | null | undefined
): boolean {
  if (estado === "enviado" || estado === "procesando") return false;
  if (proveedor === "aceptado" || proveedor === "entregado") return false;
  return true;
}

function rangoEntrega(row: {
  estado: string;
  proveedor_estado?: string | null;
}): number {
  if (row.proveedor_estado === "entregado") return 5;
  if (row.proveedor_estado === "aceptado" || row.estado === "enviado") return 4;
  if (row.estado === "error") return 3;
  if (row.estado === "omitido" || row.estado === "pausado") return 2;
  return 1;
}

function logsSinRepetir(
  logs: HistorialNotificacionRow[]
): HistorialNotificacionRow[] {
  const elegidos = new Map<string, HistorialNotificacionRow>();
  for (const log of logs) {
    const clave = log.queue_id || log.id;
    const previo = elegidos.get(clave);
    if (
      !previo ||
      rangoEntrega(log) > rangoEntrega(previo) ||
      (rangoEntrega(log) === rangoEntrega(previo) &&
        log.created_at > previo.created_at)
    ) {
      elegidos.set(clave, log);
    }
  }
  return Array.from(elegidos.values()).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

function colaYaMostradaEnHistorial(
  item: ColaNotificacionRow,
  logs: HistorialNotificacionRow[]
): boolean {
  if (item.estado !== "enviado") return false;
  return logs.some((log) => {
    const mismo =
      log.queue_id && item.id
        ? log.queue_id === item.id
        : log.liga_jugador_id === item.liga_jugador_id;
    return mismo && rangoEntrega(log) >= 4;
  });
}

function sePuedeBorrarHistorial(estado: string): boolean {
  return estado !== "procesando";
}

function etiquetaEntrega(
  estado: string,
  proveedor: string | null | undefined,
  motivo?: string | null
): string {
  if (proveedor === "entregado") return "Entregado";
  if (estado === "enviado" || proveedor === "aceptado") return "Aceptado";
  if (estado === "procesando") return "Procesando";
  if (estado === "pendiente" && motivo === "error_temporal") {
    return "Pendiente de reintento";
  }
  if (estado === "pendiente") return "Pendiente";
  if (estado === "error") return "Error";
  if (estado === "omitido" || estado === "pausado") return "Omitido";
  return estado;
}

const ESTADO_PRINCIPAL_LABEL: Record<EstadoVisualNotificacion, string> = {
  habilitado: "Listo para enviar",
  deshabilitado: "Deshabilitado",
  sin_correo: "Sin correo",
  correo_invalido: "Correo inválido",
  correo_por_verificar: "Sin autorización",
  sin_autorizacion: "Sin autorización",
  correo_ambiguo: "Correo ambiguo",
  excluido: "Contacto excluido",
  rebote: "Rebote",
};

/** Etiquetas compactas para las tarjetas del grid. */
const ESTADO_GRID_LABEL: Record<EstadoVisualNotificacion, string> = {
  habilitado: "Listo para enviar",
  deshabilitado: "Deshabilitado",
  sin_correo: "Sin correo",
  correo_invalido: "Correo inválido",
  correo_por_verificar: "Sin autorización",
  sin_autorizacion: "Sin autorización",
  correo_ambiguo: "Correo ambiguo",
  excluido: "Excluido",
  rebote: "Rebote",
};

const MOBILE_PAGE_SIZE = 6;

interface FilaDestinatario {
  jugadorId: string;
  nombre: string;
  rivieraId: string | null;
  rivieraJugadorId: string | null;
  email: string | null;
  fotoUrl: string | null;
  categoria: string | null;
  perfilesConMismoCorreo: number;
  registroAutorizadoAt: string | null;
  preferencia: PreferenciaNotificacionRow | null;
  visual: EstadoVisualNotificacion;
  yaEnviado: boolean;
  yaEncolado: boolean;
  historialJugador: HistorialNotificacionRow[];
}

function preferenciaParaPolitica(
  preferencia: PreferenciaNotificacionRow | null
) {
  if (!preferencia) return null;
  return {
    adminHabilitado: preferencia.admin_habilitado,
    consentimientoEstado: preferencia.consentimiento_estado,
    consentimientoOrigen: preferencia.consentimiento_origen,
    consentimientoRegistradoAt: preferencia.consentimiento_registrado_at,
    correoVerificado: preferencia.correo_verificado,
    correoVerificacionOrigen: preferencia.correo_verificacion_origen,
  };
}

function categoriaVisible(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value in JUGADOR_CATEGORIA_LABELS) {
    return JUGADOR_CATEGORIA_LABELS[value as RivieraJugadorCategoria];
  }
  return null;
}

function mensajeFalloProceso(motivo: string | null): string {
  if (motivo === "lote_no_encontrado") {
    return "No se creó un envío nuevo. La bienvenida anterior sigue aceptada y la cola no permite guardar otra hasta ajustar esa restricción.";
  }
  if (motivo === "sesion_invalida") {
    return "La sesión no pudo autorizar el procesamiento. Revisa Historial.";
  }
  if (motivo === "sin_permiso") {
    return "No tienes permiso en esta liga.";
  }
  return "Correo preparado, pero no se pudo completar el procesamiento. Revisa Historial.";
}

function mensajeResultadoEnvio(
  ok: number,
  proceso: {
    ok?: boolean;
    enviosReales: boolean;
    enviados: number;
    errores: number;
    omitidos: number;
    fueraAllowlist?: number;
    pendientes?: number;
    motivo: string | null;
  } | null
): string {
  const jugadores = `${ok} jugador${ok === 1 ? "" : "es"}`;
  if (!proceso || proceso.ok === false) {
    return "Correo preparado, pero no se pudo completar el procesamiento. Revisa Historial.";
  }
  if (!proceso.enviosReales) {
    return `En cola para ${jugadores}. Pendiente de procesamiento. No se entregó.`;
  }
  const aceptados = proceso.enviados;
  const pendientes = proceso.pendientes ?? proceso.fueraAllowlist ?? 0;
  const errores = proceso.errores;
  const partes = [
    `${aceptados} aceptado${aceptados === 1 ? "" : "s"}`,
    `${pendientes} pendiente${pendientes === 1 ? "" : "s"}`,
    `${errores} error${errores === 1 ? "" : "es"}`,
  ];
  if (proceso.omitidos > 0) {
    partes.push(
      `${proceso.omitidos} omitido${proceso.omitidos === 1 ? "" : "s"}`
    );
  }
  const resumen = partes.join(" · ");
  const prueba =
    (proceso.fueraAllowlist ?? 0) > 0
      ? ` ${(proceso.fueraAllowlist ?? 0)} destinatario${
          proceso.fueraAllowlist === 1 ? "" : "s"
        } siguen pendientes porque no entran en esta prueba.`
      : "";
  return `${resumen}.${prueba} No se marca como entregado hasta la confirmación del proveedor.`;
}

function motivoVisible(motivo: string | null): string {
  if (!motivo) return "Listo";
  return MOTIVO_LABEL[motivo] ?? "No se pudo completar";
}

function estadoTone(visual: EstadoVisualNotificacion): string {
  switch (visual) {
    case "habilitado":
      return "ready";
    case "correo_por_verificar":
    case "sin_autorizacion":
    case "deshabilitado":
      return "pending";
    case "sin_correo":
    case "correo_invalido":
    case "correo_ambiguo":
    case "excluido":
    case "rebote":
      return "blocked";
    default:
      return "blocked";
  }
}

function esPendiente(fila: FilaDestinatario): boolean {
  return (
    fila.visual === "sin_autorizacion" ||
    fila.visual === "correo_por_verificar" ||
    fila.visual === "deshabilitado"
  );
}

function FotoRetrato({
  fotoUrl,
  nombre,
  size = "md",
}: {
  fotoUrl: string | null;
  nombre: string;
  size?: "md" | "lg" | "card";
}) {
  const { src, onError } = useRetryableImage(fotoUrl);
  const initials = getJugadorInitials(nombre);
  return (
    <span
      className={`liga-notificaciones__foto liga-notificaciones__foto--${size}`}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={onError} />
      ) : (
        <span className="liga-notificaciones__foto-fallback">{initials}</span>
      )}
    </span>
  );
}

export interface LigaNotificacionesPanelProps {
  ligaId: string;
  ligaNombre: string;
  inscripciones: LigaInscripcion[];
  equipos: LigaEquipo[];
  pool: LigaJugadorPoolItem[];
  sustituciones: LigaSustitucion[];
}

export const LigaNotificacionesPanel: React.FC<LigaNotificacionesPanelProps> = ({
  ligaId,
  ligaNombre,
  inscripciones,
  equipos,
  pool,
  sustituciones,
}) => {
  const isMobileGrid = useMobileViewport(679);
  const { manifest } = useClubExperience();
  const clubNombre = manifest.displayName?.trim() || "Riviera Open";
  const mailBranding = useMemo(() => {
    return resolveLigaMailBranding({
      clubNombre,
      manifest,
    });
  }, [clubNombre, manifest]);
  const [area, setArea] = useState<Area>("destinatarios");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [paginaMovil, setPaginaMovil] = useState(0);
  const [snapshot, setSnapshot] = useState<NotificacionesLigaSnapshot | null>(
    null
  );
  const [contactos, setContactos] = useState<ContactoInscritoResuelto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [origenDraft, setOrigenDraft] = useState<string>(ORIGENES[0].id);
  const [fechaConsentimientoDraft, setFechaConsentimientoDraft] =
    useState<string>("");
  const [gestionId, setGestionId] = useState<string | null>(null);
  const [historialDetalleId, setHistorialDetalleId] = useState<string | null>(
    null
  );
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [envioSeleccion, setEnvioSeleccion] = useState<Record<string, boolean>>(
    {}
  );
  const [envioPaso, setEnvioPaso] = useState<"idle" | "preparado">("idle");
  const [enviandoLote, setEnviandoLote] = useState(false);
  const [faseEnvio, setFaseEnvio] = useState<
    "idle" | "preparando" | "encolado" | "procesando"
  >("idle");
  const [plantillaId, setPlantillaId] =
    useState<TipoComunicacionLiga>("bienvenida");
  const [asuntoDraft, setAsuntoDraft] = useState(
    () => plantillaParaRedactar(ligaId, "bienvenida").asunto
  );
  const [cuerpoDraft, setCuerpoDraft] = useState(
    () => plantillaParaRedactar(ligaId, "bienvenida").cuerpo
  );
  const [fechaDraft, setFechaDraft] = useState("");
  const [horarioDraft, setHorarioDraft] = useState("");
  const [loteEnvioId, setLoteEnvioId] = useState<string | null>(null);
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [borradorSeleccion, setBorradorSeleccion] = useState<
    Record<string, boolean>
  >({});
  const [busquedaSelector, setBusquedaSelector] = useState("");
  const [filtroSelector, setFiltroSelector] = useState<"todos" | "listos">(
    "todos"
  );

  useEffect(() => {
    let activo = true;
    setCargando(true);
    void Promise.all([
      cargarNotificacionesLiga(ligaId),
      cargarContactoInscritosLiga(ligaId),
    ]).then(([data, contactoRows]) => {
      if (!activo) return;
      setSnapshot(data);
      setContactos(contactoRows);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [ligaId]);

  useEffect(() => {
    if (!gestionId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGestionId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [gestionId]);

  useEffect(() => {
    setOrigenDraft(ORIGENES[0].id);
    setFechaConsentimientoDraft("");
  }, [gestionId]);

  const filas = useMemo(() => {
    const poolById = new Map(pool.map((jugador) => [jugador.id, jugador]));
    const contactoById = new Map(
      contactos.map((item) => [item.ligaJugadorId, item])
    );
    const ids = new Set<string>();
    for (const inscripcion of inscripciones) ids.add(inscripcion.jugador_id);
    for (const equipo of equipos) {
      ids.add(equipo.jugador1_id);
      ids.add(equipo.jugador2_id);
    }
    const salientes = new Set(
      sustituciones
        .map((item) => item.from_jugador_id)
        .filter((id) => !ids.has(id))
    );
    Array.from(salientes).forEach((id) => ids.delete(id));

    const preferencias = new Map(
      (snapshot?.preferencias ?? []).map((row) => [row.liga_jugador_id, row])
    );
    const cola = snapshot?.cola ?? [];
    const historial = snapshot?.historial ?? [];

    const base = Array.from(ids).map((jugadorId) => {
      const enPool = poolById.get(jugadorId);
      const inscripcion = inscripciones.find(
        (item) => item.jugador_id === jugadorId
      );
      const contacto = contactoById.get(jugadorId) ?? null;
      const emailLocal = enPool?.email ?? inscripcion?.jugador?.email ?? null;
      const email = correoEfectivoDestinatario({
        emailLocal,
        emailGlobal: contacto?.email ?? null,
      });
      return {
        jugadorId,
        enPool,
        email,
        identidadGlobalId:
          contacto?.identidadGlobalId ?? enPool?.riviera_jugador_id ?? null,
        rivieraJugadorId:
          contacto?.rivieraJugadorId ?? enPool?.riviera_jugador_id ?? null,
        registroAutorizadoAt:
          contacto?.origen === "global_source" || contacto?.origen === "global_local"
            ? contacto.registroAutorizadoAt
            : null,
      };
    });

    const perfilesPorCorreo = contarPerfilesPorCorreo(
      base.map((item) => ({
        email: item.email,
        identidadGlobalId: item.identidadGlobalId,
        jugadorId: item.jugadorId,
      }))
    );

    return base.map((item): FilaDestinatario => {
      const enPool = item.enPool;
      const inscripcion = inscripciones.find(
        (row) => row.jugador_id === item.jugadorId
      );
      const correo = normalizarCorreo(item.email);
      const preferencia = preferencias.get(item.jugadorId) ?? null;
      const envios = cola.filter(
        (row) => row.liga_jugador_id === item.jugadorId
      );
      const preferenciaPolitica = preferenciaParaPolitica(preferencia);
      const perfiles = correo ? perfilesPorCorreo.get(correo) ?? 1 : 0;
      const email = item.email;
      const reboteProveedor = historial.some(
        (row) =>
          row.liga_jugador_id === item.jugadorId &&
          (row.motivo === "rebote" || row.proveedor_estado === "rebote")
      );
      return {
        jugadorId: item.jugadorId,
        nombre: enPool?.nombre ?? inscripcion?.jugador?.nombre ?? "Jugador",
        rivieraId: enPool?.riviera_id ?? null,
        rivieraJugadorId: item.rivieraJugadorId,
        email,
        fotoUrl: enPool?.foto_url ?? null,
        categoria: categoriaVisible(enPool?.categoria),
        perfilesConMismoCorreo: perfiles,
        registroAutorizadoAt: item.registroAutorizadoAt,
        preferencia,
        visual: estadoVisual({
          email,
          perfilesConMismoCorreo: perfiles,
          preferencia: preferenciaPolitica,
          registroAutorizadoAt: item.registroAutorizadoAt,
          reboteProveedor,
          sigueInscrito: true,
          esSalienteDeSustitucion: false,
        }),
        yaEnviado: envios.some((row) => row.estado === "enviado"),
        yaEncolado: envios.some(
          (row) => row.estado === "pendiente" || row.estado === "procesando"
        ),
        historialJugador: historial.filter(
          (row) => row.liga_jugador_id === item.jugadorId
        ),
      };
    });
  }, [contactos, equipos, inscripciones, pool, snapshot, sustituciones]);

  const visibles = filas.filter((fila) => {
    const q = busqueda.trim().toLocaleLowerCase("es");
    if (q) {
      const nombre = fila.nombre.toLocaleLowerCase("es");
      const correo = (fila.email ?? "").toLocaleLowerCase("es");
      if (!nombre.includes(q) && !correo.includes(q)) return false;
    }
    const habilitado = preferenciaEfectiva(
      preferenciaParaPolitica(fila.preferencia)
    ).adminHabilitado;
    if (filtro === "habilitados") return habilitado;
    if (filtro === "pendientes") return esPendiente(fila);
    if (filtro === "excluidos") return !habilitado || fila.visual !== "habilitado";
    return true;
  });

  useEffect(() => {
    setPaginaMovil(0);
  }, [busqueda, filtro, isMobileGrid]);

  const paginasMovil = Math.max(
    1,
    Math.ceil(visibles.length / MOBILE_PAGE_SIZE)
  );
  const paginaMovilSegura = Math.min(paginaMovil, paginasMovil - 1);
  const mostrarPaginacionMovil =
    isMobileGrid && visibles.length > MOBILE_PAGE_SIZE;
  const visiblesPagina = mostrarPaginacionMovil
    ? visibles.slice(
        paginaMovilSegura * MOBILE_PAGE_SIZE,
        paginaMovilSegura * MOBILE_PAGE_SIZE + MOBILE_PAGE_SIZE
      )
    : visibles;

  const conteo = contarDestinatarios(
    filas.map(
      (fila) =>
        preferenciaEfectiva(preferenciaParaPolitica(fila.preferencia))
          .adminHabilitado
    )
  );
  const sinAutorizacion = filas.filter(
    (fila) =>
      fila.visual === "sin_autorizacion" ||
      fila.visual === "correo_por_verificar"
  ).length;
  const listos = filas.filter((fila) => fila.visual === "habilitado").length;
  const config: ConfigNotificacionLiga = snapshot?.config ?? {
    bienvenida_pausada: true,
    modo_prueba: true,
    modo_operacion: "manual",
    ...completarConfigAutomatica(null),
  };
  const automatica = completarConfigAutomatica(config);
  const puedeEscribir = Boolean(
    snapshot?.disponible && snapshot?.escriturasActivas
  );
  const preview =
    filas.find((fila) => fila.jugadorId === previewId) ?? filas[0] ?? null;
  const gestionFila =
    filas.find((fila) => fila.jugadorId === gestionId) ?? null;

  function decisionEncolar(fila: FilaDestinatario) {
    return puedeEncolarBienvenida({
      destinatario: {
        email: fila.email,
        perfilesConMismoCorreo: fila.perfilesConMismoCorreo,
        preferencia: preferenciaParaPolitica(fila.preferencia),
        sigueInscrito: true,
        esSalienteDeSustitucion: false,
      },
      // El compositor manual no depende de la pausa de automatismos.
      ligaPausada: false,
      yaEnviado: false,
      yaEncolado: false,
      origen: "accion_admin",
      tipo: plantillaId,
    });
  }

  const candidatosEnvio = useMemo(
    () => filas.filter((fila) => fila.visual === "habilitado"),
    [filas]
  );

  useEffect(() => {
    const inicial = plantillaParaRedactar(ligaId, "bienvenida");
    setPlantillaId("bienvenida");
    setAsuntoDraft(inicial.asunto);
    setCuerpoDraft(inicial.cuerpo);
    setEnvioSeleccion({});
    setEnvioPaso("idle");
    setLoteEnvioId(null);
    setSelectorAbierto(false);
  }, [ligaId]);

  const seleccionadosEnvio = candidatosEnvio.filter(
    (fila) => envioSeleccion[fila.jugadorId]
  );
  const incluidosEnvio = seleccionadosEnvio.filter(
    (fila) => decisionEncolar(fila).encolar
  );
  const excluidosEnvio: { fila: FilaDestinatario; motivo: string }[] =
    filas
      .filter(
        (fila) =>
          envioSeleccion[fila.jugadorId] && !decisionEncolar(fila).encolar
      )
      .map((fila) => ({
        fila,
        motivo: motivoVisible(decisionEncolar(fila).motivo ?? fila.visual),
      }));

  function confirmar(texto: string) {
    setAviso(texto);
  }

  function reemplazarPreferencia(row: PreferenciaNotificacionRow) {
    setSnapshot((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        preferencias: [
          ...prev.preferencias.filter(
            (item) => item.liga_jugador_id !== row.liga_jugador_id
          ),
          row,
        ],
      };
    });
  }

  async function guardarFila(
    fila: FilaDestinatario,
    patch: Partial<PreferenciaNotificacionRow>,
    accion: () => Promise<{ ok: boolean; motivo: string | null }>
  ) {
    if (!puedeEscribir) {
      confirmar(motivoVisible("esquema_pendiente"));
      return;
    }
    setGuardandoId(fila.jugadorId);
    const resultado = await accion();
    setGuardandoId(null);
    if (!resultado.ok) {
      confirmar(motivoVisible(resultado.motivo));
      return;
    }
    const base = fila.preferencia;
    reemplazarPreferencia({
      liga_jugador_id: fila.jugadorId,
      riviera_jugador_id: fila.rivieraJugadorId,
      admin_habilitado: base?.admin_habilitado ?? false,
      consentimiento_estado: base?.consentimiento_estado ?? "sin_autorizacion",
      consentimiento_origen: base?.consentimiento_origen ?? null,
      consentimiento_registrado_at: base?.consentimiento_registrado_at ?? null,
      correo_verificado: base?.correo_verificado ?? false,
      correo_verificacion_origen: base?.correo_verificacion_origen ?? null,
      correo_verificado_email: base?.correo_verificado_email ?? null,
      ...patch,
    });
    confirmar("Cambios guardados");
  }

  async function cambiarHabilitacion(fila: FilaDestinatario, habilitado: boolean) {
    await guardarFila(fila, { admin_habilitado: habilitado }, () =>
      establecerHabilitacionJugador({
        ligaId,
        jugadorId: fila.jugadorId,
        rivieraJugadorId: fila.rivieraJugadorId,
        habilitado,
      })
    );
  }

  async function confirmarConsentimiento(fila: FilaDestinatario) {
    const estado = preferenciaEfectiva(
      preferenciaParaPolitica(fila.preferencia)
    ).consentimientoEstado;
    if (!puedeDocumentarAutorizacionVerbal(estado)) {
      confirmar(
        motivoVisible(estado === "revocado" ? "revocado" : "ya_autorizado")
      );
      return;
    }
    if (!fechaConsentimientoDraft.trim()) {
      confirmar(motivoVisible("fecha_invalida"));
      return;
    }
    const parsed = Date.parse(`${fechaConsentimientoDraft}T12:00:00`);
    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    if (Number.isNaN(parsed) || parsed > hoy.getTime()) {
      confirmar(motivoVisible("fecha_invalida"));
      return;
    }
    const registradoAt = new Date(parsed).toISOString();
    const evidencia = registrarConsentimiento({
      origen: origenDraft,
      registradoAt,
      actorId: "organizador",
    });
    if ("error" in evidencia) {
      confirmar(motivoVisible("consentimiento_sin_evidencia"));
      return;
    }
    await guardarFila(
      fila,
      {
        consentimiento_estado: "autorizado",
        consentimiento_origen: evidencia.consentimientoOrigen,
        consentimiento_registrado_at: evidencia.consentimientoRegistradoAt,
      },
      () =>
        registrarConsentimientoJugador({
          ligaId,
          jugadorId: fila.jugadorId,
          rivieraJugadorId: fila.rivieraJugadorId,
          origen: evidencia.consentimientoOrigen,
          registradoAt: evidencia.consentimientoRegistradoAt,
        })
    );
  }

  function abrirSelectorDestinatarios() {
    setBorradorSeleccion({ ...envioSeleccion });
    setBusquedaSelector("");
    setFiltroSelector("todos");
    setSelectorAbierto(true);
  }

  function agregarDestinatarios() {
    const next: Record<string, boolean> = {};
    for (const fila of filas) {
      if (fila.visual === "habilitado" && borradorSeleccion[fila.jugadorId]) {
        next[fila.jugadorId] = true;
      }
    }
    setEnvioSeleccion(next);
    setSelectorAbierto(false);
    const primero = filas.find((fila) => next[fila.jugadorId]);
    if (primero) setPreviewId(primero.jugadorId);
  }

  function aplicarPlantilla(id: TipoComunicacionLiga) {
    const plantilla = plantillaParaRedactar(ligaId, id);
    setPlantillaId(plantilla.id);
    setAsuntoDraft(plantilla.asunto);
    setCuerpoDraft(plantilla.cuerpo);
    setEnvioPaso("idle");
  }

  function guardarPlantillaActual() {
    const ok = guardarPlantillaLiga(
      ligaId,
      plantillaId,
      asuntoDraft,
      cuerpoDraft
    );
    confirmar(
      ok
        ? "Plantilla guardada. La próxima vez se abre con este texto."
        : "No se pudo guardar la plantilla en este navegador."
    );
  }

  async function refrescarHistorial() {
    const fresco = await cargarNotificacionesLiga(ligaId);
    if (fresco.disponible) setSnapshot(fresco);
    return fresco;
  }

  async function confirmarEnvioManual() {
    if (!puedeEscribir || enviandoLote) return;
    const lote = incluidosEnvio;
    if (lote.length === 0) {
      confirmar("No hay jugadores listos para este envío.");
      return;
    }
    if (lote.length > MAX_DESTINATARIOS_LOTE) {
      confirmar(`El máximo por envío es ${MAX_DESTINATARIOS_LOTE} jugadores.`);
      return;
    }
    if (!asuntoDraft.trim() || !cuerpoDraft.trim()) {
      confirmar(motivoVisible("mensaje_incompleto"));
      return;
    }
    const loteId =
      loteEnvioId ??
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `lote-${Date.now()}`);
    setLoteEnvioId(loteId);
    setEnviandoLote(true);
    setFaseEnvio("preparando");
    let preparados = 0;
    let fallidos = 0;
    let yaEnviados = 0;
    let ultimoMotivo: string | null = null;
    const colaNueva: ColaNotificacionRow[] = [];
    const jugadoresLote: { jugadorId: string; asunto: string; cuerpo: string }[] =
      [];
    let proceso: Awaited<ReturnType<typeof solicitarProcesamientoLote>> | null =
      null;
    try {
      for (const fila of lote) {
        const canonicalLigaUrl =
          typeof window !== "undefined"
            ? `${window.location.origin}/public/liga/${ligaId}`
            : `/public/liga/${ligaId}`;
        const varsComun = {
          nombre: fila.nombre,
          liga: ligaNombre,
          club: clubNombre,
          fecha: fechaDraft.trim() || undefined,
          horario: horarioDraft.trim() || undefined,
        };
        const asuntoResuelto = renderComunicacionEmail({
          clubNombre,
          ligaNombre,
          jugadorNombre: fila.nombre,
          asunto: asuntoDraft,
          cuerpo: cuerpoDraft,
          vistaPrevia: false,
          branding: mailBranding,
          tipo: plantillaId,
          fecha: fechaDraft,
          horario: horarioDraft,
          ligaUrl: canonicalLigaUrl,
        }).subject;
        const cuerpoResuelto = resolverVariablesComunicacion(cuerpoDraft, varsComun);
        const resultado = await solicitarComunicacionManual({
          ligaId,
          jugadorId: fila.jugadorId,
          tipo: plantillaId,
          asunto: asuntoResuelto,
          cuerpo: cuerpoResuelto,
          loteId,
        });
        const yaEstaba =
          resultado.ok && resultado.motivo === "ya_encolado";
        if (resultado.ok && resultado.motivo === "ya_enviado") {
          yaEnviados += 1;
        } else if (resultado.ok && (resultado.encolado || yaEstaba)) {
          preparados += 1;
          jugadoresLote.push({
            jugadorId: fila.jugadorId,
            asunto: asuntoResuelto,
            cuerpo: cuerpoResuelto,
          });
          if (resultado.encolado) {
            colaNueva.push({
              liga_jugador_id: fila.jugadorId,
              estado: "pendiente",
              attempts: 0,
              motivo: null,
              lote_id: loteId,
            });
          }
        } else {
          fallidos += 1;
          ultimoMotivo = resultado.motivo;
        }
      }
      if (colaNueva.length > 0) {
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                cola: [...colaNueva, ...prev.cola],
              }
            : prev
        );
      }
      if (preparados > 0) {
        setFaseEnvio("encolado");
        setFaseEnvio("procesando");
        proceso = await solicitarProcesamientoLote({
          ligaId,
          loteId,
          tipo: plantillaId,
          jugadores: jugadoresLote,
        });
      }
      await refrescarHistorial();
    } catch {
      ultimoMotivo = "procesador_no_disponible";
    } finally {
      setEnviandoLote(false);
      setFaseEnvio("idle");
    }
    if (preparados === 0 && yaEnviados > 0 && fallidos === 0) {
      setLoteEnvioId(null);
      setEnvioPaso("idle");
      confirmar(
        "Ese envío ya fue aceptado. Confírmalo otra vez para mandarlo de nuevo."
      );
      return;
    }
    if (preparados > 0 && proceso?.ok === false) {
      if (proceso.motivo !== "procesador_no_disponible") setLoteEnvioId(null);
      setArea("historial");
      confirmar(mensajeFalloProceso(proceso.motivo));
      return;
    }
    if (preparados > 0 && fallidos === 0) {
      setLoteEnvioId(null);
      setEnvioPaso("idle");
      setEnvioSeleccion({});
      confirmar(mensajeResultadoEnvio(preparados, proceso));
      setArea("historial");
      return;
    }
    confirmar(
      fallidos > 0 && preparados > 0
        ? `Pendiente de procesamiento: ${preparados}. ${fallidos} no se encolaron: ${motivoVisible(ultimoMotivo)}.`
        : `${motivoVisible(ultimoMotivo ?? "no_disponible")}. Puedes corregir y volver a confirmar.`
    );
  }

  async function descartarNoEnviados(objetivo?: {
    queueId?: string;
    logId?: string;
  }) {
    if (!puedeEscribir || enviandoLote) return;
    const uno = Boolean(objetivo?.queueId || objetivo?.logId);
    const filaCola = objetivo?.queueId
      ? (snapshot?.cola ?? []).find((item) => item.id === objetivo.queueId)
      : null;
    const filaLog = objetivo?.logId
      ? (snapshot?.historial ?? []).find((item) => item.id === objetivo.logId)
      : null;
    const enviado = filaCola
      ? !esCorreoNoEnviado(filaCola.estado, null)
      : filaLog
        ? !esCorreoNoEnviado(filaLog.estado, filaLog.proveedor_estado)
        : false;
    const seguro = window.confirm(
      uno
        ? enviado
          ? "¿Quitar este correo aceptado del historial? No se reenvía."
          : "¿Quitar este correo del historial? No se envió y no se entregará."
        : "¿Quitar del historial los correos que no se enviaron? Los aceptados o entregados se quedan."
    );
    if (!seguro) return;
    setEnviandoLote(true);
    const resultado = await descartarCorreosNoEnviados({
      ligaId,
      queueId: objetivo?.queueId,
      logId: objetivo?.logId,
    });
    const fresco = await cargarNotificacionesLiga(ligaId);
    if (fresco.disponible) setSnapshot(fresco);
    setEnviandoLote(false);
    if (!resultado.ok) {
      confirmar(motivoVisible(resultado.motivo));
      return;
    }
    confirmar(
      resultado.descartados > 0
        ? enviado
          ? "Se quitó del historial. No se reenvió."
          : `Se quitaron ${resultado.descartados} correo${
              resultado.descartados === 1 ? "" : "s"
            } que no se enviaron.`
        : "No había correos sin enviar para quitar."
    );
  }

  async function reintentarLote(loteId: string) {
    if (!puedeEscribir || enviandoLote) return;
    setEnviandoLote(true);
    setFaseEnvio("procesando");
    let proceso: Awaited<ReturnType<typeof solicitarProcesamientoLote>> | null =
      null;
    try {
      proceso = await solicitarProcesamientoLote({
        ligaId,
        loteId,
        reintentar: true,
      });
      await refrescarHistorial();
    } catch {
      proceso = null;
    } finally {
      setEnviandoLote(false);
      setFaseEnvio("idle");
    }
    confirmar(mensajeResultadoEnvio(1, proceso));
  }

  async function cambiarConfig(next: ConfigNotificacionLiga) {
    if (!puedeEscribir) {
      confirmar(motivoVisible("esquema_pendiente"));
      return;
    }
    const previa = completarConfigAutomatica(config);
    const siguiente = completarConfigAutomatica(next);
    const encender =
      (!previa.resultados_auto && siguiente.resultados_auto) ||
      (!previa.recordatorio_auto && siguiente.recordatorio_auto) ||
      (!previa.bienvenida_auto && siguiente.bienvenida_auto);
    if (
      encender &&
      !window.confirm(
        "Vas a activar envíos automáticos reales para esta liga. Salen desde el servidor cuando corresponda, no desde este navegador. ¿Continuar?"
      )
    ) {
      return;
    }
    setGuardandoId("config");
    const resultado = await guardarConfigLiga(ligaId, { ...next, ...siguiente });
    setGuardandoId(null);
    if (!resultado.ok) {
      confirmar(motivoVisible(resultado.motivo));
      return;
    }
    setSnapshot((prev) =>
      prev ? { ...prev, config: { ...next, ...siguiente } } : prev
    );
    confirmar("Cambios guardados");
  }

  function switchNotificaciones(fila: FilaDestinatario) {
    const preferencia = preferenciaEfectiva(
      preferenciaParaPolitica(fila.preferencia)
    );
    const ocupado = guardandoId === fila.jugadorId;
    return (
      <label className="liga-notificaciones__toggle">
        <input
          type="checkbox"
          checked={preferencia.adminHabilitado}
          disabled={ocupado || !puedeEscribir}
          aria-label={`Notificaciones para ${fila.nombre}`}
          onChange={(event) =>
            void cambiarHabilitacion(fila, event.target.checked)
          }
        />
        <span className="liga-notificaciones__toggle-ui" aria-hidden />
        <span className="liga-notificaciones__toggle-label">
          {preferencia.adminHabilitado ? "Activadas" : "Desactivadas"}
        </span>
      </label>
    );
  }

  function panelGestion(fila: FilaDestinatario) {
    const preferencia = preferenciaEfectiva(
      preferenciaParaPolitica(fila.preferencia)
    );
    const ocupado = guardandoId === fila.jugadorId;
    const origenDocumentado =
      preferencia.consentimientoOrigen &&
      (ORIGEN_LABEL[preferencia.consentimientoOrigen] ??
        preferencia.consentimientoOrigen);
    const fechaDocumentada = preferencia.consentimientoRegistradoAt
      ? new Date(preferencia.consentimientoRegistradoAt).toLocaleDateString(
          "es-MX"
        )
      : null;
    const contactoLabel =
      fila.visual === "sin_correo"
        ? "Sin correo"
        : fila.visual === "correo_invalido"
          ? "Correo inválido"
          : fila.visual === "correo_ambiguo"
            ? "Correo ambiguo entre identidades"
            : fila.visual === "rebote"
              ? "Rebote reportado por el proveedor"
              : fila.email?.trim()
                ? "Disponible"
                : "Sin correo";

    return (
      <div
        className="liga-notificaciones__drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Gestionar comunicaciones de ${fila.nombre}`}
      >
        <div className="liga-notificaciones__drawer-head">
          <div className="liga-notificaciones__identidad">
            <FotoRetrato fotoUrl={fila.fotoUrl} nombre={fila.nombre} size="md" />
            <div className="liga-notificaciones__identidad-copy">
              <p className="liga-notificaciones__nombre">{fila.nombre}</p>
              {fila.rivieraId ? (
                <p className="liga-notificaciones__riviera-id">{fila.rivieraId}</p>
              ) : null}
              <p className="liga-notificaciones__correo">
                {fila.email?.trim() || "Sin correo"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="liga-notificaciones__ghost"
            aria-label="Cerrar panel"
            onClick={() => setGestionId(null)}
          >
            Cerrar
          </button>
        </div>

        <div className="liga-notificaciones__drawer-body">
          <section className="liga-notificaciones__drawer-section">
            <h3 className="liga-notificaciones__drawer-section-title">
              Contacto
            </h3>
            <p className="liga-notificaciones__drawer-status">{contactoLabel}</p>
            <p className="liga-notificaciones__hint">
              Correo canónico de la ficha Riviera cuando la identidad lo permite.
              Tener correo no equivale a autorización.
            </p>
          </section>

          <section className="liga-notificaciones__drawer-section">
            <h3 className="liga-notificaciones__drawer-section-title">
              Activar / Desactivar
            </h3>
            {switchNotificaciones(fila)}
            <p className="liga-notificaciones__drawer-status--muted liga-notificaciones__drawer-status">
              {ESTADO_PRINCIPAL_LABEL[fila.visual]}
            </p>
          </section>

          <section className="liga-notificaciones__drawer-section">
            <h3 className="liga-notificaciones__drawer-section-title">
              Autorización de comunicaciones
            </h3>
            {preferencia.consentimientoEstado === "autorizado" ? (
              <>
                <p className="liga-notificaciones__drawer-status">
                  Autorización documentada
                  {origenDocumentado ? ` · ${origenDocumentado}` : ""}
                  {fechaDocumentada ? ` · ${fechaDocumentada}` : ""}
                </p>
                <p className="liga-notificaciones__hint">
                  Alcance: avisos deportivos de esta liga. No incluye
                  promociones. Quedó a nombre de quien la guardó. El interruptor
                  no cambió y no se envió ningún correo.
                </p>
                <button
                  type="button"
                  className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
                  disabled={ocupado || !puedeEscribir}
                  onClick={() =>
                    void guardarFila(
                      fila,
                      { consentimiento_estado: "revocado" },
                      () =>
                        revocarConsentimientoJugador({
                          ligaId,
                          jugadorId: fila.jugadorId,
                          rivieraJugadorId: fila.rivieraJugadorId,
                        })
                    )
                  }
                >
                  Revocar autorización
                </button>
              </>
            ) : preferencia.consentimientoEstado === "revocado" ? (
              <p className="liga-notificaciones__hint">
                Autorización revocada. No se documenta otra encima.
              </p>
            ) : (
              <div className="liga-notificaciones__consent-box">
                <p className="liga-notificaciones__hint">
                  Documenta una autorización ya otorgada para avisos deportivos
                  de esta liga. Queda a tu nombre. No cambia el interruptor y
                  no envía correo.
                </p>
                <label className="liga-notificaciones__field">
                  <span>Medio</span>
                  <select
                    className="liga-notificaciones__select"
                    value={origenDraft}
                    onChange={(event) => setOrigenDraft(event.target.value)}
                    aria-label={`Medio de la autorización de ${fila.nombre}`}
                    disabled={!puedeEscribir}
                  >
                    {ORIGENES.map((origen) => (
                      <option key={origen.id} value={origen.id}>
                        {origen.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="liga-notificaciones__field">
                  <span>Fecha real de la autorización</span>
                  <input
                    type="date"
                    className="liga-notificaciones__select"
                    value={fechaConsentimientoDraft}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(event) =>
                      setFechaConsentimientoDraft(event.target.value)
                    }
                    disabled={!puedeEscribir}
                    aria-label={`Fecha de la autorización de ${fila.nombre}`}
                  />
                </label>
                <button
                  type="button"
                  className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
                  disabled={ocupado || !puedeEscribir}
                  onClick={() => void confirmarConsentimiento(fila)}
                >
                  Guardar autorización
                </button>
              </div>
            )}
          </section>

          <section className="liga-notificaciones__drawer-section">
            <h3 className="liga-notificaciones__drawer-section-title">
              Historial de este jugador
            </h3>
            {fila.historialJugador.length === 0 ? (
              <p className="liga-notificaciones__hint">
                Aún no hay comunicaciones registradas.
              </p>
            ) : (
              <ul className="liga-notificaciones__envio-list">
                {fila.historialJugador.slice(0, 8).map((item) => (
                  <li key={item.id}>
                    <span>
                      {item.tipo} · {item.estado}
                    </span>
                    <span>
                      {new Date(item.created_at).toLocaleString("es-MX")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="liga-notificaciones__drawer-actions">
            {!puedeEscribir ? (
              <p className="liga-notificaciones__hint">
                El guardado permanece desactivado mientras el backend está pendiente.
              </p>
            ) : (
              <p className="liga-notificaciones__hint">
                Activar o desactivar guarda de inmediato. No envía correos.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  function tarjetaDestinatario(fila: FilaDestinatario) {
    const elegible = fila.visual === "habilitado";
    return (
      <article className="liga-notificaciones__card" role="listitem">
        <div className="liga-notificaciones__card-top">
          <FotoRetrato
            fotoUrl={fila.fotoUrl}
            nombre={fila.nombre}
            size="card"
          />
          <div className="liga-notificaciones__identidad-copy">
            <p className="liga-notificaciones__nombre">{fila.nombre}</p>
            {fila.rivieraId ? (
              <p className="liga-notificaciones__riviera-id">{fila.rivieraId}</p>
            ) : null}
            <p className="liga-notificaciones__correo">
              {fila.email?.trim() || "Sin correo"}
            </p>
          </div>
        </div>
        <div className="liga-notificaciones__card-mid">
          <span
            className={`liga-notificaciones__badge liga-notificaciones__badge--${estadoTone(
              fila.visual
            )}`}
          >
            {ESTADO_GRID_LABEL[fila.visual]}
          </span>
          {elegible ? null : (
            <p className="liga-notificaciones__hint">
              {motivoVisible(decisionEncolar(fila).motivo ?? fila.visual)}
            </p>
          )}
        </div>
        <div className="liga-notificaciones__card-foot">
          {switchNotificaciones(fila)}
          <button
            type="button"
            className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
            onClick={() => setGestionId(fila.jugadorId)}
          >
            Gestionar
          </button>
        </div>
      </article>
    );
  }

  const previewHtml = preview
    ? renderComunicacionEmail({
        clubNombre,
        ligaNombre,
        jugadorNombre: preview.nombre,
        asunto: asuntoDraft,
        cuerpo: cuerpoDraft,
        vistaPrevia: true,
        branding: mailBranding,
        tipo: plantillaId,
        fecha: fechaDraft,
        horario: horarioDraft,
        ligaUrl:
          typeof window !== "undefined"
            ? `${window.location.origin}/public/liga/${ligaId}`
            : `/public/liga/${ligaId}`,
      }).html
    : "";

  const modoLabel =
    config.modo_operacion === "automatico" ? "MODO AUTOMÁTICO" : "MODO MANUAL";

  return (
    <section
      className="liga-notificaciones"
      aria-label="Notificaciones de la liga"
    >
      {!cargando && snapshot && !snapshot.disponible ? (
        <div className="liga-notificaciones__banner" role="status">
          Vista de revisión. El guardado y los envíos están desactivados.
        </div>
      ) : null}
      {!cargando &&
      snapshot?.disponible &&
      !snapshot.escriturasActivas ? (
        <div className="liga-notificaciones__banner" role="status">
          Vista de revisión. El guardado y los envíos están desactivados.
        </div>
      ) : null}
      <header className="liga-notificaciones__header">
        <div className="liga-notificaciones__header-copy">
          <h2 className="liga-notificaciones__title">
            Centro de comunicaciones
          </h2>
          <p className="liga-notificaciones__subtitle">
            Selecciona destinatarios, documenta autorizaciones y redacta avisos
            deportivos. Sin verificación por enlace ni envíos automáticos.
          </p>
        </div>
        <div className="liga-notificaciones__header-aside">
          <span className="liga-notificaciones__mode-pill">{modoLabel}</span>
          <button
            type="button"
            className="liga-notificaciones__ghost"
            onClick={() => setArea("configuracion")}
          >
            Configuración
          </button>
        </div>
      </header>

      <div className="liga-notificaciones__metrics" aria-label="Resumen">
        <div className="liga-notificaciones__metric">
          <span className="liga-notificaciones__metric-value">{filas.length}</span>
          <span className="liga-notificaciones__metric-label">Inscritos</span>
        </div>
        <div className="liga-notificaciones__metric">
          <span className="liga-notificaciones__metric-value">
            {conteo.seleccionados}
          </span>
          <span className="liga-notificaciones__metric-label">Habilitados</span>
        </div>
        <div className="liga-notificaciones__metric">
          <span className="liga-notificaciones__metric-value">{listos}</span>
          <span className="liga-notificaciones__metric-label">
            Listos para enviar
          </span>
        </div>
        <div className="liga-notificaciones__metric">
          <span className="liga-notificaciones__metric-value">
            {sinAutorizacion}
          </span>
          <span className="liga-notificaciones__metric-label">
            Sin autorización
          </span>
        </div>
      </div>

      {aviso ? (
        <p className="liga-notificaciones__toast" role="status">
          {aviso}
        </p>
      ) : null}

      <nav
        className="liga-notificaciones__tabs"
        role="tablist"
        aria-label="Áreas de notificaciones"
      >
        {AREAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="liga-notificaciones__tab"
            aria-selected={area === item.id}
            onClick={() => setArea(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {area === "destinatarios" ? (
        <div className="liga-notificaciones__panel">
          <div className="liga-notificaciones__toolbar">
            <label className="liga-notificaciones__search">
              <span className="liga-notificaciones__search-icon" aria-hidden>
                ⌕
              </span>
              <input
                type="search"
                value={busqueda}
                placeholder="Buscar jugador por nombre o correo"
                aria-label="Buscar jugador por nombre o correo"
                onChange={(event) => setBusqueda(event.target.value)}
              />
            </label>
            <div className="liga-notificaciones__filters" role="group" aria-label="Filtros">
              {FILTROS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="liga-notificaciones__chip"
                  aria-pressed={filtro === item.id}
                  onClick={() => setFiltro(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <p className="liga-notificaciones__result-count">
            {visibles.length} de {filas.length} jugadores
            <span className="liga-notificaciones__sr-only">
              {conteo.seleccionados} seleccionados, {conteo.excluidos} excluidos
            </span>
          </p>
          {visibles.length === 0 ? (
            <div className="liga-notificaciones__empty">
              <p className="liga-notificaciones__empty-title">
                No hay jugadores en este filtro
              </p>
              <p className="liga-notificaciones__empty-copy">
                Prueba otro filtro o limpia la búsqueda.
              </p>
            </div>
          ) : (
            <>
              <div
                className="liga-notificaciones__grid"
                role="list"
                aria-label="Destinatarios"
              >
                {visiblesPagina.map((fila) => (
                  <React.Fragment key={fila.jugadorId}>
                    {tarjetaDestinatario(fila)}
                  </React.Fragment>
                ))}
              </div>
              {mostrarPaginacionMovil ? (
                <div
                  className="liga-notificaciones__pager"
                  role="navigation"
                  aria-label="Páginas de destinatarios"
                >
                  <button
                    type="button"
                    className="liga-notificaciones__ghost"
                    disabled={paginaMovilSegura <= 0}
                    onClick={() =>
                      setPaginaMovil((prev) => Math.max(0, prev - 1))
                    }
                  >
                    Anterior
                  </button>
                  <span className="liga-notificaciones__pager-label">
                    {paginaMovilSegura + 1} / {paginasMovil}
                  </span>
                  <button
                    type="button"
                    className="liga-notificaciones__ghost"
                    disabled={paginaMovilSegura >= paginasMovil - 1}
                    onClick={() =>
                      setPaginaMovil((prev) =>
                        Math.min(paginasMovil - 1, prev + 1)
                      )
                    }
                  >
                    Siguiente
                  </button>
                </div>
              ) : null}
            </>
          )}

          {gestionFila && typeof document !== "undefined"
            ? createPortal(
                <div className="liga-notificaciones__overlay">
                  <button
                    type="button"
                    className="liga-notificaciones__overlay-scrim"
                    aria-label="Cerrar panel"
                    onClick={() => setGestionId(null)}
                  />
                  {panelGestion(gestionFila)}
                </div>,
                document.body
              )
            : null}
        </div>
      ) : null}

      {area === "bienvenida" ? (
        <div className="liga-notificaciones__preview-layout">
          <aside className="liga-notificaciones__preview-side">
            <h3 className="liga-notificaciones__section-title">
              Redactar correo
            </h3>
            <p className="liga-notificaciones__hint">
              Modo manual: elige plantilla, edita el mensaje, selecciona
              destinatarios listos y confirma. Activar un interruptor no envía.
            </p>

            <label className="liga-notificaciones__field" htmlFor="plantilla-correo">
              <span>Plantilla</span>
              <select
                id="plantilla-correo"
                className="liga-notificaciones__select"
                value={plantillaId}
                onChange={(event) =>
                  aplicarPlantilla(event.target.value as TipoComunicacionLiga)
                }
              >
                {PLANTILLAS_COMUNICACION.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="liga-notificaciones__para">
              <div className="liga-notificaciones__para-head">
                <span>Para</span>
                <button
                  type="button"
                  className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
                  onClick={abrirSelectorDestinatarios}
                >
                  + SELECCIONAR JUGADORES
                </button>
              </div>
              {incluidosEnvio.length === 0 ? (
                <p className="liga-notificaciones__hint">
                  Selecciona al menos un jugador listo para enviar.
                  {listos === 0
                    ? ` Ahora hay 0 listos: ${sinAutorizacion} sin autorización documentada, ${filas.filter((fila) => fila.visual === "deshabilitado").length} con el interruptor apagado, ${filas.filter((fila) => fila.visual === "sin_correo" || fila.visual === "correo_invalido").length} sin correo válido.`
                    : ""}
                </p>
              ) : (
                <>
                  <p className="liga-notificaciones__drawer-status">
                    Destinatarios seleccionados — {incluidosEnvio.length}
                  </p>
                  <ul className="liga-notificaciones__chips">
                    {incluidosEnvio.map((fila) => (
                      <li key={fila.jugadorId}>
                        <FotoRetrato
                          fotoUrl={fila.fotoUrl}
                          nombre={fila.nombre}
                          size="md"
                        />
                        <span>{fila.nombre}</span>
                        <button
                          type="button"
                          className="liga-notificaciones__ghost"
                          onClick={() =>
                            setEnvioSeleccion((prev) => ({
                              ...prev,
                              [fila.jugadorId]: false,
                            }))
                          }
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <label className="liga-notificaciones__field" htmlFor="asunto-correo">
              <span>Asunto</span>
              <input
                id="asunto-correo"
                className="liga-notificaciones__select"
                value={asuntoDraft}
                maxLength={180}
                onChange={(event) => setAsuntoDraft(event.target.value)}
              />
            </label>

            {plantillaId === "jornada" ? (
              <div
                className="liga-notificaciones__jornada-fields"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                  margin: "4px 0",
                }}
              >
                <label className="liga-notificaciones__field" htmlFor="fecha-jornada">
                  <span>Fecha de la jornada</span>
                  <input
                    id="fecha-jornada"
                    className="liga-notificaciones__select"
                    placeholder="ej. Sábado 15 de Noviembre"
                    value={fechaDraft}
                    maxLength={100}
                    onChange={(event) => setFechaDraft(event.target.value)}
                  />
                </label>
                <label className="liga-notificaciones__field" htmlFor="horario-jornada">
                  <span>Horario de la jornada</span>
                  <input
                    id="horario-jornada"
                    className="liga-notificaciones__select"
                    placeholder="ej. 10:00 AM"
                    value={horarioDraft}
                    maxLength={100}
                    onChange={(event) => setHorarioDraft(event.target.value)}
                  />
                </label>
              </div>
            ) : null}

            <label className="liga-notificaciones__field" htmlFor="cuerpo-correo">
              <span>Mensaje</span>
              <textarea
                id="cuerpo-correo"
                className="liga-notificaciones__select liga-notificaciones__textarea"
                rows={10}
                value={cuerpoDraft}
                maxLength={8000}
                onChange={(event) => setCuerpoDraft(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
              disabled={!asuntoDraft.trim() || !cuerpoDraft.trim()}
              onClick={guardarPlantillaActual}
            >
              GUARDAR PLANTILLA
            </button>
            <p className="liga-notificaciones__hint">
              Variables: {"{{nombre}}"}, {"{{liga}}"}, {"{{club}}"}, {"{{fecha}}"}, {"{{horario}}"}. Se escapan
              al renderizar. Sin HTML libre.
            </p>

            <label className="liga-notificaciones__field" htmlFor="preview-destinatario">
              <span>Vista previa con</span>
              <select
                id="preview-destinatario"
                className="liga-notificaciones__select"
                value={preview?.jugadorId ?? ""}
                onChange={(event) => setPreviewId(event.target.value)}
              >
                {filas.map((fila) => (
                  <option key={fila.jugadorId} value={fila.jugadorId}>
                    {fila.nombre}
                  </option>
                ))}
              </select>
            </label>

            <div className="liga-notificaciones__envio-panel">
              {envioPaso === "preparado" ? (
                <>
                  <p className="liga-notificaciones__drawer-status">
                    VAS A ENVIAR ESTE CORREO A {incluidosEnvio.length} JUGADOR
                    {incluidosEnvio.length === 1 ? "" : "ES"}
                  </p>
                  <ul className="liga-notificaciones__envio-list">
                    {incluidosEnvio.map((fila) => (
                      <li key={`in-${fila.jugadorId}`}>
                        <span>{fila.nombre}</span>
                        <span>{fila.email?.trim() || "Sin correo"}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="liga-notificaciones__drawer-status">
                    Asunto: {asuntoDraft}
                  </p>
                  <p className="liga-notificaciones__hint">{cuerpoDraft}</p>
                  {excluidosEnvio.length > 0 ? (
                    <ul className="liga-notificaciones__envio-list">
                      {excluidosEnvio.map(({ fila, motivo }) => (
                        <li key={`ex-${fila.jugadorId}`}>
                          <span>{fila.nombre}</span>
                          <span>{motivo}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="liga-notificaciones__hint">
                    Confirmar pide procesar solo este lote. Si el envío real está
                    apagado, queda pendiente y no se muestra como enviado.
                  </p>
                  <button
                    type="button"
                    className="liga-notificaciones__btn liga-notificaciones__btn--primary"
                    disabled={
                      !puedeEscribir ||
                      enviandoLote ||
                      incluidosEnvio.length === 0
                    }
                    onClick={() => void confirmarEnvioManual()}
                  >
                    {enviandoLote
                      ? faseEnvio === "preparando"
                        ? "Preparando envío…"
                        : faseEnvio === "encolado"
                          ? "Encolado…"
                          : "Procesando…"
                      : `CONFIRMAR Y ENVIAR A ${incluidosEnvio.length} JUGADOR${
                          incluidosEnvio.length === 1 ? "" : "ES"
                        }`}
                  </button>
                  <button
                    type="button"
                    className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
                    disabled={enviandoLote}
                    onClick={() => setEnvioPaso("idle")}
                  >
                    VOLVER A EDITAR
                  </button>
                </>
              ) : (
                <div className="liga-notificaciones__action-bar">
                  <button
                    type="button"
                    className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
                    onClick={abrirSelectorDestinatarios}
                  >
                    SELECCIONAR DESTINATARIOS
                  </button>
                  <button
                    type="button"
                    className="liga-notificaciones__btn liga-notificaciones__btn--primary"
                    disabled={
                      !puedeEscribir ||
                      enviandoLote ||
                      incluidosEnvio.length === 0 ||
                      !asuntoDraft.trim() ||
                      !cuerpoDraft.trim()
                    }
                    onClick={() => setEnvioPaso("preparado")}
                  >
                    REVISAR CORREO
                  </button>
                  {incluidosEnvio.length === 0 ? (
                    <p className="liga-notificaciones__hint">
                      Selecciona al menos un jugador listo para enviar.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </aside>
          <div className="liga-notificaciones__preview-frame-wrap">
            {preview ? (
              <iframe
                className="liga-notificaciones__frame"
                title="Vista previa del correo"
                sandbox=""
                srcDoc={previewHtml}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {area === "historial" ? (
        <div className="liga-notificaciones__historial">
          {snapshot?.errorCarga ? (
            <p className="liga-notificaciones__hint">
              {motivoVisible(snapshot.errorCarga)}. El historial no se pudo
              actualizar por completo.
              <button
                type="button"
                className="liga-notificaciones__ghost"
                onClick={() => void refrescarHistorial()}
              >
                Actualizar
              </button>
            </p>
          ) : null}
          {(snapshot?.cola.length ?? 0) === 0 &&
          (snapshot?.historial.length ?? 0) === 0 ? (
            <div className="liga-notificaciones__empty">
              <p className="liga-notificaciones__empty-title">
                Aún no hay correos enviados.
              </p>
              <p className="liga-notificaciones__empty-copy">
                Cuando prepares una bienvenida aparecerá aquí el seguimiento.
                Prepararla no entrega un correo.
              </p>
            </div>
          ) : (
            <div className="liga-notificaciones__history-list">
              <div className="liga-notificaciones__history-toolbar">
                <button
                  type="button"
                  className="liga-notificaciones__ghost"
                  onClick={() => void refrescarHistorial()}
                >
                  Actualizar
                </button>
                {(snapshot?.cola ?? []).some((item) =>
                  esCorreoNoEnviado(item.estado, null)
                ) ||
                (snapshot?.historial ?? []).some((item) =>
                  esCorreoNoEnviado(item.estado, item.proveedor_estado)
                ) ? (
                  <button
                    type="button"
                    className="liga-notificaciones__ghost"
                    disabled={!puedeEscribir || enviandoLote}
                    onClick={() => void descartarNoEnviados()}
                  >
                    Borrar no enviados
                  </button>
                ) : null}
              </div>
              {(logsSinRepetir(snapshot?.historial ?? [])).map((item) => {
                const jugador =
                  filas.find((fila) => fila.jugadorId === item.liga_jugador_id)
                    ?.nombre ?? "Jugador";
                const abierto = historialDetalleId === item.id;
                const estado = etiquetaEntrega(
                  item.estado,
                  item.proveedor_estado,
                  item.motivo
                );
                const colaItem = (snapshot?.cola ?? []).find(
                  (fila) => fila.id === item.queue_id
                );
                const enviado = Boolean(item.proveedor_estado) || item.estado === "enviado";
                return (
                  <article
                    key={item.id}
                    className="liga-notificaciones__history-row"
                  >
                    <div>
                      <p className="liga-notificaciones__nombre">{jugador}</p>
                      <p className="liga-notificaciones__meta">
                        {etiquetaTipoComunicacion(item.tipo)} ·{" "}
                        {etiquetaOrigenComunicacion(colaItem?.origen, item.tipo)}
                        {colaItem?.jornada_numero
                          ? ` · Jornada ${colaItem.jornada_numero}`
                          : ""}
                        {" · "}
                        {enviado
                          ? `Enviado ${new Date(item.created_at).toLocaleString("es-MX")}`
                          : `Registrado ${new Date(item.created_at).toLocaleString("es-MX")}`}
                      </p>
                    </div>
                    <p className="liga-notificaciones__meta">{estado}</p>
                    <span className="liga-notificaciones__badge liga-notificaciones__badge--pending">
                      {estado}
                    </span>
                    <span className="liga-notificaciones__history-actions">
                      {sePuedeBorrarHistorial(item.estado) ? (
                        <button
                          type="button"
                          className="liga-notificaciones__ghost"
                          disabled={!puedeEscribir || enviandoLote}
                          onClick={() =>
                            void descartarNoEnviados({ logId: item.id })
                          }
                        >
                          Borrar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="liga-notificaciones__ghost"
                        onClick={() =>
                          setHistorialDetalleId(abierto ? null : item.id)
                        }
                      >
                        {abierto ? "Ocultar" : "Detalles"}
                      </button>
                    </span>
                    {abierto ? (
                      <p className="liga-notificaciones__hint liga-notificaciones__history-detail">
                        {item.proveedor_estado
                          ? `Proveedor: ${item.proveedor_estado}`
                          : motivoVisible(item.motivo)}{" "}
                        · {item.attempts} intentos
                        {colaItem?.programado_para
                          ? ` · Programado ${new Date(colaItem.programado_para).toLocaleString("es-MX")}`
                          : ""}
                      </p>
                    ) : null}
                  </article>
                );
              })}
              {(snapshot?.cola ?? [])
                .filter(
                  (item) =>
                    !colaYaMostradaEnHistorial(
                      item,
                      logsSinRepetir(snapshot?.historial ?? [])
                    )
                )
                .map((item, index) => {
                const key = `${item.liga_jugador_id}-${item.estado}-${index}`;
                const jugador =
                  filas.find((fila) => fila.jugadorId === item.liga_jugador_id)
                    ?.nombre ?? "Jugador";
                const abierto = historialDetalleId === key;
                return (
                  <article key={key} className="liga-notificaciones__history-row">
                    <div>
                      <p className="liga-notificaciones__nombre">{jugador}</p>
                      <p className="liga-notificaciones__meta">
                        {etiquetaTipoComunicacion(item.tipo)} ·{" "}
                        {etiquetaOrigenComunicacion(item.origen, item.tipo)}
                        {item.jornada_numero ? ` · Jornada ${item.jornada_numero}` : ""}
                        {item.programado_para
                          ? ` · Programado ${new Date(item.programado_para).toLocaleString("es-MX")}`
                          : ""}
                        {item.processed_at && item.estado === "enviado"
                          ? ` · Enviado ${new Date(item.processed_at).toLocaleString("es-MX")}`
                          : ""}
                      </p>
                    </div>
                    <p className="liga-notificaciones__meta">
                      {etiquetaEntrega(item.estado, null, item.motivo)}
                    </p>
                    <span className="liga-notificaciones__badge liga-notificaciones__badge--pending">
                      {etiquetaEntrega(item.estado, null, item.motivo)}
                    </span>
                    <span className="liga-notificaciones__history-actions">
                      {item.estado === "error" && item.lote_id ? (
                        <button
                          type="button"
                          className="liga-notificaciones__ghost"
                          disabled={enviandoLote}
                          onClick={() => void reintentarLote(item.lote_id!)}
                        >
                          Reintentar
                        </button>
                      ) : null}
                      {item.id && sePuedeBorrarHistorial(item.estado) ? (
                        <button
                          type="button"
                          className="liga-notificaciones__ghost"
                          disabled={!puedeEscribir || enviandoLote}
                          onClick={() =>
                            void descartarNoEnviados({ queueId: item.id })
                          }
                        >
                          Borrar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="liga-notificaciones__ghost"
                        onClick={() =>
                          setHistorialDetalleId(abierto ? null : key)
                        }
                      >
                        {abierto ? "Ocultar" : "Detalles"}
                      </button>
                    </span>
                    {abierto ? (
                      <p className="liga-notificaciones__hint liga-notificaciones__history-detail">
                        {item.motivo
                          ? motivoVisible(item.motivo)
                          : "Sin envío al proveedor"}{" "}
                        · {item.attempts} intentos
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {area === "configuracion" ? (
        <div className="liga-notificaciones__config">
          <p className="liga-notificaciones__hint">
            {listos} jugadores cumplen todas las condiciones.{" "}
            {filas.length - listos} quedan excluidos.
          </p>

          <div className="liga-notificaciones__mode-grid">
            <button
              type="button"
              className="liga-notificaciones__mode-card"
              aria-pressed={config.modo_operacion === "manual"}
              disabled={guardandoId === "config" || !puedeEscribir}
              onClick={() =>
                void cambiarConfig({ ...config, modo_operacion: "manual" })
              }
            >
              <span className="liga-notificaciones__mode-card-kicker">
                Recomendado
              </span>
              <span className="liga-notificaciones__mode-card-title">Manual</span>
              <span className="liga-notificaciones__mode-card-copy">
                Selecciona los jugadores, revisa el mensaje y confirma cada
                envío.
              </span>
            </button>
            <button
              type="button"
              className="liga-notificaciones__mode-card"
              aria-pressed={config.modo_operacion === "automatico"}
              disabled={guardandoId === "config" || !puedeEscribir}
              onClick={() =>
                void cambiarConfig({
                  ...config,
                  modo_operacion: "automatico",
                })
              }
            >
              <span className="liga-notificaciones__mode-card-kicker">
                Opcional
              </span>
              <span className="liga-notificaciones__mode-card-title">
                Automático
              </span>
              <span className="liga-notificaciones__mode-card-copy">
                Los envíos salen desde el servidor, según cada automatización.
              </span>
            </button>
          </div>

          {!puedeEscribir ? (
            <p className="liga-notificaciones__hint">
              La preferencia de modo no se persistirá hasta activar el backend.
              Manual permanece como predeterminado.
            </p>
          ) : null}

          {config.modo_operacion === "automatico" ? (
            <div className="liga-notificaciones__auto">
              <p className="liga-notificaciones__hint">
                Cada automatización nace desactivada. El envío manual sigue
                disponible aunque actives alguna.
              </p>
              <section className="liga-notificaciones__auto-card">
                <div className="liga-notificaciones__auto-head">
                  <h3>Resultados de jornada</h3>
                  <span className="liga-notificaciones__auto-status">
                    {automatica.resultados_auto ? "Activa" : "Desactivada"}
                  </span>
                </div>
                <label className="liga-notificaciones__toggle liga-notificaciones__toggle--block">
                  <input
                    type="checkbox"
                    checked={automatica.resultados_auto}
                    disabled={guardandoId === "config" || !puedeEscribir}
                    onChange={(event) =>
                      void cambiarConfig({
                        ...config,
                        resultados_auto: event.target.checked,
                      })
                    }
                  />
                  <span className="liga-notificaciones__toggle-ui" aria-hidden />
                  <span>
                    <strong>Enviar resultados automáticamente</strong>
                    <span className="liga-notificaciones__hint">
                      Al finalizar oficialmente una jornada, los participantes
                      reciben un correo con los resultados y un enlace para
                      consultarlos.
                    </span>
                  </span>
                </label>
                <label className="liga-notificaciones__field">
                  <span>Momento de envío</span>
                  <select
                    className="liga-notificaciones__select"
                    value={automatica.resultados_espera_minutos}
                    disabled={guardandoId === "config" || !puedeEscribir}
                    onChange={(event) =>
                      void cambiarConfig({
                        ...config,
                        resultados_espera_minutos: Number(event.target.value) as 0 | 5 | 15,
                      })
                    }
                  >
                    <option value={0}>Inmediatamente</option>
                    <option value={5}>5 minutos después</option>
                    <option value={15}>15 minutos después</option>
                  </select>
                </label>
              </section>
              <section className="liga-notificaciones__auto-card">
                <div className="liga-notificaciones__auto-head">
                  <h3>Recordatorio de jornada</h3>
                  <span className="liga-notificaciones__auto-status">
                    {automatica.recordatorio_auto ? "Activa" : "Desactivada"}
                  </span>
                </div>
                <label className="liga-notificaciones__toggle liga-notificaciones__toggle--block">
                  <input
                    type="checkbox"
                    checked={automatica.recordatorio_auto}
                    disabled={guardandoId === "config" || !puedeEscribir}
                    onChange={(event) =>
                      void cambiarConfig({
                        ...config,
                        recordatorio_auto: event.target.checked,
                      })
                    }
                  />
                  <span className="liga-notificaciones__toggle-ui" aria-hidden />
                  <span>
                    <strong>Enviar recordatorio de próxima jornada</strong>
                    <span className="liga-notificaciones__hint">
                      Usa la fecha y la hora real de la jornada. Si el horario
                      cambia o la jornada se cierra, el recordatorio pendiente
                      se actualiza o se cancela.
                    </span>
                  </span>
                </label>
                <label className="liga-notificaciones__field">
                  <span>Anticipación</span>
                  <select
                    className="liga-notificaciones__select"
                    value={automatica.recordatorio_horas}
                    disabled={guardandoId === "config" || !puedeEscribir}
                    onChange={(event) =>
                      void cambiarConfig({
                        ...config,
                        recordatorio_horas: Number(event.target.value) as 24 | 12 | 2,
                      })
                    }
                  >
                    <option value={24}>24 horas antes</option>
                    <option value={12}>12 horas antes</option>
                    <option value={2}>2 horas antes</option>
                  </select>
                </label>
              </section>
              <section className="liga-notificaciones__auto-card">
                <div className="liga-notificaciones__auto-head">
                  <h3>Bienvenida</h3>
                  <span className="liga-notificaciones__auto-status">
                    {automatica.bienvenida_auto ? "Activa" : "Desactivada"}
                  </span>
                </div>
                <label className="liga-notificaciones__toggle liga-notificaciones__toggle--block">
                  <input
                    type="checkbox"
                    checked={automatica.bienvenida_auto}
                    disabled={guardandoId === "config" || !puedeEscribir}
                    onChange={(event) =>
                      void cambiarConfig({
                        ...config,
                        bienvenida_auto: event.target.checked,
                      })
                    }
                  />
                  <span className="liga-notificaciones__toggle-ui" aria-hidden />
                  <span>
                    <strong>Enviar correo de bienvenida a nuevos participantes</strong>
                    <span className="liga-notificaciones__hint">
                      Se envía cuando el jugador queda inscrito y cumple las
                      condiciones de autorización. No alcanza a quienes ya
                      estaban inscritos.
                    </span>
                  </span>
                </label>
              </section>
            </div>
          ) : null}
        </div>
      ) : null}

      {selectorAbierto && typeof document !== "undefined"
        ? createPortal(
            <div className="liga-notificaciones__overlay">
              <button
                type="button"
                className="liga-notificaciones__overlay-scrim"
                aria-label="Cerrar selector"
                onClick={() => setSelectorAbierto(false)}
              />
              <div
                className="liga-notificaciones__picker"
                role="dialog"
                aria-modal="true"
                aria-label="Seleccionar jugadores"
              >
                <h3 className="liga-notificaciones__section-title">Para</h3>
                <label className="liga-notificaciones__field">
                  <span>Buscar</span>
                  <input
                    className="liga-notificaciones__select"
                    value={busquedaSelector}
                    placeholder="Nombre o Riviera ID"
                    aria-label="Buscar jugador para este correo"
                    onChange={(event) => setBusquedaSelector(event.target.value)}
                  />
                </label>
                <div className="liga-notificaciones__filters" role="group">
                  <button
                    type="button"
                    className="liga-notificaciones__chip"
                    aria-pressed={filtroSelector === "listos"}
                    onClick={() => setFiltroSelector("listos")}
                  >
                    Listos para enviar
                  </button>
                  <button
                    type="button"
                    className="liga-notificaciones__chip"
                    aria-pressed={filtroSelector === "todos"}
                    onClick={() => setFiltroSelector("todos")}
                  >
                    Todos
                  </button>
                </div>
                <div className="liga-notificaciones__picker-tools">
                  <button
                    type="button"
                    className="liga-notificaciones__ghost"
                    onClick={() => {
                      const next = { ...borradorSeleccion };
                      for (const fila of filas) {
                        if (fila.visual === "habilitado") next[fila.jugadorId] = true;
                      }
                      setBorradorSeleccion(next);
                    }}
                  >
                    Seleccionar elegibles
                  </button>
                  <button
                    type="button"
                    className="liga-notificaciones__ghost"
                    onClick={() => setBorradorSeleccion({})}
                  >
                    Deseleccionar todos
                  </button>
                </div>
                <ul className="liga-notificaciones__picker-list">
                  {filas
                    .filter((fila) => {
                      const q = busquedaSelector.trim().toLocaleLowerCase("es");
                      if (q) {
                        const nombre = fila.nombre.toLocaleLowerCase("es");
                        const id = (fila.rivieraId ?? "").toLocaleLowerCase("es");
                        if (!nombre.includes(q) && !id.includes(q)) return false;
                      }
                      if (filtroSelector === "listos") {
                        return fila.visual === "habilitado";
                      }
                      return true;
                    })
                    .map((fila) => {
                      const listo = fila.visual === "habilitado";
                      return (
                        <li key={fila.jugadorId}>
                          <label className="liga-notificaciones__pick-row">
                            <input
                              type="checkbox"
                              checked={Boolean(borradorSeleccion[fila.jugadorId]) && listo}
                              disabled={!listo}
                              aria-label={`Agregar a ${fila.nombre} a este correo`}
                              onChange={(event) =>
                                setBorradorSeleccion((prev) => ({
                                  ...prev,
                                  [fila.jugadorId]: event.target.checked,
                                }))
                              }
                            />
                            <FotoRetrato
                              fotoUrl={fila.fotoUrl}
                              nombre={fila.nombre}
                              size="md"
                            />
                            <span>
                              <strong>{fila.nombre}</strong>
                              {fila.rivieraId ? ` · ${fila.rivieraId}` : ""}
                              <br />
                              {fila.email?.trim() || "Sin correo"}
                              {" · "}
                              {ESTADO_GRID_LABEL[fila.visual]}
                              {listo
                                ? ""
                                : ` · ${motivoVisible(
                                    decisionEncolar(fila).motivo ?? fila.visual
                                  )}`}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
                <p className="liga-notificaciones__drawer-status">
                  {
                    filas.filter(
                      (fila) =>
                        fila.visual === "habilitado" &&
                        borradorSeleccion[fila.jugadorId]
                    ).length
                  }{" "}
                  seleccionados
                </p>
                <button
                  type="button"
                  className="liga-notificaciones__btn liga-notificaciones__btn--primary"
                  onClick={agregarDestinatarios}
                >
                  {`AGREGAR ${
                    filas.filter(
                      (fila) =>
                        fila.visual === "habilitado" &&
                        borradorSeleccion[fila.jugadorId]
                    ).length
                  } DESTINATARIOS`}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
};

export default LigaNotificacionesPanel;
