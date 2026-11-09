import React, { useEffect, useMemo, useState } from "react";
import { useClubExperience } from "../../club-experience/ClubExperienceContext";
import { resolveClubLogo } from "../../club-experience/resolveClubLogo";
import { isRivieraOwnAccountName } from "../../club-experience/motherBrand";
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
  enlacePerfilBienvenida,
  renderBienvenidaEmail,
} from "../../lib/liga/notificaciones/bienvenidaTemplate";
import {
  estadoVisualVerificacion,
  puedeSolicitarVerificacion,
  type EstadoVisualVerificacion,
  type SolicitudVerificacionVista,
} from "../../lib/liga/notificaciones/verificacionPolicy";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import {
  cargarNotificacionesLiga,
  establecerHabilitacionJugador,
  guardarConfigLiga,
  registrarConsentimientoJugador,
  revocarConsentimientoJugador,
  solicitarBienvenidaJugador,
  solicitarVerificacionCorreo,
  type ConfigNotificacionLiga,
  type NotificacionesLigaSnapshot,
  type PreferenciaNotificacionRow,
  type VerificacionSolicitudRow,
} from "../../services/ligaNotificacionesService";
import { useMobileViewport } from "../../hooks/useMobileViewport";
import { useRetryableImage } from "../../hooks/useRetryableImage";
import { getJugadorInitials } from "../jugadores/JugadorAvatar";
import "./liga-notificaciones.css";

type Area = "destinatarios" | "bienvenida" | "historial" | "configuracion";
type Filtro = "todos" | "habilitados" | "pendientes" | "excluidos";

const AREAS: { id: Area; label: string }[] = [
  { id: "destinatarios", label: "Destinatarios" },
  { id: "bienvenida", label: "Correo de bienvenida" },
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
  { id: "manifestacion_presencial", label: "Me lo confirmó en persona" },
  { id: "mensaje_del_jugador", label: "Me lo escribió el jugador" },
] as const;

const MOTIVO_LABEL: Record<string, string> = {
  deshabilitado: "Sigue deshabilitado",
  sin_autorizacion: "Falta el consentimiento",
  sin_correo: "No hay correo",
  correo_invalido: "El correo no es válido",
  correo_ambiguo: "El correo está repetido",
  correo_por_verificar: "El correo no está verificado",
  ya_enviado: "La bienvenida ya quedó preparada como enviada",
  ya_encolado: "Ya hay una bienvenida pendiente",
  liga_pausada: "La bienvenida de esta liga está en pausa",
  ya_no_inscrito: "Ya no está inscrito",
  esquema_pendiente: "La base de notificaciones todavía no está aplicada",
  no_disponible: "No se pudo guardar",
  consentimiento_sin_evidencia: "Falta una constancia del consentimiento",
  anon: "Hace falta una sesión",
  sin_permiso: "No tienes permiso en esta liga",
  ya_verificado: "El correo ya está verificado",
  demasiado_pronto: "Espera unos minutos antes de pedir otro enlace",
  limite_alcanzado: "Se alcanzó el límite de solicitudes",
  correo_sin_verificacion: "La verificación solo se acredita con el enlace",
};

const ESTADO_PRINCIPAL_LABEL: Record<EstadoVisualNotificacion, string> = {
  habilitado: "Listo para recibir",
  deshabilitado: "Deshabilitado",
  sin_correo: "Sin correo",
  correo_por_verificar: "Pendiente de verificación",
  sin_autorizacion: "Sin autorización",
  correo_ambiguo: "Correo ambiguo",
};

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
  verificacion: EstadoVisualVerificacion;
  solicitud: SolicitudVerificacionVista | null;
  yaEnviado: boolean;
  yaEncolado: boolean;
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

