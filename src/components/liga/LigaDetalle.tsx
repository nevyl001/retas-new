import React, { useCallback, useEffect, useState } from "react";
import type { LigaDetalle as LigaDetalleType } from "../../lib/liga/types";
import {
  getLigaById,
  getRanking,
  publicLigaJornadaUrl,
} from "../../services/ligaService";
import type { RankingItem } from "../../lib/liga/types";
import { LigaRanking } from "./LigaRanking";
import { LigaPageShell } from "./LigaPageShell";
import "./liga-page.css";

interface LigaDetalleProps {
  ligaId: string;
  publica?: boolean;
}

export const LigaDetalle: React.FC<LigaDetalleProps> = ({
  ligaId,
  publica = false,
}) => {
  const [detalle, setDetalle] = useState<LigaDetalleType | null>(null);
  const [ranking, setRanking] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, r] = await Promise.all([
        getLigaById(ligaId),
        getRanking(ligaId),
      ]);
      setDetalle(d);
      setRanking(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liga no encontrada");
    } finally {
      setLoading(false);
    }
  }, [ligaId]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, [load]);

  if (loading && !detalle) {
    return (
      <LigaPageShell className={publica ? "liga-page--public" : ""}>
        <p>Cargando…</p>
      </LigaPageShell>
    );
  }

  if (!detalle) {
    return (
      <LigaPageShell className={publica ? "liga-page--public" : ""}>
        <p className="liga-error">{error ?? "No disponible"}</p>
      </LigaPageShell>
    );
  }

  return (
    <LigaPageShell className={publica ? "liga-page--public" : ""}>
      <header className="liga-header">
        <h1 className="liga-title">Liga: {detalle.nombre}</h1>
        <p className="liga-subtitle">
          Vista pública · {detalle.estado.replace("_", " ")}
        </p>
      </header>

      <LigaRanking rows={ranking} title="Ranking acumulado" />

      <div className="liga-card">
        <h2 className="liga-card__title">Jornadas</h2>
        {detalle.jornadas.length === 0 ? (
          <p className="liga-empty">La liga aún no tiene jornadas.</p>
        ) : (
          <ul className="liga-list">
            {detalle.jornadas.map((j) => (
              <li key={j.id} className="liga-list-item">
                <div className="liga-list-item__main">
                  <p className="liga-list-item__title">Jornada {j.numero}</p>
                  <p className="liga-list-item__meta">
                    {(j.parejas ?? [])
                      .map(
                        (p) =>
                          `${p.jugador1?.nombre ?? "?"}/${p.jugador2?.nombre ?? "?"}`
                      )
                      .join(" · ")}
                  </p>
                </div>
                <div className="liga-list-item__actions">
                  <span className="liga-badge">{j.estado}</span>
                  {publica && (j.partidos?.length ?? 0) > 0 && (
                    <a
                      href={publicLigaJornadaUrl(ligaId, j.numero)}
                      className="liga-public-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Ver pantalla
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </LigaPageShell>
  );
};
