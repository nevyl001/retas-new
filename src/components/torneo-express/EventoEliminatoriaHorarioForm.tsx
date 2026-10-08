import React from "react";
import type { TorneoExpress } from "../../lib/torneoExpress/types";
import type {
  EliminatoriaDuraciones,
  EliminatoriaRondaKey,
} from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import {
  categoriaOrdenLabel,
  ELIMINATORIA_CANCHAS_MAX,
  ELIMINATORIA_RONDA_FIELDS,
  ELIMINATORIA_RONDA_MINUTES_MAX,
  ELIMINATORIA_RONDA_MINUTES_MIN,
  rondaPathLabel,
  toggleEliminatoriaRonda,
} from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import "./te-evento-detalle.css";

export type EventoEliminatoriaHorarioFormProps = {
  inicioLocal: string;
  onInicioLocalChange: (value: string) => void;
  timezone?: string | null;
  categorias: TorneoExpress[];
  ordenIds: string[];
  onOrdenIdsChange: (ids: string[]) => void;
  canchas: string[];
  onCanchasChange: (canchas: string[]) => void;
  duraciones: EliminatoriaDuraciones;
  onDuracionesChange: (duraciones: EliminatoriaDuraciones) => void;
  rondasActivas: EliminatoriaRondaKey[];
  onRondasActivasChange: (rondas: EliminatoriaRondaKey[]) => void;
};

