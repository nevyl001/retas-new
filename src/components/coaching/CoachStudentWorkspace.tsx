import React, { useEffect, useMemo, useRef, useState } from "react";
import type {
  CoachClassFollowup,
  CoachClassLedgerEntry,
  CoachFollowupDigest,
  CoachScheduledSession,
  CoachingPlayerLink,
} from "../../lib/coaching/types";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import { parsePrepFocusTopics } from "../../lib/coaching/prepFocusTopics";
import { TablerIcon } from "../ui/TablerIcon";

type RosterFilter = "all" | "scheduled" | "unscheduled";
type RosterSort = "next" | "name";

const PAGE_SIZE = 20;
const WIDE_QUERY = "(min-width: 1080px)";

function useWideLayout(): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const media = window.matchMedia?.(WIDE_QUERY);
    if (!media) return;
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return wide;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || "AL").slice(0, 2).toUpperCase();
}

function shortWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function fullWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface CoachStudentWorkspaceProps {
  students: CoachingPlayerLink[];
  sessions: CoachScheduledSession[];
  digestByRelationship: Record<string, CoachFollowupDigest>;
  loadingStudents: boolean;
  studentsError: string | null;
  loadingSessions: boolean;
  sessionsError: string | null;
  onRetryStudents: () => void;
  onRetrySessions: () => void;
  selected: CoachingPlayerLink | null;
  onSelect: (student: CoachingPlayerLink) => void;
  onBack: () => void;
  followupSessions: CoachClassFollowup[];
  followupLoading: boolean;
  followupError: string | null;
  packageMoves: CoachClassLedgerEntry[];
  packageLoading: boolean;
  packageError: string | null;
  onOpenSession: (session: CoachScheduledSession) => void;
  onEditFollowup: (session: CoachClassFollowup) => void;
}

