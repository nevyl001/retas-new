import React, { useState } from "react";
import {
  RETA_DURATION_MAX,
  RETA_DURATION_MIN,
  clampRetaDurationMinutes,
} from "../../lib/reta/retaConfigValidation";
import { addMinutesToTimeInput } from "../../lib/duelo2v2/schedule";

export type Duelo2v2ConfigFieldValues = {
  nombre: string;
  cancha: string;
  /** Descripción libre del encuentro (no es la fuerza). */
  categoria: string;
  /** Fuerza / nivel competitivo. */
  nivel: string;
  mostrarLugar: boolean;
  lugar: string;
  mostrarCosto: boolean;
  costo: string;
  mostrarPremio: boolean;
  premio: string;
  draftDate: string;
  draftTimeStart: string;
  draftTimeEnd: string;
  /** Duración en minutos; el fin se calcula desde hora inicio. */
  durationMinutes: number;
};

export type Duelo2v2ConfigFieldsProps = {
  values: Duelo2v2ConfigFieldValues;
  onChange: (next: Duelo2v2ConfigFieldValues) => void;
  disabled?: boolean;
  /** Prefijo para ids (accesibilidad / tests). */
  idPrefix?: string;
};

/**
 * Campos densos del duelo — mismo chrome y ritmo que RetaConfigFields essentials.
 * Horario: Día + Hora + Duración en una fila; fin automático en la etiqueta.
 */
