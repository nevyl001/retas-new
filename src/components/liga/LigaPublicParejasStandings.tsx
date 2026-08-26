import React, { useCallback, useMemo } from "react";
import type { LigaEquipo, LigaEquipoRankingItem } from "../../lib/liga/types";
import {
  useFlipReorder,
  useInViewOnce,
} from "../../lib/liga/ligaPublicMotion";
import { LigaMotionValue } from "./LigaMotionValue";
import { LigaPublicParejaPlayers } from "./LigaPublicParejaFaces";
import "./liga-public-general-standings.css";
import "./liga-public-motion.css";

export type LigaPublicParejaStandingRow = {
  ranking: LigaEquipoRankingItem;
  equipo?: LigaEquipo;
  foto1: string | null;
  foto2: string | null;
};

interface LigaPublicParejasStandingsProps {
  rows: LigaPublicParejaStandingRow[];
  /** Subtítulo editorial (p. ej. "8 parejas · 4 jornadas"). */
  subtitle?: string;
  /** Solo para reset de reveal/FLIP al cambiar de liga — no en poll. */
  motionResetKey?: string;
}

function splitParejaNombre(nombre: string): [string, string] {
  const parts = nombre.split(/\s*\/\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0]!, parts[1]!];
  if (parts.length === 1) return [parts[0]!, ""];
  return ["?", "?"];
}

function resolveNames(
  ranking: LigaEquipoRankingItem,
  equipo?: LigaEquipo
): { name1: string; name2: string } {
  const [fallback1, fallback2] = splitParejaNombre(ranking.nombre);
  return {
    name1: equipo?.jugador1?.nombre?.trim() || fallback1,
    name2: equipo?.jugador2?.nombre?.trim() || fallback2 || "?",
  };
}

