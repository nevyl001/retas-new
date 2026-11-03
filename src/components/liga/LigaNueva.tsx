import React, { useState } from "react";
import { useClubModeEyebrow } from "../../club-experience";
import { navigateToAppHome } from "../../lib/appRouting";
import type { LigaModalidad, LigaVueltas } from "../../lib/liga/types";
import { createLiga } from "../../services/ligaService";
import { Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import { ActionBar } from "../platform/ActionBar";
import { ModeHeader } from "../platform/ModeHeader";
import { ligaGestionarPath, navigateLiga } from "./ligaNav";
import { LigaPageShell } from "./LigaPageShell";
import "./liga-page.css";

type ModalidadOption = {
  value: LigaModalidad;
  title: string;
  description: string;
  badge: string;
  icon: string;
};

const MODALIDAD_OPTIONS: ModalidadOption[] = [
  {
    value: "individual_rotativo",
    title: "Liga individual",
    description:
      "Los jugadores cambian de pareja y compiten por su posición individual.",
    badge: "Parejas rotativas",
    icon: "arrows-shuffle",
  },
  {
    value: "parejas_fijas",
    title: "Liga por parejas fijas",
    description:
      "Cada pareja se mantiene durante la temporada y compite en una clasificación general.",
    badge: "Temporada regular",
    icon: "users-group",
  },
  {
    value: "parejas_fijas_playoffs",
    title: "Liga con playoffs",
    description:
      "Una fase regular que conduce a semifinales y una gran final.",
    badge: "Semifinales + Final",
    icon: "trophy",
  },
];

function formatFechaResumen(value: string): string {
  if (!value) return "Por definir";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  try {
    return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export const LigaNueva: React.FC = () => {
  const modeEyebrow = useClubModeEyebrow();
  const [nombre, setNombre] = useState("");
  const [fechaInicio, setFechaInicio] = useState("");
  const [canchas, setCanchas] = useState(3);
  const [modalidad, setModalidad] = useState<LigaModalidad>("individual_rotativo");
  const [vueltas, setVueltas] = useState<LigaVueltas>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedModalidad =
    MODALIDAD_OPTIONS.find((o) => o.value === modalidad) ?? MODALIDAD_OPTIONS[0];

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
    <LigaPageShell className="liga-nueva">
      <ActionBar className="liga-toolbar riviera-back-toolbar">
        <Button type="button" variant="back" onClick={() => navigateLiga("/liga")}>
          ← Ligas
        </Button>
        <Button type="button" variant="back" onClick={() => navigateToAppHome()}>
          Inicio
        </Button>
      </ActionBar>

      <nav className="liga-nueva__crumb" aria-label="Miga de pan">
        <button
          type="button"
          className="liga-nueva__crumb-link"
          onClick={() => navigateLiga("/liga")}
        >
          Ligas
        </button>
        <span className="liga-nueva__crumb-sep" aria-hidden>
          /
        </span>
        <span className="liga-nueva__crumb-current">Nueva liga</span>
      </nav>

      <ModeHeader
        className="liga-header rv-mode-header rv-mode-header--entry liga-nueva__header"
        eyebrow={modeEyebrow}
        title="Crear nueva liga"
        subtitle="Configura los datos de tu competencia y elige cómo se jugará."
      />

      <form className="liga-nueva__form" onSubmit={handleSubmit} noValidate>
        <div className="liga-nueva__layout">
          <div className="liga-nueva__main">
            <section className="liga-nueva__panel" aria-labelledby="liga-nueva-general-title">
              <header className="liga-nueva__panel-head">
                <span className="liga-nueva__step">01</span>
                <div>
                  <h2 id="liga-nueva-general-title" className="liga-nueva__panel-title">
                    Información general
                  </h2>
                  <p className="liga-nueva__panel-sub">
                    Datos básicos para identificar y programar tu liga.
                  </p>
                </div>
              </header>

              <div className="liga-field">
                <label htmlFor="liga-nombre">Nombre de la liga</label>
                <input
                  id="liga-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Liga Riviera Primavera"
                  required
                  autoComplete="off"
                />
              </div>

              <div className="liga-form-row">
                <div className="liga-field">
                  <label htmlFor="liga-fecha">Fecha de inicio</label>
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
            </section>

            <section className="liga-nueva__panel" aria-labelledby="liga-nueva-modalidad-title">
              <header className="liga-nueva__panel-head">
                <span className="liga-nueva__step">02</span>
                <div>
                  <h2 id="liga-nueva-modalidad-title" className="liga-nueva__panel-title">
                    Modalidad de competencia
                  </h2>
                  <p className="liga-nueva__panel-sub">
                    Selecciona el formato que mejor se adapte a tu liga.
                  </p>
                </div>
              </header>

              <fieldset className="liga-nueva__modalidades">
                <legend className="liga-nueva__sr-only">Modalidad</legend>
                <div className="liga-nueva__modalidad-grid" role="radiogroup" aria-label="Modalidad">
                  {MODALIDAD_OPTIONS.map((option) => {
                    const selected = modalidad === option.value;
                    return (
                      <label
                        key={option.value}
                        className={`liga-nueva__modalidad-card${
                          selected ? " is-selected" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name="liga-modalidad"
                          value={option.value}
                          checked={selected}
                          onChange={() => setModalidad(option.value)}
                        />
                        <span className="liga-nueva__modalidad-icon" aria-hidden>
                          <TablerIcon name={option.icon} size={22} />
                        </span>
                        <span className="liga-nueva__modalidad-body">
                          <span className="liga-nueva__modalidad-top">
                            <strong className="liga-nueva__modalidad-title">
                              {option.title}
                            </strong>
                            <span className="liga-nueva__modalidad-badge">
                              {option.badge}
                            </span>
                          </span>
                          <span className="liga-nueva__modalidad-desc">
                            {option.description}
                          </span>
                        </span>
                        <span
                          className="liga-nueva__modalidad-check"
                          aria-hidden={!selected}
                        >
                          <TablerIcon name="circle-check" size={20} />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {modalidad === "parejas_fijas" ? (
                <div className="liga-field liga-nueva__vueltas">
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
              ) : null}
            </section>
          </div>

          <aside className="liga-nueva__aside" aria-label="Resumen de tu liga">
            <div className="liga-nueva__summary">
              <h2 className="liga-nueva__summary-title">Resumen de tu liga</h2>
              <dl className="liga-nueva__summary-list">
                <div className="liga-nueva__summary-row">
                  <dt>Nombre</dt>
                  <dd className={nombre.trim() ? undefined : "is-muted"}>
                    {nombre.trim() || "Por definir"}
                  </dd>
                </div>
                <div className="liga-nueva__summary-row">
                  <dt>Fecha de inicio</dt>
                  <dd className={fechaInicio ? undefined : "is-muted"}>
                    {formatFechaResumen(fechaInicio)}
                  </dd>
                </div>
                <div className="liga-nueva__summary-row">
                  <dt>Canchas</dt>
                  <dd>
                    {canchas} {canchas === 1 ? "cancha" : "canchas"}
                  </dd>
                </div>
                <div className="liga-nueva__summary-row">
                  <dt>Modalidad</dt>
                  <dd>
                    {selectedModalidad.title}
                    <span className="liga-nueva__summary-badge">
                      {selectedModalidad.badge}
                    </span>
                  </dd>
                </div>
                {modalidad === "parejas_fijas" ? (
                  <div className="liga-nueva__summary-row">
                    <dt>Vueltas</dt>
                    <dd>
                      {vueltas} {vueltas === 1 ? "vuelta" : "vueltas"}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {error ? (
                <p className="liga-error liga-nueva__summary-error" role="alert">
                  {error}
                </p>
              ) : null}

              <Button
                type="submit"
                variant="primary"
                loading={submitting}
                disabled={submitting}
                className="liga-nueva__submit"
              >
                Crear liga
              </Button>
            </div>
          </aside>
        </div>
      </form>
    </LigaPageShell>
  );
};
