import React, { useCallback, useEffect, useState } from "react";
import {
  copyToClipboard,
  fetchTorneoExpressBundle,
  formatSupabaseError,
} from "../../services/torneoExpressService";
import {
  buildGrupoStandingsFromBundle,
  formatResultadosCopyText,
  type GrupoStandingsBlock,
} from "../../lib/torneoExpress/resultadosCopy";
import type { TorneoExpress } from "../../lib/torneoExpress/types";
import { TablaGrupo } from "./TablaGrupo";

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

interface TorneoExpressResultadosPanelProps {
  torneo: TorneoExpress;
  onClose: () => void;
}

export const TorneoExpressResultadosPanel: React.FC<
  TorneoExpressResultadosPanelProps
> = ({ torneo, onClose }) => {
  const [blocks, setBlocks] = useState<GrupoStandingsBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchTorneoExpressBundle(torneo.id)
      .then((bundle) => {
        if (!active) return;
        if (!bundle) {
          setError("No se encontró el torneo");
          setBlocks([]);
          return;
        }
        setBlocks(buildGrupoStandingsFromBundle(bundle));
      })
      .catch((e) => {
        if (active) setError(formatSupabaseError(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [torneo.id]);

  const handleCopy = useCallback(async () => {
    const text = formatResultadosCopyText(torneo, blocks);
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [torneo, blocks]);

  return (
    <div className="te-resultados-panel">
      <div className="te-resultados-panel__head">
        <div>
          <p className="te-resultados-panel__label">📊 RESULTADOS FASE DE GRUPOS</p>
          <p className="te-resultados-panel__sub">
            {torneo.nombre} — {formatFecha(torneo.created_at)}
          </p>
        </div>
        <button
          type="button"
          className="te-players-btn-ghost"
          onClick={onClose}
          aria-label="Cerrar resultados"
        >
          Cerrar ✕
        </button>
      </div>

      {loading && <p className="te-subtitle">Cargando resultados…</p>}
      {error && <p className="te-error">{error}</p>}

      {!loading && !error && blocks.length === 0 && (
        <p className="te-subtitle">Sin datos de grupos para este torneo.</p>
      )}

      {!loading &&
        blocks.map((block) => (
          <div key={block.grupo.id} className="te-resultados-grupo">
            <h4 className="te-resultados-grupo__title">{block.grupo.nombre}</h4>
            <TablaGrupo rows={block.rows} />
          </div>
        ))}

      {!loading && blocks.length > 0 && (
        <div className="te-resultados-panel__footer">
          <button
            type="button"
            className="torneo-express-btn torneo-express-btn--outline"
            onClick={() => void handleCopy()}
          >
            {copied ? "¡Copiado! ✓" : "📋 Copiar resultados"}
          </button>
        </div>
      )}
    </div>
  );
};
