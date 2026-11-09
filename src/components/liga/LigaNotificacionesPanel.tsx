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
import {
  contarPerfilesPorCorreo,
  correoEfectivoDestinatario,
  type ContactoInscritoResuelto,
} from "../../lib/liga/notificaciones/resolveInscritoContacto";
import {
  PLANTILLAS_COMUNICACION,
  plantillaPorId,
  renderComunicacionEmail,
  type TipoComunicacionLiga,
} from "../../lib/liga/notificaciones/comunicacionTemplates";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import {
  cargarContactoInscritosLiga,
  cargarNotificacionesLiga,
  establecerHabilitacionJugador,
  guardarConfigLiga,
  registrarConsentimientoJugador,
  revocarConsentimientoJugador,
  solicitarComunicacionManual,
  type ConfigNotificacionLiga,
  type HistorialNotificacionRow,
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
  {
    id: "manifestacion_presencial",
    label: "Autorizó verbalmente al registrarse",
    requiereFecha: false,
  },
  {
    id: "mensaje_del_jugador",
    label: "Autorizó por mensaje",
    requiereFecha: false,
  },
  {
    id: "formulario_registro",
    label: "Autorizó mediante formulario",
    requiereFecha: true,
  },
  {
    id: "documento_firmado",
    label: "Autorizó mediante documento",
    requiereFecha: true,
  },
  {
    id: "consentimiento_previo_registro",
    label: "Constancia previa al registrarse",
    requiereFecha: true,
  },
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
  esquema_pendiente: "Falta aplicar la migración de comunicaciones manuales",
  no_disponible: "No se pudo guardar",
  consentimiento_sin_evidencia: "Falta una constancia del consentimiento",
  anon: "Hace falta una sesión",
  sin_permiso: "No tienes permiso en esta liga",
  mensaje_incompleto: "Completa asunto y mensaje",
  lote_requerido: "Confirma el envío desde el compositor",
  tipo_no_soportado: "Plantilla no soportada",
  modo_manual: "Esta liga está en modo manual",
};

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
  const [plantillaId, setPlantillaId] =
    useState<TipoComunicacionLiga>("bienvenida");
  const [asuntoDraft, setAsuntoDraft] = useState(
    PLANTILLAS_COMUNICACION[0].asunto
  );
  const [cuerpoDraft, setCuerpoDraft] = useState(
    PLANTILLAS_COMUNICACION[0].cuerpo
  );
  const [loteEnvioId, setLoteEnvioId] = useState<string | null>(null);

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
        preferencia,
        visual: estadoVisual({
          email,
          perfilesConMismoCorreo: perfiles,
          preferencia: preferenciaPolitica,
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
  };
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

  const candidatosEnvioKey = candidatosEnvio
    .map((fila) => fila.jugadorId)
    .join("|");

  useEffect(() => {
    // Selección de envío: no se simula guardada; nace vacía al cambiar candidatos.
    setEnvioSeleccion({});
    setEnvioPaso("idle");
    setLoteEnvioId(null);
  }, [ligaId, candidatosEnvioKey]);

  const seleccionadosEnvio = candidatosEnvio.filter(
    (fila) => envioSeleccion[fila.jugadorId]
  );
  const incluidosEnvio = seleccionadosEnvio.filter(
    (fila) => decisionEncolar(fila).encolar
  );
  const excluidosEnvio: { fila: FilaDestinatario; motivo: string }[] = [
    ...seleccionadosEnvio
      .filter((fila) => !decisionEncolar(fila).encolar)
      .map((fila) => ({
        fila,
        motivo: motivoVisible(decisionEncolar(fila).motivo),
      })),
    ...candidatosEnvio
      .filter((fila) => !envioSeleccion[fila.jugadorId])
      .map((fila) => ({
        fila,
        motivo: "No seleccionado para este envío",
      })),
    ...filas
      .filter((fila) => fila.visual !== "habilitado")
      .map((fila) => ({
        fila,
        motivo: motivoVisible(decisionEncolar(fila).motivo ?? fila.visual),
      })),
  ];

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
    const origenMeta = ORIGENES.find((item) => item.id === origenDraft);
    let registradoAt = new Date().toISOString();
    if (origenMeta?.requiereFecha) {
      if (!fechaConsentimientoDraft.trim()) {
        confirmar(
          "Indica la fecha del consentimiento original. No inventamos fechas."
        );
        return;
      }
      const parsed = Date.parse(`${fechaConsentimientoDraft}T12:00:00`);
      if (Number.isNaN(parsed)) {
        confirmar(motivoVisible("consentimiento_sin_evidencia"));
        return;
      }
      registradoAt = new Date(parsed).toISOString();
    }
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

  function aplicarPlantilla(id: TipoComunicacionLiga) {
    const plantilla = plantillaPorId(id);
    setPlantillaId(plantilla.id);
    setAsuntoDraft(plantilla.asunto);
    setCuerpoDraft(plantilla.cuerpo);
    setEnvioPaso("idle");
  }

  async function confirmarEnvioManual() {
    if (!puedeEscribir || enviandoLote) return;
    const lote = incluidosEnvio;
    if (lote.length === 0) {
      confirmar("No hay jugadores listos para este envío.");
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
    let ok = 0;
    let fallidos = 0;
    let ultimoMotivo: string | null = null;
    const colaNueva: {
      liga_jugador_id: string;
      estado: "pendiente";
      attempts: number;
      motivo: string | null;
    }[] = [];
    for (const fila of lote) {
      const asuntoResuelto = renderComunicacionEmail({
        clubNombre,
        ligaNombre,
        jugadorNombre: fila.nombre,
        asunto: asuntoDraft,
        cuerpo: cuerpoDraft,
        vistaPrevia: false,
      }).subject;
      const cuerpoResuelto = cuerpoDraft
        .replace(/\{\{\s*nombre\s*\}\}/gi, fila.nombre)
        .replace(/\{\{\s*liga\s*\}\}/gi, ligaNombre)
        .replace(/\{\{\s*club\s*\}\}/gi, clubNombre);
      const resultado = await solicitarComunicacionManual({
        ligaId,
        jugadorId: fila.jugadorId,
        tipo: plantillaId,
        asunto: asuntoResuelto,
        cuerpo: cuerpoResuelto,
        loteId,
      });
      if (resultado.ok && resultado.encolado) {
        ok += 1;
        colaNueva.push({
          liga_jugador_id: fila.jugadorId,
          estado: "pendiente",
          attempts: 0,
          motivo: null,
        });
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
    setEnviandoLote(false);
    setEnvioPaso("idle");
    if (ok > 0 && fallidos === 0) {
      confirmar(
        `Envío encolado para ${ok} jugador${ok === 1 ? "" : "es"}. No se entregó correo todavía.`
      );
      setArea("historial");
      return;
    }
    if (ok > 0) {
      confirmar(
        `Encolados ${ok}. ${fallidos} no se pudieron preparar. Revisa el historial.`
      );
      setArea("historial");
      return;
    }
    confirmar(motivoVisible(ultimoMotivo ?? "no_disponible"));
  }

  async function cambiarConfig(next: ConfigNotificacionLiga) {
    if (!puedeEscribir) {
      confirmar(motivoVisible("esquema_pendiente"));
      return;
    }
    setGuardandoId("config");
    const resultado = await guardarConfigLiga(ligaId, next);
    setGuardandoId(null);
    if (!resultado.ok) {
      confirmar(motivoVisible(resultado.motivo));
      return;
    }
    setSnapshot((prev) => (prev ? { ...prev, config: next } : prev));
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
    const origenRequiereFecha = ORIGENES.some(
      (item) => item.id === origenDraft && item.requiereFecha
    );
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
                  Cubre avisos deportivos de esta liga. No autoriza mensajes
                  promocionales.
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
            ) : (
              <div className="liga-notificaciones__consent-box">
                <p className="liga-notificaciones__hint">
                  {preferencia.consentimientoEstado === "revocado"
                    ? "Autorización revocada."
                    : "Sin autorización documentada. La inscripción sola no basta."}{" "}
                  Documenta solo evidencia real; no inventes fechas ni
                  conversaciones.
                </p>
                <label className="liga-notificaciones__field">
                  <span>Constancia</span>
                  <select
                    className="liga-notificaciones__select"
                    value={origenDraft}
                    onChange={(event) => setOrigenDraft(event.target.value)}
                    aria-label={`Origen de la autorización de ${fila.nombre}`}
                    disabled={!puedeEscribir}
                  >
                    {ORIGENES.map((origen) => (
                      <option key={origen.id} value={origen.id}>
                        {origen.label}
                      </option>
                    ))}
                  </select>
                </label>
                {origenRequiereFecha ? (
                  <label className="liga-notificaciones__field">
                    <span>Fecha de la autorización</span>
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
                ) : null}
                <button
                  type="button"
                  className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
                  disabled={ocupado || !puedeEscribir}
                  onClick={() => void confirmarConsentimiento(fila)}
                >
                  Documentar autorización
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
          {elegible ? (
            <label className="liga-notificaciones__pick-row">
              <input
                type="checkbox"
                checked={Boolean(envioSeleccion[fila.jugadorId])}
                disabled={!puedeEscribir}
                aria-label={`Seleccionar a ${fila.nombre} para envío`}
                onChange={(event) =>
                  setEnvioSeleccion((prev) => ({
                    ...prev,
                    [fila.jugadorId]: event.target.checked,
                  }))
                }
              />
              <span>Para envío</span>
            </label>
          ) : null}
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
            <p className="liga-notificaciones__hint">
              Variables: {"{{nombre}}"}, {"{{liga}}"}, {"{{club}}"}. Se escapan
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
              <h4 className="liga-notificaciones__drawer-section-title">
                Destinatarios
              </h4>
              {candidatosEnvio.length === 0 ? (
                <p className="liga-notificaciones__hint">
                  Ningún jugador está listo (correo válido, autorización
                  documentada y habilitado). Gestiona destinatarios primero.
                </p>
              ) : (
                <ul className="liga-notificaciones__envio-list">
                  {candidatosEnvio.map((fila) => (
                    <li key={fila.jugadorId}>
                      <label className="liga-notificaciones__pick-row">
                        <input
                          type="checkbox"
                          checked={Boolean(envioSeleccion[fila.jugadorId])}
                          disabled={!puedeEscribir || enviandoLote}
                          onChange={(event) =>
                            setEnvioSeleccion((prev) => ({
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
                        <span>{fila.nombre}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              {envioPaso === "idle" ? (
                <button
                  type="button"
                  className="liga-notificaciones__btn liga-notificaciones__btn--primary"
                  disabled={
                    !puedeEscribir ||
                    enviandoLote ||
                    seleccionadosEnvio.length === 0 ||
                    !asuntoDraft.trim() ||
                    !cuerpoDraft.trim()
                  }
                  onClick={() => setEnvioPaso("preparado")}
                >
                  REVISAR DESTINATARIOS
                </button>
              ) : (
                <>
                  <p className="liga-notificaciones__drawer-status">
                    Asunto: {asuntoDraft}
                  </p>
                  <p className="liga-notificaciones__drawer-status">
                    Válidos ({incluidosEnvio.length})
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
                    Excluidos ({excluidosEnvio.length})
                  </p>
                  <ul className="liga-notificaciones__envio-list">
                    {excluidosEnvio.slice(0, 40).map(({ fila, motivo }) => (
                      <li key={`ex-${fila.jugadorId}`}>
                        <span>{fila.nombre}</span>
                        <span>{motivo}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="liga-notificaciones__hint">
                    Confirmar encola el mensaje. La entrega real solo ocurre si el
                    worker Resend está autorizado por separado.
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
                      ? "Encolando…"
                      : `ENVIAR A ${incluidosEnvio.length} JUGADOR${
                          incluidosEnvio.length === 1 ? "" : "ES"
                        }`}
                  </button>
                  <button
                    type="button"
                    className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
                    disabled={enviandoLote}
                    onClick={() => setEnvioPaso("idle")}
                  >
                    Cancelar
                  </button>
                </>
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
              {(snapshot?.historial ?? []).map((item) => {
                const jugador =
                  filas.find((fila) => fila.jugadorId === item.liga_jugador_id)
                    ?.nombre ?? "Jugador";
                const abierto = historialDetalleId === item.id;
                return (
                  <article
                    key={item.id}
                    className="liga-notificaciones__history-row"
                  >
                    <div>
                      <p className="liga-notificaciones__nombre">{jugador}</p>
                      <p className="liga-notificaciones__meta">Bienvenida</p>
                    </div>
                    <p className="liga-notificaciones__meta">
                      {new Date(item.created_at).toLocaleString("es-MX")}
                    </p>
                    <span className="liga-notificaciones__badge liga-notificaciones__badge--pending">
                      {item.estado}
                    </span>
                    <button
                      type="button"
                      className="liga-notificaciones__ghost"
                      onClick={() =>
                        setHistorialDetalleId(abierto ? null : item.id)
                      }
                    >
                      {abierto ? "Ocultar" : "Detalles"}
                    </button>
                    {abierto ? (
                      <p className="liga-notificaciones__hint liga-notificaciones__history-detail">
                        {item.proveedor_estado
                          ? `Proveedor: ${item.proveedor_estado}`
                          : motivoVisible(item.motivo)}{" "}
                        · {item.attempts} intentos
                      </p>
                    ) : null}
                  </article>
                );
              })}
              {(snapshot?.cola ?? []).map((item, index) => {
                const key = `${item.liga_jugador_id}-${item.estado}-${index}`;
                const jugador =
                  filas.find((fila) => fila.jugadorId === item.liga_jugador_id)
                    ?.nombre ?? "Jugador";
                const abierto = historialDetalleId === key;
                return (
                  <article key={key} className="liga-notificaciones__history-row">
                    <div>
                      <p className="liga-notificaciones__nombre">{jugador}</p>
                      <p className="liga-notificaciones__meta">Bienvenida · cola</p>
                    </div>
                    <p className="liga-notificaciones__meta">En cola</p>
                    <span className="liga-notificaciones__badge liga-notificaciones__badge--pending">
                      {item.estado}
                    </span>
                    <button
                      type="button"
                      className="liga-notificaciones__ghost"
                      onClick={() =>
                        setHistorialDetalleId(abierto ? null : key)
                      }
                    >
                      {abierto ? "Ocultar" : "Detalles"}
                    </button>
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
                Permite enviar notificaciones según los eventos configurados.
              </span>
              <span className="liga-notificaciones__mode-card-note">
                Todavía no habilitado para envíos reales.
              </span>
            </button>
          </div>

          {!puedeEscribir ? (
            <p className="liga-notificaciones__hint">
              La preferencia de modo no se persistirá hasta activar el backend.
              Manual permanece como predeterminado.
            </p>
          ) : null}

          <div className="liga-notificaciones__config-block">
            <label className="liga-notificaciones__toggle liga-notificaciones__toggle--block">
              <input
                type="checkbox"
                checked={!config.bienvenida_pausada}
                disabled={guardandoId === "config" || !puedeEscribir}
                onChange={(event) =>
                  void cambiarConfig({
                    ...config,
                    bienvenida_pausada: !event.target.checked,
                  })
                }
              />
              <span className="liga-notificaciones__toggle-ui" aria-hidden />
              <span>
                <strong>Bienvenida activa</strong>
                <span className="liga-notificaciones__hint">
                  Solo para jugadores ya autorizados y verificados.
                </span>
              </span>
            </label>
            <label className="liga-notificaciones__toggle liga-notificaciones__toggle--block">
              <input
                type="checkbox"
                checked={config.modo_prueba}
                disabled={guardandoId === "config" || !puedeEscribir}
                onChange={(event) =>
                  void cambiarConfig({
                    ...config,
                    modo_prueba: event.target.checked,
                  })
                }
              />
              <span className="liga-notificaciones__toggle-ui" aria-hidden />
              <span>
                <strong>Modo de prueba</strong>
                <span className="liga-notificaciones__hint">
                  No envía correos ni entrega enlaces de verificación al panel.
                </span>
              </span>
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default LigaNotificacionesPanel;
