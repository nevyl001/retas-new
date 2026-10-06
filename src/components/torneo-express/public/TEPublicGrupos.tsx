import React, { useEffect, useMemo, useState } from "react";
import { formatMatchDateShort, toMexicoCalendarDate } from "../../../lib/matchDate";
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
import { isPartidoEnVivoWindow } from "../../../lib/torneoExpress/partidoEnVivo";
import { sortPartidosByOrden } from "../../../lib/torneoExpress/roundRobin";
import { isGrupoPartidosCompletos } from "../../../lib/torneoExpress/grupoCompletion";
import { WINNER_TAGLINE } from "../../../lib/torneoExpress/renderGroupWinnerShareCanvas";
import {
  RIVIERA_SOCIAL_HANDLE,
  RIVIERA_SOCIAL_LINKS,
} from "../../../lib/rivieraBranding";
import {
  isRivieraOwnAccountName,
  RIVIERA_CO_BRAND_ATTRIBUTION,
  RIVIERA_PRODUCT_NAME,
} from "../../../club-experience/motherBrand";
import { useClubExperience } from "../../../club-experience";
import { resolvePlayerPublicProfiles } from "../../../lib/rivieraJugadores/publicPlayerAvatars";
import { useOrganizerDisplayName } from "../../../club-experience/useOrganizerDisplayName";
import {
  clasificacionAchievementStats,
  clasificacionOrderSummary,
  clasificacionStandingHighlight,
  clasificacionStandingMeta,
} from "../../../lib/torneoExpress/clasificacionModo";
import type {
  StandingRowExpress,
  TorneoExpressBundle,
  TorneoExpressClasificacionModo,
  TorneoExpressPartido,
} from "../../../lib/torneoExpress/types";
import { TablerIcon } from "../../ui/TablerIcon";
import {
  collectPairPlayerEntries,
  paintPairSide,
  pairSideFromRoster,
  TEPublicPairIdentity,
  type TEPublicPairSide,
} from "./TEPublicPairIdentity";
import "./te-public-grupos.css";

export type TEPartidoEstadoPublico = "pendiente" | "en_vivo" | "finalizado";

export interface TEPublicGruposPartido {
  id: string;
  /** Día de la semana, p. ej. "Jueves". */
  fechaDia: string;
  /** Día y mes, p. ej. "8 oct". */
  fechaNumero: string;
  hora: string;
  cancha: string;
  pareja1: string;
  pareja2: string;
  local: TEPublicPairSide;
  visitante: TEPublicPairSide;
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
  pairsById: Record<string, TEPublicPairSide>;
  clasifican: number;
  achievementPlayers?: TEPublicGruposAchievementPlayer[];
}

export interface TEPublicGruposAchievementPlayer {
  name: string;
  playerId?: string | null;
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
  /** Enlace al hub del Evento (todas las categorías). */
  eventoHref?: string | null;
  clasificacionModo?: TorneoExpressClasificacionModo;
}

const DEFAULT_CLASIFICAN = 2;

function resolvePartidoEstado(
  partido: TorneoExpressPartido,
  now: Date
): TEPartidoEstadoPublico {
  if (partido.estado === "jugado") return "finalizado";
  if (
    isPartidoEnVivoWindow({
      estado: partido.estado,
      programado_en: partido.programado_en,
      now,
    })
  ) {
    return "en_vivo";
  }
  return "pendiente";
}

function pairSideForId(
  parejaId: string,
  parejasById: Map<string, TorneoExpressBundle["parejasPorGrupo"][string][number]>,
  fallbackLabel: string
): TEPublicPairSide {
  const pareja = parejasById.get(parejaId);
  if (!pareja) {
    return pairSideFromRoster({ display: fallbackLabel, isVirtual: true });
  }
  return pairSideFromRoster({
    isVirtual: pareja.is_virtual,
    display: pareja.pareja_display ?? pareja.pareja_id,
    player1Id: pareja.player1_id,
    player2Id: pareja.player2_id,
  });
}

