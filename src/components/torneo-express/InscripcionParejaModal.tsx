import React, { useEffect, useState } from "react";
import { Button } from "../ui";
import {
  isValidRealEmail,
  updatePlayerNotificationContact,
  type UpdatedPlayerContact,
} from "../../services/torneoExpressNotificacionesService";

export interface InscripcionParejaModalProps {
  open: boolean;
  playerId: string;
  playerName: string;
  initialEmail?: string | null;
  onClose: () => void;
  onSaved?: (player: UpdatedPlayerContact) => void;
}

export const InscripcionParejaModal: React.FC<InscripcionParejaModalProps> = ({
  open,
  playerId,
  playerName,
  initialEmail = "",
  onClose,
  onSaved,
}) => {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [optInEmail, setOptInEmail] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmail(initialEmail ?? "");
    setError("");
  }, [open, initialEmail]);

  if (!open) return null;

  const save = async () => {
    const emailTrim = email.trim();

    if (emailTrim && !isValidRealEmail(emailTrim)) {
      setError("Email inválido o @padel.local no permitido.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const updated = await updatePlayerNotificationContact(playerId, {
        email: emailTrim || null,
        notif_opt_in_email: optInEmail,
      });
      onSaved?.(updated);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar contacto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="te-inscripcion-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="te-inscripcion-modal"
        role="dialog"
        aria-labelledby="te-inscripcion-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="te-inscripcion-modal__head">
          <h2 id="te-inscripcion-modal-title">Contacto · {playerName}</h2>
          <button type="button" className="te-inscripcion-modal__close" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="te-inscripcion-modal__body">
          {error ? <p className="te-error">{error}</p> : null}

          <label className="te-inscripcion-modal__field">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@real.com"
            />
          </label>

          <label className="te-inscripcion-modal__check">
            <input
              type="checkbox"
              checked={optInEmail}
              onChange={(e) => setOptInEmail(e.target.checked)}
            />
            Recibir notificaciones por email
          </label>
        </div>

        <footer className="te-inscripcion-modal__foot">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" loading={saving} onClick={() => void save()}>
            Guardar contacto
          </Button>
        </footer>
      </div>
    </div>
  );
};
