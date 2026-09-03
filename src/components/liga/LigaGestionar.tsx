import { useClubModeEyebrow } from "../../club-experience";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMobileViewport } from "../../hooks/useMobileViewport";
import {
  calendarioDesactualizado,
  tieneJornadasEnCurso,
} from "../../lib/liga/calendario";
import type {
  LigaDetalle,
  LigaEquipo,
  LigaJornadaEstado,
  LigaJugadorPoolItem,
} from "../../lib/liga/types";
import { ligaModalidadLabel } from "../../lib/liga/types";
import {
  isEquiposModalidad,
  isParejasFijasPlayoffs,
} from "../../lib/liga/ligaModalidad";
import { PLAYOFFS_MIN_TEAMS } from "../../lib/liga/parejasFijasPlayoffsFixture";
import { copyTextToClipboard } from "../../lib/clipboard/copyTextToClipboard";
import { formatFechaLegible, dateInputValue } from "../../lib/liga/programacion";
import { buildSharePublicOgUrlFromPlayUrl } from "../../lib/retaAbierta/shareOgUrl";
import { JugadorCategoriaBadge } from "../jugadores/JugadorCategoriaBadge";
import { RivieraIdBadge } from "../jugadores/RivieraIdBadge";
import { navigateJugadoresLista } from "../jugadores/jugadoresGeneroNav";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../../lib/rivieraJugadores/constants";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import "../jugadores/riviera-jugadores.css";
import {
  createEquipoLiga,
  deleteEquipoLiga,
  deleteLiga,
  desinscribirJugador,
  finishLiga,
  resyncAllCompletedLigaJornadasCareer,
  resyncLigaPodioCareer,
  getJugadoresOrganizador,
  getLigaById,
  inscribirJugador,
  publicLigaUrl,
  regenerarCalendarioLiga,
  resetLiga,
  startLiga,
  updateLigaNombre,
} from "../../services/ligaService";
import { Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import { ActionBar } from "../platform/ActionBar";
import {
  ModeEventHeader,
  ModeSectionPanel,
  ModeSectionTabs,
  MobileStickyActionFooter,
} from "../platform";
import {
  ligaJornadaPath,
  navigateLiga,
} from "./ligaNav";
import { LigaPageShell } from "./LigaPageShell";
import "./liga-page.css";

interface LigaGestionarProps {
  ligaId: string;
}

type LigaGestionarTab = "jugadores" | "parejas" | "jornadas";

export function estadoLigaLabel(estado: LigaDetalle["estado"]): string {
  switch (estado) {
    case "upcoming":
      return "Próxima";
    case "in_progress":
      return "En curso";
    case "completed":
      return "Finalizada";
    default:
      return estado;
  }
}

export function estadoLigaStatusVariant(
  estado: LigaDetalle["estado"]
): "live" | "pending" | "gold" | "muted" {
  switch (estado) {
    case "in_progress":
      return "live";
    case "completed":
      return "gold";
    default:
      return "pending";
  }
}

/**
 * Tabs de LigaGestionar — orden obligatorio Jugadores/Parejas → Jornadas
 * (docs/GAME-MODES-UI-ARCHITECTURE.md, Fase 2A punto 3). Extraída para
 * poder testear el orden/textos sin renderizar el componente completo.
 */
export function buildLigaGestionarTabs(
  esParejasFijas: boolean
): { id: string; label: string }[] {
  return esParejasFijas
    ? [
        { id: "parejas", label: "Parejas" },
        { id: "jornadas", label: "Jornadas" },
      ]
    : [
        { id: "jugadores", label: "Jugadores" },
        { id: "jornadas", label: "Jornadas" },
      ];
}

export function jornadaEstadoLabel(estado: LigaJornadaEstado): string {
  switch (estado) {
    case "upcoming":
      return "Próxima";
    case "in_progress":
      return "En curso";
    case "completed":
      return "Completada";
    default:
      return estado;
  }
}

export function ligaEstadoStatusDisplayLabel(
  estado: LigaDetalle["estado"]
): string {
  const label = estadoLigaLabel(estado);
  return estado === "in_progress" ? `▶ ${label}` : label;
}

function jornadaEstadoIcon(estado: LigaJornadaEstado): string {
  switch (estado) {
    case "completed":
      return "✅";
    case "in_progress":
      return "▶";
    default:
      return "🕒";
  }
}

function equipoNombre(e: LigaEquipo): string {
  return (
    e.nombre?.trim() ||
    `${e.jugador1?.nombre ?? "?"} / ${e.jugador2?.nombre ?? "?"}`
  );
}

const LIGA_DELETE_CONFIRM_PHRASE = "ELIMINAR";

export const LigaGestionar: React.FC<LigaGestionarProps> = ({ ligaId }) => {
  const modeEyebrow = useClubModeEyebrow();
  const isMobile = useMobileViewport(767);
  const [detalle, setDetalle] = useState<LigaDetalle | null>(null);
  const [jugadoresPool, setJugadoresPool] = useState<LigaJugadorPoolItem[]>([]);
  const [tab, setTab] = useState<LigaGestionarTab>("jugadores");
  const [seleccionParejaIds, setSeleccionParejaIds] = useState<string[]>([]);
  const [parejaGridSearch, setParejaGridSearch] = useState("");
  const [parejaCategoryFilter, setParejaCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingNombre, setEditingNombre] = useState(false);
  const [nombreDraft, setNombreDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmDraft, setDeleteConfirmDraft] = useState("");
  const toolsRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  // Generación de carga: si un load() más nuevo arrancó mientras uno viejo
  // seguía en vuelo (incluido el callback de sync en segundo plano de uno
  // viejo), la respuesta vieja se descarta en vez de pisar el estado más
  // reciente.
  const loadSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    const isStale = () => !mountedRef.current || loadSeqRef.current !== seq;

    setLoading(true);
    setError(null);
    try {
      // getJugadoresOrganizador ya responde con el pool actual sin esperar
      // ninguna reconciliación con el registro Riviera; si hiciera falta
      // sincronizar algo (jugador nuevo, cambio de nombre, etc.), esa
      // escritura corre en segundo plano y este callback repinta solo el
      // pool cuando termina — nunca bloquea el render inicial ni recarga
      // el resto de la liga.
      const [d, pool] = await Promise.all([
        getLigaById(ligaId),
        getJugadoresOrganizador((updated) => {
          if (isStale()) return;
          setJugadoresPool(updated);
        }),
      ]);
      if (isStale()) return;
      setDetalle(d);
      setJugadoresPool(pool);
      setNombreDraft(d.nombre);
      setEditingNombre(false);
      if (isEquiposModalidad(d.modalidad)) {
        setTab((prev) => (prev === "jugadores" ? "parejas" : prev));
      }
    } catch (e) {
      if (isStale()) return;
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [ligaId]);

  useEffect(() => {
    load();
  }, [load]);

  const autoJornadasResyncRef = useRef<string | null>(null);

  // Al abrir la liga, reparar historial de jornadas completed (Cuadra/César +50).
  useEffect(() => {
    if (!detalle?.id) return;
    const completed = detalle.jornadas.filter((j) => j.estado === "completed");
    if (completed.length === 0) return;
    if (autoJornadasResyncRef.current === detalle.id) return;

    const ligaKey = detalle.id;
    let cancelled = false;
    void (async () => {
      try {
        const outcome = await resyncAllCompletedLigaJornadasCareer(ligaKey);
        if (cancelled) return;
        if (outcome.careerSyncOk) {
          autoJornadasResyncRef.current = ligaKey;
          if (outcome.repaired > 0) {
            setMessage(
              outcome.careerSyncMessage ||
                "Historial Riviera de jornadas sincronizado."
            );
          }
        } else if (outcome.careerSyncMessage) {
          setError(outcome.careerSyncMessage);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[liga] auto-resync jornadas career:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [detalle]);

  useEffect(() => {
    if (!optionsOpen) return;
    const closeMenus = (event: MouseEvent) => {
      if (toolsRef.current?.contains(event.target as Node)) return;
      setOptionsOpen(false);
    };
    document.addEventListener("mousedown", closeMenus);
    return () => document.removeEventListener("mousedown", closeMenus);
  }, [optionsOpen]);

  useEffect(() => {
    if (!shareOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShareOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [shareOpen]);

  const inscritosIds = useMemo(
    () => new Set(detalle?.inscripciones.map((i) => i.jugador_id) ?? []),
    [detalle]
  );

  const esParejasFijas = detalle ? isEquiposModalidad(detalle.modalidad) : false;
  const esPlayoffs = detalle
    ? isParejasFijasPlayoffs(detalle.modalidad)
    : false;

  const jugadoresEnEquipo = useMemo(() => {
    const s = new Set<string>();
    for (const e of detalle?.equipos ?? []) {
      s.add(e.jugador1_id);
      s.add(e.jugador2_id);
    }
    return s;
  }, [detalle]);

  const jugadoresDisponiblesPareja = useMemo(
    () => jugadoresPool.filter((j) => !jugadoresEnEquipo.has(j.id)),
    [jugadoresPool, jugadoresEnEquipo]
  );

  const jugadoresDisponiblesParejaFiltrados = useMemo(() => {
    const q = parejaGridSearch.trim().toLowerCase();
    return jugadoresDisponiblesPareja.filter((j) => {
      if (parejaCategoryFilter && j.categoria !== parejaCategoryFilter) {
        return false;
      }
      if (!q) return true;
      const riv = (j.riviera_id ?? "").toLowerCase();
      return j.nombre.toLowerCase().includes(q) || riv.includes(q);
    });
  }, [jugadoresDisponiblesPareja, parejaGridSearch, parejaCategoryFilter]);

  const parejaSeleccionCompleta = seleccionParejaIds.length === 2;

  const registrarPareja = async (jugador1_id: string, jugador2_id: string) => {
    setBusy(true);
    setError(null);
    try {
      await createEquipoLiga(ligaId, { jugador1_id, jugador2_id });
      setSeleccionParejaIds([]);
      setMessage("Pareja registrada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setSeleccionParejaIds([]);
    } finally {
      setBusy(false);
    }
  };

  const toggleJugadorEnPareja = (jugadorId: string) => {
    if (busy) return;
    if (seleccionParejaIds.includes(jugadorId)) {
      setSeleccionParejaIds((prev) => prev.filter((id) => id !== jugadorId));
      return;
    }
    if (seleccionParejaIds.length === 0) {
      setSeleccionParejaIds([jugadorId]);
      return;
    }
    if (seleccionParejaIds.length === 1) {
      const jugador1_id = seleccionParejaIds[0]!;
      setSeleccionParejaIds([jugador1_id, jugadorId]);
      void registrarPareja(jugador1_id, jugadorId);
    }
  };

  const limpiarSeleccionPareja = () => {
    if (busy) return;
    setSeleccionParejaIds([]);
  };

  const handleDeleteEquipo = async (equipoId: string) => {
    if (!window.confirm("¿Borrar esta pareja?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteEquipoLiga(equipoId);
      setMessage("Pareja borrada.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };
  const calendarioStale = useMemo(
    () => (detalle ? calendarioDesactualizado(detalle) : false),
    [detalle]
  );

  const jornadasActivas = useMemo(
    () => (detalle ? tieneJornadasEnCurso(detalle) : false),
    [detalle]
  );

  const puedeIniciar = useMemo(() => {
    if (!detalle || detalle.estado === "completed") return false;
    if (detalle.jornadas.length > 0) return false;
    if (isParejasFijasPlayoffs(detalle.modalidad)) {
      return detalle.equipos.length >= PLAYOFFS_MIN_TEAMS;
    }
    if (isEquiposModalidad(detalle.modalidad)) {
      return detalle.equipos.length >= 3;
    }
    const n = detalle.inscripciones.length;
    return n >= 4 && n % 2 === 0;
  }, [detalle]);

  const puedeRegenerar = useMemo(() => {
    if (!detalle || detalle.estado === "completed") return false;
    // Calendario editable solo antes de arrancar; en curso → «Reiniciar liga».
    if (detalle.estado === "in_progress") return false;
    if (isParejasFijasPlayoffs(detalle.modalidad)) {
      return detalle.equipos.length >= PLAYOFFS_MIN_TEAMS;
    }
    if (isEquiposModalidad(detalle.modalidad)) {
      return detalle.equipos.length >= 3;
    }
    const n = detalle.inscripciones.length;
    return n >= 4 && n % 2 === 0;
  }, [detalle]);

  const puedeFinalizarLiga = useMemo(() => {
    if (!detalle || detalle.estado !== "in_progress") return false;
    return (
      detalle.jornadas.length > 0 &&
      detalle.jornadas.every((j) => j.estado === "completed")
    );
  }, [detalle]);

  const ligaEditable = detalle?.estado !== "completed";

  const ligaPublicUrl = useMemo(() => publicLigaUrl(ligaId), [ligaId]);
  const ligaShareUrl = useMemo(
    () => buildSharePublicOgUrlFromPlayUrl(ligaPublicUrl) || ligaPublicUrl,
    [ligaPublicUrl]
  );

  const jornadaProgress = useMemo(() => {
    const jornadas = detalle?.jornadas ?? [];
    if (jornadas.length === 0) return null;
    const total = jornadas.length;
    const completadas = jornadas.filter((j) => j.estado === "completed").length;
    return {
      total,
      completadas,
      percent: Math.round((completadas / total) * 100),
    };
  }, [detalle?.jornadas]);

  const toggleInscripcion = async (jugadorId: string, inscrito: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (inscrito) {
        await desinscribirJugador(ligaId, jugadorId);
        setMessage("Jugador desinscrito.");
      } else {
        await inscribirJugador(ligaId, jugadorId);
        setMessage("Jugador inscrito.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleStartLiga = async () => {
    setBusy(true);
    setError(null);
    try {
      await startLiga(ligaId);
      setMessage("Liga iniciada. Jornadas generadas.");
      await load();
      setTab("jornadas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNombre = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!detalle) return;
    const next = nombreDraft.trim();
    if (!next) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (next === detalle.nombre) {
      setEditingNombre(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateLigaNombre(ligaId, next);
      setDetalle((prev) => (prev ? { ...prev, nombre: updated.nombre } : prev));
      setNombreDraft(updated.nombre);
      setEditingNombre(false);
      setMessage("Nombre actualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo renombrar");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelNombre = () => {
    if (detalle) setNombreDraft(detalle.nombre);
    setEditingNombre(false);
  };

  const handleRegenerar = async () => {
    const msg = jornadasActivas
      ? "Se borrarán TODAS las jornadas y resultados. ¿Regenerar calendario con los inscritos actuales?"
      : "¿Regenerar el calendario con los inscritos actuales?";
    if (!window.confirm(msg)) return;

    const resetPuntos =
      jornadasActivas &&
      window.confirm("¿También reiniciar el ranking de puntos a cero?");

    setBusy(true);
    setError(null);
    try {
      await regenerarCalendarioLiga(ligaId, { resetPuntos });
      setMessage("Calendario regenerado.");
      await load();
      setTab("jornadas");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLiga = async () => {
    if (!detalle) return;
    if (
      deleteConfirmDraft.trim().toUpperCase() !== LIGA_DELETE_CONFIRM_PHRASE
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteLiga(ligaId);
      setDeleteConfirmOpen(false);
      setDeleteConfirmDraft("");
      navigateLiga("/liga");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setBusy(false);
    }
  };

  const openDeleteConfirm = () => {
    setOptionsOpen(false);
    setShareOpen(false);
    setDeleteConfirmDraft("");
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    if (busy) return;
    setDeleteConfirmOpen(false);
    setDeleteConfirmDraft("");
  };

  const handleResetLiga = async () => {
    if (
      !window.confirm(
        "¿Reiniciar la liga por completo? Se eliminarán jornadas, partidos y puntos. Volverás al estado «Próxima»."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetLiga(ligaId);
      setMessage("Liga reiniciada. Puedes editar inscritos e iniciar de nuevo.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleFinishLiga = async () => {
    if (!window.confirm("¿Finalizar la liga?")) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await finishLiga(ligaId);
      if (outcome.careerSyncOk === false) {
        setError(
          outcome.careerSyncMessage ||
            "La liga se cerró, pero no se registró el historial Riviera. Usa «Sincronizar historial» para reintentar."
        );
        setMessage("Liga finalizada; historial Riviera pendiente.");
      } else {
        setMessage("Liga finalizada.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const handleResyncLigaCareer = async () => {
    if (
      !window.confirm(
        "¿Sincronizar el historial Riviera?\n\nSe registrarán ganadores de jornadas (+50) y podio faltantes sin reabrir la liga."
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const jornadasOutcome = await resyncAllCompletedLigaJornadasCareer(ligaId);
      let podioOk = true;
      let podioMsg = "";
      if (detalle?.estado === "completed") {
        const podio = await resyncLigaPodioCareer(ligaId);
        podioOk = podio.careerSyncOk !== false;
        podioMsg = podio.careerSyncMessage || "";
      }
      if (!jornadasOutcome.careerSyncOk || !podioOk) {
        setError(
          [jornadasOutcome.careerSyncMessage, podioMsg]
            .filter(Boolean)
            .join(" · ") ||
            "No se pudo sincronizar el historial Riviera."
        );
        setMessage("Historial Riviera pendiente.");
      } else {
        autoJornadasResyncRef.current = ligaId;
        setMessage(
          jornadasOutcome.careerSyncMessage ||
            "Historial Riviera sincronizado (jornadas y puntos)."
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !detalle) {
    return (
      <LigaPageShell>
        <p>Cargando…</p>
      </LigaPageShell>
    );
  }

  if (!detalle) {
    return (
      <LigaPageShell>
        <p className="liga-error">{error ?? "Liga no encontrada"}</p>
        <Button type="button" variant="secondary" onClick={() => navigateLiga("/liga")}>
          Volver
        </Button>
      </LigaPageShell>
    );
  }

  const ligaTabs = buildLigaGestionarTabs(esParejasFijas);

  const iniciarLigaTitle = !puedeIniciar
    ? esParejasFijas
      ? "Necesitas al menos 3 parejas inscritas"
      : "Necesitas al menos 4 inscritos y cantidad par"
    : undefined;

  // CTA primaria real según el estado actual de la liga (misma condición de
  // siempre: sin jornadas generadas y liga no finalizada). En móvil se
  // relocaliza al sticky footer; en desktop sigue en la barra de acciones.
  // Nunca se renderizan ambas instancias a la vez (docs/GAME-MODES-UI-ARCHITECTURE.md
  // Sección 6.6 y Fase 2A punto 5).
  const ctaIniciarVisible =
    detalle.estado !== "completed" && detalle.jornadas.length === 0;
  const stickyLabel = isMobile && ctaIniciarVisible ? "Iniciar liga" : null;

  const handleCopyShareLink = async () => {
    const ok = await copyTextToClipboard(ligaShareUrl);
    if (!ok) {
      setError("No se pudo copiar el enlace.");
      return;
    }
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 2000);
  };

  const whatsAppShareHref = `https://wa.me/?text=${encodeURIComponent(ligaShareUrl)}`;

  return (
    <LigaPageShell
      className={[
        "liga-gestionar-a11y",
        stickyLabel ? "has-mobile-sticky-action" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ActionBar className="liga-toolbar riviera-back-toolbar">
        <Button type="button" variant="back" onClick={() => navigateLiga("/liga")}>
          ← Ligas
        </Button>
      </ActionBar>

      <div className="liga-gestionar-header">
        <div className="liga-gestionar-header__tools" ref={toolsRef}>
          <button
            type="button"
            className="liga-gestionar-tool-btn"
            aria-expanded={shareOpen}
            aria-controls="liga-gestionar-share-panel"
            aria-label="Compartir enlace público"
            title="Compartir enlace público"
            onClick={() => {
              setShareOpen(true);
              setOptionsOpen(false);
            }}
          >
            <TablerIcon name="share" size={20} aria-hidden={false} />
            <span>Compartir</span>
          </button>
          <button
            type="button"
            className="liga-gestionar-tool-btn"
            aria-expanded={optionsOpen}
            aria-controls="liga-gestionar-options-menu"
            aria-haspopup="menu"
            aria-label="Configuración de la liga"
            title="Configuración de la liga"
            onClick={() => {
              setOptionsOpen((open) => !open);
              setShareOpen(false);
            }}
          >
            <TablerIcon name="dots-vertical" size={20} aria-hidden={false} />
            <span>Opciones</span>
          </button>
          {optionsOpen ? (
            <div
              id="liga-gestionar-options-menu"
              className="liga-gestionar-options"
              role="menu"
              aria-label="Configuración de la liga"
            >
              <button
                type="button"
                className="liga-gestionar-options__item"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setNombreDraft(detalle.nombre);
                  setEditingNombre(true);
                  setOptionsOpen(false);
                }}
              >
                <TablerIcon name="pencil" size={18} aria-hidden={false} />
                Renombrar liga
              </button>
              {ligaEditable ? (
                <button
                  type="button"
                  className="liga-gestionar-options__item"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    setOptionsOpen(false);
                    void handleResetLiga();
                  }}
                >
                  <TablerIcon name="refresh" size={18} aria-hidden={false} />
                  Reiniciar liga
                </button>
              ) : null}
              <button
                type="button"
                className="liga-gestionar-options__item liga-gestionar-options__item--danger"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  openDeleteConfirm();
                }}
              >
                <TablerIcon name="trash" size={18} aria-hidden={false} />
                Eliminar liga
              </button>
            </div>
          ) : null}
        </div>

        <ModeEventHeader
          className="liga-event-header"
          eyebrow={modeEyebrow}
          title={`Liga: ${detalle.nombre}`}
          titleContent={
            editingNombre ? (
              <form className="liga-nombre-edit" onSubmit={handleSaveNombre}>
                <span className="liga-nombre-edit__prefix">Liga:</span>
                <input
                  id="liga-edit-nombre"
                  className="liga-nombre-edit__input"
                  value={nombreDraft}
                  onChange={(ev) => setNombreDraft(ev.target.value)}
                  aria-label="Nombre de la liga"
                  autoFocus
                  disabled={busy}
                  maxLength={120}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={busy || !nombreDraft.trim()}
                >
                  Guardar
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={handleCancelNombre}
                >
                  Cancelar
                </Button>
              </form>
            ) : (
              <div className="liga-nombre-edit liga-nombre-edit--view">
                <h2 className="mode-event-header__title">Liga: {detalle.nombre}</h2>
                <button
                  type="button"
                  className="liga-nombre-edit__pencil"
                  aria-label="Editar nombre de la liga"
                  title="Editar nombre"
                  disabled={busy}
                  onClick={() => {
                    setNombreDraft(detalle.nombre);
                    setEditingNombre(true);
                  }}
                >
                  <TablerIcon name="pencil" size={14} aria-hidden={false} />
                </button>
              </div>
            )
          }
          modality={ligaModalidadLabel(detalle.modalidad)}
          statusLabel={ligaEstadoStatusDisplayLabel(detalle.estado)}
          statusVariant={estadoLigaStatusVariant(detalle.estado)}
          summary={`${
            esParejasFijas
              ? `${detalle.equipos.length} parejas`
              : `${detalle.inscripciones.length} inscritos`
          }${
            esParejasFijas
              ? ` · ${detalle.vueltas} vuelta${detalle.vueltas > 1 ? "s" : ""}`
              : ""
          }`}
        />
      </div>

      {shareOpen ? (
        <div
          id="liga-gestionar-share-panel"
          className="liga-gestionar-modal-backdrop"
          role="presentation"
          onClick={() => setShareOpen(false)}
        >
          <div
            className="liga-gestionar-share-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="liga-gestionar-share-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="liga-gestionar-share-modal__close"
              aria-label="Cerrar"
              onClick={() => setShareOpen(false)}
            >
              ×
            </button>
            <h2
              id="liga-gestionar-share-title"
              className="liga-gestionar-share-modal__title"
            >
              Comparte esta liga
            </h2>
            <p className="liga-gestionar-share-modal__lead">
              Envía este enlace para que cualquiera pueda ver el ranking y las
              jornadas (sin poder editar).
            </p>
            <label className="liga-gestionar-share-modal__url-label" htmlFor="liga-share-url">
              Enlace público
            </label>
            <input
              id="liga-share-url"
              className="liga-gestionar-share-modal__url"
              type="text"
              readOnly
              value={ligaShareUrl}
              onFocus={(event) => event.currentTarget.select()}
            />
            <div className="liga-gestionar-share-modal__actions">
              <button
                type="button"
                className="liga-gestionar-share-modal__btn liga-gestionar-share-modal__btn--primary"
                onClick={() => void handleCopyShareLink()}
              >
                {shareCopied ? "¡Enlace copiado! ✅" : "Copiar enlace"}
              </button>
              <a
                className="liga-gestionar-share-modal__btn liga-gestionar-share-modal__btn--whatsapp"
                href={whatsAppShareHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                Enviar por WhatsApp
              </a>
              <a
                className="liga-gestionar-share-modal__btn liga-gestionar-share-modal__btn--secondary"
                href={ligaPublicUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver vista pública
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmOpen ? (
        <div
          id="liga-gestionar-delete-panel"
          className="liga-gestionar-modal-backdrop"
          role="presentation"
          onClick={closeDeleteConfirm}
        >
          <div
            className="liga-gestionar-share-modal liga-gestionar-danger-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="liga-gestionar-delete-title"
            aria-describedby="liga-gestionar-delete-lead"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="liga-gestionar-share-modal__close"
              aria-label="Cerrar"
              disabled={busy}
              onClick={closeDeleteConfirm}
            >
              ×
            </button>
            <div className="liga-gestionar-danger-modal__lock" aria-hidden>
              <TablerIcon name="lock" size={22} />
            </div>
            <h2
              id="liga-gestionar-delete-title"
              className="liga-gestionar-share-modal__title"
            >
              Eliminar liga
            </h2>
            <p
              id="liga-gestionar-delete-lead"
              className="liga-gestionar-share-modal__lead"
            >
              Se borrarán jornadas, partidos, parejas y ranking de{" "}
              <strong>{detalle.nombre}</strong>. Esta acción no se puede deshacer.
            </p>
            <label
              className="liga-gestionar-danger-modal__label"
              htmlFor="liga-delete-confirm-input"
            >
              Escribe <strong>{LIGA_DELETE_CONFIRM_PHRASE}</strong> para confirmar
            </label>
            <input
              id="liga-delete-confirm-input"
              name="liga-delete-confirm"
              className="liga-gestionar-danger-modal__input"
              type="text"
              value={deleteConfirmDraft}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
              aria-label={`Confirmar escribiendo ${LIGA_DELETE_CONFIRM_PHRASE}`}
              onChange={(event) => setDeleteConfirmDraft(event.target.value)}
            />
            <div className="liga-gestionar-share-modal__actions liga-gestionar-danger-modal__actions">
              <button
                type="button"
                className="liga-gestionar-share-modal__btn liga-gestionar-share-modal__btn--secondary"
                disabled={busy}
                onClick={closeDeleteConfirm}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="liga-gestionar-share-modal__btn liga-gestionar-danger-modal__confirm"
                disabled={
                  busy ||
                  deleteConfirmDraft.trim().toUpperCase() !==
                    LIGA_DELETE_CONFIRM_PHRASE
                }
                onClick={() => void handleDeleteLiga()}
              >
                {busy ? "Eliminando…" : "Eliminar liga"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {jornadaProgress ? (
        <div className="liga-gestionar-progress" role="status">
          <p className="liga-gestionar-progress__text">
            {jornadaProgress.completadas} de {jornadaProgress.total} jornadas
            completadas
          </p>
          <div
            className="liga-gestionar-progress__track"
            aria-hidden="true"
          >
            <div
              className="liga-gestionar-progress__fill"
              style={{ width: `${jornadaProgress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      <ActionBar className="liga-actions liga-gestionar-actions">
        {ctaIniciarVisible && !isMobile && (
          <Button
            type="button"
            variant="primary"
            disabled={!puedeIniciar || busy}
            onClick={handleStartLiga}
            title={iniciarLigaTitle}
          >
            Iniciar liga
          </Button>
        )}
        {puedeRegenerar && detalle.jornadas.length > 0 && ligaEditable && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={handleRegenerar}
          >
            Regenerar calendario
          </Button>
        )}
        {puedeFinalizarLiga && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={handleFinishLiga}
          >
            Finalizar liga
          </Button>
        )}
        {(detalle?.estado === "completed" ||
          (jornadaProgress?.completadas ?? 0) > 0) && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            title="Registra GANADOR JORNADA (+50) en el historial de cada jugador"
            onClick={() => {
              void handleResyncLigaCareer();
            }}
          >
            Sincronizar historial
          </Button>
        )}
      </ActionBar>

      {calendarioStale && ligaEditable && (
        <div className="liga-banner liga-banner--warn" role="status">
          {detalle.estado === "in_progress"
            ? esParejasFijas
              ? "Las parejas inscritas no coinciden con el calendario actual. Con la liga en curso, usa «Reiniciar liga» si necesitas volver a generar jornadas."
              : "Los inscritos no coinciden con el calendario actual. Con la liga en curso, usa «Reiniciar liga» si necesitas volver a generar jornadas y parejas."
            : esParejasFijas
              ? "Las parejas inscritas no coinciden con el calendario actual. Usa «Regenerar calendario» para actualizar jornadas."
              : "Los inscritos no coinciden con el calendario actual. Usa «Regenerar calendario» para actualizar jornadas y parejas."}
        </div>
      )}

      {ligaEditable && esPlayoffs && detalle.equipos.length < PLAYOFFS_MIN_TEAMS && (
        <p className="liga-hint">
          Este formato requiere al menos {PLAYOFFS_MIN_TEAMS} parejas
          ({detalle.equipos.length} actuales).
        </p>
      )}

      {ligaEditable &&
        esParejasFijas &&
        !esPlayoffs &&
        detalle.equipos.length < 3 && (
        <p className="liga-hint">
          Mínimo 3 parejas inscritas para generar el calendario.
        </p>
      )}

      {ligaEditable && !esParejasFijas && detalle.inscripciones.length < 4 && (
        <p className="liga-hint">
          Mínimo 4 jugadores inscritos (cantidad par) para generar jornadas.
        </p>
      )}
      {ligaEditable &&
        !esParejasFijas &&
        detalle.inscripciones.length >= 4 &&
        detalle.inscripciones.length % 2 !== 0 && (
          <p className="liga-error">La cantidad de inscritos debe ser par.</p>
        )}

      {message ? <p className="liga-success">{message}</p> : null}
      {error ? <p className="liga-error">{error}</p> : null}

      <ModeSectionTabs
        className="liga-section-tabs"
        tabs={ligaTabs}
        activeId={tab}
        onChange={(id) => setTab(id as LigaGestionarTab)}
        ariaLabel="Secciones de la liga"
      />

      {!esParejasFijas && (
        <ModeSectionPanel id="jugadores" activeId={tab}>
          <div className="liga-card rv-card">
            <h2 className="liga-card__title">Inscripciones en esta liga</h2>
            <ul className="liga-list">
              {jugadoresPool.map((j) => {
                const inscrito = inscritosIds.has(j.id);
                return (
                  <li key={j.id} className="liga-list-item">
                    <div className="liga-list-item__main">
                      <div className="liga-list-item__head">
                        <p className="liga-list-item__title">{j.nombre}</p>
                        {j.categoria ? (
                          <JugadorCategoriaBadge
                            categoria={j.categoria}
                            className="liga-list-item__cat"
                          />
                        ) : (
                          <span className="liga-list-item__cat-missing">
                            Sin categoría
                          </span>
                        )}
                      </div>
                      <p className="liga-list-item__meta">
                        {inscrito ? "Inscrito en esta liga" : "Sin inscribir"}
                      </p>
                    </div>
                    {ligaEditable && (
                      <div className="liga-list-item__actions">
                        <Button
                          type="button"
                          variant={inscrito ? "danger" : "secondary"}
                          size="sm"
                          disabled={busy}
                          onClick={() => toggleInscripcion(j.id, inscrito)}
                        >
                          {inscrito ? "Desinscribir" : "Inscribir"}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {jugadoresPool.length === 0 && (
              <div className="liga-empty">
                <p>Aún no hay jugadores en el registro.</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => navigateJugadoresLista("M")}
                >
                  Ir al registro de jugadores
                </Button>
              </div>
            )}
          </div>
        </ModeSectionPanel>
      )}

      {esParejasFijas && (
        <ModeSectionPanel id="parejas" activeId={tab}>
          <div className="liga-card rv-card">
            <h2 className="liga-card__title">Parejas inscritas</h2>
            {detalle.equipos.length === 0 ? (
              <p className="liga-empty">Aún no hay parejas registradas.</p>
            ) : (
              <ul className="liga-list liga-jornadas-list">
                {detalle.equipos.map((eq) => (
                  <li key={eq.id} className="liga-jornadas-list__item">
                    <div className="liga-jornada-row liga-jornada-row--pareja">
                      <span
                        className="liga-jornada-row__icon liga-jornada-row__icon--pareja"
                        aria-hidden="true"
                      >
                        👥
                      </span>
                      <span className="liga-jornada-row__main">
                        <span className="liga-jornada-row__title">
                          {equipoNombre(eq)}
                        </span>
                        <span className="liga-jornada-row__meta">
                          {eq.partidos_jugados > 0
                            ? `${eq.puntos} pts · ${eq.partidos_jugados} PJ`
                            : "Sin partidos jugados"}
                        </span>
                      </span>
                      {ligaEditable && detalle.jornadas.length === 0 ? (
                        <button
                          type="button"
                          className="liga-jornada-row__cta liga-jornada-row__cta--danger"
                          disabled={busy}
                          onClick={() => void handleDeleteEquipo(eq.id)}
                        >
                          Borrar pareja
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {ligaEditable && detalle.jornadas.length === 0 && (
            <div className="liga-card rv-card liga-equipo-form">
              <h2 className="liga-card__title">Nueva pareja</h2>
              <p className="liga-hint">
                Toca dos jugadores distintos: al elegir el segundo se registra
                la pareja al instante. Los que ya están en otra pareja no
                aparecen.
              </p>

              {seleccionParejaIds.length > 0 && (
                <div className="liga-equipo-seleccion" aria-live="polite">
                  <span className="liga-equipo-seleccion__label">
                    {busy && parejaSeleccionCompleta
                      ? "Registrando pareja…"
                      : `Selección (${seleccionParejaIds.length}/2)`}
                  </span>
                  <div className="liga-equipo-seleccion__chips">
                    {seleccionParejaIds.map((id, index) => {
                      const j = jugadoresPool.find((p) => p.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="liga-equipo-seleccion__chip"
                          disabled={busy}
                          onClick={() => toggleJugadorEnPareja(id)}
                          title="Quitar de la selección"
                        >
                          <span className="liga-equipo-seleccion__orden">
                            {index + 1}
                          </span>
                          {j?.nombre ?? "?"}
                          <span className="liga-equipo-seleccion__quitar" aria-hidden>
                            ×
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={limpiarSeleccionPareja}
                  >
                    Limpiar
                  </Button>
                </div>
              )}

              {jugadoresDisponiblesPareja.length === 0 ? (
                <p className="liga-empty">
                  No quedan jugadores libres. Borra una pareja o agrega más al
                  registro.
                </p>
              ) : (
                <>
                  <div className="elegant-grid-filters">
                    <input
                      type="search"
                      className="elegant-grid-search"
                      placeholder="Buscar jugador por nombre…"
                      value={parejaGridSearch}
                      onChange={(e) => setParejaGridSearch(e.target.value)}
                      disabled={busy}
                    />
                    <select
                      className="riviera-input"
                      value={parejaCategoryFilter}
                      onChange={(e) => setParejaCategoryFilter(e.target.value)}
                      aria-label="Filtrar por categoría"
                      disabled={busy}
                    >
                      <option value="">Todas las categorías</option>
                      {JUGADOR_CATEGORIAS_ORDER.map((c) => (
                        <option key={c} value={c}>
                          {JUGADOR_CATEGORIA_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {jugadoresDisponiblesParejaFiltrados.length === 0 ? (
                    <p className="liga-hint">
                      Ningún jugador coincide con la búsqueda o el filtro.
                    </p>
                  ) : (
                    <div
                      className="elegant-players-grid"
                      role="listbox"
                      aria-label="Jugadores disponibles"
                    >
                      {jugadoresDisponiblesParejaFiltrados.map((j) => {
                        const selected = seleccionParejaIds.includes(j.id);
                        const bloqueado =
                          !selected &&
                          (seleccionParejaIds.length >= 2 || busy);
                        const fotoUrl =
                          typeof j.foto_url === "string" && j.foto_url.trim()
                            ? j.foto_url.trim()
                            : null;
                        const rivieraId =
                          typeof j.riviera_id === "string" && j.riviera_id.trim()
                            ? j.riviera_id.trim()
                            : null;
                        const categoria =
                          j.categoria as RivieraJugadorCategoria | null;
                        return (
                          <div key={j.id} role="presentation">
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              className={`elegant-player-card${
                                fotoUrl
                                  ? " elegant-player-card--has-photo"
                                  : ""
                              }${selected ? " selected" : ""}`}
                              disabled={busy || bloqueado}
                              onClick={() => toggleJugadorEnPareja(j.id)}
                              aria-label={`${j.nombre}${
                                rivieraId ? ` · ${rivieraId}` : ""
                              }`}
                            >
                              {fotoUrl ? (
                                <>
                                  <span
                                    className="elegant-player-card__photo"
                                    style={{
                                      backgroundImage: `url(${fotoUrl})`,
                                    }}
                                    aria-hidden
                                  />
                                  <span
                                    className="elegant-player-card__overlay"
                                    aria-hidden
                                  />
                                </>
                              ) : null}
                              <span className="elegant-player-info">
                                <span
                                  className="elegant-player-name"
                                  title={j.nombre}
                                >
                                  {j.nombre}
                                </span>
                                <span className="elegant-player-meta">
                                  {categoria ? (
                                    <JugadorCategoriaBadge
                                      categoria={categoria}
                                      className="elegant-player-cat"
                                    />
                                  ) : null}
                                  {rivieraId ? (
                                    <RivieraIdBadge
                                      rivieraId={rivieraId}
                                      size="sm"
                                      embedded
                                      className="elegant-player-riviera-id"
                                    />
                                  ) : null}
                                </span>
                              </span>
                              {selected ? (
                                <span
                                  className="elegant-player-mark"
                                  aria-hidden
                                >
                                  ✓
                                </span>
                              ) : null}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {jugadoresPool.length === 0 && (
            <div className="liga-empty">
              <p>Aún no hay jugadores en el registro.</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => navigateJugadoresLista("M")}
              >
                Ir al registro de jugadores
              </Button>
            </div>
          )}
        </ModeSectionPanel>
      )}

      <ModeSectionPanel id="jornadas" activeId={tab}>
        <div className="liga-card rv-card">
          <h2 className="liga-card__title">Jornadas</h2>
          {detalle.jornadas.length === 0 ? (
            <p className="liga-empty">
              {ligaEditable
                ? "Inicia la liga o regenera el calendario cuando tengas inscritos listos."
                : "Sin jornadas."}
            </p>
          ) : (
            <ul className="liga-list liga-jornadas-list">
              {detalle.jornadas.map((j) => (
                <li key={j.id} className="liga-jornadas-list__item">
                  <button
                    type="button"
                    className="liga-jornada-row"
                    disabled={busy}
                    onClick={() =>
                      navigateLiga(ligaJornadaPath(ligaId, j.numero))
                    }
                  >
                    <span
                      className={`liga-jornada-row__icon liga-jornada-row__icon--${j.estado}`}
                      aria-hidden="true"
                    >
                      {jornadaEstadoIcon(j.estado)}
                    </span>
                    <span className="liga-jornada-row__main">
                      <span className="liga-jornada-row__title">
                        Jornada {j.numero}
                      </span>
                      <span className="liga-jornada-row__meta">
                        {jornadaEstadoLabel(j.estado)}
                        {j.fecha
                          ? ` · ${formatFechaLegible(dateInputValue(j.fecha))}`
                          : ""}
                      </span>
                    </span>
                    <span className="liga-jornada-row__cta">
                      Ver jornada {j.numero}
                      <TablerIcon name="chevron-right" size={18} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </ModeSectionPanel>

      {stickyLabel ? (
        <MobileStickyActionFooter>
          <Button
            type="button"
            variant="primary"
            disabled={!puedeIniciar || busy}
            onClick={handleStartLiga}
            title={iniciarLigaTitle}
          >
            {stickyLabel}
          </Button>
        </MobileStickyActionFooter>
      ) : null}
    </LigaPageShell>
  );
};
