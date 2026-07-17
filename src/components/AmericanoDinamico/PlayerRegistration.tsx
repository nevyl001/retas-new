import React, { useEffect, useMemo, useState } from "react";
import {
  getRegistryEmptyMessage,
  getRegistrySectionLabel,
  useBranding,
  useClubModeEyebrow,
} from "../../club-experience";
import type { AmericanoPlayer } from "../../lib/db/types";
import type { Player } from "../../lib/database";
import {
  QuickModeEventHeader,
  QuickModePrepWorkspace,
  QuickModePrimaryCta,
  QuickModeStepper,
  type QuickModeStep,
  type QuickModeStepStatus,
} from "../platform/quickMode";
import "./PlayerRegistration.css";

type PrepStepId = "jugadores" | "configuracion" | "convocatoria" | "listo";

interface PlayerRegistrationProps {
  players: AmericanoPlayer[];
  availablePlayers: Player[];
  onRemovePlayer: (id: string) => void;
  onToggleExistingPlayer: (player: Player) => void;
  onStartTournament: (totalRounds: number, courts: number) => void;
  /** Canchas ya definidas al crear la reta (QuickStart / DB). */
  initialCourts?: number;
  convocatoriaSlot?: React.ReactNode;
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

export const PlayerRegistration: React.FC<PlayerRegistrationProps> = ({
  players,
  availablePlayers,
  onRemovePlayer,
  onToggleExistingPlayer,
  onStartTournament,
  initialCourts = 1,
  convocatoriaSlot,
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
  const [totalRounds, setTotalRounds] = useState(3);
  const [courts, setCourts] = useState(() =>
    Math.min(20, Math.max(1, Math.floor(initialCourts) || 1))
  );

  useEffect(() => {
    const next = Math.min(20, Math.max(1, Math.floor(initialCourts) || 1));
    setCourts(next);
  }, [initialCourts]);

  const maxMatches = Math.min(Math.floor(players.length / 4), courts);
  const benchPerRound = Math.max(0, players.length - maxMatches * 4);

  const jugadoresOk = players.length >= 4;
  const configOk = totalRounds >= 1 && courts >= 1;
  const canStart = jugadoresOk && configOk;

  const ctaHint = !jugadoresOk
    ? players.length === 0
      ? "Selecciona al menos 4 jugadores"
      : `Faltan ${4 - players.length} jugador${4 - players.length === 1 ? "" : "es"}`
    : `${totalRounds} rondas · ${courts} cancha${courts === 1 ? "" : "s"}`;

  const goConvocatoria = () => {
    setConvTouched(true);
    setStep("convocatoria");
  };

  const steps: QuickModeStep[] = useMemo(
    () => [
      {
        id: "jugadores",
        label: "Jugadores",
        status: stepStatus("jugadores", step, jugadoresOk),
        meta: String(players.length),
      },
      {
        id: "configuracion",
        label: "Configuración",
        status: stepStatus("configuracion", step, configOk),
        meta: `${totalRounds}r · ${courts}c`,
      },
      {
        id: "convocatoria",
        label: "Convocatoria",
        status: stepStatus(
          "convocatoria",
          step,
          convTouched || Boolean(convocatoriaSlot)
        ),
        meta: convTouched ? "Revisada" : "Pendiente",
      },
      {
        id: "listo",
        label: "Listo",
        status: stepStatus("listo", step, canStart),
        meta: canStart ? "OK" : "Pendiente",
      },
    ],
    [
      step,
      jugadoresOk,
      players.length,
      configOk,
      totalRounds,
      courts,
      convTouched,
      convocatoriaSlot,
      canStart,
    ]
  );

  const workbenchTitle =
    step === "jugadores"
      ? "Jugadores"
      : step === "configuracion"
        ? "Configuración"
        : step === "convocatoria"
          ? "Convocatoria"
          : "Listo para iniciar";

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
                {selected ? "✓ " : ""}
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
                <button
                  type="button"
                  className="americano-btn americano-btn--danger"
                  onClick={() => onRemovePlayer(player.id)}
                >
                  Quitar
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    ) : step === "configuracion" ? (
      <div className="americano-registration__start">
        {eventSubtitle ? (
          <p className="americano-registration__hint">{eventSubtitle}</p>
        ) : null}
        <div className="americano-registration__start-row">
          <label>
            Rondas:
            <input
              type="number"
              min={1}
              value={totalRounds}
              onChange={(e) =>
                setTotalRounds(Math.max(1, Number(e.target.value) || 1))
              }
            />
          </label>
          <label>
            Canchas:
            <input
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
        <p className="americano-registration__courts-hint">
          Solo hay tantos partidos simultáneos como canchas ({maxMatches}{" "}
          partido{maxMatches === 1 ? "" : "s"}/ronda · {benchPerRound}{" "}
          descansan). Las canchas rotan entre rondas.
        </p>
      </div>
    ) : step === "convocatoria" ? (
      <div className="qm-ws__convocatoria americano-registration__conv">
        {convocatoriaSlot ?? (
          <p className="americano-registration__empty">
            Convocatoria no disponible todavía.
          </p>
        )}
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
            onClick={() => setStep("configuracion")}
          >
            Configurar
          </button>
        </li>
        <li className={convTouched ? "is-ok" : "is-soft"}>
          <span className="qm-ws__ready-mark" aria-hidden>
            {convTouched ? "OK" : "·"}
          </span>
          <span className="qm-ws__ready-copy">
            {convTouched ? "Convocatoria revisada" : "Convocatoria sin revisar"}
          </span>
          <button
            type="button"
            className="qm-ws__text-btn"
            onClick={goConvocatoria}
          >
            Ver convocatoria
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
        <p className="qm-ws-panel__conv-line">
          {convTouched ? "Revisada en el paso Convocatoria" : "Sin revisar"}
        </p>
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
    </div>
  );

  return (
    <section className="americano-registration americano-registration--workspace">
      <QuickModePrepWorkspace
        className={mobileSummaryOpen ? "is-summary-open" : ""}
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
              {
                label: "Formato",
                value: "Rotativo",
              },
            ]}
            onEditDetails={() => setStep("configuracion")}
            editDetailsLabel="Editar configuración"
          />
        }
        stepper={
          <QuickModeStepper
            steps={steps}
            activeId={step}
            onChange={(id) => {
              const next = id as PrepStepId;
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
    </section>
  );
};
