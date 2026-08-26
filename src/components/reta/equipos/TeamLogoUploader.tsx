import React, { useRef, useState } from "react";
import {
  removeTeamLogoFromStorage,
  uploadTeamLogo,
} from "../../../lib/reta/uploadTeamLogo";
import { TeamLogo } from "./TeamLogo";

type TeamLogoUploaderProps = {
  organizadorId: string;
  tournamentId: string;
  teamIndex: number;
  teamName: string;
  logoUrl: string | null;
  disabled?: boolean;
  onLogoChange: (url: string | null) => void;
};

export const TeamLogoUploader: React.FC<TeamLogoUploaderProps> = ({
  organizadorId,
  tournamentId,
  teamIndex,
  teamName,
  logoUrl,
  disabled = false,
  onLogoChange,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runUpload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const url = await uploadTeamLogo(
        organizadorId,
        tournamentId,
        teamIndex,
        file
      );
      onLogoChange(url);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo subir el logo";
      setError(msg);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void runUpload(file);
  };

  const onRemove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeTeamLogoFromStorage(organizadorId, tournamentId, teamIndex);
      onLogoChange(null);
    } catch {
      onLogoChange(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reta-eq-logo-uploader">
      <TeamLogo logoUrl={logoUrl} teamName={teamName} size="lg" />
      <div className="reta-eq-logo-uploader__actions">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="reta-eq-logo-uploader__file"
          disabled={disabled || busy || !organizadorId}
          onChange={onFileChange}
          aria-label={`Subir logo de ${teamName}`}
        />
        <button
          type="button"
          className="reta-eq-logo-uploader__btn"
          disabled={disabled || busy || !organizadorId}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Subiendo…" : logoUrl ? "Reemplazar" : "Subir logo"}
        </button>
        {logoUrl ? (
          <button
            type="button"
            className="reta-eq-logo-uploader__btn reta-eq-logo-uploader__btn--ghost"
            disabled={disabled || busy}
            onClick={() => void onRemove()}
            aria-label={`Eliminar logo de ${teamName}`}
          >
            Eliminar
          </button>
        ) : null}
      </div>
      {error ? <p className="reta-eq-logo-uploader__error">{error}</p> : null}
      <p className="reta-eq-logo-uploader__hint">Logo del equipo · 1:1 · PNG/JPEG/WebP</p>
    </div>
  );
};