function formatDif(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function formatPos(pos: number): string {
  return String(pos).padStart(2, "0");
}

function StandingMetrics({
  ranking,
  compact = false,
}: {
  ranking: LigaEquipoRankingItem;
  compact?: boolean;
}) {
  const dif = formatDif(ranking.diferencia_games);
  if (compact) {
    return (
      <p className="liga-pub-general__metrics liga-pub-general__metrics--compact">
        <span>
          {ranking.partidos_ganados} PG · {ranking.partidos_perdidos} PP
        </span>
        <span>
          {ranking.games_favor} GF · {ranking.games_contra} GC · DIF {dif}
        </span>
      </p>
    );
  }
  return (
    <ul className="liga-pub-general__metrics liga-pub-general__metrics--grid" aria-label="Métricas">
      <li>
        <span className="liga-pub-general__metric-label">PG</span>
        <span className="liga-pub-general__metric-value">
          {ranking.partidos_ganados}
        </span>
      </li>
      <li>
        <span className="liga-pub-general__metric-label">PP</span>
        <span className="liga-pub-general__metric-value">
          {ranking.partidos_perdidos}
        </span>
      </li>
      <li>
        <span className="liga-pub-general__metric-label">GF</span>
        <span className="liga-pub-general__metric-value">
          {ranking.games_favor}
        </span>
      </li>
      <li>
        <span className="liga-pub-general__metric-label">GC</span>
        <span className="liga-pub-general__metric-value">
          {ranking.games_contra}
        </span>
      </li>
      <li>
        <span className="liga-pub-general__metric-label">DIF</span>
        <span className="liga-pub-general__metric-value">{dif}</span>
      </li>
    </ul>
  );
}

function PodiumCard({
  row,
  index,
}: {
  row: LigaPublicParejaStandingRow;
  index: number;
}) {
  const { ranking, equipo, foto1, foto2 } = row;
  const { name1, name2 } = resolveNames(ranking, equipo);
  const place = ranking.posicion;

  return (
    <article
      className={`liga-pub-podium__card liga-pub-podium__card--${place}`}
      data-flip-key={`podium-${ranking.equipo_id}`}
      style={{ ["--liga-podium-i" as string]: index } as React.CSSProperties}
      aria-label={`${place}° lugar · ${ranking.nombre}`}
    >
      <p className="liga-pub-podium__place">
        <span className="liga-pub-podium__place-num">
          <LigaMotionValue morphKey={place} value={place} />
        </span>
        <span className="liga-pub-podium__place-suffix">°</span>
        <span className="liga-pub-podium__place-label">lugar</span>
      </p>

      <div className="liga-pub-podium__pair">
        <LigaPublicParejaPlayers
          name1={name1}
          name2={name2}
          foto1={foto1}
          foto2={foto2}
          size={place === 1 ? "lg" : "md"}
          orientation="stack"
          win={place === 1}
        />
      </div>

      <div className="liga-pub-podium__pts-block">
        <span className="liga-pub-podium__pts">
          <LigaMotionValue morphKey={ranking.puntos} value={ranking.puntos} />
        </span>
        <span className="liga-pub-podium__pts-label">PTS</span>
      </div>

      <StandingMetrics ranking={ranking} />
    </article>
  );
}

function RestRow({
  row,
  index,
}: {
  row: LigaPublicParejaStandingRow;
  index: number;
}) {
  const { ranking, equipo, foto1, foto2 } = row;
  const { name1, name2 } = resolveNames(ranking, equipo);

  return (
    <li
      className="liga-pub-general__row"
      data-flip-key={ranking.equipo_id}
      style={{ ["--liga-rest-i" as string]: index } as React.CSSProperties}
    >
      <div
        className="liga-pub-general__pos"
        aria-label={`Posición ${ranking.posicion}`}
      >
        <span className="liga-pub-general__pos-num">
          <LigaMotionValue
            morphKey={ranking.posicion}
            value={formatPos(ranking.posicion)}
          />
        </span>
      </div>

      <div className="liga-pub-general__body">
        <LigaPublicParejaPlayers
          name1={name1}
          name2={name2}
          foto1={foto1}
          foto2={foto2}
          size="md"
          orientation="stack"
        />
        <StandingMetrics ranking={ranking} compact />
      </div>

      <div className="liga-pub-general__pts-block">
        <span className="liga-pub-general__pts">
          <LigaMotionValue morphKey={ranking.puntos} value={ranking.puntos} />
        </span>
        <span className="liga-pub-general__pts-label">PTS</span>
      </div>
    </li>
  );
}

export const LigaPublicParejasStandings: React.FC<
  LigaPublicParejasStandingsProps
> = ({ rows, subtitle, motionResetKey = "" }) => {
  const top3 = useMemo(
    () =>
      rows
        .filter((r) => r.ranking.posicion >= 1 && r.ranking.posicion <= 3)
        .sort((a, b) => a.ranking.posicion - b.ranking.posicion),
    [rows]
  );
  const rest = useMemo(
    () =>
      rows
        .filter((r) => r.ranking.posicion > 3)
        .sort((a, b) => a.ranking.posicion - b.ranking.posicion),
    [rows]
  );

  const flipKeys = useMemo(
    () => rows.map((r) => r.ranking.equipo_id),
    [rows]
  );
  const flipRef = useFlipReorder(flipKeys, rows.length > 0);
  const [revealRef, inView] = useInViewOnce<HTMLDivElement>(
    rows.length > 0,
    motionResetKey
  );

  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      (flipRef as React.MutableRefObject<HTMLElement | null>).current = node;
      (revealRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
    },
    [flipRef, revealRef]
  );

  if (!rows.length) {
    return <p className="liga-pantalla__loading">Sin puntos aún.</p>;
  }

  /* Desktop visual order: 2 · 1 · 3 */
  const podiumVisual = [top3[1], top3[0], top3[2]].filter(
    (r): r is LigaPublicParejaStandingRow => r != null
  );

  return (
    <div
      ref={setRootRef}
      className={`liga-pub-general${inView ? " liga-pub-general--inview" : ""}`}
    >
      <header className="liga-pub-general__head">
        <p className="liga-pub-general__eyebrow">Liga · temporada</p>
        <h2 id="liga-pub-general-title" className="liga-pub-general__title">
          Clasificación general
        </h2>
        {subtitle ? (
          <p className="liga-pub-general__subtitle">{subtitle}</p>
        ) : null}
      </header>

      {top3.length > 0 ? (
        <section
          className="liga-pub-podium"
          aria-label="Podio — primeros tres lugares"
        >
          {podiumVisual.map((row, index) => (
            <PodiumCard
              key={row.ranking.equipo_id}
              row={row}
              index={index}
            />
          ))}
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section className="liga-pub-general__rest" aria-label="Resto de posiciones">
          <div className="liga-pub-general__rest-divider" aria-hidden />
          <p className="liga-pub-general__rest-label">Resto de posiciones</p>
          <ol className="liga-pub-general__list">
            {rest.map((row, index) => (
              <RestRow key={row.ranking.equipo_id} row={row} index={index} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
};
