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
  QuickModeStepper,
  type QuickModeStep,
  type QuickModeStepStatus,
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

type NuevoStepId = "listo";

function stepStatus(
  id: NuevoStepId,
  active: NuevoStepId,
  complete: boolean
): QuickModeStepStatus {
  if (active === id) return "active";
  if (complete) return "complete";
  return "pending";
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
      cancha: "",
      ...defaultScheduleLocal(),
      duration_minutes: 90,
    }),
    [lugarDefault]
  );
  const [values, setValues] = useState<RetaConfigFormValues>(initialValues);
  const [step] = useState<NuevoStepId>("listo");
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [wantConvocatoria, setWantConvocatoria] = useState(false);

  if (!modeId) return null;

  const mode = GAME_MODES.find((m) => m.id === modeId);
  if (!mode) return null;

  const isAmericano = modeId === "americano";
  const isRoundRobin = modeId === "round-robin";
  const schedule = splitProgramado(values.programado_en);

  const encuentroOk =
    values.name.trim().length > 0 && values.courts >= 1;
  const horarioOk =
    schedule.date.length > 0 &&
    schedule.time.length > 0 &&
    (!values.mostrar_lugar || values.lugar.trim().length > 0);
  const canSubmit = encuentroOk && horarioOk;

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

  const steps: QuickModeStep[] = [
    {
      id: "listo",
      label: "Listo",
      status: stepStatus("listo", step, canSubmit),
      count: canSubmit ? "OK" : "Pendiente",
    },
  ];

  const ctaHint = !encuentroOk
    ? "Completa nombre y canchas"
    : !horarioOk
      ? "Completa lugar y horario"
      : "Al guardar entras a preparar jugadores y convocatoria";

  const ctaProps = {
    variant: "sidebar" as const,
    label: submitting
      ? "Guardando…"
      : canSubmit
        ? "Guardar y continuar"
        : "Guardar reta",
    disabled: !canSubmit || submitting,
    loading: submitting,
    hint: ctaHint,
    testId: "guardar-reta",
    onClick: handleSave,
  };

  const scrollToDetails = () => {
    document
      .getElementById("reta-nuevo-detalles-inline")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const detailsPanel = (
    <section
      id="reta-nuevo-detalles-inline"
      className="qm-ws__details-inline"
      aria-label="Detalles de la reta"
    >
      <div className="reta-config-panel reta-config-panel--inline">
        <header className="reta-config-panel__toolbar">
          <div className="reta-config-panel__toolbar-copy">
            <h2 className="reta-config-panel__title">Detalles de la reta</h2>
            <p className="reta-config-panel__subtitle">
              Nombre, horario, sede y canchas. Si sales sin guardar, no se crea
              nada.
            </p>
          </div>
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
          <p className="home-sheet__field-hint" role="note">
            En Americano solo juegan tantos partidos como canchas; el resto
            descansa esa ronda.
          </p>
        ) : null}
      </div>
      <div id="reta-nuevo-convocatoria-inline">
        <QuickModeConvocatoriaGate
          open={wantConvocatoria}
          live={false}
          panelId="reta-nuevo-convocatoria-panel"
          onToggle={() => setWantConvocatoria((v) => !v)}
          hintOn="Guarda la reta para configurar cupo y WhatsApp"
          hintOff="Opcional · Inscripciones con enlace público"
        >
          <div className="qm-ws__conv-prelaunch-note" role="note">
            <p>
              Primero guarda la reta. Después podrás lanzar la convocatoria con
              enlace público y WhatsApp.
            </p>
          </div>
        </QuickModeConvocatoriaGate>
      </div>
    </section>
  );

  const workbenchBody = (
    <ul className="qm-ws__ready-check">
      <li className={encuentroOk ? "is-ok" : "is-miss"}>
        <span className="qm-ws__ready-mark" aria-hidden>
          {encuentroOk ? "OK" : "!"}
        </span>
        <span className="qm-ws__ready-copy">
          {encuentroOk
            ? `${values.name.trim()} · ${values.courts} cancha${
                values.courts === 1 ? "" : "s"
              }`
            : "Falta nombre o canchas"}
        </span>
        {!encuentroOk ? (
          <button
            type="button"
            className="qm-ws__text-btn"
            onClick={scrollToDetails}
          >
            Completar
          </button>
        ) : null}
      </li>
      <li className={horarioOk ? "is-ok" : "is-miss"}>
        <span className="qm-ws__ready-mark" aria-hidden>
          {horarioOk ? "OK" : "!"}
        </span>
        <span className="qm-ws__ready-copy">
          {horarioOk
            ? `${schedule.date} · ${schedule.time}${
                values.mostrar_lugar && values.lugar.trim()
                  ? ` · ${values.lugar.trim()}`
                  : ""
              }`
            : "Falta lugar u horario"}
        </span>
        {!horarioOk ? (
          <button
            type="button"
            className="qm-ws__text-btn"
            onClick={scrollToDetails}
          >
            Completar
          </button>
        ) : null}
      </li>
      <li className="is-soft">
        <span className="qm-ws__ready-mark" aria-hidden>
          ·
        </span>
        <span className="qm-ws__ready-copy">
          Al guardar entras a preparar jugadores, parejas y convocatoria.
        </span>
      </li>
    </ul>
  );

  const sidebarPanel = (
    <div className="qm-ws-panel">
      <section className="qm-ws-panel__block">
        <h3 className="qm-ws-panel__label">Progreso</h3>
        <ul className="qm-ws-panel__progress">
          <li className={encuentroOk ? "is-ok" : ""}>Nombre y canchas</li>
          <li className={horarioOk ? "is-ok" : ""}>Lugar y horario</li>
          <li className={canSubmit ? "is-ok" : ""}>Listo para guardar</li>
        </ul>
      </section>
      <section className="qm-ws-panel__block">
        <h3 className="qm-ws-panel__label">Siguiente</h3>
        <p className="qm-ws-panel__conv-line">
          Al guardar preparas el evento y lanzas la convocatoria por WhatsApp.
        </p>
      </section>
      <section className="qm-ws-panel__block qm-ws-panel__cta-desktop">
        <QuickModePrimaryCta {...ctaProps} />
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
        className={`qm-ws--wide${mobileSummaryOpen ? " is-summary-open" : ""}`}
        header={
          <QuickModeEventHeader
            club={modeEyebrow}
            title={`Nuevo · ${mode.title}`}
            modality={mode.title}
            statusLabel="Pendiente"
            centerMetrics={[
              { label: "Formato", value: mode.title },
              {
                label: "Canchas",
                value: String(values.courts || "—"),
              },
              { label: "Día", value: schedule.date || "—" },
              {
                label: "Horario",
                value: schedule.time || "—",
              },
            ]}
            rightMeta={[
              {
                label: "Lugar",
                value: values.mostrar_lugar
                  ? values.lugar.trim() || "—"
                  : "Oculto",
              },
              {
                label: "Descripción",
                value: values.description.trim() || "—",
              },
              {
                label: "Nivel",
                value: values.nivel.trim() || "—",
              },
            ]}
          />
        }
        details={detailsPanel}
        stepper={
          <QuickModeStepper
            steps={steps}
            activeId={step}
            onChange={() => undefined}
          />
        }
        workbench={
          <>
            <div className="qm-ws__workbench-head">
              <h2 className="qm-ws__workbench-title">Listo para guardar</h2>
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
    </div>
  );
};

export default QuickStartSheet;
