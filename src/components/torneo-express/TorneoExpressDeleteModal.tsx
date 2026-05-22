import React from "react";
import "./torneo-express.css";
import "./riviera-torneo-express.css";
import { Button, Modal } from "../ui";

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
    <Modal open onClose={onCancel} title="Eliminar torneo" size="md">
      <p className="te-modal-text">
        ¿Eliminar <strong>{torneoNombre}</strong>? Esta acción no se puede deshacer.
        Se eliminarán todos los grupos, partidos y resultados.
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
