import React from "react";
import type { PartidoSetScore, TorneoExpressBundle } from "../../lib/torneoExpress/types";
import { torneoExpressFaseLabel } from "../../lib/torneoExpress/labels";
import { BracketCuadroPanel } from "./BracketCuadroPanel";
import { PartidosEliminatoria } from "./PartidosEliminatoria";
import { Badge } from "../ui";

interface GestionEliminatoriaProps {
  bundle: TorneoExpressBundle;
  labelMap: Record<string, string>;
  editable: boolean;
  savingEliminatoriaId: string | null;
  savingEliminatoriaCanchaId: string | null;
  savingEliminatoriaProgramadoId: string | null;
  onSaveResultado: (
    partidoId: string,
    sets: PartidoSetScore[]
  ) => Promise<void>;
  onSaveCancha: (partidoId: string, cancha: string | null) => Promise<void>;
  onSaveProgramado: (
    partidoId: string,
    programadoEn: string | null
  ) => Promise<void>;
}

export const GestionEliminatoria: React.FC<GestionEliminatoriaProps> = ({
  bundle,
  labelMap,
  editable,
  savingEliminatoriaId,
  savingEliminatoriaCanchaId,
  savingEliminatoriaProgramadoId,
  onSaveResultado,
  onSaveCancha,
  onSaveProgramado,
}) => {
  const fase = bundle.torneo.fase_eliminacion ?? "cuartos";
  const faseLabel = torneoExpressFaseLabel(bundle.torneo.fase_torneo);
  const cerrado = bundle.torneo.fase_torneo === "cerrado";

  return (
    <div className="torneo-express-card te-grupos-card te-gestion-card te-elim-gestion">
      <div className="te-elim-gestion__head">
        <h2 className="te-grupos-card__title te-label-section">
          Fase eliminatoria
        </h2>
        {faseLabel ? (
          <Badge variant={cerrado ? "finished" : "live"}>{faseLabel}</Badge>
        ) : null}
      </div>

      <div className="te-gestion-layout te-gestion-layout--elim">
        <section className="te-gestion-layout__partidos">
          <h3 className="te-grupos-card__partidos-title te-label-section">
            Partidos
          </h3>
          <p className="te-grupos-card__partidos-hint">
            {cerrado
              ? "Torneo finalizado. Puedes corregir resultados si hace falta."
              : "Al completar una ronda se generan los cruces siguientes. El torneo solo se cierra cuando confirmes «Finalizar torneo»."}
          </p>
          <PartidosEliminatoria
            partidos={bundle.eliminatoriaPartidos}
            fase={fase}
            labelMap={labelMap}
            editable
            savingPartidoId={savingEliminatoriaId}
            savingCanchaId={savingEliminatoriaCanchaId}
            savingProgramadoId={savingEliminatoriaProgramadoId}
            onSaveResultado={onSaveResultado}
            onSaveCancha={onSaveCancha}
            onSaveProgramado={onSaveProgramado}
          />
        </section>

        <aside className="te-gestion-layout__aside">
          <h3 className="te-grupos-card__standings-title te-label-section">
            Cuadro
          </h3>
          <p className="te-grupos-card__standings-hint">
            Vista del bracket confirmado con resultados en vivo.
          </p>
          <BracketCuadroPanel
            bracketSlots={bundle.torneo.bracket_slots}
            fase={fase}
            partidos={bundle.eliminatoriaPartidos}
            labelMap={labelMap}
          />
        </aside>
      </div>
    </div>
  );
};