function ultimaSolicitud(
  rows: VerificacionSolicitudRow[],
  jugadorId: string
): SolicitudVerificacionVista | null {
  const row = rows.find((item) => item.liga_jugador_id === jugadorId);
  if (!row) return null;
  return {
    estado: row.estado,
    expiresAt: row.expires_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
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
      return "pending";
    case "sin_correo":
    case "correo_ambiguo":
    case "deshabilitado":
      return "blocked";
    default:
      return "blocked";
  }
}

function detalleEstado(fila: FilaDestinatario): string | null {
  if (fila.visual === "habilitado") return null;
  if (fila.visual === "correo_por_verificar") {
    return "Debe confirmar el correo con el enlace.";
  }
  if (fila.visual === "sin_autorizacion") {
    return "Falta consentimiento documentado.";
  }
  if (fila.visual === "deshabilitado") {
    return "El club aún no autoriza notificaciones.";
  }
  if (fila.visual === "correo_ambiguo") {
    return "Varios perfiles comparten este correo.";
  }
  if (fila.visual === "sin_correo") {
    return "Añade un correo en el perfil del jugador.";
  }
  return null;
}

function esPendiente(fila: FilaDestinatario): boolean {
  return (
    fila.visual === "correo_por_verificar" ||
    fila.visual === "sin_autorizacion" ||
    fila.verificacion === "pendiente_verificacion" ||
    fila.verificacion === "enlace_vencido"
  );
}

