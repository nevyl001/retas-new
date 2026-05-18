import React, { useEffect, useState } from "react";
import { getTournaments, Tournament } from "../../lib/database";
import { filterRetasForHomeDisplay } from "../../lib/gameModeMapping";
import { EmptyStateRetas } from "./EmptyStateRetas";
import { RecentRetaCard } from "./RecentRetaCard";

interface RecentRetasSectionProps {
  userId?: string;
  onSelectTournament: (t: Tournament) => void;
}

export const RecentRetasSection: React.FC<RecentRetasSectionProps> = ({
  userId,
  onSelectTournament,
}) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setTournaments([]);
      setLoading(false);
      return;
    }
    let active = true;
    getTournaments(userId)
      .then((data) => {
        if (active) setTournaments(filterRetasForHomeDisplay(data ?? []));
      })
      .catch(() => {
        if (active) setTournaments([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const recent = tournaments.slice(0, 8);

  return (
    <section className="recent-retas-section" aria-labelledby="recent-retas-heading">
      <h2 id="recent-retas-heading" className="home-section-title">
        Retas recientes
      </h2>
      {loading && <p className="home-muted">Cargando retas…</p>}
      {!loading && recent.length === 0 && <EmptyStateRetas />}
      {!loading && recent.length > 0 && (
        <div className="recent-retas-scroll">
          {recent.map((t) => (
            <RecentRetaCard
              key={t.id}
              tournament={t}
              onContinue={() => onSelectTournament(t)}
            />
          ))}
        </div>
      )}
    </section>
  );
};
