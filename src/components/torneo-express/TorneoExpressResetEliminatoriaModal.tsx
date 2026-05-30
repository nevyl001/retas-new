import React, { useEffect, useState } from "react";
import { Button, Modal } from "../ui";
import "./torneo-express.css";
import "./riviera-torneo-express.css";
import "./torneo-express-bracket.css";

const CONFIRM_TEXT = "REINICIAR";

interface TorneoExpressResetEliminatoriaModalProps {
  open: boolean;
  resetting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const TorneoExpressResetEliminatoriaModal: React.FC<
  TorneoExpressResetEliminatoriaModalProps
> = ({ open, resetting, onCancel, onConfirm }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [confirmInput, setConfirmInput] = useState("");

  useEffect(() => {
    if (!open) {
      setStep(1);
      setConfirmInput("");
    }
  }, [open]);

  const handleClose = () => {
    if (resetting) return;
    onCancel();
  };

  const canConfirm = confirmInput.trim().toUpperCase() === CONFIRM_TEXT;

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={
        step === 1
          ? "Reiniciar fase eliminatoria"
          : "Confirmación final"
      }
      size="md"
    >
      {step === 1 ? (
        <div className="te-reset-elim-modal">
          <p className="te-reset-elim-modal__lead">
            <span className="te-reset-elim-modal__warn" aria-hidden>
              ⚠️
            </span>{" "}
            Esta acción eliminará:
          </p>
          <ul className="te-reset-elim-modal__list">
            <li>Todos los partidos de eliminatoria</li>
            <li>Todos los resultados ingresados</li>
            <li>El bracket completo</li>
          </ul>
          <p className="te-reset-elim-modal__safe">
            Los resultados de la fase de grupos <strong>no</strong> se verán
            afectados.
          </p>
          <p className="te-reset-elim-modal__note">
            El torneo volverá al estado «Grupos completados — listo para iniciar
            eliminatoria».
          </p>
          <div className="riviera-modal__actions te-modal-actions te-reset-elim-modal__actions">
            <Button
              type="button"
              variant="ghost"
              disabled={resetting}
              onClick={handleClose}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={resetting}
              onClick={() => setStep(2)}
            >
              Sí, entiendo →
            </Button>
          </div>
        </div>
      ) : (
        <div className="te-reset-elim-modal">
          <p className="te-reset-elim-modal__confirm-label">
            Confirma escribiendo: <strong>{CONFIRM_TEXT}</strong>
          </p>
          <label className="te-reset-elim-modal__field">
            <span className="sr-only">Texto de confirmación</span>
            <input
              type="text"
              className="te-reset-elim-modal__input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={CONFIRM_TEXT}
              autoComplete="off"
              autoFocus
              disabled={resetting}
            />
          </label>
          <div className="riviera-modal__actions te-modal-actions te-reset-elim-modal__actions">
            <Button
              type="button"
              variant="ghost"
              disabled={resetting}
              onClick={() => {
                setStep(1);
                setConfirmInput("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!canConfirm || resetting}
              loading={resetting}
              onClick={onConfirm}
            >
              {resetting ? "Reiniciando…" : "Reiniciar"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
