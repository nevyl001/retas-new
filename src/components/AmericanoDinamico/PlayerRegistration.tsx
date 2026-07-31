import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getRegistryEmptyMessage,
  getRegistrySectionLabel,
  useBranding,
  useClubModeEyebrow,
} from "../../club-experience";
import type { AmericanoPlayer } from "../../lib/db/types";
import type { Player } from "../../lib/database";
import {
  fetchOpenGameRegistrationConfig,
  listOpenGameRegistrationEntries,
} from "../../lib/retaAbierta/retaAbiertaService";
import { buildTournamentConvocatoriaContext } from "../../lib/retaAbierta/adapters";
import type { ConvocatoriaLiveSnapshot } from "../reta-abierta/ConvocatoriaWhatsAppPanel";
import { ConvocatoriaWhatsAppPanel } from "../reta-abierta/ConvocatoriaWhatsAppPanel";
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
import { TablerIcon } from "../ui/TablerIcon";
import "./PlayerRegistration.css";

type PrepStepId = "jugadores" | "listo";

interface PlayerRegistrationProps {
  players: AmericanoPlayer[];
  availablePlayers: Player[];
  onRemovePlayer: (id: string) => void;
  onToggleExistingPlayer: (player: Player) => void;
  onStartTournament: (totalRounds: number, courts: number) => void;
  /** Canchas ya definidas al crear la reta (QuickStart / DB). */
  initialCourts?: number;
  /** Si hay torneo persistido, permite convocatoria embebida. */
  openRegistration?: {
    tournamentId: string;
    name: string;
    locationLabel: string;
  } | null;
  eventTitle?: string;
  eventSubtitle?: string | null;
  eyebrow?: string | null;
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
  onRemovePlayer,
  onToggleExistingPlayer,
  onStartTournament,
  initialCourts = 1,
  openRegistration = null,
  eventTitle = "Americano",
  eventSubtitle = "Parejas rotativas y ranking por puntos. Prepara el registro e inicia.",
  eyebrow,
}) => {
  const club = useClubModeEyebrow();
  const clubLabel = eyebrow?.trim() || club;
  const { nombre: organizerName } = useBranding();
  const registryTitle = getRegistrySectionLabel(organizerName);

  const [step, setStep] = useState<PrepStepId>("jugadores");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [convTouched, setConvTouched] = useState(false);
  const [wantConvocatoria, setWantConvocatoria] = useState(false);
  const [convIsLive, setConvIsLive] = useState(false);
  const [convLine, setConvLine] = useState("Sin abrir · —");
  const [totalRounds, setTotalRounds] = useState(3);
  const [courts, setCourts] = useState(() =>
    Math.min(20, Math.max(1, Math.floor(initialCourts) || 1))
  );

  useEffect(() => {
    const next = Math.min(20, Math.max(1, Math.floor(initialCourts) || 1));
    setCourts(next);
  }, [initialCourts]);

  const refreshConvSummary = useCallback(async () => {
    if (!openRegistration?.tournamentId) {
      setConvLine("Sin abrir · —");
      setConvIsLive(false);
      return;
    }
    try {
      const cfg = await fetchOpenGameRegistrationConfig(
        "americano",
        openRegistration.tournamentId
      );
      if (!cfg) {
        setConvLine("Sin abrir · —");
        setConvIsLive(false);
        return;
      }
      const entries = await listOpenGameRegistrationEntries(
        "americano",
        openRegistration.tournamentId
      );
      const confirmed = entries.filter((e) => e.status === "confirmed").length;
      const capacity = cfg.capacity ?? 8;
      const live =
        Boolean(cfg.public_slug) ||
        (Boolean(cfg.enabled) && cfg.status !== "draft");
      setConvIsLive(live);
      if (live) setWantConvocatoria(true);
      setConvLine(
        `${convStatusLabel(cfg.status)} · ${confirmed} de ${capacity} confirmados`
      );
      if (cfg.status === "open" || confirmed > 0) setConvTouched(true);
    } catch {
      setConvLine("Gestionar convocatoria");
    }
  }, [openRegistration?.tournamentId]);

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
      return;
    }
    setConvLine(
      `${convStatusLabel(snap.status ?? undefined)} · ${snap.confirmed} de ${snap.capacity} confirmados`
    );
  }, []);

  const maxMatches = Math.min(Math.floor(players.length / 4), courts);
  const benchPerRound = Math.max(0, players.length - maxMatches * 4);

  const jugadoresOk = players.length >= 4;
  const configOk = totalRounds >= 1 && courts >= 1;
  const canStart = jugadoresOk && configOk;
  const showConvocatoriaPanel = wantConvocatoria || convIsLive;

  const ctaHint = !jugadoresOk
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
        id: "listo",
        label: "Listo",
        status: stepStatus("listo", step, canStart),
        count: canStart ? "OK" : "Pendiente",
      },
    ],
    [step, jugadoresOk, players.length, canStart]
  );

  const workbenchTitle =
    step === "jugadores" ? "Jugadores" : "Listo para iniciar";

  const workbenchBody =
    step === "jugadores" ? (
      <div className="americano-registration__db">
        <p className="americano-registration__format-note" role="note">
          Formato americano equilibrado: las parejas se rotan automáticamente.
          El ranking solo muestra posiciones; no forma partidos.
        </p>
        <p className="americano-registration__hint">
          {registryTitle}. Toca un jugador para seleccionarlo o deseleccionarlo.
        </p>
        {availablePlayers.length === 0 ? (
          <p className="americano-registration__empty">
            {getRegistryEmptyMessage(organizerName)}
          </p>
        ) : null}
        <div className="americano-registration__db-grid">
          {availablePlayers.map((player) => {
            const selected = players.some((p) => p.id === player.id);
            return (
              <button
                type="button"
                key={player.id}
                className={`americano-registration__db-item${
                  selected ? " selected" : ""
                }`}
                onClick={() => onToggleExistingPlayer(player)}
              >
                {selected ? (
                  <TablerIcon
                    name="check"
                    size={13}
                    className="americano-registration__db-item-check"
                  />
                ) : null}
                {player.name}
              </button>
            );
          })}
        </div>
        <h4 className="americano-registration__selected-title">
          Seleccionados ({players.length})
        </h4>
        <ul className="americano-registration__list">
          {players.length === 0 ? (
            <li className="americano-registration__empty">
              Aún no has seleccionado jugadores.
            </li>
          ) : (
            players.map((player) => (
              <li key={player.id}>
                <span>{player.name}</span>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => onRemovePlayer(player.id)}
                >
                  Quitar
                </Button>
              </li>
            ))
          )}
        </ul>
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
            onClick={() => {
              document
                .getElementById("americano-detalles-inline")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            Ir a detalles
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
    disabled: !canStart,
    hint: ctaHint,
    onClick: () => onStartTournament(totalRounds, courts),
  };

  const sidebarPanel = (
    <div className="qm-ws-panel">
      <section className="qm-ws-panel__block">
        <h3 className="qm-ws-panel__label">Progreso</h3>
        <ul className="qm-ws-panel__progress">
          <li className={jugadoresOk ? "is-ok" : ""}>Jugadores (min. 4)</li>
          <li className={configOk ? "is-ok" : ""}>Rondas y canchas</li>
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
      <div className="reta-config-panel reta-config-panel--inline">
        <header className="reta-config-panel__toolbar">
          <div className="reta-config-panel__toolbar-copy">
            <h2 className="reta-config-panel__title">Detalles de la reta</h2>
            <p className="reta-config-panel__subtitle">
              Rondas y canchas del americano.
              {eventSubtitle ? ` ${eventSubtitle}` : ""}
            </p>
          </div>
        </header>
        <div className="reta-details-form">
          <div className="reta-details-form__row reta-details-form__row--primary americano-registration__details-row">
            <label className="home-sheet__field reta-details-form__field">
              <span className="home-sheet__field-label">Rondas</span>
              <Input
                type="number"
                min={1}
                value={totalRounds}
                onChange={(e) =>
                  setTotalRounds(Math.max(1, Number(e.target.value) || 1))
                }
              />
            </label>
            <label className="home-sheet__field reta-details-form__field">
              <span className="home-sheet__field-label">Canchas</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={courts}
                onChange={(e) =>
                  setCourts(
                    Math.min(20, Math.max(1, Number(e.target.value) || 1))
                  )
                }
              />
            </label>
          </div>
          <p className="americano-registration__courts-hint" role="note">
            Partidos/ronda: {maxMatches} · Descansan: {benchPerRound}. Las
            canchas rotan entre rondas.
          </p>
        </div>
      </div>

      {openRegistration ? (
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
            {showConvocatoriaPanel ? (
              <ConvocatoriaWhatsAppPanel
                embedded
                onLiveChange={onConvLiveChange}
                context={buildTournamentConvocatoriaContext({
                  mode: "americano",
                  tournamentId: openRegistration.tournamentId,
                  name: openRegistration.name,
                  locationLabel: openRegistration.locationLabel,
                  clubName: openRegistration.locationLabel,
                })}
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
