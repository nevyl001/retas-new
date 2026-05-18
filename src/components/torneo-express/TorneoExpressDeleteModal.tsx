import React from "react";
import "./torneo-express.css";
import "./riviera-torneo-express.css";

interface TorneoExpressDeleteModalProps {
  torneoNombre: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const TorneoExpressDeleteModal: React.FC<TorneoExpressDeleteModalProps> = ({
  torneoNombre,
  deleting,
  onCancel,
  onConfirm,
}) => {
  return (
    <div
      className="te-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="te-delete-modal-title"
      onClick={onCancel}
    >
      <div
        className="te-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="te-delete-modal-title" className="te-modal-title">
          Eliminar torneo
        </h2>
        <p className="te-modal-text">
          ¿Eliminar <strong>{torneoNombre}</strong>? Esta acción no se puede
          deshacer. Se eliminarán todos los grupos, partidos y resultados.
        </p>
        <div className="te-modal-actions">
          <button
            type="button"
            className="torneo-express-btn"
            disabled={deleting}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="torneo-express-btn te-btn-delete te-btn-delete--solid"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
};
