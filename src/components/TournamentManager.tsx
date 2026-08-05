import React, { useState, useEffect, useMemo } from "react";
import {
  getPairs,
  getMatches,
  archiveTournament,
  updateTournament,
  Tournament,
} from "../lib/database";
import {
  finalizeCareerEvent,
  formatCareerPipelineFailureMessage,
  formatCareerPipelineSuccessMessage,
  type CareerEventPipelineResult,
} from "../lib/rivieraJugadores/careerEventPipeline";
import {
  getRetaCreatedAt,
  getRetaDescription,
  getRetaGroupNames,
  getRetaId,
  getRetaMetaLine,
  getRetaModeBadge,
  getRetaName,
  getRetaStatusBadge,
  isRetaFinished,
  loadUserRetasForHome,
  matchesRetaFilter,
  type HomeRetaItem,
  type RetaFilterId,
} from "../lib/retasList";
import { errorLogPayload, errorMessage } from "../lib/errors/normalizeError";
import { retryTransient } from "../lib/errors/retryTransient";
import { withTimeout } from "../lib/async/withTimeout";
import { archiveDuelo2v2 } from "../services/duelo2v2Service";
import { duelo2v2GestionarPath, navigateDuelo2v2 } from "./duelo-2v2/duelo2v2Nav";
import { useClubModeEyebrow } from "../club-experience";
import { useUser } from "../contexts/UserContext";
import { Badge, Button, Card } from "./ui";
import { TablerIcon } from "./ui/TablerIcon";
import { ActionBar } from "./platform/ActionBar";
import { ModeHeader } from "./platform/ModeHeader";
import { formatRelativeDate } from "../lib/formatRelativeDate";
import "./mis-retas/mis-retas.css";

const ARCHIVE_RETA_CONFIRM =
  "Esta reta dejará de aparecer en Mis retas, pero el resultado, los puntos, el rating y el historial de los jugadores se conservarán.";

/** Techo de espera de la lista: nunca dejar el spinner sin salida. */
const LIST_LOAD_TIMEOUT_MS = 20_000;
/**
 * Techo del cierre completo (participaciones + ledger + rating + carrera).
 * Generoso porque son muchas escrituras, pero acotado: todas son idempotentes,
 * así que expirar y reintentar no duplica nada.
 */
const FINISH_TIMEOUT_MS = 180_000;

interface TournamentManagerProps {
  onTournamentSelect: (tournament: Tournament | null) => void;
  selectedTournament?: Tournament;
  onBack?: () => void;
}

