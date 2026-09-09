import React, { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import {
  AVATAR_MIN_SIDE_PX,
  avatarBlobToFile,
  cropImageAreaToJpegBlob,
  meetsAvatarMinDimensions,
  readImageDimensions,
} from "../../lib/rivieraJugadores/cropAvatarImage";
import { playerAvatarHashTone, splitPlayerDisplayName } from "../liga/jornada-public/ligaJornadaMatchNames";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import "./jugador-avatar-crop.css";

interface JugadorAvatarCropModalProps {
  open: boolean;
  file: File | null;
  playerName: string;
  onClose: () => void;
  onConfirm: (croppedFile: File) => void;
}

function SplitVsMiniPreview({
  previewUrl,
  playerName,
}: {
  previewUrl: string | null;
  playerName: string;
}) {
  const { primary, secondary } = splitPlayerDisplayName(playerName);
  const tone = playerAvatarHashTone(playerName);

  return (
    <div className="rj-avatar-crop__preview-block">
      <p className="rj-avatar-crop__preview-kicker">Vista en resultados</p>
      <div
        className="rj-avatar-crop__split-preview"
        style={{ ["--liga-panel-bg" as string]: tone.background }}
      >
        <div className="rj-avatar-crop__split-preview-panel">
          {previewUrl ? (
            <img
              className="rj-avatar-crop__split-preview-photo"
              src={previewUrl}
              alt=""
            />
          ) : null}
          <span className="rj-avatar-crop__split-preview-scrim" aria-hidden />
          <span className="rj-avatar-crop__split-preview-name">
            {secondary ? `${primary} ${secondary}` : primary}
          </span>
        </div>
      </div>
    </div>
  );
}

export const JugadorAvatarCropModal: React.FC<JugadorAvatarCropModalProps> = ({
  open,
  file,
  playerName,
  onClose,
  onConfirm,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!open || !file) {
      setImageSrc(null);
      setPreviewUrl(null);
      setError(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const dims = await readImageDimensions(file);
        if (cancelled) return;
        if (!meetsAvatarMinDimensions(dims.width, dims.height)) {
          setError(
            `La imagen debe medir al menos ${AVATAR_MIN_SIDE_PX}×${AVATAR_MIN_SIDE_PX}px para verse nítida en resultados.`
          );
          return;
        }
        const url = URL.createObjectURL(file);
        setImageSrc(url);
        setError(null);
      } catch {
        if (!cancelled) setError("No se pudo leer la imagen seleccionada.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, file]);

  // Revocar cada blob por separado: si ambos viven en el mismo effect,
  // un cambio de previewUrl revoca también imageSrc y "Usar recorte" falla
  // con "No se pudo leer la imagen".
  useEffect(() => {
    return () => {
      if (imageSrc?.startsWith("blob:")) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  useEffect(() => {
    if (!imageSrc || !croppedAreaPixels) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void cropImageAreaToJpegBlob(imageSrc, croppedAreaPixels, 480, 0.88)
        .then((blob) => {
          if (cancelled) return;
          setPreviewUrl((prev) => {
            if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        })
        .catch(() => {
          if (!cancelled) setPreviewUrl(null);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [imageSrc, croppedAreaPixels, crop, zoom]);

  const handleConfirm = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setProcessing(true);
    setError(null);
    try {
      const blob = await cropImageAreaToJpegBlob(imageSrc, croppedAreaPixels);
      onConfirm(avatarBlobToFile(blob));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al recortar la imagen");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Recorta tu foto de perfil"
      size="md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={processing}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleConfirm()}
            disabled={!imageSrc || !croppedAreaPixels || processing}
          >
            {processing ? "Guardando…" : "Usar recorte"}
          </Button>
        </>
      }
    >
      {error ? <p className="rj-avatar-crop__error">{error}</p> : null}
      {imageSrc ? (
        <>
          <div className="rj-avatar-crop__cropper-wrap">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              objectFit="contain"
            />
          </div>
          <div className="rj-avatar-crop__controls">
            <label className="rj-avatar-crop__zoom-label">
              <span>Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
          </div>
          <SplitVsMiniPreview previewUrl={previewUrl} playerName={playerName} />
        </>
      ) : null}
    </Modal>
  );
};
