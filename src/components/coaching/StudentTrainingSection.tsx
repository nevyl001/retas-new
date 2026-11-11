/**
 * StudentTrainingSection — "MI EVOLUCIÓN COMO JUGADOR"
 *
 * Presenta el seguimiento real registrado por el entrenador en sesiones previas:
 * - ÚLTIMA CLASE (fecha, entrenador, club, duración y resumen de lo trabajado)
 * - EN QUÉ DEBO MEJORAR (áreas técnicas o tácticas)
 * - MIS AVANCES (evolución positiva observada)
 * - RECOMENDACIONES (indicaciones para seguir practicando)
 * - MI PRÓXIMO OBJETIVO (meta establecida para la siguiente sesión)
 *
 * Si no existen registros, no muestra secciones vacías como si tuvieran contenido.
 * Nunca expone notas privadas del entrenador.
 */

import React, { useMemo, useState } from "react";
import { TablerIcon } from "../ui/TablerIcon";
import type { StudentTrainingSession } from "../../lib/coaching/types";

interface Props {
  sessions: StudentTrainingSession[];
  error?: string | null;
  loading?: boolean;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export const StudentTrainingSection: React.FC<Props> = ({
  sessions,
  error,
  loading = false,
}) => {
  const [showAllSessions, setShowAllSessions] = useState(false);

  const latest = sessions[0] ?? null;

  const historicalImprovements = useMemo(() => {
    const out: { text: string; date: string; id: string }[] = [];
    for (let i = 1; i < sessions.length; i++) {
      const s = sessions[i];
      if (s.improvements && s.improvements.trim().length > 0) {
        out.push({
          text: s.improvements.trim(),
          date: formatWhen(s.startsAt),
          id: s.id,
        });
      }
    }
    return out.slice(0, 4);
  }, [sessions]);

  if (loading && !latest) {
    return (
      <section
        className="coaching-follow"
        aria-label="Mi evolución como jugador"
      >
        <div className="coaching-follow__header">
          <div>
            <span className="coaching-follow__eyebrow">
              Seguimiento en cancha
            </span>
            <h2 className="coaching-follow__title">
              MI EVOLUCIÓN COMO JUGADOR
            </h2>
          </div>
        </div>
        <div className="coaching-follow__empty">
          Cargando tu seguimiento de entrenamiento…
        </div>
      </section>
    );
  }

  if (error && !latest) {
    return (
      <section
        className="coaching-follow"
        aria-label="Mi evolución como jugador"
      >
        <div className="coaching-follow__header">
          <div>
            <span className="coaching-follow__eyebrow">
              Seguimiento en cancha
            </span>
            <h2 className="coaching-follow__title">
              MI EVOLUCIÓN COMO JUGADOR
            </h2>
          </div>
        </div>
        <div className="coaching-follow__empty" role="status">
          <p>{error}</p>
        </div>
      </section>
    );
  }

  // Si no existen registros de seguimiento, no mostrar tarjetas vacías como si tuvieran contenido
  if (!latest) {
    return (
      <section
        className="coaching-follow coaching-follow--empty"
        aria-label="Mi evolución como jugador"
      >
        <div className="coaching-follow__header">
          <div>
            <span className="coaching-follow__eyebrow">
              Seguimiento en cancha
            </span>
            <h2 className="coaching-follow__title">
              MI EVOLUCIÓN COMO JUGADOR
            </h2>
          </div>
        </div>
        <div className="coaching-follow__empty">
          <TablerIcon name="sparkles" size={18} />
          <div>
            <strong>
              Tu seguimiento técnico aparecerá tras tu primera sesión registrada.
            </strong>
            <p>
              Aquí podrás consultar lo trabajado en tu última clase, áreas de
              mejora, avances, recomendaciones y próximo objetivo.
            </p>
          </div>
        </div>
      </section>
    );
  }

  const hasWorkedOn = Boolean(latest.workedOn && latest.workedOn.length > 0);
  const hasAreasToImprove = Boolean(latest.areasToImprove?.trim());
  const hasImprovements =
    Boolean(latest.improvements?.trim()) || historicalImprovements.length > 0;
  const hasRecommendations = Boolean(latest.recommendations?.trim());
  const hasNextGoals = Boolean(latest.nextGoals?.trim());
  const hasMotivational = Boolean(latest.motivationalMessage?.trim());

  const hasEvolutionCards =
    hasAreasToImprove ||
    hasImprovements ||
    hasRecommendations ||
    hasNextGoals;

  return (
    <section
      className="coaching-follow"
      aria-label="Mi evolución como jugador"
    >
      <div className="coaching-follow__header">
        <div>
          <span className="coaching-follow__eyebrow">
            Seguimiento en cancha
          </span>
          <h2 className="coaching-follow__title">MI EVOLUCIÓN COMO JUGADOR</h2>
        </div>
        <span className="coaching-follow__meta">
          {sessions.length}{" "}
          {sessions.length === 1
            ? "sesión con seguimiento"
            : "sesiones con seguimiento"}
        </span>
      </div>

      {/* 1. ÚLTIMA CLASE */}
      <article className="coaching-follow__latest-card">
        <div className="coaching-follow__latest-top">
          <div className="coaching-follow__card-head">
            <TablerIcon name="circle-check" size={15} />
            <span>ÚLTIMA CLASE</span>
          </div>
          <div className="coaching-follow__latest-meta">
            <span>{formatWhen(latest.startsAt)}</span>
            {latest.coachNombre && (
              <>
                <span aria-hidden="true">·</span>
                <span>{latest.coachNombre}</span>
              </>
            )}
            {latest.clubNombre && (
              <>
                <span aria-hidden="true">·</span>
                <span>{latest.clubNombre}</span>
              </>
            )}
            {latest.durationMinutes ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{latest.durationMinutes} min</span>
              </>
            ) : null}
          </div>
        </div>

        {hasWorkedOn ? (
          <div className="coaching-follow__worked-block">
            <span className="coaching-follow__sublabel">
              Resumen de lo trabajado
            </span>
            <div className="coaching-follow__chips">
              {latest.workedOn.map((item) => (
                <span key={item} className="coaching-follow__chip">
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="coaching-follow__text coaching-follow__text--muted">
            Sesión completada y registrada por tu entrenador.
          </p>
        )}

        {hasMotivational && latest.motivationalMessage && (
          <div className="coaching-follow__coach-note">
            <span className="coaching-follow__coach-note-label">
              Nota de tu entrenador
            </span>
            <p className="coaching-follow__coach-note-quote">
              “{latest.motivationalMessage.trim()}”
            </p>
          </div>
        )}
      </article>

      {/* 2. TARJETAS DE EVOLUCIÓN (solo las que cuentan con datos reales) */}
      {hasEvolutionCards && (
        <div className="coaching-follow__grid">
          {hasAreasToImprove && latest.areasToImprove && (
            <article className="coaching-follow__card">
              <div className="coaching-follow__card-head">
                <TablerIcon name="trending-up" size={15} />
                <span>EN QUÉ DEBO MEJORAR</span>
              </div>
              <p className="coaching-follow__text">
                {latest.areasToImprove.trim()}
              </p>
            </article>
          )}

          {hasImprovements && (
            <article className="coaching-follow__card">
              <div className="coaching-follow__card-head">
                <TablerIcon name="award" size={15} />
                <span>MIS AVANCES</span>
              </div>
              {latest.improvements?.trim() && (
                <p className="coaching-follow__text">
                  {latest.improvements.trim()}
                </p>
              )}
              {historicalImprovements.length > 0 && (
                <ul className="coaching-follow__list">
                  {historicalImprovements.map((imp) => (
                    <li key={imp.id}>
                      <span className="coaching-follow__list-dot" />
                      <div>
                        <p className="coaching-follow__text">{imp.text}</p>
                        <small className="coaching-follow__date">
                          {imp.date}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}

          {hasRecommendations && latest.recommendations && (
            <article className="coaching-follow__card">
              <div className="coaching-follow__card-head">
                <TablerIcon name="compass" size={15} />
                <span>RECOMENDACIONES</span>
              </div>
              <p className="coaching-follow__text">
                {latest.recommendations.trim()}
              </p>
            </article>
          )}

          {hasNextGoals && latest.nextGoals && (
            <article className="coaching-follow__card coaching-follow__card--accent">
              <div className="coaching-follow__card-head">
                <TablerIcon name="target" size={15} />
                <span>MI PRÓXIMO OBJETIVO</span>
              </div>
              <p className="coaching-follow__text">{latest.nextGoals.trim()}</p>
              {latest.nextScheduledAt && (
                <div className="coaching-follow__next-date">
                  <TablerIcon name="calendar-event" size={13} />
                  <span>
                    Próxima sesión: {formatWhen(latest.nextScheduledAt)}
                  </span>
                </div>
              )}
            </article>
          )}
        </div>
      )}

      {/* 3. HISTORIAL DE SEGUIMIENTO EXPANDIBLE */}
      {sessions.length > 1 && (
        <div className="coaching-follow__history">
          <button
            type="button"
            className="coaching-follow__history-toggle"
            onClick={() => setShowAllSessions((v) => !v)}
          >
            <span>
              {showAllSessions
                ? "Ocultar sesiones anteriores"
                : `Ver seguimiento de sesiones anteriores (${sessions.length - 1})`}
            </span>
            <TablerIcon
              name={showAllSessions ? "chevron-up" : "chevron-down"}
              size={15}
            />
          </button>

          {showAllSessions && (
            <div className="coaching-follow__history-list">
              {sessions.slice(1).map((s) => (
                <article
                  key={s.id}
                  className="coaching-follow__session-card"
                >
                  <header className="coaching-follow__session-head">
                    <div>
                      <strong>{formatWhen(s.startsAt)}</strong>
                      <span>
                        {s.coachNombre} · {s.clubNombre}
                        {s.durationMinutes ? ` · ${s.durationMinutes} min` : ""}
                      </span>
                    </div>
                  </header>

                  {s.workedOn.length > 0 && (
                    <div className="coaching-follow__session-block">
                      <small>Trabajado en sesión</small>
                      <div className="coaching-follow__chips">
                        {s.workedOn.map((w) => (
                          <span key={w} className="coaching-follow__chip">
                            {w}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {s.improvements && (
                    <div className="coaching-follow__session-block">
                      <small>Mis avances</small>
                      <p>{s.improvements}</p>
                    </div>
                  )}

                  {s.areasToImprove && (
                    <div className="coaching-follow__session-block">
                      <small>En qué debo mejorar</small>
                      <p>{s.areasToImprove}</p>
                    </div>
                  )}

                  {s.recommendations && (
                    <div className="coaching-follow__session-block">
                      <small>Recomendaciones</small>
                      <p>{s.recommendations}</p>
                    </div>
                  )}

                  {s.nextGoals && (
                    <div className="coaching-follow__session-block">
                      <small>Próximo objetivo</small>
                      <p>{s.nextGoals}</p>
                    </div>
                  )}

                  {s.motivationalMessage && (
                    <div className="coaching-follow__session-quote">
                      “{s.motivationalMessage}”
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default StudentTrainingSection;
