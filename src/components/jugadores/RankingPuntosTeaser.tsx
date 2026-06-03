import React from "react";
import {
  PUNTOS_AMERICANO,
  PUNTOS_EXPRESS,
  PUNTOS_LIGA,
  PUNTOS_RETA,
  calcularPuntosEvento,
} from "../../lib/rivieraJugadores/rivieraRankingPoints";
import { TablerIcon } from "../ui/TablerIcon";
import { buildRankingComoFuncionaPath } from "./jugadoresPublicNav";

const expressCampeon = calcularPuntosEvento({
  formato: "express",
  posicion_final: 1,
  paso_fase_grupos: true,
  paso_semifinal: true,
  llego_final: true,
});

const FORMATOS_RESUMEN = [
  {
    icon: "🏆",
    nombre: "Liga",
    linea: `+${PUNTOS_LIGA.BASE_INSCRIPCION} inscripción · +${PUNTOS_LIGA.GANAR_JORNADA} por jornada ganada (pareja) · podio ${PUNTOS_LIGA.PRIMER_LUGAR}/${PUNTOS_LIGA.SEGUNDO_LUGAR}/${PUNTOS_LIGA.TERCER_LUGAR}`,
  },
  {
    icon: "⚔️",
    nombre: "Reta",
    linea: `+${PUNTOS_RETA.PARTICIPACION} jugar · +${PUNTOS_RETA.VICTORIA} si ganas`,
  },
  {
    icon: "🔄",
    nombre: "Americano",
    linea: `+${PUNTOS_AMERICANO.PARTICIPACION} · +${PUNTOS_AMERICANO.POR_VICTORIA}/victoria · podio ${PUNTOS_AMERICANO.PRIMER_LUGAR}/${PUNTOS_AMERICANO.SEGUNDO_LUGAR}/${PUNTOS_AMERICANO.TERCER_LUGAR}`,
  },
  {
    icon: "⚡",
    nombre: "Torneo Express",
    linea: `Ruta: +${PUNTOS_EXPRESS.PARTICIPACION} → +${PUNTOS_EXPRESS.PASAR_FASE_GRUPOS} grupos → +${PUNTOS_EXPRESS.PASAR_SEMIFINAL} semi → +${PUNTOS_EXPRESS.LLEGAR_FINAL} final + podio`,
  },
] as const;

const EXPRESS_HITOS = [
  { label: "Participar", pts: PUNTOS_EXPRESS.PARTICIPACION },
  { label: "Pasar grupos", pts: PUNTOS_EXPRESS.PASAR_FASE_GRUPOS },
  { label: "Semifinal", pts: PUNTOS_EXPRESS.PASAR_SEMIFINAL },
  { label: "Final", pts: PUNTOS_EXPRESS.LLEGAR_FINAL },
  { label: "Campeón (+podio)", pts: PUNTOS_EXPRESS.PRIMER_LUGAR },
] as const;

export const RankingPuntosTeaser: React.FC = () => {
  const reglasHref = buildRankingComoFuncionaPath();

  return (
    <section className="rjp-ranking-puntos" aria-labelledby="rjp-ranking-puntos-title">
      <div className="rjp-ranking-puntos__head">
        <div>
          <h2 id="rjp-ranking-puntos-title" className="rjp-ranking-puntos__title">
            Sistema de puntos
          </h2>
          <p className="rjp-ranking-puntos__sub">
            Retas, ligas, americanos y torneos suman al mismo ranking. Sin puntos
            negativos.
          </p>
        </div>
        <a className="rjp-ranking-puntos__cta" href={reglasHref}>
          Ver reglas completas
          <TablerIcon name="chevron-right" size={18} />
        </a>
      </div>

      <div className="rjp-ranking-puntos__express" aria-label="Hitos Torneo Express">
        <p className="rjp-ranking-puntos__express-label">Torneo Express — hitos</p>
        <ul className="rjp-ranking-puntos__milestones">
          {EXPRESS_HITOS.map((h) => (
            <li key={h.label} className="rjp-ranking-puntos__milestone">
              <span>{h.label}</span>
              <span className="rjp-ranking-puntos__pts">+{h.pts}</span>
            </li>
          ))}
        </ul>
        <p className="rjp-ranking-puntos__express-foot">
          Ej. campeón (con todos los hitos):{" "}
          <strong>{expressCampeon.toLocaleString("es-MX")} pts</strong>
        </p>
      </div>

      <ul className="rjp-ranking-puntos__formatos">
        {FORMATOS_RESUMEN.map((f) => (
          <li key={f.nombre} className="rjp-ranking-puntos__formato">
            <span className="rjp-ranking-puntos__formato-icon" aria-hidden>
              {f.icon}
            </span>
            <div>
              <span className="rjp-ranking-puntos__formato-name">{f.nombre}</span>
              <span className="rjp-ranking-puntos__formato-line">{f.linea}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
