import React, { useState } from "react";
import type {
  PartidoSetScore,
  TorneoExpressBundle,
} from "../../lib/torneoExpress/types";
import { torneoExpressFaseLabel } from "../../lib/torneoExpress/labels";
import { PartidosEliminatoria } from "./PartidosEliminatoria";
import { TeReprogramarEliminatoriaModal } from "./TeReprogramarEliminatoriaModal";
import { Badge } from "../ui";

interface GestionEliminatoriaProps {
  bundle: TorneoExpressBundle;
  labelMap: Record<string, string>;
  editable: boolean;
  savingEliminatoriaId: string | null;
  savingEliminatoriaCanchaId: string | null;
  savingEliminatoriaProgramadoId: string | null;
  savingEliminatoriaReprogramacion?: boolean;
  onSaveResultado: (
    partidoId: string,
    sets: PartidoSetScore[]
  ) => Promise<void>;
  onSaveCancha: (partidoId: string, cancha: string | null) => Promise<void>;
  onSaveProgramado: (
    partidoId: string,
    programadoEn: string | null
  ) => Promise<void>;
  onRescheduleRonda?: (
    ronda: number,
    schedule: {
      playDate: string;
      startTime: string;
      durationMinutes: number;
      courtNames: string[];
    }
  ) => Promise<number>;
  onRescheduleToast?: (message: string, tone: "success" | "error") => void;
}

export const GestionEliminatoria: React.FC<GestionEliminatoriaProps> = ({
  bundle,
  labelMap,
  editable,
  savingEliminatoriaId,
  savingEliminatoriaCanchaId,
  savingEliminatoriaProgramadoId,
  savingEliminatoriaReprogramacion = false,
  onSaveResultado,
  onSaveCancha,
  onSaveProgramado,
  onRescheduleRonda,
  onRescheduleToast,
}) => {
  const fase = bundle.torneo.fase_eliminacion ?? "cuartos";
  const faseLabel = torneoExpressFaseLabel(bundle.torneo.fase_torneo);
  const cerrado =
    bundle.torneo.fase_torneo === "cerrado" ||
    bundle.torneo.estado === "finalizado";

  const [reprogramOpen, setReprogramOpen] = useState(false);
  const [reprogramRonda, setReprogramRonda] = useState<number | null>(null);
  const [reprogramLabel, setReprogramLabel] = useState("");

  const canBulkSchedule =
    editable && !cerrado && Boolean(onRescheduleRonda);

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
              ? "Torneo cerrado. Los resultados ya no se pueden modificar."
              : "Al completar una ronda se generan los cruces siguientes. Usa «Editar programación» en octavos, cuartos, semis o final para fijar día, hora y canchas. El torneo solo se cierra cuando confirmes «Finalizar torneo»."}
          </p>
          <PartidosEliminatoria
            partidos={bundle.eliminatoriaPartidos}
            fase={fase}
            bracketSlots={bundle.torneo.bracket_slots}
            labelMap={labelMap}
            editable={editable && !cerrado}
            savingPartidoId={savingEliminatoriaId}
            savingCanchaId={savingEliminatoriaCanchaId}
            savingProgramadoId={savingEliminatoriaProgramadoId}
            partidoFormato={bundle.partido_formato}
            onSaveResultado={editable && !cerrado ? onSaveResultado : undefined}
            onSaveCancha={onSaveCancha}
            onSaveProgramado={onSaveProgramado}
            onEditRoundSchedule={
              canBulkSchedule
                ? (ronda, label) => {
                    setReprogramRonda(ronda);
                    setReprogramLabel(label);
                    setReprogramOpen(true);
                  }
                : undefined
            }
          />
        </section>
      </div>

      {reprogramRonda != null && onRescheduleRonda ? (
        <TeReprogramarEliminatoriaModal
          open={reprogramOpen}
          saving={savingEliminatoriaReprogramacion}
          rondaLabel={reprogramLabel}
          partidos={bundle.eliminatoriaPartidos}
          ronda={reprogramRonda}
          onCancel={() => setReprogramOpen(false)}
          onConfirm={(schedule) => {
            void onRescheduleRonda(reprogramRonda, schedule)
              .then((count) => {
                setReprogramOpen(false);
                onRescheduleToast?.(
                  `Programación de ${reprogramLabel} actualizada en ${count} partido${
                    count === 1 ? "" : "s"
                  }.`,
                  "success"
                );
              })
              .catch((e) => {
                onRescheduleToast?.(
                  e instanceof Error
                    ? e.message
                    : "No se pudo aplicar la programación. Revisa los datos.",
                  "error"
                );
              });
          }}
        />
      ) : null}
    </div>
  );
};
