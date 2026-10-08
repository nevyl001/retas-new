import React from "react";
import type {
  TorneoExpressClasificacionModo,
  TorneoExpressPartidoFormato,
} from "../../lib/torneoExpress/types";
import {
  CLASIFICACION_MODO_OPTIONS,
  PARTIDO_FORMATO_OPTIONS,
} from "../../lib/torneoExpress/clasificacionModo";
import { Button } from "../ui";
import "./te-evento-detalle.css";

type RuleOption<V extends string> = {
  value: V;
  label: string;
  description: string;
  steps?: readonly string[];
};

type RuleGroupProps<V extends string> = {
  legend: string;
  name: string;
  options: readonly RuleOption<V>[];
  value: V;
  onChange: (value: V) => void;
};

/** Grupo de opciones excluyentes: una sola tarjeta, filas separadas por una línea fina. */
function RuleGroup<V extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: RuleGroupProps<V>) {
  return (
    <fieldset className="te-evd-rule-group">
      <legend className="te-evd-rule-group__legend">{legend}</legend>
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`te-evd-rule${value === opt.value ? " te-evd-rule--selected" : ""}`}
        >
          <input
            type="radio"
            name={name}
            className="te-evd-rule__input"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span className="te-evd-rule__body">
            <span className="te-evd-rule__label">{opt.label}</span>
            <span className="te-evd-rule__desc">{opt.description}</span>
            {opt.steps && opt.steps.length > 0 ? (
              <ol className="te-evd-rule__steps">
                {opt.steps.map((step) => (
                  <li key={step}>{step.replace(/^\d+\.\s*/, "")}</li>
                ))}
              </ol>
            ) : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export type EventoReglasFormProps = {
  clasificacionModo: TorneoExpressClasificacionModo;
  partidoFormato: TorneoExpressPartidoFormato;
  onClasificacionChange: (value: TorneoExpressClasificacionModo) => void;
  onPartidoFormatoChange: (value: TorneoExpressPartidoFormato) => void;
  /** Hay cambios sin guardar. Solo informa; no habilita ni deshabilita el botón. */
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
};

/**
 * Reglas del evento: dos grupos de opciones y la barra de guardado.
 * Solo presentación; los valores, el estado y el guardado viven en `EventoDetalle`.
 */
export const EventoReglasForm: React.FC<EventoReglasFormProps> = ({
  clasificacionModo,
  partidoFormato,
  onClasificacionChange,
  onPartidoFormatoChange,
  dirty,
  saving,
  onSave,
}) => (
  <div className="te-evd-rules">
    <div className="te-evd-rules__groups">
      <RuleGroup
        legend="Clasificación a siguiente fase"
        name="clasificacion_modo"
        options={CLASIFICACION_MODO_OPTIONS}
        value={clasificacionModo}
        onChange={onClasificacionChange}
      />
      <RuleGroup
        legend="Formato de partido"
        name="partido_formato"
        options={PARTIDO_FORMATO_OPTIONS}
        value={partidoFormato}
        onChange={onPartidoFormatoChange}
      />
    </div>
    <div className="te-evd-savebar">
      {dirty ? (
        <p className="te-evd-dirty" role="status">
          Tienes cambios sin guardar
        </p>
      ) : null}
      <Button
        type="button"
        variant="primary"
        size="sm"
        className="te-evd-savebar__btn"
        loading={saving}
        disabled={saving}
        onClick={onSave}
      >
        {saving ? "Guardando…" : "Guardar reglas"}
      </Button>
    </div>
  </div>
);
