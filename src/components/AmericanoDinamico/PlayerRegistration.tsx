import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  useClubModeEyebrow,
} from "../../club-experience";
import type { AmericanoPlayer } from "../../lib/db/types";
import { computeAmericanoLayoutMetrics } from "../../lib/americanoGenerator";
import {
  updateTournament,
  type Player,
  type Tournament,
} from "../../lib/database";
import {
  loadAmericanoDinamicoSnapshot,
  type AmericanoDinamicoSnapshotV1,
} from "../../lib/americanoDinamicoStorage";
import {
  loadAmericanoDinamicoSnapshotMerged,
  persistAmericanoDinamicoSnapshot,
} from "../../lib/americanoDinamicoSync";
import {
  fetchOpenGameRegistrationConfig,
  listOpenGameRegistrationEntries,
} from "../../lib/retaAbierta/retaAbiertaService";
import type { ConvocatoriaLiveSnapshot } from "../reta-abierta/ConvocatoriaWhatsAppPanel";
import { RetaAbiertaOrganizerPanel } from "../reta-abierta/RetaAbiertaOrganizerPanel";
import { RetaConfigPanel } from "../reta/RetaConfigPanel";
import { ModernPlayerManager } from "../ModernPlayerManager";
import {
  QuickModeConvocatoriaGate,
  QuickModeEventHeader,
  QuickModePrepWorkspace,
  QuickModePrimaryCta,
  QuickModeStepper,
  type QuickModeStep,
  type QuickModeStepStatus,
} from "../platform/quickMode";
import { Button, Input } from "../ui";
import "./PlayerRegistration.css";

type PrepStepId = "jugadores" | "config" | "listo";

interface PlayerRegistrationProps {
  players: AmericanoPlayer[];
  availablePlayers: Player[];
  availablePlayersLoading?: boolean;
  availablePlayersError?: string | null;
  onRefreshAvailablePlayers?: () => Promise<void> | void;
  onSyncPlayers: (next: ReadonlyArray<{ id: string; name: string }>) => void;
  onStartTournament: (
    totalRounds: number,
    courts: number
  ) => Promise<boolean> | void;
  /** FC-01 (Fase C1): mensaje si el servidor no confirmó el inicio del torneo. */
  startTournamentError?: string | null;
  /** Torneo persistido: mismos detalles (lugar, horario…) que Reta / RR. */
  tournament: Tournament | null;
  onTournamentPatched?: (tournament: Tournament) => void;
  eventTitle?: string;
  eventSubtitle?: string | null;
  eyebrow?: string | null;
  userId?: string | null;
}

