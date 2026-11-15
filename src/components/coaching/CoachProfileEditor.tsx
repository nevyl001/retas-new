import React, { useMemo, useState } from "react";
import type {
  CoachPlayPosition,
  CoachProfessionalProfile,
  CurrentCoachProfile,
} from "../../lib/coaching/types";
import { updateOwnCoachProfile } from "../../lib/coaching/coachingApi";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import { uploadJugadorAvatarCroppedFileWithinLimit } from "../../lib/rivieraJugadores/uploadAvatar";
import { JugadorAvatarCropModal } from "../jugadores/JugadorAvatarCropModal";
import { TablerIcon } from "../ui/TablerIcon";
import { Modal } from "../ui/Modal";

const POSITIONS: { id: CoachPlayPosition; label: string }[] = [
  { id: "reves", label: "Revés" },
  { id: "drive", label: "Drive" },
  { id: "ambas", label: "Ambas" },
];

const SPECIALTY_SUGGESTIONS = [
  "Técnica",
  "Táctica",
  "Ataque",
  "Transición",
  "Físico",
  "Consistencia",
  "Bandeja",
  "Volea",
  "Saque y resto",
  "Defensa",
];

const AREA_SUGGESTIONS = [
  "Golpes de fondo",
  "Juego de red",
  "Saque y resto",
  "Táctica de partido",
  "Preparación física",
  "Juego en pareja",
];

const STRENGTH_SUGGESTIONS = [
  "Corrección de técnica",
  "Lectura de juego",
  "Motivación",
  "Planificación",
  "Comunicación",
];

const METHOD_SUGGESTIONS = [
  "Entrenamiento técnico progresivo.",
  "Desarrollo táctico y lectura de juego.",
  "Corrección individual de golpes.",
  "Preparación física aplicada al pádel.",
  "Entrenamiento basado en situaciones reales de partido.",
  "Control emocional y toma de decisiones.",
  "Trabajo de posicionamiento y desplazamientos.",
];

const SKILL_SUGGESTIONS = [
  "Bandeja",
  "Víbora",
  "Volea",
  "Posicionamiento",
  "Toma de decisiones",
  "Desplazamientos",
];

function toggleItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

function applySuggestion(current: string, suggestion: string): string {
  const clean = current.trim();
  if (!clean) return suggestion;
  if (clean.includes(suggestion.replace(/\.$/, ""))) return clean;
  return `${clean} ${suggestion}`;
}

function ChipRow({
  options,
  selected,
  onToggle,
  disabled,
}: {
  options: string[];
  selected: string[];
  onToggle: (item: string) => void;
  disabled?: boolean;
}) {
  const extras = selected.filter((item) => !options.includes(item));
  return (
    <div className="coach-profile-chips">
      {options.map((item) => (
        <button
          key={item}
          type="button"
          className={`coach-prep-chip${selected.includes(item) ? " coach-prep-chip--active" : ""}`}
          aria-pressed={selected.includes(item)}
          disabled={disabled}
          onClick={() => onToggle(item)}
        >
          {item}
        </button>
      ))}
      {extras.map((item) => (
        <button
          key={item}
          type="button"
          className="coach-prep-chip coach-prep-chip--active"
          disabled={disabled}
          onClick={() => onToggle(item)}
        >
          {item} ×
        </button>
      ))}
    </div>
  );
}

