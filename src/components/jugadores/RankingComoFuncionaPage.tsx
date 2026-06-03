import React from "react";
import {
  calcularPuntosEvento,
  PUNTOS_AMERICANO,
  PUNTOS_EXPRESS,
  PUNTOS_LIGA,
  PUNTOS_RETA,
  PUNTOS_RETA_EQUIPOS,
} from "../../lib/rivieraJugadores/rivieraRankingPoints";
import { getPublicOrganizadorIdWithoutUser } from "../../lib/rivieraJugadores/publicOrganizador";
import { buildPublicRankingUrl } from "./jugadoresPublicNav";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import "./ranking-como-funciona.css";

type PuntosTone = "base" | "win" | "gold" | "silver" | "bronze" | "zero" | "default";

interface PuntosRow {
  concepto: string;
  cuando: string;
  puntos: string;
  tone?: PuntosTone;
}

interface FormatoCardProps {
  icon: string;
  title: string;
  subtitle?: string;
  star?: boolean;
  note?: string;
  rows: PuntosRow[];
  footer: { label: string; value: string }[];
  delayMs: number;
}

const L = PUNTOS_LIGA;
const R = PUNTOS_RETA;
const RE = PUNTOS_RETA_EQUIPOS;
const A = PUNTOS_AMERICANO;
const E = PUNTOS_EXPRESS;

const expressEliminatoria = {
  paso_fase_grupos: true as const,
  paso_semifinal: true as const,
};

const expressCampeon = calcularPuntosEvento({
  formato: "express",
  posicion_final: 1,
  ...expressEliminatoria,
  llego_final: true,
});
const expressFinalista = calcularPuntosEvento({
  formato: "express",
  posicion_final: 2,
  ...expressEliminatoria,
  llego_final: true,
});
const expressSemiPodio = calcularPuntosEvento({
  formato: "express",
  posicion_final: 3,
  ...expressEliminatoria,
});
const expressCuartos = calcularPuntosEvento({
  formato: "express",
  paso_fase_grupos: true,
});

function PuntosValue({ text, tone = "default" }: { text: string; tone?: PuntosTone }) {
  return <span className={`rkcf-pts rkcf-pts--${tone}`}>{text}</span>;
}

function FormatoCard({
  icon,
  title,
  subtitle,
  star,
  note,
  rows,
  footer,
  delayMs,
}: FormatoCardProps) {
  return (
    <article
      className={`rkcf-card${star ? " rkcf-card--star" : ""}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <header className="rkcf-card__head">
        <span className="rkcf-card__icon" aria-hidden>
          {icon}
        </span>
        <div>
          <h3 className="rkcf-card__title">{title}</h3>
          {subtitle && <p className="rkcf-card__sub">{subtitle}</p>}
        </div>
        {star && (
          <span className="rkcf-card__badge">Formato estrella</span>
        )}
      </header>
      {note && <p className="rkcf-card__note">{note}</p>}
      <table className="rkcf-table rkcf-table--3col">
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Cuándo</th>
            <th scope="col">Puntos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.concepto}-${row.cuando}`}>
              <td className="rkcf-table__concepto">{row.concepto}</td>
              <td className="rkcf-table__meta" data-label="Cuándo">
                {row.cuando}
              </td>
              <td className="rkcf-table__meta rkcf-table__meta--pts" data-label="Puntos">
                <PuntosValue text={row.puntos} tone={row.tone} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="rkcf-card__footer">
        {footer.map((f) => (
          <div key={f.label} className="rkcf-card__stat">
            <span className="rkcf-card__stat-lbl">{f.label}</span>
            <span className="rkcf-card__stat-val">{f.value}</span>
          </div>
        ))}
      </footer>
    </article>
  );
}

