import React, { useRef } from "react";
import { playerAvatarHashTone, splitPlayerDisplayName } from "../liga/jornada-public/ligaJornadaMatchNames";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import "./jugador-avatar-crop.css";

interface JugadorAvatarPhotoWelcomeModalProps {
  open: boolean;
  playerName: string;
  onSkip: () => void;
  onPickFile: (file: File) => void;
}

export const JugadorAvatarPhotoWelcomeModal: React.FC<
  JugadorAvatarPhotoWelcomeModalProps
> = ({ open, playerName, onSkip, onPickFile }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const { primary, secondary } = splitPlayerDisplayName(playerName);
  const tone = playerAvatarHashTone(playerName);

  return (
    <Modal
      open={open}
      onClose={onSkip}
      title="Sube tu foto de perfil"
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onSkip}>
            Omitir por ahora
          </Button>
          <Button type="button" variant="primary" onClick={() => fileRef.current?.click()}>
            Elegir foto
          </Button>
        </>
      }
    >
      <p className="rj-avatar-photo-welcome__lead">
        Así se verá en las tarjetas de partido publicadas. Recortaremos la imagen
        en cuadrado antes de guardarla.
      </p>
      <div
        className="rj-avatar-crop__split-preview"
        style={{ ["--liga-panel-bg" as string]: tone.background }}
      >
        <div className="rj-avatar-crop__split-preview-panel">
          <span className="rj-avatar-crop__split-preview-scrim" aria-hidden />
          <span className="rj-avatar-crop__split-preview-name">
            {secondary ? `${primary} ${secondary}` : primary}
          </span>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = "";
        }}
      />
    </Modal>
  );
};
