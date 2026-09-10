import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { useBranding } from "../../club-experience";
import {
  createClubCoachDemo,
  linkPlayerByRivieraId,
  loadCoachingClubSnapshot,
  updateLinkStatusDemo,
} from "../../lib/coaching/coachingApi";
import {
  COACH_ESPECIALIDADES_ORDER,
  COACH_FUERZAS_ORDER,
  formatCoachFuerzas,
} from "../../lib/coaching/constants";
import type { CoachingClubSnapshot } from "../../lib/coaching/types";
import type {
  EnCancha,
  ManoDominante,
  RivieraJugadorCategoria,
} from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
  RIVIERA_GENERO_LABELS,
  RIVIERA_GENERO_ORDER,
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
import { normalizeRivieraIdInput } from "../../lib/rivieraJugadores/playerMembership";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateToAppHome } from "../../lib/appRouting";
import {
  coachingTabPath,
  navigateCoaching,
  parseCoachingTab,
  type CoachingTab,
} from "./coachingNav";
import "./coaching.css";

const TABS: Array<{ id: CoachingTab; label: string; icon: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
  { id: "coaches", label: "Coaches", icon: "user-star" },
  { id: "jugadores", label: "Jugadores", icon: "users" },
  { id: "agenda", label: "Agenda", icon: "calendar" },
];

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

