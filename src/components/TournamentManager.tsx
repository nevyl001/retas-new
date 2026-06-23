import React, { useState, useEffect, useMemo } from "react";
import {
  getPairs,
  getMatches,
  deleteTournament,
  updateTournament,
  Tournament,
} from "../lib/database";
import { syncRetaParticipaciones } from "../lib/rivieraJugadores/syncParticipaciones";
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
import { deleteDuelo2v2 } from "../services/duelo2v2Service";
import { duelo2v2GestionarPath, navigateDuelo2v2 } from "./duelo-2v2/duelo2v2Nav";
import { useUser } from "../contexts/UserContext";
import { Badge, Button, Card } from "./ui";
import { TablerIcon } from "./ui/TablerIcon";
import { formatRelativeDate } from "../lib/formatRelativeDate";
import "./mis-retas/mis-retas.css";

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
  const [retas, setRetas] = useState<HomeRetaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [filter, setFilter] = useState<RetaFilterId>("all");

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setRetas([]);
      return;
    }

    let isMounted = true;

    const loadRetas = async () => {
      try {
        setLoading(true);
        const data = await loadUserRetasForHome(user.id);
        if (!isMounted) return;
        setRetas(data);
      } catch (err) {
        if (!isMounted) return;
        console.error("Error al cargar retas:", err);
        setError("Error al cargar las retas");
        setRetas([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadRetas();
    return () => {
      isMounted = false;
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

  const handleDeleteReta = async (item: HomeRetaItem) => {
    const name = getRetaName(item);
    if (
      !window.confirm(
        `¿Estás seguro de que quieres eliminar «${name}»? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    const id = getRetaId(item);

    try {
      setError("");
      if (item.kind === "duelo-2v2") {
        await deleteDuelo2v2(id);
        setRetas(retas.filter((r) => getRetaId(r) !== id));
        return;
      }

      const tournament = item.tournament;
      if (user?.id) {
        try {
          const [pairs, matches] = await Promise.all([
            getPairs(id),
            getMatches(id),
          ]);
          const hasFinished = matches.some((m) => m.status === "finished");
          if (tournament.is_finished || hasFinished) {
            await syncRetaParticipaciones({
              organizadorId: user.id,
              tournament,
              pairs,
              matches,
            });
          }
        } catch (syncErr) {
          console.warn("syncRetaParticipaciones antes de eliminar:", syncErr);
        }
      }
      await deleteTournament(id);
      setRetas(retas.filter((r) => getRetaId(r) !== id));
      if (selectedTournament?.id === id) {
        const remaining = retas
          .filter((r) => getRetaId(r) !== id)
          .find((r) => r.kind === "tournament");
        onTournamentSelect(remaining?.kind === "tournament" ? remaining.tournament : null);
      }
    } catch (err) {
      setError("Error al eliminar la reta");
      console.error(err);
    }
  };

  const handleFinishTournament = async (tournament: Tournament) => {
    if (
      !window.confirm(
        "¿Estás seguro de que quieres finalizar la reta? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }

    try {
      setError("");
      setLoading(true);
      await updateTournament(tournament.id, { is_finished: true });
      if (user?.id) {
        try {
          const [pairs, matches] = await Promise.all([
            getPairs(tournament.id),
            getMatches(tournament.id),
          ]);
          await syncRetaParticipaciones({
            organizadorId: user.id,
            tournament,
            pairs,
            matches,
          });
        } catch (syncErr) {
          console.warn("syncRetaParticipaciones:", syncErr);
        }
      }
      setRetas(
        retas.map((item) =>
          item.kind === "tournament" && item.tournament.id === tournament.id
            ? { ...item, tournament: { ...item.tournament, is_finished: true } }
            : item
        )
      );
      if (selectedTournament?.id === tournament.id) {
        onTournamentSelect({ ...tournament, is_finished: true });
      }
      alert("¡Reta finalizada exitosamente! 🏆");
    } catch (err) {
      console.error("Error finalizando reta:", err);
      setError("Error al finalizar la reta: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const filterChips: { id: RetaFilterId; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "active", label: "En curso" },
    { id: "finished", label: "Finalizadas" },
  ];

  return (
    <div className="tournament-manager mis-retas-page">
      <header className="mis-retas-page__header">
        {onBack && (
          <Button type="button" variant="back" onClick={onBack}>
            ← Volver
          </Button>
        )}
        <h1 className="mis-retas-page__title">Mis Retas</h1>
      </header>

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
            const statusCardClass = finished
              ? "mis-reta-card--status-finished"
              : active
                ? "mis-reta-card--status-active"
                : "mis-reta-card--status-pending";
            const description = getRetaDescription(item);

            return (
              <Card
                key={`${item.kind}-${getRetaId(item)}`}
                as="article"
                variant="glass"
                interactive
                className={`mis-reta-card ${statusCardClass}${
                  isSelected ? " mis-reta-card--selected" : ""
                }`}
                onClick={() => handleOpenReta(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleOpenReta(item);
                  }
                }}
                role="button"
                tabIndex={0}
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
                        <button
                          type="button"
                          className="mis-reta-card__finish"
                          disabled={loading}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFinishTournament(item.tournament);
                          }}
                        >
                          Finalizar
                        </button>
                      )}
                    <button
                      type="button"
                      className="riviera-btn-danger-icon"
                      aria-label="Eliminar reta"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteReta(item);
                      }}
                    >
                      🗑
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
