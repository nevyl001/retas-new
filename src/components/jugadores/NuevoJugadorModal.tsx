import React, { useState } from "react";
import type {
  EnCancha,
  ManoDominante,
  RivieraJugadorCategoria,
} from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
  RIVIERA_GENERO_LABELS,
  RIVIERA_GENERO_NEW_LABEL,
} from "../../lib/rivieraJugadores/genero";
import {
  EN_CANCHA_LABELS,
  EN_CANCHA_ORDER,
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
  MANO_DOMINANTE_LABELS,
} from "../../lib/rivieraJugadores/constants";
import { PAISES_RIVIERA, paisSelectLabel } from "../../lib/rivieraJugadores/paises";
import {
  EMAIL_INVALID_MESSAGE,
  EMAIL_REQUIRED_MESSAGE,
  isValidEmailFormat,
  normalizeEmailInput,
} from "../../lib/rivieraJugadores/emailValidation";
import { Button, Input } from "../ui";

interface NuevoJugadorModalProps {
  open: boolean;
  genero: RivieraJugadorGenero;
  onClose: () => void;
  onSubmit: (data: {
    nombre: string;
    email: string;
    telefono?: string;
    categoria: RivieraJugadorCategoria;
    edad?: number | null;
    mano_dominante?: ManoDominante | null;
    en_cancha?: EnCancha | null;
    pais_codigo?: string | null;
    genero: RivieraJugadorGenero;
  }) => Promise<void>;
}

export const NuevoJugadorModal: React.FC<NuevoJugadorModalProps> = ({
  open,
  genero,
  onClose,
  onSubmit,
}) => {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [categoria, setCategoria] = useState<RivieraJugadorCategoria>("3ra_fuerza");
  const [edad, setEdad] = useState("");
  const [mano, setMano] = useState<ManoDominante | "">("");
  const [enCancha, setEnCancha] = useState<EnCancha | "">("");
  const [paisCodigo, setPaisCodigo] = useState("MX");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resetForm = () => {
    setNombre("");
    setEmail("");
    setTelefono("");
    setCategoria("3ra_fuerza");
    setEdad("");
    setMano("");
    setEnCancha("");
    setPaisCodigo("MX");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    const normalizedEmail = normalizeEmailInput(email);
    if (!normalizedEmail) {
      setError(EMAIL_REQUIRED_MESSAGE);
      return;
    }
    if (!isValidEmailFormat(normalizedEmail)) {
      setError(EMAIL_INVALID_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        email: normalizedEmail,
        telefono: telefono.trim() || undefined,
        categoria,
        edad: edad.trim() ? Number(edad) : null,
        mano_dominante: mano || null,
        en_cancha: enCancha || null,
        pais_codigo: paisCodigo || null,
        genero,
      });
      resetForm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el jugador");
    } finally {
      setSaving(false);
    }
  };

  const ramaClass =
    genero === "F" ? "rj-modal--new-player-f" : "rj-modal--new-player-m";

  return (
    <div className="rj-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className={`rj-modal rj-modal--new-player ${ramaClass}`}
        role="dialog"
        aria-labelledby="rj-modal-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rj-new-player__header">
          <p className="rj-new-player__kicker">{RIVIERA_GENERO_LABELS[genero]}</p>
          <h2 id="rj-modal-title" className="rj-new-player__title">
            {RIVIERA_GENERO_NEW_LABEL[genero]}
          </h2>
          <p className="rj-new-player__lead">
            Completa el perfil para el registro y el ranking del club.
          </p>
        </header>

        <form className="rj-new-player__form" onSubmit={handleSubmit}>
          <section className="rj-new-player__section" aria-label="Identidad">
            <Input
              id="rj-nombre"
              label="Nombre *"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              required
            />
            <Input
              id="rj-email"
              label="Email *"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="rj-tel"
              label="Teléfono / WhatsApp"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </section>

          <section className="rj-new-player__section" aria-label="Competencia">
            <div className="rj-new-player__row rj-new-player__row--2">
              <div className="riviera-field">
                <label className="riviera-label" htmlFor="rj-pais-new">
                  País / bandera
                </label>
                <select
                  id="rj-pais-new"
                  className="riviera-input"
                  value={paisCodigo}
                  onChange={(e) => setPaisCodigo(e.target.value)}
                >
                  <option value="">— Sin especificar —</option>
                  {PAISES_RIVIERA.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {paisSelectLabel(p)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="riviera-field">
                <label className="riviera-label" htmlFor="rj-cat-new">
                  Categoría
                </label>
                <select
                  id="rj-cat-new"
                  className="riviera-input"
                  value={categoria}
                  onChange={(e) =>
                    setCategoria(e.target.value as RivieraJugadorCategoria)
                  }
                >
                  {JUGADOR_CATEGORIAS_ORDER.map((n) => (
                    <option key={n} value={n}>
                      {JUGADOR_CATEGORIA_LABELS[n]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rj-new-player__row rj-new-player__row--meta">
              <Input
                id="rj-edad-new"
                label="Edad"
                type="number"
                min={5}
                max={99}
                value={edad}
                onChange={(e) => setEdad(e.target.value)}
              />
              <div className="riviera-field">
                <label className="riviera-label" htmlFor="rj-mano-new">
                  Mano
                </label>
                <select
                  id="rj-mano-new"
                  className="riviera-input"
                  value={mano}
                  onChange={(e) => setMano(e.target.value as ManoDominante | "")}
                  title="Mano dominante"
                  aria-label="Mano dominante"
                >
                  <option value="">—</option>
                  {(Object.keys(MANO_DOMINANTE_LABELS) as ManoDominante[]).map(
                    (m) => (
                      <option key={m} value={m}>
                        {MANO_DOMINANTE_LABELS[m]}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div className="riviera-field">
                <label className="riviera-label" htmlFor="rj-cancha-new">
                  Cancha
                </label>
                <select
                  id="rj-cancha-new"
                  className="riviera-input"
                  value={enCancha}
                  onChange={(e) =>
                    setEnCancha(e.target.value as EnCancha | "")
                  }
                  title="Posición en la cancha"
                  aria-label="Posición en la cancha"
                >
                  <option value="">—</option>
                  {EN_CANCHA_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {EN_CANCHA_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {error ? (
            <p className="riviera-field-error rj-new-player__error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="rj-modal__actions rj-new-player__actions">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!nombre.trim() || !email.trim()}
              loading={saving}
            >
              {saving ? "Guardando…" : "Crear perfil"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
