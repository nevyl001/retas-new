import React, { useEffect, useMemo, useState } from "react";
import type { TorneoExpressGrupoPareja, TorneoExpressPartido } from "../../lib/torneoExpress/types";

interface PartidosGrupoProps {
  partidos: TorneoExpressPartido[];
  parejas: TorneoExpressGrupoPareja[];
  editable?: boolean;
  savingPartidoId?: string | null;
  onSaveResultado?: (
    partidoId: string,
    puntosLocal: number,
    puntosVisitante: number
  ) => Promise<void>;
}

function PartidoRow({
  partido,
  localLabel,
  visitLabel,
  editable,
  saving,
  onSave,
}: {
  partido: TorneoExpressPartido;
  localLabel: string;
  visitLabel: string;
  editable: boolean;
  saving: boolean;
  onSave?: PartidosGrupoProps["onSaveResultado"];
}) {
  const [pl, setPl] = useState(String(partido.puntos_local ?? ""));
  const [pv, setPv] = useState(String(partido.puntos_visitante ?? ""));

  useEffect(() => {
    setPl(String(partido.puntos_local ?? ""));
    setPv(String(partido.puntos_visitante ?? ""));
  }, [partido.id, partido.puntos_local, partido.puntos_visitante, partido.estado]);

  const played = partido.estado === "jugado";

  return (
    <div className="te-partido-row">
      <div>
        <strong>{localLabel}</strong>
        <span style={{ margin: "0 0.35rem", opacity: 0.6 }}>vs</span>
        <strong>{visitLabel}</strong>
      </div>
      <span
        className={
          played ? "te-partido-status te-partido-status--jugado" : "te-partido-status"
        }
      >
        {played ? "Jugado" : "Pendiente"}
      </span>
      {editable && onSave ? (
        <>
          <div className="te-score-inputs">
            <input
              type="number"
              min={0}
              value={pl}
              onChange={(e) => setPl(e.target.value)}
              aria-label={`Puntos ${localLabel}`}
            />
            <span>-</span>
            <input
              type="number"
              min={0}
              value={pv}
              onChange={(e) => setPv(e.target.value)}
              aria-label={`Puntos ${visitLabel}`}
            />
          </div>
          <button
            type="button"
            className="torneo-express-btn torneo-express-btn--primary"
            disabled={saving}
            onClick={() => onSave(partido.id, Number(pl) || 0, Number(pv) || 0)}
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </>
      ) : (
        <div className="te-score-inputs">
          <strong>
            {played
              ? `${partido.puntos_local} - ${partido.puntos_visitante}`
              : "—"}
          </strong>
        </div>
      )}
    </div>
  );
}

export const PartidosGrupo: React.FC<PartidosGrupoProps> = ({
  partidos,
  parejas,
  editable = false,
  savingPartidoId,
  onSaveResultado,
}) => {
  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    parejas.forEach((p) =>
      m.set(p.pareja_id, p.pareja_display ?? p.pareja_id)
    );
    return m;
  }, [parejas]);

  if (partidos.length === 0) {
    return <p style={{ color: "var(--te-muted)" }}>Sin partidos en este grupo.</p>;
  }

  return (
    <>
      {partidos.map((partido) => (
        <PartidoRow
          key={partido.id}
          partido={partido}
          localLabel={labelById.get(partido.pareja_local_id) ?? "Local"}
          visitLabel={labelById.get(partido.pareja_visitante_id) ?? "Visitante"}
          editable={editable}
          saving={savingPartidoId === partido.id}
          onSave={onSaveResultado}
        />
      ))}
    </>
  );
};
