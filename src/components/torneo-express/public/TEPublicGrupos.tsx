import React, { useEffect, useMemo, useState } from "react";
import { formatCanchaDisplay } from "../../../lib/torneoExpress/canchaDisplay";
import {
  formatPartidoFecha,
  formatPartidoHora,
  partidoScheduleIso,
} from "../../../lib/torneoExpress/partidoSchedule";
import {
  getPartidoSets,
  matchWinnerSideFromPartido,
} from "../../../lib/torneoExpress/partidoSets";
import { sortPartidosByOrden } from "../../../lib/torneoExpress/roundRobin";
import { isGrupoPartidosCompletos } from "../../../lib/torneoExpress/grupoCompletion";
import type {
  StandingRowExpress,
  TorneoExpressBundle,
  TorneoExpressPartido,
} from "../../../lib/torneoExpress/types";
import "./te-public-grupos.css";

export type TEPartidoEstadoPublico = "pendiente" | "en_vivo" | "finalizado";

export interface TEPublicGruposPartido {
  id: string;
  hora: string;
  cancha: string;
  pareja1: string;
  pareja2: string;
  /** @deprecated Preferir partidoExpress + PartidoSetsScoreDisplay */
  score1: number | null;
  score2: number | null;
  estado: TEPartidoEstadoPublico;
  partidoExpress: TorneoExpressPartido;
}

export interface TEPublicGruposGrupo {
  id: string;
  nombre: string;
  partidos: TEPublicGruposPartido[];
  partidosExpress: TorneoExpressPartido[];
  standingRows: StandingRowExpress[];
  clasifican: number;
  /** Preparado para fotos futuras; el bundle público actual no expone avatares. */
  achievementPlayers?: TEPublicGruposAchievementPlayer[];
}

export interface TEPublicGruposAchievementPlayer {
  name: string;
  avatarUrl?: string | null;
}

export interface TEPublicGruposProps {
  grupos: TEPublicGruposGrupo[];
  torneoNombre: string;
  categoria: string;
  fecha: string;
  lugar: string;
  /** Vista de un solo grupo (enlace /grupo/:id) */
  singleGrupo?: boolean;
  onCopyLink?: () => void;
  copyMsg?: string;
  /** Si la categoría ya tiene cuadro, enlace a la vista pública de eliminatoria. */
  faseFinalHref?: string;
}

const DEFAULT_CLASIFICAN = 2;

function resolvePartidoEstado(
  partido: TorneoExpressPartido,
  enVivoId: string | null
): TEPartidoEstadoPublico {
  if (partido.estado === "jugado") return "finalizado";
  if (partido.id === enVivoId) return "en_vivo";
  return "pendiente";
}

function mapPartidosForGrupo(
  partidos: TorneoExpressPartido[],
  labelById: Map<string, string>
): TEPublicGruposPartido[] {
  const sorted = sortPartidosByOrden(partidos);
  const enVivoId = sorted.find((p) => p.estado === "pendiente")?.id ?? null;

  return sorted.map((partido) => {
    const played = partido.estado === "jugado";
    const scheduleIso = partidoScheduleIso(partido);

    return {
      id: partido.id,
      hora: formatPartidoHora(scheduleIso),
      cancha: formatCanchaDisplay(partido.cancha),
      pareja1: labelById.get(partido.pareja_local_id) ?? "Local",
      pareja2: labelById.get(partido.pareja_visitante_id) ?? "Visitante",
      score1: played ? (partido.puntos_local ?? 0) : null,
      score2: played ? (partido.puntos_visitante ?? 0) : null,
      estado: resolvePartidoEstado(partido, enVivoId),
      partidoExpress: partido,
    };
  });
}

