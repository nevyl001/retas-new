import React, { useEffect, useState } from "react";
import {
  fetchTorneoExpressBundle,
  formatSupabaseError,
} from "../../services/torneoExpressService";
import { buildStandingsGeneral } from "../../lib/torneoExpress/standings";
import type { StandingRowExpress, TorneoExpress } from "../../lib/torneoExpress/types";
import { TablaGeneral } from "./TablaGeneral";
import { Button } from "../ui";

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

interface TorneoExpressTablaGeneralPanelProps {
  torneo: TorneoExpress;
  onClose: () => void;
}

export const TorneoExpressTablaGeneralPanel: React.FC<
  TorneoExpressTablaGeneralPanelProps
> = ({ torneo, onClose }) => {
  const [rows, setRows] = useState<StandingRowExpress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetchTorneoExpressBundle(torneo.id)
      .then((bundle) => {
        if (!active) return;
        if (!bundle) {
          setError("No se encontró el torneo");
          setRows([]);
          return;
        }
        setRows(
          buildStandingsGeneral(
            bundle.grupos,
            bundle.parejasPorGrupo,
            bundle.partidosPorGrupo
          )
        );
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

  return (
    <div className="te-resultados-panel te-tabla-general-panel">
      <div className="te-resultados-panel__head">
        <div>
          <p className="te-resultados-panel__label">📋 TABLA GENERAL</p>
          <p className="te-resultados-panel__sub">
            {torneo.nombre} — {formatFecha(torneo.created_at)} · todos los grupos
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          aria-label="Cerrar tabla general"
        >
          Cerrar ✕
        </Button>
      </div>

      {loading && <p className="te-subtitle">Cargando tabla general…</p>}
      {error && <p className="te-error">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="te-subtitle">Sin datos para la tabla general.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <TablaGeneral rows={rows} />
      )}
    </div>
  );
};
