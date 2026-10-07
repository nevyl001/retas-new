import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { PublicEventNeutralLoading } from "../../../club-experience";
import { useRetryableImage } from "../../../hooks/useRetryableImage";
import { useVisiblePolling } from "../../../hooks/useVisiblePolling";
import {
  buildEnVivoBoard,
  enVivoCourtKey,
  formatStartsIn,
  type EnVivoCourtLane,
  type EnVivoPairSide,
  type EnVivoPartido,
} from "../../../lib/torneoExpress/eventoEnVivo";
import { toMexicoCalendarDate } from "../../../lib/matchDate";
import {
  formatPartidoFecha,
  formatPartidoHora,
} from "../../../lib/torneoExpress/partidoSchedule";
import { resolvePlayerPublicProfiles } from "../../../lib/rivieraJugadores/publicPlayerAvatars";
import {
  fetchEnVivoPartidos,
  fetchEnVivoEstructura,
  type EnVivoEstructura,
  type EnVivoRosterCache,
} from "../../../services/torneoExpressEnVivo";
import { formatSupabaseError } from "../../../services/torneoExpressService";
import { getJugadorInitials } from "../../jugadores/JugadorAvatar";
import {
  pairSideFromRoster,
  type TEPublicPairPlayer,
} from "./TEPublicPairIdentity";
import { PublicTorneoExpressShell } from "./PublicTorneoExpressShell";
import "./te-evento-en-vivo.css";

/** Refresco de datos (la transición «próximo → en vivo» ocurre localmente con el reloj). */
const POLL_INTERVAL_MS = 30_000;
const CLOCK_TICK_MS = 15_000;
const UPCOMING_PER_COURT = 4;

type PhotoMap = Record<string, string | null>;

/** Índice de entrada escalonada (lo consume el CSS como `--te-i`). */
function stagger(index: number): React.CSSProperties {
  return { "--te-i": index } as React.CSSProperties;
}

function dayTag(iso: string, now: Date): string {
  if (toMexicoCalendarDate(iso) === toMexicoCalendarDate(now.toISOString())) {
    return "";
  }
  return formatPartidoFecha(iso);
}

/** Retrato vertical: foto (o iniciales) con sombra inferior; con `caption`, el nombre va sobre la foto. */
const Portrait: React.FC<{
  player: TEPublicPairPlayer;
  caption?: boolean;
}> = ({ player, caption = false }) => {
  const { src, onError } = useRetryableImage(player.fotoUrl);
  return (
    <span
      className={`te-live-portrait${caption ? " te-live-portrait--tile" : ""}`}
      aria-hidden={caption ? undefined : true}
    >
      {src ? (
        <img
          className="te-live-portrait__img"
          src={src}
          alt=""
          decoding="async"
          onError={onError}
        />
      ) : (
        <span className="te-live-portrait__fallback">
          {getJugadorInitials(player.nombre)}
        </span>
      )}
      {caption ? (
        <>
          <span className="te-live-portrait__shade" aria-hidden="true" />
          <span className="te-live-portrait__caption">{player.nombre}</span>
        </>
      ) : null}
    </span>
  );
};

type TeamSize = "lg" | "md" | "sm";

function teamPlayers(side: EnVivoPairSide, photos: PhotoMap) {
  const identity = pairSideFromRoster({
    isVirtual: side.isVirtual,
    display: side.display,
    player1Id: side.player1Id,
    player2Id: side.player2Id,
  });
  const players = [identity.player1, identity.player2]
    .filter((p): p is TEPublicPairPlayer => Boolean(p))
    .map((player) => ({
      ...player,
      fotoUrl: player.id ? (photos[player.id] ?? null) : null,
    }));
  return { players, showFaces: !side.isVirtual && players.length > 0 };
}

const Faces: React.FC<{ players: TEPublicPairPlayer[] }> = ({ players }) => (
  <span className="te-live-faces" aria-hidden="true">
    {players.map((player, index) => (
      <Portrait key={`${player.id ?? "p"}-${index}`} player={player} />
    ))}
  </span>
);

