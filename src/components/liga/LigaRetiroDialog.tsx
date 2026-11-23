import React from "react";
import { createPortal } from "react-dom";

export const LIGA_DELETE_CONFIRM_PHRASE = "ELIMINAR";

export const LigaRetiroDialog: React.FC<{
  mode: "delete" | "archive";
  nombre: string;
  busy: boolean;
  confirmDraft: string;
  onConfirmDraft: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({
  mode,
  nombre,
  busy,
  confirmDraft,
  onConfirmDraft,
  onCancel,
  onConfirm,
}) => {
  if (typeof document === "undefined") return null;
  const archive = mode === "archive";
  const phraseOk =
    confirmDraft.trim().toUpperCase() === LIGA_DELETE_CONFIRM_PHRASE;

  return createPortal(
    <div
      className="liga-gestionar-modal-backdrop"
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className={`liga-gestionar-share-modal liga-retiro-modal${
          archive ? "" : " liga-gestionar-danger-modal"
        }`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="liga-retiro-title"
        aria-describedby="liga-retiro-lead"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="liga-gestionar-share-modal__close"
          aria-label="Cerrar"
          disabled={busy}
          onClick={onCancel}
        >
          ×
        </button>
        <h2 id="liga-retiro-title" className="liga-gestionar-share-modal__title">
          {archive ? "No es posible eliminar esta liga" : "Eliminar liga"}
        </h2>
        <p id="liga-retiro-lead" className="liga-gestionar-share-modal__lead">
          {archive ? (
            <>
              <strong>{nombre}</strong> ya tiene partidos registrados. Para
              conservar sus resultados y el historial de los jugadores, puedes
              archivarla.
            </>
          ) : (
            <>
              Se eliminará <strong>{nombre}</strong>. Esta liga no tiene
              jornadas ni partidos. Esta acción no se puede deshacer.
            </>
          )}
        </p>
        {archive ? null : (
          <>
            <label
              className="liga-gestionar-danger-modal__label"
              htmlFor="liga-delete-confirm-input"
            >
              Escribe <strong>{LIGA_DELETE_CONFIRM_PHRASE}</strong> para
              confirmar
            </label>
            <input
              id="liga-delete-confirm-input"
              name="liga-delete-confirm"
              className="liga-gestionar-danger-modal__input"
              type="text"
              value={confirmDraft}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy}
              aria-label={`Confirmar escribiendo ${LIGA_DELETE_CONFIRM_PHRASE}`}
              onChange={(event) => onConfirmDraft(event.target.value)}
            />
          </>
        )}
        <div className="liga-gestionar-share-modal__actions liga-gestionar-danger-modal__actions">
          <button
            type="button"
            className="liga-gestionar-share-modal__btn liga-gestionar-share-modal__btn--secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={`liga-gestionar-share-modal__btn${
              archive
                ? " liga-gestionar-share-modal__btn--primary"
                : " liga-gestionar-danger-modal__confirm"
            }`}
            disabled={busy || (!archive && !phraseOk)}
            onClick={onConfirm}
          >
            {busy
              ? archive
                ? "Archivando…"
                : "Eliminando…"
              : archive
                ? "Archivar liga"
                : "Eliminar liga"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
