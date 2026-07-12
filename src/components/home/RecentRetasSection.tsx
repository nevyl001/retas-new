import React, { useEffect, useMemo, useState } from "react";
import type { Tournament } from "../../lib/database";
import {
  getRetaCreatedAt,
  isRetaFinished,
  loadUserRetasForHome,
  type HomeRetaItem,
} from "../../lib/retasList";
import { duelo2v2GestionarPath, navigateDuelo2v2 } from "../duelo-2v2/duelo2v2Nav";
import { EmptyStateRetas } from "./EmptyStateRetas";
import { RecentRetaCard } from "./RecentRetaCard";

const HOME_ACTIVE_LIMIT = 3;
const HOME_RECENT_LIMIT = 3;

function sortByRecency(items: HomeRetaItem[]): HomeRetaItem[] {
  return [...items].sort(
    (a, b) =>
      new Date(getRetaCreatedAt(b)).getTime() - new Date(getRetaCreatedAt(a)).getTime()
  );
}

export function partitionHomeRetas(retas: HomeRetaItem[]): {
  active: HomeRetaItem[];
  recent: HomeRetaItem[];
  hasMore: boolean;
} {
  const unfinished = sortByRecency(retas.filter((item) => !isRetaFinished(item)));
  const finished = sortByRecency(retas.filter((item) => isRetaFinished(item)));
  const active = unfinished.slice(0, HOME_ACTIVE_LIMIT);
  const recent = finished.slice(0, HOME_RECENT_LIMIT);
  const hasMore =
    unfinished.length > HOME_ACTIVE_LIMIT || finished.length > HOME_RECENT_LIMIT;
  return { active, recent, hasMore };
}

interface RecentRetasSectionProps {
  userId?: string;
  onSelectTournament: (t: Tournament) => void;
  onShowAll?: () => void;
}

export const RecentRetasSection: React.FC<RecentRetasSectionProps> = ({
  userId,
  onSelectTournament,
  onShowAll,
}) => {
  const [retas, setRetas] = useState<HomeRetaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setRetas([]);
      setLoading(false);
      return;
    }
    let active = true;
    loadUserRetasForHome(userId)
      .then((data) => {
        if (active) setRetas(data);
      })
      .catch(() => {
        if (active) setRetas([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const handleContinue = (item: HomeRetaItem) => {
    if (item.kind === "duelo-2v2") {
      navigateDuelo2v2(duelo2v2GestionarPath(item.duelo.id));
      return;
    }
    onSelectTournament(item.tournament);
  };

  const { active, recent, hasMore } = useMemo(
    () => partitionHomeRetas(retas),
    [retas]
  );

  return (
    <>
      {loading && <p className="home-muted">Cargando eventos…</p>}
      {!loading && retas.length === 0 && <EmptyStateRetas />}

      {!loading && active.length > 0 && (
        <section
          className="recent-retas-section recent-retas-section--active"
          aria-labelledby="active-retas-heading"
        >
          <h2 id="active-retas-heading" className="home-section-title">
            Eventos activos
          </h2>
          <div className="recent-retas-scroll">
            {active.map((item) => (
              <RecentRetaCard
                key={`active-${item.kind}-${item.kind === "tournament" ? item.tournament.id : item.duelo.id}`}
                item={item}
                compact
                onContinue={() => handleContinue(item)}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && recent.length > 0 && (
        <section
          className="recent-retas-section recent-retas-section--recent"
          aria-labelledby="recent-retas-heading"
        >
          <h2 id="recent-retas-heading" className="home-section-title">
            Eventos recientes
          </h2>
          <div className="recent-retas-scroll">
            {recent.map((item) => (
              <RecentRetaCard
                key={`recent-${item.kind}-${item.kind === "tournament" ? item.tournament.id : item.duelo.id}`}
                item={item}
                compact
                onContinue={() => handleContinue(item)}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && hasMore && onShowAll ? (
        <div className="recent-retas-view-all">
          <button
            type="button"
            className="recent-retas-view-all__btn"
            onClick={onShowAll}
          >
            Ver todos los eventos →
          </button>
        </div>
      ) : null}
    </>
  );
};
