import React, { useEffect, useState } from "react";
import type {
  StudentSelfProfile,
  UpdateStudentProfileInput,
} from "../../lib/coaching/coachingApi";
import { EN_CANCHA_LABELS, EN_CANCHA_ORDER } from "../../lib/rivieraJugadores/constants";
import { normalizeSocialUrl } from "../../lib/rivieraJugadores/jugadorRedes";

/** Debe coincidir con la validación de update_student_coaching_profile. */
const SOCIAL_URL_RE =
  /^https?:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(\/\S*)?$/i;

const EDAD_MIN = 5;
const EDAD_MAX = 99;
export const STUDENT_ABOUT_MAX = 200;

interface StudentProfileCardProps {
  open: boolean;
  profile: StudentSelfProfile;
  onClose: () => void;
  onSave: (input: UpdateStudentProfileInput) => Promise<void>;
  onChangePhoto?: () => void;
  photoUploading?: boolean;
}

export const StudentProfileCard: React.FC<StudentProfileCardProps> = ({
  open,
  profile,
  onClose,
  onSave,
  onChangePhoto,
  photoUploading = false,
}) => {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [edad, setEdad] = useState("");
  const [enCancha, setEnCancha] = useState("");
  const [sobreMi, setSobreMi] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [tiktok, setTiktok] = useState("");

  useEffect(() => {
    if (!open) return;
    setEdad(profile.edad != null ? String(profile.edad) : "");
    setEnCancha(profile.enCancha ?? "");
    setSobreMi(profile.sobreMi ?? "");
    setInstagram(profile.instagramUrl ?? "");
    setFacebook(profile.facebookUrl ?? "");
    setTiktok(profile.tiktokUrl ?? "");
    setError(null);
  }, [open, profile]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let edadValue: number | null = null;
    if (edad.trim()) {
      const n = Number(edad);
      if (!Number.isInteger(n) || n < EDAD_MIN || n > EDAD_MAX) {
        setError(`La edad debe ser un número entre ${EDAD_MIN} y ${EDAD_MAX}.`);
        return;
      }
      edadValue = n;
    }

    const about = sobreMi.trim();
    if (about.length > STUDENT_ABOUT_MAX) {
      setError(`La descripción puede tener hasta ${STUDENT_ABOUT_MAX} caracteres.`);
      return;
    }

    const socials = [
      { label: "Instagram", value: instagram },
      { label: "Facebook", value: facebook },
      { label: "TikTok", value: tiktok },
    ].map((s) => ({ ...s, url: s.value.trim() ? normalizeSocialUrl(s.value) : "" }));
    const badSocial = socials.find((s) => s.url && !SOCIAL_URL_RE.test(s.url));
    if (badSocial) {
      setError(
        `El enlace de ${badSocial.label} no es válido. Ejemplo: ${badSocial.label.toLowerCase()}.com/tu_usuario`,
      );
      return;
    }

    setSaving(true);
    try {
      await onSave({
        edad: edadValue,
        enCancha: enCancha || null,
        sobreMi: about || null,
        instagramUrl: socials[0].url || null,
        facebookUrl: socials[1].url || null,
        tiktokUrl: socials[2].url || null,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar tu perfil.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="student-profile-dialog">
      <button
        type="button"
        className="student-profile-dialog__backdrop"
        aria-label="Cerrar"
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div
        className="student-profile-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-profile-title"
      >
        <h2 id="student-profile-title">Editar perfil</h2>
        <form className="coaching-student-profile__form" onSubmit={handleSubmit}>
          <p className="student-profile-dialog__section">Información personal</p>
          {onChangePhoto ? (
            <button
              type="button"
              className="coaching-student-hero__photo-btn"
              onClick={onChangePhoto}
              disabled={saving || photoUploading}
            >
              {photoUploading ? "Subiendo…" : "Cambiar foto"}
            </button>
          ) : null}

          <label className="coaching-student-profile__label">
            Edad
            <input
              type="number"
              inputMode="numeric"
              min={EDAD_MIN}
              max={EDAD_MAX}
              className="coaching-input"
              value={edad}
              onChange={(e) => setEdad(e.target.value)}
              disabled={saving}
            />
          </label>

          <fieldset className="coaching-student-profile__label coaching-student-profile__fieldset">
            <legend>Posición en la cancha</legend>
            <div className="coaching-student-profile__segmented" role="radiogroup">
              {EN_CANCHA_ORDER.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={enCancha === opt}
                  className={
                    "coaching-student-profile__segment" +
                    (enCancha === opt ? " is-active" : "")
                  }
                  onClick={() => setEnCancha(enCancha === opt ? "" : opt)}
                  disabled={saving}
                >
                  {EN_CANCHA_LABELS[opt]}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="coaching-student-profile__label">
            Sobre mí
            <textarea
              className="coaching-input student-profile-dialog__about"
              rows={3}
              maxLength={STUDENT_ABOUT_MAX}
              placeholder="Cuéntanos brevemente sobre ti y tu pasión por el pádel."
              value={sobreMi}
              onChange={(e) => setSobreMi(e.target.value.slice(0, STUDENT_ABOUT_MAX))}
              disabled={saving}
            />
            <span className="student-profile-dialog__count">
              {sobreMi.length}/{STUDENT_ABOUT_MAX}
            </span>
          </label>

          <p className="student-profile-dialog__section">Redes sociales</p>
          <label className="coaching-student-profile__label">
            Instagram
            <input
              type="text"
              className="coaching-input"
              placeholder="instagram.com/tu_usuario"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="coaching-student-profile__label">
            Facebook
            <input
              type="text"
              className="coaching-input"
              placeholder="facebook.com/tu.perfil"
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="coaching-student-profile__label">
            TikTok
            <input
              type="text"
              className="coaching-input"
              placeholder="tiktok.com/@tu_usuario"
              value={tiktok}
              onChange={(e) => setTiktok(e.target.value)}
              disabled={saving}
            />
          </label>

          {error && (
            <p className="coaching-student-profile__error" role="alert">
              {error}
            </p>
          )}

          <div className="coaching-student-profile__actions">
            <button
              type="button"
              className="coaching-btn coaching-btn--secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="coaching-btn coaching-btn--primary"
              disabled={saving}
            >
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
