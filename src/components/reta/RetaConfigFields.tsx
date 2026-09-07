import React from "react";
import type { RetaConfigFormValues } from "../../lib/reta/updateRetaConfig";
import {
  fieldEditability,
  type RetaEditPhase,
  type RetaConfigFieldKey,
} from "../../lib/reta/retaConfigEditRules";
import {
  RETA_RAMA_OPTIONS,
  type RetaRama,
} from "../../lib/reta/retaRama";
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
   * essentials = grid denso (Detalles / alta).
   * full = layout legacy (todos los campos a la vista).
   */
  layout?: "full" | "essentials";
  /** Errores inline por campo (solo UX; no cambia validación de guardado). */
  fieldErrors?: Partial<Record<"name", string>>;
};

function FieldLock({ reason }: { reason?: string }) {
  if (!reason) return null;
  return (
    <p className="home-sheet__field-optional reta-details-form__lock" role="note">
      {reason}
    </p>
  );
}

function retaConfigFieldId(key: string): string {
  return `reta-config-${key}`;
}

export const RetaConfigFields: React.FC<RetaConfigFieldsProps> = ({
  values,
  onChange,
  phase,
  mode,
  showChampionship = true,
  disabled = false,
  layout = "full",
  fieldErrors,
}) => {
  const essentials = layout === "essentials";
  /** En Detalles (essentials) o edición: día/hora, duración y lugar. */
  const showScheduleMeta = mode === "edit" || essentials;
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
  const nivelEd = ed("nivel");
  const courtsEd = ed("courts");
  const champEd = ed("championship");
  const lugarEd = ed("lugar");
  const costoEd = ed("costo");
  const premioEd = ed("premio");
  const ramaEd = ed("rama");
  const schedEd = ed("programado_en");
  const durEd = ed("duration_minutes");

  const nameField = (
    <label
      className="home-sheet__field reta-details-form__field reta-details-form__field--name"
      htmlFor={retaConfigFieldId("name")}
    >
      <span className="home-sheet__field-label">Nombre</span>
      <input
        id={retaConfigFieldId("name")}
        name={retaConfigFieldId("name")}
        type="text"
        className={`home-sheet__input riviera-input${
          fieldErrors?.name ? " reta-details-form__input--invalid" : ""
        }`}
        placeholder="Reta del domingo…"
        value={values.name}
        disabled={nameEd.locked}
        aria-invalid={Boolean(fieldErrors?.name)}
        onChange={(e) => patch({ name: e.target.value })}
      />
      {fieldErrors?.name ? (
        <p className="reta-details-form__field-error" role="alert">
          {fieldErrors.name}
        </p>
      ) : null}
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
    showScheduleMeta ? (
      <div
        className="reta-details-form__schedule-split"
        role="group"
        aria-label="Día, hora y duración"
      >
        <label
          className="home-sheet__field reta-details-form__field reta-details-form__field--date"
          htmlFor={retaConfigFieldId("programado-date")}
        >
          <span className="home-sheet__field-label">Día</span>
          <input
            id={retaConfigFieldId("programado-date")}
            name={retaConfigFieldId("programado-date")}
            type="date"
            className="home-sheet__input riviera-input reta-details-form__date"
            value={scheduleParts.date}
            disabled={schedEd.locked}
            onChange={(e) => patchSchedule({ date: e.target.value })}
          />
          {schedEd.locked ? <FieldLock reason={schedEd.reason} /> : null}
        </label>
        <label
          className="home-sheet__field reta-details-form__field reta-details-form__field--time"
          htmlFor={retaConfigFieldId("programado-time")}
        >
          <span className="home-sheet__field-label">Hora</span>
          <input
            id={retaConfigFieldId("programado-time")}
            name={retaConfigFieldId("programado-time")}
            type="time"
            className="home-sheet__input riviera-input reta-details-form__time"
            value={scheduleParts.time}
            disabled={schedEd.locked}
            onChange={(e) => patchSchedule({ time: e.target.value })}
          />
        </label>
        <div className="home-sheet__field reta-details-form__field reta-details-form__field--duration">
          <span className="home-sheet__field-label">Duración</span>
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
              <span className="reta-details-form__duration-unit"> min</span>
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
      </div>
    ) : null;

  const DESC_MAX = 500;
  const descriptionField = essentials ? (
    <label
      className="home-sheet__field reta-details-form__field reta-details-form__field--desc"
      htmlFor={retaConfigFieldId("description")}
    >
      <span className="home-sheet__field-label">Descripción</span>
      <textarea
        id={retaConfigFieldId("description")}
        name={retaConfigFieldId("description")}
        className="home-sheet__input riviera-input reta-details-form__textarea"
        placeholder="Juega, compite y disfruta una reta diferente…"
        value={values.description}
        disabled={descEd.locked}
        rows={3}
        maxLength={DESC_MAX}
        onChange={(e) => {
          const v = e.target.value.slice(0, DESC_MAX);
          patch({ description: v });
          const el = e.target;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 9 * 16)}px`;
        }}
        autoComplete="off"
      />
      <span className="reta-details-form__char-count" aria-live="polite">
        {values.description.length}/{DESC_MAX}
      </span>
      {descEd.locked ? <FieldLock reason={descEd.reason} /> : null}
    </label>
  ) : (
    <label
      className="home-sheet__field home-sheet__field--desc"
      htmlFor={retaConfigFieldId("description")}
    >
      <span className="home-sheet__field-label">Descripción</span>
      <span className="home-sheet__field-optional">Opcional</span>
      <textarea
        id={retaConfigFieldId("description")}
        name={retaConfigFieldId("description")}
        className="home-sheet__input riviera-input reta-details-form__textarea"
        placeholder="Ej. mixta, verano, amigos…"
        value={values.description}
        disabled={descEd.locked}
        rows={3}
        maxLength={DESC_MAX}
        onChange={(e) => {
          const v = e.target.value.slice(0, DESC_MAX);
          patch({ description: v });
          const el = e.target;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 9 * 16)}px`;
        }}
        autoComplete="off"
      />
      <span className="reta-details-form__char-count" aria-live="polite">
        {values.description.length}/{DESC_MAX}
      </span>
      {descEd.locked ? <FieldLock reason={descEd.reason} /> : null}
    </label>
  );

  const nivelField = (
    <label
      className="home-sheet__field reta-details-form__field reta-details-form__field--nivel"
      htmlFor={retaConfigFieldId("nivel")}
    >
      <span className="home-sheet__field-label">Nivel</span>
      <input
        id={retaConfigFieldId("nivel")}
        name={retaConfigFieldId("nivel")}
        type="text"
        className="home-sheet__input riviera-input"
        placeholder="Fuerza: 5ta Fuerza, Open…"
        value={values.nivel}
        disabled={nivelEd.locked}
        onChange={(e) => patch({ nivel: e.target.value })}
        list="reta-nivel-sugerencias"
        autoComplete="off"
      />
      <datalist id="reta-nivel-sugerencias">
        <option value="Open" />
        <option value="1ra Fuerza" />
        <option value="2da Fuerza" />
        <option value="3ra Fuerza" />
        <option value="4ta Fuerza" />
        <option value="5ta Fuerza" />
        <option value="6ta Fuerza" />
      </datalist>
      {nivelEd.locked ? <FieldLock reason={nivelEd.reason} /> : null}
    </label>
  );

  const lugarField =
    showScheduleMeta ? (
      essentials ? (
        <div
          className={`home-sheet__field reta-details-form__field reta-details-form__field--lugar reta-details-form__visibility${
            values.mostrar_lugar ? " is-shown" : " is-hidden-public"
          }`}
        >
          <label className="reta-details-form__visibility-toggle" htmlFor={retaConfigFieldId("mostrar-lugar")}>
            <input
              id={retaConfigFieldId("mostrar-lugar")}
              name={retaConfigFieldId("mostrar-lugar")}
              type="checkbox"
              checked={values.mostrar_lugar}
              disabled={lugarEd.locked}
              onChange={(e) => patch({ mostrar_lugar: e.target.checked })}
            />
            <span className="reta-details-form__visibility-title">Mostrar lugar</span>
          </label>
          <input
            id={retaConfigFieldId("lugar")}
            name={retaConfigFieldId("lugar")}
            type="text"
            className="home-sheet__input riviera-input reta-details-form__visibility-value"
            placeholder="Club, sede…"
            value={values.lugar}
            disabled={lugarEd.locked}
            onChange={(e) => patch({ lugar: e.target.value })}
          />
          {values.mostrar_lugar ? (
            <span className="reta-details-form__visibility-hint">
              Visible.
            </span>
          ) : (
            <span className="reta-details-form__visibility-hint reta-details-form__visibility-hint--muted">
              Oculto.
            </span>
          )}
          {lugarEd.locked ? <FieldLock reason={lugarEd.reason} /> : null}
        </div>
      ) : (
        <>
          <label className="home-sheet__field home-sheet__field--check">
            <input
              id={retaConfigFieldId("mostrar-lugar")}
              name={retaConfigFieldId("mostrar-lugar")}
              type="checkbox"
              checked={values.mostrar_lugar}
              disabled={lugarEd.locked}
              onChange={(e) => patch({ mostrar_lugar: e.target.checked })}
            />
            <span className="home-sheet__field-label">Incluir lugar</span>
          </label>
          <label
            className="home-sheet__field"
            htmlFor={retaConfigFieldId("lugar")}
          >
            <span className="home-sheet__field-label">Lugar</span>
            <input
              id={retaConfigFieldId("lugar")}
              name={retaConfigFieldId("lugar")}
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

  const costoField =
    showScheduleMeta ? (
      essentials ? (
        <div
          className={`home-sheet__field reta-details-form__field reta-details-form__field--costo reta-details-form__visibility${
            values.mostrar_costo ? " is-shown" : " is-hidden-public"
          }`}
        >
          <label className="reta-details-form__visibility-toggle" htmlFor={retaConfigFieldId("mostrar-costo")}>
            <input
              id={retaConfigFieldId("mostrar-costo")}
              name={retaConfigFieldId("mostrar-costo")}
              type="checkbox"
              checked={values.mostrar_costo}
              disabled={costoEd.locked}
              onChange={(e) => patch({ mostrar_costo: e.target.checked })}
            />
            <span className="reta-details-form__visibility-title">Mostrar costo</span>
          </label>
          <input
            id={retaConfigFieldId("costo")}
            name={retaConfigFieldId("costo")}
            type="text"
            className="home-sheet__input riviera-input reta-details-form__visibility-value"
            placeholder="$200 por jugador"
            value={values.costo}
            disabled={costoEd.locked}
            onChange={(e) => patch({ costo: e.target.value })}
          />
          {values.mostrar_costo ? (
            <span className="reta-details-form__visibility-hint">
              Visible.
            </span>
          ) : (
            <span className="reta-details-form__visibility-hint reta-details-form__visibility-hint--muted">
              Oculto.
            </span>
          )}
          {costoEd.locked ? <FieldLock reason={costoEd.reason} /> : null}
        </div>
      ) : (
        <>
          <label className="home-sheet__field home-sheet__field--check">
            <input
              id={retaConfigFieldId("mostrar-costo")}
              name={retaConfigFieldId("mostrar-costo")}
              type="checkbox"
              checked={values.mostrar_costo}
              disabled={costoEd.locked}
              onChange={(e) => patch({ mostrar_costo: e.target.checked })}
            />
            <span className="home-sheet__field-label">Incluir costo</span>
          </label>
          <label
            className="home-sheet__field"
            htmlFor={retaConfigFieldId("costo")}
          >
            <span className="home-sheet__field-label">Costo</span>
            <input
              id={retaConfigFieldId("costo")}
              name={retaConfigFieldId("costo")}
              type="text"
              className="home-sheet__input riviera-input"
              placeholder="$200 por jugador"
              value={values.costo}
              disabled={costoEd.locked || !values.mostrar_costo}
              onChange={(e) => patch({ costo: e.target.value })}
            />
          </label>
        </>
      )
    ) : null;

  const premioField =
    showScheduleMeta ? (
      essentials ? (
        <div
          className={`home-sheet__field reta-details-form__field reta-details-form__field--premio reta-details-form__visibility${
            values.mostrar_premio ? " is-shown" : " is-hidden-public"
          }`}
        >
          <label className="reta-details-form__visibility-toggle" htmlFor={retaConfigFieldId("mostrar-premio")}>
            <input
              id={retaConfigFieldId("mostrar-premio")}
              name={retaConfigFieldId("mostrar-premio")}
              type="checkbox"
              checked={values.mostrar_premio}
              disabled={premioEd.locked}
              onChange={(e) => patch({ mostrar_premio: e.target.checked })}
            />
            <span className="reta-details-form__visibility-title">Mostrar premio</span>
          </label>
          <input
            id={retaConfigFieldId("premio")}
            name={retaConfigFieldId("premio")}
            type="text"
            className="home-sheet__input riviera-input reta-details-form__visibility-value"
            placeholder="Trofeo + pelotas"
            value={values.premio}
            disabled={premioEd.locked}
            onChange={(e) => patch({ premio: e.target.value })}
          />
          {values.mostrar_premio ? (
            <span className="reta-details-form__visibility-hint">
              Visible.
            </span>
          ) : (
            <span className="reta-details-form__visibility-hint reta-details-form__visibility-hint--muted">
              Oculto.
            </span>
          )}
          {premioEd.locked ? <FieldLock reason={premioEd.reason} /> : null}
        </div>
      ) : (
        <>
          <label className="home-sheet__field home-sheet__field--check">
            <input
              id={retaConfigFieldId("mostrar-premio")}
              name={retaConfigFieldId("mostrar-premio")}
              type="checkbox"
              checked={values.mostrar_premio}
              disabled={premioEd.locked}
              onChange={(e) => patch({ mostrar_premio: e.target.checked })}
            />
            <span className="home-sheet__field-label">Incluir premio</span>
          </label>
          <label
            className="home-sheet__field"
            htmlFor={retaConfigFieldId("premio")}
          >
            <span className="home-sheet__field-label">Premio</span>
            <input
              id={retaConfigFieldId("premio")}
              name={retaConfigFieldId("premio")}
              type="text"
              className="home-sheet__input riviera-input"
              placeholder="Trofeo + pelotas"
              value={values.premio}
              disabled={premioEd.locked || !values.mostrar_premio}
              onChange={(e) => patch({ premio: e.target.value })}
            />
          </label>
        </>
      )
    ) : null;

  const ramaField =
    showScheduleMeta ? (
      <div className="home-sheet__field reta-details-form__field reta-details-form__field--rama">
        <span className="home-sheet__field-label">Rama</span>
        <div
          className="reta-details-form__rama-options"
          role="group"
          aria-label="Rama del encuentro"
        >
          {RETA_RAMA_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`reta-details-form__rama-option${
                values.rama === opt.value
                  ? " reta-details-form__rama-option--active"
                  : ""
              }`}
            >
              <input
                id={retaConfigFieldId(`rama-${opt.value}`)}
                name={retaConfigFieldId("rama")}
                type="checkbox"
                checked={values.rama === opt.value}
                disabled={ramaEd.locked}
                onChange={() =>
                  patch({
                    rama: (values.rama === opt.value ? "" : opt.value) as RetaRama,
                  })
                }
                aria-label={opt.label}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
        {ramaEd.locked ? <FieldLock reason={ramaEd.reason} /> : null}
      </div>
    ) : null;

  const editAdvancedFields =
    mode === "edit" && !essentials ? (
      <>
        {lugarField}
        {costoField}
        {premioField}
      </>
    ) : null;

  const championshipField = showChampionship ? (
    <div
      className={`home-sheet__field reta-details-form__field reta-details-form__field--champ${
        essentials ? " reta-details-form__field--champ-compact" : " home-sheet__field--champ"
      }`}
    >
      <span className="home-sheet__field-label">Remontada</span>
      {essentials ? (
        <>
          <label className="reta-details-form__champ-control">
            <input
              id={retaConfigFieldId("championship-enabled")}
              name={retaConfigFieldId("championship-enabled")}
              type="checkbox"
              checked={values.championshipEnabled}
              disabled={champEd.locked}
              onChange={(e) => patch({ championshipEnabled: e.target.checked })}
            />
            <span>
              {values.championshipEnabled ? "Activada" : "Desactivada"}
            </span>
          </label>
          {champEd.locked ? <FieldLock reason={champEd.reason} /> : null}
          {values.championshipEnabled && !champEd.locked ? (
            <label
              className="home-sheet__field home-sheet__field--inline reta-details-form__champ-rounds"
              htmlFor={retaConfigFieldId("championship-rounds")}
            >
              <span className="home-sheet__field-label">Rondas</span>
              <input
                id={retaConfigFieldId("championship-rounds")}
                name={retaConfigFieldId("championship-rounds")}
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
        </>
      ) : (
        <>
          <div className="home-sheet__champ-row">
            <input
              id={retaConfigFieldId("championship-enabled")}
              name={retaConfigFieldId("championship-enabled")}
              type="checkbox"
              checked={values.championshipEnabled}
              disabled={champEd.locked}
              onChange={(e) => patch({ championshipEnabled: e.target.checked })}
              aria-label="Activar Remontada Final"
            />
          </div>
          {champEd.locked ? <FieldLock reason={champEd.reason} /> : null}
          {values.championshipEnabled && !champEd.locked ? (
            <label
              className="home-sheet__field home-sheet__field--inline"
              htmlFor={retaConfigFieldId("championship-rounds")}
            >
              <span className="home-sheet__field-label">Rondas</span>
              <input
                id={retaConfigFieldId("championship-rounds")}
                name={retaConfigFieldId("championship-rounds")}
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
        </>
      )}
    </div>
  ) : null;

  if (essentials) {
    return (
      <div
        className="reta-details-form reta-details-form--sections reta-details-form--compose"
        role="group"
        aria-label="Campos de la reta"
      >
        <section
          className="reta-details-form__section reta-details-form__section--essential"
          aria-labelledby="reta-details-sec-essential"
        >
          <h3
            id="reta-details-sec-essential"
            className="reta-details-form__section-title"
          >
            Información principal
          </h3>
          <div className="reta-details-form__row reta-details-form__row--name">
            {nameField}
          </div>
          <div className="reta-details-form__row reta-details-form__row--primary">
            {scheduleField}
            {courtsField}
          </div>
          <div className="reta-details-form__row reta-details-form__row--nivel">
            {nivelField}
          </div>
          {ramaField ? (
            <div className="reta-details-form__row reta-details-form__row--rama">
              {ramaField}
            </div>
          ) : null}
        </section>

        <section
          className="reta-details-form__section reta-details-form__section--optional"
          aria-labelledby="reta-details-sec-optional"
        >
          <h3
            id="reta-details-sec-optional"
            className="reta-details-form__section-title"
          >
            Detalles opcionales
          </h3>
          <div className="reta-details-form__row reta-details-form__row--public">
            {descriptionField}
            {lugarField}
            {costoField}
            {premioField}
          </div>
          {championshipField ? (
            <div className="reta-details-form__row reta-details-form__row--champ">
              {championshipField}
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="home-sheet__fields reta-config-fields">
      {nameField}
      {descriptionField}
      {nivelField}
      {ramaField}
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
