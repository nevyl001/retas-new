import React, { useState } from "react";
import { navigateToAppHome } from "../../lib/appRouting";
import { createLiga } from "../../services/ligaService";
import { Button } from "../ui";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { ligaGestionarPath, navigateLiga } from "./ligaNav";
import { LigaPageShell } from "./LigaPageShell";
import "./liga-page.css";

export const LigaNueva: React.FC = () => {
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [canchas, setCanchas] = useState(3);
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

      <ModeHeader className="liga-header rv-mode-header" title="Nueva liga" />

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
