import React, { useMemo, useState } from "react";
import { useClubModeEyebrow, useConvocatoriaOriginName } from "../../club-experience";
import type { GameModeId } from "./gameModesConfig";
import { GAME_MODES } from "./gameModesConfig";
import { ActionBar } from "../platform/ActionBar";
import { Button } from "../ui";
import { RetaConfigFields } from "../reta/RetaConfigFields";
import type { RetaConfigFormValues } from "../../lib/reta/updateRetaConfig";
import {
  QuickModeConvocatoriaGate,
  QuickModeEventHeader,
  QuickModePrepWorkspace,
  QuickModePrimaryCta,
} from "../platform/quickMode";

export interface QuickStartPayload {
  modeId: GameModeId;
  name: string;
  description?: string;
  courts: number;
  championshipEnabled?: boolean;
  championshipRounds?: number;
  /** Valores completos de Detalles (horario, nivel, lugar, etc.). */
  values: RetaConfigFormValues;
}

interface QuickStartSheetProps {
  modeId: GameModeId | null;
  onClose: () => void;
  onSubmit: (payload: QuickStartPayload) => void;
  submitting?: boolean;
}

function defaultScheduleLocal(): { programado_en: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  return { programado_en: `${y}-${m}-${d}T15:00` };
}

function splitProgramado(programado_en: string): { date: string; time: string } {
  const raw = (programado_en || "").trim();
  if (!raw) return { date: "", time: "" };
  const [date = "", timePart = ""] = raw.split("T");
  return { date, time: timePart.slice(0, 5) };
}

const MONTHS_SHORT = [
  "ENE",
  "FEB",
  "MAR",
  "ABR",
  "MAY",
  "JUN",
  "JUL",
  "AGO",
  "SEP",
  "OCT",
  "NOV",
  "DIC",
] as const;

function formatSidebarWhen(date: string, time: string): string {
  if (!date) return "Sin fecha";
  const [y, m, d] = date.split("-").map((x) => Number(x));
  if (!y || !m || !d) return date;
  const month = MONTHS_SHORT[m - 1] ?? "";
  const day = String(d).padStart(2, "0");
  return time ? `${day} ${month} · ${time}` : `${day} ${month}`;
}

/**
 * Alta de reta: mismo shell Quick Mode que Nuevo duelo 2 vs 2.
 * No escribe en BD hasta Guardar; Volver cancela sin crear.
 */
