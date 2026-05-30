import React, { useMemo, useState } from "react";
import {
  canchaDraftFromStored,
  formatCanchaDisplay,
  normalizeCanchaForSave,
} from "../../lib/torneoExpress/canchaDisplay";
import {
  labelRondaEliminatoria,
  partidosDeRonda,
  totalRondasEliminatoria,
} from "../../lib/torneoExpress/bracketRounds";
import { parejaLabelFromMap } from "../../lib/torneoExpress/eliminatoriaLabels";
import {
  formatPartidoFecha,
  formatPartidoHora,
  partidoScheduleIso,
  programadoDraftFromPartido,
  programadoIsoFromDraft,
} from "../../lib/torneoExpress/partidoSchedule";
import type {
  PartidoSetScore,
  TorneoExpressEliminatoriaPartido,
  TorneoExpressFaseEliminacion,
  TorneoExpressPartido,
} from "../../lib/torneoExpress/types";
import { Badge, Button } from "../ui";
import { PartidoSetsResultModal } from "./PartidoSetsResultModal";
import { PartidoSetsScoreDisplay } from "./PartidoSetsScoreDisplay";

interface PartidosEliminatoriaProps {
  partidos: TorneoExpressEliminatoriaPartido[];
  fase: TorneoExpressFaseEliminacion;
  labelMap: Record<string, string>;
  editable?: boolean;
  savingPartidoId?: string | null;
  savingCanchaId?: string | null;
  savingProgramadoId?: string | null;
  onSaveResultado?: (
    partidoId: string,
    sets: PartidoSetScore[]
  ) => Promise<void>;
  onSaveCancha?: (partidoId: string, cancha: string | null) => Promise<void>;
  onSaveProgramado?: (
    partidoId: string,
    programadoEn: string | null
  ) => Promise<void>;
}

function asSchedulePartido(
  p: TorneoExpressEliminatoriaPartido
): TorneoExpressPartido {
  return {
    id: p.id,
    grupo_id: "",
    pareja_local_id: p.pareja_local_id ?? "",
    pareja_visitante_id: p.pareja_visitante_id ?? "",
    puntos_local: p.puntos_local,
    puntos_visitante: p.puntos_visitante,
    sets_resultado: p.sets_resultado,
    ganador_id: p.ganador_id,
    estado: p.estado,
    cancha: p.cancha,
    programado_en: p.programado_en,
    created_at: p.created_at,
  };
}

