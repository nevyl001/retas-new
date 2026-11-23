import React, { useEffect, useMemo, useState } from "react";
import * as clubExperience from "../../club-experience";
import type { LigaDetalle, LigaJornada, LigaJugadorPoolItem, LigaPartido } from "../../lib/liga/types";
import {
  generateFlexSchedule,
  officialFlexLayout,
  regenerateFlexSchedule,
  scheduleHasCapturedResults,
  type FlexSchedule,
} from "../../lib/liga/flex/schedule";
import { rankFlexJornada } from "../../lib/liga/flex/standings";
import { honorResolution, rankFlexSeason } from "../../lib/liga/flex/season";
import { windowMinutes } from "../../lib/liga/flex/time";
import { JUGADOR_CATEGORIA_LABELS } from "../../lib/rivieraJugadores/constants";
import {
  applyFlexJornada,
  closeFlexLeague,
  confirmFlexSchedule,
  correctFlexJornada,
  loadFlexLeague,
  markFlexFinal,
  reopenFlexLeague,
  resizeFlexCalendar,
  registerFlexPlayer,
  saveFlexJornadaSetup,
  saveFlexMatchScore,
  setFlexParticipantes,
  startFlexJornada,
  type FlexBundle,
  type FlexJornadaRow,
} from "../../services/ligaFlexService";
import { Button } from "../ui";
import { TablerIcon } from "../ui/TablerIcon";
import { LigaPageShell } from "./LigaPageShell";
import { navigateLiga } from "./ligaNav";
import "./liga-flex.css";

type Props = {
  detalle: LigaDetalle;
  pool: LigaJugadorPoolItem[];
  onReload: () => void;
};

export type FlexAdminTab = "resumen" | "jornadas" | "clasificacion" | "jugadores";

export type FlexJornadaVisualState =
  | "pendiente"
  | "configurada"
  | "en_curso"
  | "finalizada";

export function resolveFlexJornadaVisualState(
  jornada: LigaJornada,
  flexRow: FlexJornadaRow | null | undefined,
  participantCount: number
): {
  key: FlexJornadaVisualState;
  label: string;
} {
  if (jornada.estado === "completed") {
    return { key: "finalizada", label: "Finalizada" };
  }
  if (jornada.estado === "in_progress") {
    return { key: "en_curso", label: "En curso" };
  }
  const hasConfirmedSchedule =
    flexRow?.programacionEstado === "confirmada" ||
    (jornada.partidos?.length ?? 0) > 0;
  const hasSetupData =
    hasConfirmedSchedule ||
    Boolean(jornada.fecha) ||
    participantCount >= 12;
  if (hasSetupData) {
    return { key: "configurada", label: "Configurada" };
  }
  return { key: "pendiente", label: "Pendiente" };
}

function formatShortDate(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  const parts = fecha.split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return fecha;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.slice(0, 1).toUpperCase())
      .join("") || "J"
  );
}

