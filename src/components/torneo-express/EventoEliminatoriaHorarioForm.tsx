import React from "react";
import type { TorneoExpress } from "../../lib/torneoExpress/types";
import {
  categoriaOrdenLabel,
  ELIMINATORIA_CATEGORIA_GAP_MINUTES,
} from "../../lib/torneoExpress/eliminatoriaCategoriaOrden";

export type EventoEliminatoriaHorarioFormProps = {
  inicioLocal: string;
  onInicioLocalChange: (value: string) => void;
  categorias: TorneoExpress[];
  ordenIds: string[];
  onOrdenIdsChange: (ids: string[]) => void;
};

function moveId(ids: string[], index: number, delta: number): string[] {
  const next = ids.slice();
  const target = index + delta;
  if (target < 0 || target >= next.length) return ids;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export const EventoEliminatoriaHorarioForm: React.FC<
  EventoEliminatoriaHorarioFormProps
> = ({
  inicioLocal,
  onInicioLocalChange,
  categorias,
  ordenIds,
  onOrdenIdsChange,
}) => {
  const byId = new Map(categorias.map((cat) => [cat.id, cat]));
  const ordered = ordenIds
    .map((id) => byId.get(id))
    .filter((cat): cat is TorneoExpress => Boolean(cat));

  return (
    <div className="te-evd-elim-horario">
      <label className="te-evd-elim-horario__field">
        <span className="te-evd-elim-horario__label">
          Inicio de eliminatorias
        </span>
        <input
          type="datetime-local"
          className="te-evd-elim-horario__input"
          value={inicioLocal}
          onChange={(event) => onInicioLocalChange(event.target.value)}
        />
      </label>
      <p className="te-evd-elim-horario__hint">
        La categoría más baja arranca a esta hora. Las siguientes salen cada{" "}
        {ELIMINATORIA_CATEGORIA_GAP_MINUTES} minutos, en el orden de abajo.
      </p>
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
  );
};
