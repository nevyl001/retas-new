import React, { useState } from "react";
import type { TorneoExpressEventoLogoSource } from "../../lib/torneoExpress/types";
import { Button, Input } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import "./te-evento-detalle.css";

const LOGO_SOURCE_OPTIONS: ReadonlyArray<{
  value: TorneoExpressEventoLogoSource;
  label: string;
}> = [
  { value: "club", label: "Logo del club (upgrade / Riviera)" },
  { value: "flyer", label: "Flyer del evento" },
];

export type EventoBrandingFormProps = {
  logoSource: TorneoExpressEventoLogoSource;
  onLogoSourceChange: (value: TorneoExpressEventoLogoSource) => void;
  flyerUrl: string;
  onFlyerUrlChange: (value: string) => void;
  /** Ref del <input type="file"> oculto: el botón «Subir flyer» lo abre. */
  fileInputRef: React.RefObject<HTMLInputElement>;
  uploading: boolean;
  /** No se puede subir (p. ej. sin usuario). */
  uploadDisabled: boolean;
  onFileSelected: (file: File | null) => void;
  /** Hay cambios sin guardar. Solo informa. */
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
};

type PreviewProps = {
  logoSource: TorneoExpressEventoLogoSource;
  flyerUrl: string;
};

/** Vista previa del flyer: imagen completa (contain) sobre su propio fondo difuminado. */
const BrandingPreview: React.FC<PreviewProps> = ({ logoSource, flyerUrl }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = flyerUrl.trim();
  const wantsFlyer = logoSource === "flyer";
  const showImage = wantsFlyer && Boolean(url) && failedUrl !== url;

  let empty: { icon: string; title: string; text: string } | null = null;
  if (!showImage) {
    if (!wantsFlyer) {
      empty = {
        icon: "photo",
        title: "Se usa el logo del club",
        text: "Elige «Flyer del evento» para mostrar una imagen propia.",
      };
    } else if (url && failedUrl === url) {
      empty = {
        icon: "photo-off",
        title: "No se pudo cargar la imagen",
        text: "Revisa la URL o sube el archivo de nuevo.",
      };
    } else {
      empty = {
        icon: "photo",
        title: "Sin flyer todavía",
        text: "Sube una imagen o pega una URL para verla aquí.",
      };
    }
  }

  return (
    <section className="te-evd-brand__preview" aria-label="Vista previa">
      <h3 className="te-evd-brand__preview-title">Vista previa</h3>
      <div className="te-evd-brand__stage">
        {showImage ? (
          <>
            {/* Fondo difuminado decorativo: rellena el área sin recortar el flyer. */}
            <img
              className="te-evd-brand__stage-bg"
              src={url}
              alt=""
              aria-hidden
              decoding="async"
            />
            <img
              className="te-evd-brand__flyer"
              src={url}
              alt="Vista previa del flyer"
              decoding="async"
              onError={() => setFailedUrl(url)}
            />
          </>
        ) : empty ? (
          <div className="te-evd-brand__empty">
            <TablerIcon name={empty.icon} size={28} />
            <p className="te-evd-brand__empty-title">{empty.title}</p>
            <p className="te-evd-brand__empty-text">{empty.text}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
};

/**
 * Branding del evento: configuración a la izquierda, vista previa a la derecha.
 * Solo presentación; la subida, la URL, el origen y el guardado viven en `EventoDetalle`.
 */
export const EventoBrandingForm: React.FC<EventoBrandingFormProps> = ({
  logoSource,
  onLogoSourceChange,
  flyerUrl,
  onFlyerUrlChange,
  fileInputRef,
  uploading,
  uploadDisabled,
  onFileSelected,
  dirty,
  saving,
  onSave,
}) => (
  <div className="te-evd-brand">
    <fieldset className="te-evd-rule-group te-evd-brand__config">
      <legend className="te-evd-rule-group__legend">Origen del logo</legend>
      {LOGO_SOURCE_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={`te-evd-rule${logoSource === opt.value ? " te-evd-rule--selected" : ""}`}
        >
          <input
            type="radio"
            name="logo_source"
            className="te-evd-rule__input"
            checked={logoSource === opt.value}
            onChange={() => onLogoSourceChange(opt.value)}
          />
          <span className="te-evd-rule__body">
            <span className="te-evd-rule__label">{opt.label}</span>
          </span>
        </label>
      ))}
      {logoSource === "flyer" ? (
        <div className="te-evd-brand__tools">
          <div className="te-evd-brand__upload">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              className="te-evd-brand__file"
              disabled={uploading}
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="te-evd-brand__upload-btn"
              loading={uploading}
              disabled={uploading || uploadDisabled}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Subiendo…" : "Subir flyer"}
            </Button>
            <span className="te-evd-brand__hint">JPEG, PNG o WebP · máx. 5 MB</span>
          </div>
          <label className="te-evd-brand__field">
            <span className="te-evd-brand__field-label">O pega una URL</span>
            <Input
              value={flyerUrl}
              onChange={(e) => onFlyerUrlChange(e.target.value)}
              placeholder="https://…"
            />
          </label>
        </div>
      ) : null}
    </fieldset>

    <BrandingPreview logoSource={logoSource} flyerUrl={flyerUrl} />

    <div className="te-evd-savebar te-evd-brand__save">
      {dirty ? (
        <p className="te-evd-dirty" role="status">
          Tienes cambios sin guardar
        </p>
      ) : null}
      <Button
        type="button"
        variant="primary"
        size="sm"
        className="te-evd-savebar__btn"
        loading={saving}
        disabled={saving || uploading}
        onClick={onSave}
      >
        {saving ? "Guardando…" : "Guardar branding"}
      </Button>
    </div>
  </div>
);