export const QuickStartSheet: React.FC<QuickStartSheetProps> = ({
  modeId,
  onClose,
  onSubmit,
  submitting = false,
}) => {
  const modeEyebrow = useClubModeEyebrow();
  const lugarDefault = useConvocatoriaOriginName();
  const initialValues = useMemo<RetaConfigFormValues>(
    () => ({
      name: "",
      description: "",
      nivel: "",
      courts: 2,
      championshipEnabled: false,
      championshipRounds: 2,
      lugar: lugarDefault || "",
      mostrar_lugar: true,
      costo: "",
      mostrar_costo: false,
      premio: "",
      mostrar_premio: false,
      rama: "",
      cancha: "",
      ...defaultScheduleLocal(),
      duration_minutes: 90,
    }),
    [lugarDefault]
  );
  const [values, setValues] = useState<RetaConfigFormValues>(initialValues);
  const [wantConvocatoria, setWantConvocatoria] = useState(false);

  if (!modeId) return null;

  const mode = GAME_MODES.find((m) => m.id === modeId);
  if (!mode) return null;

  const isAmericano = modeId === "americano";
  const isRoundRobin = modeId === "round-robin";
  const schedule = splitProgramado(values.programado_en);

  const nameReady = values.name.trim().length > 0;
  const courtsReady = values.courts >= 1;
  const whenReady = schedule.date.length > 0 && schedule.time.length > 0;
  const lugarReady = !values.mostrar_lugar || values.lugar.trim().length > 0;
  const sportConfigured = Boolean(
    values.nivel.trim() || values.rama || values.championshipEnabled
  );

  const encuentroOk = nameReady && courtsReady;
  const horarioOk = whenReady && lugarReady;
  const canSubmit = encuentroOk && horarioOk;

  const readyCount = [nameReady, whenReady, courtsReady, lugarReady].filter(
    Boolean
  ).length;

  const ramaLabel =
    values.rama === "varonil"
      ? "Varonil"
      : values.rama === "femenil"
        ? "Femenil"
        : values.rama === "mixta"
          ? "Mixta"
          : "Rama libre";

  const blockReason = !values.name.trim()
    ? "Agrega un nombre para continuar."
    : values.courts < 1
      ? "Indica las canchas para continuar."
      : !schedule.date
        ? "Agrega la fecha para continuar."
        : !schedule.time
          ? "Agrega la hora para continuar."
          : values.mostrar_lugar && !values.lugar.trim()
            ? "Agrega el lugar para continuar."
            : null;

  const buildPayload = (): QuickStartPayload => {
    const name = values.name.trim() || `Reta ${mode.title}`;
    return {
      modeId,
      name,
      description: values.description.trim() || undefined,
      courts: values.courts,
      values: { ...values, name },
      ...(isRoundRobin
        ? {
            championshipEnabled: values.championshipEnabled,
            championshipRounds: values.championshipRounds,
          }
        : {}),
    };
  };

  const handleSave = () => {
    if (!canSubmit || submitting) return;
    onSubmit(buildPayload());
  };

  const step1Done = nameReady && whenReady && courtsReady;
  const step2Done = step1Done && sportConfigured;
  const step3Done = step1Done && lugarReady;
  const step4Done = canSubmit;

  const ctaProps = {
    variant: "sidebar" as const,
    label: submitting ? "Guardando…" : "Guardar y continuar",
    disabled: !canSubmit || submitting,
    loading: submitting,
    hint: undefined,
    testId: "guardar-reta",
    onClick: handleSave,
  };

  const detailsPanel = (
    <section
      id="reta-nuevo-detalles-inline"
      className="qm-ws__details-inline qm-ws__details-inline--compose"
      aria-label="Detalles de la reta"
    >
      <div className="reta-config-panel reta-config-panel--inline reta-config-panel--compose">
        <header className="reta-config-panel__toolbar reta-config-panel__toolbar--guided">
          <div className="reta-config-panel__toolbar-top">
            <div className="reta-config-panel__toolbar-copy">
              <span className="reta-config-panel__eyebrow">
                Asistente de creación · {mode.title}
              </span>
              <h2 className="reta-config-panel__title">
                Configura tu reta paso a paso
              </h2>
              <p className="reta-config-panel__subtitle">
                Configura lo esencial para empezar y deja lista su publicación.
              </p>
            </div>
            <span
              className={`reta-config-panel__progress-pill${
                canSubmit ? " is-complete" : ""
              }`}
              aria-live="polite"
            >
              {canSubmit
                ? "✓ 4 de 4 listos"
                : `${readyCount} de 4 esenciales`}
            </span>
          </div>

          <ol
            className="qm-compose-steps"
            aria-label="Pasos para crear tu reta"
          >
            <li
              className={`qm-compose-steps__item${
                step1Done ? " is-done" : " is-current"
              }`}
            >
              <span className="qm-compose-steps__num">
                {step1Done ? "✓" : "1"}
              </span>
              <span className="qm-compose-steps__label">
                Información básica
              </span>
            </li>
            <li
              className={`qm-compose-steps__item${
                step2Done ? " is-done" : step1Done ? " is-current" : ""
              }`}
            >
              <span className="qm-compose-steps__num">
                {step2Done ? "✓" : "2"}
              </span>
              <span className="qm-compose-steps__label">
                Configuración deportiva
              </span>
            </li>
            <li
              className={`qm-compose-steps__item${
                step3Done ? " is-done" : ""
              }`}
            >
              <span className="qm-compose-steps__num">
                {step3Done ? "✓" : "3"}
              </span>
              <span className="qm-compose-steps__label">
                Detalles y enlace
              </span>
            </li>
            <li
              className={`qm-compose-steps__item${
                step4Done ? " is-done" : ""
              }`}
            >
              <span className="qm-compose-steps__num">
                {step4Done ? "✓" : "4"}
              </span>
              <span className="qm-compose-steps__label">Revisión final</span>
            </li>
          </ol>
        </header>

        <RetaConfigFields
          mode="create"
          phase="draft"
          layout="essentials"
          values={values}
          onChange={setValues}
          disabled={submitting}
          showChampionship={isRoundRobin}
        />
        {isAmericano ? (
          <p className="home-sheet__field-hint reta-config-panel__mode-note" role="note">
            En Americano solo juegan tantos partidos como canchas; el resto
            descansa esa ronda.
          </p>
        ) : null}

        <div
          id="reta-nuevo-convocatoria-inline"
          className="reta-config-panel__conv reta-config-panel__conv--compose"
        >
          <div className="reta-config-panel__conv-head">
            <div className="reta-config-panel__conv-copy">
              <h4 className="reta-config-panel__conv-title">
                Convocatoria pública
              </h4>
              <p className="reta-config-panel__conv-desc">
                Actívala si quieres que los jugadores puedan registrarse mediante
                enlace.
              </p>
            </div>
          </div>
          <QuickModeConvocatoriaGate
            open={wantConvocatoria}
            live={false}
            panelId="reta-nuevo-convocatoria-panel"
            titleOn="Activa"
            titleOff="Inactiva"
            hintOn="Al guardar podrás compartir el enlace público y por WhatsApp."
            hintOff="Opcional · Puedes activarla ahora o después"
            onToggle={() => setWantConvocatoria((v) => !v)}
          >
            <div className="qm-ws__conv-prelaunch-note" role="note">
              <p>
                Primero guarda la reta. En el siguiente paso podrás configurar el
                cupo y compartir el enlace de inscripción por WhatsApp.
              </p>
            </div>
          </QuickModeConvocatoriaGate>
        </div>
      </div>
    </section>
  );

  const sidebarPanel = (
    <div className="qm-ws-panel qm-ws-panel--compose">
      <section className="qm-ws-panel__compose-summary" aria-label="Resumen">
        <div className="qm-ws-panel__compose-head">
          <div>
            <span className="qm-ws-panel__compose-step">
              Paso 4 · Revisión final
            </span>
            <p className="qm-ws-panel__compose-kicker">Resumen</p>
          </div>
          <span
            className={`qm-ws-panel__compose-badge${
              canSubmit ? " is-ready" : ""
            }`}
          >
            {canSubmit ? "Lista" : `${readyCount}/4`}
          </span>
        </div>

        <div
          className="qm-ws-panel__compose-progress"
          role="progressbar"
          aria-valuenow={readyCount}
          aria-valuemin={0}
          aria-valuemax={4}
          aria-label="Progreso de datos esenciales"
        >
          <div
            className="qm-ws-panel__compose-progress-fill"
            style={{ width: `${(readyCount / 4) * 100}%` }}
          />
        </div>

        <ul className="qm-ws-panel__compose-checklist">
          <li
            className={`qm-ws-panel__compose-check${
              nameReady ? " is-done" : " is-missing"
            }`}
          >
            <span className="qm-ws-panel__compose-check-icon" aria-hidden>
              {nameReady ? "✓" : "○"}
            </span>
            <div className="qm-ws-panel__compose-check-body">
              <span className="qm-ws-panel__compose-check-label">
                Nombre de la reta
              </span>
              <span className="qm-ws-panel__compose-check-val">
                {nameReady
                  ? values.name.trim()
                  : "Pendiente — escribe un nombre"}
              </span>
            </div>
          </li>

          <li
            className={`qm-ws-panel__compose-check${
              whenReady ? " is-done" : " is-missing"
            }`}
          >
            <span className="qm-ws-panel__compose-check-icon" aria-hidden>
              {whenReady ? "✓" : "○"}
            </span>
            <div className="qm-ws-panel__compose-check-body">
              <span className="qm-ws-panel__compose-check-label">
                Fecha y horario
              </span>
              <span className="qm-ws-panel__compose-check-val">
                {whenReady
                  ? `${formatSidebarWhen(schedule.date, schedule.time)} · ${values.duration_minutes} min`
                  : "Pendiente — define día y hora"}
              </span>
            </div>
          </li>

          <li
            className={`qm-ws-panel__compose-check${
              courtsReady ? " is-done" : " is-missing"
            }`}
          >
            <span className="qm-ws-panel__compose-check-icon" aria-hidden>
              {courtsReady ? "✓" : "○"}
            </span>
            <div className="qm-ws-panel__compose-check-body">
              <span className="qm-ws-panel__compose-check-label">
                Dinámica y canchas
              </span>
              <span className="qm-ws-panel__compose-check-val">
                {values.courts} {values.courts === 1 ? "cancha" : "canchas"} ·{" "}
                {mode.title}
              </span>
            </div>
          </li>

          <li
            className={`qm-ws-panel__compose-check${
              lugarReady ? " is-done" : " is-missing"
            }`}
          >
            <span className="qm-ws-panel__compose-check-icon" aria-hidden>
              {lugarReady ? "✓" : "○"}
            </span>
            <div className="qm-ws-panel__compose-check-body">
              <span className="qm-ws-panel__compose-check-label">
                Sede del encuentro
              </span>
              <span className="qm-ws-panel__compose-check-val">
                {lugarReady
                  ? values.mostrar_lugar
                    ? values.lugar.trim()
                    : "Oculto en ficha pública"
                  : "Pendiente — indica el lugar"}
              </span>
            </div>
          </li>
        </ul>

        <div className="qm-ws-panel__compose-tags">
          <span className="qm-ws-panel__compose-tag">
            {values.nivel.trim() || "Categoría abierta"} · {ramaLabel}
          </span>
          <span className="qm-ws-panel__compose-tag">
            {wantConvocatoria
              ? "Convocatoria por enlace"
              : "Inscripción manual"}
          </span>
        </div>
      </section>

      <div className="qm-ws-panel__compose-rule" aria-hidden />

      <section className="qm-ws-panel__compose-status" aria-live="polite">
        {canSubmit ? (
          <p className="qm-ws-panel__compose-ready">
            ✓ Todo listo para continuar
          </p>
        ) : (
          <>
            <p className="qm-ws-panel__compose-blocked">● Faltan datos</p>
            <p className="qm-ws-panel__compose-reason">
              {blockReason?.replace(/\.$/, "") || "Completa lo esencial"}
            </p>
          </>
        )}
      </section>

      <section className="qm-ws-panel__block qm-ws-panel__cta-desktop">
        <QuickModePrimaryCta {...ctaProps} />
        <p className="qm-ws-panel__compose-next-hint">
          En el siguiente paso podrás agregar jugadores y publicar el enlace.
        </p>
      </section>
    </div>
  );

  return (
    <div className="home-create-details home-create-details--qm rv-page">
      <ActionBar className="riviera-back-toolbar">
        <Button
          type="button"
          variant="back"
          disabled={submitting}
          onClick={onClose}
        >
          ← Volver al inicio
        </Button>
      </ActionBar>

      <QuickModePrepWorkspace
        className="qm-ws--wide qm-ws--create-compose"
        header={
          <QuickModeEventHeader
            className="qm-event-header--create-min"
            club={modeEyebrow}
            title="Nueva reta"
            modality={mode.title}
            statusLabel="Pendiente"
            phaseLabel=""
          />
        }
        details={detailsPanel}
        stepper={null}
        workbench={null}
        sidebar={sidebarPanel}
        stickyCta={
          <div className="qm-ws__compose-mobile-bar">
            <span className="qm-ws__compose-mobile-status">
              {canSubmit
                ? "✓ Lista para guardar"
                : blockReason?.replace(/\.$/, "") || "Faltan datos"}
            </span>
            <QuickModePrimaryCta {...ctaProps} testId={undefined} />
          </div>
        }
      />
    </div>
  );
};

export default QuickStartSheet;
