import React from "react";
import "./torneo-express.css";
import "./riviera-torneo-express.css";
import { Button, Modal } from "../ui";

interface EventoDeleteModalProps {
  eventoNombre: string;
  categoriaCount: number;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const EventoDeleteModal: React.FC<EventoDeleteModalProps> = ({
  eventoNombre,
  categoriaCount,
  deleting,
  onCancel,
  onConfirm,
}) => {
  const catsLabel =
    categoriaCount === 1
      ? "1 categoría"
      : `${categoriaCount} categorías`;

  return (
    <Modal open onClose={onCancel} title="Eliminar evento" size="md">
      <p className="te-modal-text">
        ¿Eliminar <strong>{eventoNombre}</strong>? Esta acción no se puede
        deshacer. Se eliminarán {catsLabel} del evento, con sus grupos,
        partidos y resultados.
      </p>
      <div className="riviera-modal__actions te-modal-actions">
        <Button
          type="button"
          variant="secondary"
          disabled={deleting}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={deleting}
          loading={deleting}
          onClick={onConfirm}
        >
          {deleting ? "Eliminando…" : "Sí, eliminar"}
        </Button>
      </div>
    </Modal>
  );
};
