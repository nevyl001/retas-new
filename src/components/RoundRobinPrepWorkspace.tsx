import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useClubModeEyebrow } from "../club-experience";
import { useUser } from "../contexts/UserContext";
import { useOrganizerPlayerPool } from "../hooks/useOrganizerPlayerPool";
import { usePlayerValidation } from "../hooks/usePlayerValidation";
import { useRetaAbiertaRealtime } from "../lib/retaAbierta/useRetaAbiertaRealtime";
import {
  fetchOpenRegistrationConfig,
  listOpenRegistrationEntries,
} from "../lib/retaAbierta/retaAbiertaService";
import type { Match, Pair, Player, Tournament } from "../lib/database";
import { getStartFormatLabel } from "../lib/gameModeMapping";
import { ModernPlayerManager } from "./ModernPlayerManager";
import { NewPairManager } from "./NewPairManager";
import { RetaConfigPanel } from "./reta/RetaConfigPanel";
import { RetaAbiertaOrganizerPanel } from "./reta-abierta/RetaAbiertaOrganizerPanel";
import { RetaConfigDangerReset } from "./TournamentStatusContent";
import { Modal } from "./ui";
import {
  QuickModeEventHeader,
  QuickModePrepWorkspace,
  QuickModePrimaryCta,
  QuickModeStepper,
  type QuickModeStep,
  type QuickModeStepStatus,
} from "./platform/quickMode";

export type RoundRobinPrepStepId =
  | "jugadores"
  | "equipos"
  | "convocatoria"
  | "listo";

type Props = {
  tournament: Tournament;
  pairs: Pair[];
  matches: Match[];
  loading: boolean;
  selectedPlayers: Player[];
  setSelectedPlayers: (players: Player[]) => void;
  setError: (error: string) => void;
  addPair: (player1: Player, player2: Player) => void;
  isCreatingPair?: boolean;
  updatePairPlayers: (pairId: string, player1: Player, player2: Player) => void;
  deletePair: (pairId: string) => void;
  userId?: string;
  loadTournamentData: () => void;
  setForceRefresh: React.Dispatch<React.SetStateAction<number>>;
  onTournamentPatched?: (tournament: Tournament) => void;
  onStartTournament: (opts: { format: "roundRobin" }) => void;
  onReset: () => void | Promise<void>;
};

function formatScheduleLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function durationMinutes(tournament: Tournament): number | null {
  if (!tournament.programado_en || !tournament.programado_hasta) return null;
  const ms =
    new Date(tournament.programado_hasta).getTime() -
    new Date(tournament.programado_en).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round(ms / 60000);
}

function stepStatus(
  id: RoundRobinPrepStepId,
  active: RoundRobinPrepStepId,
  complete: boolean
): QuickModeStepStatus {
  if (active === id) return "active";
  if (complete) return "complete";
  return "pending";
}

function convStatusLabel(status: string | undefined): string {
  switch (status) {
    case "open":
      return "Abierta";
    case "paused":
      return "Pausada";
    case "closed":
      return "Cerrada";
    case "draft":
      return "Borrador";
    default:
      return "Sin abrir";
  }
}

/**
 * Workspace de preparación Round Robin (desktop 2-col + mobile stack).
 * Solo UI; misma lógica de parejas / start / convocatoria.
 */
