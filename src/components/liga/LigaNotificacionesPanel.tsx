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
  ESTADO_VISUAL_LABEL,
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
  ESTADO_VERIFICACION_LABEL,
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
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { RivieraIdBadge } from "../jugadores/RivieraIdBadge";
import "./liga-notificaciones.css";

type Area = "destinatarios" | "bienvenida" | "historial" | "configuracion";
type Filtro =
  | "todos"
  | "habilitados"
  | "deshabilitados"
  | "sin_correo"
  | "sin_autorizacion";

const AREAS: { id: Area; label: string }[] = [
  { id: "destinatarios", label: "Destinatarios" },
  { id: "bienvenida", label: "Correo de bienvenida" },
  { id: "historial", label: "Historial de envíos" },
  { id: "configuracion", label: "Configuración" },
];

const FILTROS: { id: Filtro; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "habilitados", label: "Habilitados" },
  { id: "deshabilitados", label: "Deshabilitados" },
  { id: "sin_correo", label: "Sin correo" },
  { id: "sin_autorizacion", label: "Sin autorización" },
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

export interface LigaNotificacionesPanelProps {
  ligaId: string;
  ligaNombre: string;
  inscripciones: LigaInscripcion[];
  equipos: LigaEquipo[];
  pool: LigaJugadorPoolItem[];
  sustituciones: LigaSustitucion[];
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
  const [snapshot, setSnapshot] = useState<NotificacionesLigaSnapshot | null>(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enlacePrueba, setEnlacePrueba] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);
  const [origenDraft, setOrigenDraft] = useState<string>(ORIGENES[0].id);
  const [consentimientoDe, setConsentimientoDe] = useState<string | null>(null);
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
    const nombre = fila.nombre.toLocaleLowerCase("es");
    if (busqueda.trim() && !nombre.includes(busqueda.trim().toLocaleLowerCase("es"))) {
      return false;
    }
    if (filtro === "habilitados") return fila.visual === "habilitado";
    if (filtro === "deshabilitados") return fila.visual === "deshabilitado";
    if (filtro === "sin_correo") return fila.visual === "sin_correo";
    if (filtro === "sin_autorizacion") return fila.visual === "sin_autorizacion";
    return true;
  });

  const conteo = contarDestinatarios(
    filas.map(
      (fila) =>
        preferenciaEfectiva(preferenciaParaPolitica(fila.preferencia))
          .adminHabilitado
    )
  );
  const listos = filas.filter((fila) => fila.visual === "habilitado").length;
  const config: ConfigNotificacionLiga = snapshot?.config ?? {
    bienvenida_pausada: true,
    modo_prueba: true,
    modo_operacion: "manual",
  };
  const puedeEscribir = Boolean(
    snapshot?.disponible && snapshot?.escriturasActivas
  );
  const preview = filas.find((fila) => fila.jugadorId === previewId) ?? filas[0] ?? null;

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
    setConsentimientoDe(null);
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

  function controles(fila: FilaDestinatario) {
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
      <div className="liga-notificaciones__controles">
        <label className="liga-notificaciones__switch">
          <input
            type="checkbox"
            checked={preferencia.adminHabilitado}
            disabled={ocupado || !puedeEscribir}
            onChange={(event) =>
              void cambiarHabilitacion(fila, event.target.checked)
            }
          />
          Autorización del club
        </label>
        <span className="liga-notificaciones__badge">
          {ESTADO_VISUAL_LABEL[fila.visual]}
        </span>
        <span className="liga-notificaciones__badge">
          {ESTADO_VERIFICACION_LABEL[fila.verificacion]}
        </span>
        {puedeVerificar.solicitar ? (
          <button
            type="button"
            className="liga-notificaciones__accion"
            disabled={ocupado || !puedeEscribir}
            onClick={() => void pedirVerificacion(fila)}
          >
            Solicitar verificación
          </button>
        ) : null}
        {fila.verificacion === "pendiente_verificacion" ||
        fila.verificacion === "enlace_vencido" ? (
          <p className="liga-notificaciones__nota">
            Correo registrado, pendiente de verificación por enlace.
          </p>
        ) : null}
        {preferencia.consentimientoEstado === "autorizado" ? (
          <button
            type="button"
            className="liga-notificaciones__accion"
            disabled={ocupado || !puedeEscribir}
            onClick={() =>
              void guardarFila(fila, { consentimiento_estado: "revocado" }, () =>
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
          <button
            type="button"
            className="liga-notificaciones__accion"
            disabled={ocupado || !puedeEscribir}
            onClick={() => setConsentimientoDe(fila.jugadorId)}
          >
            Registrar consentimiento
          </button>
        )}
        {consentimientoDe === fila.jugadorId ? (
          <div className="liga-notificaciones__controles">
            <p className="liga-notificaciones__nota">
              El correo y la inscripción no cuentan como consentimiento.
              Regístralo solo si tienes una constancia verificable.
            </p>
            <select
              className="liga-notificaciones__origen"
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
            <button
              type="button"
              className="liga-notificaciones__accion"
              disabled={ocupado || !puedeEscribir}
              onClick={() => void confirmarConsentimiento(fila)}
            >
              Confirmar consentimiento
            </button>
          </div>
        ) : null}
        {decision.encolar ? (
          <button
            type="button"
            className="liga-notificaciones__accion"
            disabled={ocupado || !puedeEscribir}
            onClick={() => void generarBienvenida(fila)}
          >
            Generar bienvenida
          </button>
        ) : null}
      </div>
    );
  }

  function identidad(fila: FilaDestinatario) {
    return (
      <div className="liga-notificaciones__identidad">
        <JugadorAvatar fotoUrl={fila.fotoUrl} nombre={fila.nombre} size="md" />
        <div>
          <p className="liga-notificaciones__nombre">{fila.nombre}</p>
          {fila.rivieraId ? <RivieraIdBadge rivieraId={fila.rivieraId} /> : null}
          <p className="liga-notificaciones__correo">
            {fila.email?.trim() || "Sin correo"}
          </p>
        </div>
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

  return (
    <section className="liga-notificaciones" aria-label="Notificaciones de la liga">
      <p className="liga-notificaciones__intro">
        Nadie recibe un correo hasta que lo autorices en esta liga, exista un
        consentimiento documentado y el jugador confirme su dirección con el
        enlace. Desde aquí no se marca como verificado a mano. Los envíos reales
        están apagados.
      </p>
      {aviso ? (
        <p className="liga-notificaciones__aviso" role="status">
          {aviso}
        </p>
      ) : null}
      {enlacePrueba ? (
        <p className="liga-notificaciones__aviso liga-notificaciones__aviso--simulado">
          <span>Enlace de prueba (solo entorno local): </span>
          <a href={enlacePrueba} rel="noreferrer">
            abrir verificación
          </a>
          <button
            type="button"
            className="liga-notificaciones__link-btn"
            onClick={() => {
              void navigator.clipboard?.writeText(enlacePrueba);
              confirmar("Enlace de prueba copiado.");
            }}
          >
            Copiar
          </button>
        </p>
      ) : null}
      {!cargando && snapshot && !snapshot.disponible ? (
        <p className="liga-notificaciones__nota">
          La migración de notificaciones todavía no está aplicada. Puedes
          revisar la lista, pero los cambios no se guardarán y no se enviará
          ningún correo.
        </p>
      ) : null}
      {!cargando && snapshot?.disponible && !snapshot.escriturasActivas ? (
        <p className="liga-notificaciones__nota" role="status">
          Vista de revisión: las funciones de envío y guardado siguen
          pendientes de activación en el servidor. Puedes explorar
          destinatarios, pestañas y la vista previa del correo sin generar
          escrituras ni correos.
        </p>
      ) : null}
      <div className="liga-notificaciones__areas" role="tablist" aria-label="Áreas de notificaciones">
        {AREAS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="liga-notificaciones__area"
            aria-pressed={area === item.id}
            onClick={() => setArea(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {area === "destinatarios" ? (
        <div>
          <div className="liga-notificaciones__toolbar">
            <input
              className="liga-notificaciones__search"
              type="search"
              value={busqueda}
              placeholder="Buscar por nombre"
              aria-label="Buscar jugador por nombre"
              onChange={(event) => setBusqueda(event.target.value)}
            />
          </div>
          <div className="liga-notificaciones__filters">
            {FILTROS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="liga-notificaciones__filter"
                aria-pressed={filtro === item.id}
                onClick={() => setFiltro(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="liga-notificaciones__counts">
            <span className="liga-notificaciones__count">
              {conteo.seleccionados} seleccionados
            </span>
            <span className="liga-notificaciones__count">
              {conteo.excluidos} excluidos
            </span>
          </p>
          {visibles.length === 0 ? (
            <p className="liga-notificaciones__nota">
              No hay jugadores en este filtro.
            </p>
          ) : isMobile ? (
            <div className="liga-notificaciones__cards">
              {visibles.map((fila) => (
                <article key={fila.jugadorId} className="liga-notificaciones__card">
                  {identidad(fila)}
                  {controles(fila)}
                </article>
              ))}
            </div>
          ) : (
            <table className="liga-notificaciones__table liga-notificaciones__table--visible">
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Estado</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((fila) => (
                  <tr key={fila.jugadorId}>
                    <td>{identidad(fila)}</td>
                    <td>{ESTADO_VISUAL_LABEL[fila.visual]}</td>
                    <td>{controles(fila)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {area === "bienvenida" ? (
        <div className="liga-notificaciones__preview">
          <p className="liga-notificaciones__nota">Vista previa. Este mensaje no se ha enviado.</p>
          <label className="liga-notificaciones__meta" htmlFor="preview-destinatario">
            Destinatario de la vista previa
          </label>
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
          {preview ? (
            <iframe
              className="liga-notificaciones__frame"
              title="Vista previa del correo de bienvenida"
              sandbox=""
              srcDoc={previewHtml}
            />
          ) : (
            <p className="liga-notificaciones__nota">No hay inscritos para previsualizar.</p>
          )}
          {preview ? (
            <button
              type="button"
              className="liga-notificaciones__accion"
              disabled={
                !puedeEscribir ||
                guardandoId === preview.jugadorId ||
                !puedeEncolarBienvenida({
                  destinatario: {
                    email: preview.email,
                    perfilesConMismoCorreo: preview.perfilesConMismoCorreo,
                    preferencia: preferenciaParaPolitica(preview.preferencia),
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
              Preparar bienvenida de este jugador
            </button>
          ) : null}
        </div>
      ) : null}

      {area === "historial" ? (
        <div className="liga-notificaciones__historial">
          {(snapshot?.cola.length ?? 0) === 0 && (snapshot?.historial.length ?? 0) === 0 ? (
            <p className="liga-notificaciones__nota">
              Todavía no hay envíos. Preparar una bienvenida no entrega un correo.
            </p>
          ) : (
            <div className="liga-notificaciones__cards">
              {(snapshot?.historial ?? []).map((item) => (
                <article key={item.id} className="liga-notificaciones__card">
                  <p className="liga-notificaciones__nombre">
                    {filas.find((fila) => fila.jugadorId === item.liga_jugador_id)?.nombre ?? "Jugador"}
                  </p>
                  <p className="liga-notificaciones__meta">Bienvenida · {item.estado}</p>
                  <p className="liga-notificaciones__meta">
                    {new Date(item.created_at).toLocaleString("es-MX")} · {item.attempts} intentos
                  </p>
                  <p className="liga-notificaciones__meta">
                    {item.proveedor_estado
                      ? `Proveedor: ${item.proveedor_estado}`
                      : motivoVisible(item.motivo)}
                  </p>
                </article>
              ))}
              {(snapshot?.cola ?? []).map((item, index) => (
                <article
                  key={`${item.liga_jugador_id}-${item.estado}-${index}`}
                  className="liga-notificaciones__card"
                >
                  <p className="liga-notificaciones__nombre">
                    {filas.find((fila) => fila.jugadorId === item.liga_jugador_id)?.nombre ?? "Jugador"}
                  </p>
                  <p className="liga-notificaciones__meta">Bienvenida · {item.estado}</p>
                  <p className="liga-notificaciones__meta">{item.attempts} intentos · En cola</p>
                  <p className="liga-notificaciones__meta">
                    {item.motivo ? motivoVisible(item.motivo) : "Sin envío al proveedor"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {area === "configuracion" ? (
        <div className="liga-notificaciones__config">
          <p className="liga-notificaciones__count">
            {listos} jugadores cumplen todas las condiciones.{" "}
            {filas.length - listos} quedan excluidos.
          </p>

          <fieldset className="liga-notificaciones__modo">
            <legend className="liga-notificaciones__modo-legend">
              Modo de operación
            </legend>
            <label className="liga-notificaciones__switch">
              <input
                type="radio"
                name="liga-notif-modo"
                checked={config.modo_operacion === "manual"}
                disabled={guardandoId === "config" || !puedeEscribir}
                onChange={() =>
                  void cambiarConfig({
                    ...config,
                    modo_operacion: "manual",
                  })
                }
              />
              Manual (predeterminado)
            </label>
            <label className="liga-notificaciones__switch">
              <input
                type="radio"
                name="liga-notif-modo"
                checked={config.modo_operacion === "automatico"}
                disabled={guardandoId === "config" || !puedeEscribir}
                onChange={() =>
                  void cambiarConfig({
                    ...config,
                    modo_operacion: "automatico",
                  })
                }
              />
              Automático (opcional)
            </label>
            <p className="liga-notificaciones__nota">
              {config.modo_operacion === "manual"
                ? "En Manual eliges destinatarios, revisas la vista previa y confirmas cada envío. No hay eventos automáticos por inscripciones."
                : "Automático queda guardado, pero los envíos reales automáticos aún no están procesados. Hasta la activación expresa del producto no se encola ni se envía nada por eventos deportivos."}
            </p>
          </fieldset>

          <label className="liga-notificaciones__switch">
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
            Bienvenida activa para quien ya esté autorizado
          </label>
          <label className="liga-notificaciones__switch">
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
            Modo de prueba
          </label>
          <p className="liga-notificaciones__nota">
            El modo de prueba no envía correos y no entrega enlaces de
            verificación al panel. Los tokens solo aparecen en entornos locales
            con simulación de servidor expresamente activada. Los envíos reales
            siguen apagados hasta una autorización aparte. No hay envío masivo.
            Consentimiento, correo verificado, pausa e idempotencia aplican en
            ambos modos.
          </p>
        </div>
      ) : null}
    </section>
  );
};

export default LigaNotificacionesPanel;