export const CoachStudentWorkspace: React.FC<CoachStudentWorkspaceProps> = ({
  students,
  sessions,
  digestByRelationship,
  loadingStudents,
  studentsError,
  loadingSessions,
  sessionsError,
  onRetryStudents,
  onRetrySessions,
  selected,
  onSelect,
  onBack,
  followupSessions,
  followupLoading,
  followupError,
  packageMoves,
  packageLoading,
  packageError,
  onOpenSession,
  onEditFollowup,
}) => {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  const [sort, setSort] = useState<RosterSort>("next");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const wide = useWideLayout();
  const showList = wide || !selected;
  const showFile = wide || Boolean(selected);

  const nextByStudent = useMemo(() => {
    const map = new Map<string, CoachScheduledSession>();
    const ordered = [...sessions].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    for (const session of ordered) {
      if (!map.has(session.jugadorId)) map.set(session.jugadorId, session);
    }
    return map;
  }, [sessions]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = students.filter((student) => {
      if (needle) {
        const haystack = `${student.jugadorNombre} ${student.rivieraId}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      const hasNext = nextByStudent.has(student.jugadorId);
      if (filter === "scheduled" && !hasNext) return false;
      if (filter === "unscheduled" && hasNext) return false;
      return true;
    });
    rows.sort((a, b) => {
      if (sort === "name") {
        return a.jugadorNombre.localeCompare(b.jugadorNombre, "es");
      }
      const aTime = nextByStudent.get(a.jugadorId)?.startsAt;
      const bTime = nextByStudent.get(b.jugadorId)?.startsAt;
      if (aTime && bTime) return new Date(aTime).getTime() - new Date(bTime).getTime();
      if (aTime) return -1;
      if (bTime) return 1;
      return a.jugadorNombre.localeCompare(b.jugadorNombre, "es");
    });
    return rows;
  }, [students, query, filter, sort, nextByStudent]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, filter, sort, students]);

  useEffect(() => {
    if (!selected && listRef.current) {
      listRef.current.scrollTop = scrollTopRef.current;
    }
  }, [selected]);

  const visible = filtered.slice(0, visibleCount);
  const selectedDigest = selected ? digestByRelationship[selected.id] : undefined;
  const selectedSessions = selected
    ? sessions
        .filter((session) => session.jugadorId === selected.jugadorId)
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
    : [];
  const nextSession = selected ? nextByStudent.get(selected.jugadorId) : undefined;
  const categoryLabel = selectedDigest?.categoria
    ? JUGADOR_CATEGORIA_LABELS[
        selectedDigest.categoria as keyof typeof JUGADOR_CATEGORIA_LABELS
      ] || selectedDigest.categoria
    : null;
  const photoUrl =
    selectedDigest?.fotoUrl || nextSession?.jugadorFoto || null;

  const openStudent = (student: CoachingPlayerLink) => {
    scrollTopRef.current = listRef.current?.scrollTop ?? 0;
    onSelect(student);
  };

  return (
    <section
      className={
        "coach-roster" + (selected ? " coach-roster--detail" : "")
      }
      aria-label="Mis alumnos"
    >
      {showList ? <div className="coach-roster__list" ref={listRef}>
        <div className="coach-roster__head">
          <h2>Mis alumnos</h2>
          <span>
            {students.length} {students.length === 1 ? "alumno" : "alumnos"}
          </span>
        </div>
        <label className="coach-roster__search">
          <TablerIcon name="search" size={16} />
          <input
            type="search"
            value={query}
            placeholder="Buscar por nombre o Riviera ID"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="coach-roster__tools">
          {(
            [
              ["all", "Todos"],
              ["scheduled", "Con próxima clase"],
              ["unscheduled", "Sin clases programadas"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={filter === id ? "is-on" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
          <select
            aria-label="Ordenar alumnos"
            value={sort}
            onChange={(event) => setSort(event.target.value as RosterSort)}
          >
            <option value="next">Próxima sesión</option>
            <option value="name">Nombre</option>
          </select>
        </div>

        {loadingStudents ? (
          <p className="coaching-muted">Cargando alumnos…</p>
        ) : studentsError ? (
          <div className="coach-roster__notice">
            <p>{studentsError}</p>
            <button type="button" onClick={onRetryStudents}>
              Reintentar
            </button>
          </div>
        ) : students.length === 0 ? (
          <p className="coaching-muted">Todavía no tienes alumnos en este club.</p>
        ) : visible.length === 0 ? (
          <p className="coaching-muted">Ningún alumno coincide con la búsqueda.</p>
        ) : (
          <ul className="coach-roster__cards">
            {visible.map((student) => {
              const digest = digestByRelationship[student.id];
              const next = nextByStudent.get(student.jugadorId);
              const portrait = digest?.fotoUrl || next?.jugadorFoto || "";
              const active = selected?.id === student.id;
              return (
                <li key={student.id}>
                  <button
                    type="button"
                    className={
                      "coach-roster-card" + (active ? " is-selected" : "")
                    }
                    onClick={() => openStudent(student)}
                  >
                    <span className="coach-roster-card__photo">
                      {portrait ? (
                        <img src={portrait} alt="" />
                      ) : (
                        <span>{initials(student.jugadorNombre)}</span>
                      )}
                    </span>
                    <span className="coach-roster-card__body">
                      <strong>{student.jugadorNombre}</strong>
                      <span>{student.rivieraId}</span>
                      <span>
                        {student.balanceClasses ?? 0}{" "}
                        {(student.balanceClasses ?? 0) === 1
                          ? "clase disponible"
                          : "clases disponibles"}
                      </span>
                      {next ? (
                        <span className="coach-roster-card__next">
                          Próxima clase · {shortWhen(next.startsAt)}
                        </span>
                      ) : null}
                      {student.status === "PAUSED" ? (
                        <span className="coach-roster-card__next">En pausa</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > visibleCount ? (
          <button
            type="button"
            className="coach-roster__more"
            onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          >
            Mostrar más
          </button>
        ) : null}
      </div> : null}

      {showFile ? <div className="coach-roster__file">
        {selected ? (
          <>
            <button type="button" className="coach-roster__back" onClick={onBack}>
              <TablerIcon name="arrow-left" size={16} />
              Volver a mis alumnos
            </button>
            <header className="coach-file-hero">
              <span className="coach-roster-card__photo coach-file-hero__photo">
                {photoUrl ? <img src={photoUrl} alt="" /> : <span>{initials(selected.jugadorNombre)}</span>}
              </span>
              <div>
                <h2>{selected.jugadorNombre}</h2>
                <p>{selected.rivieraId}</p>
                <p>
                  {selected.balanceClasses ?? 0}{" "}
                  {(selected.balanceClasses ?? 0) === 1
                    ? "clase disponible"
                    : "clases disponibles"}
                  {categoryLabel ? ` · ${categoryLabel}` : ""}
                </p>
                {nextSession ? (
                  <p>Próxima sesión · {fullWhen(nextSession.startsAt)}</p>
                ) : (
                  <p>Sin clase programada</p>
                )}
              </div>
            </header>

            <section className="coach-file-block" aria-label="Próximas clases">
              <h3>Próximas clases</h3>
              {loadingSessions ? (
                <p className="coaching-muted">Cargando clases…</p>
              ) : sessionsError ? (
                <div className="coach-roster__notice">
                  <p>{sessionsError}</p>
                  <button type="button" onClick={onRetrySessions}>
                    Reintentar
                  </button>
                </div>
              ) : selectedSessions.length === 0 ? (
                <p className="coaching-muted">No hay clases programadas.</p>
              ) : (
                <ul className="coach-file-sessions">
                  {selectedSessions.map((session) => {
                    const topics = parsePrepFocusTopics(session.focus);
                    return (
                      <li key={session.id}>
                        <button type="button" onClick={() => onOpenSession(session)}>
                          <strong>{fullWhen(session.startsAt)}</strong>
                          <span>
                            {session.durationMinutes} min
                            {session.court ? ` · ${session.court}` : ""}
                            {" · Programada"}
                          </span>
                          <span>
                            {topics.length > 0
                              ? topics.join(" · ")
                              : "Tema por definir"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="coach-file-block" aria-label="Evolución e historial">
              <h3>Evolución e historial</h3>
              {followupLoading ? (
                <p className="coaching-muted">Cargando historial…</p>
              ) : followupError ? (
                <p className="coaching-muted">{followupError}</p>
              ) : followupSessions.length === 0 ? (
                <p className="coaching-muted">Aún no hay sesiones registradas.</p>
              ) : (
                <div className="coach-follow-history">
                  {followupSessions.map((session) => (
                    <details key={session.id} className="coach-follow-history__item">
                      <summary>
                        <strong className="coach-follow-history__date">
                          {fullWhen(session.startsAt)}
                        </strong>
                        <span className="coach-follow-history__meta">
                          {session.workedOn.length > 0
                            ? session.workedOn.join(" · ")
                            : "Sin temas registrados"}
                        </span>
                      </summary>
                      {session.improvements ? (
                        <div className="coach-follow-history__block">
                          <span className="coach-follow-history__label">Avances</span>
                          <p className="coach-follow-history__text">{session.improvements}</p>
                        </div>
                      ) : null}
                      {session.areasToImprove ? (
                        <div className="coach-follow-history__block">
                          <span className="coach-follow-history__label">Aspectos por mejorar</span>
                          <p className="coach-follow-history__text">{session.areasToImprove}</p>
                        </div>
                      ) : null}
                      {session.recommendations ? (
                        <div className="coach-follow-history__block">
                          <span className="coach-follow-history__label">Recomendaciones</span>
                          <p className="coach-follow-history__text">{session.recommendations}</p>
                        </div>
                      ) : null}
                      {session.nextGoals ? (
                        <div className="coach-follow-history__block">
                          <span className="coach-follow-history__label">Próximo objetivo</span>
                          <p className="coach-follow-history__text">{session.nextGoals}</p>
                        </div>
                      ) : null}
                      {session.motivationalMessage ? (
                        <div className="coach-follow-history__message">
                          <span className="coach-follow-history__label">Mensaje para el alumno</span>
                          <p className="coach-follow-history__text">{session.motivationalMessage}</p>
                        </div>
                      ) : null}
                      {session.privateNotes ? (
                        <div className="coach-follow-history__private">
                          <span className="coach-follow-history__label">Nota privada</span>
                          <p className="coach-follow-history__hint">
                            Entrenador, club de la relación y administrador maestro. El alumno no la ve.
                          </p>
                          <p className="coach-follow-history__text">{session.privateNotes}</p>
                        </div>
                      ) : null}
                      <div className="coach-follow-history__actions">
                        <button
                          type="button"
                          className="coaching-btn coaching-btn--secondary"
                          onClick={() => onEditFollowup(session)}
                        >
                          Editar seguimiento de clase
                        </button>
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </section>

            <section className="coach-file-block" aria-label="Paquete de clases">
              <h3>Paquete de clases</h3>
              <p>
                {selected.balanceClasses ?? 0}{" "}
                {(selected.balanceClasses ?? 0) === 1
                  ? "clase disponible"
                  : "clases disponibles"}
                {" · "}
                {selected.totalClassesGiven ?? 0}{" "}
                {(selected.totalClassesGiven ?? 0) === 1 ? "impartida" : "impartidas"}
              </p>
              {packageLoading ? (
                <p className="coaching-muted">Cargando movimientos…</p>
              ) : packageError ? (
                <p className="coaching-muted">{packageError}</p>
              ) : packageMoves.length === 0 ? (
                <p className="coaching-muted">Sin movimientos registrados.</p>
              ) : (
                <ul className="coach-file-ledger">
                  {packageMoves.map((move) => (
                    <li key={move.id}>
                      <span>{shortWhen(move.createdAt)}</span>
                      <span>
                        {move.tipo === "PACKAGE_CREDIT"
                          ? "Asignación"
                          : move.tipo === "CLASS_DEBIT"
                          ? "Clase impartida"
                          : move.tipo === "ADJUSTMENT"
                          ? "Ajuste"
                          : move.tipo === "TRANSFER_IN"
                          ? "Transferencia entrada"
                          : "Transferencia salida"}
                      </span>
                      <strong>
                        {move.delta > 0 ? `+${move.delta}` : move.delta}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <p className="coach-roster__placeholder">
            Selecciona un alumno para consultar sus clases y seguimiento.
          </p>
        )}
      </div> : null}
    </section>
  );
};