export const CoachProfileEditor: React.FC<{
  open: boolean;
  profile: CurrentCoachProfile;
  onClose: () => void;
  onSaved: (next: CoachProfessionalProfile) => void;
}> = ({ open, profile, onClose, onSaved }) => {
  const allowedFuerzas = useMemo(() => {
    const fromClubs = profile.memberships.flatMap((membership) => membership.clubFuerzas ?? []);
    const unique = Array.from(new Set(fromClubs.length > 0 ? fromClubs : profile.fuerzas));
    return unique;
  }, [profile]);

  const [draft, setDraft] = useState<CoachProfessionalProfile>(profile);
  const [customSpecialty, setCustomSpecialty] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setDraft(profile);
      setError(null);
      setCustomSpecialty("");
    }
  }, [open, profile]);

  const patch = (partial: Partial<CoachProfessionalProfile>) => {
    setDraft((prev) => ({ ...prev, ...partial }));
    setError(null);
  };

  const handlePhoto = async (cropped: File) => {
    setSaving(true);
    setError(null);
    try {
      const url = await uploadJugadorAvatarCroppedFileWithinLimit(
        profile.authUserId,
        profile.id,
        cropped
      );
      patch({ fotoUrl: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la fotografía.");
    } finally {
      setSaving(false);
      setPhotoFile(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await updateOwnCoachProfile(draft);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          if (!saving) onClose();
        }}
        title="Editar mi perfil"
        className="coach-portal-modal coach-profile-modal"
        size="md"
      >
        <div className="coach-profile-editor">
          <section>
            <h3>Información personal</h3>
            <div className="coach-profile-photo-row">
              <div className="coach-identity-avatar">
                {draft.fotoUrl ? (
                  <img src={draft.fotoUrl} alt="" className="coach-identity-avatar__img" />
                ) : (
                  <div className="coach-identity-avatar__fallback">
                    {profile.nombre.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="coach-profile-photo-actions">
                <label className="coaching-btn coaching-btn--secondary">
                  {draft.fotoUrl ? "Cambiar foto" : "Subir foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    disabled={saving}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      event.target.value = "";
                      if (file) setPhotoFile(file);
                    }}
                  />
                </label>
                {draft.fotoUrl ? (
                  <button
                    type="button"
                    className="coaching-btn-ghost"
                    disabled={saving}
                    onClick={() => patch({ fotoUrl: null })}
                  >
                    Quitar foto
                  </button>
                ) : null}
              </div>
            </div>
            <p className="coach-profile-lock">
              Identificador {profile.coachCode}. No se puede modificar desde aquí.
            </p>
            <div className="coach-profile-grid">
              <label>
                Edad
                <input
                  className="coaching-input"
                  type="number"
                  min={18}
                  max={99}
                  value={draft.edad ?? ""}
                  disabled={saving}
                  onChange={(event) =>
                    patch({
                      edad: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </label>
              <label>
                Años de experiencia
                <input
                  className="coaching-input"
                  type="number"
                  min={0}
                  max={60}
                  value={draft.anosExperiencia ?? ""}
                  disabled={saving}
                  onChange={(event) =>
                    patch({
                      anosExperiencia:
                        event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
            <label>
              Presentación
              <textarea
                className="coaching-input"
                rows={3}
                maxLength={280}
                value={draft.bio ?? ""}
                disabled={saving}
                placeholder="Una frase sobre ti y tu manera de entrenar."
                onChange={(event) => patch({ bio: event.target.value })}
              />
            </label>
            <span className="coach-profile-label">Posición habitual</span>
            <div className="coach-profile-chips">
              {POSITIONS.map((position) => (
                <button
                  key={position.id}
                  type="button"
                  className={`coach-prep-chip${draft.posicionJuego === position.id ? " coach-prep-chip--active" : ""}`}
                  disabled={saving}
                  onClick={() =>
                    patch({
                      posicionJuego: draft.posicionJuego === position.id ? null : position.id,
                    })
                  }
                >
                  {position.label}
                </button>
              ))}
            </div>
            <label>
              Instagram
              <input
                className="coaching-input"
                value={draft.instagramUrl ?? ""}
                disabled={saving}
                placeholder="https://instagram.com/..."
                onChange={(event) => patch({ instagramUrl: event.target.value })}
              />
            </label>
            <label>
              Facebook
              <input
                className="coaching-input"
                value={draft.facebookUrl ?? ""}
                disabled={saving}
                placeholder="https://facebook.com/..."
                onChange={(event) => patch({ facebookUrl: event.target.value })}
              />
            </label>
            <label>
              TikTok
              <input
                className="coaching-input"
                value={draft.tiktokUrl ?? ""}
                disabled={saving}
                placeholder="https://tiktok.com/..."
                onChange={(event) => patch({ tiktokUrl: event.target.value })}
              />
            </label>
          </section>

          <section>
            <h3>Perfil deportivo</h3>
            <span className="coach-profile-label">Especialidades</span>
            <ChipRow
              options={SPECIALTY_SUGGESTIONS}
              selected={draft.especialidades}
              disabled={saving}
              onToggle={(item) => patch({ especialidades: toggleItem(draft.especialidades, item) })}
            />
            <div className="coach-prep-custom-row">
              <input
                className="coaching-input"
                value={customSpecialty}
                disabled={saving}
                placeholder="Otra especialidad"
                onChange={(event) => setCustomSpecialty(event.target.value)}
              />
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                disabled={saving || !customSpecialty.trim()}
                onClick={() => {
                  const clean = customSpecialty.trim();
                  if (!draft.especialidades.includes(clean)) {
                    patch({ especialidades: [...draft.especialidades, clean] });
                  }
                  setCustomSpecialty("");
                }}
              >
                Añadir
              </button>
            </div>
            <span className="coach-profile-label">Áreas de entrenamiento</span>
            <ChipRow
              options={AREA_SUGGESTIONS}
              selected={draft.areasEntrenamiento}
              disabled={saving}
              onToggle={(item) =>
                patch({ areasEntrenamiento: toggleItem(draft.areasEntrenamiento, item) })
              }
            />
            <span className="coach-profile-label">Fortalezas como entrenador</span>
            <ChipRow
              options={STRENGTH_SUGGESTIONS}
              selected={draft.fortalezas}
              disabled={saving}
              onToggle={(item) => patch({ fortalezas: toggleItem(draft.fortalezas, item) })}
            />
            <label>
              Certificaciones o formación
              <textarea
                className="coaching-input"
                rows={2}
                maxLength={400}
                value={draft.certificaciones ?? ""}
                disabled={saving}
                onChange={(event) => patch({ certificaciones: event.target.value })}
              />
            </label>
            <span className="coach-profile-label">Fuerzas que entrenas</span>
            {allowedFuerzas.length === 0 ? (
              <p className="coach-profile-lock">
                Tu club todavía no autoriza fuerzas de entrenamiento.
              </p>
            ) : (
              <div className="coach-profile-chips">
                {allowedFuerzas.map((fuerza) => {
                  const selected = draft.fuerzas.includes(fuerza);
                  return (
                    <button
                      key={fuerza}
                      type="button"
                      className={`coach-prep-chip${selected ? " coach-prep-chip--active" : ""}`}
                      disabled={saving}
                      onClick={() =>
                        patch({
                          fuerzas: selected
                            ? draft.fuerzas.filter((item) => item !== fuerza)
                            : [...draft.fuerzas, fuerza],
                        })
                      }
                    >
                      {JUGADOR_CATEGORIA_LABELS[fuerza as RivieraJugadorCategoria] || fuerza}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3>Metodología de entrenamiento</h3>
            <span className="coach-profile-label">Sugerencias</span>
            <ChipRow
              options={METHOD_SUGGESTIONS}
              selected={METHOD_SUGGESTIONS.filter((item) =>
                (draft.metodologiaEnsenanza ?? "").includes(item.replace(/\.$/, ""))
              )}
              disabled={saving}
              onToggle={(item) =>
                patch({
                  metodologiaEnsenanza: applySuggestion(draft.metodologiaEnsenanza ?? "", item),
                })
              }
            />
            <label>
              Mi metodología de enseñanza
              <textarea
                className="coaching-input"
                rows={2}
                maxLength={400}
                value={draft.metodologiaEnsenanza ?? ""}
                disabled={saving}
                onChange={(event) => patch({ metodologiaEnsenanza: event.target.value })}
              />
            </label>
            <label>
              Mi enfoque técnico y táctico
              <textarea
                className="coaching-input"
                rows={2}
                maxLength={400}
                value={draft.enfoqueTecnico ?? ""}
                disabled={saving}
                onChange={(event) => patch({ enfoqueTecnico: event.target.value })}
              />
            </label>
            <label>
              Objetivos que busco en mis alumnos
              <textarea
                className="coaching-input"
                rows={2}
                maxLength={400}
                value={draft.objetivosAlumnos ?? ""}
                disabled={saving}
                onChange={(event) => patch({ objetivosAlumnos: event.target.value })}
              />
            </label>
            <label>
              Cómo estructuro mis entrenamientos
              <textarea
                className="coaching-input"
                rows={2}
                maxLength={400}
                value={draft.estructuraEntrenamientos ?? ""}
                disabled={saving}
                onChange={(event) => patch({ estructuraEntrenamientos: event.target.value })}
              />
            </label>
            <span className="coach-profile-label">Habilidades que trabajo</span>
            <ChipRow
              options={SKILL_SUGGESTIONS}
              selected={draft.habilidadesPrincipales}
              disabled={saving}
              onToggle={(item) =>
                patch({ habilidadesPrincipales: toggleItem(draft.habilidadesPrincipales, item) })
              }
            />
          </section>

          {error ? (
            <div className="coach-portal-alert coach-portal-alert--error">
              <TablerIcon name="alert-circle" size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="coach-prep-modal-actions">
            <button type="button" className="coaching-btn-ghost" disabled={saving} onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="coaching-btn coaching-btn--primary"
              disabled={saving}
              onClick={handleSave}
            >
              {saving ? "Guardando..." : "Guardar perfil"}
            </button>
          </div>
        </div>
      </Modal>
      <JugadorAvatarCropModal
        open={Boolean(photoFile)}
        file={photoFile}
        playerName={profile.nombre}
        onClose={() => setPhotoFile(null)}
        onConfirm={handlePhoto}
      />
    </>
  );
};
