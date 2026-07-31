import React from "react";

export type Duelo2v2ConfigFieldValues = {
  nombre: string;
  cancha: string;
  categoria: string;
  mostrarLugar: boolean;
  lugar: string;
  draftDate: string;
  draftTimeStart: string;
  draftTimeEnd: string;
};

export type Duelo2v2ConfigFieldsProps = {
  values: Duelo2v2ConfigFieldValues;
  onChange: (next: Duelo2v2ConfigFieldValues) => void;
  disabled?: boolean;
  /** Prefijo para ids (accesibilidad / tests). */
  idPrefix?: string;
};

/**
 * Campos densos del duelo — mismo chrome que RetaConfigFields essentials
 * (reta-details-form + home-sheet) para que qm-ws__details-inline pinte igual.
 */
export const Duelo2v2ConfigFields: React.FC<Duelo2v2ConfigFieldsProps> = ({
  values,
  onChange,
  disabled = false,
  idPrefix = "duelo",
}) => {
  const patch = (partial: Partial<Duelo2v2ConfigFieldValues>) =>
    onChange({ ...values, ...partial });

  return (
    <div
      className="reta-details-form"
      role="group"
      aria-label="Campos del duelo"
    >
      <div className="reta-details-form__row reta-details-form__row--primary">
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

        <label className="home-sheet__field reta-details-form__field reta-details-form__field--schedule">
          <span className="home-sheet__field-label">Día</span>
          <input
            type="date"
            className="home-sheet__input riviera-input"
            value={values.draftDate}
            disabled={disabled}
            onChange={(e) => patch({ draftDate: e.target.value })}
            required
          />
        </label>

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

      <div className="reta-details-form__row reta-details-form__row--meta">
        <label className="home-sheet__field reta-details-form__field reta-details-form__field--desc">
          <span className="home-sheet__field-label">Categoría / nivel</span>
          <input
            type="text"
            className="home-sheet__input riviera-input"
            placeholder="Ej. 5ta Fuerza"
            value={values.categoria}
            disabled={disabled}
            onChange={(e) => patch({ categoria: e.target.value })}
            list={`${idPrefix}-categoria-sugerencias`}
          />
          <datalist id={`${idPrefix}-categoria-sugerencias`}>
            <option value="Open" />
            <option value="1ra Fuerza" />
            <option value="2da Fuerza" />
            <option value="3ra Fuerza" />
            <option value="4ta Fuerza" />
            <option value="5ta Fuerza" />
            <option value="6ta Fuerza" />
          </datalist>
        </label>

        <label className="home-sheet__field reta-details-form__field reta-details-form__field--duration">
          <span className="home-sheet__field-label">Hora inicio</span>
          <input
            type="time"
            className="home-sheet__input riviera-input"
            value={values.draftTimeStart}
            disabled={disabled}
            onChange={(e) => patch({ draftTimeStart: e.target.value })}
            required
          />
        </label>

        <label className="home-sheet__field reta-details-form__field">
          <span className="home-sheet__field-label">Hora fin</span>
          <input
            type="time"
            className="home-sheet__input riviera-input"
            value={values.draftTimeEnd}
            disabled={disabled}
            onChange={(e) => patch({ draftTimeEnd: e.target.value })}
            required
          />
        </label>

        <div className="home-sheet__field reta-details-form__field reta-details-form__field--lugar">
          <span className="reta-details-form__lugar-label">
            <input
              type="checkbox"
              checked={values.mostrarLugar}
              disabled={disabled}
              onChange={(e) => patch({ mostrarLugar: e.target.checked })}
              aria-label="Mostrar lugar"
            />
            <span className="home-sheet__field-label">Lugar</span>
          </span>
          <input
            type="text"
            className="home-sheet__input riviera-input"
            placeholder="Club, sede…"
            value={values.lugar}
            disabled={disabled || !values.mostrarLugar}
            onChange={(e) => patch({ lugar: e.target.value })}
            required={values.mostrarLugar}
          />
        </div>
      </div>
    </div>
  );
};