function stepStatus(
  id: PrepStepId,
  active: PrepStepId,
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

function scrollToConvocatoriaStrip() {
  document
    .getElementById("americano-convocatoria-inline")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export const PlayerRegistration: React.FC<PlayerRegistrationProps> = ({
  players,
  availablePlayers,
  availablePlayersLoading = false,
  availablePlayersError = null,
  onRefreshAvailablePlayers,
  onSyncPlayers,
  onStartTournament,
  startTournamentError = null,
  tournament,
  onTournamentPatched,
  eventTitle = "Americano",
  eventSubtitle = "Parejas rotativas y ranking por puntos. Prepara el registro e inicia.",
  eyebrow,
  userId,
}) => {
  const club = useClubModeEyebrow();
  const clubLabel = eyebrow?.trim() || club;

  const [step, setStep] = useState<PrepStepId>("jugadores");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [convTouched, setConvTouched] = useState(false);
  const [wantConvocatoria, setWantConvocatoria] = useState(false);
  const [convIsLive, setConvIsLive] = useState(false);
  const [convCapacity, setConvCapacity] = useState(0);
  const [convLine, setConvLine] = useState("Sin abrir · —");
  const [roundsDraft, setRoundsDraft] = useState<number | "">(3);
  const [courtsDraft, setCourtsDraft] = useState(2);
  const [starting, setStarting] = useState(false);
  const [savingCourts, setSavingCourts] = useState(false);
  const [savingRounds, setSavingRounds] = useState(false);

  useEffect(() => {
    const fromTournament = Math.max(
      1,
      Math.floor(Number(tournament?.courts)) || 2
    );
    setCourtsDraft(fromTournament);
  }, [tournament?.courts]);

  useEffect(() => {
    if (!tournament?.id) return;
    const local = loadAmericanoDinamicoSnapshot(tournament.id);
    if (local?.totalRounds && local.totalRounds > 0) {
      setRoundsDraft(local.totalRounds);
    }
    let cancelled = false;
    void (async () => {
      const { snapshot } = await loadAmericanoDinamicoSnapshotMerged(
        tournament.id
      );
      if (cancelled) return;
      if (snapshot?.totalRounds && snapshot.totalRounds > 0) {
        setRoundsDraft(snapshot.totalRounds);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournament?.id]);

  const courts = Math.max(1, Math.floor(Number(courtsDraft)) || 1);
  const totalRounds =
    roundsDraft === "" ? 3 : Math.max(1, Math.floor(Number(roundsDraft)) || 1);

  const persistCourts = useCallback(
    async (next: number) => {
      const safe = Math.max(1, Math.floor(next) || 1);
      setCourtsDraft(safe);
      if (!tournament?.id) return;
      setSavingCourts(true);
      try {
        await updateTournament(tournament.id, { courts: safe });
        onTournamentPatched?.({ ...tournament, courts: safe });
      } catch {
        /* la UI ya muestra el draft; al iniciar se vuelve a persistir */
      } finally {
        setSavingCourts(false);
      }
    },
    [tournament, onTournamentPatched]
  );

  const persistRounds = useCallback(
    async (next: number | "") => {
      const safe =
        next === "" ? 3 : Math.max(1, Math.floor(Number(next)) || 1);
      setRoundsDraft(safe);
      if (!tournament?.id) return;
      setSavingRounds(true);
      try {
        const existing = loadAmericanoDinamicoSnapshot(tournament.id);
        const snapshot: AmericanoDinamicoSnapshotV1 = {
          version: 1,
          savedAt: new Date().toISOString(),
          tournamentPhase: "registration",
          totalRounds: safe,
          roster: existing?.roster ?? [],
          ranking: existing?.ranking ?? [],
          rounds: existing?.rounds ?? [],
        };
        await persistAmericanoDinamicoSnapshot(tournament.id, snapshot);
      } catch {
        /* la UI ya muestra el draft; al iniciar se vuelve a persistir */
      } finally {
        setSavingRounds(false);
      }
    },
    [tournament?.id]
  );

  const selectedPlayers = useMemo<Player[]>(() => {
    const byId = new Map(availablePlayers.map((p) => [p.id, p]));
    return players.map(
      (p) =>
        byId.get(p.id) ?? {
          id: p.id,
          name: p.name,
          email: "",
          created_at: "",
        }
    );
  }, [players, availablePlayers]);

  const handlePlayerSelect = useCallback(
    (next: Player[]) => {
      onSyncPlayers(next.map((p) => ({ id: p.id, name: p.name })));
    },
    [onSyncPlayers]
  );

  const refreshConvSummary = useCallback(async () => {
    if (!tournament?.id) {
      setConvLine("Sin abrir · —");
      setConvIsLive(false);
      setConvCapacity(0);
      return;
    }
    try {
      const cfg = await fetchOpenGameRegistrationConfig(
        "americano",
        tournament.id
      );
      if (!cfg) {
        setConvLine("Sin abrir · —");
        setConvIsLive(false);
        setConvCapacity(0);
        return;
      }
      const entries = await listOpenGameRegistrationEntries(
        "americano",
        tournament.id
      );
      const confirmed = entries.filter((e) => e.status === "confirmed").length;
      const capacity = cfg.capacity ?? 8;
      const live =
        Boolean(cfg.public_slug) ||
        (Boolean(cfg.enabled) && cfg.status !== "draft");
      setConvCapacity(capacity);
      setConvIsLive(live);
      if (live) setWantConvocatoria(true);
      setConvLine(
        `${convStatusLabel(cfg.status)} · ${confirmed} de ${capacity} confirmados`
      );
      if (cfg.status === "open" || confirmed > 0) setConvTouched(true);
    } catch {
      setConvLine("Gestionar convocatoria");
    }
  }, [tournament?.id]);

  useEffect(() => {
    void refreshConvSummary();
  }, [refreshConvSummary]);

  const onConvLiveChange = useCallback((snap: ConvocatoriaLiveSnapshot) => {
    if (snap.isLive || snap.confirmed > 0) setConvTouched(true);
    if (snap.isLive) {
      setConvIsLive(true);
      setWantConvocatoria(true);
    } else if (!snap.publicSlug) {
      setConvIsLive(false);
    }
    if (!snap.isLive && !snap.publicSlug) {
      setConvLine("Sin abrir · —");
      setConvCapacity(0);
      return;
    }
    setConvCapacity(snap.capacity);
    setConvLine(
      `${convStatusLabel(snap.status ?? undefined)} · ${snap.confirmed} de ${snap.capacity} confirmados`
    );
  }, []);

  /** Con convocatoria, el cupo planificado define partidos/descansos (no solo confirmados). */
  const layoutPlayerCount =
    convCapacity >= 4 ? convCapacity : players.length;
  const { maxMatches, benchPerRound } = computeAmericanoLayoutMetrics(
    layoutPlayerCount,
    courts
  );

  const jugadoresOk = players.length >= 4;
  const configOk = totalRounds >= 1 && courts >= 1;
  const canStart = jugadoresOk && configOk;
  const ctaHint = startTournamentError
    ? startTournamentError
    : !jugadoresOk
    ? players.length === 0
      ? "Selecciona al menos 4 jugadores"
      : `Faltan ${4 - players.length} jugador${4 - players.length === 1 ? "" : "es"}`
    : `${totalRounds} rondas · ${courts} cancha${courts === 1 ? "" : "s"}`;

  const goConvocatoria = () => {
    setWantConvocatoria(true);
    setConvTouched(true);
    setMobileSummaryOpen(false);
    window.requestAnimationFrame(() => scrollToConvocatoriaStrip());
  };

  const steps: QuickModeStep[] = useMemo(
    () => [
      {
        id: "jugadores",
        label: "Jugadores",
        status: stepStatus("jugadores", step, jugadoresOk),
        count: String(players.length),
      },
      {
        id: "config",
        label: "Rondas y canchas",
        status: stepStatus("config", step, configOk),
        count: configOk ? `${totalRounds}·${courts}` : "—",
      },
      {
        id: "listo",
        label: "Listo",
        status: stepStatus("listo", step, canStart),
        count: canStart ? "OK" : "Pendiente",
      },
    ],
    [step, jugadoresOk, players.length, canStart, configOk, totalRounds, courts]
  );

  const workbenchTitle =
    step === "jugadores"
      ? "Jugadores"
      : step === "config"
        ? "Rondas y canchas"
        : "Listo para iniciar";

  const workbenchBody =
    step === "jugadores" ? (
      <div className="americano-registration__db">
        <p className="americano-registration__format-note" role="note">
          Formato americano equilibrado: las parejas se rotan automáticamente.
          El ranking solo muestra posiciones; no forma partidos.
        </p>
        <p className="americano-registration__hint">
          Toca una tarjeta para sumar o quitar del roster. Mínimo 4 jugadores.
        </p>
        <ModernPlayerManager
          players={availablePlayers}
          loading={availablePlayersLoading}
          error={availablePlayersError}
          onRefreshPlayers={onRefreshAvailablePlayers}
          selectedPlayers={selectedPlayers}
          onPlayerSelect={handlePlayerSelect}
          allowMultipleSelection={true}
          userId={userId ?? undefined}
        />
      </div>
    ) : step === "config" ? (
      <div className="americano-registration__config">
        <p className="americano-registration__format-note" role="note">
          Define cuántas rondas se juegan y en cuántas canchas. Esto se usa al
          iniciar la reta.
        </p>

        <div className="americano-registration__config-grid">
          <label className="americano-registration__config-card">
            <span className="americano-registration__config-label">Rondas</span>
            <div className="americano-registration__stepper">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Menos rondas"
                disabled={totalRounds <= 1 || savingRounds}
                onClick={() => void persistRounds(totalRounds - 1)}
              >
                −
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={roundsDraft}
                aria-label="Número de rondas"
                disabled={savingRounds}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === "") {
                    setRoundsDraft("");
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isFinite(n)) return;
                  setRoundsDraft(Math.max(1, Math.trunc(n)));
                }}
                onBlur={() => {
                  void persistRounds(roundsDraft);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Más rondas"
                disabled={savingRounds}
                onClick={() => void persistRounds(totalRounds + 1)}
              >
                +
              </Button>
            </div>
          </label>

          <label className="americano-registration__config-card">
            <span className="americano-registration__config-label">Canchas</span>
            <div className="americano-registration__stepper">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Menos canchas"
                disabled={courts <= 1 || savingCourts}
                onClick={() => void persistCourts(courts - 1)}
              >
                −
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={courtsDraft}
                aria-label="Número de canchas"
                disabled={savingCourts}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setCourtsDraft(Math.max(1, Math.trunc(n)));
                }}
                onBlur={() => {
                  void persistCourts(courtsDraft);
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Más canchas"
                disabled={savingCourts}
                onClick={() => void persistCourts(courts + 1)}
              >
                +
              </Button>
            </div>
          </label>
        </div>

        <p className="americano-registration__courts-hint" role="note">
          Partidos/ronda: {maxMatches} · Descansan: {benchPerRound}. Las canchas
          rotan entre rondas.
        </p>

        <div className="americano-registration__config-actions">
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              void persistRounds(roundsDraft);
              void persistCourts(courts);
              setStep(jugadoresOk ? "listo" : "jugadores");
            }}
          >
            {jugadoresOk ? "Continuar →" : "Ir a jugadores"}
          </Button>
        </div>
      </div>
    ) : (
      <ul className="qm-ws__ready-check">
        <li className={jugadoresOk ? "is-ok" : "is-miss"}>
          <span className="qm-ws__ready-mark" aria-hidden>
            {jugadoresOk ? "OK" : "!"}
          </span>
          <span className="qm-ws__ready-copy">
            {jugadoresOk
              ? `${players.length} jugadores listos`
              : "Mínimo 4 jugadores"}
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
        <li className={configOk ? "is-ok" : "is-miss"}>
          <span className="qm-ws__ready-mark" aria-hidden>
            {configOk ? "OK" : "!"}
          </span>
          <span className="qm-ws__ready-copy">
            {configOk
              ? `${totalRounds} rondas · ${courts} cancha${courts === 1 ? "" : "s"}`
              : "Define rondas y canchas"}
          </span>
          <button
            type="button"
            className="qm-ws__text-btn"
            onClick={() => setStep("config")}
          >
            Editar rondas y canchas
          </button>
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
            Ir a convocatoria
          </button>
        </li>
      </ul>
    );

  const ctaProps = {
    variant: "sidebar" as const,
    label: "Iniciar reta",
    loadingLabel: "Calculando partidos…",
    disabled: !canStart || starting,
    loading: starting,
    hint: ctaHint,
    onClick: () => {
      if (starting || !canStart) return;
      setStarting(true);
      // Deja pintar el estado de carga antes del cálculo síncrono.
      // FC-01 (Fase C1): onStartTournament ahora espera confirmación del
      // servidor antes de resolver -- el loading debe cubrir esa espera
      // también, no solo el cálculo local de la ronda.
      window.setTimeout(() => {
        void Promise.resolve(onStartTournament(totalRounds, courts)).finally(
          () => setStarting(false)
        );
      }, 40);
    },
  };

  const sidebarPanel = (
    <div className="qm-ws-panel">
      <section className="qm-ws-panel__block">
        <h3 className="qm-ws-panel__label">Progreso</h3>
        <ul className="qm-ws-panel__progress">
          <li className={jugadoresOk ? "is-ok" : ""}>Jugadores (min. 4)</li>
          <li className={configOk ? "is-ok" : ""}>
            <button
              type="button"
              className="qm-ws-panel__progress-link"
              onClick={() => setStep("config")}
            >
              Rondas y canchas
            </button>
          </li>
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
          Ir a convocatoria
        </button>
      </section>

      <section className="qm-ws-panel__block qm-ws-panel__cta-desktop">
        <QuickModePrimaryCta {...ctaProps} />
      </section>
    </div>
  );

  const detailsPanel = (
    <section
      id="americano-detalles-inline"
      className="qm-ws__details-inline"
      aria-label="Detalles de la reta"
    >
      {tournament ? (
        <RetaConfigPanel
          tournament={tournament}
          matches={[]}
          pairsCount={0}
          showChampionship={false}
          subtitle="Nombre, horario y sede del americano."
          onSaved={(t) => {
            onTournamentPatched?.(t);
          }}
        />
      ) : (
        <div className="reta-config-panel reta-config-panel--inline">
          <header className="reta-config-panel__toolbar">
            <div className="reta-config-panel__toolbar-copy">
              <h2 className="reta-config-panel__title">Detalles de la reta</h2>
              <p className="reta-config-panel__subtitle">Cargando datos…</p>
            </div>
          </header>
        </div>
      )}

      <div className="americano-registration__rounds-bar americano-registration__rounds-bar--link">
        <p className="americano-registration__courts-hint" role="note">
          Rondas y canchas: <strong>{totalRounds}</strong> ·{" "}
          <strong>{courts}</strong>
          {savingCourts ? " (guardando…)" : ""}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setStep("config");
            setMobileSummaryOpen(false);
          }}
        >
          Editar rondas y canchas
        </Button>
      </div>

      {tournament ? (
        <div id="americano-convocatoria-inline">
          <QuickModeConvocatoriaGate
            open={wantConvocatoria}
            live={convIsLive}
            panelId="americano-convocatoria-panel"
            onToggle={() => {
              setWantConvocatoria((v) => {
                const next = !v;
                if (next) setConvTouched(true);
                return next;
              });
            }}
          >
            {wantConvocatoria ? (
              <RetaAbiertaOrganizerPanel
                tournament={tournament}
                modeOverride="americano"
                embedded
                onLiveChange={onConvLiveChange}
              />
            ) : null}
          </QuickModeConvocatoriaGate>
        </div>
      ) : null}
    </section>
  );

  return (
    <section className="americano-registration americano-registration--workspace">
      <QuickModePrepWorkspace
        className={`qm-ws--wide${mobileSummaryOpen ? " is-summary-open" : ""}`}
        header={
          <QuickModeEventHeader
            club={clubLabel}
            title={eventTitle}
            modality="Americano"
            statusLabel="Pendiente"
            centerMetrics={[
              { label: "Jugadores", value: players.length },
              { label: "Partidos/ronda", value: maxMatches },
              { label: "Canchas", value: courts },
              { label: "Descansan", value: benchPerRound },
            ]}
            rightMeta={[
              { label: "Rondas", value: totalRounds },
              { label: "Formato", value: "Rotativo" },
            ]}
          />
        }
        details={detailsPanel}
        stepper={
          <QuickModeStepper
            steps={steps}
            activeId={step}
            onChange={(id) => setStep(id as PrepStepId)}
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
    </section>
  );
};