export const RoundRobinPrepWorkspace: React.FC<Props> = ({
  tournament,
  pairs,
  matches,
  loading,
  selectedPlayers,
  setSelectedPlayers,
  setError,
  addPair,
  isCreatingPair = false,
  updatePairPlayers,
  deletePair,
  userId: userIdProp,
  loadTournamentData,
  setForceRefresh,
  onTournamentPatched,
  onStartTournament,
  onReset,
}) => {
  const club = useClubModeEyebrow();
  const { user } = useUser();
  const { validatePlayerSelection } = usePlayerValidation();
  const [step, setStep] = useState<RoundRobinPrepStepId>("jugadores");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [convLine, setConvLine] = useState("Sin abrir · —");
  const [convTouched, setConvTouched] = useState(false);

  const organizerId =
    userIdProp?.trim() ||
    tournament.user_id?.trim() ||
    user?.id?.trim() ||
    null;

  const {
    players: playerPool,
    loading: playerPoolLoading,
    error: playerPoolError,
    refresh: refreshPlayerPool,
  } = useOrganizerPlayerPool(organizerId);

  const refreshConvSummary = useCallback(async () => {
    try {
      const cfg = await fetchOpenRegistrationConfig(tournament.id);
      if (!cfg) {
        setConvLine("Sin abrir · —");
        return;
      }
      const entries = await listOpenRegistrationEntries(tournament.id);
      const confirmed = entries.filter((e) => e.status === "confirmed").length;
      const capacity = cfg.capacity ?? 8;
      setConvLine(
        `${convStatusLabel(cfg.status)} · ${confirmed} de ${capacity} confirmados`
      );
      if (cfg.status === "open" || confirmed > 0) setConvTouched(true);
    } catch {
      setConvLine("Gestionar convocatoria");
    }
  }, [tournament.id]);

  const onConvocatoriaOrFocusRefresh = useCallback(() => {
    void refreshPlayerPool();
    void refreshConvSummary();
  }, [refreshPlayerPool, refreshConvSummary]);

  useRetaAbiertaRealtime({
    tournamentId: tournament.id,
    enabled: Boolean(tournament.id),
    onUpdate: onConvocatoriaOrFocusRefresh,
  });

  useEffect(() => {
    void refreshConvSummary();
  }, [refreshConvSummary, step]);

  const playersInPairs = useMemo(
    () => pairs.flatMap((pair) => [pair.player1_id, pair.player2_id]),
    [pairs]
  );

  const handlePlayerSelect = (players: Player[]) => {
    validatePlayerSelection(
      players,
      pairs,
      setError,
      addPair,
      setSelectedPlayers,
      { isCreatingPair }
    );
  };

  const duration = durationMinutes(tournament);
  const scheduleLabel = formatScheduleLabel(tournament.programado_en);
  const lugarLabel =
    tournament.mostrar_lugar === false
      ? "—"
      : tournament.lugar?.trim() || "—";

  const jugadoresOk = playerPool.length > 0 || playersInPairs.length > 0;
  const equiposOk = pairs.length >= 2;
  const canchasOk = (tournament.courts ?? 0) >= 1;
  const datosOk = Boolean(tournament.programado_en);
  const canStart = !loading && equiposOk && !tournament.is_started;

  const ctaHint = !equiposOk
    ? pairs.length === 1
      ? "Falta 1 pareja más"
      : "Faltan al menos 2 parejas"
    : null;

  const goConvocatoria = () => {
    setStep("convocatoria");
    setConvTouched(true);
    setMobileSummaryOpen(false);
  };

  const steps: QuickModeStep[] = [
    {
      id: "jugadores",
      label: "Jugadores",
      count: playerPool.length,
      status: stepStatus("jugadores", step, jugadoresOk),
    },
    {
      id: "equipos",
      label: "Equipos",
      count: `${pairs.length}`,
      status: stepStatus("equipos", step, equiposOk),
    },
    {
      id: "convocatoria",
      label: "Convocatoria",
      status: stepStatus("convocatoria", step, convTouched),
    },
    {
      id: "listo",
      label: "Listo",
      status: stepStatus("listo", step, canStart),
    },
  ];

  const workbenchTitle =
    step === "jugadores"
      ? "Jugadores"
      : step === "equipos"
        ? "Equipos"
        : step === "convocatoria"
          ? "Convocatoria"
          : "Listo para iniciar";

  const workbenchBody =
    step === "jugadores" ? (
      <ModernPlayerManager
        playersInPairs={playersInPairs}
        onPlayerSelect={handlePlayerSelect}
        selectedPlayers={selectedPlayers}
        allowMultipleSelection={true}
        userId={organizerId ?? undefined}
        players={playerPool}
        loading={playerPoolLoading}
        error={playerPoolError}
        onRefreshPlayers={refreshPlayerPool}
        isCreatingPair={isCreatingPair}
      />
    ) : step === "equipos" ? (
      <NewPairManager
        pairs={pairs}
        onPairUpdate={updatePairPlayers}
        onPairDelete={deletePair}
        players={playerPool}
        loading={playerPoolLoading}
      />
    ) : step === "convocatoria" ? (
      <div className="qm-ws__convocatoria">
        <RetaAbiertaOrganizerPanel tournament={tournament} />
      </div>
    ) : (
      <ul className="qm-ws__ready-check">
        <li className={jugadoresOk ? "is-ok" : "is-miss"}>
          <span className="qm-ws__ready-mark" aria-hidden>
            {jugadoresOk ? "OK" : "!"}
          </span>
          <span className="qm-ws__ready-copy">
            {jugadoresOk
              ? `Jugadores disponibles (${playerPool.length})`
              : "Sin jugadores en el registro"}
          </span>
          {!jugadoresOk ? (
            <button
              type="button"
              className="qm-ws__text-btn"
              onClick={() => setStep("jugadores")}
            >
              Ir a Jugadores
            </button>
          ) : null}
        </li>
        <li className={equiposOk ? "is-ok" : "is-miss"}>
          <span className="qm-ws__ready-mark" aria-hidden>
            {equiposOk ? "OK" : "!"}
          </span>
          <span className="qm-ws__ready-copy">
            {equiposOk
              ? `Parejas listas (${pairs.length})`
              : `Faltan ${Math.max(0, 2 - pairs.length)} parejas`}
          </span>
          {!equiposOk ? (
            <button
              type="button"
              className="qm-ws__text-btn"
              onClick={() => setStep("equipos")}
            >
              Ir a Equipos
            </button>
          ) : null}
        </li>
        <li className={canchasOk ? "is-ok" : "is-miss"}>
          <span className="qm-ws__ready-mark" aria-hidden>
            {canchasOk ? "OK" : "!"}
          </span>
          <span className="qm-ws__ready-copy">
            {canchasOk
              ? `${tournament.courts} canchas configuradas`
              : "Configura canchas"}
          </span>
          {!canchasOk ? (
            <button
              type="button"
              className="qm-ws__text-btn"
              onClick={() => setDetailsOpen(true)}
            >
              Editar detalles
            </button>
          ) : null}
        </li>
        <li className={convTouched ? "is-ok" : "is-soft"}>
          <span className="qm-ws__ready-mark" aria-hidden>
            {convTouched ? "OK" : "·"}
          </span>
          <span className="qm-ws__ready-copy">
            {convTouched ? convLine : "Convocatoria sin revisar"}
          </span>
          <button
            type="button"
            className="qm-ws__text-btn"
            onClick={goConvocatoria}
          >
            Ver convocatoria
          </button>
        </li>
        <li className={datosOk ? "is-ok" : "is-soft"}>
          <span className="qm-ws__ready-mark" aria-hidden>
            {datosOk ? "OK" : "·"}
          </span>
          <span className="qm-ws__ready-copy">
            {datosOk ? `Fecha: ${scheduleLabel}` : "Fecha pendiente"}
          </span>
          {!datosOk ? (
            <button
              type="button"
              className="qm-ws__text-btn"
              onClick={() => setDetailsOpen(true)}
            >
              Editar detalles
            </button>
          ) : null}
        </li>
      </ul>
    );

  const ctaProps = {
    variant: "sidebar" as const,
    label: loading ? "Iniciando…" : "Iniciar reta",
    disabled: !canStart,
    loading,
    hint: ctaHint,
    onClick: () => onStartTournament({ format: "roundRobin" as const }),
  };

  const sidebarPanel = (
    <div className="qm-ws-panel">
      <section className="qm-ws-panel__block">
        <h3 className="qm-ws-panel__label">Progreso</h3>
        <ul className="qm-ws-panel__progress">
          <li className={jugadoresOk ? "is-ok" : ""}>Jugadores</li>
          <li className={equiposOk ? "is-ok" : ""}>Equipos (min. 2)</li>
          <li className={convTouched ? "is-ok" : ""}>Convocatoria</li>
          <li className={canStart ? "is-ok" : ""}>Listo para iniciar</li>
        </ul>
      </section>

      <section className="qm-ws-panel__block">
        <h3 className="qm-ws-panel__label">Convocatoria</h3>
        <p className="qm-ws-panel__conv-line">{convLine}</p>
        <button
          type="button"
          className="qm-ws__text-btn"
          onClick={goConvocatoria}
        >
          Ver detalles
        </button>
      </section>

      <section className="qm-ws-panel__block qm-ws-panel__cta-desktop">
        <QuickModePrimaryCta {...ctaProps} />
      </section>

      <section className="qm-ws-panel__block qm-ws-panel__block--danger">
        <RetaConfigDangerReset
          loading={loading}
          onReset={() => {
            void onReset();
          }}
        />
      </section>
    </div>
  );

  return (
    <>
      <QuickModePrepWorkspace
        className={mobileSummaryOpen ? "is-summary-open" : ""}
        header={
          <QuickModeEventHeader
            club={club}
            title={tournament.name?.trim() || "Round Robin"}
            modality={getStartFormatLabel("roundRobin")}
            statusLabel="Pendiente"
            centerMetrics={[
              { label: "Jugadores", value: playerPool.length },
              { label: "Parejas", value: pairs.length },
              { label: "Canchas", value: tournament.courts ?? "—" },
              {
                label: "Duración",
                value: duration != null ? `${duration} min` : "—",
              },
            ]}
            rightMeta={[
              { label: "Fecha", value: scheduleLabel },
              { label: "Lugar", value: lugarLabel },
            ]}
            onEditDetails={() => setDetailsOpen(true)}
          />
        }
        stepper={
          <QuickModeStepper
            steps={steps}
            activeId={step}
            onChange={(id) => {
              const next = id as RoundRobinPrepStepId;
              if (next === "convocatoria") setConvTouched(true);
              setStep(next);
            }}
          />
        }
        workbench={
          <>
            <div className="qm-ws__workbench-head">
              <h2 className="qm-ws__workbench-title">{workbenchTitle}</h2>
              <button
                type="button"
                className="qm-ws__text-btn qm-ws__summary-toggle"
                onClick={() => setMobileSummaryOpen((v) => !v)}
                aria-expanded={mobileSummaryOpen}
              >
                {mobileSummaryOpen ? "Ocultar resumen" : "Resumen"}
              </button>
            </div>
            <div className="qm-ws__workbench-body">{workbenchBody}</div>
          </>
        }
        sidebar={sidebarPanel}
        stickyCta={<QuickModePrimaryCta {...ctaProps} />}
      />

      <Modal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="Editar detalles"
        size="lg"
      >
        <RetaConfigPanel
          tournament={tournament}
          matches={matches}
          pairsCount={pairs.length}
          onSaved={(t) => {
            onTournamentPatched?.(t);
            loadTournamentData();
            setForceRefresh((prev) => prev + 1);
            setDetailsOpen(false);
          }}
        />
      </Modal>
    </>
  );
};

export default RoundRobinPrepWorkspace;