export const LigaFlexAdmin: React.FC<Props> = ({ detalle, pool, onReload }) => {
  const clubEyebrow =
    typeof clubExperience.useClubModeEyebrow === "function"
      ? clubExperience.useClubModeEyebrow()
      : undefined;
  const branding =
    typeof clubExperience.useBranding === "function"
      ? clubExperience.useBranding()
      : undefined;
  const clubName = branding?.nombre || clubEyebrow || "Riviera Open";

  const [activeTab, setActiveTab] = useState<FlexAdminTab>("jornadas");
  const [bundle, setBundle] = useState<FlexBundle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<FlexSchedule | null>(null);
  const [query, setQuery] = useState("");
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [participantFilter, setParticipantFilter] = useState<"ALL" | "SELECTED" | "AVAILABLE">("ALL");
  const [showNewPlayerForm, setShowNewPlayerForm] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [nuevoGenero, setNuevoGenero] = useState<"M" | "F">("M");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jornadaOrden, setJornadaOrden] = useState<string[]>([]);
  const [jornadaMotivo, setJornadaMotivo] = useState("");
  const [seasonOrden, setSeasonOrden] = useState<string[]>([]);
  const [seasonTied, setSeasonTied] = useState<string[]>([]);
  const [correctionMotivo, setCorrectionMotivo] = useState("");
  const [correctionOrden, setCorrectionOrden] = useState<string[]>([]);
  const [correctionTies, setCorrectionTies] = useState<string[][]>([]);
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [reopenMotivo, setReopenMotivo] = useState("");

  const sortedJornadas = useMemo(
    () => detalle.jornadas.slice().sort((a, b) => a.numero - b.numero),
    [detalle.jornadas]
  );

  const refresh = async () => {
    const next = await loadFlexLeague(detalle.id);
    setBundle(next);
    setSelectedId((current) => current ?? sortedJornadas[0]?.id ?? null);
  };

  useEffect(() => {
    let active = true;
    void loadFlexLeague(detalle.id)
      .then((next) => {
        if (!active) return;
        setBundle(next);
        setSelectedId((current) => current ?? sortedJornadas[0]?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "No se pudo cargar Flex League.");
      });
    return () => {
      active = false;
    };
  }, [detalle.id, detalle.estado, sortedJornadas]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of pool) map.set(player.id, player.nombre);
    for (const player of detalle.jugadores) map.set(player.id, player.nombre);
    return map;
  }, [pool, detalle.jugadores]);

  const playerDetailsById = useMemo(() => {
    const map = new Map<string, LigaJugadorPoolItem>();
    for (const player of detalle.jugadores) {
      map.set(player.id, {
        ...player,
        categoria: null,
        riviera_id: null,
        foto_url: null,
      });
    }
    for (const player of pool) {
      map.set(player.id, player);
    }
    return map;
  }, [pool, detalle.jugadores]);

  const jornada = sortedJornadas.find((item) => item.id === selectedId) ?? sortedJornadas[0] ?? null;
  const partidos = useMemo(
    () => hydrateFlexPartidos(jornada?.partidos ?? [], jornada?.parejas ?? []),
    [jornada]
  );
  const flex = bundle?.jornadas.find((item) => item.jornadaId === jornada?.id) ?? null;
  const participantIds = useMemo(
    () => (jornada ? bundle?.participantes[jornada.id] ?? [] : []),
    [jornada, bundle]
  );
  const layout = officialFlexLayout(participantIds.length, flex?.canchas ?? 0);
  const hasScores = scheduleHasCapturedResults(
    (jornada?.partidos ?? []).map((partido) => ({
      scoreA: partido.score_pareja1,
      scoreB: partido.score_pareja2,
    }))
  );
  const retaMinutos = flex ? windowMinutes(flex.horaInicio, flex.horaFin) : null;

  const season = useMemo(() => {
    if (!bundle) return null;
    return rankFlexSeason({
      awards: bundle.posiciones.map((row) => ({
        jornadaNumero: detalle.jornadas.find((j) => j.id === row.jornadaId)?.numero ?? 0,
        jugadorId: row.jugadorId,
        posicion: row.posicion,
        puntos: row.puntos,
      })),
      resolution: honorResolution(bundle.honores),
    });
  }, [bundle, detalle.jornadas]);

  const unresolved = useMemo(() => {
    if (!jornada || jornada.estado === "completed") return null;
    const ids = bundle?.participantes[jornada.id] ?? [];
    return rankFlexJornada({
      players: ids.map((id) => ({ id, name: names.get(id) ?? "Jugador" })),
      matches: partidos.map(toScored),
    });
  }, [jornada, bundle, names, partidos]);

  const provisional = useMemo(() => {
    if (!unresolved) return null;
    if (unresolved.ok || unresolved.ties.length === 0) return unresolved;
    const ids = jornada ? bundle?.participantes[jornada.id] ?? [] : [];
    return rankFlexJornada({
      players: ids.map((id) => ({ id, name: names.get(id) ?? "Jugador" })),
      matches: partidos.map(toScored),
      resolution: jornadaOrden,
    });
  }, [unresolved, jornada, bundle, names, jornadaOrden, partidos]);

  // Métricas reales del header y temporada
  const completedJornadasCount = useMemo(
    () => sortedJornadas.filter((j) => j.estado === "completed").length,
    [sortedJornadas]
  );

  const nextJornada = useMemo(
    () =>
      sortedJornadas.find((j) => j.estado === "in_progress") ??
      sortedJornadas.find((j) => j.estado !== "completed") ??
      null,
    [sortedJornadas]
  );

  const nextJornadaFlex = useMemo(
    () => (nextJornada ? bundle?.jornadas.find((r) => r.jornadaId === nextJornada.id) ?? null : null),
    [nextJornada, bundle]
  );

  const seasonParticipantSet = useMemo(() => {
    const ids = new Set<string>();
    for (const p of detalle.jugadores) ids.add(p.id);
    for (const i of detalle.inscripciones) ids.add(i.jugador_id);
    if (bundle) {
      Object.values(bundle.participantes).forEach((list) => {
        list.forEach((id) => ids.add(id));
      });
      bundle.posiciones.forEach((pos) => ids.add(pos.jugadorId));
    }
    return ids;
  }, [detalle.jugadores, detalle.inscripciones, bundle]);

  const registeredPlayersCount =
    seasonParticipantSet.size > 0 ? seasonParticipantSet.size : pool.length;

  const convocatoriasByPlayer = useMemo(() => {
    const map = new Map<string, number[]>();
    if (!bundle) return map;
    for (const j of sortedJornadas) {
      const list = bundle.participantes[j.id] ?? [];
      for (const pid of list) {
        const arr = map.get(pid) ?? [];
        arr.push(j.numero);
        map.set(pid, arr);
      }
    }
    return map;
  }, [bundle, sortedJornadas]);

  const seasonPointsByPlayer = useMemo(() => {
    const map = new Map<string, { puntos: number; jj: number; posicion: number | null }>();
    if (season?.ok) {
      for (const row of season.rows) {
        map.set(row.jugadorId, {
          puntos: row.puntos,
          jj: row.jornadasJugadas,
          posicion: row.posicion,
        });
      }
    }
    return map;
  }, [season]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const playersOf = (ids: string[]) =>
    ids.map((id) => ({ id, name: names.get(id) ?? "Jugador" }));

  const filteredPool = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pool.filter((player) => {
      const selected = participantIds.includes(player.id);
      if (participantFilter === "SELECTED" && !selected) return false;
      if (participantFilter === "AVAILABLE" && selected) return false;
      if (!q) return true;
      const text = `${player.nombre} ${player.riviera_id ?? ""} ${player.email ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [pool, query, participantIds, participantFilter]);

  const directoryPlayers = useMemo(() => {
    const q = directoryQuery.trim().toLowerCase();
    const allPlayers = Array.from(playerDetailsById.values());
    return allPlayers
      .filter((player) => {
        if (!q) return true;
        const text = `${player.nombre} ${player.riviera_id ?? ""} ${player.email ?? ""}`.toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => {
        const ptsA = seasonPointsByPlayer.get(a.id)?.puntos ?? -1;
        const ptsB = seasonPointsByPlayer.get(b.id)?.puntos ?? -1;
        if (ptsA !== ptsB) return ptsB - ptsA;
        const convA = convocatoriasByPlayer.get(a.id)?.length ?? 0;
        const convB = convocatoriasByPlayer.get(b.id)?.length ?? 0;
        if (convA !== convB) return convB - convA;
        return a.nombre.localeCompare(b.nombre, "es");
      });
  }, [playerDetailsById, directoryQuery, seasonPointsByPlayer, convocatoriasByPlayer]);

  const leagueStatusMeta = useMemo(() => {
    if (detalle.estado === "completed") {
      return { key: "completed", label: "FINALIZADA" };
    }
    if (detalle.estado === "archived") {
      return { key: "archived", label: "ARCHIVADA" };
    }
    if (detalle.estado === "in_progress" || completedJornadasCount > 0) {
      return { key: "in_progress", label: "EN CURSO" };
    }
    return { key: "upcoming", label: "POR COMENZAR" };
  }, [detalle.estado, completedJornadasCount]);

  const totalJornadas = sortedJornadas.length || bundle?.config.jornadasPlaneadas || 12;
  const progressPercent = Math.round(
    (completedJornadasCount / Math.max(1, totalJornadas)) * 100
  );

  const handleRegisterNewPlayer = () =>
    void run(async () => {
      const normalized = nuevoNombre.trim().toLowerCase();
      if (pool.some((player) => player.nombre.trim().toLowerCase() === normalized)) {
        throw new Error("Ese jugador ya existe. Selecciónalo de la lista.");
      }
      await registerFlexPlayer({
        nombre: nuevoNombre.trim(),
        email: nuevoEmail,
        genero: nuevoGenero,
      });
      setNuevoNombre("");
      setNuevoEmail("");
      setShowNewPlayerForm(false);
      setNotice("Jugador registrado en la temporada.");
    });

  const currentJornadaState = jornada
    ? resolveFlexJornadaVisualState(jornada, flex, participantIds.length)
    : null;

  return (
    <LigaPageShell className="liga-flex">
      <div className="liga-flex-console">
        {/* ═══════════════════════════════════════════════════════════
            1. HEADER PREMIUM DE LA LIGA + KPIs REALES
            ═══════════════════════════════════════════════════════════ */}
        <header className="liga-flex-header">
          <div className="liga-flex-header__topbar">
            <Button
              type="button"
              variant="back"
              className="liga-flex-header__back"
              onClick={() => navigateLiga("/liga")}
            >
              <TablerIcon name="arrow-left" size={16} />
              <span>Volver a ligas</span>
            </Button>

            <span
              className={`liga-flex-status-pill liga-flex-status-pill--${leagueStatusMeta.key}`}
            >
              <span className="liga-flex-status-pill__dot" aria-hidden />
              {leagueStatusMeta.label}
            </span>
          </div>

          <div className="liga-flex-header__main">
            <div className="liga-flex-header__identity">
              <p className="liga-flex__kicker">RIVIERA FLEX LEAGUE</p>
              <h1 className="liga-flex-header__title">{detalle.nombre}</h1>
              <div className="liga-flex-header__meta">
                <span className="liga-flex-header__meta-chip">
                  <TablerIcon name="building-community" size={14} />
                  {clubName}
                </span>
                <span className="liga-flex-header__meta-sep" aria-hidden>
                  ·
                </span>
                <span className="liga-flex-header__meta-chip">
                  <TablerIcon name="award" size={14} />
                  {bundle?.config.categoria || "Categoría abierta"}
                </span>
                <span className="liga-flex-header__meta-sep" aria-hidden>
                  ·
                </span>
                <span className="liga-flex-header__meta-chip">
                  <TablerIcon name="ball-tennis" size={14} />
                  Participación voluntaria · Horario por jornada
                </span>
              </div>
            </div>
          </div>

          {/* Tarjetas compactas con indicadores reales */}
          <div className="liga-flex-kpis" aria-label="Indicadores de la liga">
            <article className="liga-flex-kpi">
              <span className="liga-flex-kpi__label">
                <TablerIcon name="calendar" size={14} />
                Jornadas totales
              </span>
              <strong className="liga-flex-kpi__value">{sortedJornadas.length}</strong>
              <span className="liga-flex-kpi__sub">
                Calendario oficial de {bundle?.config.jornadasPlaneadas ?? 12} fechas
              </span>
            </article>

            <article className="liga-flex-kpi">
              <span className="liga-flex-kpi__label">
                <TablerIcon name="circle-check" size={14} />
                Jornadas completadas
              </span>
              <strong className="liga-flex-kpi__value">
                {completedJornadasCount}
                <span className="liga-flex-kpi__value-unit">
                  / {sortedJornadas.length}
                </span>
              </strong>
              <span className="liga-flex-kpi__sub">
                {progressPercent}% de avance de temporada
              </span>
            </article>

            <article className="liga-flex-kpi">
              <span className="liga-flex-kpi__label">
                <TablerIcon name="users" size={14} />
                Jugadores registrados
              </span>
              <strong className="liga-flex-kpi__value">{registeredPlayersCount}</strong>
              <span className="liga-flex-kpi__sub">
                {pool.length} jugadores activos en el club
              </span>
            </article>

            <article className="liga-flex-kpi">
              <span className="liga-flex-kpi__label">
                <TablerIcon name="clock" size={14} />
                Próxima jornada
              </span>
              <strong className="liga-flex-kpi__value liga-flex-kpi__value--next">
                {nextJornada
                  ? `Jornada ${String(nextJornada.numero).padStart(2, "0")}`
                  : "Temporada cerrada"}
              </strong>
              <span className="liga-flex-kpi__sub">
                {nextJornada
                  ? formatShortDate(nextJornada.fecha)
                    ? `${formatShortDate(nextJornada.fecha)}${
                        nextJornadaFlex?.horaInicio ? ` · ${nextJornadaFlex.horaInicio}` : ""
                      }`
                    : "Fecha por programar"
                  : "Todas las jornadas finalizadas"}
              </span>
            </article>
          </div>
        </header>

        {/* Alertas y avisos de operación */}
        {error ? (
          <div className="liga-flex-alert liga-flex-alert--error" role="alert">
            <TablerIcon name="alert-circle" size={18} />
            <span>{error}</span>
          </div>
        ) : null}
        {notice ? (
          <div className="liga-flex-alert liga-flex-alert--notice" role="status">
            <TablerIcon name="circle-check" size={18} />
            <span>{notice}</span>
          </div>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════
            2. NAVEGACIÓN PRINCIPAL POR PESTAÑAS
            ═══════════════════════════════════════════════════════════ */}
        <nav className="liga-flex-tabs" role="tablist" aria-label="Secciones de Riviera Flex League">
          {(
            [
              {
                id: "resumen" as const,
                label: "Resumen",
                icon: "layout-dashboard",
                count: null,
              },
              {
                id: "jornadas" as const,
                label: "Jornadas",
                icon: "calendar-event",
                count: sortedJornadas.length,
              },
              {
                id: "clasificacion" as const,
                label: "Clasificación",
                icon: "trophy",
                count: season?.ok ? season.rows.length : null,
              },
              {
                id: "jugadores" as const,
                label: "Jugadores",
                icon: "users",
                count: pool.length,
              },
            ] as const
          ).map((t) => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`liga-flex-tab${isActive ? " is-active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                <TablerIcon name={t.icon} size={16} />
                <span>{t.label}</span>
                {t.count != null && t.count > 0 ? (
                  <span className="liga-flex-tab__badge">{t.count}</span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* ═══════════════════════════════════════════════════════════
            3. PESTAÑA: RESUMEN DE TEMPORADA
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === "resumen" ? (
          <div className="liga-flex-overview-grid" role="tabpanel" aria-label="Resumen de temporada">
            <section className="liga-flex-card">
              <div className="liga-flex-card__head">
                <div>
                  <span className="liga-flex-card__eyebrow">Control de temporada</span>
                  <h2 className="liga-flex-card__title">Estado general y progreso</h2>
                </div>
                <span className="liga-flex-pill">
                  {completedJornadasCount} de {sortedJornadas.length} completadas
                </span>
              </div>

              <p className="liga-flex-card__desc">
                Temporada oficial de 12 jornadas. La asistencia de cada fecha es voluntaria y los puntos se suman por posición oficial en cada jornada cerrada.
              </p>

              <div className="liga-flex-progress">
                <div className="liga-flex-progress__bar">
                  <div
                    className="liga-flex-progress__fill"
                    style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                  />
                </div>
                <div className="liga-flex-progress__labels">
                  <span>Progreso de jornadas</span>
                  <strong>{progressPercent}%</strong>
                </div>
              </div>

              <div className="liga-flex-season-specs">
                <div className="liga-flex-season-spec">
                  <span className="liga-flex-season-spec__label">Inscripción temporada</span>
                  <strong className="liga-flex-season-spec__value">
                    ${bundle?.config.inscripcionTemporadaMxn ?? "—"} MXN
                  </strong>
                </div>
                <div className="liga-flex-season-spec">
                  <span className="liga-flex-season-spec__label">Participación jornada</span>
                  <strong className="liga-flex-season-spec__value">
                    ${bundle?.config.participacionJornadaMxn ?? "—"} MXN
                  </strong>
                </div>
                <div className="liga-flex-season-spec">
                  <span className="liga-flex-season-spec__label">Premio Campeón</span>
                  <strong className="liga-flex-season-spec__value">
                    {bundle?.config.premioCampeon || "—"}
                  </strong>
                </div>
              </div>

              <div className="liga-flex-season-actions">
                {detalle.jornadas.length !== 12 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await resizeFlexCalendar({
                          ligaId: detalle.id,
                          targetCount: 12,
                          canchas: detalle.canchas_disponibles,
                          jornadas: detalle.jornadas.map((item) => ({
                            id: item.id,
                            numero: item.numero,
                            hasOfficialResults: (bundle?.posiciones ?? []).some(
                              (row) => row.jornadaId === item.id
                            ),
                          })),
                        });
                      })
                    }
                  >
                    Ajustar a 12 jornadas
                  </Button>
                ) : null}

                {detalle.estado === "completed" ? (
                  <div className="liga-flex-reopen-bar">
                    <input
                      className="liga-flex-input"
                      value={reopenMotivo}
                      placeholder="Motivo de reapertura"
                      onChange={(event) => setReopenMotivo(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void run(() => reopenFlexLeague(detalle.id, reopenMotivo))}
                    >
                      Reabrir liga
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const outcome = await closeFlexLeague(detalle.id, seasonOrden);
                        if (outcome.needsResolution) {
                          setSeasonTied(outcome.tied ?? []);
                          setSeasonOrden(outcome.tied ?? []);
                          throw new Error(outcome.error || "El podio necesita una resolución.");
                        }
                        setSeasonTied([]);
                        setNotice("Liga finalizada. El podio quedó registrado una sola vez.");
                      })
                    }
                  >
                    Cerrar liga
                  </Button>
                )}
              </div>

              {seasonTied.length > 0 ? (
                <TieOrder
                  title="Empate de podio"
                  note="Ya se compararon puntos, veces en cada posición y jornadas jugadas. Ordena solo a quienes siguen empatados."
                  ids={seasonOrden}
                  names={names}
                  onChange={setSeasonOrden}
                />
              ) : null}
            </section>

            <div className="liga-flex-overview-side">
              {/* Tarjeta de próxima jornada y accesos directos */}
              <section className="liga-flex-card">
                <div className="liga-flex-card__head">
                  <div>
                    <span className="liga-flex-card__eyebrow">Operación inmediata</span>
                    <h2 className="liga-flex-card__title">
                      {nextJornada
                        ? `Próxima: Jornada ${String(nextJornada.numero).padStart(2, "0")}`
                        : "Calendario de jornadas"}
                    </h2>
                  </div>
                  {nextJornada ? (
                    <span
                      className={`liga-flex-jornada-badge liga-flex-jornada-badge--${
                        resolveFlexJornadaVisualState(
                          nextJornada,
                          nextJornadaFlex,
                          (bundle?.participantes[nextJornada.id] ?? []).length
                        ).key
                      }`}
                    >
                      {
                        resolveFlexJornadaVisualState(
                          nextJornada,
                          nextJornadaFlex,
                          (bundle?.participantes[nextJornada.id] ?? []).length
                        ).label
                      }
                    </span>
                  ) : null}
                </div>

                {nextJornada ? (
                  <div className="liga-flex-next-summary">
                    <div className="liga-flex-next-summary__grid">
                      <div>
                        <span className="liga-flex-next-summary__label">Fecha y horario</span>
                        <strong>
                          {formatShortDate(nextJornada.fecha) || "Sin fecha asignada"}
                          {nextJornadaFlex?.horaInicio ? ` · ${nextJornadaFlex.horaInicio}` : ""}
                        </strong>
                      </div>
                      <div>
                        <span className="liga-flex-next-summary__label">Convocados</span>
                        <strong>
                          {(bundle?.participantes[nextJornada.id] ?? []).length} / 16 jugadores
                        </strong>
                      </div>
                      <div>
                        <span className="liga-flex-next-summary__label">Formato</span>
                        <strong>
                          {nextJornadaFlex?.canchas ?? detalle.canchas_disponibles} canchas ·{" "}
                          {nextJornadaFlex?.rondas ?? 5} rondas
                        </strong>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => {
                        setSelectedId(nextJornada.id);
                        setActiveTab("jornadas");
                      }}
                    >
                      Gestionar Jornada {String(nextJornada.numero).padStart(2, "0")}
                    </Button>
                  </div>
                ) : (
                  <p className="liga-flex-card__desc">
                    Todas las jornadas del calendario se encuentran completadas.
                  </p>
                )}

                <div className="liga-flex-quick-links">
                  <button
                    type="button"
                    className="liga-flex-quick-link"
                    onClick={() => setActiveTab("jornadas")}
                  >
                    <TablerIcon name="calendar-event" size={16} />
                    <span>Ir a gestión de jornadas</span>
                    <TablerIcon name="chevron-right" size={15} />
                  </button>
                  <button
                    type="button"
                    className="liga-flex-quick-link"
                    onClick={() => setActiveTab("clasificacion")}
                  >
                    <TablerIcon name="trophy" size={16} />
                    <span>Consultar clasificación general</span>
                    <TablerIcon name="chevron-right" size={15} />
                  </button>
                  <button
                    type="button"
                    className="liga-flex-quick-link"
                    onClick={() => setActiveTab("jugadores")}
                  >
                    <TablerIcon name="users" size={16} />
                    <span>Abrir directorio de jugadores</span>
                    <TablerIcon name="chevron-right" size={15} />
                  </button>
                </div>
              </section>

              {/* Podio o Top 5 en Resumen */}
              <section className="liga-flex-card">
                <div className="liga-flex-card__head">
                  <div>
                    <span className="liga-flex-card__eyebrow">Rendimiento acumulado</span>
                    <h2 className="liga-flex-card__title">Líderes de la temporada</h2>
                  </div>
                  <button
                    type="button"
                    className="liga-flex-link-btn"
                    onClick={() => setActiveTab("clasificacion")}
                  >
                    Ver tabla completa
                  </button>
                </div>

                {bundle?.honores ? (
                  <ol className="liga-flex__podio">
                    <li>
                      <span className="liga-flex__kicker">1º Campeón</span>
                      <strong>{names.get(bundle.honores.campeonId) ?? "Jugador"}</strong>
                    </li>
                    <li>
                      <span className="liga-flex__kicker">2º Subcampeón</span>
                      <strong>{names.get(bundle.honores.subcampeonId) ?? "Jugador"}</strong>
                    </li>
                    <li>
                      <span className="liga-flex__kicker">3º Tercer lugar</span>
                      <strong>
                        {bundle.honores.tercerId
                          ? names.get(bundle.honores.tercerId) ?? "Jugador"
                          : "—"}
                      </strong>
                    </li>
                  </ol>
                ) : null}

                {season?.ok && season.rows.length > 0 ? (
                  <ul className="liga-flex-mini-standings">
                    {season.rows.slice(0, 5).map((row) => (
                      <li key={row.jugadorId} className="liga-flex-mini-standings__row">
                        <span className="liga-flex-mini-standings__pos">{row.posicion}º</span>
                        <span className="liga-flex-mini-standings__name">
                          {names.get(row.jugadorId) ?? "Jugador"}
                        </span>
                        <span className="liga-flex-mini-standings__jj">
                          {row.jornadasJugadas} JJ
                        </span>
                        <strong className="liga-flex-mini-standings__pts">
                          {row.puntos} pts
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="liga-flex__empty">
                    {season && !season.ok
                      ? season.reason
                      : "Todavía no hay jornadas cerradas con puntos oficiales."}
                  </p>
                )}
              </section>
            </div>
          </div>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════
            4. PESTAÑA: GESTIÓN DE JORNADAS (2 COLUMNAS 65% / 35%)
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === "jornadas" ? (
          <div className="liga-flex-jornadas-section" role="tabpanel" aria-label="Gestión de jornadas">
            {/* Selector horizontal moderno de jornadas J01–J12 */}
            <div className="liga-flex-selector-card">
              <div className="liga-flex-selector-card__head">
                <span className="liga-flex-card__eyebrow">Calendario de competencia</span>
                <div className="liga-flex-selector-legend">
                  <span className="liga-flex-legend-item is-pendiente">Pendiente</span>
                  <span className="liga-flex-legend-item is-configurada">Configurada</span>
                  <span className="liga-flex-legend-item is-en_curso">En curso</span>
                  <span className="liga-flex-legend-item is-finalizada">Finalizada</span>
                </div>
              </div>

              <div className="liga-flex__jornadas" role="tablist" aria-label="Selector de jornadas">
                {sortedJornadas.map((item) => {
                  const itemFlex = bundle?.jornadas.find((row) => row.jornadaId === item.id);
                  const itemParticipants = (bundle?.participantes[item.id] ?? []).length;
                  const visualState = resolveFlexJornadaVisualState(
                    item,
                    itemFlex,
                    itemParticipants
                  );
                  const isSelected = item.id === jornada?.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className={`liga-flex-jornada-pill is-${visualState.key}${
                        isSelected ? " is-selected" : ""
                      }`}
                      onClick={() => {
                        setSelectedId(item.id);
                        setPreview(null);
                      }}
                    >
                      <div className="liga-flex-jornada-pill__top">
                        <span className="liga-flex-jornada-pill__code">
                          J{String(item.numero).padStart(2, "0")}
                        </span>
                        {itemFlex?.esFinal ? (
                          <span className="liga-flex-jornada-pill__final">Final</span>
                        ) : null}
                      </div>
                      <span className="liga-flex-jornada-pill__status">
                        {visualState.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {jornada && flex ? (
              <div className="liga-flex-workspace">
                {/* ── COLUMNA PRINCIPAL (65%): PARTICIPANTES + PAREJAS/PARTIDOS ── */}
                <div className="liga-flex-workspace__main">
                  {/* TARJETA 1: PARTICIPANTES DE LA JORNADA */}
                  <section className="liga-flex-card">
                    <div className="liga-flex-card__head">
                      <div>
                        <span className="liga-flex-card__eyebrow">
                          Jornada {String(jornada.numero).padStart(2, "0")}
                        </span>
                        <h2 className="liga-flex-card__title">PARTICIPANTES DE LA JORNADA</h2>
                      </div>
                      <div className="liga-flex-participants-counter">
                        <strong
                          className={
                            layout.ok
                              ? "is-ready"
                              : participantIds.length > 0
                              ? "is-warning"
                              : ""
                          }
                        >
                          {participantIds.length} / 16
                        </strong>
                        <span>jugadores</span>
                      </div>
                    </div>

                    <div
                      className={`liga-flex-capacity-banner${
                        layout.ok
                          ? " is-valid"
                          : participantIds.length > 0
                          ? " is-warning"
                          : ""
                      }`}
                    >
                      <TablerIcon
                        name={layout.ok ? "circle-check" : "info-circle"}
                        size={16}
                      />
                      <span>
                        {layout.ok
                          ? `Cupo oficial validado: ${participantIds.length} jugadores en ${layout.courtsUsed} canchas simultáneas.`
                          : participantIds.length > 0
                          ? layout.error
                          : "Selecciona 12 jugadores (3 canchas) o 16 jugadores (4 canchas) para habilitar la generación de parejas."}
                      </span>
                    </div>

                    {/* Chips de jugadores convocados en esta fecha */}
                    <div className="liga-flex-selected-roster">
                      <div className="liga-flex-selected-roster__head">
                        <span className="liga-flex-selected-roster__title">
                          Convocados en esta fecha ({participantIds.length})
                        </span>
                      </div>
                      {participantIds.length === 0 ? (
                        <p className="liga-flex__empty">
                          Aún no hay jugadores convocados en esta jornada. Agrégalos desde el directorio inferior.
                        </p>
                      ) : (
                        <div className="liga-flex-selected-chips">
                          {participantIds.map((pid, idx) => {
                            const pInfo = playerDetailsById.get(pid);
                            const pName = names.get(pid) ?? "Jugador";
                            return (
                              <div key={pid} className="liga-flex-selected-chip">
                                <span className="liga-flex-selected-chip__num">
                                  {idx + 1}
                                </span>
                                <span className="liga-flex-selected-chip__name">
                                  {pName}
                                </span>
                                {pInfo?.riviera_id ? (
                                  <span className="liga-flex-selected-chip__code">
                                    {pInfo.riviera_id}
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  className="liga-flex-selected-chip__remove"
                                  disabled={busy || hasScores || jornada.estado === "completed"}
                                  onClick={() => {
                                    const next = participantIds.filter((id) => id !== pid);
                                    void run(() => setFlexParticipantes(jornada.id, next));
                                  }}
                                  aria-label={`Quitar a ${pName}`}
                                  title="Quitar de la jornada"
                                >
                                  <TablerIcon name="x" size={13} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Buscador y filtros para convocar del pool */}
                    <div className="liga-flex-pool-toolbar">
                      <div className="liga-flex-search-box">
                        <TablerIcon name="search" size={15} className="liga-flex-search-box__icon" />
                        <input
                          className="liga-flex-input liga-flex-search-box__input"
                          value={query}
                          placeholder="Buscar por nombre o Riviera ID"
                          onChange={(event) => setQuery(event.target.value)}
                        />
                        {query ? (
                          <button
                            type="button"
                            className="liga-flex-search-box__clear"
                            onClick={() => setQuery("")}
                            aria-label="Limpiar búsqueda"
                          >
                            <TablerIcon name="x" size={13} />
                          </button>
                        ) : null}
                      </div>

                      <div className="liga-flex-pool-filters">
                        {(
                          [
                            { id: "ALL", label: "Todos" },
                            { id: "AVAILABLE", label: "Disponibles" },
                            { id: "SELECTED", label: "Convocados" },
                          ] as const
                        ).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className={`liga-flex-filter-pill${
                              participantFilter === f.id ? " is-active" : ""
                            }`}
                            onClick={() => setParticipantFilter(f.id)}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <ul className="liga-flex__people liga-flex-people-grid">
                      {filteredPool.slice(0, 16).map((player) => {
                        const selected = participantIds.includes(player.id);
                        return (
                          <li
                            key={player.id}
                            className={`liga-flex-person-card${selected ? " is-selected" : ""}`}
                          >
                            <div className="liga-flex-person-card__avatar" aria-hidden>
                              {player.foto_url ? (
                                <img src={player.foto_url} alt={player.nombre} />
                              ) : (
                                getInitials(player.nombre)
                              )}
                            </div>
                            <div className="liga-flex-person-card__info">
                              <strong className="liga-flex-person-card__name">
                                {player.nombre}
                              </strong>
                              <span className="liga-flex-person-card__meta">
                                {player.riviera_id || "Sin Riviera ID"}
                                {player.categoria
                                  ? ` · ${
                                      JUGADOR_CATEGORIA_LABELS[player.categoria] ||
                                      player.categoria
                                    }`
                                  : ""}
                              </span>
                            </div>
                            <button
                              type="button"
                              className={`liga-flex-person-card__btn${
                                selected ? " is-remove" : " is-add"
                              }`}
                              disabled={
                                busy ||
                                hasScores ||
                                jornada.estado === "completed" ||
                                (!selected && participantIds.length >= 16)
                              }
                              onClick={() => {
                                const next = selected
                                  ? participantIds.filter((id) => id !== player.id)
                                  : [...participantIds, player.id];
                                void run(() => setFlexParticipantes(jornada.id, next));
                              }}
                            >
                              {selected ? "Quitar" : "Agregar"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    {/* Alta rápida de jugador nuevo en la temporada */}
                    <div className="liga-flex-new-player-box">
                      <div className="liga-flex-new-player-box__head">
                        <span className="liga-flex-new-player-box__title">
                          <TablerIcon name="user-plus" size={15} />
                          Registrar jugador nuevo en la temporada
                        </span>
                        <button
                          type="button"
                          className="liga-flex-link-btn"
                          onClick={() => setShowNewPlayerForm((v) => !v)}
                        >
                          {showNewPlayerForm ? "Ocultar formulario" : "Nuevo jugador"}
                        </button>
                      </div>

                      <div
                        className={`liga-flex-new-player-form${
                          showNewPlayerForm ? " is-open" : ""
                        }`}
                      >
                        <label className="liga-flex-field">
                          <span>Nombre</span>
                          <input
                            className="liga-flex-input"
                            value={nuevoNombre}
                            placeholder="Jugador nuevo de la temporada"
                            onChange={(event) => setNuevoNombre(event.target.value)}
                          />
                        </label>
                        <label className="liga-flex-field">
                          <span>Correo</span>
                          <input
                            className="liga-flex-input"
                            type="email"
                            value={nuevoEmail}
                            placeholder="correo@club.local"
                            onChange={(event) => setNuevoEmail(event.target.value)}
                          />
                        </label>
                        <label className="liga-flex-field">
                          <span>Rama</span>
                          <select
                            className="liga-flex-input"
                            value={nuevoGenero}
                            onChange={(event) =>
                              setNuevoGenero(event.target.value === "F" ? "F" : "M")
                            }
                          >
                            <option value="M">Varonil</option>
                            <option value="F">Femenil</option>
                          </select>
                        </label>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy || !nuevoNombre.trim() || !nuevoEmail.trim()}
                          onClick={handleRegisterNewPlayer}
                        >
                          Dar de alta
                        </Button>
                      </div>
                    </div>
                  </section>

                  {/* TARJETA 2: PAREJAS, RONDAS Y PARTIDOS */}
                  <section className="liga-flex-card">
                    <div className="liga-flex-card__head">
                      <div>
                        <span className="liga-flex-card__eyebrow">Rotación y resultados</span>
                        <h2 className="liga-flex-card__title">PAREJAS, RONDAS Y PARTIDOS</h2>
                      </div>
                      <span className="liga-flex-pill">
                        {partidos.length > 0
                          ? `${partidos.length} partidos confirmados`
                          : preview
                          ? "Borrador generado"
                          : "Sin partidos"}
                      </span>
                    </div>

                    <div className="liga-flex__actions liga-flex-schedule-actions">
                      <Button
                        type="button"
                        variant="primary"
                        disabled={busy || hasScores || !layout.ok}
                        onClick={() => {
                          const schedule = generateFlexSchedule({
                            players: playersOf(participantIds),
                            courts: flex.canchas,
                            rounds: flex.rondas,
                            seed: Date.now() % 100000,
                          });
                          if (!schedule.ok) {
                            setError(schedule.error);
                            return;
                          }
                          setPreview(schedule);
                          setNotice(
                            schedule.quality.needsConfirmation
                              ? schedule.quality.limitations.join(" ")
                              : "Programación equilibrada lista para confirmar."
                          );
                        }}
                      >
                        <TablerIcon name="sparkles" size={15} />
                        <span>Generar parejas</span>
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy || !preview || hasScores}
                        onClick={() => {
                          if (!preview) return;
                          const next = regenerateFlexSchedule({
                            players: playersOf(participantIds),
                            courts: flex.canchas,
                            rounds: flex.rondas,
                            seed: preview.seed,
                            previousSignature: preview.signature,
                          });
                          if (!next.ok) {
                            setError(next.error);
                            return;
                          }
                          setPreview(next);
                          setNotice(
                            next.changed
                              ? "Hay otra distribución."
                              : "No apareció otra distribución distinta con la misma equidad."
                          );
                        }}
                      >
                        <TablerIcon name="refresh" size={15} />
                        <span>Regenerar parejas</span>
                      </Button>

                      <Button
                        type="button"
                        variant="primary"
                        disabled={busy || !preview}
                        onClick={() =>
                          preview
                            ? void run(async () => {
                                await confirmFlexSchedule({
                                  jornadaId: jornada.id,
                                  schedule: preview,
                                });
                                setPreview(null);
                                setNotice("Jornada confirmada.");
                              })
                            : undefined
                        }
                      >
                        <TablerIcon name="check" size={15} />
                        <span>Confirmar jornada</span>
                      </Button>
                    </div>

                    {preview ? <RoundPreview schedule={preview} names={names} /> : null}

                    {flex.advertencia ? (
                      <div className="liga-flex-warning-strip">
                        <TablerIcon name="alert-triangle" size={16} />
                        <span>{flex.advertencia}</span>
                      </div>
                    ) : null}

                    <MatchEditor
                      partidos={partidos}
                      names={names}
                      disabled={
                        busy ||
                        jornada.estado === "completed" ||
                        detalle.estado === "completed"
                      }
                      savedId={savedMatchId}
                      onSave={(partido, scoreA, scoreB) =>
                        void run(async () => {
                          await saveFlexMatchScore(partido.id, scoreA, scoreB);
                          setSavedMatchId(partido.id);
                          setNotice("Marcador guardado.");
                        })
                      }
                    />

                    {unresolved && !unresolved.ok
                      ? unresolved.ties.map((group, index) => (
                          <TieOrder
                            key={group.join("-")}
                            title={
                              unresolved.ties.length > 1
                                ? `Empate ${index + 1} de la jornada`
                                : "Empate de la jornada"
                            }
                            note="Games a favor, diferencia y enfrentamiento directo no los separan. El orden que confirmes solo aplica dentro de este empate."
                            ids={orderWithin(group, jornadaOrden)}
                            names={names}
                            stats={statsOf(partidos)}
                            onChange={(next) =>
                              setJornadaOrden(
                                mergeTieOrder(unresolved.ties, jornadaOrden, index, next)
                              )
                            }
                          />
                        ))
                      : null}

                    {provisional?.ok ? (
                      <div className="liga-flex-provisional-banner">
                        <TablerIcon name="circle-check" size={16} />
                        <span>
                          Clasificación provisional lista. El servidor vuelve a calcular los puntos al cerrar la jornada.
                        </span>
                      </div>
                    ) : null}

                    {jornada.estado === "completed" && detalle.estado !== "completed" ? (
                      <CorrectionPanel
                        partidos={partidos}
                        names={names}
                        motivo={correctionMotivo}
                        orden={correctionOrden}
                        ties={correctionTies}
                        busy={busy}
                        onMotivo={setCorrectionMotivo}
                        onOrden={setCorrectionOrden}
                        onSubmit={(marcadores) =>
                          void run(async () => {
                            const outcome = await correctFlexJornada({
                              jornadaId: jornada.id,
                              marcadores,
                              motivo: correctionMotivo,
                              orden: correctionOrden,
                            });
                            if (outcome.needsResolution) {
                              const groups = outcome.ties ?? [];
                              setCorrectionTies(groups);
                              setCorrectionOrden((current) =>
                                mergeTieOrder(groups, current, -1, [])
                              );
                              throw new Error(
                                outcome.error || "La corrección dejó un empate."
                              );
                            }
                            setCorrectionTies([]);
                            setNotice(
                              "Jornada corregida. Los puntos anteriores se sustituyeron."
                            );
                          })
                        }
                      />
                    ) : null}

                    {jornada.estado === "completed" && detalle.estado === "completed" ? (
                      <p className="liga-flex-closed-hint">
                        La temporada ya tiene campeón. Reábrela con motivo antes de corregir un marcador.
                      </p>
                    ) : null}
                  </section>
                </div>

                {/* ── COLUMNA SECUNDARIA (35%): CONFIGURACIÓN + RESUMEN OPERATIVO ── */}
                <aside className="liga-flex-workspace__side">
                  {/* TARJETA SECUNDARIA 1: CONFIGURACIÓN DE JORNADA */}
                  <section className="liga-flex-card">
                    <div className="liga-flex-card__head">
                      <div>
                        <span className="liga-flex-card__eyebrow">Parámetros técnicos</span>
                        <h3 className="liga-flex-card__title">CONFIGURACIÓN DE JORNADA</h3>
                      </div>
                    </div>

                    <ConfigFields
                      flex={flex}
                      fecha={jornada.fecha}
                      disabled={
                        busy ||
                        hasScores ||
                        jornada.estado === "completed" ||
                        detalle.estado === "completed"
                      }
                      onSave={(patch) =>
                        void run(() => saveFlexJornadaSetup(jornada.id, patch))
                      }
                    />
                  </section>

                  {/* TARJETA SECUNDARIA 2: RESUMEN OPERATIVO Y ACCIONES */}
                  <section className="liga-flex-card">
                    <div className="liga-flex-card__head">
                      <div>
                        <span className="liga-flex-card__eyebrow">Control de jornada</span>
                        <h3 className="liga-flex-card__title">
                          Jornada {String(jornada.numero).padStart(2, "0")}
                        </h3>
                      </div>
                      {currentJornadaState ? (
                        <span
                          className={`liga-flex-jornada-badge liga-flex-jornada-badge--${currentJornadaState.key}`}
                        >
                          {currentJornadaState.label}
                        </span>
                      ) : null}
                    </div>

                    <dl className="liga-flex-ops-summary">
                      <div className="liga-flex-ops-summary__row">
                        <dt>Participantes</dt>
                        <dd>{participantIds.length} / 16 jugadores</dd>
                      </div>
                      <div className="liga-flex-ops-summary__row">
                        <dt>Canchas utilizadas</dt>
                        <dd>{layout.ok ? `${layout.courtsUsed} canchas` : "—"}</dd>
                      </div>
                      <div className="liga-flex-ops-summary__row">
                        <dt>Formato de rondas</dt>
                        <dd>{flex.rondas} rondas</dd>
                      </div>
                      <div className="liga-flex-ops-summary__row">
                        <dt>Tiempo de la reta</dt>
                        <dd>{retaMinutos != null ? `${retaMinutos} min` : "—"}</dd>
                      </div>
                      <div className="liga-flex-ops-summary__row">
                        <dt>Programación</dt>
                        <dd>
                          {flex.programacionEstado === "confirmada"
                            ? "Confirmada"
                            : preview
                            ? "En vista previa"
                            : "Sin confirmar"}
                        </dd>
                      </div>
                    </dl>

                    <div className="liga-flex-side-actions">
                      <Button
                        type="button"
                        variant="secondary"
                        className="liga-flex-side-actions__btn"
                        disabled={
                          busy ||
                          flex.programacionEstado !== "confirmada" ||
                          jornada.estado !== "upcoming"
                        }
                        onClick={() =>
                          void run(() => startFlexJornada(jornada.id, detalle.id))
                        }
                      >
                        <TablerIcon name="player-play" size={15} />
                        <span>Iniciar jornada</span>
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        className="liga-flex-side-actions__btn"
                        disabled={busy || flex.esFinal}
                        onClick={() =>
                          void run(() =>
                            markFlexFinal({
                              ligaId: detalle.id,
                              jornadaId: jornada.id,
                              numero: jornada.numero,
                              jornadas: detalle.jornadas.map((item) => ({
                                id: item.id,
                                numero: item.numero,
                                hasData:
                                  (item.partidos?.length ?? 0) > 0 ||
                                  (bundle?.participantes[item.id]?.length ?? 0) > 0,
                              })),
                            })
                          )
                        }
                      >
                        <TablerIcon name="flag" size={15} />
                        <span>
                          {flex.esFinal ? "Jornada final marcada" : "Marcar jornada final"}
                        </span>
                      </Button>

                      <div className="liga-flex-close-jornada-box">
                        <label className="liga-flex-field">
                          <span>Nota o justificación de desempate (opcional)</span>
                          <input
                            className="liga-flex-input"
                            value={jornadaMotivo}
                            placeholder="Justificación del desempate, si hace falta"
                            onChange={(event) => setJornadaMotivo(event.target.value)}
                          />
                        </label>
                        <Button
                          type="button"
                          variant="primary"
                          className="liga-flex-side-actions__btn"
                          disabled={
                            busy ||
                            detalle.estado === "completed" ||
                            jornada.estado === "completed"
                          }
                          onClick={() =>
                            void run(async () => {
                              const groups =
                                unresolved && !unresolved.ok ? unresolved.ties : [];
                              const orden =
                                groups.length > 0
                                  ? mergeTieOrder(groups, jornadaOrden, -1, [])
                                  : jornadaOrden;
                              const outcome = await applyFlexJornada({
                                jornadaId: jornada.id,
                                orden,
                                nota: jornadaMotivo,
                              });
                              if (outcome.needsResolution) {
                                setJornadaOrden(orden);
                                throw new Error(
                                  outcome.error || "Define el orden del empate."
                                );
                              }
                              setNotice(
                                "Puntos de la jornada asignados. La tabla general se reconstruyó."
                              );
                            })
                          }
                        >
                          <TablerIcon name="trophy" size={15} />
                          <span>Finalizar jornada</span>
                        </Button>
                      </div>
                    </div>
                  </section>
                </aside>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════
            5A. PESTAÑA: CLASIFICACIÓN GENERAL
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === "clasificacion" ? (
          <section className="liga-flex-card" role="tabpanel" aria-label="Clasificación">
            <div className="liga-flex-card__head">
              <div>
                <span className="liga-flex-card__eyebrow">Ranking oficial de temporada</span>
                <h2 className="liga-flex-card__title">Clasificación General</h2>
              </div>
              <span className="liga-flex-pill">
                {completedJornadasCount} jornadas contabilizadas
              </span>
            </div>

            {bundle?.honores ? (
              <ol className="liga-flex__podio">
                <li>
                  <p className="liga-flex__kicker">Campeón</p>
                  <strong>{names.get(bundle.honores.campeonId) ?? "Jugador"}</strong>
                </li>
                <li>
                  <p className="liga-flex__kicker">Subcampeón</p>
                  <strong>{names.get(bundle.honores.subcampeonId) ?? "Jugador"}</strong>
                </li>
                <li>
                  <p className="liga-flex__kicker">Tercer lugar</p>
                  <strong>
                    {bundle.honores.tercerId
                      ? names.get(bundle.honores.tercerId) ?? "Jugador"
                      : "Sin tercer lugar"}
                  </strong>
                </li>
              </ol>
            ) : null}

            {season?.ok && season.rows.length > 0 ? (
              <div className="liga-flex__table-wrap">
                <table className="liga-flex__table liga-flex-standings-table">
                  <thead>
                    <tr>
                      <th>Pos.</th>
                      <th>Jugador</th>
                      <th>Riviera ID</th>
                      <th>JJ</th>
                      <th>Puntos</th>
                      <th>Desempeño</th>
                    </tr>
                  </thead>
                  <tbody>
                    {season.rows.map((row) => {
                      const info = playerDetailsById.get(row.jugadorId);
                      const playerName = names.get(row.jugadorId) ?? "Jugador";
                      const wins = row.porPosicion[0] ?? 0;
                      const podiums =
                        (row.porPosicion[0] ?? 0) +
                        (row.porPosicion[1] ?? 0) +
                        (row.porPosicion[2] ?? 0);
                      const avg = Math.round(
                        row.puntos / Math.max(1, row.jornadasJugadas)
                      );

                      return (
                        <tr key={row.jugadorId} className="liga-flex-standings-row">
                          <td data-label="Posición">
                            <span
                              className={`liga-flex-pos-badge${
                                row.posicion <= 3 ? ` is-top-${row.posicion}` : ""
                              }`}
                            >
                              {row.posicion}º
                            </span>
                          </td>
                          <td data-label="Jugador">
                            <div className="liga-flex-standings-player">
                              <div className="liga-flex-standings-player__avatar" aria-hidden>
                                {info?.foto_url ? (
                                  <img src={info.foto_url} alt={playerName} />
                                ) : (
                                  getInitials(playerName)
                                )}
                              </div>
                              <div className="liga-flex-standings-player__body">
                                <strong className="liga-flex-standings-player__name">
                                  {playerName}
                                </strong>
                                {info?.categoria ? (
                                  <span className="liga-flex-standings-player__cat">
                                    {JUGADOR_CATEGORIA_LABELS[info.categoria] ||
                                      info.categoria}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td data-label="Riviera ID">
                            <span className="liga-flex-code-badge">
                              {info?.riviera_id || "—"}
                            </span>
                          </td>
                          <td data-label="Jornadas jugadas">
                            <strong>{row.jornadasJugadas}</strong>
                          </td>
                          <td data-label="Puntos">
                            <strong className="liga-flex-standings-points">
                              {row.puntos} pts
                            </strong>
                          </td>
                          <td data-label="Desempeño">
                            <div className="liga-flex-standings-perf">
                              <span className="liga-flex-perf-chip">
                                {wins} {wins === 1 ? "victoria" : "victorias"} (1º)
                              </span>
                              <span className="liga-flex-perf-chip">
                                {podiums} podios
                              </span>
                              <span className="liga-flex-perf-chip">
                                Prom. {avg} pts/J
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="liga-flex-empty-box">
                <TablerIcon name="trophy" size={32} />
                <p className="liga-flex__empty">
                  {season && !season.ok
                    ? season.reason
                    : "Todavía no hay jornadas con puntos oficiales."}
                </p>
              </div>
            )}
          </section>
        ) : null}

        {/* ═══════════════════════════════════════════════════════════
            5B. PESTAÑA: DIRECTORIO DE JUGADORES
            ═══════════════════════════════════════════════════════════ */}
        {activeTab === "jugadores" ? (
          <section className="liga-flex-card" role="tabpanel" aria-label="Jugadores">
            <div className="liga-flex-card__head">
              <div>
                <span className="liga-flex-card__eyebrow">Plantilla de la liga</span>
                <h2 className="liga-flex-card__title">Directorio de Jugadores</h2>
              </div>
              <span className="liga-flex-pill">
                {directoryPlayers.length} jugadores
              </span>
            </div>

            <div className="liga-flex-directory-toolbar">
              <div className="liga-flex-search-box">
                <TablerIcon name="search" size={15} className="liga-flex-search-box__icon" />
                <input
                  className="liga-flex-input liga-flex-search-box__input"
                  value={directoryQuery}
                  placeholder="Buscar jugador por nombre, Riviera ID o correo…"
                  onChange={(e) => setDirectoryQuery(e.target.value)}
                />
                {directoryQuery ? (
                  <button
                    type="button"
                    className="liga-flex-search-box__clear"
                    onClick={() => setDirectoryQuery("")}
                    aria-label="Limpiar búsqueda"
                  >
                    <TablerIcon name="x" size={13} />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Formulario de alta directa en el directorio */}
            <div className="liga-flex-new-player-box">
              <div className="liga-flex-new-player-box__head">
                <span className="liga-flex-new-player-box__title">
                  <TablerIcon name="user-plus" size={15} />
                  Dar de alta nuevo jugador en el directorio del club
                </span>
              </div>
              <div className="liga-flex-new-player-form is-open">
                <label className="liga-flex-field">
                  <span>Nombre</span>
                  <input
                    className="liga-flex-input"
                    value={nuevoNombre}
                    placeholder="Nombre completo del jugador"
                    onChange={(event) => setNuevoNombre(event.target.value)}
                  />
                </label>
                <label className="liga-flex-field">
                  <span>Correo</span>
                  <input
                    className="liga-flex-input"
                    type="email"
                    value={nuevoEmail}
                    placeholder="correo@club.local"
                    onChange={(event) => setNuevoEmail(event.target.value)}
                  />
                </label>
                <label className="liga-flex-field">
                  <span>Rama</span>
                  <select
                    className="liga-flex-input"
                    value={nuevoGenero}
                    onChange={(event) =>
                      setNuevoGenero(event.target.value === "F" ? "F" : "M")
                    }
                  >
                    <option value="M">Varonil</option>
                    <option value="F">Femenil</option>
                  </select>
                </label>
                <Button
                  type="button"
                  variant="primary"
                  disabled={busy || !nuevoNombre.trim() || !nuevoEmail.trim()}
                  onClick={handleRegisterNewPlayer}
                >
                  Dar de alta
                </Button>
              </div>
            </div>

            {directoryPlayers.length === 0 ? (
              <div className="liga-flex-empty-box">
                <TablerIcon name="users" size={32} />
                <p className="liga-flex__empty">
                  No se encontraron jugadores con el criterio de búsqueda actual.
                </p>
              </div>
            ) : (
              <div className="liga-flex-directory-grid">
                {directoryPlayers.map((player) => {
                  const convocatorias = convocatoriasByPlayer.get(player.id) ?? [];
                  const seasonStat = seasonPointsByPlayer.get(player.id);
                  const inCurrentJornada = jornada
                    ? (bundle?.participantes[jornada.id] ?? []).includes(player.id)
                    : false;

                  return (
                    <article key={player.id} className="liga-flex-directory-card">
                      <div className="liga-flex-directory-card__top">
                        <div className="liga-flex-person-card__avatar" aria-hidden>
                          {player.foto_url ? (
                            <img src={player.foto_url} alt={player.nombre} />
                          ) : (
                            getInitials(player.nombre)
                          )}
                        </div>
                        <div className="liga-flex-directory-card__identity">
                          <strong className="liga-flex-directory-card__name">
                            {player.nombre}
                          </strong>
                          <div className="liga-flex-directory-card__badges">
                            {player.riviera_id ? (
                              <span className="liga-flex-code-badge">
                                {player.riviera_id}
                              </span>
                            ) : null}
                            {player.categoria ? (
                              <span className="liga-flex-perf-chip">
                                {JUGADOR_CATEGORIA_LABELS[player.categoria] ||
                                  player.categoria}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="liga-flex-directory-card__stats">
                        <div>
                          <span>Convocatorias</span>
                          <strong>{convocatorias.length} fechas</strong>
                        </div>
                        <div>
                          <span>Puntos temporada</span>
                          <strong>{seasonStat ? `${seasonStat.puntos} pts` : "0 pts"}</strong>
                        </div>
                      </div>

                      {jornada && jornada.estado !== "completed" && !hasScores ? (
                        <div className="liga-flex-directory-card__actions">
                          <button
                            type="button"
                            className={`liga-flex-person-card__btn${
                              inCurrentJornada ? " is-remove" : " is-add"
                            }`}
                            disabled={
                              busy ||
                              (!inCurrentJornada && participantIds.length >= 16)
                            }
                            onClick={() => {
                              const next = inCurrentJornada
                                ? participantIds.filter((id) => id !== player.id)
                                : [...participantIds, player.id];
                              void run(() => setFlexParticipantes(jornada.id, next));
                            }}
                          >
                            {inCurrentJornada
                              ? `Quitar de J${String(jornada.numero).padStart(2, "0")}`
                              : `Convocar a J${String(jornada.numero).padStart(2, "0")}`}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </LigaPageShell>
  );
};

function retaEnd(inicio: string, minutes: number): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(inicio.trim());
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]) + Math.floor(minutes);
  if (total >= 24 * 60) return null;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function ConfigFields({
  flex,
  fecha,
  disabled,
  onSave,
}: {
  flex: NonNullable<FlexBundle["jornadas"][number]>;
  fecha: string | null;
  disabled: boolean;
  onSave: (patch: {
    fecha: string | null;
    canchas: number;
    rondas: number;
    duracionRondaMin: number;
    descansoMin: number;
    horaInicio: string | null;
    horaFin: string | null;
  }) => void;
}) {
  const [dia, setDia] = useState(fecha ?? "");
  const [canchas, setCanchas] = useState(flex.canchas);
  const [rondas, setRondas] = useState(flex.rondas);
  const [inicio, setInicio] = useState(flex.horaInicio ?? "");
  const [tiempo, setTiempo] = useState(
    String(windowMinutes(flex.horaInicio, flex.horaFin) ?? "")
  );

  useEffect(() => {
    setDia(fecha ?? "");
    setCanchas(flex.canchas);
    setRondas(flex.rondas);
    setInicio(flex.horaInicio ?? "");
    setTiempo(String(windowMinutes(flex.horaInicio, flex.horaFin) ?? ""));
  }, [flex, fecha]);

  const tiempoMin = Number(tiempo);
  const fin =
    inicio && Number.isFinite(tiempoMin) && tiempoMin > 0
      ? retaEnd(inicio, tiempoMin)
      : null;

  return (
    <div className="liga-flex-config-card">
      <div className="liga-flex-config-grid">
        <label className="liga-flex-field liga-flex-field--full">
          <span>Fecha</span>
          <input
            className="liga-flex-input"
            type="date"
            value={dia}
            disabled={disabled}
            onChange={(e) => setDia(e.target.value)}
          />
        </label>

        <label className="liga-flex-field">
          <span>Número de canchas</span>
          <input
            className="liga-flex-input"
            type="number"
            min={1}
            max={12}
            value={canchas}
            disabled={disabled}
            onChange={(e) => setCanchas(Number(e.target.value) || 1)}
          />
        </label>

        <label className="liga-flex-field">
          <span>Número de rondas</span>
          <input
            className="liga-flex-input"
            type="number"
            min={1}
            max={24}
            value={rondas}
            disabled={disabled}
            onChange={(e) => setRondas(Number(e.target.value) || 1)}
          />
        </label>

        <label className="liga-flex-field">
          <span>Hora de inicio</span>
          <input
            className="liga-flex-input"
            type="time"
            value={inicio}
            disabled={disabled}
            onChange={(e) => setInicio(e.target.value)}
          />
        </label>

        <label className="liga-flex-field">
          <span>Tiempo de la reta (min)</span>
          <input
            className="liga-flex-input"
            type="number"
            min={1}
            max={480}
            value={tiempo}
            disabled={disabled}
            onChange={(e) => setTiempo(e.target.value)}
          />
        </label>
      </div>

      <div className="liga-flex-config-summary">
        <div className="liga-flex-config-summary__headline">
          {canchas} {canchas === 1 ? "CANCHA" : "CANCHAS"} · {rondas}{" "}
          {rondas === 1 ? "RONDA" : "RONDAS"}
        </div>
        <div className="liga-flex-config-summary__duration">
          TIEMPO DE LA RETA: {tiempoMin > 0 ? `${tiempoMin} MIN` : "—"}
        </div>
        <p className="liga-flex-config-summary__detail">
          {inicio && fin
            ? `Empieza a las ${inicio} y termina a las ${fin}.`
            : "Indica la hora de inicio y el tiempo de la reta."}
        </p>
      </div>

      <Button
        type="button"
        variant="primary"
        className="liga-flex-config-save-btn"
        disabled={disabled}
        onClick={() =>
          onSave({
            fecha: dia || null,
            canchas,
            rondas,
            duracionRondaMin: flex.duracionRondaMin,
            descansoMin: flex.descansoMin,
            horaInicio: inicio || null,
            horaFin: fin,
          })
        }
      >
        Guardar configuración
      </Button>

      <p className="liga-flex-config-tz">
        Horario en America/Mexico_City. Una jornada finalizada no se reprograma.
      </p>
    </div>
  );
}

function TieOrder({
  title,
  note,
  ids,
  names,
  stats,
  onChange,
}: {
  title: string;
  note: string;
  ids: string[];
  names: Map<string, string>;
  stats?: Map<string, { gf: number; gc: number; pj: number }>;
  onChange: (ids: string[]) => void;
}) {
  const move = (index: number, dir: -1 | 1) => {
    const next = ids.slice();
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    onChange(next);
  };
  return (
    <div className="liga-flex-tie-card">
      <div className="liga-flex-tie-card__head">
        <h3>{title}</h3>
        <p>{note}</p>
      </div>
      <ol className="liga-flex-tie-list">
        {ids.map((id, index) => {
          const stat = stats?.get(id);
          return (
            <li key={id} className="liga-flex-tie-list__item">
              <span className="liga-flex-tie-list__name">
                <strong>{index + 1}.</strong> {names.get(id) ?? "Jugador"}
                {stat
                  ? ` · ${stat.pj} PJ · ${stat.gf} GF · ${stat.gf - stat.gc} DIF`
                  : ""}
              </span>
              <span className="liga-flex-tie-list__btns">
                <button
                  type="button"
                  className="liga-flex-filter-pill"
                  onClick={() => move(index, -1)}
                >
                  Subir
                </button>
                <button
                  type="button"
                  className="liga-flex-filter-pill"
                  onClick={() => move(index, 1)}
                >
                  Bajar
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CorrectionPanel({
  partidos,
  names,
  motivo,
  orden,
  ties,
  busy,
  onMotivo,
  onOrden,
  onSubmit,
}: {
  partidos: LigaPartido[];
  names: Map<string, string>;
  motivo: string;
  orden: string[];
  ties: string[][];
  busy: boolean;
  onMotivo: (value: string) => void;
  onOrden: (ids: string[]) => void;
  onSubmit: (
    marcadores: Array<{ partidoId: string; scoreA: number; scoreB: number }>
  ) => void;
}) {
  const [draft, setDraft] = useState<Record<string, { a: string; b: string }>>(
    {}
  );
  const value = (partido: LigaPartido, side: "a" | "b") =>
    draft[partido.id]?.[side] ??
    String(
      side === "a" ? partido.score_pareja1 ?? "" : partido.score_pareja2 ?? ""
    );

  const pairLabel = (partido: LigaPartido, side: "pareja1" | "pareja2") => {
    const p = side === "pareja1" ? partido.pareja1 : partido.pareja2;
    if (!p) return "Pareja";
    return `${names.get(p.jugador1_id) ?? "Jugador"} / ${
      names.get(p.jugador2_id) ?? "Jugador"
    }`;
  };

  return (
    <div className="liga-flex-correction-card">
      <div className="liga-flex-correction-card__head">
        <h3>Corrección de jornada finalizada</h3>
        <p>
          Los puntos anteriores se sustituyen. No se suman dos veces. Escribe el motivo antes de confirmar.
        </p>
      </div>

      <div className="liga-flex-matches-list">
        {partidos.map((partido) => (
          <div key={partido.id} className="liga-flex-match-row">
            <span className="liga-flex-match-row__tag">
              R{partido.ronda} · C{partido.cancha ?? "—"}
            </span>
            <span className="liga-flex-match-row__pair">
              {pairLabel(partido, "pareja1")}
            </span>
            <div className="liga-flex-match-row__scores">
              <input
                className="liga-flex-score-input"
                inputMode="numeric"
                value={value(partido, "a")}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [partido.id]: {
                      a: event.target.value,
                      b: value(partido, "b"),
                    },
                  }))
                }
              />
              <span className="liga-flex-match-row__vs">vs</span>
              <input
                className="liga-flex-score-input"
                inputMode="numeric"
                value={value(partido, "b")}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    [partido.id]: {
                      a: value(partido, "a"),
                      b: event.target.value,
                    },
                  }))
                }
              />
            </div>
            <span className="liga-flex-match-row__pair is-right">
              {pairLabel(partido, "pareja2")}
            </span>
          </div>
        ))}
      </div>

      {ties.map((group, index) => (
        <TieOrder
          key={group.join("-")}
          title={
            ties.length > 1
              ? `Empate ${index + 1} después de la corrección`
              : "Empate después de la corrección"
          }
          note="Confirma el orden antes de guardar la clasificación nueva."
          ids={orderWithin(group, orden)}
          names={names}
          onChange={(next) => onOrden(mergeTieOrder(ties, orden, index, next))}
        />
      ))}

      <div className="liga-flex-correction-footer">
        <input
          className="liga-flex-input"
          value={motivo}
          placeholder="Motivo de la corrección (mínimo 4 caracteres)"
          onChange={(event) => onMotivo(event.target.value)}
        />
        <Button
          type="button"
          variant="primary"
          disabled={busy || motivo.trim().length < 4}
          onClick={() =>
            onSubmit(
              partidos.map((partido) => ({
                partidoId: partido.id,
                scoreA: Number(value(partido, "a")),
                scoreB: Number(value(partido, "b")),
              }))
            )
          }
        >
          Confirmar corrección
        </Button>
      </div>
    </div>
  );
}

function statsOf(
  partidos: LigaPartido[]
): Map<string, { gf: number; gc: number; pj: number }> {
  const map = new Map<string, { gf: number; gc: number; pj: number }>();
  const add = (id: string, gf: number, gc: number) => {
    const row = map.get(id) ?? { gf: 0, gc: 0, pj: 0 };
    row.gf += gf;
    row.gc += gc;
    row.pj += 1;
    map.set(id, row);
  };
  for (const partido of partidos) {
    if (
      partido.score_pareja1 == null ||
      partido.score_pareja2 == null ||
      !partido.pareja1 ||
      !partido.pareja2
    )
      continue;
    add(
      partido.pareja1.jugador1_id,
      partido.score_pareja1,
      partido.score_pareja2
    );
    add(
      partido.pareja1.jugador2_id,
      partido.score_pareja1,
      partido.score_pareja2
    );
    add(
      partido.pareja2.jugador1_id,
      partido.score_pareja2,
      partido.score_pareja1
    );
    add(
      partido.pareja2.jugador2_id,
      partido.score_pareja2,
      partido.score_pareja1
    );
  }
  return map;
}

function RoundPreview({
  schedule,
  names,
}: {
  schedule: FlexSchedule;
  names: Map<string, string>;
}) {
  return (
    <div className="liga-flex__preview">
      <div className="liga-flex-preview-quality">
        <span className="liga-flex-perf-chip">
          Partidos por jugador: <strong>{schedule.quality.rounds}</strong>
        </span>
        <span className="liga-flex-perf-chip">
          Descansos: <strong>{schedule.quality.rests}</strong>
        </span>
        <span className="liga-flex-perf-chip">
          Parejas repetidas: <strong>{schedule.quality.partnerRepeats}</strong>
        </span>
        <span className="liga-flex-perf-chip">
          Rivales repetidos: <strong>{schedule.quality.rivalRepeats}</strong>
        </span>
        {schedule.quality.partnerRepeats === 0 ? (
          <span className="liga-flex-perf-chip is-highlight">
            Nadie repite compañero
          </span>
        ) : null}
      </div>

      <div className="liga-flex-preview-rounds">
        {schedule.rounds.map((round) => (
          <article key={round.round} className="liga-flex-preview-round">
            <div className="liga-flex-preview-round__head">
              <h3>Ronda {round.round}</h3>
              <span>{round.matches.length} canchas</span>
            </div>
            <div className="liga-flex-preview-round__matches">
              {round.matches.map((match) => (
                <div
                  key={`${match.round}-${match.court}`}
                  className="liga-flex-preview-match"
                >
                  <span className="liga-flex-preview-match__court">
                    Cancha {match.court}
                  </span>
                  <span className="liga-flex-preview-match__teams">
                    <strong>{label(match.pairA, names)}</strong>
                    <em>vs</em>
                    <strong>{label(match.pairB, names)}</strong>
                  </span>
                </div>
              ))}
            </div>
            {round.benchIds.length > 0 ? (
              <p className="liga-flex-preview-round__bench">
                Descansan:{" "}
                {round.benchIds.map((id) => names.get(id) ?? id).join(", ")}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function MatchEditor({
  partidos,
  names,
  disabled,
  savedId,
  onSave,
}: {
  partidos: LigaPartido[];
  names: Map<string, string>;
  disabled: boolean;
  savedId: string | null;
  onSave: (partido: LigaPartido, scoreA: number, scoreB: number) => void;
}) {
  if (partidos.length === 0) return null;

  const sorted = partidos
    .slice()
    .sort((a, b) => a.ronda - b.ronda || (a.cancha ?? 0) - (b.cancha ?? 0));

  const roundsMap = new Map<number, LigaPartido[]>();
  for (const p of sorted) {
    const list = roundsMap.get(p.ronda) ?? [];
    list.push(p);
    roundsMap.set(p.ronda, list);
  }

  return (
    <div className="liga-flex__matches">
      {Array.from(roundsMap.entries()).map(([rondaNum, list]) => (
        <div key={rondaNum} className="liga-flex-round-group">
          <div className="liga-flex-round-group__head">
            <h3>Ronda {rondaNum}</h3>
            <span>{list.length} partidos</span>
          </div>
          <div className="liga-flex-matches-list">
            {list.map((partido) => (
              <ScoreRow
                key={partido.id}
                partido={partido}
                names={names}
                disabled={disabled}
                saved={savedId === partido.id}
                onSave={onSave}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreRow({
  partido,
  names,
  disabled,
  saved,
  onSave,
}: {
  partido: LigaPartido;
  names: Map<string, string>;
  disabled: boolean;
  saved: boolean;
  onSave: (partido: LigaPartido, scoreA: number, scoreB: number) => void;
}) {
  const [a, setA] = useState(partido.score_pareja1?.toString() ?? "");
  const [b, setB] = useState(partido.score_pareja2?.toString() ?? "");

  useEffect(() => {
    setA(partido.score_pareja1?.toString() ?? "");
    setB(partido.score_pareja2?.toString() ?? "");
  }, [partido.score_pareja1, partido.score_pareja2]);

  const pair = (id: "pareja1" | "pareja2") => {
    const side = id === "pareja1" ? partido.pareja1 : partido.pareja2;
    if (!side) return "Pareja";
    return `${names.get(side.jugador1_id) ?? "Jugador"} / ${
      names.get(side.jugador2_id) ?? "Jugador"
    }`;
  };

  const hasCaptured =
    partido.score_pareja1 != null && partido.score_pareja2 != null;

  return (
    <div className={`liga-flex__score liga-flex-match-row${hasCaptured ? " is-captured" : ""}`}>
      <span className="liga-flex-match-row__tag">
        R{partido.ronda} · Cancha {partido.cancha ?? "—"}
      </span>
      <span className="liga-flex-match-row__pair">{pair("pareja1")}</span>
      <div className="liga-flex-match-row__scores">
        <input
          className="liga-flex-score-input"
          inputMode="numeric"
          value={a}
          disabled={disabled}
          aria-label={`Marcador pareja 1 ronda ${partido.ronda} cancha ${partido.cancha ?? ""}`}
          onChange={(event) => setA(event.target.value)}
        />
        <span className="liga-flex-match-row__vs">vs</span>
        <input
          className="liga-flex-score-input"
          inputMode="numeric"
          value={b}
          disabled={disabled}
          aria-label={`Marcador pareja 2 ronda ${partido.ronda} cancha ${partido.cancha ?? ""}`}
          onChange={(event) => setB(event.target.value)}
        />
      </div>
      <span className="liga-flex-match-row__pair is-right">{pair("pareja2")}</span>
      <Button
        type="button"
        variant="secondary"
        className="liga-flex-match-row__save"
        disabled={disabled || a === "" || b === ""}
        onClick={() => onSave(partido, Number(a), Number(b))}
      >
        {saved ? "Guardado" : "Guardar"}
      </Button>
    </div>
  );
}

function orderWithin(group: string[], current: string[]): string[] {
  const known = current.filter((id) => group.includes(id));
  return known.length === group.length ? known : group;
}

function mergeTieOrder(
  groups: string[][],
  current: string[],
  index: number,
  next: string[]
): string[] {
  return groups.flatMap((group, groupIndex) => {
    if (groupIndex === index) return next;
    return orderWithin(group, current);
  });
}

function hydrateFlexPartidos(
  partidos: LigaPartido[],
  parejas: NonNullable<LigaDetalle["jornadas"][number]["parejas"]>
): LigaPartido[] {
  const byId = new Map(parejas.map((pareja) => [pareja.id, pareja]));
  return partidos.map((partido) => ({
    ...partido,
    pareja1: partido.pareja1 ?? byId.get(partido.pareja1_id),
    pareja2: partido.pareja2 ?? byId.get(partido.pareja2_id),
  }));
}

function toScored(partido: LigaPartido) {
  return {
    round: partido.ronda,
    pairA: [
      partido.pareja1?.jugador1_id ?? "",
      partido.pareja1?.jugador2_id ?? "",
    ] as [string, string],
    pairB: [
      partido.pareja2?.jugador1_id ?? "",
      partido.pareja2?.jugador2_id ?? "",
    ] as [string, string],
    scoreA: partido.score_pareja1,
    scoreB: partido.score_pareja2,
  };
}

function label(pair: [string, string], names: Map<string, string>): string {
  return `${names.get(pair[0]) ?? "Jugador"} / ${
    names.get(pair[1]) ?? "Jugador"
  }`;
}
