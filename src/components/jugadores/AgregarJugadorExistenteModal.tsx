import React, { useCallback, useEffect, useState } from "react";
import { useOrganizerDisplayName } from "../../club-experience";
import {
  addOrganizerMembershipByRivieraId,
  mapPlayerMembershipUiError,
  normalizeRivieraIdInput,
  resolvePlayerByRivieraId,
} from "../../lib/rivieraJugadores/playerMembership";
import type { RivieraIdResolveResult } from "../../lib/rivieraJugadores/playerMembership.types";

import type { AddOrganizerMembershipResult } from "../../lib/rivieraJugadores/playerMembership.types";

interface AgregarJugadorExistenteModalProps {
  open: boolean;
  onClose: () => void;
  onAdded: (result: AddOrganizerMembershipResult) => Promise<void>;
}

function RegistrationOrganizerLabel({
  organizerId,
}: {
  organizerId: string | null;
}) {
  const name = useOrganizerDisplayName(organizerId ?? undefined);
  if (!organizerId) {
    return <span className="rj-membership-preview__muted">No disponible</span>;
  }
  return <span>{name || "Organizador de Registro"}</span>;
}

export const AgregarJugadorExistenteModal: React.FC<
  AgregarJugadorExistenteModalProps
> = ({ open, onClose, onAdded }) => {
  const [rivieraIdInput, setRivieraIdInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<RivieraIdResolveResult | null>(null);

  const resetState = useCallback(() => {
    setRivieraIdInput("");
    setPreview(null);
    setError(null);
    setSuccess(null);
    setResolving(false);
    setAdding(false);
  }, []);

  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  if (!open) return null;

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleResolve = async () => {
    setError(null);
    setSuccess(null);
    setPreview(null);

    const normalized = normalizeRivieraIdInput(rivieraIdInput);
    if (!normalized) {
      setError(
        "Formato inválido. Ingresa el Riviera ID exacto, por ejemplo RIV-00000001."
      );
      return;
    }

    setResolving(true);
    try {
      const result = await resolvePlayerByRivieraId(normalized);
      if (!result?.found) {
        setError(
          "No encontramos un jugador con ese Riviera ID. Verifica que esté escrito exactamente."
        );
        return;
      }
      setPreview(result);
      setRivieraIdInput(normalized);
    } catch (e) {
      setError(mapPlayerMembershipUiError(e));
    } finally {
      setResolving(false);
    }
  };

  const handleAdd = async () => {
    if (!preview?.found || !preview.rivieraId) return;

    if (preview.alreadyMember) {
      setError("Este jugador ya pertenece a tu organizador.");
      return;
    }

    setAdding(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await addOrganizerMembershipByRivieraId(preview.rivieraId);

      if (!result) {
        setError("No se pudo agregar el jugador. Intenta de nuevo.");
        return;
      }

      if (result.alreadyMember) {
        setError("Este jugador ya pertenece a tu organizador.");
        return;
      }

      await onAdded(result);

      const actionLabel = result.reactivated
        ? "reactivado"
        : result.created
          ? "agregado"
          : "confirmado";

      setSuccess(
        `${result.displayName} (${result.rivieraId}) fue ${actionLabel} a tu organizador.`
      );

      window.setTimeout(() => {
        handleClose();
      }, 1400);
    } catch (e) {
      setError(mapPlayerMembershipUiError(e));
    } finally {
      setAdding(false);
    }
  };

  const canAdd =
    preview?.found === true &&
    !preview.alreadyMember &&
    !adding &&
    !success;

  return (
    <div className="rj-modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="rj-modal rj-modal--wide"
        role="dialog"
        aria-labelledby="rj-add-existing-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rj-add-existing-title">Agregar jugador existente</h2>
        <p className="rj-modal__sub">
          Ingresa el Riviera ID exacto del jugador. No se busca por nombre,
          correo ni teléfono.
        </p>

        <div className="rj-field">
          <label htmlFor="rj-riviera-id">Riviera ID</label>
          <input
            id="rj-riviera-id"
            value={rivieraIdInput}
            onChange={(e) => {
              setRivieraIdInput(e.target.value.toUpperCase());
              setPreview(null);
              setError(null);
              setSuccess(null);
            }}
            placeholder="RIV-00000001"
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
          <p className="rj-field__hint">Formato exacto: RIV- seguido de 8 dígitos.</p>
        </div>

        <div className="rj-modal__actions rj-modal__actions--compact">
          <button
            type="button"
            className="rj-btn rj-btn--ghost"
            onClick={handleClose}
            disabled={adding}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rj-btn rj-btn--primary"
            onClick={() => void handleResolve()}
            disabled={resolving || adding || !rivieraIdInput.trim()}
          >
            {resolving ? "Buscando…" : "Buscar jugador"}
          </button>
        </div>

        {preview?.found ? (
          <div className="rj-membership-preview" role="status">
            <p className="rj-membership-preview__title">Vista previa</p>
            <dl className="rj-membership-preview__list">
              <div>
                <dt>Nombre</dt>
                <dd>{preview.displayName ?? "—"}</dd>
              </div>
              <div>
                <dt>Riviera ID</dt>
                <dd>{preview.rivieraId}</dd>
              </div>
              <div>
                <dt>Organizador de Registro</dt>
                <dd>
                  <RegistrationOrganizerLabel
                    organizerId={preview.registrationOrganizerId}
                  />
                </dd>
              </div>
              <div>
                <dt>Estado en tu club</dt>
                <dd>
                  {preview.alreadyMember ? (
                    <span className="rj-membership-preview__badge rj-membership-preview__badge--ok">
                      Ya pertenece a tu organizador
                    </span>
                  ) : (
                    <span className="rj-membership-preview__badge">
                      Disponible para agregar
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              className="rj-btn rj-btn--primary rj-membership-preview__add"
              onClick={() => void handleAdd()}
              disabled={!canAdd}
            >
              {adding
                ? "Agregando…"
                : preview.alreadyMember
                  ? "Ya agregado"
                  : "Agregar a mi organizador"}
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="rj-membership-preview__error" role="alert">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="rj-membership-preview__success" role="status">
            {success}
          </p>
        ) : null}
      </div>
    </div>
  );
};
