import React, { useEffect, useState } from "react";
import type { Tournament } from "../../lib/database";
import { loadUserRetasForHome, type HomeRetaItem } from "../../lib/retasList";
import { duelo2v2GestionarPath, navigateDuelo2v2 } from "../duelo-2v2/duelo2v2Nav";
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

  const recent = retas.slice(0, 8);

  return (
    <section className="recent-retas-section" aria-labelledby="recent-retas-heading">
      <h2 id="recent-retas-heading" className="home-section-title">
        Retas recientes
      </h2>
      {loading && <p className="home-muted">Cargando retas…</p>}
      {!loading && recent.length === 0 && <EmptyStateRetas />}
      {!loading && recent.length > 0 && (
        <div className="recent-retas-scroll">
          {recent.map((item) => (
            <RecentRetaCard
              key={`${item.kind}-${item.kind === "tournament" ? item.tournament.id : item.duelo.id}`}
              item={item}
              onContinue={() => handleContinue(item)}
            />
          ))}
        </div>
      )}
    </section>
  );
};
