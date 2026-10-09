import React, { useEffect, useMemo, useState } from "react";
import {
  canchaDraftFromStored,
  formatCanchaDisplay,
  normalizeCanchaForSave,
} from "../../lib/torneoExpress/canchaDisplay";
import {
  isRondaTercerLugar,
  labelRondaEliminatoria,
  nextRoundSlotForCruce,
  partidosDeRonda,
  eliminatoriaBracketSize,
  eliminatoriaThirdPlaceMatchEnabled,
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
  planScheduleSlotChange,
  PARTIDO_CANCHA_OCUPADA_MSG,
  type ScheduleSlotChangePlan,
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
  onSaveProgramacion?: (
    partidoId: string,
    programadoEn: string,
    cancha: string
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
  onSaveProgramacion,
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
  onSaveProgramacion?: PartidosEliminatoriaProps["onSaveProgramacion"];
  partidoFormato?: TorneoExpressPartidoFormato;
}) {
  const played = partido.estado === "jugado";
  const [setsModalOpen, setSetsModalOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [horarioError, setHorarioError] = useState<string | null>(null);
  const [swapPrompt, setSwapPrompt] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<{
    programadoEn: string;
    cancha: string;
  } | null>(null);
  const schedulePartido = asSchedulePartido(partido);
  const initialSchedule = programadoDraftFromPartido(schedulePartido);
  const [draftDate, setDraftDate] = useState(initialSchedule.date);
  const [draftTime, setDraftTime] = useState(initialSchedule.time);
  const [draftCancha, setDraftCancha] = useState(() =>
    canchaDraftFromStored(partido.cancha)
  );

  useEffect(() => {
    if (editing) return;
    const next = programadoDraftFromPartido(asSchedulePartido(partido));
    setDraftDate(next.date);
    setDraftTime(next.time);
    setDraftCancha(canchaDraftFromStored(partido.cancha));
  }, [editing, partido]);

  const closeEdit = () => {
    const next = programadoDraftFromPartido(schedulePartido);
    setDraftDate(next.date);
    setDraftTime(next.time);
    setDraftCancha(canchaDraftFromStored(partido.cancha));
    setHorarioError(null);
    setSwapPrompt(null);
    setPendingSlot(null);
    setEditing(false);
  };

  const persistSlot = (programadoEn: string, cancha: string) => {
    if (!onSaveProgramacion) return;
    setHorarioError(null);
    setSwapPrompt(null);
    setPendingSlot(null);
    void onSaveProgramacion(partido.id, programadoEn, cancha)
      .then(() => closeEdit())
      .catch((e) => {
        setHorarioError(
          e instanceof Error ? e.message : "No se pudo guardar día, hora y cancha"
        );
      });
  };

  const guardarProgramacion = () => {
    if (!onSaveProgramacion) return;
    const next = programadoIsoFromDraft(draftDate, draftTime);
    if (!next) {
      setHorarioError("Revisa la fecha y la hora");
      setSwapPrompt(null);
      setPendingSlot(null);
      return;
    }
    const cancha = normalizeCanchaForSave(draftCancha);
    let plan: ScheduleSlotChangePlan;
    try {
      plan = planScheduleSlotChange(
        schedulePartido,
        next,
        cancha,
        courtCheckScope
      );
    } catch (e) {
      const hit = findPartidoCourtSlotConflict(
        partido.id,
        next,
        cancha,
        courtCheckScope
      );
      setSwapPrompt(null);
      setPendingSlot(null);
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
      closeEdit();
      return;
    }
    if (plan.kind === "swap") {
      const swap = plan;
      const conflict =
        courtCheckScope.find((p) => p.id === swap.swapWithId) ??
        schedulePartido;
      setHorarioError(null);
      setPendingSlot({
        programadoEn: swap.programado_en,
        cancha: swap.cancha,
      });
      setSwapPrompt(
        formatCourtSwapPrompt({
          occupiedProgramadoEn: swap.programado_en,
          freedProgramadoEn: swap.swapProgramadoEn,
          conflict,
          ownMatchup: `${localLabel} / ${visitLabel}`,
        })
      );
      return;
    }
    persistSlot(plan.programado_en, plan.cancha);
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
          {onSaveProgramacion ? (
            <button
              type="button"
              className="te-partido-chip"
              disabled={metaBusy}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
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
          {onSaveProgramacion ? (
            <button
              type="button"
              className="te-partido-chip"
              disabled={metaBusy}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
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
            onSaveProgramacion ? (
              <button
                type="button"
                className="te-partido-chip te-partido-chip--cancha"
                disabled={metaBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
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
          ) : onSaveProgramacion ? (
            <button
              type="button"
              className="te-partido-chip te-partido-chip--cancha te-partido-chip--muted"
              disabled={metaBusy}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
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

        {editing && onSaveProgramacion ? (
          <div
            className="te-partido-meta-edit"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="te-partido-meta-edit__section">
              <p className="te-partido-meta-edit__heading">Día, hora y cancha</p>
              <div className="te-partido-meta-edit__row">
                <label className="te-partido-meta-edit__field">
                  <span className="te-partido-meta-edit__field-label">
                    Fecha
                  </span>
                  <input
                    type="date"
                    className="te-partido-meta-edit__input"
                    value={draftDate}
                    disabled={metaBusy}
                    onChange={(e) => {
                      setDraftDate(e.target.value);
                      setSwapPrompt(null);
                      setPendingSlot(null);
                      setHorarioError(null);
                    }}
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
                    disabled={metaBusy}
                    onChange={(e) => {
                      setDraftTime(e.target.value);
                      setSwapPrompt(null);
                      setPendingSlot(null);
                      setHorarioError(null);
                    }}
                  />
                </label>
              </div>
              <label className="te-partido-meta-edit__field te-partido-meta-edit__field--full">
                <span className="te-partido-meta-edit__field-label">Cancha</span>
                <input
                  type="text"
                  className="te-partido-meta-edit__input"
                  value={draftCancha}
                  maxLength={24}
                  disabled={metaBusy}
                  onChange={(e) => {
                    setDraftCancha(e.target.value);
                    setSwapPrompt(null);
                    setPendingSlot(null);
                    setHorarioError(null);
                  }}
                />
              </label>
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
                      loading={metaBusy}
                      disabled={metaBusy}
                      onClick={() => {
                        if (pendingSlot) {
                          persistSlot(pendingSlot.programadoEn, pendingSlot.cancha);
                        }
                      }}
                    >
                      Intercambiar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={metaBusy}
                      onClick={() => {
                        setSwapPrompt(null);
                        setPendingSlot(null);
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
                      loading={metaBusy}
                      disabled={metaBusy}
                      onClick={guardarProgramacion}
                    >
                      Guardar
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={closeEdit}
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
          </div>
        ) : null}

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

function nextRoundHeading(label: string, count: number): string {
  if (count === 1) return label;
  if (label === "Semifinal") return "Así se arman las semifinales";
  if (label === "Cuartos de final") return "Así se arman los cuartos";
  if (label === "Octavos de final") return "Así se arman los octavos";
  return `Así se arma ${label}`;
}

function SiguienteRondaCamino({
  partidos,
  rondaVisible,
  bracketSlots,
  labelMap,
  labelForRonda,
  totalRondas,
}: {
  partidos: TorneoExpressEliminatoriaPartido[];
  rondaVisible: number;
  bracketSlots: unknown;
  labelMap: Record<string, string>;
  labelForRonda: (ronda: number) => string;
  totalRondas: number;
}) {
  const cards = useMemo(() => {
    if (isRondaTercerLugar(rondaVisible) || rondaVisible >= totalRondas) {
      return [];
    }
    const nextRonda = rondaVisible + 1;
    if (partidos.some((p) => p.ronda === nextRonda && !p.es_bye)) return [];

    const round = partidosDeRonda(partidos, rondaVisible).filter((p) => !p.es_bye);
    const buckets = new Map<
      number,
      { local?: TorneoExpressEliminatoriaPartido; visit?: TorneoExpressEliminatoriaPartido }
    >();
    round.forEach((partido) => {
      const slot = nextRoundSlotForCruce(partido.cruce_index);
      const bucket = buckets.get(slot.nextCruceIndex) ?? {};
      if (slot.side === "local") bucket.local = partido;
      else bucket.visit = partido;
      buckets.set(slot.nextCruceIndex, bucket);
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map((entry) => entry[1]);
  }, [partidos, rondaVisible, totalRondas]);

  if (cards.length === 0) return null;

  const nextLabel = labelForRonda(rondaVisible + 1);
  const showsBronze =
    nextLabel === "Semifinal" &&
    eliminatoriaThirdPlaceMatchEnabled(bracketSlots) &&
    totalRondas >= 2;

  const side = (
    partido: TorneoExpressEliminatoriaPartido | undefined,
    fallback: string
  ) => {
    if (!partido) return { title: fallback, detail: null as string | null };
    const number = cards.length
      ? partidosDeRonda(partidos, rondaVisible)
          .filter((p) => !p.es_bye)
          .findIndex((p) => p.id === partido.id) + 1
      : 0;
    const local = parejaLabelFromMap(labelMap, partido.pareja_local_id);
    const visit = parejaLabelFromMap(labelMap, partido.pareja_visitante_id);
    const winner = partido.ganador_id
      ? parejaLabelFromMap(labelMap, partido.ganador_id)
      : null;
    return {
      title: winner ?? `Ganador del partido ${number || fallback}`,
      detail: winner ? null : `${local}  ·  ${visit}`,
    };
  };

  return (
    <section className="te-elim-next" aria-label={`Cómo se arma ${nextLabel}`}>
      <p className="te-elim-next__kicker">Cómo sigue</p>
      <h3 className="te-elim-next__title">
        {nextRoundHeading(nextLabel, cards.length)}
      </h3>
      <p className="te-elim-next__lead">
        {nextLabel === "Semifinal"
          ? "Las semifinales todavía no existen. Se crean solas cuando captures los resultados de esta ronda."
          : `${nextLabel} todavía no existe. Se crea cuando esta ronda esté completa.`}
      </p>
      <div className="te-elim-next__grid">
        {cards.map((card, index) => {
          const left = side(card.local, "Partido por definir");
          const right = side(card.visit, "Partido por definir");
          const heading =
            cards.length === 1 ? nextLabel : `${nextLabel} ${index + 1}`;
          return (
            <article className="te-elim-next__card" key={heading}>
              <h4>{heading}</h4>
              <p className="te-elim-next__slot">{left.title}</p>
              {left.detail ? (
                <p className="te-elim-next__detail">{left.detail}</p>
              ) : null}
              <span className="te-elim-next__vs">contra</span>
              <p className="te-elim-next__slot">{right.title}</p>
              {right.detail ? (
                <p className="te-elim-next__detail">{right.detail}</p>
              ) : null}
            </article>
          );
        })}
      </div>
      {nextLabel === "Semifinal" ? (
        <p className="te-elim-next__after">
          Los ganadores de las dos semifinales juegan la final.
          {showsBronze
            ? " Quienes pierdan juegan el tercer lugar."
            : ""}
        </p>
      ) : null}
    </section>
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
  onSaveProgramacion,
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
  const finalHalves = (() => {
    if (isRondaTercerLugar(rondaVisible)) return null;
    if (labelForRonda(rondaVisible + 1) !== "Semifinal") return null;
    const round = partidosRonda.filter((p) => !p.es_bye);
    if (round.length < 4) return null;
    const buckets = new Map<
      number,
      Array<{ partido: TorneoExpressEliminatoriaPartido; number: number }>
    >();
    round.forEach((partido, index) => {
      const key = nextRoundSlotForCruce(partido.cruce_index).nextCruceIndex;
      const list = buckets.get(key) ?? [];
      list.push({ partido, number: index + 1 });
      buckets.set(key, list);
    });
    const halves = Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map((entry) => entry[1]);
    return halves.length === 2 ? halves : null;
  })();
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

      {finalHalves ? (
        <div className="te-elim-board">
          {finalHalves.map((half, index) => (
            <section className="te-elim-board__side" key={index}>
              <header className="te-elim-board__side-head">
                <p>Lado {index === 0 ? "A" : "B"}</p>
                <h3>Cuartos de final</h3>
                <span>
                  Los ganadores de estos dos partidos juegan la semifinal{" "}
                  {index + 1}.
                </span>
              </header>
              {half.map(({ partido, number }) => (
                <EliminatoriaPartidoCard
                  key={partido.id}
                  partido={partido}
                  localLabel={parejaLabelFromMap(labelMap, partido.pareja_local_id)}
                  visitLabel={parejaLabelFromMap(labelMap, partido.pareja_visitante_id)}
                  editable={editable}
                  saving={savingPartidoId === partido.id}
                  savingCancha={savingCanchaId === partido.id}
                  savingProgramado={savingProgramadoId === partido.id}
                  matchNumber={number}
                  courtCheckScope={courtCheckScope}
                  onSave={onSaveResultado}
                  onSaveProgramacion={onSaveProgramacion}
                  partidoFormato={partidoFormato}
                />
              ))}
            </section>
          ))}
          <section className="te-elim-board__final">
            <p>Final</p>
            <h3>Ganador de la semifinal 1 contra ganador de la semifinal 2</h3>
          </section>
        </div>
      ) : (
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
            onSaveProgramacion={onSaveProgramacion}
            partidoFormato={partidoFormato}
          />
        ))}
      </div>
      )}

      {finalHalves ? null : (
        <SiguienteRondaCamino
          partidos={partidos}
          rondaVisible={rondaVisible}
          bracketSlots={bracketSlots}
          labelMap={labelMap}
          labelForRonda={labelForRonda}
          totalRondas={totalRondas}
        />
      )}
    </div>
  );
};