function mapPartidosForGrupo(
  partidos: TorneoExpressPartido[],
  parejasById: Map<string, TorneoExpressBundle["parejasPorGrupo"][string][number]>
): TEPublicGruposPartido[] {
  const sorted = sortPartidosByOrden(partidos);
  const now = new Date();

  return sorted.map((partido) => {
    const played = partido.estado === "jugado";
    const scheduleIso = partidoScheduleIso(partido);
    const fechaLarga = formatPartidoFecha(scheduleIso);
    const fechaDia = fechaLarga.includes(" ")
      ? fechaLarga.slice(0, fechaLarga.lastIndexOf(" "))
      : fechaLarga;
    const pareja1 =
      parejasById.get(partido.pareja_local_id)?.pareja_display ??
      parejasById.get(partido.pareja_local_id)?.pareja_id ??
      "Local";
    const pareja2 =
      parejasById.get(partido.pareja_visitante_id)?.pareja_display ??
      parejasById.get(partido.pareja_visitante_id)?.pareja_id ??
      "Visitante";

    return {
      id: partido.id,
      fechaDia,
      fechaNumero: formatMatchDateShort(scheduleIso, { includeYear: false }),
      hora: formatPartidoHora(scheduleIso),
      cancha: formatCanchaDisplay(partido.cancha),
      pareja1,
      pareja2,
      local: pairSideForId(partido.pareja_local_id, parejasById, "Local"),
      visitante: pairSideForId(
        partido.pareja_visitante_id,
        parejasById,
        "Visitante"
      ),
      score1: played ? (partido.puntos_local ?? 0) : null,
      score2: played ? (partido.puntos_visitante ?? 0) : null,
      estado: resolvePartidoEstado(partido, now),
      partidoExpress: partido,
    };
  });
}

function weekdayFromFecha(iso: string): string {
  const label = formatPartidoFecha(iso);
  const splitAt = label.lastIndexOf(" ");
  return splitAt > 0 ? label.slice(0, splitAt) : label;
}

/** "Martes 6 oct" o "Martes 6 – Jueves 9 oct". */
function formatTorneoRango(firstIso: string, lastIso: string): string {
  const firstDay = toMexicoCalendarDate(firstIso);
  const lastDay = toMexicoCalendarDate(lastIso);
  const startWeekday = weekdayFromFecha(firstIso);
  const startShort = formatMatchDateShort(firstIso, { includeYear: false });
  if (!firstDay || !lastDay || firstDay === lastDay) {
    return startWeekday ? `${startWeekday} ${startShort}` : startShort;
  }

  const endWeekday = weekdayFromFecha(lastIso);
  const endShort = formatMatchDateShort(lastIso, { includeYear: false });
  const sameMonth = firstDay.slice(0, 7) === lastDay.slice(0, 7);
  const startDay = String(Number(firstDay.slice(8, 10)));
  if (sameMonth) {
    return `${startWeekday} ${startDay} – ${endWeekday} ${endShort}`;
  }
  return `${startWeekday} ${startShort} – ${endWeekday} ${endShort}`;
}

export function buildTEPublicGruposProps(
  bundle: TorneoExpressBundle,
  standingsByGrupo: Record<string, StandingRowExpress[]>,
  options?: { clasifican?: number; lugar?: string }
): Omit<TEPublicGruposProps, "onCopyLink" | "copyMsg"> {
  const clasifican = options?.clasifican ?? DEFAULT_CLASIFICAN;
  const gruposOrdenados = [...bundle.grupos].sort((a, b) => a.orden - b.orden);

  const fechaIsos: string[] = [];

  gruposOrdenados.forEach((grupo) => {
    const partidos = bundle.partidosPorGrupo[grupo.id] ?? [];
    partidos.forEach((partido) => {
      const iso = partidoScheduleIso(partido);
      if (iso) fechaIsos.push(iso);
    });
  });

  fechaIsos.sort();
  const fecha =
    fechaIsos.length > 0
      ? formatTorneoRango(fechaIsos[0]!, fechaIsos[fechaIsos.length - 1]!)
      : formatPartidoFecha(bundle.torneo.created_at);

  const grupos: TEPublicGruposGrupo[] = gruposOrdenados.map((grupo) => {
    const parejas = bundle.parejasPorGrupo[grupo.id] ?? [];
    const parejasById = new Map(parejas.map((p) => [p.pareja_id, p]));
    const pairsById: Record<string, TEPublicPairSide> = {};
    parejas.forEach((p) => {
      pairsById[p.pareja_id] = pairSideFromRoster({
        isVirtual: p.is_virtual,
        display: p.pareja_display ?? p.pareja_id,
        player1Id: p.player1_id,
        player2Id: p.player2_id,
      });
    });

    const standingRows = standingsByGrupo[grupo.id] ?? [];
    return {
      id: grupo.id,
      nombre: grupo.nombre,
      partidos: mapPartidosForGrupo(
        bundle.partidosPorGrupo[grupo.id] ?? [],
        parejasById
      ),
      partidosExpress: bundle.partidosPorGrupo[grupo.id] ?? [],
      standingRows,
      pairsById,
      clasifican,
      achievementPlayers: achievementPlayersFromWinner(parejas, standingRows),
    };
  });

  return {
    grupos,
    torneoNombre: bundle.torneo.nombre,
    categoria: bundle.torneo.categoria?.trim() ?? "",
    fecha,
    lugar: options?.lugar?.trim() ?? "",
    clasificacionModo: bundle.clasificacion_modo,
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
    return <span className="te-badge-final">Final</span>;
  }
  if (estado === "en_vivo") {
    return (
      <span className="te-badge-live">
        <span className="te-badge-live__dot" aria-hidden />
        En vivo
      </span>
    );
  }
  return <span className="te-badge-proximo">Próximo</span>;
}

