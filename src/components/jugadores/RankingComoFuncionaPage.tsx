import React from "react";
import {
  calcularPuntosEvento,
  PUNTOS_AMERICANO,
  PUNTOS_EXPRESS,
  PUNTOS_LIGA,
  PUNTOS_RETA,
  PUNTOS_RETA_EQUIPOS,
} from "../../lib/rivieraJugadores/rivieraRankingPoints";
import { buildPublicRankingUrl } from "./jugadoresPublicNav";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import "./ranking-como-funciona.css";

type PuntosTone = "base" | "win" | "gold" | "silver" | "bronze" | "zero" | "default";

interface PuntosRow {
  concepto: string;
  puntos: string;
  tone?: PuntosTone;
}

interface FormatoCardProps {
  icon: string;
  title: string;
  subtitle?: string;
  star?: boolean;
  rows: PuntosRow[];
  footer: { label: string; value: string }[];
  delayMs: number;
}

const L = PUNTOS_LIGA;
const R = PUNTOS_RETA;
const RE = PUNTOS_RETA_EQUIPOS;
const A = PUNTOS_AMERICANO;
const E = PUNTOS_EXPRESS;

const FOOTER_LIGA = {
  solo: L.BASE_INSCRIPCION,
  campeonSinJornadas: L.BASE_INSCRIPCION + L.PRIMER_LUGAR,
  max10: L.BASE_INSCRIPCION + 10 * L.GANAR_JORNADA + L.PRIMER_LUGAR,
};

const expressCampeon = calcularPuntosEvento({
  formato: "express",
  posicion_final: 1,
});

function PuntosValue({ text, tone = "default" }: { text: string; tone?: PuntosTone }) {
  return <span className={`rkcf-pts rkcf-pts--${tone}`}>{text}</span>;
}

function FormatoCard({
  icon,
  title,
  subtitle,
  star,
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
      <table className="rkcf-table">
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Puntos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.concepto}>
              <td>{row.concepto}</td>
              <td>
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
  const rankingHref = buildPublicRankingUrl();

  return (
    <JugadoresPublicShell variant="ranking">
      <div className="rkcf">
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
            Cada modalidad suma a tu perfil público cuando el organizador cierra el
            evento.
          </p>

          <div className="rkcf-formats__grid">
            <FormatoCard
              icon="🏆"
              title="Liga Riviera Open"
              subtitle="Formato estrella"
              star
              delayMs={0}
              rows={[
                {
                  concepto: "Inscribirse (base, una vez por temporada)",
                  puntos: `+${L.BASE_INSCRIPCION}`,
                  tone: "base",
                },
                {
                  concepto: "Ganar una jornada",
                  puntos: `+${L.GANAR_JORNADA} c/u`,
                  tone: "win",
                },
                {
                  concepto: "1er lugar final",
                  puntos: `+${L.PRIMER_LUGAR}`,
                  tone: "gold",
                },
                {
                  concepto: "2do lugar final",
                  puntos: `+${L.SEGUNDO_LUGAR}`,
                  tone: "silver",
                },
                {
                  concepto: "3er lugar final",
                  puntos: `+${L.TERCER_LUGAR}`,
                  tone: "bronze",
                },
                {
                  concepto: "4to en adelante",
                  puntos: "+0",
                  tone: "zero",
                },
              ]}
              footer={[
                { label: "Solo participar", value: `${FOOTER_LIGA.solo}` },
                {
                  label: "Campeón sin jornadas",
                  value: `${FOOTER_LIGA.campeonSinJornadas}`,
                },
                { label: "Máx. 10 jornadas", value: `${FOOTER_LIGA.max10}+` },
              ]}
            />

            <FormatoCard
              icon="⚔️"
              title="Reta individual"
              delayMs={80}
              rows={[
                { concepto: "Participar (base)", puntos: `+${R.PARTICIPACION}`, tone: "base" },
                { concepto: "Ganar", puntos: `+${R.VICTORIA}`, tone: "win" },
                { concepto: "Perder", puntos: "+0", tone: "zero" },
              ]}
              footer={[
                { label: "Solo jugar", value: `${R.PARTICIPACION}` },
                { label: "Si ganas", value: `${R.PARTICIPACION + R.VICTORIA}` },
              ]}
            />

            <FormatoCard
              icon="👥"
              title="Reta por equipos"
              delayMs={160}
              rows={[
                {
                  concepto: "Participar — cada jugador",
                  puntos: `+${RE.PARTICIPACION}`,
                  tone: "base",
                },
                {
                  concepto: "Equipo ganador — cada jugador",
                  puntos: `+${RE.VICTORIA}`,
                  tone: "win",
                },
                { concepto: "Equipo perdedor", puntos: "+0", tone: "zero" },
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
                  concepto: "Participar (base)",
                  puntos: `+${A.PARTICIPACION}`,
                  tone: "base",
                },
                {
                  concepto: "Por cada victoria",
                  puntos: `+${A.POR_VICTORIA} c/u`,
                  tone: "win",
                },
                { concepto: "1er lugar", puntos: `+${A.PRIMER_LUGAR}`, tone: "gold" },
                { concepto: "2do lugar", puntos: `+${A.SEGUNDO_LUGAR}`, tone: "silver" },
                { concepto: "3er lugar", puntos: `+${A.TERCER_LUGAR}`, tone: "bronze" },
              ]}
              footer={[
                { label: "Solo jugar", value: `${A.PARTICIPACION}` },
                {
                  label: "Campeón (6 vict.)",
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
                  puntos: `+${E.PARTICIPACION}`,
                  tone: "base",
                },
                {
                  concepto: "Llegar a semifinal",
                  puntos: `+${E.LLEGAR_SEMI}`,
                  tone: "win",
                },
                { concepto: "Campeón", puntos: `+${E.PRIMER_LUGAR}`, tone: "gold" },
                {
                  concepto: "Finalista",
                  puntos: `+${E.SEGUNDO_LUGAR}`,
                  tone: "silver",
                },
                {
                  concepto: "3er–4to lugar",
                  puntos: `+${E.TERCER_LUGAR}`,
                  tone: "bronze",
                },
                {
                  concepto: "Eliminado antes de semi",
                  puntos: "+0",
                  tone: "zero",
                },
              ]}
              footer={[
                { label: "Solo jugar", value: `${E.PARTICIPACION}` },
                { label: "Campeón (total)", value: `${expressCampeon}` },
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