export const Duelo2v2ConfigFields: React.FC<Duelo2v2ConfigFieldsProps> = ({
  values,
  onChange,
  disabled = false,
  idPrefix = "duelo",
}) => {
  const applySchedule = (
    partial: Partial<
      Pick<
        Duelo2v2ConfigFieldValues,
        "draftTimeStart" | "durationMinutes" | "draftDate"
      >
    >
  ) => {
    const draftTimeStart = partial.draftTimeStart ?? values.draftTimeStart;
    const durationMinutes = clampRetaDurationMinutes(
      partial.durationMinutes ?? values.durationMinutes
    );
    const draftTimeEnd =
      draftTimeStart.trim().length > 0
        ? addMinutesToTimeInput(draftTimeStart, durationMinutes)
        : values.draftTimeEnd;
    onChange({
      ...values,
      ...partial,
      draftTimeStart,
      durationMinutes,
      draftTimeEnd,
      ...(partial.draftDate !== undefined
        ? { draftDate: partial.draftDate }
        : {}),
    });
  };

  const patch = (partial: Partial<Duelo2v2ConfigFieldValues>) =>
    onChange({ ...values, ...partial });

  const endLabel =
    values.draftTimeStart.trim() && values.draftTimeEnd.trim()
      ? values.draftTimeEnd
      : null;

  const [optionalOpen, setOptionalOpen] = useState(false);

  return (
    <div
      className="reta-details-form reta-details-form--sections reta-details-form--duelo reta-details-form--compose"
      role="group"
      aria-label="Campos del duelo"
    >
      <section
        className="reta-details-form__section reta-details-form__section--essential"
        aria-labelledby={`${idPrefix}-sec-essential`}
      >
        <h3
          id={`${idPrefix}-sec-essential`}
          className="reta-details-form__section-title"
        >
          Información principal
        </h3>
        <div className="reta-details-form__row reta-details-form__row--name">
          <label
            className="home-sheet__field reta-details-form__field reta-details-form__field--name"
            htmlFor={`${idPrefix}-nombre`}
          >
            <span className="home-sheet__field-label">Nombre</span>
            <input
              id={`${idPrefix}-nombre`}
              type="text"
              className="home-sheet__input riviera-input"
              placeholder="Ej. Encuentro Riviera Open — Sábado"
              value={values.nombre}
              disabled={disabled}
              onChange={(e) => patch({ nombre: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="reta-details-form__row reta-details-form__row--primary">
          <div
            className="reta-details-form__schedule-split"
            role="group"
            aria-label="Día, hora y duración"
          >
            <label
              className="home-sheet__field reta-details-form__field reta-details-form__field--date"
              htmlFor={`${idPrefix}-dia`}
            >
              <span className="home-sheet__field-label">Día</span>
              <input
                id={`${idPrefix}-dia`}
                type="date"
                className="home-sheet__input riviera-input reta-details-form__date"
                value={values.draftDate}
                disabled={disabled}
                onChange={(e) => applySchedule({ draftDate: e.target.value })}
                required
              />
            </label>
            <label
              className="home-sheet__field reta-details-form__field reta-details-form__field--time"
              htmlFor={`${idPrefix}-hora-inicio`}
            >
              <span className="home-sheet__field-label">Hora</span>
              <input
                id={`${idPrefix}-hora-inicio`}
                type="time"
                className="home-sheet__input riviera-input reta-details-form__time"
                value={values.draftTimeStart}
                disabled={disabled}
                onChange={(e) =>
                  applySchedule({ draftTimeStart: e.target.value })
                }
                required
              />
            </label>
            <div className="home-sheet__field reta-details-form__field reta-details-form__field--duration">
              <span className="home-sheet__field-label">
                Duración
                {endLabel ? (
                  <span
                    className="reta-details-form__end-inline"
                    role="status"
                  >
                    {" "}
                    · fin {endLabel}
                  </span>
                ) : null}
              </span>
              <div className="home-sheet__stepper reta-details-form__stepper">
                <button
                  type="button"
                  className="home-sheet__stepper-btn"
                  disabled={
                    disabled || values.durationMinutes <= RETA_DURATION_MIN
                  }
                  onClick={() =>
                    applySchedule({
                      durationMinutes: clampRetaDurationMinutes(
                        values.durationMinutes - 15
                      ),
                    })
                  }
                  aria-label="Menos duración"
                >
                  −
                </button>
                <span className="home-sheet__stepper-value" aria-live="polite">
                  {values.durationMinutes}
                  <span className="reta-details-form__duration-unit"> min</span>
                </span>
                <button
                  type="button"
                  className="home-sheet__stepper-btn"
                  disabled={
                    disabled || values.durationMinutes >= RETA_DURATION_MAX
                  }
                  onClick={() =>
                    applySchedule({
                      durationMinutes: clampRetaDurationMinutes(
                        values.durationMinutes + 15
                      ),
                    })
                  }
                  aria-label="Más duración"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <label className="home-sheet__field reta-details-form__field reta-details-form__field--cancha">
            <span className="home-sheet__field-label">Cancha</span>
            <input
              type="text"
              className="home-sheet__input riviera-input"
              placeholder="Ej. 1"
              value={values.cancha}
              disabled={disabled}
              onChange={(e) => patch({ cancha: e.target.value })}
              required
            />
          </label>
        </div>
        <div className="reta-details-form__row reta-details-form__row--game">
          <label className="home-sheet__field reta-details-form__field reta-details-form__field--nivel">
            <span className="home-sheet__field-label">Nivel</span>
            <input
              type="text"
              className="home-sheet__input riviera-input"
              placeholder="Fuerza: 5ta Fuerza, Open…"
              value={values.nivel}
              disabled={disabled}
              onChange={(e) => patch({ nivel: e.target.value })}
              list={`${idPrefix}-nivel-sugerencias`}
              autoComplete="off"
            />
            <datalist id={`${idPrefix}-nivel-sugerencias`}>
              <option value="Open" />
              <option value="1ra Fuerza" />
              <option value="2da Fuerza" />
              <option value="3ra Fuerza" />
              <option value="4ta Fuerza" />
              <option value="5ta Fuerza" />
              <option value="6ta Fuerza" />
            </datalist>
          </label>
        </div>
      </section>

      <div className="reta-details-form__optional">
        <button
          type="button"
          className={`reta-details-form__optional-toggle${
            optionalOpen ? " is-open" : ""
          }`}
          aria-expanded={optionalOpen}
          onClick={() => setOptionalOpen((v) => !v)}
        >
          <span aria-hidden>{optionalOpen ? "−" : "+"}</span>
          Detalles opcionales
        </button>
        {optionalOpen ? (
          <div className="reta-details-form__optional-body">
        <div className="reta-details-form__row reta-details-form__row--public">
          <label className="home-sheet__field reta-details-form__field reta-details-form__field--desc">
            <span className="home-sheet__field-label">Descripción</span>
            <textarea
              className="home-sheet__input riviera-input reta-details-form__textarea"
              placeholder="Ej. mixta, verano, amigos…"
              value={values.categoria}
              disabled={disabled}
              rows={2}
              maxLength={500}
              onChange={(e) => {
                const v = e.target.value.slice(0, 500);
                patch({ categoria: v });
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 9 * 16)}px`;
              }}
              autoComplete="off"
            />
            <span className="reta-details-form__char-count" aria-live="polite">
              {values.categoria.length}/500
            </span>
          </label>

          <div
            className={`home-sheet__field reta-details-form__field reta-details-form__field--lugar reta-details-form__visibility${
              values.mostrarLugar ? " is-shown" : " is-hidden-public"
            }`}
          >
            <label
              className="reta-details-form__visibility-toggle"
              htmlFor={`${idPrefix}-mostrar-lugar`}
            >
              <input
                id={`${idPrefix}-mostrar-lugar`}
                type="checkbox"
                checked={values.mostrarLugar}
                disabled={disabled}
                onChange={(e) => patch({ mostrarLugar: e.target.checked })}
              />
              <span className="reta-details-form__visibility-title">
                Mostrar lugar
              </span>
            </label>
            <input
              type="text"
              className="home-sheet__input riviera-input reta-details-form__visibility-value"
              placeholder="Club, sede…"
              value={values.lugar}
              disabled={disabled}
              onChange={(e) => patch({ lugar: e.target.value })}
              required={values.mostrarLugar}
            />
            {values.mostrarLugar ? (
              <span className="reta-details-form__visibility-hint">
                Visible.
              </span>
            ) : (
              <span className="reta-details-form__visibility-hint reta-details-form__visibility-hint--muted">
                Oculto.
              </span>
            )}
          </div>

          <div
            className={`home-sheet__field reta-details-form__field reta-details-form__field--costo reta-details-form__visibility${
              values.mostrarCosto ? " is-shown" : " is-hidden-public"
            }`}
          >
            <label
              className="reta-details-form__visibility-toggle"
              htmlFor={`${idPrefix}-mostrar-precio`}
            >
              <input
                id={`${idPrefix}-mostrar-precio`}
                type="checkbox"
                checked={values.mostrarCosto}
                disabled={disabled}
                onChange={(e) => patch({ mostrarCosto: e.target.checked })}
              />
              <span className="reta-details-form__visibility-title">
                Mostrar precio
              </span>
            </label>
            <input
              type="text"
              className="home-sheet__input riviera-input reta-details-form__visibility-value"
              placeholder="$200 por jugador"
              value={values.costo}
              disabled={disabled}
              onChange={(e) => patch({ costo: e.target.value })}
            />
            {values.mostrarCosto ? (
              <span className="reta-details-form__visibility-hint">
                Visible.
              </span>
            ) : (
              <span className="reta-details-form__visibility-hint reta-details-form__visibility-hint--muted">
                Oculto.
              </span>
            )}
          </div>

          <div
            className={`home-sheet__field reta-details-form__field reta-details-form__field--premio reta-details-form__visibility${
              values.mostrarPremio ? " is-shown" : " is-hidden-public"
            }`}
          >
            <label
              className="reta-details-form__visibility-toggle"
              htmlFor={`${idPrefix}-mostrar-premio`}
            >
              <input
                id={`${idPrefix}-mostrar-premio`}
                type="checkbox"
                checked={values.mostrarPremio}
                disabled={disabled}
                onChange={(e) => patch({ mostrarPremio: e.target.checked })}
              />
              <span className="reta-details-form__visibility-title">
                Mostrar premio
              </span>
            </label>
            <input
              type="text"
              className="home-sheet__input riviera-input reta-details-form__visibility-value"
              placeholder="Trofeo + pelotas"
              value={values.premio}
              disabled={disabled}
              onChange={(e) => patch({ premio: e.target.value })}
            />
            {values.mostrarPremio ? (
              <span className="reta-details-form__visibility-hint">
                Visible.
              </span>
            ) : (
              <span className="reta-details-form__visibility-hint reta-details-form__visibility-hint--muted">
                Oculto.
              </span>
            )}
          </div>
        </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
