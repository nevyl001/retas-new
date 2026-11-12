import React, { useState } from "react";
import type {
  StudentSelfProfile,
  UpdateStudentProfileInput,
} from "../../lib/coaching/coachingApi";
import { EN_CANCHA_LABELS, EN_CANCHA_ORDER } from "../../lib/rivieraJugadores/constants";
import { getRedesPublicas, normalizeSocialUrl } from "../../lib/rivieraJugadores/jugadorRedes";
import { TablerIcon } from "../ui/TablerIcon";

/** Debe coincidir con la validación de update_student_coaching_profile (0126). */
const SOCIAL_URL_RE =
  /^https?:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}(\/\S*)?$/i;

interface StudentProfileCardProps {
  profile: StudentSelfProfile;
  onSave: (input: UpdateStudentProfileInput) => Promise<void>;
}

const EDAD_MIN = 5;
const EDAD_MAX = 99;

export const StudentProfileCard: React.FC<StudentProfileCardProps> = ({
  profile,
  onSave,
}) => {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [edad, setEdad] = useState("");
  const [enCancha, setEnCancha] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [tiktok, setTiktok] = useState("");

  const startEdit = () => {
    setEdad(profile.edad != null ? String(profile.edad) : "");
    setEnCancha(profile.enCancha ?? "");
    setInstagram(profile.instagramUrl ?? "");
    setFacebook(profile.facebookUrl ?? "");
    setTiktok(profile.tiktokUrl ?? "");
    setError(null);
    setSuccess(false);
    setEditing(true);
  };

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
        instagramUrl: socials[0].url || null,
        facebookUrl: socials[1].url || null,
        tiktokUrl: socials[2].url || null,
      });
      setEditing(false);
      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo guardar tu perfil.",
      );
    } finally {
      setSaving(false);
    }
  };

  const redes = getRedesPublicas({
    instagram_url: profile.instagramUrl,
    facebook_url: profile.facebookUrl,
    tiktok_url: profile.tiktokUrl,
  });
  const posicionLabel =
    profile.enCancha && profile.enCancha in EN_CANCHA_LABELS
      ? EN_CANCHA_LABELS[profile.enCancha as keyof typeof EN_CANCHA_LABELS]
      : null;

  return (
    <section className="coaching-student-profile" aria-label="Mi perfil">
      <div className="coaching-student-profile__header">
        <span className="coaching-student-profile__eyebrow">MI PERFIL</span>
        {!editing && (
          <button
            type="button"
            className="coaching-student-profile__edit"
            onClick={startEdit}
          >
            <TablerIcon name="pencil" size={14} />
            Editar perfil
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="coaching-student-profile__grid">
          <div className="coaching-student-profile__field">
            <dt>Edad</dt>
            <dd>{profile.edad != null ? `${profile.edad} años` : "Sin especificar"}</dd>
          </div>
          <div className="coaching-student-profile__field">
            <dt>Posición en la cancha</dt>
            <dd>{posicionLabel ?? "Sin especificar"}</dd>
          </div>
          <div className="coaching-student-profile__field coaching-student-profile__field--wide">
            <dt>Redes sociales</dt>
            <dd>
              {redes.length > 0 ? (
                <span className="coaching-student-profile__chips">
                  {redes.map((r) => (
                    <a
                      key={r.id}
                      href={r.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="coaching-student-profile__chip"
                    >
                      {r.label}
                    </a>
                  ))}
                </span>
              ) : (
                "Sin redes agregadas"
              )}
            </dd>
          </div>
        </dl>
      ) : (
        <form className="coaching-student-profile__form" onSubmit={handleSubmit}>
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
              onClick={() => setEditing(false)}
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
      )}

      {success && !editing && (
        <p className="coaching-student-profile__success" role="status">
          Perfil actualizado.
        </p>
      )}
    </section>
  );
};
