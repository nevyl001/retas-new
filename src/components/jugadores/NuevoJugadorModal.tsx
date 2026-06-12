import React, { useState } from "react";
import type {
  EnCancha,
  ManoDominante,
  RivieraJugadorCategoria,
} from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
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

interface NuevoJugadorModalProps {
  open: boolean;
  genero: RivieraJugadorGenero;
  onClose: () => void;
  onSubmit: (data: {
    nombre: string;
    email?: string;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        nombre: nombre.trim(),
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        categoria,
        edad: edad.trim() ? Number(edad) : null,
        mano_dominante: mano || null,
        en_cancha: enCancha || null,
        pais_codigo: paisCodigo || null,
        genero,
      });
      setNombre("");
      setEmail("");
      setTelefono("");
      setCategoria("3ra_fuerza");
      setEdad("");
      setMano("");
      setEnCancha("");
      setPaisCodigo("MX");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el jugador");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rj-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="rj-modal"
        role="dialog"
        aria-labelledby="rj-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="rj-modal-title">{RIVIERA_GENERO_NEW_LABEL[genero]}</h2>
        <form onSubmit={handleSubmit}>
          <div className="rj-field">
            <label htmlFor="rj-nombre">Nombre *</label>
            <input
              id="rj-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="rj-field">
            <label htmlFor="rj-email">Email</label>
            <input
              id="rj-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="rj-field">
            <label htmlFor="rj-tel">Teléfono / WhatsApp</label>
            <input
              id="rj-tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
          <div className="rj-field">
            <label htmlFor="rj-pais-new">País / bandera</label>
            <select
              id="rj-pais-new"
              className="rj-select"
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
          <div className="rj-field">
            <label htmlFor="rj-cat-new">Categoría</label>
            <select
              id="rj-cat-new"
              className="rj-select"
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
          <div className="rj-edit-grid">
            <div className="rj-field">
              <label htmlFor="rj-edad-new">Edad</label>
              <input
                id="rj-edad-new"
                type="number"
                min={5}
                max={99}
                value={edad}
                onChange={(e) => setEdad(e.target.value)}
              />
            </div>
            <div className="rj-field">
              <label htmlFor="rj-mano-new">Mano dominante</label>
              <select
                id="rj-mano-new"
                className="rj-select"
                value={mano}
                onChange={(e) => setMano(e.target.value as ManoDominante | "")}
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
            <div className="rj-field">
              <label htmlFor="rj-cancha-new">En la cancha</label>
              <select
                id="rj-cancha-new"
                className="rj-select"
                value={enCancha}
                onChange={(e) => setEnCancha(e.target.value as EnCancha | "")}
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
          {error && (
            <p style={{ color: "#ff3b30", fontSize: "0.8125rem" }}>{error}</p>
          )}
          <div className="rj-modal__actions">
            <button type="button" className="rj-btn rj-btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="rj-btn rj-btn--primary"
              disabled={saving || !nombre.trim()}
            >
              {saving ? "Guardando…" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