export const TournamentManager: React.FC<TournamentManagerProps> = ({
  onTournamentSelect,
  selectedTournament,
  onBack,
}) => {
  const { user } = useUser();
  const modeEyebrow = useClubModeEyebrow();
  const [retas, setRetas] = useState<HomeRetaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [reloadToken, setReloadToken] = useState(0);
  const [filter, setFilter] = useState<RetaFilterId>("all");
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set());
  // Finalizar NO usa `loading` (el del skeleton de la lista): al compartirlo, un
  // cierre lento dejaba toda la vista en "Cargando retas…" sin salida.
  const [finishingIds, setFinishingIds] = useState<Set<string>>(() => new Set());

  const reloadRetas = async () => {
    if (!user?.id) {
      setRetas([]);
      return;
    }
    const data = await withTimeout(loadUserRetasForHome(user.id), {
      timeoutMs: LIST_LOAD_TIMEOUT_MS,
      label: "La carga de retas",
    });
    setRetas(data);
  };

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setRetas([]);
      return;
    }

    let isMounted = true;
    const userId = user.id;

    const loadRetas = async () => {
      try {
        setLoading(true);
        setError("");
        // Timeout obligatorio: `fetch` no expira por su cuenta, así que una
        // conexión colgada dejaba el spinner encendido para siempre.
        const data = await withTimeout(loadUserRetasForHome(userId), {
          timeoutMs: LIST_LOAD_TIMEOUT_MS,
          label: "La carga de retas",
        });
        if (!isMounted) return;
        setRetas(data);
      } catch (err) {
        if (!isMounted) return;
        console.error("Error al cargar retas:", errorLogPayload(err), err);
        setError(
          `No se pudieron cargar las retas. ${errorMessage(err)}`
        );
      } finally {
        // Se apaga el spinner siempre, incluso si la petición falló o expiró.
        if (isMounted) setLoading(false);
      }
    };

    void loadRetas();
    return () => {
      isMounted = false;
    };
  }, [user?.id, reloadToken]);

  // Al volver del segundo plano (móvil suspende pestañas y puede congelar
  // peticiones en vuelo) se refresca la lista: así una reta que el backend ya
  // cerró deja de mostrarse "En curso".
  useEffect(() => {
    if (!user?.id) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setReloadToken((token) => token + 1);
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!selectedTournament) return;
    setRetas((prev) =>
      prev.map((item) =>
        item.kind === "tournament" && item.tournament.id === selectedTournament.id
          ? { ...item, tournament: { ...item.tournament, ...selectedTournament } }
          : item
      )
    );
  }, [selectedTournament]);

  const filteredRetas = useMemo(
    () => retas.filter((item) => matchesRetaFilter(item, filter)),
    [retas, filter]
  );

  const handleOpenReta = (item: HomeRetaItem) => {
    if (item.kind === "duelo-2v2") {
      navigateDuelo2v2(duelo2v2GestionarPath(item.duelo.id));
      return;
    }
    onTournamentSelect(item.tournament);
  };

  const handleArchiveReta = async (item: HomeRetaItem) => {
    const name = getRetaName(item);
    if (
      !window.confirm(
        `Archivar «${name}»?\n\n${ARCHIVE_RETA_CONFIRM}\n\nPulsa Aceptar para archivar o Cancelar para volver.`
      )
    ) {
      return;
    }

    const id = getRetaId(item);
    if (deletingIds.has(id)) return;

    setDeletingIds((prev) => new Set(prev).add(id));
    setError("");
    setRetas((prev) => prev.filter((r) => getRetaId(r) !== id));

    try {
      if (item.kind === "duelo-2v2") {
        await archiveDuelo2v2(id);
        return;
      }

      // Retas: ya no se sincroniza carrera ni se borran matches al archivar.
      // El soft-archive conserva el padre; la carrera sigue intacta.
      await archiveTournament(id);
      if (selectedTournament?.id === id) {
        onTournamentSelect(null);
      }
    } catch (err) {
      setError(`No se pudo archivar la reta. ${errorMessage(err)}`);
      console.error("Error al archivar reta:", errorLogPayload(err), err);
      try {
        await reloadRetas();
      } catch (reloadErr) {
        console.error("Error al recargar retas tras fallo de archivo:", reloadErr);
      }
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleFinishTournament = async (tournament: Tournament) => {
    // Guarda de doble click / doble submit: el cierre es idempotente en BD,
    // pero lanzarlo dos veces en paralelo duplica trabajo y puede producir
    // mensajes contradictorios en la UI.
    if (finishingIds.has(tournament.id)) return;

    if (
      !window.confirm(
        "¿Estás seguro de que quieres finalizar la reta? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }

    if (!user?.id) {
      const msg = "No se pudo cerrar la reta: sesión no disponible.";
      setError(msg);
      alert(msg);
      return;
    }
    const userId = user.id;

    setFinishingIds((prev) => new Set(prev).add(tournament.id));
    setError("");

    // Marca is_finished cuando la carrera ya quedó sincronizada. Se separa del
    // pipeline para poder reintentar SOLO este paso: si el pipeline terminó y
    // este UPDATE falló, la reta quedaba "En curso" con la carrera ya escrita.
    const markFinished = async () => {
      await retryTransient(
        () => updateTournament(tournament.id, { is_finished: true }),
        { label: `updateTournament(${tournament.id})` }
      );
      setRetas((prev) =>
        prev.map((item) =>
          item.kind === "tournament" && item.tournament.id === tournament.id
            ? { ...item, tournament: { ...item.tournament, is_finished: true } }
            : item
        )
      );
      if (selectedTournament?.id === tournament.id) {
        onTournamentSelect({ ...tournament, is_finished: true });
      }
    };

    try {
      const [pairs, matches] = await Promise.all([
        getPairs(tournament.id),
        getMatches(tournament.id),
      ]);

      const pipelineResult: CareerEventPipelineResult = await withTimeout(
        finalizeCareerEvent({
          kind: "reta",
          organizadorId: userId,
          tournament: { ...tournament, is_finished: true },
          pairs,
          matches,
        }),
        { timeoutMs: FINISH_TIMEOUT_MS, label: "El cierre de la reta" }
      );

      if (!pipelineResult.ok) {
        const msg = formatCareerPipelineFailureMessage(
          pipelineResult,
          tournament.name
        );
        console.warn("[career-event-pipeline] reta incompleta:", pipelineResult);
        setError(msg);
        alert(msg);
        // El estado real puede haber avanzado parcialmente: se resincroniza la
        // lista para no mostrar información obsoleta.
        await reloadRetas().catch((reloadErr) => {
          console.error("Error al recargar retas:", errorLogPayload(reloadErr));
        });
        return;
      }

      await markFinished();
      alert(formatCareerPipelineSuccessMessage(pipelineResult, tournament.name));
    } catch (err) {
      console.error("Error finalizando reta:", errorLogPayload(err), err);
      const msg =
        `No se pudo cerrar «${tournament.name}».\n\n${errorMessage(err)}\n\n` +
        `Los resultados guardados no se pierden. Puedes volver a pulsar ` +
        `Finalizar: el proceso continúa desde donde quedó.`;
      setError(msg);
      alert(msg);
      // Puede que el backend sí haya terminado (p. ej. timeout del cliente):
      // se relee el estado real en vez de dejar la tarjeta desactualizada.
      await reloadRetas().catch((reloadErr) => {
        console.error("Error al recargar retas:", errorLogPayload(reloadErr));
      });
    } finally {
      setFinishingIds((prev) => {
        const next = new Set(prev);
        next.delete(tournament.id);
        return next;
      });
    }
  };

  const filterChips: { id: RetaFilterId; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "active", label: "En curso" },
    { id: "finished", label: "Finalizadas" },
  ];

  return (
    <div className="tournament-manager mis-retas-page">
      {onBack ? (
        <ActionBar className="mis-retas-page__toolbar riviera-back-toolbar">
          <Button type="button" variant="back" onClick={onBack}>
            ← Volver
          </Button>
        </ActionBar>
      ) : null}

      <ModeHeader
        className="mis-retas-page__mode-header rv-mode-header rv-mode-header--entry"
        eyebrow={modeEyebrow}
        title="Mis retas"
        subtitle="Administra tus retas creadas y continúa donde te quedaste."
      />

      {error ? (
        <p className="mis-retas-page__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mis-retas-page__filters riviera-filter-chips" role="tablist">
        {filterChips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={filter === chip.id}
            className={`riviera-filter-chip${
              filter === chip.id ? " riviera-filter-chip--active" : ""
            }`}
            onClick={() => setFilter(chip.id)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mis-retas-loading" aria-busy="true">
          <div className="riviera-skeleton mis-retas-loading__bar" />
          <div className="riviera-skeleton mis-retas-loading__bar" />
          <p className="mis-retas-loading__text">Cargando retas…</p>
        </div>
      ) : retas.length === 0 ? (
        <Card variant="elevated" className="mis-retas-empty">
          <span className="mis-retas-empty__icon" aria-hidden>
            <TablerIcon name="ball-tennis" size={40} />
          </span>
          <h2 className="mis-retas-empty__title">No tienes retas aún</h2>
          <p className="mis-retas-empty__text">
            Elige un modo de juego arriba para crear tu primera reta.
          </p>
        </Card>
      ) : filteredRetas.length === 0 ? (
        <Card variant="elevated" className="mis-retas-empty">
          <p className="mis-retas-empty__text">
            No hay retas en este filtro. Prueba con &quot;Todas&quot;.
          </p>
        </Card>
      ) : (
        <div className="mis-retas-page__grid">
          {filteredRetas.map((item) => {
            const mode = getRetaModeBadge(item);
            const status = getRetaStatusBadge(item);
            const groups = getRetaGroupNames(item);
            const isSelected =
              item.kind === "tournament" &&
              selectedTournament?.id === item.tournament.id;
            const finished = isRetaFinished(item);
            const active =
              item.kind === "tournament"
                ? item.tournament.is_started && !item.tournament.is_finished
                : item.duelo.estado === "en_juego";
            const retaId = getRetaId(item);
            const isDeleting = deletingIds.has(retaId);
            const isFinishing = finishingIds.has(retaId);
            const statusCardClass = finished
              ? "mis-reta-card--status-finished"
              : active
                ? "mis-reta-card--status-active"
                : "mis-reta-card--status-pending";
            const description = getRetaDescription(item);

            return (
              <Card
                key={`${item.kind}-${retaId}`}
                as="article"
                variant="glass"
                interactive={!isDeleting}
                className={`mis-reta-card ${statusCardClass}${
                  isSelected ? " mis-reta-card--selected" : ""
                }${isDeleting ? " mis-reta-card--deleting" : ""}`}
                onClick={() => {
                  if (!isDeleting) handleOpenReta(item);
                }}
                onKeyDown={(e) => {
                  if (isDeleting) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenReta(item);
                  }
                }}
                role="button"
                tabIndex={isDeleting ? -1 : 0}
                aria-busy={isDeleting}
              >
                <div className="mis-reta-card__badges">
                  <Badge variant={mode.variant}>{mode.label}</Badge>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                <h3 className="mis-reta-card__name">{getRetaName(item)}</h3>
                <p className="mis-reta-card__meta">
                  {formatRelativeDate(getRetaCreatedAt(item))} · {getRetaMetaLine(item)}
                </p>

                {description ? (
                  <p className="mis-reta-card__desc">{description}</p>
                ) : null}

                {groups.length > 0 && (
                  <div className="mis-reta-card__groups">
                    {groups.map((name) => (
                      <span key={name} className="mis-reta-card__group-chip">
                        {name}
                      </span>
                    ))}
                  </div>
                )}

                <footer className="mis-reta-card__footer">
                  <button
                    type="button"
                    className="mis-reta-card__continue"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenReta(item);
                    }}
                  >
                    {finished ? "Ver resultados" : "Continuar"} →
                  </button>
                  <div className="mis-reta-card__actions-right">
                    {item.kind === "tournament" &&
                      item.tournament.is_started &&
                      !item.tournament.is_finished && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isFinishing}
                          aria-busy={isFinishing}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleFinishTournament(item.tournament);
                          }}
                        >
                          {isFinishing ? "Finalizando…" : "Finalizar"}
                        </Button>
                      )}
                    <button
                      type="button"
                      className="riviera-btn-danger-icon mis-reta-card__delete"
                      aria-label="Archivar reta"
                      title="Archivar reta"
                      disabled={isDeleting || isFinishing}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        void handleArchiveReta(item);
                      }}
                    >
                      {isDeleting ? (
                        <TablerIcon name="loader-2" size={18} className="mis-reta-card__delete-spinner" />
                      ) : (
                        "🗑"
                      )}
                    </button>
                  </div>
                </footer>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