export function buildTEPublicGruposProps(
  bundle: TorneoExpressBundle,
  standingsByGrupo: Record<string, StandingRowExpress[]>,
  options?: { clasifican?: number; lugar?: string }
): Omit<TEPublicGruposProps, "onCopyLink" | "copyMsg"> {
  const clasifican = options?.clasifican ?? DEFAULT_CLASIFICAN;
  const gruposOrdenados = [...bundle.grupos].sort((a, b) => a.orden - b.orden);

  let fechaIso: string | null = null;

  gruposOrdenados.forEach((grupo) => {
    const partidos = bundle.partidosPorGrupo[grupo.id] ?? [];
    partidos.forEach((partido) => {
      const iso = partidoScheduleIso(partido);
      if (!fechaIso || iso < fechaIso) {
        fechaIso = iso;
      }
    });
  });

  const fecha = fechaIso
    ? formatPartidoFecha(fechaIso)
    : formatPartidoFecha(bundle.torneo.created_at);

  const grupos: TEPublicGruposGrupo[] = gruposOrdenados.map((grupo) => {
    const parejas = bundle.parejasPorGrupo[grupo.id] ?? [];
    const labelById = new Map<string, string>();
    parejas.forEach((p) => {
      labelById.set(p.pareja_id, p.pareja_display ?? p.pareja_id);
    });

    return {
      id: grupo.id,
      nombre: grupo.nombre,
      partidos: mapPartidosForGrupo(
        bundle.partidosPorGrupo[grupo.id] ?? [],
        labelById
      ),
      partidosExpress: bundle.partidosPorGrupo[grupo.id] ?? [],
      standingRows: standingsByGrupo[grupo.id] ?? [],
      clasifican,
    };
  });

  return {
    grupos,
    torneoNombre: bundle.torneo.nombre,
    categoria: bundle.torneo.categoria?.trim() ?? "",
    fecha,
    lugar: options?.lugar?.trim() ?? "",
  };
}

export function buildTEPublicGrupoProps(
  bundle: TorneoExpressBundle,
  standingsByGrupo: Record<string, StandingRowExpress[]>,
  grupoId: string,
  options?: { clasifican?: number; lugar?: string }
): Omit<TEPublicGruposProps, "onCopyLink" | "copyMsg"> {
  const all = buildTEPublicGruposProps(bundle, standingsByGrupo, options);
  const grupo = all.grupos.find((g) => g.id === grupoId);
  return {
    ...all,
    singleGrupo: true,
    grupos: grupo ? [grupo] : [],
  };
}

function PartidoStatusBadge({ estado }: { estado: TEPartidoEstadoPublico }) {
  if (estado === "finalizado") {
    return (
      <span className="te-badge-final">
        <span aria-hidden>✓</span> Final
      </span>
    );
  }
  if (estado === "en_vivo") {
    return (
      <span className="te-badge-live">
        <span className="te-badge-live__dot" aria-hidden />
        En vivo
      </span>
    );
  }
  return (
    <span className="te-badge-proximo">
      Próximo
    </span>
  );
}

