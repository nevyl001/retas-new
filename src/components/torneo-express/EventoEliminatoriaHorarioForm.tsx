import React from "react";
import type { TorneoExpress } from "../../lib/torneoExpress/types";
import type { EliminatoriaDuraciones } from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";
import {
  categoriaOrdenLabel,
  ELIMINATORIA_CANCHAS_MAX,
  ELIMINATORIA_RONDA_FIELDS,
  ELIMINATORIA_RONDA_MINUTES_MAX,
  ELIMINATORIA_RONDA_MINUTES_MIN,
} from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";

export type EventoEliminatoriaHorarioFormProps = {
  inicioLocal: string;
  onInicioLocalChange: (value: string) => void;
  categorias: TorneoExpress[];
  ordenIds: string[];
  onOrdenIdsChange: (ids: string[]) => void;
  canchas: string[];
  onCanchasChange: (canchas: string[]) => void;
  duraciones: EliminatoriaDuraciones;
  onDuracionesChange: (duraciones: EliminatoriaDuraciones) => void;
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

export const EventoEliminatoriaHorarioForm: React.FC<
  EventoEliminatoriaHorarioFormProps
> = ({
  inicioLocal,
  onInicioLocalChange,
  categorias,
  ordenIds,
  onOrdenIdsChange,
  canchas,
  onCanchasChange,
  duraciones,
  onDuracionesChange,
}) => {
  const byId = new Map(categorias.map((cat) => [cat.id, cat]));
  const ordered = ordenIds
    .map((id) => byId.get(id))
    .filter((cat): cat is TorneoExpress => Boolean(cat));

  return (
    <div className="te-evd-elim-horario">
      <label className="te-evd-elim-horario__field" htmlFor="te-evd-elim-inicio">
        <span className="te-evd-elim-horario__label">
          Inicio de eliminatorias
        </span>
        <input
          id="te-evd-elim-inicio"
          type="datetime-local"
          className="te-evd-elim-horario__input"
          value={inicioLocal}
          onChange={(event) => onInicioLocalChange(event.target.value)}
        />
      </label>
      <p className="te-evd-elim-horario__hint">
        La primera de la lista arranca a esta hora. La siguiente categoría
        empieza cuando termina el cuadro de la anterior.
      </p>

      <fieldset className="te-evd-elim-horario__field">
        <legend className="te-evd-elim-horario__label">
          Tiempo de cada ronda
        </legend>
        <p className="te-evd-elim-horario__hint">
          Minutos de juego de octavos, cuartos, semis y final. Puedes
          cambiarlos cuando las rondas duren distinto.
        </p>
        <div className="te-evd-elim-horario__duraciones">
          {ELIMINATORIA_RONDA_FIELDS.map(({ key, label }) => (
            <label
              key={key}
              className="te-evd-elim-horario__duracion"
              htmlFor={`te-evd-elim-${key}`}
            >
              <span className="te-evd-elim-horario__court-label">{label}</span>
              <input
                id={`te-evd-elim-${key}`}
                type="number"
                min={ELIMINATORIA_RONDA_MINUTES_MIN}
                max={ELIMINATORIA_RONDA_MINUTES_MAX}
                step={5}
                className="te-evd-elim-horario__input te-evd-elim-horario__input--mins"
                value={duraciones[key]}
                onChange={(event) =>
                  onDuracionesChange({
                    ...duraciones,
                    [key]: Number(event.target.value),
                  })
                }
              />
              <span className="te-evd-elim-horario__unit">min</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="te-evd-elim-horario__field">
        <legend className="te-evd-elim-horario__label">
          Canchas disponibles
        </legend>
        <p className="te-evd-elim-horario__hint">
          Cada categoría usa estas canchas en su horario. Déjalas vacías si
          todavía no están definidas.
        </p>
        {canchas.length === 0 ? (
          <p className="te-evd-elim-horario__empty">Sin canchas todavía.</p>
        ) : (
          <ul className="te-evd-elim-horario__courts">
            {canchas.map((cancha, index) => (
              <li key={`court-${index}`} className="te-evd-elim-horario__court">
                <label className="te-evd-elim-horario__court-field">
                  <span className="te-evd-elim-horario__court-label">
                    Cancha
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
          onClick={() =>
            onCanchasChange([...canchas, nextCourtName(canchas)])
          }
        >
          Agregar cancha
        </button>
      </fieldset>

      <div className="te-evd-elim-horario__field">
        <span className="te-evd-elim-horario__label">Orden de categorías</span>
        {ordered.length === 0 ? (
          <p className="te-evd-elim-horario__empty">
            Agrega categorías para definir el orden de juego.
          </p>
        ) : (
          <ol className="te-evd-elim-horario__list">
            {ordered.map((cat, index) => (
              <li key={cat.id} className="te-evd-elim-horario__item">
                <span className="te-evd-elim-horario__index">{index + 1}</span>
                <span className="te-evd-elim-horario__name">
                  {categoriaOrdenLabel(cat)}
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
      </div>
    </div>
  );
};
