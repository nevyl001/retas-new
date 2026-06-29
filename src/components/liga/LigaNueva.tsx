import React, { useState } from "react";
import { useClubModeEyebrow } from "../../club-experience";
import { navigateToAppHome } from "../../lib/appRouting";
import type { LigaModalidad, LigaVueltas } from "../../lib/liga/types";
import { createLiga } from "../../services/ligaService";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { ligaGestionarPath, navigateLiga } from "./ligaNav";
import { LigaPageShell } from "./LigaPageShell";
import "./liga-page.css";

export const LigaNueva: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [canchas, setCanchas] = useState(3);
  const [modalidad, setModalidad] = useState<LigaModalidad>("individual_rotativo");
  const [vueltas, setVueltas] = useState<LigaVueltas>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const liga = await createLiga({
        nombre: nombre.trim(),
        fecha_inicio: fechaInicio || null,
        canchas_disponibles: canchas,
        modalidad,
        vueltas: modalidad === "parejas_fijas" ? vueltas : 1,
      });
      navigateLiga(ligaGestionarPath(liga.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la liga");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LigaPageShell>
      <ActionBar className="liga-toolbar riviera-back-toolbar">
        <Button type="button" variant="back" onClick={() => navigateLiga("/liga")}>
          ← Ligas
        </Button>
        <Button type="button" variant="back" onClick={() => navigateToAppHome()}>
          Inicio
        </Button>
      </ActionBar>

      <ModeHeader
        className="liga-header rv-mode-header rv-mode-header--entry"
        eyebrow={modeEyebrow}
        title="Nueva liga"
        subtitle="Nombre, fechas y modalidad de tu liga."
      />

      <form className="liga-card rv-card" onSubmit={handleSubmit}>
        <div className="liga-field">
          <label htmlFor="liga-nombre">Nombre</label>
          <input
            id="liga-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Liga Riviera Primavera"
            required
          />
        </div>

        <div className="liga-form-row">
          <div className="liga-field">
            <label htmlFor="liga-fecha">Fecha inicio</label>
            <input
              id="liga-fecha"
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div className="liga-field">
            <label htmlFor="liga-canchas">Canchas disponibles</label>
            <input
              id="liga-canchas"
              type="number"
              min={1}
              max={12}
              value={canchas}
              onChange={(e) => setCanchas(Number(e.target.value) || 3)}
            />
          </div>
        </div>

        <fieldset className="liga-field liga-modalidad-field">
          <legend>Modalidad</legend>
          <div className="liga-modalidad-options">
            <label className="liga-modalidad-option">
              <input
                type="radio"
                name="liga-modalidad"
                value="individual_rotativo"
                checked={modalidad === "individual_rotativo"}
                onChange={() => setModalidad("individual_rotativo")}
              />
              <span>
                <strong>Liga individual con parejas rotativas</strong>
                <small>
                  Inscripción por jugador; parejas distintas cada jornada.
                </small>
              </span>
            </label>
            <label className="liga-modalidad-option">
              <input
                type="radio"
                name="liga-modalidad"
                value="parejas_fijas"
                checked={modalidad === "parejas_fijas"}
                onChange={() => setModalidad("parejas_fijas")}
              />
              <span>
                <strong>Liga por parejas fijas</strong>
                <small>
                  Equipos fijos; calendario ida / vuelta entre parejas.
                </small>
              </span>
            </label>
          </div>
        </fieldset>

        {modalidad === "parejas_fijas" && (
          <div className="liga-field">
            <label htmlFor="liga-vueltas">Vueltas</label>
            <select
              id="liga-vueltas"
              value={vueltas}
              onChange={(e) =>
                setVueltas(Number(e.target.value) as LigaVueltas)
              }
            >
              <option value={1}>1 vuelta</option>
              <option value={2}>2 vueltas (ida y vuelta)</option>
              <option value={3}>3 vueltas</option>
            </select>
            <p className="liga-hint">
              Jornadas totales: (número de parejas − 1) × {vueltas}
            </p>
          </div>
        )}

        {error ? <p className="liga-error">{error}</p> : null}

        <div className="liga-actions">
          <Button type="submit" variant="primary" loading={submitting}>
            Crear liga
          </Button>
        </div>
      </form>
    </LigaPageShell>
  );
};