/** Pareja: dos retratos con el nombre sobre la foto (o solo texto si es una plaza virtual). */
const Team: React.FC<{
  side: EnVivoPairSide;
  photos: PhotoMap;
  size: TeamSize;
}> = ({ side, photos, size }) => {
  const { players, showFaces } = teamPlayers(side, photos);
  return (
    <div className={`te-live-team te-live-team--${size}`}>
      {showFaces ? (
        <div className="te-live-team__tiles">
          {players.map((player, index) => (
            <Portrait
              key={`${player.id ?? "p"}-${index}`}
              player={player}
              caption
            />
          ))}
        </div>
      ) : (
        <div className="te-live-team__names">
          {players.map((player, index) => (
            <span
              className="te-live-team__name"
              key={`${player.nombre}-${index}`}
            >
              {player.nombre}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

const Versus: React.FC<{
  partido: EnVivoPartido;
  photos: PhotoMap;
  size: TeamSize;
}> = ({ partido, photos, size }) => (
  <div className="te-live-court__versus">
    <Team side={partido.local} photos={photos} size={size} />
    <span className="te-live-court__vs" aria-hidden="true">
      VS
    </span>
    <Team side={partido.visitante} photos={photos} size={size} />
  </div>
);

const LiveCourtCard: React.FC<{
  lane: EnVivoCourtLane;
  partido: EnVivoPartido;
  photos: PhotoMap;
  index: number;
}> = ({ lane, partido, photos, index }) => (
  <article
    className="te-live-court te-live-court--live"
    style={stagger(index)}
  >
    <header className="te-live-court__head">
      <h3 className="te-live-court__name">{lane.label}</h3>
      <span className="te-live-badge te-live-badge--live">
        <span className="te-live-badge__dot" aria-hidden="true" />
        En vivo
      </span>
    </header>
    <p className="te-live-court__meta">
      <span className="te-live-chip">{partido.categoria}</span>
      <span className="te-live-court__stage">{partido.etapa}</span>
    </p>
    <Versus partido={partido} photos={photos} size="lg" />
    <footer className="te-live-court__foot">
      Inició {formatPartidoHora(partido.programadoEn)}
    </footer>
  </article>
);

const IdleCourtCard: React.FC<{
  lane: EnVivoCourtLane;
  now: Date;
  photos: PhotoMap;
  index: number;
}> = ({ lane, now, photos, index }) => {
  const next = lane.next;
  const startsIn = next ? formatStartsIn(next.startMs, now) : null;
  return (
    <article
      className="te-live-court te-live-court--idle"
      style={stagger(index)}
    >
      <header className="te-live-court__head">
        <h3 className="te-live-court__name">{lane.label}</h3>
        <span className="te-live-badge te-live-badge--idle">
          {next ? (startsIn ? `Próximo ${startsIn}` : "Próximo") : "Libre"}
        </span>
      </header>
      {next ? (
        <>
          <p className="te-live-court__meta">
            <span className="te-live-chip te-live-chip--muted">
              {next.categoria}
            </span>
            <span className="te-live-court__stage">{next.etapa}</span>
          </p>
          <Versus partido={next} photos={photos} size="md" />
          <footer className="te-live-court__foot">
            {[dayTag(next.programadoEn, now), formatPartidoHora(next.programadoEn)]
              .filter(Boolean)
              .join(" · ")}
          </footer>
        </>
      ) : (
        <p className="te-live-court__empty">Sin más partidos programados</p>
      )}
    </article>
  );
};

const TeamInline: React.FC<{ side: EnVivoPairSide; photos: PhotoMap }> = ({
  side,
  photos,
}) => {
  const { players, showFaces } = teamPlayers(side, photos);
  return (
    <span className="te-live-inline">
      {showFaces ? <Faces players={players} /> : null}
      <span className="te-live-inline__names">
        {players.map((p) => p.nombre).join(" / ")}
      </span>
    </span>
  );
};

const UpcomingItem: React.FC<{
  partido: EnVivoPartido;
  now: Date;
  photos: PhotoMap;
  index: number;
}> = ({ partido, now, photos, index }) => {
  const tag = dayTag(partido.programadoEn, now);
  return (
    <li className="te-live-upcoming__item" style={stagger(index)}>
      <div className="te-live-upcoming__top">
        <span className="te-live-upcoming__time">
          {formatPartidoHora(partido.programadoEn)}
          {tag ? <small>{tag}</small> : null}
        </span>
        <span className="te-live-upcoming__tags">
          <span className="te-live-upcoming__cat">{partido.categoria}</span>
          <span className="te-live-upcoming__stage">{partido.etapa}</span>
        </span>
      </div>
      <div className="te-live-upcoming__teams">
        <TeamInline side={partido.local} photos={photos} />
        <span className="te-live-upcoming__vs" aria-hidden="true">
          vs
        </span>
        <TeamInline side={partido.visitante} photos={photos} />
      </div>
    </li>
  );
};

function useFullscreen() {
  const [active, setActive] = useState(false);
  const supported =
    typeof document !== "undefined" &&
    Boolean(document.documentElement?.requestFullscreen);

  useEffect(() => {
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, []);

  return { active, supported, toggle };
}

type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

/** Mantiene la pantalla encendida mientras se muestra el tablero (TV / proyector). */
function useScreenWakeLock(enabled: boolean) {
  useEffect(() => {
    const wakeLock =
      typeof navigator === "undefined"
        ? undefined
        : (navigator as NavigatorWithWakeLock).wakeLock;
    if (!enabled || !wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const next = await wakeLock.request("screen");
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
      } catch {
        sentinel = null;
      }
    };

    const onVisible = () => {
      if (!document.hidden) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [enabled]);
}

type BoardProps = {
  estructura: EnVivoEstructura;
};

const EnVivoBoard: React.FC<BoardProps> = ({ estructura }) => {
  const { evento } = estructura;
  const [partidos, setPartidos] = useState<EnVivoPartido[] | null>(null);
  const [stale, setStale] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [photos, setPhotos] = useState<PhotoMap>({});
  const rosterCacheRef = useRef<EnVivoRosterCache>(new Map());
  const requestedPhotosRef = useRef<Set<string>>(new Set());
  const { active: fullscreen, supported: fullscreenSupported, toggle } =
    useFullscreen();

  useScreenWakeLock(true);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  useVisiblePolling({
    intervalMs: POLL_INTERVAL_MS,
    callback: async () => {
      try {
        const next = await fetchEnVivoPartidos(
          estructura,
          rosterCacheRef.current,
          new Date()
        );
        setPartidos(next);
        setStale(false);
        setNow(new Date());
      } catch {
        // Conserva lo último que se mostró; solo avisa que no está al día.
        setPartidos((prev) => prev ?? []);
        setStale(true);
      }
    },
  });

  const board = useMemo(
    () => buildEnVivoBoard(partidos ?? [], now),
    [partidos, now]
  );

  // Próximos agrupados por cancha (mismo orden que las tarjetas de arriba).
  // El «siguiente» de una cancha libre ya se ve en su tarjeta: no se repite aquí.
  const upcomingByCourt = useMemo(() => {
    const byKey = new Map<string, EnVivoPartido[]>();
    const shownInCards = new Set<string>();
    for (const lane of board.courts) {
      if (!lane.live && lane.next) shownInCards.add(lane.next.id);
    }
    for (const partido of board.upcoming) {
      if (shownInCards.has(partido.id)) continue;
      const key = enVivoCourtKey(partido.cancha);
      const list = byKey.get(key) ?? [];
      if (list.length < UPCOMING_PER_COURT) list.push(partido);
      byKey.set(key, list);
    }
    return byKey;
  }, [board.upcoming, board.courts]);
  const upcoming = useMemo(
    () => Array.from(upcomingByCourt.values()).flat(),
    [upcomingByCourt]
  );

  // Fotos: solo de quienes se ven en pantalla, y solo ids que aún no se pidieron.
  const livePlayerKey = useMemo(() => {
    const ids = new Set<string>();
    const visible: EnVivoPartido[] = [
      ...board.live,
      ...board.courts.flatMap((lane) => (lane.next ? [lane.next] : [])),
      ...upcoming,
    ];
    for (const p of visible) {
      for (const side of [p.local, p.visitante]) {
        if (side.isVirtual) continue;
        if (side.player1Id) ids.add(side.player1Id);
        if (side.player2Id) ids.add(side.player2Id);
      }
    }
    return Array.from(ids).sort().join(",");
  }, [board.live, board.courts, upcoming]);

  useEffect(() => {
    if (!livePlayerKey || !evento.organizador_id) return;
    const missing = livePlayerKey
      .split(",")
      .filter((id) => id && !requestedPhotosRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => requestedPhotosRef.current.add(id));

    let cancelled = false;
    void (async () => {
      try {
        const profiles = await resolvePlayerPublicProfiles(
          evento.organizador_id,
          missing.map((id) => ({ id, name: id })),
          { publicOnly: true }
        );
        if (cancelled) return;
        setPhotos((prev) => {
          const next = { ...prev };
          for (const id of missing) next[id] = profiles[id]?.fotoUrl ?? null;
          return next;
        });
      } catch {
        // Sin foto se muestran iniciales; permite reintentar en el siguiente cambio.
        missing.forEach((id) => requestedPhotosRef.current.delete(id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [livePlayerKey, evento.organizador_id]);

  const liveCount = board.live.length;
  const freeCourts = board.courts.filter((lane) => !lane.live).length;
  const clockTime = formatPartidoHora(now.toISOString());
  const clockDate = formatPartidoFecha(now.toISOString());

  return (
    <div className="te-live" data-fullscreen={fullscreen ? "true" : "false"}>
      <header className="te-live-header te-pub-fade-in">
        <div className="te-live-header__title">
          <p className="te-live-header__kicker">Pantalla de canchas</p>
          <h1 className="te-live-header__name">{evento.nombre}</h1>
        </div>
        <div className="te-live-header__side">
          <div className="te-live-clock" aria-label="Hora actual">
            <span className="te-live-clock__time">{clockTime}</span>
            <span className="te-live-clock__date">{clockDate}</span>
          </div>
          <div className="te-live-header__actions">
            <a
              className="te-live-action"
              href={`/eventos/${encodeURIComponent(evento.slug ?? "")}`}
            >
              Ver evento
            </a>
            {fullscreenSupported ? (
              <button
                type="button"
                className="te-live-action"
                onClick={toggle}
              >
                {fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {partidos == null ? (
        <PublicEventNeutralLoading message="Cargando canchas…" />
      ) : (
        <>
          <p className="te-live-summary" aria-live="polite">
            <strong>{liveCount}</strong>{" "}
            {liveCount === 1 ? "partido en juego" : "partidos en juego"}
            {board.courts.length > 0 ? (
              <>
                <span aria-hidden="true"> · </span>
                <strong>{freeCourts}</strong>{" "}
                {freeCourts === 1 ? "cancha libre" : "canchas libres"}
              </>
            ) : null}
            {stale ? (
              <span className="te-live-summary__stale">
                {" "}
                · Reconectando…
              </span>
            ) : null}
          </p>

          {board.courts.length === 0 ? (
            <p className="te-live-empty">
              {stale
                ? "No se pudieron cargar los partidos. Reintentando…"
                : "No hay partidos programados en las próximas horas."}
            </p>
          ) : (
            <section
              className="te-live-courts"
              aria-label="Canchas"
            >
              {board.courts.map((lane, laneIndex) =>
                lane.live ? (
                  <LiveCourtCard
                    key={lane.key}
                    lane={lane}
                    partido={lane.live}
                    photos={photos}
                    index={laneIndex}
                  />
                ) : (
                  <IdleCourtCard
                    key={lane.key}
                    lane={lane}
                    now={now}
                    photos={photos}
                    index={laneIndex}
                  />
                )
              )}
            </section>
          )}

          {upcoming.length > 0 ? (
            <section className="te-live-upcoming" aria-label="Próximos partidos">
              <h2 className="te-live-upcoming__title">Próximos partidos</h2>
              <div className="te-live-upcoming__cols">
                {board.courts.map((lane, laneIndex) => {
                  const items = upcomingByCourt.get(lane.key) ?? [];
                  return (
                    <div
                      className="te-live-upcoming__col"
                      key={lane.key}
                      style={stagger(laneIndex + board.courts.length)}
                    >
                      <h3 className="te-live-upcoming__court">{lane.label}</h3>
                      {items.length > 0 ? (
                        <ol className="te-live-upcoming__list">
                          {items.map((partido, itemIndex) => (
                            <UpcomingItem
                              key={partido.id}
                              partido={partido}
                              now={now}
                              photos={photos}
                              index={itemIndex}
                            />
                          ))}
                        </ol>
                      ) : (
                        <p className="te-live-upcoming__none">
                          Sin más partidos
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
};

type VistaPublicaEventoEnVivoProps = { slug: string };

/**
 * Pantalla pública para TV / proyector: partidos que se juegan al mismo tiempo,
 * con cancha y categoría. Solo lectura; el refresco respeta pestaña visible.
 */
export const VistaPublicaEventoEnVivo: React.FC<
  VistaPublicaEventoEnVivoProps
> = ({ slug }) => {
  const [estructura, setEstructura] = useState<EnVivoEstructura | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const data = await fetchEnVivoEstructura(slug);
        if (cancelled) return;
        if (!data) {
          setEstructura(null);
          setError("Evento no encontrado o no publicado");
          return;
        }
        setEstructura(data);
      } catch (e) {
        if (!cancelled) {
          setEstructura(null);
          setError(formatSupabaseError(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <PublicTorneoExpressShell
      className="te-public--evento te-public--en-vivo"
      organizadorId={estructura?.evento.organizador_id ?? null}
    >
      {loading ? (
        <PublicEventNeutralLoading message="Cargando evento…" />
      ) : null}
      {error ? <p className="te-error">{error}</p> : null}
      {!loading && estructura ? <EnVivoBoard estructura={estructura} /> : null}
    </PublicTorneoExpressShell>
  );
};
