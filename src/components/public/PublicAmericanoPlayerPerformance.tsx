import React, { useMemo, useState } from "react";
import {
  computeStandingDif,
  formatStandingDif,
} from "../../utils/standingsDisplay";
import type { UnifiedStandingStats } from "../../lib/unifiedStandings";
import type { AmericanoPublicMatchHistoryEntry } from "../../lib/buildAmericanoPublicMatchHistory";
import { initialsFromPlayerName } from "../../lib/americano/renderAmericanoPerformanceShareCanvas";
import {
  buildAmericanoWinnerCelebration,
  isAmericanoWinnerPlacement,
} from "../../lib/americano/americanoPerformanceCopy";
import { shareAmericanoPerformanceImage } from "../../lib/americano/shareAmericanoPerformanceImage";
import { useMobileViewport } from "../../hooks/useMobileViewport";
import { Modal } from "../ui/Modal";
import { TablerIcon } from "../ui/TablerIcon";

function resultLabel(result: AmericanoPublicMatchHistoryEntry["result"]): string {
  if (result === "win") return "Victoria";
  if (result === "loss") return "Derrota";
  return "Empate";
}

function resultShort(result: AmericanoPublicMatchHistoryEntry["result"]): string {
  if (result === "win") return "W";
  if (result === "loss") return "L";
  return "E";
}

function DifText({ fav, con }: { fav: number; con: number }) {
  const dif = computeStandingDif(fav, con);
  const mod =
    dif > 0 ? "am-pub-perf__dif--pos" : dif < 0 ? "am-pub-perf__dif--neg" : "";
  return (
    <span className={`am-pub-perf__dif ${mod}`.trim()}>
      {formatStandingDif(dif)}
    </span>
  );
}

function readThemeColors(): { primary: string; accent: string } {
  if (typeof document === "undefined") {
    return { primary: "#141414", accent: "rgba(255,255,255,0.35)" };
  }
  const styles = getComputedStyle(document.documentElement);
  const primary =
    styles.getPropertyValue("--brand-primary").trim() || "#141414";
  const accent =
    styles.getPropertyValue("--brand-accent").trim() ||
    styles.getPropertyValue("--ro-accent").trim() ||
    "rgba(255,255,255,0.35)";
  return { primary, accent };
}

