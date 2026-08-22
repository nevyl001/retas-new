import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { shareGroupWinnerImage } from "../../../lib/torneoExpress/shareGroupWinnerImage";
import { WINNER_TAGLINE } from "../../../lib/torneoExpress/renderGroupWinnerShareCanvas";
import {
  RIVIERA_SOCIAL_HANDLE,
  RIVIERA_SOCIAL_LINKS,
} from "../../../lib/rivieraBranding";
import { RIVIERA_CO_BRAND_ATTRIBUTION } from "../../../club-experience/motherBrand";
import { useClubExperience } from "../../../club-experience";
import type {
  StandingRowExpress,
  TorneoExpressBundle,
  TorneoExpressPartido,
} from "../../../lib/torneoExpress/types";
import { TablerIcon } from "../../ui/TablerIcon";
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
                  : played
                    ? { "aria-label": `Perdedor: ${partido.pareja1}` }
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
                  : played
                    ? { "aria-label": `Perdedor: ${partido.pareja2}` }
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

function readShareTheme(): { primary: string; accent: string } {
  if (typeof document === "undefined") {
    return { primary: "#111416", accent: "#c9845c" };
  }
  const styles = getComputedStyle(document.documentElement);
  return {
    primary: styles.getPropertyValue("--brand-primary").trim() || "#111416",
    accent:
      styles.getPropertyValue("--brand-accent").trim() ||
      styles.getPropertyValue("--ro-accent").trim() ||
      "#c9845c",
  };
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

function ParejaStandingName({ label }: { label: string }) {
  const parts = label.split(" / ").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    return <span className="te-standing-row__name">{label}</span>;
  }
  return (
    <span className="te-standing-row__name" title={label}>
      <span className="te-standing-row__player">{parts[0]}</span>
      <span className="te-standing-row__player">{parts[1]}</span>
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
  const grupoIniciado = rows.some((r) => r.pj > 0);
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
            const clasifica = grupoIniciado && index < clasifican;
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
                    <ParejaStandingName label={row.parejaLabel} />
                  </div>
                  <span className="te-standing-row__meta">
                    <span className="te-standing-row__stat">
                      <b>{row.pj}</b> PJ
                    </span>
                    <span className="te-standing-row__stat">
                      <b>{row.pg}</b> PG
                    </span>
                    <span className="te-standing-row__stat">
                      {row.ptsFav}–{row.ptsCon}
                    </span>
                    <span className="te-standing-row__stat">
                      <b>{formatDif(row.dif)}</b> DIF
                    </span>
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

const SOCIAL_ICON_BY_ID = {
  instagram: "brand-instagram",
  tiktok: "brand-tiktok",
  facebook: "brand-facebook",
} as const;

function AchievementClubSignature({
  clubName,
  clubLogoUrl,
}: {
  clubName: string;
  clubLogoUrl?: string | null;
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
          <span className="te-grupo-achievement__club-by">
            {RIVIERA_CO_BRAND_ATTRIBUTION}
          </span>
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
}: {
  grupoNombre: string;
  rows: StandingRowExpress[];
  partidos: TorneoExpressPartido[];
  torneoNombre: string;
  categoria: string;
  players?: TEPublicGruposAchievementPlayer[];
  clubName: string;
  clubLogoUrl?: string | null;
}) {
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const sharingRef = useRef(false);

  if (!isGrupoPartidosCompletos(partidos) || rows.length === 0) return null;
  const winner = rows[0];
  if (!rows.some((row) => row.pj > 0)) return null;
  const achievementPlayers =
    players && players.length >= 2
      ? players.slice(0, 2)
      : fallbackPlayersFromPair(winner.parejaLabel);

  const flashShareMsg = (msg: string) => {
    setShareMsg(msg);
    window.setTimeout(() => setShareMsg(null), 2600);
  };

  const handleShare = async () => {
    if (sharingRef.current) return;
    sharingRef.current = true;
    setIsSharing(true);
    setShareMsg(null);
    try {
      const theme = readShareTheme();
      const result = await shareGroupWinnerImage({
        tournamentName: torneoNombre,
        clubName,
        clubLogoUrl,
        categoryName: categoria || "Torneo Express",
        groupName: grupoNombre,
        pairName: winner.parejaLabel,
        player1: achievementPlayers[0],
        player2: achievementPlayers[1],
        position: 1,
        points: winner.puntos,
        played: winner.pj,
        wins: winner.pg,
        fav: winner.ptsFav,
        con: winner.ptsCon,
        diff: winner.dif,
        themePrimary: theme.primary,
        themeAccent: theme.accent,
      });
      if (result.status === "downloaded") {
        flashShareMsg("Logro guardado. Ya puedes compartirlo en tus redes.");
      } else if (result.status === "error") {
        flashShareMsg("No pudimos preparar tu logro. Intenta nuevamente.");
      }
    } catch {
      flashShareMsg("No pudimos preparar tu logro. Intenta nuevamente.");
    } finally {
      sharingRef.current = false;
      setIsSharing(false);
    }
  };

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
        <p className="te-grupo-achievement__tagline">{WINNER_TAGLINE}</p>
        <AchievementSocialSignature />
      </div>
      <footer className="te-grupo-achievement__footer">
        <button
          type="button"
          className="te-grupo-achievement__share"
          onClick={handleShare}
          disabled={isSharing}
          aria-busy={isSharing}
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
          {isSharing ? "Preparando tu logro…" : "Compartir logro"}
        </button>
        {shareMsg ? <p aria-live="polite">{shareMsg}</p> : null}
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
  const { branding, manifest, isScopeBrandingReady } = useClubExperience();
  const clubName =
    isScopeBrandingReady && manifest.displayName.trim()
      ? manifest.displayName.trim()
      : isScopeBrandingReady && branding.nombre.trim()
        ? branding.nombre.trim()
      : "Riviera Open";
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
            DIF → FAV → PG → H2H · PTS = referencia
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
                  clubName={clubName}
                  clubLogoUrl={clubLogoUrl}
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