function PartidoRow({ partido }: { partido: TEPublicGruposPartido }) {
  const played = partido.estado === "finalizado";
  const winnerSide = played
    ? matchWinnerSideFromPartido(partido.partidoExpress)
    : null;
  const team1Wins = winnerSide === "local";
  const team2Wins = winnerSide === "visitante";
  const isTie = played && !winnerSide;
  const sets = played ? getPartidoSets(partido.partidoExpress) : [];
  const localScores = sets.map((set) => set.local);
  const visitanteScores = sets.map((set) => set.visitante);

  return (
    <article
      className={`te-partido-item${played ? " te-partido-item--played" : ""}${
        isTie ? " te-partido-item--tie" : ""
      }`}
    >
      <header className="te-partido-item__top">
        <div className="te-partido-meta">
          <span className="te-partido-hora">{partido.hora}</span>
          <span className="te-partido-meta__separator" aria-hidden>
            ·
          </span>
          <span className="te-partido-cancha" title={partido.cancha}>
            {partido.cancha}
          </span>
        </div>
        <div className="te-partido-badge">
          <PartidoStatusBadge estado={partido.estado} />
        </div>
      </header>

      <div className="te-partido-body">
        <div className="te-partido-teams">
          <div
            className={`te-team-row${
              team1Wins ? " te-team-row--winner" : ""
            }${isTie ? " te-team-row--tie" : ""}${
              played && !team1Wins && !isTie ? " te-team-row--loser" : ""
            }`}
          >
            {team1Wins ? (
              <span className="te-team-result-indicator" aria-hidden>
                ✓
              </span>
            ) : null}
            <span
              className={`te-team-name${
                team1Wins ? " te-team-name--winner" : ""
              }${isTie ? " te-team-name--tie" : ""}${
                played && !team1Wins && !isTie ? " te-team-name--loser" : ""
              }`}
              {...(team1Wins
                ? { "aria-label": `Ganador: ${partido.pareja1}` }
                : isTie
                  ? { "aria-label": `Empate: ${partido.pareja1}` }
                  : {})}
            >
              {partido.pareja1}
            </span>
            <span className="te-team-score-mobile" aria-label="Marcador local">
              {played
                ? localScores.map((score, index) => (
                    <span key={index}>{score}</span>
                  ))
                : "—"}
            </span>
          </div>
          <div
            className={`te-team-row${
              team2Wins ? " te-team-row--winner" : ""
            }${isTie ? " te-team-row--tie" : ""}${
              played && !team2Wins && !isTie ? " te-team-row--loser" : ""
            }`}
          >
            {team2Wins ? (
              <span className="te-team-result-indicator" aria-hidden>
                ✓
              </span>
            ) : null}
            <span
              className={`te-team-name${
                team2Wins ? " te-team-name--winner" : ""
              }${isTie ? " te-team-name--tie" : ""}${
                played && !team2Wins && !isTie ? " te-team-name--loser" : ""
              }`}
              {...(team2Wins
                ? { "aria-label": `Ganador: ${partido.pareja2}` }
                : isTie
                  ? { "aria-label": `Empate: ${partido.pareja2}` }
                  : {})}
            >
              {partido.pareja2}
            </span>
            <span className="te-team-score-mobile" aria-label="Marcador visitante">
              {played
                ? visitanteScores.map((score, index) => (
                    <span key={index}>{score}</span>
                  ))
                : "—"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatDif(dif: number): string {
  return dif > 0 ? `+${dif}` : String(dif);
}

function initialsFromName(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "RO";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function fallbackPlayersFromPair(
  pairLabel: string
): TEPublicGruposAchievementPlayer[] {
  const names = pairLabel
    .split(/\s*\/\s*/)
    .map((name) => name.trim())
    .filter(Boolean);

  if (names.length >= 2) {
    return names.slice(0, 2).map((name) => ({ name }));
  }

  return [
    { name: names[0] || pairLabel || "Riviera" },
    { name: "Open" },
  ];
}

function AchievementAvatar({
  player,
}: {
  player: TEPublicGruposAchievementPlayer;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(player.avatarUrl) && !imageFailed;

  return (
    <span className="te-grupo-achievement__avatar">
      {showImage ? (
        <img
          src={player.avatarUrl ?? undefined}
          alt={player.name}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-label={player.name}>{initialsFromName(player.name)}</span>
      )}
    </span>
  );
}

function GrupoStandings({
  rows,
  clasifican,
}: {
  rows: StandingRowExpress[];
  clasifican: number;
}) {
  return (
    <section className="te-grupo-standings" aria-label="Clasificación">
      <header className="te-grupo-standings__header">
        <h3>Clasificación</h3>
        <span>
          {clasifican} clasifica{clasifican === 1 ? "" : "n"}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="te-grupos-empty">Sin datos de clasificación.</p>
      ) : (
        <ol className="te-grupo-standings__list">
          {rows.map((row, index) => {
            const clasifica = index < clasifican;
            return (
              <li
                key={`${row.grupoId}-${row.parejaId}`}
                className={`te-standing-row${
                  index === 0 ? " te-standing-row--leader" : ""
                }${clasifica ? " te-standing-row--qualifies" : ""}`}
              >
                <span className="te-standing-row__position">{index + 1}</span>
                <div className="te-standing-row__content">
                  <div className="te-standing-row__primary">
                    <span className="te-standing-row__name">
                      {row.parejaLabel}
                    </span>
                  </div>
                  <span className="te-standing-row__meta">
                    {row.pj} PJ · {row.pg} PG · {row.ptsFav}–{row.ptsCon} ·{" "}
                    {formatDif(row.dif)} DIF
                  </span>
                  {clasifica ? (
                    <span className="te-standing-row__qualified">
                      <span aria-hidden>✓</span> Clasificado
                    </span>
                  ) : null}
                </div>
                <strong className="te-standing-row__points">
                  {row.puntos}
                  <small>PTS</small>
                </strong>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function copyTextLegacy(text: string): boolean {
  if (typeof document === "undefined") return false;
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "true");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  document.body.removeChild(area);
  return copied;
}

function GrupoWinnerSummary({
  grupoNombre,
  rows,
  partidos,
  torneoNombre,
  categoria,
  players,
}: {
  grupoNombre: string;
  rows: StandingRowExpress[];
  partidos: TorneoExpressPartido[];
  torneoNombre: string;
  categoria: string;
  players?: TEPublicGruposAchievementPlayer[];
}) {
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  if (!isGrupoPartidosCompletos(partidos) || rows.length === 0) return null;
  const winner = rows[0];
  if (!rows.some((row) => row.pj > 0)) return null;
  const achievementPlayers =
    players && players.length >= 2
      ? players.slice(0, 2)
      : fallbackPlayersFromPair(winner.parejaLabel);

  const shareText = `${winner.parejaLabel} ganaron el ${grupoNombre} en ${torneoNombre}${
    categoria ? ` · ${categoria}` : ""
  }. Así se juega en Riviera.`;

  const flashShareMsg = (msg: string) => {
    setShareMsg(msg);
    window.setTimeout(() => setShareMsg(null), 2600);
  };

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const payload = `${shareText} ${url}`.trim();
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `${torneoNombre} · ${grupoNombre}`,
          text: shareText,
          url,
        });
        return;
      }
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(payload);
      flashShareMsg("Copiado, ya puedes pegarlo.");
      return;
    } catch {
      // Navegadores sin permiso de portapapeles: respaldo con selección manual.
    }
    if (copyTextLegacy(payload)) {
      flashShareMsg("Copiado, ya puedes pegarlo.");
      return;
    }
    flashShareMsg("No se pudo compartir, intenta de nuevo.");
  };

  return (
    <aside
      className="te-grupo-achievement"
      aria-label={`Ganadores de ${grupoNombre}`}
    >
      <div className="te-grupo-achievement__topline">
        <span>Riviera Open · {torneoNombre}</span>
        <span aria-hidden>01</span>
      </div>
      <div className="te-grupo-achievement__main">
        <div
          className="te-grupo-achievement__avatars"
          aria-label="Pareja ganadora"
        >
          {achievementPlayers.map((player, index) => (
            <div
              key={`${player.name}-${index}`}
              className="te-grupo-achievement__player"
            >
              <AchievementAvatar player={player} />
              <span title={player.name}>{player.name}</span>
            </div>
          ))}
        </div>
        <h3>¡Felicidades!</h3>
        <p>
          Lo dieron todo y se quedaron con el {grupoNombre}.
        </p>
        <span className="te-grupo-achievement__event">
          {categoria || "Torneo Express"} · Ganadores de grupo
        </span>
      </div>
      <div className="te-grupo-achievement__stats" aria-label="Estadísticas del logro">
        <span>
          <strong>{winner.puntos}</strong>
          <small>PTS</small>
        </span>
        <span>
          <strong>{winner.pg}</strong>
          <small>PG</small>
        </span>
        <span>
          <strong>{formatDif(winner.dif)}</strong>
          <small>DIF</small>
        </span>
      </div>
      <footer className="te-grupo-achievement__footer">
        <button
          type="button"
          className="te-grupo-achievement__share"
          onClick={handleShare}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
          </svg>
          Compartir
        </button>
        <p aria-live="polite">{shareMsg || "Así se juega en Riviera."}</p>
      </footer>
    </aside>
  );
}

export const TEPublicGrupos: React.FC<TEPublicGruposProps> = ({
  grupos,
  torneoNombre,
  categoria,
  fecha,
  lugar,
  singleGrupo = false,
  onCopyLink,
  copyMsg,
  faseFinalHref,
}) => {
  const [selectedGrupoId, setSelectedGrupoId] = useState<string | null>(null);
  const showGrupoIndex = !singleGrupo && grupos.length > 1;

  useEffect(() => {
    if (
      selectedGrupoId &&
      !grupos.some((grupo) => grupo.id === selectedGrupoId)
    ) {
      setSelectedGrupoId(null);
    }
  }, [grupos, selectedGrupoId]);

  const visibleGrupos = useMemo(() => {
    if (singleGrupo || !selectedGrupoId) return grupos;
    return grupos.filter((grupo) => grupo.id === selectedGrupoId);
  }, [grupos, selectedGrupoId, singleGrupo]);

  const showingFiltered = showGrupoIndex && selectedGrupoId != null;

  const subInfo = useMemo(() => {
    const totalParejas = grupos.reduce(
      (sum, g) => sum + g.standingRows.length,
      0
    );
    const parts: string[] = [];
    if (!singleGrupo) {
      parts.push(
        `${grupos.length} grupo${grupos.length === 1 ? "" : "s"}`,
        `${totalParejas} pareja${totalParejas === 1 ? "" : "s"}`
      );
    } else {
      parts.push(`${totalParejas} pareja${totalParejas === 1 ? "" : "s"}`);
    }
    if (lugar.trim()) parts.push(lugar.trim());
    if (fecha.trim()) parts.push(fecha.trim());
    return parts.join(" · ");
  }, [grupos, lugar, fecha, singleGrupo]);

  const grupoNombre = singleGrupo ? grupos[0]?.nombre?.trim() : "";
  const heroTitle = singleGrupo && grupoNombre
    ? categoria.trim()
      ? categoria.trim()
      : grupoNombre
    : categoria.trim()
      ? categoria.trim()
      : torneoNombre;
  const eyebrow = `TORNEO · ${torneoNombre.trim().toUpperCase()}`;
  const phaseMeta = singleGrupo && grupoNombre
    ? `Fase de grupos · ${grupoNombre}`
    : `Fase de grupos · ${subInfo}`;

  const gridClass =
    singleGrupo || showingFiltered
      ? "te-grupos-grid te-grupos-grid--single"
      : "te-grupos-grid";

  return (
    <div className="te-grupos-page">
      <header className="te-grupos-hero">
        <div className="te-grupos-hero__top">
          <div>
            <p className="te-grupos-eyebrow">{eyebrow}</p>
            <h1 className="te-grupos-title">{heroTitle}</h1>
            <p className="te-grupos-sub">{phaseMeta}</p>
          </div>
          {onCopyLink ? (
            <div className="te-grupos-hero__actions">
              <button
                type="button"
                className="te-grupos-share"
                onClick={onCopyLink}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
                </svg>
                Copiar enlace
              </button>
            </div>
          ) : null}
        </div>
        {copyMsg ? (
          <p className="te-grupos-copy-msg" aria-live="polite">
            {copyMsg}
          </p>
        ) : null}
      </header>

      {!singleGrupo ? (
        <nav className="te-phase-segment" aria-label="Fase del torneo">
          <span className="te-phase-segment__item te-phase-segment__item--active">
            Grupos
          </span>
          {faseFinalHref ? (
            <a className="te-phase-segment__item" href={faseFinalHref}>
              Eliminatoria
            </a>
          ) : (
            <span
              className="te-phase-segment__item te-phase-segment__item--disabled"
              aria-disabled="true"
            >
              Eliminatoria
            </span>
          )}
        </nav>
      ) : null}

      {showGrupoIndex ? (
        <nav className="te-grupos-index" aria-label="Índice de grupos">
          <button
            type="button"
            className={`te-grupos-index__btn${
              selectedGrupoId == null ? " te-grupos-index__btn--active" : ""
            }`}
            aria-pressed={selectedGrupoId == null}
            onClick={() => setSelectedGrupoId(null)}
          >
            Todos
          </button>
          {grupos.map((grupo) => {
            const active = selectedGrupoId === grupo.id;
            return (
              <button
                key={grupo.id}
                type="button"
                className={`te-grupos-index__btn${
                  active ? " te-grupos-index__btn--active" : ""
                }`}
                aria-pressed={active}
                onClick={() => setSelectedGrupoId(grupo.id)}
              >
                {grupo.nombre}
              </button>
            );
          })}
        </nav>
      ) : null}

      {grupos.length > 0 && (
        <details className="te-grupos-scoring-help">
          <summary>Criterios de clasificación</summary>
          <p>
            PG → FAV → DIF → H2H · PTS = referencia
          </p>
        </details>
      )}

      {grupos.length === 0 ? (
        <p className="te-grupos-empty">Sin grupos en este torneo.</p>
      ) : (
        <div className={gridClass}>
        {visibleGrupos.map((grupo) => (
          <section key={grupo.id} className="te-grupo-wrap">
            <div className="te-grupo-head">
              <h2 className="te-grupo-label">{grupo.nombre}</h2>
              <span className="te-grupo-clasifican-badge">
                Clasifican {grupo.clasifican}
              </span>
            </div>

            <div className="te-grupo-inner">
              <div className="te-grupo-partidos">
                {grupo.partidos.length === 0 ? (
                  <p className="te-grupos-empty">Sin partidos programados.</p>
                ) : (
                  grupo.partidos.map((partido) => (
                    <PartidoRow key={partido.id} partido={partido} />
                  ))
                )}
              </div>

              <div className="te-grupo-standing-full">
                <GrupoStandings
                  rows={grupo.standingRows}
                  clasifican={grupo.clasifican}
                />
                <GrupoWinnerSummary
                  grupoNombre={grupo.nombre}
                  rows={grupo.standingRows}
                  partidos={grupo.partidosExpress}
                  torneoNombre={torneoNombre}
                  categoria={categoria}
                  players={grupo.achievementPlayers}
                />
              </div>
            </div>
          </section>
        ))}
        </div>
      )}
    </div>
  );
};