function moveId(ids: string[], index: number, delta: number): string[] {
  const next = ids.slice();
  const target = index + delta;
  if (target < 0 || target >= next.length) return ids;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function nextCourtName(canchas: readonly string[]): string {
  const used = new Set(canchas.map((name) => name.trim().toLowerCase()));
  for (let n = 1; n <= ELIMINATORIA_CANCHAS_MAX; n += 1) {
    const candidate = String(n);
    if (!used.has(candidate)) return candidate;
  }
  return String(canchas.length + 1);
}

function splitInicioLocal(value: string): { date: string; time: string } {
  const [date = "", time = ""] = value.split("T");
  return { date, time: time.slice(0, 5) };
}

function joinInicioLocal(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}

export const EventoEliminatoriaHorarioForm: React.FC<
  EventoEliminatoriaHorarioFormProps
> = ({
  inicioLocal,
  onInicioLocalChange,
  timezone,
  categorias,
  ordenIds,
  onOrdenIdsChange,
  canchas,
  onCanchasChange,
  duraciones,
  onDuracionesChange,
  rondasActivas,
  onRondasActivasChange,
}) => {
  const byId = new Map(categorias.map((cat) => [cat.id, cat]));
  const ordered = ordenIds
    .map((id) => byId.get(id))
    .filter((cat): cat is TorneoExpress => Boolean(cat));
  const { date, time } = splitInicioLocal(inicioLocal);
  const pathLabel = rondaPathLabel(rondasActivas);

  return (
    <div className="te-evd-elim-horario">
      <section className="te-evd-elim-block">
        <header className="te-evd-elim-block__head">
          <h3 className="te-evd-elim-block__title">Inicio</h3>
          <p className="te-evd-elim-horario__hint">
            La primera categoría arranca a esta hora. La siguiente empieza
            cuando termina el cuadro de la anterior.
          </p>
        </header>
        <div className="te-evd-elim-inicio">
          <label className="te-evd-elim-horario__field" htmlFor="te-evd-elim-fecha">
            <span className="te-evd-elim-horario__label">Fecha</span>
            <input
              id="te-evd-elim-fecha"
              type="date"
              className="te-evd-elim-horario__input"
              value={date}
              onChange={(event) =>
                onInicioLocalChange(joinInicioLocal(event.target.value, time))
              }
            />
          </label>
          <label className="te-evd-elim-horario__field" htmlFor="te-evd-elim-hora">
            <span className="te-evd-elim-horario__label">Hora</span>
            <input
              id="te-evd-elim-hora"
              type="time"
              className="te-evd-elim-horario__input"
              value={time}
              onChange={(event) =>
                onInicioLocalChange(joinInicioLocal(date, event.target.value))
              }
            />
          </label>
        </div>
        {timezone ? (
          <p className="te-evd-elim-horario__meta">{timezone.replace(/_/g, " ")}</p>
        ) : null}
      </section>

      <section className="te-evd-elim-block">
        <header className="te-evd-elim-block__head">
          <h3 className="te-evd-elim-block__title">Rondas</h3>
          <p className="te-evd-elim-horario__hint">
            Marca solo las que se juegan. Si este evento no tiene octavos,
            déjalos sin marcar y define los minutos de cuartos, semis y final.
          </p>
        </header>
        <ul className="te-evd-elim-rondas">
          {ELIMINATORIA_RONDA_FIELDS.map((field) => {
            const checked = rondasActivas.includes(field.key);
            const inputId = `te-evd-elim-${field.key}`;
            return (
              <li
                key={field.key}
                className={`te-evd-elim-ronda${
                  checked ? "" : " te-evd-elim-ronda--off"
                }`}
              >
                <label className="te-evd-elim-ronda__check" htmlFor={inputId}>
                  <input
                    id={inputId}
                    type="checkbox"
                    checked={checked}
                    disabled={field.required}
                    onChange={(event) =>
                      onRondasActivasChange(
                        toggleEliminatoriaRonda(
                          rondasActivas,
                          field.key,
                          event.target.checked
                        )
                      )
                    }
                  />
                  <span>
                    <span className="te-evd-elim-ronda__name">{field.label}</span>
                    <span className="te-evd-elim-ronda__hint">{field.hint}</span>
                  </span>
                </label>
                {checked ? (
                  <label
                    className="te-evd-elim-ronda__mins"
                    htmlFor={`${inputId}-min`}
                  >
                    <input
                      id={`${inputId}-min`}
                      type="number"
                      min={ELIMINATORIA_RONDA_MINUTES_MIN}
                      max={ELIMINATORIA_RONDA_MINUTES_MAX}
                      step={5}
                      className="te-evd-elim-horario__input te-evd-elim-horario__input--mins"
                      value={duraciones[field.key]}
                      aria-label={`Minutos de ${field.label}`}
                      onChange={(event) =>
                        onDuracionesChange({
                          ...duraciones,
                          [field.key]: Number(event.target.value),
                        })
                      }
                    />
                    <span className="te-evd-elim-horario__unit">min</span>
                  </label>
                ) : (
                  <span className="te-evd-elim-ronda__skip">No se juega</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="te-evd-elim-block">
        <header className="te-evd-elim-block__head">
          <h3 className="te-evd-elim-block__title">Canchas</h3>
          <p className="te-evd-elim-horario__hint">
            En cada ronda se juegan partidos en paralelo en estas canchas.
          </p>
        </header>
        {canchas.length === 0 ? (
          <p className="te-evd-elim-horario__empty">Sin canchas todavía.</p>
        ) : (
          <ul className="te-evd-elim-horario__courts">
            {canchas.map((cancha, index) => (
              <li key={`court-${index}`} className="te-evd-elim-horario__court">
                <label className="te-evd-elim-horario__court-field">
                  <span className="te-evd-elim-horario__court-label">
                    Cancha {index + 1}
                  </span>
                  <input
                    type="text"
                    className="te-evd-elim-horario__input te-evd-elim-horario__input--court"
                    value={cancha}
                    aria-label={`Nombre de cancha ${index + 1}`}
                    onChange={(event) => {
                      const next = canchas.slice();
                      next[index] = event.target.value;
                      onCanchasChange(next);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="te-evd-elim-horario__btn"
                  aria-label={`Quitar cancha ${cancha || index + 1}`}
                  onClick={() =>
                    onCanchasChange(canchas.filter((_, i) => i !== index))
                  }
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="te-evd-elim-horario__add"
          disabled={canchas.length >= ELIMINATORIA_CANCHAS_MAX}
          onClick={() => onCanchasChange([...canchas, nextCourtName(canchas)])}
        >
          Agregar cancha
        </button>
      </section>

      <section className="te-evd-elim-block">
        <header className="te-evd-elim-block__head">
          <h3 className="te-evd-elim-block__title">Orden de categorías</h3>
          <p className="te-evd-elim-horario__hint">
            {pathLabel
              ? `Todas juegan ${pathLabel}.`
              : "Define el orden de arranque."}
          </p>
        </header>
        {ordered.length === 0 ? (
          <p className="te-evd-elim-horario__empty">
            Agrega categorías para definir el orden de juego.
          </p>
        ) : (
          <ol className="te-evd-elim-horario__list">
            {ordered.map((cat, index) => (
              <li key={cat.id} className="te-evd-elim-horario__item">
                <span className="te-evd-elim-horario__index">{index + 1}</span>
                <span className="te-evd-elim-horario__copy">
                  <span className="te-evd-elim-horario__name">
                    {categoriaOrdenLabel(cat)}
                  </span>
                  <span className="te-evd-elim-horario__path">{pathLabel}</span>
                </span>
                <span className="te-evd-elim-horario__move">
                  <button
                    type="button"
                    className="te-evd-elim-horario__btn"
                    disabled={index === 0}
                    aria-label={`Subir ${categoriaOrdenLabel(cat)}`}
                    onClick={() =>
                      onOrdenIdsChange(moveId(ordenIds, index, -1))
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="te-evd-elim-horario__btn"
                    disabled={index === ordered.length - 1}
                    aria-label={`Bajar ${categoriaOrdenLabel(cat)}`}
                    onClick={() =>
                      onOrdenIdsChange(moveId(ordenIds, index, 1))
                    }
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};
