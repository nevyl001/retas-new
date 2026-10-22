import React, { useState } from "react";
import type { StudentTrainingSession } from "../../lib/coaching/types";

const EMPTY = "Tu coach aún no registró este apartado.";

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Block({ title, body }: { title: string; body: string | null }) {
  return (
    <div className="coaching-follow__block">
      <h4>{title}</h4>
      <p>{body?.trim() ? body : EMPTY}</p>
    </div>
  );
}

export const StudentTrainingSection: React.FC<{
  sessions: StudentTrainingSession[];
  error: string | null;
}> = ({ sessions, error }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const latest = sessions[0] ?? null;
  const pending = latest?.areasToImprove || latest?.recommendations || latest?.nextGoals || null;

  return (
    <section className="coaching-follow" aria-label="Seguimiento deportivo">
      <h2>Tu seguimiento</h2>
      {error ? <p className="coaching-follow__empty">{error}</p> : null}

      {!latest ? (
        <p className="coaching-follow__empty">
          Tu entrenador comenzará a registrar tus avances conforme completes tus clases.
        </p>
      ) : (
        <>
          <article className="coaching-follow__card">
            <p className="coaching-follow__kicker">Mi última clase — {formatWhen(latest.startsAt)}</p>
            <p className="coaching-follow__meta">
              Entrenador: {latest.coachNombre}
              <br />
              Club: {latest.clubNombre}
              {latest.durationMinutes ? (
                <>
                  <br />
                  Duración: {latest.durationMinutes} min
                </>
              ) : null}
            </p>
            <Block
              title="Lo que trabajamos"
              body={latest.workedOn.length ? latest.workedOn.join(" · ") : null}
            />
            <Block title="Lo que has mejorado" body={latest.improvements} />
            <Block title="Lo que necesitas mejorar" body={latest.areasToImprove} />
            <Block title="Recomendaciones de tu coach" body={latest.recommendations} />
            <div className="coaching-follow__message">
              <h4>Mensaje de tu coach</h4>
              {latest.motivationalMessage ? (
                <blockquote>
                  {latest.motivationalMessage}
                  <footer>— {latest.coachNombre}</footer>
                </blockquote>
              ) : (
                <p>{EMPTY}</p>
              )}
            </div>
            <Block title="Próximo objetivo" body={latest.nextGoals} />
            {latest.nextScheduledAt ? (
              <p className="coaching-follow__meta">
                Clase agendada: {formatWhen(latest.nextScheduledAt)}
              </p>
            ) : (
              <p className="coaching-follow__meta">Todavía no hay una próxima clase agendada.</p>
            )}
            {latest.followupUpdatedAt ? (
              <p className="coaching-follow__meta">
                Actualizado el {formatWhen(latest.followupUpdatedAt)}
              </p>
            ) : null}
          </article>

          <article className="coaching-follow__card">
            <h3>En qué debo mejorar</h3>
            {pending ? (
              <>
                <Block title="Pendiente" body={latest.areasToImprove} />
                <Block title="Recomendación vigente" body={latest.recommendations} />
                <Block title="Objetivo de la próxima sesión" body={latest.nextGoals} />
              </>
            ) : (
              <p className="coaching-follow__empty">
                Tu entrenador comenzará a registrar tus avances conforme completes tus clases.
              </p>
            )}
          </article>

          <article className="coaching-follow__card">
            <h3>Mis avances</h3>
            {sessions.some((session) => session.improvements) ? (
              <ul className="coaching-follow__list">
                {sessions
                  .filter((session) => session.improvements)
                  .map((session) => (
                    <li key={session.id}>
                      <strong>{formatWhen(session.startsAt)}</strong>
                      <span>{session.improvements}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="coaching-follow__empty">
                Tu entrenador comenzará a registrar tus avances conforme completes tus clases.
              </p>
            )}
          </article>

          <article className="coaching-follow__card">
            <h3>Historial de entrenamiento</h3>
            <ul className="coaching-follow__list">
              {sessions.map((session) => {
                const open = openId === session.id;
                return (
                  <li key={session.id}>
                    <button type="button" onClick={() => setOpenId(open ? null : session.id)}>
                      {formatWhen(session.startsAt)} · {session.coachNombre} · {session.clubNombre}
                    </button>
                    {open ? (
                      <div>
                        <Block
                          title="Temas"
                          body={session.workedOn.length ? session.workedOn.join(" · ") : null}
                        />
                        <Block title="Mejoras" body={session.improvements} />
                        <Block title="Por mejorar" body={session.areasToImprove} />
                        <Block title="Recomendaciones" body={session.recommendations} />
                        <Block title="Mensaje" body={session.motivationalMessage} />
                        <Block title="Siguiente objetivo" body={session.nextGoals} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </article>
        </>
      )}
    </section>
  );
};
