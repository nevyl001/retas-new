import React, { useRef, useState } from "react";
import { Button, Modal } from "../ui";
import {
  RESET_FASE_STALE_COPY,
  resetFaseErrorMessage,
} from "../../lib/torneoExpress/resetFaseGrupos";
import { resetGroup } from "../../services/torneoExpressGrupoOps";

export type GrupoResetTarget = {
  id: string;
  orden: number;
  version: number | null;
};

type TeReiniciarFaseGruposActionProps = {
  grupos: GrupoResetTarget[];
  onReload: () => Promise<void> | void;
  onDone: (message: string) => void;
};

const SUCCESS_COPY =
  "Fase de grupos reiniciada. Los marcadores volvieron a pendiente y se revirtió el rating de esos partidos.";

export const TeReiniciarFaseGruposAction: React.FC<
  TeReiniciarFaseGruposActionProps
> = ({ grupos, onReload, onDone }) => {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const busyRef = useRef(false);

  const closeConfirm = () => {
    if (busyRef.current) return;
    setConfirmOpen(false);
    setErrorText(null);
  };

  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErrorText(null);
    try {
      const ordered = [...grupos].sort(
        (a, b) => a.orden - b.orden || a.id.localeCompare(b.id)
      );
      if (ordered.some((grupo) => typeof grupo.version !== "number" || grupo.version < 1)) {
        setErrorText(RESET_FASE_STALE_COPY);
        await onReload();
        return;
      }
      for (const grupo of ordered) {
        await resetGroup({
          grupoId: grupo.id,
          expectedVersion: grupo.version as number,
        });
      }
      onDone(SUCCESS_COPY);
      setConfirmOpen(false);
      await onReload();
    } catch (error) {
      setErrorText(resetFaseErrorMessage(error));
      await onReload();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="te-btn-tabla-general te-btn-reiniciar-fase"
        disabled={busy}
        onClick={() => {
          setErrorText(null);
          setConfirmOpen(true);
        }}
      >
        Reiniciar fase de grupos
      </Button>
      <Modal
        open={confirmOpen}
        onClose={closeConfirm}
        title="Reiniciar fase de grupos"
        size="md"
        hideClose={busy}
        className="te-reiniciar-fase-modal"
      >
        <div className="te-reset-elim-modal">
          <p className="te-reset-elim-modal__lead">
            Se reinicia cada grupo de esta categoría. En cada partido que se
            conserva se borran los puntos, los sets y el ganador, y queda
            pendiente. El rating aplicado por ese partido se revierte.
          </p>
          <ul className="te-reset-elim-modal__list">
            <li>Se conservan el grupo, la ronda, el orden, la cancha y el horario.</li>
            <li>La carrera y el cierre del torneo no se modifican.</li>
            <li>
              Si una pareja ya no está activa, sus partidos de ese grupo se
              eliminan después de revertir el rating.
            </li>
            <li>
              Si el partido apuntaba a una pareja anterior, queda con la pareja
              vigente y se borra quiénes lo jugaron.
            </li>
            <li>La versión de cada grupo sube en 1.</li>
          </ul>
          <p className="te-reset-elim-modal__note">
            No está disponible si la categoría está cerrada, finalizada o ya
            tiene eliminatoria. Si falla a la mitad, los grupos ya reiniciados
            no se deshacen.
          </p>
          {errorText ? (
            <p className="te-reset-elim-modal__note" role="alert">
              {errorText}
            </p>
          ) : null}
          <div className="riviera-modal__actions te-modal-actions te-reset-elim-modal__actions">
            <Button type="button" variant="ghost" disabled={busy} onClick={closeConfirm}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              disabled={busy}
              onClick={() => {
                void confirm();
              }}
            >
              {busy ? "Reiniciando…" : "Reiniciar fase"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};