function FotoRetrato({
  fotoUrl,
  nombre,
  size = "md",
}: {
  fotoUrl: string | null;
  nombre: string;
  size?: "md" | "lg";
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
  const isMobile = useMobileViewport(767);
  const { manifest } = useClubExperience();
  const clubNombre = manifest.displayName?.trim() || "Riviera Open";
  const logoUrl = resolveClubLogo(manifest, "dark");
  const acento = isRivieraOwnAccountName(clubNombre)
    ? null
    : manifest.colors?.primary ?? null;
  const [area, setArea] = useState<Area>("destinatarios");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [snapshot, setSnapshot] = useState<NotificacionesLigaSnapshot | null>(
    null
  );
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enlacePrueba, setEnlacePrueba] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [origenDraft, setOrigenDraft] = useState<string>(ORIGENES[0].id);
  const [gestionId, setGestionId] = useState<string | null>(null);
  const [historialDetalleId, setHistorialDetalleId] = useState<string | null>(
    null
  );
  const [previewId, setPreviewId] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    void cargarNotificacionesLiga(ligaId).then((data) => {
      if (!activo) return;
      setSnapshot(data);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [ligaId]);

  const filas = useMemo(() => {
    const poolById = new Map(pool.map((jugador) => [jugador.id, jugador]));
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

    const correos = new Map<string, Set<string>>();
    for (const jugador of pool) {
      const correo = normalizarCorreo(jugador.email);
      if (!correo) continue;
      const grupo = correos.get(correo) ?? new Set<string>();
      grupo.add(jugador.id);
      correos.set(correo, grupo);
    }

    const preferencias = new Map(
      (snapshot?.preferencias ?? []).map((row) => [row.liga_jugador_id, row])
    );
    const cola = snapshot?.cola ?? [];
    const verificaciones = snapshot?.verificaciones ?? [];

    return Array.from(ids).map((jugadorId): FilaDestinatario => {
      const enPool = poolById.get(jugadorId);
      const inscripcion = inscripciones.find(
        (item) => item.jugador_id === jugadorId
      );
      const email = enPool?.email ?? inscripcion?.jugador?.email ?? null;
      const correo = normalizarCorreo(email);
      const preferencia = preferencias.get(jugadorId) ?? null;
      const envios = cola.filter((item) => item.liga_jugador_id === jugadorId);
      const solicitud = ultimaSolicitud(verificaciones, jugadorId);
      const preferenciaPolitica = preferenciaParaPolitica(preferencia);
      const perfiles = correo ? correos.get(correo)?.size ?? 1 : 0;
      return {
        jugadorId,
        nombre: enPool?.nombre ?? inscripcion?.jugador?.nombre ?? "Jugador",
        rivieraId: enPool?.riviera_id ?? null,
        rivieraJugadorId: enPool?.riviera_jugador_id ?? null,
        email,
        fotoUrl: enPool?.foto_url ?? null,
        categoria: categoriaVisible(enPool?.categoria),
        perfilesConMismoCorreo: perfiles,
        preferencia,
        visual: estadoVisual({
          email,
          perfilesConMismoCorreo: perfiles,
          preferencia: preferenciaPolitica,
          emailVerificado: preferencia?.correo_verificado_email ?? null,
          sigueInscrito: true,
          esSalienteDeSustitucion: false,
        }),
        verificacion: estadoVisualVerificacion({
          email,
          perfilesConMismoCorreo: perfiles,
          preferencia: preferenciaPolitica,
          emailVerificado: preferencia?.correo_verificado_email ?? null,
          solicitud,
        }),
        solicitud,
        yaEnviado: envios.some((item) => item.estado === "enviado"),
        yaEncolado: envios.some(
          (item) => item.estado === "pendiente" || item.estado === "procesando"
        ),
      };
    });
  }, [equipos, inscripciones, pool, snapshot, sustituciones]);

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

  const conteo = contarDestinatarios(
    filas.map(
      (fila) =>
        preferenciaEfectiva(preferenciaParaPolitica(fila.preferencia))
          .adminHabilitado
    )
  );
  const pendientesVerificacion = filas.filter(
    (fila) =>
      fila.visual === "correo_por_verificar" ||
      fila.verificacion === "pendiente_verificacion" ||
      fila.verificacion === "enlace_vencido"
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

  async function pedirVerificacion(fila: FilaDestinatario) {
    if (!puedeEscribir) {
      confirmar(motivoVisible("esquema_pendiente"));
      return;
    }
    setGuardandoId(fila.jugadorId);
    const resultado = await solicitarVerificacionCorreo({
      ligaId,
      jugadorId: fila.jugadorId,
    });
    setGuardandoId(null);
    if (!resultado.ok) {
      confirmar(motivoVisible(resultado.motivo));
      return;
    }
    const ahora = new Date().toISOString();
    setSnapshot((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        verificaciones: [
          {
            id: resultado.solicitudId ?? `local-${fila.jugadorId}`,
            liga_jugador_id: fila.jugadorId,
            estado: "pendiente",
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            confirmed_at: null,
            created_at: ahora,
          },
          ...prev.verificaciones.filter(
            (item) =>
              !(
                item.liga_jugador_id === fila.jugadorId &&
                item.estado === "pendiente"
              )
          ),
        ],
      };
    });
    if (resultado.enlaceSimulado) {
      setEnlacePrueba(resultado.enlaceSimulado);
      confirmar(
        "Verificación simulada lista. Copia el enlace de prueba debajo. No se envió un correo."
      );
      return;
    }
    setEnlacePrueba(null);
    confirmar("Solicitud de verificación preparada. No se envió un correo real.");
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
    const evidencia = registrarConsentimiento({
      origen: origenDraft,
      registradoAt: new Date().toISOString(),
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
        })
    );
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

  async function generarBienvenida(fila: FilaDestinatario) {
    if (!puedeEscribir) {
      confirmar(motivoVisible("esquema_pendiente"));
      return;
    }
    setGuardandoId(fila.jugadorId);
    const resultado = await solicitarBienvenidaJugador(ligaId, fila.jugadorId);
    setGuardandoId(null);
    if (!resultado.ok || !resultado.encolado) {
      confirmar(motivoVisible(resultado.motivo));
      return;
    }
    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            cola: [
              {
                liga_jugador_id: fila.jugadorId,
                estado: "pendiente",
                attempts: 0,
                motivo: null,
              },
              ...prev.cola,
            ],
          }
        : prev
    );
    confirmar("Bienvenida preparada. No se envió ningún correo.");
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
    const decision = puedeEncolarBienvenida({
      destinatario: {
        email: fila.email,
        perfilesConMismoCorreo: fila.perfilesConMismoCorreo,
        preferencia: preferenciaParaPolitica(fila.preferencia),
        emailVerificado: fila.preferencia?.correo_verificado_email ?? null,
        sigueInscrito: true,
        esSalienteDeSustitucion: false,
      },
      ligaPausada: config.bienvenida_pausada,
      yaEnviado: fila.yaEnviado,
      yaEncolado: fila.yaEncolado,
      origen: "accion_admin",
    });
    const recientes = (snapshot?.verificaciones ?? []).filter(
      (item) =>
        item.liga_jugador_id === fila.jugadorId &&
        Date.now() - Date.parse(item.created_at) < 24 * 60 * 60 * 1000
    ).length;
    const ultima = fila.solicitud?.createdAt
      ? (Date.now() - Date.parse(fila.solicitud.createdAt)) / 60000
      : null;
    const puedeVerificar = puedeSolicitarVerificacion({
      autenticado: true,
      esOrganizadorDeLaLiga: true,
      esMasterAdmin: false,
      sigueInscrito: true,
      email: fila.email,
      perfilesConMismoCorreo: fila.perfilesConMismoCorreo,
      preferencia: preferenciaParaPolitica(fila.preferencia),
      emailVerificado: fila.preferencia?.correo_verificado_email ?? null,
      solicitudesRecientes: recientes,
      minutosDesdeUltima: ultima,
    });
    const ocupado = guardandoId === fila.jugadorId;

    return (
      <div
        className="liga-notificaciones__drawer"
        role="dialog"
        aria-label={`Gestionar notificaciones de ${fila.nombre}`}
      >
        <div className="liga-notificaciones__drawer-head">
          <div className="liga-notificaciones__identidad">
            <FotoRetrato fotoUrl={fila.fotoUrl} nombre={fila.nombre} size="md" />
            <div className="liga-notificaciones__identidad-copy">
              <p className="liga-notificaciones__nombre">{fila.nombre}</p>
              <p className="liga-notificaciones__correo">
                {fila.email?.trim() || "Sin correo"}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="liga-notificaciones__ghost"
            onClick={() => setGestionId(null)}
          >
            Cerrar
          </button>
        </div>

        <dl className="liga-notificaciones__facts">
          <div>
            <dt>Estado</dt>
            <dd>{ESTADO_PRINCIPAL_LABEL[fila.visual]}</dd>
          </div>
          <div>
            <dt>Consentimiento</dt>
            <dd>
              {preferencia.consentimientoEstado === "autorizado"
                ? "Documentado"
                : preferencia.consentimientoEstado === "revocado"
                  ? "Revocado"
                  : "Pendiente"}
            </dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>
              {fila.preferencia?.correo_verificado
                ? "Verificado"
                : "Sin verificar"}
            </dd>
          </div>
        </dl>

        {!puedeEscribir ? (
          <p className="liga-notificaciones__hint">
            El guardado permanece desactivado mientras el backend está pendiente.
          </p>
        ) : null}

        <div className="liga-notificaciones__drawer-actions">
          {puedeVerificar.solicitar ? (
            <button
              type="button"
              className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
              disabled={ocupado || !puedeEscribir}
              onClick={() => void pedirVerificacion(fila)}
            >
              Solicitar verificación
            </button>
          ) : null}

          {preferencia.consentimientoEstado === "autorizado" ? (
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
              Revocar consentimiento
            </button>
          ) : (
            <div className="liga-notificaciones__consent-box">
              <p className="liga-notificaciones__hint">
                El correo y la inscripción no cuentan como consentimiento.
                Regístralo solo con constancia verificable.
              </p>
              <label className="liga-notificaciones__field">
                <span>Origen</span>
                <select
                  className="liga-notificaciones__select"
                  value={origenDraft}
                  onChange={(event) => setOrigenDraft(event.target.value)}
                  aria-label={`Origen del consentimiento de ${fila.nombre}`}
                  disabled={!puedeEscribir}
                >
                  {ORIGENES.map((origen) => (
                    <option key={origen.id} value={origen.id}>
                      {origen.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
                disabled={ocupado || !puedeEscribir}
                onClick={() => void confirmarConsentimiento(fila)}
              >
                Confirmar consentimiento
              </button>
            </div>
          )}

          {decision.encolar ? (
            <button
              type="button"
              className="liga-notificaciones__btn liga-notificaciones__btn--primary"
              disabled={ocupado || !puedeEscribir}
              onClick={() => void generarBienvenida(fila)}
            >
              Preparar bienvenida
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function celdaJugador(fila: FilaDestinatario) {
    return (
      <div className="liga-notificaciones__identidad">
        <FotoRetrato
          fotoUrl={fila.fotoUrl}
          nombre={fila.nombre}
          size={isMobile ? "lg" : "md"}
        />
        <div className="liga-notificaciones__identidad-copy">
          <p className="liga-notificaciones__nombre">{fila.nombre}</p>
          {fila.rivieraId ? (
            <p className="liga-notificaciones__riviera-id">{fila.rivieraId}</p>
          ) : null}
        </div>
      </div>
    );
  }

  function celdaEstado(fila: FilaDestinatario) {
    const detalle = detalleEstado(fila);
    return (
      <div className="liga-notificaciones__estado">
        <span
          className={`liga-notificaciones__badge liga-notificaciones__badge--${estadoTone(
            fila.visual
          )}`}
        >
          {ESTADO_PRINCIPAL_LABEL[fila.visual]}
        </span>
        {detalle ? (
          <p className="liga-notificaciones__estado-detail">{detalle}</p>
        ) : null}
      </div>
    );
  }

  const previewHtml = preview
    ? renderBienvenidaEmail({
        clubNombre,
        logoUrl,
        acentoHex: acento,
        ligaNombre,
        jugadorNombre: preview.nombre,
        categoria: preview.categoria,
        temporada: null,
        ...enlacePerfilBienvenida({
          rivieraJugadorId: preview.rivieraJugadorId,
          ligaId,
        }),
        footerLine: manifest.emails?.footerLine ?? null,
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
      {!cargando && snapshot?.disponible && !snapshot.escriturasActivas ? (
        <div className="liga-notificaciones__banner" role="status">
          Vista de revisión. El guardado y los envíos están desactivados.
        </div>
      ) : null}
      {!cargando && snapshot && !snapshot.disponible ? (
        <div className="liga-notificaciones__banner" role="status">
          Vista de revisión. El guardado y los envíos están desactivados.
        </div>
      ) : null}

      <header className="liga-notificaciones__header">
        <div className="liga-notificaciones__header-copy">
          <h2 className="liga-notificaciones__title">
            Centro de notificaciones
          </h2>
          <p className="liga-notificaciones__subtitle">
            Gestiona la comunicación con los jugadores de tu liga.
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
          <span className="liga-notificaciones__metric-value">
            {pendientesVerificacion}
          </span>
          <span className="liga-notificaciones__metric-label">
            Por verificar
          </span>
        </div>
        <div className="liga-notificaciones__metric">
          <span className="liga-notificaciones__metric-value">
            {conteo.excluidos}
          </span>
          <span className="liga-notificaciones__metric-label">Excluidos</span>
        </div>
      </div>

      {aviso ? (
        <p className="liga-notificaciones__toast" role="status">
          {aviso}
        </p>
      ) : null}
      {enlacePrueba ? (
        <p className="liga-notificaciones__toast liga-notificaciones__toast--simulado">
          <span>Enlace de prueba (solo entorno local): </span>
          <a href={enlacePrueba} rel="noreferrer">
            abrir verificación
          </a>
          <button
            type="button"
            className="liga-notificaciones__ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(enlacePrueba);
              confirmar("Enlace de prueba copiado.");
            }}
          >
            Copiar
          </button>
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
          ) : isMobile ? (
            <div className="liga-notificaciones__cards">
              {visibles.map((fila) => (
                <article
                  key={fila.jugadorId}
                  className="liga-notificaciones__card"
                >
                  {celdaJugador(fila)}
                  <p className="liga-notificaciones__correo">
                    {fila.email?.trim() || "Sin correo"}
                  </p>
                  {celdaEstado(fila)}
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
              ))}
            </div>
          ) : (
            <div className="liga-notificaciones__table-shell">
              <table className="liga-notificaciones__table">
                <thead>
                  <tr>
                    <th scope="col">Jugador</th>
                    <th scope="col">Correo</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Notificaciones</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((fila) => (
                    <tr key={fila.jugadorId}>
                      <td>{celdaJugador(fila)}</td>
                      <td>
                        <span className="liga-notificaciones__correo">
                          {fila.email?.trim() || "Sin correo"}
                        </span>
                      </td>
                      <td>{celdaEstado(fila)}</td>
                      <td>{switchNotificaciones(fila)}</td>
                      <td>
                        <button
                          type="button"
                          className="liga-notificaciones__btn liga-notificaciones__btn--secondary"
                          onClick={() => setGestionId(fila.jugadorId)}
                        >
                          Gestionar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {gestionFila ? (
            <div className="liga-notificaciones__overlay">
              <button
                type="button"
                className="liga-notificaciones__overlay-scrim"
                aria-label="Cerrar panel"
                onClick={() => setGestionId(null)}
              />
              {panelGestion(gestionFila)}
            </div>
          ) : null}
        </div>
      ) : null}

      {area === "bienvenida" ? (
        <div className="liga-notificaciones__preview-layout">
          <aside className="liga-notificaciones__preview-side">
            <h3 className="liga-notificaciones__section-title">
              Correo de bienvenida
            </h3>
            <p className="liga-notificaciones__hint">
              Vista previa. Este mensaje no se ha enviado.
            </p>
            <label className="liga-notificaciones__field" htmlFor="preview-destinatario">
              <span>Destinatario</span>
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
            {preview ? (
              <>
                <div className="liga-notificaciones__preview-meta">
                  <FotoRetrato
                    fotoUrl={preview.fotoUrl}
                    nombre={preview.nombre}
                    size="md"
                  />
                  <div>
                    <p className="liga-notificaciones__nombre">{preview.nombre}</p>
                    <p className="liga-notificaciones__correo">
                      {preview.email?.trim() || "Sin correo"}
                    </p>
                    {celdaEstado(preview)}
                  </div>
                </div>
                <button
                  type="button"
                  className="liga-notificaciones__btn liga-notificaciones__btn--primary"
                  disabled={
                    !puedeEscribir ||
                    guardandoId === preview.jugadorId ||
                    !puedeEncolarBienvenida({
                      destinatario: {
                        email: preview.email,
                        perfilesConMismoCorreo: preview.perfilesConMismoCorreo,
                        preferencia: preferenciaParaPolitica(
                          preview.preferencia
                        ),
                        emailVerificado:
                          preview.preferencia?.correo_verificado_email ?? null,
                        sigueInscrito: true,
                        esSalienteDeSustitucion: false,
                      },
                      ligaPausada: config.bienvenida_pausada,
                      yaEnviado: preview.yaEnviado,
                      yaEncolado: preview.yaEncolado,
                      origen: "accion_admin",
                    }).encolar
                  }
                  onClick={() => void generarBienvenida(preview)}
                >
                  Preparar bienvenida
                </button>
              </>
            ) : (
              <p className="liga-notificaciones__hint">
                No hay inscritos para previsualizar.
              </p>
            )}
          </aside>
          <div className="liga-notificaciones__preview-frame-wrap">
            {preview ? (
              <iframe
                className="liga-notificaciones__frame"
                title="Vista previa del correo de bienvenida"
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