function PartidoRow({
  partido,
  photos,
  ratings,
}: {
  partido: TEPublicGruposPartido;
  photos: Readonly<Record<string, string | null>>;
  ratings: Readonly<Record<string, number | null>>;
}) {
  const local = paintPairSide(partido.local, photos, ratings);
  const visitante = paintPairSide(partido.visitante, photos, ratings);
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
      className={`te-partido-item te-match-card${
        played ? " te-partido-item--played" : ""
      }${isTie ? " te-partido-item--tie" : ""}`}
    >
      <header className="te-partido-item__top">
        <div className="te-partido-meta">
          <span
            className="te-partido-fecha"
            aria-label={`${partido.fechaDia} ${partido.fechaNumero}`}
          >
            <span className="te-partido-fecha__dow">{partido.fechaDia}</span>
            <span className="te-partido-fecha__sep" aria-hidden="true">
              ·
            </span>
            <span className="te-partido-fecha__when">{partido.fechaNumero}</span>
          </span>
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
            <span
              className={`te-team-name te-team-name--pair${
                team1Wins ? " te-team-name--winner" : ""
              }${isTie ? " te-team-name--tie" : ""}${
                played && !team1Wins && !isTie ? " te-team-name--loser" : ""
              }`}
              {...(team1Wins
                ? { "aria-label": `Ganador: ${partido.pareja1}` }
                : isTie
                  ? { "aria-label": `Empate: ${partido.pareja1}` }
                  : played
                    ? { "aria-label": `Perdedor: ${partido.pareja1}` }
                    : {})}
            >
              <TEPublicPairIdentity
                variant="match"
                player1={local.player1}
                player2={local.player2}
              />
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
            className="te-partido-faceoff"
            role="separator"
            aria-label="contra"
          >
            <span className="te-partido-faceoff__rule" aria-hidden="true" />
            <span className="te-partido-faceoff__mark" aria-hidden="true">
              VS
            </span>
            <span className="te-partido-faceoff__rule" aria-hidden="true" />
          </div>
          <div
            className={`te-team-row${
              team2Wins ? " te-team-row--winner" : ""
            }${isTie ? " te-team-row--tie" : ""}${
              played && !team2Wins && !isTie ? " te-team-row--loser" : ""
            }`}
          >
            <span
              className={`te-team-name te-team-name--pair${
                team2Wins ? " te-team-name--winner" : ""
              }${isTie ? " te-team-name--tie" : ""}${
                played && !team2Wins && !isTie ? " te-team-name--loser" : ""
              }`}
              {...(team2Wins
                ? { "aria-label": `Ganador: ${partido.pareja2}` }
                : isTie
                  ? { "aria-label": `Empate: ${partido.pareja2}` }
                  : played
                    ? { "aria-label": `Perdedor: ${partido.pareja2}` }
                    : {})}
            >
              <TEPublicPairIdentity
                variant="match"
                player1={visitante.player1}
                player2={visitante.player2}
              />
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

function initialsFromName(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "RO";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function achievementPlayersFromWinner(
  parejas: TorneoExpressBundle["parejasPorGrupo"][string],
  rows: StandingRowExpress[]
): TEPublicGruposAchievementPlayer[] | undefined {
  const winner = rows[0];
  if (!winner) return undefined;
  const pareja = parejas.find((item) => item.pareja_id === winner.parejaId);
  if (!pareja || pareja.is_virtual || !pareja.player1_id || !pareja.player2_id) {
    return undefined;
  }
  const names = winner.parejaLabel
    .split(/\s*\/\s*/)
    .map((name) => name.trim())
    .filter(Boolean);
  return [
    { name: names[0] || "Jugador 1", playerId: pareja.player1_id },
    { name: names[1] || names[0] || "Jugador 2", playerId: pareja.player2_id },
  ];
}

function usePublicGruposPlayerPhotos(grupos: TEPublicGruposGrupo[]): {
  photos: Record<string, string | null>;
  ratings: Record<string, number | null>;
} {
  const { organizadorId } = useClubExperience();
  const [lookups, setLookups] = useState<{
    photos: Record<string, string | null>;
    ratings: Record<string, number | null>;
  }>({ photos: {}, ratings: {} });
  const lookupKey = useMemo(() => {
    const sides: TEPublicPairSide[] = [];
    const extra: Array<{ id?: string | null; name?: string | null }> = [];
    for (const grupo of grupos) {
      sides.push(...Object.values(grupo.pairsById));
      for (const player of grupo.achievementPlayers ?? []) {
        extra.push({ id: player.playerId, name: player.name });
      }
    }
    return JSON.stringify(collectPairPlayerEntries(sides, extra));
  }, [grupos]);

  useEffect(() => {
    if (!organizadorId || lookupKey === "[]") {
      setLookups({ photos: {}, ratings: {} });
      return;
    }
    const entries = JSON.parse(lookupKey) as Array<{ id: string; name: string }>;
    let cancelled = false;
    void resolvePlayerPublicProfiles(organizadorId, entries, { publicOnly: true })
      .then((profiles) => {
        if (cancelled) return;
        const photos: Record<string, string | null> = {};
        const ratings: Record<string, number | null> = {};
        for (const entry of entries) {
          const profile = profiles[entry.id];
          photos[entry.id] = profile?.fotoUrl ?? null;
          ratings[entry.id] =
            profile?.rating != null && Number.isFinite(profile.rating)
              ? profile.rating
              : null;
        }
        setLookups({ photos, ratings });
      })
      .catch(() => {
        if (!cancelled) setLookups({ photos: {}, ratings: {} });
      });
    return () => {
      cancelled = true;
    };
  }, [organizadorId, lookupKey]);

  return lookups;
}

function withAchievementPhotos(
  players: TEPublicGruposAchievementPlayer[] | undefined,
  photos: Record<string, string | null>
): TEPublicGruposAchievementPlayer[] | undefined {
  if (!players) return players;
  return players.map((player) => {
    const fromProfile = player.playerId ? photos[player.playerId] : null;
    return {
      ...player,
      avatarUrl: player.avatarUrl || fromProfile || null,
    };
  });
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

function ParejaStandingName({ side }: { side: TEPublicPairSide }) {
  return (
    <TEPublicPairIdentity
      variant="standings"
      player1={side.player1}
      player2={side.player2}
    />
  );
}

function GrupoStandings({
  rows,
  clasifican,
  clasificacionModo,
  pairsById,
  photos,
}: {
  rows: StandingRowExpress[];
  clasifican: number;
  clasificacionModo: TorneoExpressClasificacionModo;
  pairsById: Record<string, TEPublicPairSide>;
  photos: Readonly<Record<string, string | null>>;
}) {
  const grupoIniciado = rows.some((r) => r.pj > 0);
  const headerSource = rows[0];
  const headerInput = headerSource
    ? {
        pg: headerSource.pg,
        pp: headerSource.pp,
        ptsFav: headerSource.ptsFav,
        dif: headerSource.dif,
        puntos: headerSource.puntos,
        pj: headerSource.pj,
      }
    : null;
  const headerMeta = headerInput
    ? clasificacionStandingMeta(clasificacionModo, headerInput)
    : [];
  const headerHighlight = headerInput
    ? clasificacionStandingHighlight(clasificacionModo, headerInput)
    : null;

  return (
    <section
      className="te-grupo-standings te-standings-board"
      aria-label="Clasificación"
    >
      <header className="te-grupo-standings__header">
        <h3>Clasificación</h3>
      </header>
      {rows.length === 0 || !headerHighlight ? (
        <p className="te-grupos-empty">Sin datos de clasificación.</p>
      ) : (
        <>
          <div className="te-standings-board__head" aria-hidden="true">
            <span />
            <span>Pareja</span>
            {headerMeta.map((stat) => (
              <span key={stat.label}>{stat.label}</span>
            ))}
            <span>{headerHighlight.label}</span>
          </div>
          <ol className="te-grupo-standings__list">
            {rows.map((row, index) => {
              const clasifica = grupoIniciado && index < clasifican;
              const rowInput = {
                pg: row.pg,
                pp: row.pp,
                ptsFav: row.ptsFav,
                dif: row.dif,
                puntos: row.puntos,
                pj: row.pj,
              };
              const highlight = clasificacionStandingHighlight(
                clasificacionModo,
                rowInput
              );
              const meta = clasificacionStandingMeta(
                clasificacionModo,
                rowInput
              );
              const position = index + 1;
              return (
                <li
                  key={`${row.grupoId}-${row.parejaId}`}
                  className={`te-standing-row${
                    index === 0 ? " te-standing-row--leader" : ""
                  }${clasifica ? " te-standing-row--qualifies" : ""}`}
                >
                  <span
                    className="te-standing-row__position"
                    aria-label={
                      clasifica
                        ? `Posición ${position}, clasificado`
                        : `Posición ${position}`
                    }
                  >
                    {position}
                  </span>
                  <div className="te-standing-row__primary">
                    <ParejaStandingName
                      side={paintPairSide(
                        pairsById[row.parejaId] ??
                          pairSideFromRoster({ display: row.parejaLabel }),
                        photos
                      )}
                    />
                  </div>
                  <div className="te-standing-row__meta">
                    {meta.map((stat) => (
                      <span key={stat.label} className="te-standing-row__stat">
                        <span className="te-standing-row__stat-label">
                          {stat.label}
                        </span>
                        <span className="te-standing-row__stat-value">
                          {stat.value}
                        </span>
                      </span>
                    ))}
                  </div>
                  <strong className="te-standing-row__points">
                    <b>{highlight.value}</b>
                    <small>{highlight.label}</small>
                  </strong>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}

const SOCIAL_ICON_BY_ID = {
  instagram: "brand-instagram",
  tiktok: "brand-tiktok",
  facebook: "brand-facebook",
} as const;

function AchievementClubSignature({
  clubName,
  clubLogoUrl,
  showMotherAttribution,
}: {
  clubName: string;
  clubLogoUrl?: string | null;
  showMotherAttribution: boolean;
}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const showLogo = Boolean(clubLogoUrl?.trim()) && !logoFailed;

  return (
    <section
      className="te-grupo-achievement__signature"
      aria-label={`Organizado por ${clubName}`}
    >
      <div className="te-grupo-achievement__club">
        {showLogo ? (
          <span className="te-grupo-achievement__club-logo">
            <img
              src={clubLogoUrl!}
              alt=""
              onError={() => setLogoFailed(true)}
            />
          </span>
        ) : null}
        <div className="te-grupo-achievement__club-copy">
          <span className="te-grupo-achievement__club-name">{clubName}</span>
          {showMotherAttribution ? (
            <span className="te-grupo-achievement__club-by">
              {RIVIERA_CO_BRAND_ATTRIBUTION}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AchievementSocialSignature() {
  return (
    <div className="te-grupo-achievement__social">
      <ul aria-label="Redes sociales Riviera Open">
        {RIVIERA_SOCIAL_LINKS.map((link) => (
          <li key={link.id}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${link.label} ${RIVIERA_SOCIAL_HANDLE}`}
            >
              <TablerIcon name={SOCIAL_ICON_BY_ID[link.id]} size={16} />
            </a>
          </li>
        ))}
      </ul>
      <span>{RIVIERA_SOCIAL_HANDLE}</span>
    </div>
  );
}

function GrupoWinnerSummary({
  grupoNombre,
  rows,
  partidos,
  torneoNombre,
  categoria,
  players,
  clubName,
  clubLogoUrl,
  showMotherAttribution,
  clasificacionModo,
}: {
  grupoNombre: string;
  rows: StandingRowExpress[];
  partidos: TorneoExpressPartido[];
  torneoNombre: string;
  categoria: string;
  players?: TEPublicGruposAchievementPlayer[];
  clubName: string;
  clubLogoUrl?: string | null;
  showMotherAttribution: boolean;
  clasificacionModo: TorneoExpressClasificacionModo;
}) {
  if (!isGrupoPartidosCompletos(partidos) || rows.length === 0) return null;
  const winner = rows[0];
  if (!rows.some((row) => row.pj > 0)) return null;
  const achievementPlayers =
    players && players.length >= 2
      ? players.slice(0, 2)
      : fallbackPlayersFromPair(winner.parejaLabel);
  const setsDif = (winner.setsFav ?? 0) - (winner.setsCon ?? 0);
  const achievementStats = clasificacionAchievementStats(clasificacionModo, {
    pg: winner.pg,
    ptsFav: winner.ptsFav,
    dif: winner.dif,
    setsDif,
  });

  return (
    <aside
      className="te-grupo-achievement"
      aria-label={`Ganadores de ${grupoNombre}`}
    >
      <div className="te-grupo-achievement__art">
        <span className="te-grupo-achievement__court" aria-hidden="true" />
        <AchievementClubSignature
          clubName={clubName}
          clubLogoUrl={clubLogoUrl}
          showMotherAttribution={showMotherAttribution}
        />
        <div className="te-grupo-achievement__topline">
          <span>{torneoNombre}</span>
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
          <p>Lo dieron todo de principio a fin.</p>
          <span className="te-grupo-achievement__event">
            {categoria || "Torneo Express"} · {grupoNombre}
          </span>
        </div>
        <div
          className="te-grupo-achievement__stats"
          aria-label="Estadísticas del logro"
        >
          {achievementStats.map((stat) => (
            <span key={stat.label}>
              <strong>{stat.value}</strong>
              <small>{stat.label}</small>
            </span>
          ))}
        </div>
        <p className="te-grupo-achievement__tagline">{WINNER_TAGLINE}</p>
        <AchievementSocialSignature />
      </div>
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
  eventoHref,
  clasificacionModo = "dif_puntos",
}) => {
  const [selectedGrupoId, setSelectedGrupoId] = useState<string | null>(null);
  const { branding, isScopeBrandingReady } = useClubExperience();
  const { photos: playerPhotos, ratings: playerRatings } =
    usePublicGruposPlayerPhotos(grupos);
  const organizerName = useOrganizerDisplayName().trim();
  const clubName = organizerName || RIVIERA_PRODUCT_NAME;
  const showMotherAttribution = !isRivieraOwnAccountName(clubName);
  const clubLogoUrl = isScopeBrandingReady ? branding.logoUrl : null;
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
  const eyebrow = torneoNombre.trim();
  const phaseMeta = singleGrupo && grupoNombre
    ? `Fase de grupos · ${grupoNombre}`
    : `Fase de grupos · ${subInfo}`;
  const copyLabel = copyMsg || "Copiar enlace";

  const gridClass =
    singleGrupo || showingFiltered
      ? "te-grupos-grid te-grupos-grid--single"
      : "te-grupos-grid";

  return (
    <div className="te-grupos-page">
      <header className="te-grupos-hero">
        {eventoHref ? (
          <a
            href={eventoHref}
            className="te-grupos-back-evento"
            aria-label="Volver al evento y ver todas las categorías"
          >
            ← Volver al evento
          </a>
        ) : null}
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
                className={`te-grupos-share${
                  copyMsg ? " te-grupos-share--done" : ""
                }`}
                onClick={onCopyLink}
                aria-live="polite"
              >
                {copyMsg ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden
                  >
                    <path d="M5 12.5 9.2 17 19 7" />
                  </svg>
                ) : (
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
                )}
                {copyLabel}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {!singleGrupo ? (
        <nav className="te-phase-segment" aria-label="Fase del torneo">
          <span
            className="te-phase-segment__item te-phase-segment__item--active"
            aria-current="page"
          >
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
          <p>{clasificacionOrderSummary(clasificacionModo)}</p>
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
                    <PartidoRow
                      key={partido.id}
                      partido={partido}
                      photos={playerPhotos}
                      ratings={playerRatings}
                    />
                  ))
                )}
              </div>

              <div className="te-grupo-standing-full">
                <GrupoStandings
                  rows={grupo.standingRows}
                  clasifican={grupo.clasifican}
                  clasificacionModo={clasificacionModo}
                  pairsById={grupo.pairsById}
                  photos={playerPhotos}
                />
                <GrupoWinnerSummary
                  grupoNombre={grupo.nombre}
                  rows={grupo.standingRows}
                  partidos={grupo.partidosExpress}
                  torneoNombre={torneoNombre}
                  categoria={categoria}
                  players={withAchievementPhotos(
                    grupo.achievementPlayers,
                    playerPhotos
                  )}
                  clubName={clubName}
                  clubLogoUrl={clubLogoUrl}
                  showMotherAttribution={showMotherAttribution}
                  clasificacionModo={clasificacionModo}
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
