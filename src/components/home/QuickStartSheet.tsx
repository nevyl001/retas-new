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

  const encuentroOk =
    values.name.trim().length > 0 && values.courts >= 1;
  const horarioOk =
    schedule.date.length > 0 &&
    schedule.time.length > 0 &&
    (!values.mostrar_lugar || values.lugar.trim().length > 0);
  const canSubmit = encuentroOk && horarioOk;

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

  const ctaHint = blockReason ?? "Al guardar entras a preparar jugadores y convocatoria";

  const ctaProps = {
    variant: "sidebar" as const,
    label: submitting
      ? "Guardando…"
      : canSubmit
        ? "Guardar y continuar"
        : "Guardar y continuar",
    disabled: !canSubmit || submitting,
    loading: submitting,
    hint: canSubmit ? undefined : ctaHint,
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
        <header className="reta-config-panel__toolbar">
          <div className="reta-config-panel__toolbar-copy">
            <h2 className="reta-config-panel__title">Nueva reta</h2>
            <p className="reta-config-panel__subtitle">
              Configura lo esencial para empezar.
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
      <div
        id="reta-nuevo-convocatoria-inline"
        className="reta-config-panel__conv reta-config-panel__conv--compose"
      >
        <div className="reta-config-panel__conv-head">
          <h3 className="reta-config-panel__conv-title">Convocatoria pública</h3>
          <p className="reta-config-panel__conv-desc">
            Permite que jugadores se registren mediante enlace.
          </p>
        </div>
        <QuickModeConvocatoriaGate
          open={wantConvocatoria}
          live={false}
          panelId="reta-nuevo-convocatoria-panel"
          titleOn="Activa"
          titleOff="Inactiva"
          hintOn="Panel abierto — guarda la reta para configurar cupo."
          hintOff="Opcional"
          onToggle={() => setWantConvocatoria((v) => !v)}
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

  const sidebarPanel = (
    <div className="qm-ws-panel qm-ws-panel--compose">
      <section className="qm-ws-panel__compose-summary" aria-label="Resumen">
        <p className="qm-ws-panel__compose-kicker">Resumen</p>
        <p className="qm-ws-panel__compose-format">{mode.title}</p>
        <p className="qm-ws-panel__compose-when">
          {formatSidebarWhen(schedule.date, schedule.time)}
        </p>
        <p className="qm-ws-panel__compose-meta">
          {values.duration_minutes} MIN · {values.courts} CANCHA
          {values.courts === 1 ? "" : "S"}
        </p>
        {values.mostrar_lugar && values.lugar.trim() ? (
          <p className="qm-ws-panel__compose-lugar">{values.lugar.trim()}</p>
        ) : null}
        <p className="qm-ws-panel__compose-nivel">
          {values.nivel.trim() || "Sin definir"}
        </p>
      </section>

      <div className="qm-ws-panel__compose-rule" aria-hidden />

      <section className="qm-ws-panel__compose-status" aria-live="polite">
        {canSubmit ? (
          <p className="qm-ws-panel__compose-ready">✓ Todo listo para continuar</p>
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
                ? "✓ Lista"
                : blockReason?.replace(/\.$/, "") || "Faltan datos"}
            </span>
            <QuickModePrimaryCta {...ctaProps} />
          </div>
        }
      />
    </div>
  );
};

export default QuickStartSheet;
