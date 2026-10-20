import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { useBranding } from "../../club-experience";
import {
  inviteClubCoach,
  linkExistingCoach,
  linkPlayerByRivieraId,
  loadCoachingClubSnapshot,
  searchCoachForInvitation,
  updateCoachMembershipStatus,
  updateLinkStatus,
} from "../../lib/coaching/coachingApi";
import {
  COACH_ESPECIALIDADES_ORDER,
  COACH_FUERZAS_ORDER,
} from "../../lib/coaching/constants";
import type {
  CoachSearchResult,
  CoachingClubSnapshot,
} from "../../lib/coaching/types";
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
import { Modal } from "../ui/Modal";
import { navigateToAppHome } from "../../lib/appRouting";
import {
  coachingTabPath,
  navigateCoachPortal,
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);
  const [coachModalTab, setCoachModalTab] = useState<"nuevo" | "vincular">(
    "nuevo"
  );

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

  // Coach search & link
  const [coachSearchQuery, setCoachSearchQuery] = useState("");
  const [coachSearchResult, setCoachSearchResult] =
    useState<CoachSearchResult | null>(null);
  const [coachSearchError, setCoachSearchError] = useState<string | null>(null);
  const [coachSearchLoading, setCoachSearchLoading] = useState(false);

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
    setCoachSearchQuery("");
    setCoachSearchResult(null);
    setCoachSearchError(null);
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
      const res = await inviteClubCoach(organizadorId, {
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
      setSnapshot(res.snapshot);
      if (res.snapshot.coaches[0]) {
        setSelectedCoachId(res.snapshot.coaches[0].id);
      }
      resetCoachForm();
      setIsCoachModalOpen(false);
      setSuccessMessage(
        res.isNewUser
          ? `Invitación oficial enviada a ${email}. Código de coach oficial: ${res.coachCode}. El coach figurará con invitación pendiente hasta su activación.`
          : `Coach incorporado exitosamente a tu club con código oficial ${res.coachCode}.`
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Error de incorporación: no se pudo registrar el coach."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCoachStatus = async (
    coachId: string,
    nextStatus: "ACTIVE" | "INACTIVE"
  ) => {
    if (!organizadorId) return;
    setBusy(true);
    setFormError(null);
    try {
      const next = await updateCoachMembershipStatus(
        organizadorId,
        coachId,
        nextStatus
      );
      setSnapshot(next);
      setSuccessMessage(
        nextStatus === "ACTIVE"
          ? "Solicitud de incorporación registrada. El coach debe aceptarla desde su cuenta para activarse."
          : "Membresía del coach desactivada en el club."
      );
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "No se pudo actualizar el estado de la membresía del coach."
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSearchCoach = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = coachSearchQuery.trim();
    if (!query) return;
    setCoachSearchLoading(true);
    setCoachSearchError(null);
    setCoachSearchResult(null);
    try {
      const found = await searchCoachForInvitation(query);
      if (!found) {
        setCoachSearchError(
          "No se encontró ningún coach registrado con ese código oficial o correo."
        );
      } else {
        setCoachSearchResult(found);
      }
    } catch (err) {
      setCoachSearchError(
        err instanceof Error ? err.message : "Error al buscar coach."
      );
    } finally {
      setCoachSearchLoading(false);
    }
  };

  const handleLinkExistingCoach = async () => {
    if (!organizadorId || !coachSearchResult) return;
    setBusy(true);
    setCoachSearchError(null);
    try {
      const next = await linkExistingCoach(
        organizadorId,
        coachSearchResult.coachId
      );
      setSnapshot(next);
      setIsCoachModalOpen(false);
      resetCoachForm();
      setSuccessMessage(
        `Coach ${coachSearchResult.nombre} vinculado exitosamente a tu club.`
      );
    } catch (err) {
      setCoachSearchError(
        err instanceof Error ? err.message : "No se pudo vincular el coach."
      );
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
      setSuccessMessage(`Alumno con Riviera ID ${normalized} vinculado.`);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo vincular el jugador."
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
      const next = await updateLinkStatus(organizadorId, linkId, status);
      setSnapshot(next);
      setSuccessMessage("Estado del alumno actualizado.");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo actualizar el estado."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="coaching-page rv-page">
      <header className="coaching-hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            className="coaching-back"
            style={{ margin: 0 }}
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
          </button>
          <button
            type="button"
            className="coaching-back"
            style={{ margin: 0 }}
            onClick={() => navigateCoachPortal()}
          >
            <TablerIcon name="user-circle" size={16} />
            Espacio del Coach
          </button>
        </div>
        <p className="coaching-kicker">Riviera Coaching · {clubName || "Club"}</p>
        <h1 className="coaching-title">Riviera Coaching</h1>
        <p className="coaching-lead">
          Gestiona tus coaches, alumnos y actividades de formación deportiva.
        </p>

        {snapshot?.source === "demo" ? (
          <div className="coaching-demo-banner">
            <span className="coaching-demo-pill">Modo demostración</span>
            <span className="coaching-demo-text">
              Datos locales de prueba para explorar la interfaz. Las cuentas
              auténticas de coach y la agenda operativa se habilitarán en
              próximas entregas.
            </span>
          </div>
        ) : null}
      </header>

      <div className="coaching-tabs-wrap">
        <nav className="coaching-tabs" aria-label="Secciones de coaching">
          {TABS.map((t) => {
            const count =
              t.id === "coaches"
                ? stats.coaches
                : t.id === "jugadores"
                ? stats.activeLinks
                : 0;

            return (
              <button
                key={t.id}
                type="button"
                className={`coaching-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => navigateCoaching(coachingTabPath(t.id))}
              >
                <TablerIcon name={t.icon} size={16} />
                <span>{t.label}</span>
                {count > 0 ? (
                  <span className="coaching-tab__count">{count}</span>
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      {successMessage ? (
        <div className="coaching-success-banner">
          <TablerIcon name="check" size={18} />
          <span>{successMessage}</span>
        </div>
      ) : null}
      {error ? <p className="coaching-error">{error}</p> : null}
      {formError ? <p className="coaching-error">{formError}</p> : null}
      {loading ? <p className="coaching-muted">Cargando datos de coaching…</p> : null}

      {!loading && tab === "dashboard" ? (
        <section className="coaching-panel" aria-label="Dashboard">
          <div className="coaching-kpi-grid">
            <article className="coaching-kpi">
              <div className="coaching-kpi__header">
                <span className="coaching-kpi__icon" aria-hidden>
                  <TablerIcon name="user-star" size={18} />
                </span>
                <span className="coaching-kpi__label">Coaches activos</span>
              </div>
              <p className="coaching-kpi__value">{stats.coaches}</p>
              <p className="coaching-kpi__hint">
                Entrenadores registrados en el club
              </p>
            </article>

            <article className="coaching-kpi">
              <div className="coaching-kpi__header">
                <span className="coaching-kpi__icon" aria-hidden>
                  <TablerIcon name="users" size={18} />
                </span>
                <span className="coaching-kpi__label">Relaciones activas</span>
              </div>
              <p className="coaching-kpi__value">{stats.activeLinks}</p>
              <p className="coaching-kpi__hint">Alumnos en formación activa</p>
            </article>

            <article className="coaching-kpi">
              <div className="coaching-kpi__header">
                <span className="coaching-kpi__icon" aria-hidden>
                  <TablerIcon name="player-pause" size={18} />
                </span>
                <span className="coaching-kpi__label">En pausa</span>
              </div>
              <p className="coaching-kpi__value">{stats.paused}</p>
              <p className="coaching-kpi__hint">Relaciones suspendidas temporalmente</p>
            </article>
          </div>

          <div className="coaching-guide-card">
            <div className="coaching-guide-card__header">
              <h2 className="coaching-guide-card__title">
                Flujo operativo de la academia
              </h2>
              <p className="coaching-guide-card__desc">
                Paso a paso para la incorporación y seguimiento deportivo en tu
                club.
              </p>
            </div>

            <div className="coaching-guide-steps">
              <div className="coaching-guide-step">
                <div className="coaching-guide-step__badge">1</div>
                <div className="coaching-guide-step__body">
                  <h4>Registra tus coaches</h4>
                  <p>
                    Da de alta a tus entrenadores con sus categorías, fuerzas que
                    entrenan y especialidades técnicas (código RIV-C-#####).
                  </p>
                </div>
              </div>

              <div className="coaching-guide-step">
                <div className="coaching-guide-step__badge">2</div>
                <div className="coaching-guide-step__body">
                  <h4>Vincula a tus alumnos</h4>
                  <p>
                    Asocia jugadores mediante su Riviera ID canónico
                    (RIV-########) para asignarles su entrenador oficial.
                  </p>
                </div>
              </div>

              <div className="coaching-guide-step">
                <div className="coaching-guide-step__badge">3</div>
                <div className="coaching-guide-step__body">
                  <h4>Agenda y evolución deportiva</h4>
                  <p>
                    Control de sesiones de clase y objetivos. Coaching mantiene
                    estricta separación con los rankings y puntos de reta.
                  </p>
                </div>
              </div>
            </div>

            <div className="coaching-guide-actions">
              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                onClick={() => navigateCoaching(coachingTabPath("coaches"))}
              >
                <TablerIcon name="user-star" size={16} />
                Ver coaches
              </button>
              <button
                type="button"
                className="coaching-btn coaching-btn--secondary"
                onClick={() => navigateCoaching(coachingTabPath("jugadores"))}
              >
                <TablerIcon name="users" size={16} />
                Ver alumnos
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && tab === "coaches" ? (
        <section className="coaching-panel" aria-label="Coaches">
          <div className="coaching-section-header">
            <div>
              <h2 className="coaching-section-title">Coaches del club</h2>
              <p className="coaching-section-desc">
                Entrenadores dados de alta en la academia deportiva.
              </p>
            </div>
            <button
              type="button"
              className="coaching-btn coaching-btn--primary"
              onClick={() => setIsCoachModalOpen(true)}
            >
              <TablerIcon name="plus" size={16} />
              Nuevo coach
            </button>
          </div>

          {(snapshot?.coaches ?? []).length === 0 ? (
            <div className="coaching-empty-card">
              <TablerIcon name="user-star" size={44} className="coaching-empty-icon" />
              <h3>No hay coaches registrados</h3>
              <p>
                Comienza agregando el primer entrenador para asignarle alumnos y
                organizar la academia de pádel.
              </p>
              <button
                type="button"
                className="coaching-btn coaching-btn--primary"
                onClick={() => setIsCoachModalOpen(true)}
              >
                <TablerIcon name="plus" size={16} />
                Registrar primer coach
              </button>
            </div>
          ) : (
            <div className="coaching-grid">
              {(snapshot?.coaches ?? []).map((c) => (
                <article key={c.id} className="coaching-card">
                  <div className="coaching-card__top">
                    <div className="coaching-card__avatar" aria-hidden>
                      {c.nombre.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="coaching-card__identity">
                      <h3 className="coaching-card__title">{c.nombre}</h3>
                      <span className="coaching-card__code">
                        {c.coachCode || "Código pendiente"}
                      </span>
                      <div className="coaching-card__meta">
                        {c.categoria ? (
                          <span className="coaching-card__meta-item">
                            {JUGADOR_CATEGORIA_LABELS[c.categoria]}
                          </span>
                        ) : null}
                        {c.paisCodigo ? (
                          <span className="coaching-card__meta-item">
                            · {c.paisCodigo}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {c.membershipStatus === "ACTIVE" ? (
                      <span className="coaching-badge coaching-badge--active">
                        Activo
                      </span>
                    ) : c.membershipStatus === "PENDING" ? (
                      <span className="coaching-badge coaching-badge--pending">
                        Invitación pendiente
                      </span>
                    ) : (
                      <span className="coaching-badge coaching-badge--inactive">
                        Inactivo
                      </span>
                    )}
                  </div>

                  {c.fuerzas.length > 0 ? (
                    <div className="coaching-card__tags-section">
                      <span className="coaching-card__tag-label">
                        Entrena fuerzas
                      </span>
                      <div className="coaching-card__tags">
                        {c.fuerzas.map((f) => (
                          <span key={f} className="coaching-tag">
                            {JUGADOR_CATEGORIA_LABELS[f] || f}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {c.especialidades.length > 0 ? (
                    <div className="coaching-card__tags-section">
                      <span className="coaching-card__tag-label">
                        Especialidades
                      </span>
                      <div className="coaching-card__tags">
                        {c.especialidades.map((esp) => (
                          <span key={esp} className="coaching-tag">
                            {esp}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="coaching-card__actions">
                    {c.membershipStatus === "ACTIVE" ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        onClick={() => {
                          setSelectedCoachId(c.id);
                          navigateCoaching(coachingTabPath("jugadores"));
                        }}
                      >
                        <TablerIcon name="user-plus" size={15} />
                        Vincular alumno
                      </button>
                    ) : null}
                    {c.membershipStatus === "ACTIVE" ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--ghost"
                        onClick={() =>
                          handleToggleCoachStatus(c.id, "INACTIVE")
                        }
                        disabled={busy}
                      >
                        <TablerIcon name="user-off" size={15} />
                        Desactivar
                      </button>
                    ) : c.membershipStatus === "PENDING" ? (
                      <span
                        className="coaching-badge coaching-badge--pending"
                        style={{
                          fontSize: "0.8rem",
                          padding: "0.4rem 0.65rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <TablerIcon name="clock" size={14} />
                        Pendiente de aceptación
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--ghost"
                        onClick={() =>
                          handleToggleCoachStatus(c.id, "ACTIVE")
                        }
                        disabled={busy}
                      >
                        <TablerIcon name="user-check" size={15} />
                        Reincorporar
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <Modal
            open={isCoachModalOpen}
            onClose={() => {
              setIsCoachModalOpen(false);
              resetCoachForm();
            }}
            title={
              coachModalTab === "nuevo"
                ? "Registrar nuevo coach"
                : "Vincular coach existente"
            }
            size="lg"
          >
            <div className="coaching-modal-nav">
              <button
                type="button"
                className={`coaching-modal-tab${
                  coachModalTab === "nuevo" ? " is-active" : ""
                }`}
                onClick={() => setCoachModalTab("nuevo")}
              >
                <TablerIcon name="user-plus" size={16} />
                Nuevo coach
              </button>
              <button
                type="button"
                className={`coaching-modal-tab${
                  coachModalTab === "vincular" ? " is-active" : ""
                }`}
                onClick={() => setCoachModalTab("vincular")}
              >
                <TablerIcon name="search" size={16} />
                Buscar coach existente
              </button>
            </div>

            {coachModalTab === "vincular" ? (
              <div className="coaching-modal-form">
                <p className="coaching-modal-desc">
                  Busca a un entrenador por su código oficial de coach (ej.{" "}
                  <strong>RIV-C-00042</strong>) o por su correo registrado para
                  vincularlo a este club.
                </p>

                <form
                  className="coaching-search-row"
                  onSubmit={handleSearchCoach}
                >
                  <input
                    value={coachSearchQuery}
                    onChange={(e) => setCoachSearchQuery(e.target.value)}
                    placeholder="Código RIV-C-##### o correo..."
                    disabled={coachSearchLoading || busy}
                  />
                  <button
                    type="submit"
                    className="coaching-btn coaching-btn--secondary"
                    disabled={coachSearchLoading || !coachSearchQuery.trim()}
                  >
                    <TablerIcon name="search" size={16} />
                    {coachSearchLoading ? "Buscando…" : "Buscar"}
                  </button>
                </form>

                {coachSearchError ? (
                  <p className="coaching-error">{coachSearchError}</p>
                ) : null}

                {coachSearchResult ? (
                  <div className="coaching-coach-preview">
                    <div className="coaching-card__top">
                      <div className="coaching-card__avatar" aria-hidden>
                        {coachSearchResult.nombre.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="coaching-card__identity">
                        <h3 className="coaching-card__title">
                          {coachSearchResult.nombre}
                        </h3>
                        <span className="coaching-card__code">
                          {coachSearchResult.coachCode}
                        </span>
                        {coachSearchResult.especialidades.length > 0 ? (
                          <div className="coaching-card__meta">
                            <span className="coaching-card__meta-item">
                              {coachSearchResult.especialidades.join(", ")}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      {coachSearchResult.alreadyMember ? (
                        <span className="coaching-badge coaching-badge--active">
                          Ya en tu club
                        </span>
                      ) : null}
                    </div>

                    {!coachSearchResult.alreadyMember ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--primary"
                        onClick={handleLinkExistingCoach}
                        disabled={busy}
                      >
                        <TablerIcon name="link" size={16} />
                        {busy ? "Vinculando…" : "Vincular a este club"}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="coaching-modal-footer">
                  <button
                    type="button"
                    className="coaching-btn coaching-btn--ghost"
                    onClick={() => {
                      setIsCoachModalOpen(false);
                      resetCoachForm();
                    }}
                    disabled={busy}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form className="coaching-modal-form" onSubmit={handleAddCoach}>
                {formError ? (
                  <div
                    className="coaching-error"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      marginBottom: "1rem",
                      background: "rgba(255, 71, 87, 0.12)",
                      border: "1px solid rgba(255, 71, 87, 0.3)",
                      color: "#ff6b81",
                    }}
                  >
                    <TablerIcon name="alert-circle" size={18} />
                    <span>{formError}</span>
                  </div>
                ) : null}
                <div className="coaching-modal-grid">
                  <label className="coaching-field">
                    <span>Nombre del coach *</span>
                    <input
                      value={coachNombre}
                      onChange={(e) => setCoachNombre(e.target.value)}
                      placeholder="Ej. Rodrigo Pádel"
                      disabled={busy}
                      required
                    />
                  </label>
                  <label className="coaching-field">
                    <span>Email de contacto *</span>
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
                      placeholder="+52 998 123 4567"
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
                    <span>Fuerza deportiva propia</span>
                    <select
                      value={coachCategoria}
                      onChange={(e) =>
                        setCoachCategoria(
                          e.target.value as RivieraJugadorCategoria
                        )
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
                      placeholder="30"
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
                      <option value="">— Sin especificar —</option>
                      {(
                        Object.keys(MANO_DOMINANTE_LABELS) as ManoDominante[]
                      ).map((m) => (
                        <option key={m} value={m}>
                          {MANO_DOMINANTE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="coaching-field">
                    <span>Posición en cancha</span>
                    <select
                      value={coachEnCancha}
                      onChange={(e) =>
                        setCoachEnCancha(e.target.value as EnCancha | "")
                      }
                      disabled={busy}
                    >
                      <option value="">— Sin especificar —</option>
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
                            setCoachEspecialidades((prev) =>
                              toggleInList(prev, esp)
                            )
                          }
                        >
                          {esp}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="coaching-modal-footer">
                  <button
                    type="button"
                    className="coaching-btn coaching-btn--ghost"
                    onClick={() => {
                      setIsCoachModalOpen(false);
                      resetCoachForm();
                    }}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="coaching-btn coaching-btn--primary"
                    disabled={busy || !coachNombre.trim()}
                  >
                    {busy ? "Guardando…" : "Registrar e invitar coach"}
                  </button>
                </div>
              </form>
            )}
          </Modal>
        </section>
      ) : null}

      {!loading && tab === "jugadores" ? (
        <section className="coaching-panel" aria-label="Jugadores">
          <div className="coaching-section-header">
            <div>
              <h2 className="coaching-section-title">Alumnos vinculados</h2>
              <p className="coaching-section-desc">
                Jugadores asociados a un coach mediante su Riviera ID oficial.
              </p>
            </div>
          </div>

          <div className="coaching-link-form-card">
            <form className="coaching-link-form" onSubmit={handleLinkPlayer}>
              <label className="coaching-field">
                <span>Coach asignado *</span>
                <select
                  value={selectedCoachId}
                  onChange={(e) => setSelectedCoachId(e.target.value)}
                  disabled={busy || !snapshot?.coaches.length}
                >
                  {(snapshot?.coaches ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.coachCode || "RIV-C"})
                    </option>
                  ))}
                </select>
              </label>

              <label className="coaching-field">
                <span>Riviera ID del alumno *</span>
                <input
                  value={rivieraIdInput}
                  onChange={(e) =>
                    setRivieraIdInput(e.target.value.toUpperCase())
                  }
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
                <TablerIcon name="link" size={16} />
                {busy ? "Vinculando…" : "Vincular alumno"}
              </button>
            </form>
          </div>

          {(snapshot?.links ?? []).length === 0 ? (
            <div className="coaching-empty-card">
              <TablerIcon name="users" size={44} className="coaching-empty-icon" />
              <h3>Sin alumnos vinculados</h3>
              <p>
                Ingresa el Riviera ID de un jugador para vincularlo a uno de los
                coaches de la academia.
              </p>
            </div>
          ) : (
            <div className="coaching-grid">
              {(snapshot?.links ?? []).map((l) => (
                <article key={l.id} className="coaching-card">
                  <div className="coaching-card__top">
                    <div className="coaching-card__avatar" aria-hidden>
                      {l.jugadorNombre.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="coaching-card__identity">
                      <h3 className="coaching-card__title">
                        {l.jugadorNombre}
                      </h3>
                      <span className="coaching-card__code">{l.rivieraId}</span>
                      <div className="coaching-card__meta">
                        <span className="coaching-card__meta-item">
                          Coach: {l.coachNombre}
                        </span>
                        {l.isPrimary ? (
                          <span className="coaching-badge coaching-badge--primary">
                            Primario
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span
                      className={`coaching-badge coaching-badge--${l.status.toLowerCase()}`}
                    >
                      {l.status === "ACTIVE"
                        ? "Activo"
                        : l.status === "PAUSED"
                        ? "En pausa"
                        : "Terminado"}
                    </span>
                  </div>

                  <div className="coaching-card__actions">
                    {l.status !== "ACTIVE" ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        disabled={busy}
                        onClick={() => void handleStatus(l.id, "ACTIVE")}
                      >
                        <TablerIcon name="play" size={14} />
                        Activar
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        disabled={busy}
                        onClick={() => void handleStatus(l.id, "PAUSED")}
                      >
                        <TablerIcon name="player-pause" size={14} />
                        Pausar
                      </button>
                    )}
                    <button
                      type="button"
                      className="coaching-btn coaching-btn--ghost"
                      disabled={busy}
                      onClick={() => void handleStatus(l.id, "ENDED")}
                    >
                      <TablerIcon name="x" size={14} />
                      Terminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading && tab === "agenda" ? (
        <section className="coaching-panel" aria-label="Agenda">
          <div className="coaching-agenda-card">
            <div className="coaching-agenda-icon" aria-hidden>
              <TablerIcon name="calendar-time" size={32} />
            </div>
            <div>
              <h2>Agenda y sesiones de clase</h2>
              <p>
                La programación de horarios, canchas de entrenamiento y
                seguimiento de objetivos para coaches y alumnos estará disponible
                en la siguiente entrega de Riviera Coaching.
              </p>
            </div>

            <div className="coaching-agenda-pillars">
              <div className="coaching-agenda-pillar">
                <h4>
                  <TablerIcon name="calendar-event" size={16} />
                  Programación deportiva
                </h4>
                <p>
                  Horarios de entrenamiento por coach y gestión de canchas del
                  club.
                </p>
              </div>
              <div className="coaching-agenda-pillar">
                <h4>
                  <TablerIcon name="check" size={16} />
                  Asistencia y alumnos
                </h4>
                <p>
                  Registro de alumnos asistentes a sesiones individuales o
                  grupales.
                </p>
              </div>
              <div className="coaching-agenda-pillar">
                <h4>
                  <TablerIcon name="notes" size={16} />
                  Notas y evolución
                </h4>
                <p>
                  Anotaciones técnicas y tácticas protegidas con privacidad
                  exclusiva del coach.
                </p>
              </div>
            </div>

            <div className="coaching-agenda-status-pill">
              <TablerIcon name="clock" size={14} />
              <span>Próximamente en la Entrega D de Riviera Coaching</span>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};