export const PublicAmericanoPlayerPerformance: React.FC<{
  open: boolean;
  onClose: () => void;
  playerName: string;
  position: number;
  fotoUrl?: string | null;
  eventName?: string | null;
  clubName?: string | null;
  isFinished?: boolean;
  stats: UnifiedStandingStats | null;
  /** Fallback PJ si el mapa live aún no tiene fila (mismo valor del ranking). */
  gamesPlayed?: number;
  /** FAV/CON del ranking (misma fuente que la clasificación). */
  pointsFor: number;
  pointsAgainst: number;
  history: AmericanoPublicMatchHistoryEntry[];
}> = ({
  open,
  onClose,
  playerName,
  position,
  fotoUrl,
  eventName,
  clubName,
  isFinished = false,
  stats,
  gamesPlayed = 0,
  pointsFor,
  pointsAgainst,
  history,
}) => {
  const isMobile = useMobileViewport(900);
  const initials = useMemo(
    () => initialsFromPlayerName(playerName),
    [playerName]
  );
  const hasPhoto = Boolean(fotoUrl && fotoUrl.trim());
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  const pj = stats?.pj ?? gamesPlayed;
  const pg = stats?.pg ?? 0;
  const pp = stats?.pp ?? 0;
  const pe = stats?.pe ?? 0;
  const pts = stats?.puntos ?? 0;
  const showPe = pe > 0;
  const showWinner = isAmericanoWinnerPlacement({ position, isFinished });
  const winnerCopy = useMemo(
    () => (showWinner ? buildAmericanoWinnerCelebration(eventName) : null),
    [showWinner, eventName]
  );

  const metrics = [
    { key: "pj", label: "PJ", value: String(pj) },
    { key: "pg", label: "PG", value: String(pg) },
    { key: "pp", label: "PP", value: String(pp) },
    ...(showPe ? [{ key: "pe", label: "PE", value: String(pe) }] : []),
    { key: "fav", label: "FAV", value: String(pointsFor) },
    { key: "con", label: "CON", value: String(pointsAgainst) },
    {
      key: "dif",
      label: "DIF",
      value: formatStandingDif(computeStandingDif(pointsFor, pointsAgainst)),
    },
    { key: "pts", label: "PTS", value: String(pts) },
  ];

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    setShareError(null);
    try {
      const theme = readThemeColors();
      const result = await shareAmericanoPerformanceImage({
        playerName,
        position,
        isFinished,
        eventName,
        clubName,
        fotoUrl,
        pj,
        pg,
        pp,
        pe,
        pointsFor,
        pointsAgainst,
        puntos: pts,
        themePrimary: theme.primary,
        themeAccent: theme.accent,
      });
      if (result.status === "error") {
        setShareError("No se pudo compartir. Intenta de nuevo.");
      }
      // cancelled / shared / downloaded: UI utilizable, sin alarma
    } catch {
      setShareError("No se pudo compartir. Intenta de nuevo.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={isMobile ? "full" : "lg"}
      sheet={isMobile}
      hideClose
      className="am-pub-perf-modal"
      overlayClassName="am-pub-perf-modal-overlay"
      bodyClassName="am-pub-perf-modal__body"
      ariaLabelledBy="am-pub-perf-title"
    >
      <article className={`am-pub-perf${showWinner ? " am-pub-perf--winner" : ""}`}>
        <header
          className={`am-pub-perf__hero${
            hasPhoto ? "" : " am-pub-perf__hero--fallback"
          }${showWinner ? " am-pub-perf__hero--winner" : ""}`}
        >
          {hasPhoto ? (
            <img
              className="am-pub-perf__hero-photo"
              src={fotoUrl!}
              alt=""
              decoding="async"
            />
          ) : (
            <div className="am-pub-perf__hero-fallback" aria-hidden>
              <span className="am-pub-perf__hero-initials">{initials}</span>
            </div>
          )}
          <div className="am-pub-perf__hero-overlay" aria-hidden />

          <button
            type="button"
            className="am-pub-perf__close"
            onClick={onClose}
            aria-label="Cerrar desempeño"
          >
            <TablerIcon name="x" size={20} />
          </button>

          <div className="am-pub-perf__hero-content">
            {isMobile ? (
              <span className="am-pub-perf__sheet-handle" aria-hidden />
            ) : null}
            <p className="am-pub-perf__kicker">
              {eventName?.trim() || "Americano"}
            </p>
            <h2 id="am-pub-perf-title" className="am-pub-perf__name">
              {playerName}
            </h2>
            <div className="am-pub-perf__place">
              <span className="am-pub-perf__place-num">#{position}</span>
              <span className="am-pub-perf__place-label">
                {showWinner
                  ? "Ganador"
                  : isFinished
                    ? "Clasificación"
                    : "Clasificación en vivo"}
              </span>
            </div>
            {winnerCopy ? (
              <div className="am-pub-perf__winner-callout">
                <p className="am-pub-perf__winner-headline">
                  {winnerCopy.headline}
                </p>
                <p className="am-pub-perf__winner-message">
                  {winnerCopy.message}
                </p>
              </div>
            ) : null}
          </div>
        </header>

        <div className="am-pub-perf__metrics" role="list">
          {metrics.map((m) => (
            <div key={m.key} className="am-pub-perf__metric" role="listitem">
              <span className="am-pub-perf__metric-value">
                {m.key === "dif" ? (
                  <DifText fav={pointsFor} con={pointsAgainst} />
                ) : (
                  m.value
                )}
              </span>
              <span className="am-pub-perf__metric-label">{m.label}</span>
            </div>
          ))}
        </div>

        <div className="am-pub-perf__share">
          <button
            type="button"
            className="am-pub-perf__share-btn"
            onClick={() => void handleShare()}
            disabled={sharing}
            aria-busy={sharing}
          >
            <TablerIcon name="share-3" size={18} />
            {sharing ? "Generando…" : "Compartir desempeño"}
          </button>
          {shareError ? (
            <p className="am-pub-perf__share-error" role="alert">
              {shareError}
            </p>
          ) : null}
        </div>

        <section className="am-pub-perf__history" aria-label="Mis partidos">
          <h3 className="am-pub-perf__history-title">Mis partidos</h3>
          {history.length === 0 ? (
            <p className="am-pub-perf__history-empty">
              Aún no hay partidos con marcador.
            </p>
          ) : (
            <ul className="am-pub-perf__history-list">
              {history.map((entry) => (
                <li
                  key={`${entry.matchId}-${entry.roundNumber}`}
                  className={`am-pub-perf__history-row am-pub-perf__history-row--${entry.result}`}
                >
                  <span className="am-pub-perf__history-round">
                    R{entry.roundNumber}
                  </span>
                  <span className="am-pub-perf__history-lineup">
                    <span className="am-pub-perf__history-partner">
                      con {entry.partnerName}
                    </span>
                    <span className="am-pub-perf__history-rivals">
                      vs {entry.rivalsLabel}
                    </span>
                  </span>
                  <span className="am-pub-perf__history-score">
                    {entry.scoreFavor}–{entry.scoreContra}
                  </span>
                  <span
                    className="am-pub-perf__history-result"
                    title={resultLabel(entry.result)}
                  >
                    <span className="am-pub-perf__history-result-short">
                      {resultShort(entry.result)}
                    </span>
                    <span className="am-pub-perf__history-result-full">
                      {resultLabel(entry.result)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </article>
    </Modal>
  );
};