export const RankingComoFuncionaPage: React.FC = () => {
  const rankingHref = buildPublicRankingUrl(getPublicOrganizadorIdWithoutUser());

  return (
    <JugadoresPublicShell variant="ranking" layout="rules">
      <div className="rkcf rkcf--page">
        <section className="rkcf-hero">
          <div className="rkcf-hero__grid" aria-hidden />
          <div className="rkcf-hero__inner">
            <span className="rkcf-hero__badge">
              <span className="rkcf-hero__badge-dot" aria-hidden />
              Temporada activa
            </span>
            <h1 className="rkcf-hero__title">Ranking Riviera Open</h1>
            <p className="rkcf-hero__sub">
              Todo lo que juegas suma. Sin puntos negativos.
            </p>
          </div>
        </section>

        <section className="rkcf-rules" aria-label="Reglas generales">
          <ul className="rkcf-rules__list">
            <li className="rkcf-rules__chip rkcf-reveal" style={{ animationDelay: "0ms" }}>
              Los puntos se asignan al terminar cada evento
            </li>
            <li className="rkcf-rules__chip rkcf-reveal" style={{ animationDelay: "80ms" }}>
              Todo suma al mismo ranking global
            </li>
            <li className="rkcf-rules__chip rkcf-reveal" style={{ animationDelay: "160ms" }}>
              Sin puntos negativos — siempre ganas algo
            </li>
          </ul>
        </section>

        <section className="rkcf-formats" aria-labelledby="rkcf-formats-title">
          <h2 id="rkcf-formats-title" className="rkcf-section-title rkcf-reveal">
            Puntos por formato
          </h2>
          <p className="rkcf-section-sub rkcf-reveal">
            Mismas reglas que usa la app al cerrar retas, ligas, americanos y torneos.
          </p>

          <div className="rkcf-formats__grid">
            <FormatoCard
              icon="🏆"
              title="Liga Riviera Open"
              subtitle="Formato estrella"
              star
              note="Sin tope de jornadas: el calendario se genera según inscritos (p. ej. 8 jugadores → 7 jornadas). Cada vez que tu pareja gana la jornada sumas +50 al cerrarla."
              delayMs={0}
              rows={[
                {
                  concepto: "Liga inscripción",
                  cuando: "Al inscribir jugador",
                  puntos: `+${L.BASE_INSCRIPCION} (una vez, no duplica)`,
                  tone: "base",
                },
                {
                  concepto: "Liga jornada",
                  cuando: "Al finalizar jornada",
                  puntos: `+${L.GANAR_JORNADA} si ganó la jornada (pareja ganadora)`,
                  tone: "win",
                },
                {
                  concepto: "Jornada sin ganar",
                  cuando: "Al finalizar jornada",
                  puntos: "+0",
                  tone: "zero",
                },
                {
                  concepto: "Liga podio — 1.º",
                  cuando: "Al cerrar la liga",
                  puntos: `+${L.PRIMER_LUGAR}`,
                  tone: "gold",
                },
                {
                  concepto: "Liga podio — 2.º",
                  cuando: "Al cerrar la liga",
                  puntos: `+${L.SEGUNDO_LUGAR}`,
                  tone: "silver",
                },
                {
                  concepto: "Liga podio — 3.º",
                  cuando: "Al cerrar la liga",
                  puntos: `+${L.TERCER_LUGAR}`,
                  tone: "bronze",
                },
                {
                  concepto: "4.º en adelante",
                  cuando: "Al cerrar la liga",
                  puntos: "+0",
                  tone: "zero",
                },
              ]}
              footer={[
                { label: "Solo inscripción", value: `${L.BASE_INSCRIPCION}` },
                {
                  label: "Campeón sin jornadas",
                  value: `${L.BASE_INSCRIPCION + L.PRIMER_LUGAR}`,
                },
                {
                  label: "Ej. 5 jornadas ganadas + 1.º",
                  value: `${L.BASE_INSCRIPCION + 5 * L.GANAR_JORNADA + L.PRIMER_LUGAR}`,
                },
              ]}
            />

            <FormatoCard
              icon="⚔️"
              title="Reta / Round Robin"
              delayMs={80}
              rows={[
                {
                  concepto: "Participar",
                  cuando: "Al finalizar reta",
                  puntos: `+${R.PARTICIPACION}`,
                  tone: "base",
                },
                {
                  concepto: "1.º en parejas",
                  cuando: "Al finalizar reta",
                  puntos: `+${R.VICTORIA}`,
                  tone: "win",
                },
              ]}
              footer={[
                { label: "Solo jugar", value: `${R.PARTICIPACION}` },
                { label: "Si ganas (1.º)", value: `${R.PARTICIPACION + R.VICTORIA}` },
              ]}
            />

            <FormatoCard
              icon="👥"
              title="Reta por equipos"
              delayMs={160}
              rows={[
                {
                  concepto: "Participar (cada jugador)",
                  cuando: "Al finalizar reta",
                  puntos: `+${RE.PARTICIPACION}`,
                  tone: "base",
                },
                {
                  concepto: "Equipo con más marcador",
                  cuando: "Al finalizar reta",
                  puntos: `+${RE.VICTORIA} c/u en equipo ganador`,
                  tone: "win",
                },
                {
                  concepto: "Equipo perdedor",
                  cuando: "Al finalizar reta",
                  puntos: "+0",
                  tone: "zero",
                },
              ]}
              footer={[
                { label: "Solo jugar", value: `${RE.PARTICIPACION}` },
                {
                  label: "Equipo ganador",
                  value: `${RE.PARTICIPACION + RE.VICTORIA}`,
                },
              ]}
            />

            <FormatoCard
              icon="🔄"
              title="Americano"
              delayMs={240}
              rows={[
                {
                  concepto: "Participar",
                  cuando: "Al finalizar sesión",
                  puntos: `+${A.PARTICIPACION}`,
                  tone: "base",
                },
                {
                  concepto: "Por victoria (PG)",
                  cuando: "Al finalizar sesión",
                  puntos: `+${A.POR_VICTORIA} c/u`,
                  tone: "win",
                },
                {
                  concepto: "Podio 1.º",
                  cuando: "Al finalizar sesión",
                  puntos: `+${A.PRIMER_LUGAR}`,
                  tone: "gold",
                },
                {
                  concepto: "Podio 2.º",
                  cuando: "Al finalizar sesión",
                  puntos: `+${A.SEGUNDO_LUGAR}`,
                  tone: "silver",
                },
                {
                  concepto: "Podio 3.º",
                  cuando: "Al finalizar sesión",
                  puntos: `+${A.TERCER_LUGAR}`,
                  tone: "bronze",
                },
              ]}
              footer={[
                { label: "Solo jugar", value: `${A.PARTICIPACION}` },
                {
                  label: "Ej. campeón 6 vict.",
                  value: `${A.PARTICIPACION + 6 * A.POR_VICTORIA + A.PRIMER_LUGAR}`,
                },
              ]}
            />

            <FormatoCard
              icon="⚡"
              title="Torneo Express"
              delayMs={320}
              rows={[
                {
                  concepto: "Participar (base)",
                  cuando: "Al cerrar torneo",
                  puntos: `+${E.PARTICIPACION}`,
                  tone: "base",
                },
                {
                  concepto: "Pasar fase de grupos",
                  cuando: "Clasificar (cuartos o semis directas)",
                  puntos: `+${E.PASAR_FASE_GRUPOS}`,
                  tone: "win",
                },
                {
                  concepto: "No pasa fase de grupos",
                  cuando: "Al cerrar torneo",
                  puntos: "+0",
                  tone: "zero",
                },
                {
                  concepto: "Pasar a semifinales",
                  cuando: "Al jugar semifinal",
                  puntos: `+${E.PASAR_SEMIFINAL}`,
                  tone: "win",
                },
                {
                  concepto: "Llegar a la final",
                  cuando: "Campeón o finalista",
                  puntos: `+${E.LLEGAR_FINAL}`,
                  tone: "win",
                },
                {
                  concepto: "Podio campeón",
                  cuando: "Al cerrar torneo",
                  puntos: `+${E.PRIMER_LUGAR}`,
                  tone: "gold",
                },
                {
                  concepto: "Podio finalista",
                  cuando: "Al cerrar torneo",
                  puntos: `+${E.SEGUNDO_LUGAR}`,
                  tone: "silver",
                },
                {
                  concepto: "Podio 3.º–4.º",
                  cuando: "Al cerrar torneo",
                  puntos: `+${E.TERCER_LUGAR}`,
                  tone: "bronze",
                },
              ]}
              footer={[
                { label: "Solo jugar", value: `${E.PARTICIPACION}` },
                {
                  label: "Clasifica, pierde en cuartos",
                  value: `${expressCuartos}`,
                },
                { label: "Campeón (total)", value: `${expressCampeon}` },
                { label: "Finalista (total)", value: `${expressFinalista}` },
                { label: "3.º–4.º (total)", value: `${expressSemiPodio}` },
              ]}
            />
          </div>
        </section>

        <section className="rkcf-cta rkcf-reveal">
          <a href={rankingHref} className="rkcf-cta__btn">
            Ver el ranking
          </a>
          <p className="rkcf-cta__note">
            Los puntos se actualizan automáticamente al cerrar cada evento.
          </p>
        </section>

        <footer className="rkcf-foot">Riviera Open · Vive el pádel diferente</footer>
      </div>
    </JugadoresPublicShell>
  );
};
