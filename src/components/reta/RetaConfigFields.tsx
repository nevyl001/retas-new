import React from "react";
import type { RetaConfigFormValues } from "../../lib/reta/updateRetaConfig";
import {
  fieldEditability,
  type RetaEditPhase,
  type RetaConfigFieldKey,
} from "../../lib/reta/retaConfigEditRules";
import {
  RETA_COURTS_MAX,
  RETA_COURTS_MIN,
  clampChampionshipRoundsShared,
  clampRetaCourts,
  clampRetaDurationMinutes,
} from "../../lib/reta/retaConfigValidation";

export type RetaConfigFieldsProps = {
  values: RetaConfigFormValues;
  onChange: (next: RetaConfigFormValues) => void;
  phase: RetaEditPhase;
  /** create = botón externo dice Iniciar; edit = Guardar */
  mode: "create" | "edit";
  showChampionship?: boolean;
  disabled?: boolean;
};

function FieldLock({ reason }: { reason?: string }) {
  if (!reason) return null;
  return (
    <p
      className="home-sheet__field-optional"
      role="note"
      style={{ display: "block", marginTop: 4 }}
    >
      {reason}
    </p>
  );
}

export const RetaConfigFields: React.FC<RetaConfigFieldsProps> = ({
  values,
  onChange,
  phase,
  mode,
  showChampionship = true,
  disabled = false,
}) => {
  const patch = (partial: Partial<RetaConfigFormValues>) =>
    onChange({ ...values, ...partial });

  const ed = (f: RetaConfigFieldKey) => {
    const info = fieldEditability(f, phase);
    return {
      ...info,
      locked: disabled || (mode === "edit" && !info.editable),
    };
  };

  const nameEd = ed("name");
  const descEd = ed("description");
  const courtsEd = ed("courts");
  const champEd = ed("championship");
  const lugarEd = ed("lugar");
  const canchaEd = ed("cancha");
  const schedEd = ed("programado_en");
  const durEd = ed("duration_minutes");

  return (
    <div className="home-sheet__fields reta-config-fields">
      <label className="home-sheet__field">
        <span className="home-sheet__field-label">Nombre de la reta</span>
        <span className="home-sheet__field-optional">Opcional</span>
        <input
          type="text"
          className="home-sheet__input riviera-input"
          placeholder="Reta del domingo…"
          value={values.name}
          disabled={nameEd.locked}
          onChange={(e) => patch({ name: e.target.value })}
        />
        {nameEd.locked ? <FieldLock reason={nameEd.reason} /> : null}
      </label>

      <label className="home-sheet__field">
        <span className="home-sheet__field-label">Descripción</span>
        <span className="home-sheet__field-optional">Opcional</span>
        <textarea
          className="home-sheet__input riviera-input"
          placeholder="Ej: Reta de verano, grupo de amigos…"
          rows={3}
          value={values.description}
          disabled={descEd.locked}
          onChange={(e) => patch({ description: e.target.value })}
        />
        {descEd.locked ? <FieldLock reason={descEd.reason} /> : null}
      </label>

      <div className="home-sheet__field">
        <span className="home-sheet__field-label">Canchas disponibles</span>
        <div
          className="home-sheet__stepper"
          style={{ display: "flex", alignItems: "center", gap: 12 }}
        >
          <button
            type="button"
            className="home-sheet__stepper-btn"
            style={{ minWidth: 44, minHeight: 44 }}
            disabled={courtsEd.locked || values.courts <= RETA_COURTS_MIN}
            onClick={() =>
              patch({ courts: clampRetaCourts(values.courts - 1) })
            }
            aria-label="Menos canchas"
          >
            −
          </button>
          <span style={{ color: "var(--rv-accent, #c8f542)", fontWeight: 700 }}>
            {values.courts}
          </span>
          <button
            type="button"
            className="home-sheet__stepper-btn"
            style={{ minWidth: 44, minHeight: 44 }}
            disabled={courtsEd.locked || values.courts >= RETA_COURTS_MAX}
            onClick={() =>
              patch({ courts: clampRetaCourts(values.courts + 1) })
            }
            aria-label="Más canchas"
          >
            +
          </button>
        </div>
        {courtsEd.reason ? <FieldLock reason={courtsEd.reason} /> : null}
      </div>

      {mode === "edit" ? (
        <>
          <label className="home-sheet__field">
            <span className="home-sheet__field-label">Día y hora</span>
            <input
              type="datetime-local"
              className="home-sheet__input riviera-input"
              value={values.programado_en}
              disabled={schedEd.locked}
              onChange={(e) => patch({ programado_en: e.target.value })}
            />
            {schedEd.locked ? <FieldLock reason={schedEd.reason} /> : null}
          </label>

          <label className="home-sheet__field">
            <span className="home-sheet__field-label">Duración (min)</span>
            <input
              type="number"
              min={15}
              max={480}
              className="home-sheet__input riviera-input"
              value={values.duration_minutes}
              disabled={durEd.locked}
              onChange={(e) =>
                patch({
                  duration_minutes: clampRetaDurationMinutes(e.target.value),
                })
              }
            />
          </label>

          <label className="home-sheet__field">
            <span className="home-sheet__field-label">Cancha (etiqueta)</span>
            <input
              type="text"
              className="home-sheet__input riviera-input"
              placeholder="Ej. 1-2"
              value={values.cancha}
              disabled={canchaEd.locked}
              onChange={(e) => patch({ cancha: e.target.value })}
            />
          </label>

          <label
            className="home-sheet__field"
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={values.mostrar_lugar}
              disabled={lugarEd.locked}
              onChange={(e) => patch({ mostrar_lugar: e.target.checked })}
            />
            <span className="home-sheet__field-label">Incluir lugar</span>
          </label>

          <label className="home-sheet__field">
            <span className="home-sheet__field-label">Lugar</span>
            <input
              type="text"
              className="home-sheet__input riviera-input"
              value={values.lugar}
              disabled={lugarEd.locked || !values.mostrar_lugar}
              onChange={(e) => patch({ lugar: e.target.value })}
            />
          </label>
        </>
      ) : null}

      {showChampionship ? (
        <div
          className="home-sheet__field"
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span className="home-sheet__field-label">Remontada Final</span>
            <span className="home-sheet__field-optional">Opcional</span>
            <input
              type="checkbox"
              checked={values.championshipEnabled}
              disabled={champEd.locked}
              onChange={(e) =>
                patch({ championshipEnabled: e.target.checked })
              }
              aria-label="Activar Remontada Final"
              style={{ minWidth: 44, minHeight: 24 }}
            />
          </div>
          {champEd.locked ? <FieldLock reason={champEd.reason} /> : null}
          {values.championshipEnabled && !champEd.locked ? (
            <label className="home-sheet__field" style={{ marginTop: 8 }}>
              <span className="home-sheet__field-label">Rondas extra</span>
              <input
                type="number"
                min={1}
                max={10}
                className="home-sheet__input riviera-input"
                value={values.championshipRounds}
                onChange={(e) =>
                  patch({
                    championshipRounds: clampChampionshipRoundsShared(
                      e.target.value
                    ),
                  })
                }
              />
            </label>
          ) : null}
        </div>
      ) : null}

      {mode === "edit" ? (
        <p className="home-sheet__field-optional" role="note">
          Cupo, rating, fotos y lista de espera se editan en{" "}
          <strong>Convocatoria Riviera</strong> (panel inferior).
        </p>
      ) : null}
    </div>
  );
};
