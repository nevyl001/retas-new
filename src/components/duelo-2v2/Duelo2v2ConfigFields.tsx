import React from "react";
import { RETA_DURATION_MAX, clampRetaDurationMinutes } from "../../lib/reta/retaConfigValidation";
import { CANCHA_DEFAULT_VALUE } from "../../lib/torneoExpress/canchaDisplay";
import { DurationMinutesField } from "../reta/DurationMinutesField";
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
  /** Activa cabeceras guiadas por pasos y ayudas contextuales en el asistente de alta. */
  guided?: boolean;
};

/**
 * Campos densos del duelo — mismo chrome y ritmo que RetaConfigFields essentials.
 * Horario: Día + Hora + Duración + Cancha en una fila en escritorio; fin automático en la etiqueta.
 */
export const Duelo2v2ConfigFields: React.FC<Duelo2v2ConfigFieldsProps> = ({
  values,
  onChange,
  disabled = false,
  idPrefix = "duelo",
  guided = false,
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
    const rawDuration = partial.durationMinutes ?? values.durationMinutes;
    const durationMinutes =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.min(RETA_DURATION_MAX, Math.floor(rawDuration))
        : values.durationMinutes;
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
        {guided ? (
          <div className="reta-details-form__section-head">
            <span className="reta-details-form__step-badge">Paso 1</span>
            <div className="reta-details-form__section-head-copy">
              <h3
                id={`${idPrefix}-sec-essential`}
                className="reta-details-form__section-title"
              >
                Información principal
              </h3>
              <p className="reta-details-form__section-lead">
                Define el nombre, la fecha, el horario y la cancha donde se jugará el duelo.
              </p>
            </div>
          </div>
        ) : (
          <h3
            id={`${idPrefix}-sec-essential`}
            className="reta-details-form__section-title"
          >
            Información principal
          </h3>
        )}
        <div className="reta-details-form__row reta-details-form__row--name">
          <label
            className="home-sheet__field reta-details-form__field reta-details-form__field--name"
            htmlFor={`${idPrefix}-nombre`}
          >
            <div className="reta-details-form__label-row">
              <span className="home-sheet__field-label">Nombre</span>
              {guided ? (
                <span className="reta-details-form__field-help">
                  Pon un nombre fácil de identificar para el encuentro.
                </span>
              ) : null}
            </div>
            <input
              id={`${idPrefix}-nombre`}
              aria-label="Nombre"
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
              {guided ? (
                <span className="reta-details-form__field-help">
                  Define cuándo se jugará el duelo.
                </span>
              ) : null}
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
              {guided ? (
                <span className="reta-details-form__field-help">
                  Hora de inicio citada.
                </span>
              ) : null}
            </label>
            <label
              className="home-sheet__field reta-details-form__field reta-details-form__field--duration"
              htmlFor={`${idPrefix}-duracion`}
            >
              <span className="home-sheet__field-label">
                Duración
                <span className="reta-details-form__duration-unit"> (min)</span>
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
              <DurationMinutesField
                id={`${idPrefix}-duracion`}
                value={values.durationMinutes}
                disabled={disabled}
                onChange={(minutes) =>
                  applySchedule({ durationMinutes: minutes })
                }
                onCommit={(minutes) =>
                  applySchedule({
                    durationMinutes: clampRetaDurationMinutes(minutes),
                  })
                }
              />
              {guided ? (
                <span className="reta-details-form__field-help">
                  El horario de cierre se calcula automáticamente.
                </span>
              ) : null}
            </label>
          </div>

          <label
            className="home-sheet__field reta-details-form__field reta-details-form__field--cancha"
            htmlFor={`${idPrefix}-cancha`}
          >
            <span className="home-sheet__field-label">Cancha</span>
            <div className="reta-details-form__stepper reta-details-form__stepper--typeable">
              <button
                type="button"
                className="home-sheet__stepper-btn"
                aria-label="Menos cancha"
                disabled={
                  disabled ||
                  (Number.isFinite(Number(values.cancha.trim())) &&
                    Number(values.cancha.trim()) <= 1)
                }
                onClick={(e) => {
                  e.preventDefault();
                  const num = parseInt(values.cancha.replace(/\D/g, ""), 10);
                  const next = Number.isFinite(num) ? Math.max(1, num - 1) : 1;
                  patch({ cancha: String(next) });
                }}
              >
                −
              </button>
              <input
                id={`${idPrefix}-cancha`}
                name={`${idPrefix}-cancha`}
                type="text"
                autoComplete="off"
                className="reta-details-form__stepper-input"
                placeholder="1"
                value={values.cancha}
                disabled={disabled}
                aria-label="Cancha"
                onChange={(e) => patch({ cancha: e.target.value })}
                onBlur={() => {
                  const trimmed = values.cancha.trim();
                  if (!trimmed) {
                    patch({ cancha: CANCHA_DEFAULT_VALUE });
                  }
                }}
                required
              />
              <button
                type="button"
                className="home-sheet__stepper-btn"
                aria-label="Más cancha"
                disabled={
                  disabled ||
                  (Number.isFinite(Number(values.cancha.trim())) &&
                    Number(values.cancha.trim()) >= 99)
                }
                onClick={(e) => {
                  e.preventDefault();
                  const num = parseInt(values.cancha.replace(/\D/g, ""), 10);
                  const next = Number.isFinite(num) ? Math.min(99, num + 1) : 1;
                  patch({ cancha: String(next) });
                }}
              >
                +
              </button>
            </div>
            {guided ? (
              <span className="reta-details-form__field-help">
                Indica la cancha asignada al partido.
              </span>
            ) : null}
          </label>
        </div>
      </section>

      <section
        className="reta-details-form__section reta-details-form__section--sport"
        aria-labelledby={`${idPrefix}-sec-sport`}
      >
        {guided ? (
          <div className="reta-details-form__section-head">
            <span className="reta-details-form__step-badge">Paso 2</span>
            <div className="reta-details-form__section-head-copy">
              <h3
                id={`${idPrefix}-sec-sport`}
                className="reta-details-form__section-title"
              >
                Configuración deportiva
              </h3>
              <p className="reta-details-form__section-lead">
                Establece la fuerza o categoría competitiva del encuentro 2 vs 2.
              </p>
            </div>
          </div>
        ) : (
          <h3
            id={`${idPrefix}-sec-sport`}
            className="reta-details-form__section-title"
          >
            Configuración deportiva
          </h3>
        )}
        <div className="reta-details-form__row reta-details-form__row--game">
          <label
            className="home-sheet__field reta-details-form__field reta-details-form__field--nivel"
            htmlFor={`${idPrefix}-nivel`}
          >
            <div className="reta-details-form__label-row">
              <span className="home-sheet__field-label">Nivel</span>
              {guided ? (
                <span className="reta-details-form__field-help">
                  Especifica la fuerza o categoría que jugará (ej. 5ta Fuerza, Open).
                </span>
              ) : null}
            </div>
            <input
              id={`${idPrefix}-nivel`}
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

      <section
        className="reta-details-form__section reta-details-form__section--optional"
        aria-labelledby={`${idPrefix}-details-sec-optional`}
      >
        {guided ? (
          <div className="reta-details-form__section-head">
            <span className="reta-details-form__step-badge">Paso 3</span>
            <div className="reta-details-form__section-head-copy">
              <h3
                id={`${idPrefix}-details-sec-optional`}
                className="reta-details-form__section-title"
              >
                Detalles opcionales
              </h3>
              <p className="reta-details-form__section-lead">
                Elige qué información verán los jugadores en la ficha pública y el enlace.
              </p>
            </div>
          </div>
        ) : (
          <h3
            id={`${idPrefix}-details-sec-optional`}
            className="reta-details-form__section-title"
          >
            Detalles opcionales
          </h3>
        )}
        <div className="reta-details-form__row reta-details-form__row--public">
          <label
            className="home-sheet__field reta-details-form__field reta-details-form__field--desc"
            htmlFor={`${idPrefix}-descripcion`}
          >
            <div className="reta-details-form__label-row">
              <span className="home-sheet__field-label">Descripción</span>
              {guided ? (
                <span className="reta-details-form__field-help">
                  Agrega notas breves, formato de pelotas o indicaciones para los jugadores.
                </span>
              ) : null}
            </div>
            <textarea
              id={`${idPrefix}-descripcion`}
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

          <div className="reta-details-form__row--meta">
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
                  Visible en ficha y enlace.
                </span>
              ) : (
                <span className="reta-details-form__visibility-hint reta-details-form__visibility-hint--muted">
                  Oculto al público.
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
                  Visible en ficha y enlace.
                </span>
              ) : (
                <span className="reta-details-form__visibility-hint reta-details-form__visibility-hint--muted">
                  Oculto al público.
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
                  Visible en ficha y enlace.
                </span>
              ) : (
                <span className="reta-details-form__visibility-hint reta-details-form__visibility-hint--muted">
                  Oculto al público.
                </span>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