export const CoachingClubPage: React.FC<{ pathname: string }> = ({
  pathname,
}) => {
  const { user } = useUser();
  const { nombre: clubName } = useBranding();
  const tab = parseCoachingTab(pathname);
  const organizadorId = user?.id ?? "";

  const [snapshot, setSnapshot] = useState<CoachingClubSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Coach form (mismos datos base que jugador + fuerzas/especialidades)
  const [coachNombre, setCoachNombre] = useState("");
  const [coachEmail, setCoachEmail] = useState("");
  const [coachTelefono, setCoachTelefono] = useState("");
  const [coachPais, setCoachPais] = useState("MX");
  const [coachGenero, setCoachGenero] = useState<RivieraJugadorGenero>("M");
  const [coachCategoria, setCoachCategoria] =
    useState<RivieraJugadorCategoria>("3ra_fuerza");
  const [coachEdad, setCoachEdad] = useState("");
  const [coachMano, setCoachMano] = useState<ManoDominante | "">("");
  const [coachEnCancha, setCoachEnCancha] = useState<EnCancha | "">("");
  const [coachFuerzas, setCoachFuerzas] = useState<RivieraJugadorCategoria[]>([
    "3ra_fuerza",
  ]);
  const [coachEspecialidades, setCoachEspecialidades] = useState<string[]>([
    "Técnica",
  ]);

  // Link by Riviera ID
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [rivieraIdInput, setRivieraIdInput] = useState("");

  const refresh = useCallback(async () => {
    if (!organizadorId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await loadCoachingClubSnapshot(organizadorId);
      setSnapshot(data);
      setSelectedCoachId((prev) => prev || data.coaches[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar Coaching");
    } finally {
      setLoading(false);
    }
  }, [organizadorId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    const coaches = snapshot?.coaches.length ?? 0;
    const activeLinks =
      snapshot?.links.filter((l) => l.status === "ACTIVE").length ?? 0;
    const paused =
      snapshot?.links.filter((l) => l.status === "PAUSED").length ?? 0;
    return { coaches, activeLinks, paused };
  }, [snapshot]);

  const resetCoachForm = () => {
    setCoachNombre("");
    setCoachEmail("");
    setCoachTelefono("");
    setCoachPais("MX");
    setCoachGenero("M");
    setCoachCategoria("3ra_fuerza");
    setCoachEdad("");
    setCoachMano("");
    setCoachEnCancha("");
    setCoachFuerzas(["3ra_fuerza"]);
    setCoachEspecialidades(["Técnica"]);
    setFormError(null);
  };

  const handleAddCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizadorId || !coachNombre.trim()) return;
    const email = normalizeEmailInput(coachEmail);
    if (!email) {
      setFormError(EMAIL_REQUIRED_MESSAGE);
      return;
    }
    if (!isValidEmailFormat(email)) {
      setFormError(EMAIL_INVALID_MESSAGE);
      return;
    }
    if (coachFuerzas.length === 0) {
      setFormError("Selecciona al menos una fuerza que entrena el coach.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const next = await createClubCoachDemo(organizadorId, {
        nombre: coachNombre.trim(),
        email,
        telefono: coachTelefono.trim() || undefined,
        paisCodigo: coachPais || null,
        genero: coachGenero,
        categoria: coachCategoria,
        edad: coachEdad.trim() ? Number(coachEdad) : null,
        manoDominante: coachMano || null,
        enCancha: coachEnCancha || null,
        fuerzas: coachFuerzas,
        especialidades: coachEspecialidades,
      });
      setSnapshot(next);
      if (next.coaches[0]) setSelectedCoachId(next.coaches[0].id);
      resetCoachForm();
    } finally {
      setBusy(false);
    }
  };

  const handleLinkPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizadorId || !selectedCoachId) return;
    const normalized = normalizeRivieraIdInput(rivieraIdInput);
    if (!normalized) {
      setFormError(
        "Formato inválido. Usa el Riviera ID exacto, por ejemplo RIV-00000001."
      );
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const next = await linkPlayerByRivieraId(
        organizadorId,
        selectedCoachId,
        normalized
      );
      setSnapshot(next);
      setRivieraIdInput("");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo vincular el jugador"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleStatus = async (
    linkId: string,
    status: "ACTIVE" | "PAUSED" | "ENDED"
  ) => {
    if (!organizadorId) return;
    setBusy(true);
    try {
      const next = await updateLinkStatusDemo(organizadorId, linkId, status);
      setSnapshot(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="coaching-page rv-page">
      <header className="coaching-hero">
        <button
          type="button"
          className="coaching-back"
          onClick={() => navigateToAppHome()}
        >
          <TablerIcon name="arrow-left" size={18} />
          Inicio
        </button>
        <p className="coaching-kicker">Riviera Coaching · {clubName}</p>
        <h1 className="coaching-title">Coaching del club</h1>
        <p className="coaching-lead">
          Gestiona coaches, asigna jugadores por Riviera ID y prepárate para
          agenda y seguimiento.
          {snapshot?.source === "demo" ? (
            <>
              {" "}
              <span className="coaching-demo-pill">Modo demo</span> — datos
              locales para que veas el flujo; la invitación real llega con Edge
              Function.
            </>
          ) : null}
        </p>
      </header>

      <nav className="coaching-tabs" aria-label="Secciones de coaching">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`coaching-tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => navigateCoaching(coachingTabPath(t.id))}
          >
            <TablerIcon name={t.icon} size={18} />
            {t.label}
          </button>
        ))}
      </nav>

      {error ? <p className="coaching-error">{error}</p> : null}
      {formError ? <p className="coaching-error">{formError}</p> : null}
      {loading ? <p className="coaching-muted">Cargando…</p> : null}

      {!loading && tab === "dashboard" ? (
        <section className="coaching-panel" aria-label="Dashboard">
          <div className="coaching-kpi-grid">
            <article className="coaching-kpi">
              <p className="coaching-kpi__label">Coaches activos</p>
              <p className="coaching-kpi__value">{stats.coaches}</p>
            </article>
            <article className="coaching-kpi">
              <p className="coaching-kpi__label">Relaciones activas</p>
              <p className="coaching-kpi__value">{stats.activeLinks}</p>
            </article>
            <article className="coaching-kpi">
              <p className="coaching-kpi__label">En pausa</p>
              <p className="coaching-kpi__value">{stats.paused}</p>
            </article>
          </div>

          <div className="coaching-steps">
            <h2>Cómo funciona</h2>
            <ol>
              <li>
                <strong>Invitas coaches</strong> al club con sus datos y fuerzas
                (código RIV-C-#####).
              </li>
              <li>
                <strong>Los vinculas a jugadores</strong> con el Riviera ID
                exacto (RIV-########).
              </li>
              <li>
                <strong>Agenda y notas</strong> viven en el portal del coach (sin
                tocar ranking ni participaciones).
              </li>
            </ol>
          </div>
        </section>
      ) : null}

      {!loading && tab === "coaches" ? (
        <section className="coaching-panel" aria-label="Coaches">
          <form className="coaching-form" onSubmit={handleAddCoach}>
            <p className="coaching-form__intro">
              Mismos datos base que un jugador, más las fuerzas que entrena y su
              especialidad.
            </p>

            <div className="coaching-form__grid">
              <label className="coaching-field">
                <span>Nombre *</span>
                <input
                  value={coachNombre}
                  onChange={(e) => setCoachNombre(e.target.value)}
                  placeholder="Ej. Ana Coach"
                  disabled={busy}
                  required
                />
              </label>
              <label className="coaching-field">
                <span>Email *</span>
                <input
                  type="email"
                  value={coachEmail}
                  onChange={(e) => setCoachEmail(e.target.value)}
                  placeholder="coach@club.com"
                  disabled={busy}
                  required
                />
              </label>
              <label className="coaching-field">
                <span>Teléfono / WhatsApp</span>
                <input
                  value={coachTelefono}
                  onChange={(e) => setCoachTelefono(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="coaching-field">
                <span>País</span>
                <select
                  value={coachPais}
                  onChange={(e) => setCoachPais(e.target.value)}
                  disabled={busy}
                >
                  <option value="">— Sin especificar —</option>
                  {PAISES_RIVIERA.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {paisSelectLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="coaching-field">
                <span>Género</span>
                <select
                  value={coachGenero}
                  onChange={(e) =>
                    setCoachGenero(e.target.value as RivieraJugadorGenero)
                  }
                  disabled={busy}
                >
                  {RIVIERA_GENERO_ORDER.map((g) => (
                    <option key={g} value={g}>
                      {RIVIERA_GENERO_LABELS[g]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="coaching-field">
                <span>Fuerza del coach</span>
                <select
                  value={coachCategoria}
                  onChange={(e) =>
                    setCoachCategoria(e.target.value as RivieraJugadorCategoria)
                  }
                  disabled={busy}
                >
                  {JUGADOR_CATEGORIAS_ORDER.map((n) => (
                    <option key={n} value={n}>
                      {JUGADOR_CATEGORIA_LABELS[n]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="coaching-field">
                <span>Edad</span>
                <input
                  type="number"
                  min={14}
                  max={99}
                  value={coachEdad}
                  onChange={(e) => setCoachEdad(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="coaching-field">
                <span>Mano dominante</span>
                <select
                  value={coachMano}
                  onChange={(e) =>
                    setCoachMano(e.target.value as ManoDominante | "")
                  }
                  disabled={busy}
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
              </label>
              <label className="coaching-field">
                <span>En la cancha</span>
                <select
                  value={coachEnCancha}
                  onChange={(e) =>
                    setCoachEnCancha(e.target.value as EnCancha | "")
                  }
                  disabled={busy}
                >
                  <option value="">—</option>
                  {EN_CANCHA_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {EN_CANCHA_LABELS[c]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="coaching-chips" disabled={busy}>
              <legend>Fuerzas que entrena *</legend>
              <div className="coaching-chips__row">
                {COACH_FUERZAS_ORDER.map((f) => {
                  const on = coachFuerzas.includes(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      className={`coaching-chip${on ? " is-on" : ""}`}
                      onClick={() =>
                        setCoachFuerzas((prev) => toggleInList(prev, f))
                      }
                    >
                      {JUGADOR_CATEGORIA_LABELS[f]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="coaching-chips" disabled={busy}>
              <legend>Especialidades</legend>
              <div className="coaching-chips__row">
                {COACH_ESPECIALIDADES_ORDER.map((esp) => {
                  const on = coachEspecialidades.includes(esp);
                  return (
                    <button
                      key={esp}
                      type="button"
                      className={`coaching-chip${on ? " is-on" : ""}`}
                      onClick={() =>
                        setCoachEspecialidades((prev) => toggleInList(prev, esp))
                      }
                    >
                      {esp}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button
              type="submit"
              className="coaching-btn coaching-btn--primary"
              disabled={busy || !coachNombre.trim()}
            >
              Agregar coach (demo)
            </button>
          </form>

          <ul className="coaching-list">
            {(snapshot?.coaches ?? []).map((c) => (
              <li key={c.id} className="coaching-card coaching-card--coach">
                <div className="coaching-card__avatar" aria-hidden>
                  {c.nombre.slice(0, 1).toUpperCase()}
                </div>
                <div className="coaching-card__body">
                  <p className="coaching-card__title">{c.nombre}</p>
                  <p className="coaching-card__meta">
                    {c.coachCode}
                    {c.categoria
                      ? ` · ${JUGADOR_CATEGORIA_LABELS[c.categoria]}`
                      : ""}
                    {c.email ? ` · ${c.email}` : ""}
                  </p>
                  {c.fuerzas.length > 0 ? (
                    <p className="coaching-card__tags">
                      Entrena: {formatCoachFuerzas(c.fuerzas)}
                    </p>
                  ) : null}
                  {c.especialidades.length > 0 ? (
                    <p className="coaching-card__tags">
                      {c.especialidades.join(" · ")}
                    </p>
                  ) : null}
                </div>
                <span className="coaching-status coaching-status--on">
                  {c.membershipStatus}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!loading && tab === "jugadores" ? (
        <section className="coaching-panel" aria-label="Jugadores">
          <form
            className="coaching-form coaching-form--row"
            onSubmit={handleLinkPlayer}
          >
            <label className="coaching-field">
              <span>Coach</span>
              <select
                value={selectedCoachId}
                onChange={(e) => setSelectedCoachId(e.target.value)}
                disabled={busy || !(snapshot?.coaches.length)}
              >
                {(snapshot?.coaches ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="coaching-field">
              <span>Riviera ID del jugador</span>
              <input
                value={rivieraIdInput}
                onChange={(e) => setRivieraIdInput(e.target.value.toUpperCase())}
                placeholder="RIV-00000001"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={busy}
              />
            </label>
            <button
              type="submit"
              className="coaching-btn coaching-btn--primary"
              disabled={busy || !rivieraIdInput.trim() || !selectedCoachId}
            >
              Vincular
            </button>
          </form>

          <ul className="coaching-list">
            {(snapshot?.links ?? []).map((l) => (
              <li key={l.id} className="coaching-card coaching-card--link">
                <div className="coaching-card__body">
                  <p className="coaching-card__title">{l.jugadorNombre}</p>
                  <p className="coaching-card__meta">
                    {l.rivieraId}
                    {" · "}
                    Coach: {l.coachNombre}
                    {l.isPrimary ? " · Primario" : ""}
                  </p>
                </div>
                <span
                  className={`coaching-status coaching-status--${l.status.toLowerCase()}`}
                >
                  {l.status}
                </span>
                <div className="coaching-card__actions">
                  {l.status !== "ACTIVE" ? (
                    <button
                      type="button"
                      className="coaching-btn"
                      disabled={busy}
                      onClick={() => void handleStatus(l.id, "ACTIVE")}
                    >
                      Activar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="coaching-btn"
                      disabled={busy}
                      onClick={() => void handleStatus(l.id, "PAUSED")}
                    >
                      Pausar
                    </button>
                  )}
                  <button
                    type="button"
                    className="coaching-btn coaching-btn--ghost"
                    disabled={busy}
                    onClick={() => void handleStatus(l.id, "ENDED")}
                  >
                    Terminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!loading && tab === "agenda" ? (
        <section className="coaching-panel" aria-label="Agenda">
          <div className="coaching-empty">
            <TablerIcon name="calendar-event" size={36} />
            <h2>Agenda del coach</h2>
            <p>
              Aquí vivirán sesiones, objetivos y notas. El coach las gestiona en
              su portal; el club solo ve el resumen. Próximo paso de
              implementación.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
};
