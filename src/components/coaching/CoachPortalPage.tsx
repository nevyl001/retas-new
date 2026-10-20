import React, { useEffect, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  fetchCurrentCoachProfile,
  acceptCoachClubInvitation,
} from "../../lib/coaching/coachingApi";
import type { CurrentCoachProfile } from "../../lib/coaching/types";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import { TablerIcon } from "../ui/TablerIcon";
import { navigateToAppHome } from "../../lib/appRouting";
import "./coaching.css";

export const CoachPortalPage: React.FC = () => {
  const { user, loading: userLoading } = useUser();
  const [profile, setProfile] = useState<CurrentCoachProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClubId, setSelectedClubId] = useState<string>("");
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadCoach() {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const coachProfile = await fetchCurrentCoachProfile();
        if (isMounted) {
          setProfile(coachProfile);
          if (coachProfile && coachProfile.memberships.length > 0) {
            setSelectedClubId(coachProfile.memberships[0].organizadorId);
          }
        }
      } catch (err) {
        console.error("[coaching] error fetching coach profile", err);
        if (isMounted) setProfile(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (!userLoading) {
      void loadCoach();
    }

    return () => {
      isMounted = false;
    };
  }, [user, userLoading]);

  const handleAcceptInvitation = async (membershipId: string) => {
    setAcceptingId(membershipId);
    setActionError(null);
    try {
      const res = await acceptCoachClubInvitation(membershipId);
      if (res.success) {
        const updated = await fetchCurrentCoachProfile();
        setProfile(updated);
      } else {
        setActionError(res.error || "No se pudo aceptar la invitación.");
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Error al procesar la invitación"
      );
    } finally {
      setAcceptingId(null);
    }
  };

  if (userLoading || loading) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button
            type="button"
            className="coaching-back"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
          </button>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Espacio del Coach</h1>
          <p className="coaching-muted">Verificando credenciales de coach…</p>
        </header>
      </div>
    );
  }

  // Si no hay sesión autenticada
  if (!user) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button
            type="button"
            className="coaching-back"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
          </button>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Espacio del Coach</h1>
        </header>

        <div className="coaching-empty-card">
          <TablerIcon name="lock" size={44} className="coaching-empty-icon" />
          <h3>Sesión requerida</h3>
          <p>
            Inicia sesión con tu cuenta oficial de Riviera para acceder a tu
            espacio personal de entrenador.
          </p>
          <button
            type="button"
            className="coaching-btn coaching-btn--primary"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="login" size={16} />
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  // Si el usuario autenticado no está registrado como coach en public.riviera_coaches
  if (!profile) {
    return (
      <div className="coaching-page rv-page">
        <header className="coaching-hero">
          <button
            type="button"
            className="coaching-back"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Inicio
          </button>
          <p className="coaching-kicker">Riviera Coaching</p>
          <h1 className="coaching-title">Espacio del Coach</h1>
        </header>

        <div className="coaching-empty-card">
          <TablerIcon
            name="user-x"
            size={44}
            className="coaching-empty-icon"
          />
          <h3>Acceso exclusivo para entrenadores</h3>
          <p>
            La cuenta autenticada (<strong>{user.email}</strong>) no está
            registrada como coach oficial en Riviera Coaching.
          </p>
          <p className="coaching-muted" style={{ maxWidth: "450px", margin: "0.5rem auto 1.5rem" }}>
            Si eres entrenador de un club asociado a Riviera Open, solicita al
            administrador del club que envíe tu invitación oficial de coach.
          </p>
          <button
            type="button"
            className="coaching-btn coaching-btn--primary"
            onClick={() => navigateToAppHome()}
          >
            <TablerIcon name="arrow-left" size={16} />
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="coaching-page rv-page">
      <header className="coaching-hero">
        <button
          type="button"
          className="coaching-back"
          onClick={() => navigateToAppHome()}
        >
          <TablerIcon name="arrow-left" size={16} />
          Inicio
        </button>
        <p className="coaching-kicker">Riviera Coaching · Espacio del Coach</p>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <h1 className="coaching-title" style={{ margin: 0 }}>
            Hola, {profile.nombre}
          </h1>
          <span
            className="coaching-badge coaching-badge--primary"
            style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
          >
            <TablerIcon name="shield-check" size={15} />
            {profile.coachCode}
          </span>
        </div>
        <p className="coaching-lead" style={{ marginTop: "0.5rem" }}>
          Panel de control del entrenador oficial. Identidad única verificada
          mediante la infraestructura de Riviera Open.
        </p>
      </header>

      {/* Tarjeta de Identidad Oficial del Coach */}
      <div className="coaching-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="coaching-card" style={{ padding: "1.5rem" }}>
          <div className="coaching-card__top">
            <div
              className="coaching-card__avatar"
              style={{ width: "56px", height: "56px", fontSize: "1.5rem" }}
              aria-hidden
            >
              {profile.nombre.slice(0, 1).toUpperCase()}
            </div>
            <div className="coaching-card__identity">
              <h2 className="coaching-card__title" style={{ fontSize: "1.25rem" }}>
                {profile.nombre}
              </h2>
              <span className="coaching-card__code" style={{ fontSize: "0.95rem" }}>
                Código Oficial: <strong>{profile.coachCode}</strong>
              </span>
              {profile.bio ? (
                <p style={{ margin: "0.4rem 0 0", color: "var(--ro-text-secondary)", fontSize: "0.85rem" }}>
                  {profile.bio}
                </p>
              ) : null}
            </div>
          </div>

          {profile.fuerzas.length > 0 ? (
            <div className="coaching-card__tags-section" style={{ marginTop: "1rem" }}>
              <span className="coaching-card__tag-label">Fuerzas que entrenas</span>
              <div className="coaching-card__tags">
                {profile.fuerzas.map((f) => (
                  <span key={f} className="coaching-tag">
                    {JUGADOR_CATEGORIA_LABELS[f] || f}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {profile.especialidades.length > 0 ? (
            <div className="coaching-card__tags-section" style={{ marginTop: "0.75rem" }}>
              <span className="coaching-card__tag-label">Especialidades</span>
              <div className="coaching-card__tags">
                {profile.especialidades.map((esp) => (
                  <span key={esp} className="coaching-tag">
                    {esp}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Membresías y Clubes Asociados (Aislamiento Multi-Club) */}
      <section className="coaching-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="coaching-section-header">
          <div>
            <h2 className="coaching-section-title">Clubes afiliados</h2>
            <p className="coaching-section-desc">
              Organizaciones y clubes donde tienes membresía técnica registrada.
            </p>
          </div>
        </div>

        {actionError ? (
          <div
            className="coaching-panel"
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "8px",
              color: "#fca5a5",
              marginBottom: "1rem",
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <TablerIcon name="alert-circle" size={18} />
            {actionError}
          </div>
        ) : null}

        {profile.memberships.length === 0 ? (
          <div className="coaching-empty-card">
            <TablerIcon name="building" size={36} className="coaching-empty-icon" />
            <h3>Sin membresía activa en clubes</h3>
            <p>
              Tu perfil de coach está listo. En cuanto un club te agregue a su
              academia, aparecerá aquí su entorno operativo.
            </p>
          </div>
        ) : (
          <div className="coaching-grid">
            {profile.memberships.map((m) => {
              const isActiveClub = m.organizadorId === selectedClubId;
              const isStatusActive = m.status === "ACTIVE";
              const isStatusPending = m.status === "PENDING";

              return (
                <article
                  key={m.membershipId}
                  className={`coaching-card${isActiveClub ? " coaching-card--highlight" : ""}`}
                  style={{
                    border: isActiveClub
                      ? "1px solid var(--ro-border-strong, rgba(255, 255, 255, 0.35))"
                      : undefined,
                  }}
                >
                  <div className="coaching-card__top">
                    <div className="coaching-card__identity">
                      <h3 className="coaching-card__title">
                        {m.clubNombre || `Club ${m.organizadorId.slice(0, 8)}`}
                      </h3>
                      <span className="coaching-card__code">
                        ID Club: {m.organizadorId.slice(0, 8)}…
                      </span>
                    </div>
                    {isStatusActive ? (
                      <span className="coaching-badge coaching-badge--active">
                        Activo
                      </span>
                    ) : isStatusPending ? (
                      <span className="coaching-badge coaching-badge--pending">
                        Invitación pendiente
                      </span>
                    ) : (
                      <span className="coaching-badge coaching-badge--inactive">
                        Inactivo
                      </span>
                    )}
                  </div>

                  <div className="coaching-card__actions" style={{ marginTop: "1rem" }}>
                    {isStatusPending ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--primary"
                        disabled={acceptingId === m.membershipId}
                        onClick={() => handleAcceptInvitation(m.membershipId)}
                      >
                        <TablerIcon name="check" size={15} />
                        {acceptingId === m.membershipId
                          ? "Aceptando…"
                          : "Aceptar invitación al club"}
                      </button>
                    ) : isActiveClub ? (
                      <span
                        className="coaching-muted"
                        style={{
                          fontSize: "0.8rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.25rem",
                        }}
                      >
                        <TablerIcon name="check" size={14} />
                        Club operativo seleccionado
                      </span>
                    ) : isStatusActive ? (
                      <button
                        type="button"
                        className="coaching-btn coaching-btn--secondary"
                        onClick={() => setSelectedClubId(m.organizadorId)}
                      >
                        Operar en este club
                      </button>
                    ) : (
                      <span className="coaching-muted" style={{ fontSize: "0.8rem" }}>
                        Membresía pausada por el club
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Próximas Entregas (Entrega C y D) */}
      <div className="coaching-guide-card">
        <div className="coaching-guide-card__header">
          <h2 className="coaching-guide-card__title">
            Gestión de alumnos y clases
          </h2>
          <p className="coaching-guide-card__desc">
            Próximamente en las Entregas C y D de Riviera Coaching.
          </p>
        </div>

        <div className="coaching-guide-steps">
          <div className="coaching-guide-step">
            <div className="coaching-guide-step__badge">C</div>
            <div className="coaching-guide-step__body">
              <h4>Vinculación de alumnos por Riviera ID</h4>
              <p>
                Asocia alumnos mediante su código canónico (RIV-########).
                Sin datos duplicados y con aislamiento total por club.
              </p>
            </div>
          </div>

          <div className="coaching-guide-step">
            <div className="coaching-guide-step__badge">D</div>
            <div className="coaching-guide-step__body">
              <h4>Control de clases y descuento automático</h4>
              <p>
                Asigna clases disponibles a cada alumno. Al marcar una clase
                como impartida, el sistema descuenta automáticamente del saldo y
                registra la sesión en el historial deportivo del alumno.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