function EliminatoriaPartidoCard({
  partido,
  localLabel,
  visitLabel,
  editable,
  saving,
  savingCancha,
  savingProgramado,
  onSave,
  onSaveCancha,
  onSaveProgramado,
}: {
  partido: TorneoExpressEliminatoriaPartido;
  localLabel: string;
  visitLabel: string;
  editable: boolean;
  saving: boolean;
  savingCancha: boolean;
  savingProgramado: boolean;
  onSave?: PartidosEliminatoriaProps["onSaveResultado"];
  onSaveCancha?: PartidosEliminatoriaProps["onSaveCancha"];
  onSaveProgramado?: PartidosEliminatoriaProps["onSaveProgramado"];
}) {
  const played = partido.estado === "jugado";
  const [setsModalOpen, setSetsModalOpen] = useState(false);
  const [canchaEditOpen, setCanchaEditOpen] = useState(false);
  const [horarioEditOpen, setHorarioEditOpen] = useState(false);
  const [canchaDraft, setCanchaDraft] = useState(() =>
    canchaDraftFromStored(partido.cancha)
  );
  const schedulePartido = asSchedulePartido(partido);
  const initialSchedule = programadoDraftFromPartido(schedulePartido);
  const [draftDate, setDraftDate] = useState(initialSchedule.date);
  const [draftTime, setDraftTime] = useState(initialSchedule.time);

  const localWins =
    played && partido.ganador_id === partido.pareja_local_id;
  const visitWins =
    played && partido.ganador_id === partido.pareja_visitante_id;

  const leftLabel = played && visitWins ? visitLabel : localLabel;
  const rightLabel = played && visitWins ? localLabel : visitLabel;
  const leftWins = played && visitWins ? visitWins : localWins;
  const rightWins = played && visitWins ? localWins : visitWins;

  const metaBusy = savingCancha || savingProgramado;
  const canchaLabel = formatCanchaDisplay(partido.cancha);
  const hasCancha =
    canchaLabel.trim() !== "" && canchaLabel !== "Por asignar";
  const scheduleIso = partidoScheduleIso(schedulePartido);
  const fechaLabel = formatPartidoFecha(scheduleIso);
  const horaLabel = formatPartidoHora(scheduleIso);
  const canEditResult = editable && onSave && !partido.es_bye;

  if (partido.es_bye) {
    const ganador =
      partido.ganador_id === partido.pareja_local_id
        ? localLabel
        : visitLabel;
    return (
      <div className="te-partido-card te-partido-card--bye">
        <div className="te-partido-card__head">
          <Badge variant="finished">BYE</Badge>
        </div>
        <p className="te-elim-bye-label">
          Pasa directo: <strong>{ganador}</strong>
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className={`te-partido-card${
          canEditResult && !played ? " te-partido-card--clickable" : ""
        }`}
        onClick={() => {
          if (canEditResult && !played) setSetsModalOpen(true);
        }}
        onKeyDown={(e) => {
          if (
            canEditResult &&
            !played &&
            (e.key === "Enter" || e.key === " ")
          ) {
            e.preventDefault();
            setSetsModalOpen(true);
          }
        }}
        role={canEditResult && !played ? "button" : undefined}
        tabIndex={canEditResult && !played ? 0 : undefined}
      >
        <div className="te-partido-card__head">
          {played ? (
            <Badge variant="finished">✓ JUGADO</Badge>
          ) : (
            <Badge variant="pending">PENDIENTE</Badge>
          )}
        </div>

        <div className="te-partido-meta-chips">
          {onSaveProgramado ? (
            <button
              type="button"
              className="te-partido-chip"
              disabled={metaBusy}
              onClick={(e) => {
                e.stopPropagation();
                setHorarioEditOpen(true);
              }}
            >
              <span className="te-partido-chip__icon" aria-hidden>
                📅
              </span>
              {fechaLabel}
            </button>
          ) : (
            <span className="te-partido-chip">
              <span className="te-partido-chip__icon" aria-hidden>
                📅
              </span>
              {fechaLabel}
            </span>
          )}
          {onSaveProgramado ? (
            <button
              type="button"
              className="te-partido-chip"
              disabled={metaBusy}
              onClick={(e) => {
                e.stopPropagation();
                setHorarioEditOpen(true);
              }}
            >
              <span className="te-partido-chip__icon" aria-hidden>
                🕐
              </span>
              {horaLabel}
            </button>
          ) : (
            <span className="te-partido-chip">
              <span className="te-partido-chip__icon" aria-hidden>
                🕐
              </span>
              {horaLabel}
            </span>
          )}
          {hasCancha ? (
            onSaveCancha ? (
              <button
                type="button"
                className="te-partido-chip te-partido-chip--cancha"
                disabled={metaBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  setCanchaEditOpen(true);
                }}
              >
                <span className="te-partido-chip__icon" aria-hidden>
                  📍
                </span>
                {canchaLabel}
              </button>
            ) : (
              <span className="te-partido-chip te-partido-chip--cancha">
                <span className="te-partido-chip__icon" aria-hidden>
                  📍
                </span>
                {canchaLabel}
              </span>
            )
          ) : onSaveCancha ? (
            <button
              type="button"
              className="te-partido-chip te-partido-chip--cancha te-partido-chip--muted"
              disabled={metaBusy}
              onClick={(e) => {
                e.stopPropagation();
                setCanchaEditOpen(true);
              }}
            >
              Asignar cancha
            </button>
          ) : null}
        </div>

        <div className="te-partido-matchup">
          <span
            className={`te-partido-team te-partido-team--local${
              leftWins
                ? " te-partido-team--winner"
                : rightWins
                  ? " te-partido-team--loser"
                  : ""
            }`}
          >
            {leftWins ? (
              <span className="te-partido-winner-mark" aria-hidden>
                ✓{" "}
              </span>
            ) : null}
            {leftLabel}
          </span>

          {played ? (
            <PartidoSetsScoreDisplay
              partido={partido}
              variant="inline"
              className="te-partido-score-center"
            />
          ) : (
            <span className="te-partido-score-center is-pending">—</span>
          )}

          <span
            className={`te-partido-team te-partido-team--visit${
              rightWins
                ? " te-partido-team--winner"
                : leftWins
                  ? " te-partido-team--loser"
                  : ""
            }`}
          >
            {rightWins ? (
              <span className="te-partido-winner-mark" aria-hidden>
                ✓{" "}
              </span>
            ) : null}
            {rightLabel}
          </span>
        </div>

        {(horarioEditOpen || canchaEditOpen) && (
          <div
            className="te-partido-meta-edit"
            onClick={(e) => e.stopPropagation()}
          >
            {horarioEditOpen && onSaveProgramado ? (
              <div className="te-partido-meta-edit__section">
                <p className="te-partido-meta-edit__heading">Fecha y hora</p>
                <div className="te-partido-meta-edit__row">
                  <label className="te-partido-meta-edit__field">
                    <span className="te-partido-meta-edit__field-label">
                      Fecha
                    </span>
                    <input
                      type="date"
                      className="te-partido-meta-edit__input"
                      value={draftDate}
                      disabled={savingProgramado}
                      onChange={(e) => setDraftDate(e.target.value)}
                    />
                  </label>
                  <label className="te-partido-meta-edit__field">
                    <span className="te-partido-meta-edit__field-label">
                      Hora
                    </span>
                    <input
                      type="time"
                      className="te-partido-meta-edit__input"
                      value={draftTime}
                      disabled={savingProgramado}
                      onChange={(e) => setDraftTime(e.target.value)}
                    />
                  </label>
                </div>
                <div className="te-partido-meta-edit__actions">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={savingProgramado}
                    disabled={savingProgramado}
                    onClick={() => {
                      const iso = programadoIsoFromDraft(draftDate, draftTime);
                      void onSaveProgramado(partido.id, iso).then(() =>
                        setHorarioEditOpen(false)
                      );
                    }}
                  >
                    Guardar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setHorarioEditOpen(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}
            {canchaEditOpen && onSaveCancha ? (
              <div className="te-partido-meta-edit__section">
                <p className="te-partido-meta-edit__heading">Cancha</p>
                <label className="te-partido-meta-edit__field te-partido-meta-edit__field--full">
                  <input
                    type="text"
                    className="te-partido-meta-edit__input"
                    value={canchaDraft}
                    maxLength={24}
                    disabled={savingCancha}
                    onChange={(e) => setCanchaDraft(e.target.value)}
                  />
                </label>
                <div className="te-partido-meta-edit__actions">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={savingCancha}
                    disabled={savingCancha}
                    onClick={() => {
                      void onSaveCancha(
                        partido.id,
                        normalizeCanchaForSave(canchaDraft)
                      ).then(() => setCanchaEditOpen(false));
                    }}
                  >
                    Guardar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setCanchaEditOpen(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {canEditResult && played ? (
          <div className="te-partido-actions te-partido-actions--corner">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="te-partido-edit-btn"
              onClick={(e) => {
                e.stopPropagation();
                setSetsModalOpen(true);
              }}
            >
              Editar resultado
            </Button>
          </div>
        ) : null}

        {canEditResult && !played ? (
          <div className="te-partido-actions">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setSetsModalOpen(true);
              }}
            >
              Capturar resultado
            </Button>
          </div>
        ) : null}
      </div>

      {canEditResult ? (
        <PartidoSetsResultModal
          open={setsModalOpen}
          onClose={() => setSetsModalOpen(false)}
          localLabel={localLabel}
          visitLabel={visitLabel}
          initialPartido={partido}
          saving={saving}
          onSave={(sets) => onSave!(partido.id, sets)}
        />
      ) : null}
    </>
  );
}

export const PartidosEliminatoria: React.FC<PartidosEliminatoriaProps> = ({
  partidos,
  fase,
  labelMap,
  editable = false,
  savingPartidoId,
  savingCanchaId,
  savingProgramadoId,
  onSaveResultado,
  onSaveCancha,
  onSaveProgramado,
}) => {
  const totalRondas = totalRondasEliminatoria(fase);
  const rondas = useMemo(() => {
    const set = new Set(partidos.map((p) => p.ronda));
    return Array.from(set).sort((a, b) => a - b);
  }, [partidos]);

  const [activeRonda, setActiveRonda] = useState<number | null>(null);
  const rondaVisible = activeRonda ?? rondas[rondas.length - 1] ?? 1;

  if (partidos.length === 0) {
    return (
      <p className="te-grupos-card__partidos-hint">
        Aún no hay partidos eliminatorios. Confirma el cuadro desde «Finalizar
        fase».
      </p>
    );
  }

  const partidosRonda = partidosDeRonda(partidos, rondaVisible);

  return (
    <div className="te-elim-partidos">
      <div
        className="te-grupos-card__tabs te-elim-rondas-tabs"
        role="tablist"
        aria-label="Rondas eliminatorias"
      >
        {Array.from({ length: totalRondas }, (_, i) => i + 1).map((r) => {
          const exists = rondas.includes(r);
          return (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === rondaVisible}
              disabled={!exists}
              className={`te-grupos-tab${
                r === rondaVisible ? " te-grupos-tab--active" : ""
              }${!exists ? " te-grupos-tab--disabled" : ""}`}
              onClick={() => setActiveRonda(r)}
            >
              {labelRondaEliminatoria(fase, r, totalRondas)}
            </button>
          );
        })}
      </div>

      <div className="te-partidos-list">
        {partidosRonda.map((p) => (
          <EliminatoriaPartidoCard
            key={p.id}
            partido={p}
            localLabel={parejaLabelFromMap(labelMap, p.pareja_local_id)}
            visitLabel={parejaLabelFromMap(labelMap, p.pareja_visitante_id)}
            editable={editable}
            saving={savingPartidoId === p.id}
            savingCancha={savingCanchaId === p.id}
            savingProgramado={savingProgramadoId === p.id}
            onSave={onSaveResultado}
            onSaveCancha={onSaveCancha}
            onSaveProgramado={onSaveProgramado}
          />
        ))}
      </div>
    </div>
  );
};
