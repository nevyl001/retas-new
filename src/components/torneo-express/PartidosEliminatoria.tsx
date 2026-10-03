import React, { useMemo, useState } from "react";
import {
  canchaDraftFromStored,
  formatCanchaDisplay,
  normalizeCanchaForSave,
} from "../../lib/torneoExpress/canchaDisplay";
import {
  isRondaTercerLugar,
  labelRondaEliminatoria,
  partidosDeRonda,
  eliminatoriaBracketSize,
  totalRondasEliminatoria,
} from "../../lib/torneoExpress/bracketRounds";
import { eliminatoriaRoundPendingCount } from "../../lib/torneoExpress/eliminatoriaRoundSchedule";
import { parejaLabelFromMap } from "../../lib/torneoExpress/eliminatoriaLabels";
import {
  formatCourtOccupiedError,
  formatCourtSwapPrompt,
  type TeCourtCheckPartido,
} from "../../lib/torneoExpress/courtCheckScope";
import {
  findPartidoCourtSlotConflict,
  planCanchaChange,
  planProgramadoChange,
  PARTIDO_CANCHA_OCUPADA_MSG,
  type CanchaChangePlan,
  type ProgramadoChangePlan,
} from "../../lib/torneoExpress/partidoCourtSlotConflict";
import {
  formatPartidoFecha,
  formatPartidoHora,
  partidoScheduleIso,
  programadoDraftFromPartido,
  programadoIsoFromDraft,
} from "../../lib/torneoExpress/partidoSchedule";
import { matchWinnerSideFromPartido } from "../../lib/torneoExpress/partidoSets";
import type {
  PartidoSetScore,
  TorneoExpressEliminatoriaPartido,
  TorneoExpressFaseEliminacion,
  TorneoExpressPartido,
  TorneoExpressPartidoFormato,
} from "../../lib/torneoExpress/types";
import { Badge, Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import { PartidoSetsResultModal } from "./PartidoSetsResultModal";
import { PartidoSetsScoreDisplay } from "./PartidoSetsScoreDisplay";

interface PartidosEliminatoriaProps {
  partidos: TorneoExpressEliminatoriaPartido[];
  fase: TorneoExpressFaseEliminacion;
  bracketSlots?: unknown;
  labelMap: Record<string, string>;
  editable?: boolean;
  savingPartidoId?: string | null;
  savingCanchaId?: string | null;
  savingProgramadoId?: string | null;
  partidoFormato?: TorneoExpressPartidoFormato;
  courtCheckScope?: Array<TorneoExpressPartido | TeCourtCheckPartido>;
  onSaveResultado?: (
    partidoId: string,
    sets: PartidoSetScore[]
  ) => Promise<void>;
  onSaveCancha?: (partidoId: string, cancha: string | null) => Promise<void>;
  onSaveProgramado?: (
    partidoId: string,
    programadoEn: string | null
  ) => Promise<void>;
  /** Abre el editor de programación masiva de la ronda visible. */
  onEditRoundSchedule?: (ronda: number, rondaLabel: string) => void;
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
  matchNumber,
  courtCheckScope,
  onSave,
  onSaveCancha,
  onSaveProgramado,
  partidoFormato = "flexible",
}: {
  partido: TorneoExpressEliminatoriaPartido;
  localLabel: string;
  visitLabel: string;
  editable: boolean;
  saving: boolean;
  savingCancha: boolean;
  savingProgramado: boolean;
  matchNumber: number;
  courtCheckScope: Array<TorneoExpressPartido | TeCourtCheckPartido>;
  onSave?: PartidosEliminatoriaProps["onSaveResultado"];
  onSaveCancha?: PartidosEliminatoriaProps["onSaveCancha"];
  onSaveProgramado?: PartidosEliminatoriaProps["onSaveProgramado"];
  partidoFormato?: TorneoExpressPartidoFormato;
}) {
  const played = partido.estado === "jugado";
  const [setsModalOpen, setSetsModalOpen] = useState(false);
  const [canchaEditOpen, setCanchaEditOpen] = useState(false);
  const [horarioEditOpen, setHorarioEditOpen] = useState(false);
  const [canchaDraft, setCanchaDraft] = useState(() =>
    canchaDraftFromStored(partido.cancha)
  );
  const [canchaError, setCanchaError] = useState<string | null>(null);
  const [horarioError, setHorarioError] = useState<string | null>(null);
  const [swapPrompt, setSwapPrompt] = useState<string | null>(null);
  const [pendingSwapIso, setPendingSwapIso] = useState<string | null>(null);
  const schedulePartido = asSchedulePartido(partido);
  const initialSchedule = programadoDraftFromPartido(schedulePartido);
  const [draftDate, setDraftDate] = useState(initialSchedule.date);
  const [draftTime, setDraftTime] = useState(initialSchedule.time);

  const persistHorario = (next: string | null) => {
    if (!onSaveProgramado) return;
    setHorarioError(null);
    setSwapPrompt(null);
    setPendingSwapIso(null);
    void onSaveProgramado(partido.id, next)
      .then(() => setHorarioEditOpen(false))
      .catch((e) => {
        setHorarioError(
          e instanceof Error ? e.message : "No se pudo guardar fecha y hora"
        );
      });
  };

  const guardarHorario = () => {
    if (!onSaveProgramado) return;
    const next = programadoIsoFromDraft(draftDate, draftTime);
    if (!next) {
      setHorarioError("Revisa la fecha y la hora");
      return;
    }
    if (courtCheckScope.length === 0) {
      persistHorario(next);
      return;
    }
    let plan: ProgramadoChangePlan;
    try {
      plan = planProgramadoChange(schedulePartido, next, courtCheckScope);
    } catch (e) {
      const hit = findPartidoCourtSlotConflict(
        partido.id,
        next,
        partido.cancha,
        courtCheckScope
      );
      setSwapPrompt(null);
      setPendingSwapIso(null);
      setHorarioError(
        hit
          ? formatCourtOccupiedError(hit)
          : e instanceof Error
            ? e.message
            : PARTIDO_CANCHA_OCUPADA_MSG
      );
      return;
    }
    if (plan.kind === "noop") {
      setHorarioEditOpen(false);
      return;
    }
    if (plan.kind === "swap") {
      const swapWithId = plan.swapWithId;
      const occupiedIso = plan.programado_en;
      const freedIso = plan.swapProgramadoEn;
      const conflict =
        courtCheckScope.find((p) => p.id === swapWithId) ?? schedulePartido;
      setHorarioError(null);
      setPendingSwapIso(occupiedIso);
      setSwapPrompt(
        formatCourtSwapPrompt({
          occupiedProgramadoEn: occupiedIso,
          freedProgramadoEn: freedIso,
          conflict,
        })
      );
      return;
    }
    persistHorario(plan.programado_en);
  };

  const guardarCancha = () => {
    if (!onSaveCancha) return;
    const next = normalizeCanchaForSave(canchaDraft);
    if (courtCheckScope.length === 0) {
      void onSaveCancha(partido.id, next)
        .then(() => setCanchaEditOpen(false))
        .catch((e) => {
          setCanchaError(
            e instanceof Error ? e.message : PARTIDO_CANCHA_OCUPADA_MSG
          );
        });
      return;
    }
    let plan: CanchaChangePlan;
    try {
      plan = planCanchaChange(schedulePartido, next, courtCheckScope);
    } catch (e) {
      const hit = findPartidoCourtSlotConflict(
        partido.id,
        partidoScheduleIso(schedulePartido),
        next,
        courtCheckScope
      );
      setCanchaError(
        hit
          ? formatCourtOccupiedError(hit)
          : e instanceof Error
            ? e.message
            : PARTIDO_CANCHA_OCUPADA_MSG
      );
      return;
    }
    if (plan.kind === "noop") {
      setCanchaEditOpen(false);
      return;
    }
    setCanchaError(null);
    void onSaveCancha(partido.id, plan.cancha)
      .then(() => setCanchaEditOpen(false))
      .catch((e) => {
        setCanchaError(
          e instanceof Error ? e.message : "No se pudo guardar la cancha"
        );
      });
  };

  const winnerSide = played ? matchWinnerSideFromPartido(partido) : null;
  const localWins = winnerSide === "local";
  const visitWins = winnerSide === "visitante";

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
      <div className="te-partido-card te-elim-partido-card te-partido-card--bye">
        <div className="te-partido-card__head">
          <span className="te-elim-partido-card__number">
            Partido {matchNumber}
          </span>
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
        className={`te-partido-card te-elim-partido-card${
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
          <span className="te-elim-partido-card__number">
            Partido {matchNumber}
          </span>
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
                <TablerIcon name="calendar" size={14} />
              </span>
              {fechaLabel}
            </button>
          ) : (
            <span className="te-partido-chip">
              <span className="te-partido-chip__icon" aria-hidden>
                <TablerIcon name="calendar" size={14} />
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
                <TablerIcon name="clock" size={14} />
              </span>
              {horaLabel}
            </button>
          ) : (
            <span className="te-partido-chip">
              <span className="te-partido-chip__icon" aria-hidden>
                <TablerIcon name="clock" size={14} />
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
                  <TablerIcon name="map-pin" size={14} />
                </span>
                {canchaLabel}
              </button>
            ) : (
              <span className="te-partido-chip te-partido-chip--cancha">
                <span className="te-partido-chip__icon" aria-hidden>
                  <TablerIcon name="map-pin" size={14} />
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
              localWins
                ? " te-partido-team--winner"
                : visitWins
                  ? " te-partido-team--loser"
                  : ""
            }`}
          >
            {localWins ? (
              <span className="te-partido-winner-mark" aria-hidden>
                ✓{" "}
              </span>
            ) : null}
            {localLabel}
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
              visitWins
                ? " te-partido-team--winner"
                : localWins
                  ? " te-partido-team--loser"
                  : ""
            }`}
          >
            {visitWins ? (
              <span className="te-partido-winner-mark" aria-hidden>
                ✓{" "}
              </span>
            ) : null}
            {visitLabel}
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
                {swapPrompt ? (
                  <p className="te-partido-meta-edit__confirm" role="status">
                    {swapPrompt}
                  </p>
                ) : null}
                <div className="te-partido-meta-edit__actions">
                  {swapPrompt ? (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={savingProgramado}
                        disabled={savingProgramado}
                        onClick={() => {
                          if (pendingSwapIso) persistHorario(pendingSwapIso);
                        }}
                      >
                        Intercambiar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={savingProgramado}
                        onClick={() => {
                          setSwapPrompt(null);
                          setPendingSwapIso(null);
                        }}
                      >
                        No intercambiar
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={savingProgramado}
                        disabled={savingProgramado}
                        onClick={guardarHorario}
                      >
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setHorarioEditOpen(false);
                          setHorarioError(null);
                          setSwapPrompt(null);
                          setPendingSwapIso(null);
                        }}
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
                {horarioError ? (
                  <p className="te-partido-meta-edit__error">{horarioError}</p>
                ) : null}
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
                    onChange={(e) => {
                      setCanchaDraft(e.target.value);
                      setCanchaError(null);
                    }}
                  />
                </label>
                <div className="te-partido-meta-edit__actions">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    loading={savingCancha}
                    disabled={savingCancha}
                    onClick={guardarCancha}
                  >
                    Guardar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setCanchaEditOpen(false);
                      setCanchaError(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
                {canchaError ? (
                  <p className="te-partido-meta-edit__error">{canchaError}</p>
                ) : null}
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
              Corregir resultado
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
          partidoFormato={partidoFormato}
          allowDraw={false}
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
  bracketSlots,
  labelMap,
  editable = false,
  savingPartidoId,
  savingCanchaId,
  savingProgramadoId,
  partidoFormato = "flexible",
  courtCheckScope = [],
  onSaveResultado,
  onSaveCancha,
  onSaveProgramado,
  onEditRoundSchedule,
}) => {
  const bracketSize = eliminatoriaBracketSize(fase, bracketSlots);
  const totalRondas = totalRondasEliminatoria(fase, bracketSize);
  const rondas = useMemo(() => {
    const set = new Set(partidos.map((p) => p.ronda));
    return Array.from(set).sort((a, b) => {
      if (isRondaTercerLugar(a)) return 1;
      if (isRondaTercerLugar(b)) return -1;
      return a - b;
    });
  }, [partidos]);

  const [activeRonda, setActiveRonda] = useState<number | null>(null);
  const rondaVisible = activeRonda ?? rondas[rondas.length - 1] ?? 1;

  const labelForRonda = (r: number) =>
    isRondaTercerLugar(r)
      ? "Tercer lugar"
      : labelRondaEliminatoria(fase, r, totalRondas, bracketSize);

  if (partidos.length === 0) {
    return (
      <p className="te-grupos-card__partidos-hint">
        Aún no hay partidos eliminatorios. Confirma el cuadro desde «Finalizar
        fase».
      </p>
    );
  }

  const partidosRonda = partidosDeRonda(partidos, rondaVisible);
  const rondaLabel = labelForRonda(rondaVisible);
  const canEditRoundSchedule =
    Boolean(onEditRoundSchedule) &&
    eliminatoriaRoundPendingCount(partidos, rondaVisible) > 0;

  return (
    <div className="te-elim-partidos">
      <div className="te-gestion-section-head te-elim-rondas-head">
        <div
          className="te-grupos-card__tabs te-elim-rondas-tabs"
          role="tablist"
          aria-label="Rondas eliminatorias"
        >
          {rondas.map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={r === rondaVisible}
              className={`te-grupos-tab${
                r === rondaVisible ? " te-grupos-tab--active" : ""
              }`}
              onClick={() => setActiveRonda(r)}
            >
              {labelForRonda(r)}
            </button>
          ))}
        </div>
        {canEditRoundSchedule ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="te-gestion-edit-schedule-btn"
            onClick={() => onEditRoundSchedule?.(rondaVisible, rondaLabel)}
          >
            Editar programación
          </Button>
        ) : null}
      </div>

      <div className="te-partidos-list">
        {partidosRonda.map((p, index) => (
          <EliminatoriaPartidoCard
            key={p.id}
            partido={p}
            localLabel={parejaLabelFromMap(labelMap, p.pareja_local_id)}
            visitLabel={parejaLabelFromMap(labelMap, p.pareja_visitante_id)}
            editable={editable}
            saving={savingPartidoId === p.id}
            savingCancha={savingCanchaId === p.id}
            savingProgramado={savingProgramadoId === p.id}
            matchNumber={index + 1}
            courtCheckScope={courtCheckScope}
            onSave={onSaveResultado}
            onSaveCancha={onSaveCancha}
            onSaveProgramado={onSaveProgramado}
            partidoFormato={partidoFormato}
          />
        ))}
      </div>
    </div>
  );
};
