import React from "react";
import {
  PUNTOS_AMERICANO,
  PUNTOS_DUELO_2V2,
  PUNTOS_EXPRESS,
  PUNTOS_LIGA,
  PUNTOS_RETA,
  calcularPuntosEvento,
} from "../../lib/rivieraJugadores/rivieraRankingPoints";
import { TablerIcon } from "../ui/TablerIcon";

const expressCampeon = calcularPuntosEvento({
  formato: "express",
  posicion_final: 1,
  paso_fase_grupos: true,
  paso_semifinal: true,
  llego_final: true,
});

const americanoMax = calcularPuntosEvento({
  formato: "americano",
  posicion_final: 1,
  victorias_americano: 6,
});

const LIGA_MAX = PUNTOS_LIGA.BASE_INSCRIPCION + PUNTOS_LIGA.PRIMER_LUGAR;
const RETA_MAX = PUNTOS_RETA.PRIMER_LUGAR;
const DUELO_MAX = PUNTOS_DUELO_2V2.GANADOR;

const MODALIDADES = [
  {
    id: "liga",
    icon: "trophy",
    nombre: "Liga",
    linea: `Inscripción ${PUNTOS_LIGA.BASE_INSCRIPCION} · jornada ganada +${PUNTOS_LIGA.GANAR_JORNADA} · podio ${PUNTOS_LIGA.PRIMER_LUGAR}/${PUNTOS_LIGA.SEGUNDO_LUGAR}/${PUNTOS_LIGA.TERCER_LUGAR}`,
    maxPts: LIGA_MAX,
  },
  {
    id: "torneo",
    icon: "bolt",
    nombre: "Torneo Express",
    linea: `Participación ${PUNTOS_EXPRESS.PARTICIPACION} + grupos ${PUNTOS_EXPRESS.PASAR_FASE_GRUPOS} + semis ${PUNTOS_EXPRESS.PASAR_SEMIFINAL} + final ${PUNTOS_EXPRESS.LLEGAR_FINAL} + podio ${PUNTOS_EXPRESS.PRIMER_LUGAR}/${PUNTOS_EXPRESS.SEGUNDO_LUGAR}/${PUNTOS_EXPRESS.TERCER_LUGAR}`,
    maxPts: expressCampeon,
  },
  {
    id: "americano",
    icon: "refresh",
    nombre: "Americano",
    linea: `Base ${PUNTOS_AMERICANO.PARTICIPACION} + ${PUNTOS_AMERICANO.POR_VICTORIA} por victoria + podio ${PUNTOS_AMERICANO.PRIMER_LUGAR}/${PUNTOS_AMERICANO.SEGUNDO_LUGAR}/${PUNTOS_AMERICANO.TERCER_LUGAR} · ej. campeón 6 vict. ≈ ${americanoMax}`,
    maxPts: americanoMax,
  },
  {
    id: "reta",
    icon: "ball-tennis",
    nombre: "Reta",
    linea: `1° ${PUNTOS_RETA.PRIMER_LUGAR} · 2° ${PUNTOS_RETA.SEGUNDO_LUGAR} · 3° ${PUNTOS_RETA.TERCER_LUGAR} · 4°+ ${PUNTOS_RETA.PARTICIPACION}`,
    maxPts: RETA_MAX,
  },
  {
    id: "duelo",
    icon: "swords",
    nombre: "Duelo 2v2",
    linea: `Ganador ${PUNTOS_DUELO_2V2.GANADOR} · perdedor ${PUNTOS_DUELO_2V2.PERDEDOR}`,
    maxPts: DUELO_MAX,
  },
] as const;

const EXPRESS_DETALLE = [
  { label: "Participar", pts: PUNTOS_EXPRESS.PARTICIPACION },
  { label: "Pasar grupos", pts: PUNTOS_EXPRESS.PASAR_FASE_GRUPOS },
  { label: "Semifinal", pts: PUNTOS_EXPRESS.PASAR_SEMIFINAL },
  { label: "Final", pts: PUNTOS_EXPRESS.LLEGAR_FINAL },
  { label: "Podio 1.º", pts: PUNTOS_EXPRESS.PRIMER_LUGAR },
  { label: "Podio 2.º", pts: PUNTOS_EXPRESS.SEGUNDO_LUGAR },
  { label: "Podio 3.º", pts: PUNTOS_EXPRESS.TERCER_LUGAR },
] as const;

/** Resumen compacto para el toggle del ranking público. */
export const RankingPuntosTeaserPills: React.FC = () => (
  <>
    Liga <strong>{LIGA_MAX}</strong> · Torneo Express <strong>{expressCampeon}</strong> ·
    Americano <strong>{americanoMax}</strong> · Reta <strong>{RETA_MAX}</strong> · Duelo{" "}
    <strong>{DUELO_MAX}</strong>
  </>
);

export const RankingPuntosTeaser: React.FC = () => {
  return (
    <div className="rjp-ranking-intro" aria-label="Sistema de puntos">
      <section className="rjp-ranking-modalidades" aria-labelledby="rjp-modalidades-title">
        <h2 id="rjp-modalidades-title" className="rjp-ranking-section-label">
          Modalidades
        </h2>
        <ul className="rjp-ranking-modalidades__list">
          {MODALIDADES.map((m) => (
            <li key={m.id}>
              <article className="rjp-ranking-modalidad">
                <span className="rjp-ranking-modalidad__icon-wrap" aria-hidden>
                  <TablerIcon name={m.icon} size={18} />
                </span>
                <div className="rjp-ranking-modalidad__body">
                  <span className="rjp-ranking-modalidad__name">{m.nombre}</span>
                  <span className="rjp-ranking-modalidad__line">{m.linea}</span>
                </div>
                <span className="rjp-ranking-modalidad__max">
                  {m.maxPts.toLocaleString("es-MX")}{" "}
                  <span className="rjp-ranking-modalidad__max-unit">pts máx</span>
                </span>
              </article>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="rjp-ranking-express"
        aria-labelledby="rjp-express-title"
      >
        <h2 id="rjp-express-title" className="rjp-ranking-section-label">
          Torneo Express — por fase
        </h2>
        <div className="rjp-ranking-express__grid">
          {EXPRESS_DETALLE.map((f) => (
            <div key={f.label} className="rjp-ranking-express__cell">
              <span className="rjp-ranking-express__label">{f.label}</span>
              <span className="rjp-ranking-express__pts">
                {f.pts.toLocaleString("es-MX")} pts
              </span>
            </div>
          ))}
          <div className="rjp-ranking-express__cell rjp-ranking-express__cell--total">
            <span className="rjp-ranking-express__label">Campeón (total acumulado)</span>
            <span className="rjp-ranking-express__pts rjp-ranking-express__pts--hero">
              ≈ {expressCampeon.toLocaleString("es-MX")} pts
            </span>
          </div>
        </div>
      </section>
    </div>
  );
};
