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
  RETA_DURATION_MAX,
  RETA_DURATION_MIN,
  clampChampionshipRoundsShared,
  clampRetaCourts,
  clampRetaDurationMinutes,
} from "../../lib/reta/retaConfigValidation";

export type RetaConfigFieldsProps = {
  values: RetaConfigFormValues;
  onChange: (
    next:
      | RetaConfigFormValues
      | ((prev: RetaConfigFormValues) => RetaConfigFormValues)
  ) => void;
  phase: RetaEditPhase;
  /** create = botón externo dice Iniciar; edit = Guardar */
  mode: "create" | "edit";
  showChampionship?: boolean;
  disabled?: boolean;
  /**
   * essentials = grid denso (prep).
   * full = layout legacy (todos los campos a la vista).
   */
  layout?: "full" | "essentials";
};

function FieldLock({ reason }: { reason?: string }) {
  if (!reason) return null;
  return (
    <p className="home-sheet__field-optional reta-details-form__lock" role="note">
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
  layout = "full",
}) => {
  const essentials = layout === "essentials";
  const patch = (partial: Partial<RetaConfigFormValues>) =>
    onChange((prev) => ({ ...prev, ...partial }));

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

  const nameField = (
    <label className="home-sheet__field reta-details-form__field reta-details-form__field--name">
      <span className="home-sheet__field-label">Nombre</span>
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
  );

  const courtsField = (
    <div className="home-sheet__field reta-details-form__field reta-details-form__field--courts">
      <span className="home-sheet__field-label">Canchas</span>
      <div className="home-sheet__stepper reta-details-form__stepper">
        <button
          type="button"
          className="home-sheet__stepper-btn"
          disabled={courtsEd.locked || values.courts <= RETA_COURTS_MIN}
          onClick={() => patch({ courts: clampRetaCourts(values.courts - 1) })}
          aria-label="Menos canchas"
        >
          −
        </button>
        <span className="home-sheet__stepper-value" aria-live="polite">
          {values.courts}
        </span>
        <button
          type="button"
          className="home-sheet__stepper-btn"
          disabled={courtsEd.locked || values.courts >= RETA_COURTS_MAX}
          onClick={() => patch({ courts: clampRetaCourts(values.courts + 1) })}
          aria-label="Más canchas"
        >
          +
        </button>
      </div>
      {courtsEd.reason ? <FieldLock reason={courtsEd.reason} /> : null}
    </div>
  );

  const scheduleParts = (() => {
    const raw = values.programado_en || "";
    const tIdx = raw.indexOf("T");
    if (tIdx <= 0) {
      return { date: raw.slice(0, 10) || "", time: "" };
    }
    return {
      date: raw.slice(0, tIdx),
      time: raw.slice(tIdx + 1, tIdx + 6),
    };
  })();

  const patchSchedule = (next: { date?: string; time?: string }) => {
    const date = next.date !== undefined ? next.date : scheduleParts.date;
    const time = next.time !== undefined ? next.time : scheduleParts.time;
    if (!date) {
      patch({ programado_en: "" });
      return;
    }
    patch({ programado_en: `${date}T${time || "00:00"}` });
  };

  const scheduleField =
    mode === "edit" ? (
      <div
        className="reta-details-form__schedule-split"
        role="group"
        aria-label="Día y hora"
      >
        <label className="home-sheet__field reta-details-form__field reta-details-form__field--date">
          <span className="home-sheet__field-label">Día</span>
          <input
            type="date"
            className="home-sheet__input riviera-input reta-details-form__date"
            value={scheduleParts.date}
            disabled={schedEd.locked}
            onChange={(e) => patchSchedule({ date: e.target.value })}
          />
          {schedEd.locked ? <FieldLock reason={schedEd.reason} /> : null}
        </label>
        <label className="home-sheet__field reta-details-form__field reta-details-form__field--time">
          <span className="home-sheet__field-label">Hora</span>
          <input
            type="time"
            className="home-sheet__input riviera-input reta-details-form__time"
            value={scheduleParts.time}
            disabled={schedEd.locked}
            onChange={(e) => patchSchedule({ time: e.target.value })}
          />
        </label>
      </div>
    ) : null;

  const descriptionField = essentials ? (
    <label className="home-sheet__field reta-details-form__field reta-details-form__field--desc">
      <span className="home-sheet__field-label">Descripción</span>
      <input
        type="text"
        className="home-sheet__input riviera-input"
        placeholder="Ej. Mixta, verano, amigos…"
        value={values.description}
        disabled={descEd.locked}
        onChange={(e) => patch({ description: e.target.value })}
      />
      {descEd.locked ? <FieldLock reason={descEd.reason} /> : null}
    </label>
  ) : (
    <label className="home-sheet__field home-sheet__field--desc">
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
  );

  const durationField =
    mode === "edit" ? (
      <div className="home-sheet__field reta-details-form__field reta-details-form__field--duration">
        <span className="home-sheet__field-label">Duración (min)</span>
        <div className="home-sheet__stepper reta-details-form__stepper">
          <button
            type="button"
            className="home-sheet__stepper-btn"
            disabled={
              durEd.locked || values.duration_minutes <= RETA_DURATION_MIN
            }
            onClick={() =>
              patch({
                duration_minutes: clampRetaDurationMinutes(
                  values.duration_minutes - 15
                ),
              })
            }
            aria-label="Menos duración"
          >
            −
          </button>
          <span className="home-sheet__stepper-value" aria-live="polite">
            {values.duration_minutes}
          </span>
          <button
            type="button"
            className="home-sheet__stepper-btn"
            disabled={
              durEd.locked || values.duration_minutes >= RETA_DURATION_MAX
            }
            onClick={() =>
              patch({
                duration_minutes: clampRetaDurationMinutes(
                  values.duration_minutes + 15
                ),
              })
            }
            aria-label="Más duración"
          >
            +
          </button>
        </div>
        {durEd.locked ? <FieldLock reason={durEd.reason} /> : null}
      </div>
    ) : null;

  const canchaField =
    mode === "edit" ? (
      <label className="home-sheet__field reta-details-form__field reta-details-form__field--cancha">
        <span className="home-sheet__field-label">Cancha</span>
        <input
          type="text"
          className="home-sheet__input riviera-input"
          placeholder="Ej. 1-2"
          value={values.cancha}
          disabled={canchaEd.locked}
          onChange={(e) => patch({ cancha: e.target.value })}
        />
      </label>
    ) : null;

  const lugarField =
    mode === "edit" ? (
      essentials ? (
        <div className="home-sheet__field reta-details-form__field reta-details-form__field--lugar">
          <span className="reta-details-form__lugar-label">
            <input
              type="checkbox"
              checked={values.mostrar_lugar}
              disabled={lugarEd.locked}
              onChange={(e) => patch({ mostrar_lugar: e.target.checked })}
              aria-label="Mostrar lugar"
            />
            <span className="home-sheet__field-label">Lugar</span>
          </span>
          <input
            type="text"
            className="home-sheet__input riviera-input"
            placeholder="Club, sede…"
            value={values.lugar}
            disabled={lugarEd.locked || !values.mostrar_lugar}
            onChange={(e) => patch({ lugar: e.target.value })}
          />
        </div>
      ) : (
        <>
          <label className="home-sheet__field home-sheet__field--check">
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
      )
    ) : null;

  const editAdvancedFields =
    mode === "edit" && !essentials ? (
      <>
        {durationField}
        {canchaField}
        {lugarField}
      </>
    ) : null;

  const championshipField = showChampionship ? (
    <div
      className={`home-sheet__field home-sheet__field--champ reta-details-form__field reta-details-form__field--champ${
        essentials ? " reta-details-form__field--champ-compact" : ""
      }`}
    >
      <div className="home-sheet__champ-row">
        <span className="home-sheet__field-label">Remontada</span>
        <input
          type="checkbox"
          checked={values.championshipEnabled}
          disabled={champEd.locked}
          onChange={(e) => patch({ championshipEnabled: e.target.checked })}
          aria-label="Activar Remontada Final"
        />
      </div>
      {champEd.locked ? <FieldLock reason={champEd.reason} /> : null}
      {values.championshipEnabled && !champEd.locked ? (
        <label className="home-sheet__field home-sheet__field--inline">
          <span className="home-sheet__field-label">Rondas</span>
          <input
            type="number"
            min={1}
            max={10}
            className="home-sheet__input riviera-input"
            value={values.championshipRounds}
            onChange={(e) =>
              patch({
                championshipRounds: clampChampionshipRoundsShared(e.target.value),
              })
            }
          />
        </label>
      ) : null}
    </div>
  ) : null;

  if (essentials) {
    return (
      <div
        className="reta-details-form"
        role="group"
        aria-label="Campos de la reta"
      >
        <div className="reta-details-form__row reta-details-form__row--primary">
          {nameField}
          {scheduleField}
          {courtsField}
        </div>
        <div className="reta-details-form__row reta-details-form__row--meta">
          {descriptionField}
          {durationField}
          {canchaField}
          {lugarField}
          {championshipField}
        </div>
      </div>
    );
  }

  return (
    <div className="home-sheet__fields reta-config-fields">
      {nameField}
      {descriptionField}
      {courtsField}
      {mode === "edit" ? (
        <>
          {scheduleField}
          {editAdvancedFields}
        </>
      ) : null}
      {championshipField}
      {mode === "edit" ? (
        <p className="home-sheet__field-optional" role="note">
          Cupo, rating, fotos y lista de espera se editan en{" "}
          <strong>Convocatoria</strong>.
        </p>
      ) : null}
    </div>
  );
};
