import React, { useState, useEffect, useMemo } from "react";
import { filterRetasForHomeDisplay } from "../lib/gameModeMapping";
import {
  getTournaments,
  deleteTournament,
  updateTournament,
  getPairs,
  getMatches,
  Tournament,
} from "../lib/database";
import { syncRetaParticipaciones } from "../lib/rivieraJugadores/syncParticipaciones";
import { useUser } from "../contexts/UserContext";
import { Badge, Button, Card } from "./ui";
import { formatRelativeDate } from "../lib/formatRelativeDate";
import {
  formatTournamentCourtsLabel,
  getTournamentCourtsCount,
  getTournamentGroupNames,
  getTournamentModeBadge,
  getTournamentStatusBadge,
} from "../lib/tournamentDisplay";
import "./mis-retas/mis-retas.css";

type FilterId = "all" | "active" | "finished";

interface TournamentManagerProps {
  onTournamentSelect: (tournament: Tournament | null) => void;
  selectedTournament?: Tournament;
  onBack?: () => void;
}

function matchesFilter(tournament: Tournament, filter: FilterId): boolean {
  if (filter === "all") return true;
  if (filter === "finished") return tournament.is_finished;
  return tournament.is_started && !tournament.is_finished;
}

export const TournamentManager: React.FC<TournamentManagerProps> = ({
  onTournamentSelect,
  selectedTournament,
  onBack,
}) => {
  const { user } = useUser();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setError] = useState<string>("");
  const [filter, setFilter] = useState<FilterId>("all");

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      setTournaments([]);
      return;
    }

    let isMounted = true;

    const loadTournaments = async () => {
      try {
        setLoading(true);
        const data = await getTournaments(user.id);
        if (!isMounted) return;
        setTournaments(filterRetasForHomeDisplay(data || []));
      } catch (err) {
        if (!isMounted) return;
        console.error("Error al cargar retas:", err);
        setError("Error al cargar las retas");
        setTournaments([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadTournaments();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!selectedTournament) return;
    setTournaments((prev) =>
      prev.map((t) =>
        t.id === selectedTournament.id ? { ...t, ...selectedTournament } : t
      )
    );
  }, [selectedTournament]);

  const filteredTournaments = useMemo(
    () => tournaments.filter((t) => matchesFilter(t, filter)),
    [tournaments, filter]
  );

  const handleDeleteTournament = async (id: string) => {
    if (
      !window.confirm(
        "¿Estás seguro de que quieres eliminar esta reta? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }

    try {
      setError("");
      await deleteTournament(id);
      setTournaments(tournaments.filter((t) => t.id !== id));
      if (selectedTournament?.id === id) {
        const remaining = tournaments.filter((t) => t.id !== id);
        onTournamentSelect(remaining[0] ?? null);
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
      setTournaments(
        tournaments.map((t) =>
          t.id === tournament.id ? { ...t, is_finished: true } : t
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

  const filterChips: { id: FilterId; label: string }[] = [
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
      ) : tournaments.length === 0 ? (
        <Card variant="elevated" className="mis-retas-empty">
          <span className="mis-retas-empty__icon" aria-hidden>
            🏓
          </span>
          <h2 className="mis-retas-empty__title">No tienes retas aún</h2>
          <p className="mis-retas-empty__text">
            Elige un modo de juego arriba para crear tu primera reta.
          </p>
        </Card>
      ) : filteredTournaments.length === 0 ? (
        <Card variant="elevated" className="mis-retas-empty">
          <p className="mis-retas-empty__text">
            No hay retas en este filtro. Prueba con &quot;Todas&quot;.
          </p>
        </Card>
      ) : (
        <div className="mis-retas-page__grid">
          {filteredTournaments.map((tournament) => {
            const mode = getTournamentModeBadge(tournament);
            const status = getTournamentStatusBadge(tournament);
            const groups = getTournamentGroupNames(tournament);
            const isSelected = selectedTournament?.id === tournament.id;
            const courtsLabel = formatTournamentCourtsLabel(
              getTournamentCourtsCount(tournament)
            );
            const statusCardClass = tournament.is_finished
              ? "mis-reta-card--status-finished"
              : tournament.is_started
                ? "mis-reta-card--status-active"
                : "mis-reta-card--status-pending";

            return (
              <Card
                key={tournament.id}
                as="article"
                variant="glass"
                interactive
                className={`mis-reta-card ${statusCardClass}${
                  isSelected ? " mis-reta-card--selected" : ""
                }`}
                onClick={() => onTournamentSelect(tournament)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onTournamentSelect(tournament);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="mis-reta-card__badges">
                  <Badge variant={mode.variant}>{mode.label}</Badge>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                <h3 className="mis-reta-card__name">{tournament.name}</h3>
                <p className="mis-reta-card__meta">
                  {formatRelativeDate(tournament.created_at)} · {courtsLabel}
                </p>

                {tournament.description ? (
                  <p className="mis-reta-card__desc">{tournament.description}</p>
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
                      onTournamentSelect(tournament);
                    }}
                  >
                    {tournament.is_finished ? "Ver resultados" : "Continuar"} →
                  </button>
                  <div className="mis-reta-card__actions-right">
                    {tournament.is_started && !tournament.is_finished && (
                      <button
                        type="button"
                        className="mis-reta-card__finish"
                        disabled={loading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleFinishTournament(tournament);
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
                        handleDeleteTournament(tournament.id);
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
