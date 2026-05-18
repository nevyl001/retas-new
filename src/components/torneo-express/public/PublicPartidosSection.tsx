import React, { useMemo } from "react";
import { formatCanchaDisplay } from "../../../lib/torneoExpress/canchaDisplay";
import { sortPartidosByOrden } from "../../../lib/torneoExpress/roundRobin";
import type {
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../../lib/torneoExpress/types";
import { useCountUp } from "./useCountUp";

function PublicMatchStatus({
  estado,
  enVivo,
}: {
  estado: TorneoExpressPartido["estado"];
  enVivo: boolean;
}) {
  if (estado === "jugado") {
    return (
      <span className="te-pub-status te-pub-status--played">
        <span aria-hidden>✓</span> Jugado
      </span>
    );
  }
  if (enVivo) {
    return (
      <span className="te-pub-status te-pub-status--live">
        <span className="te-pub-status__dot" aria-hidden />
        En vivo
      </span>
    );
  }
  return <span className="te-pub-status te-pub-status--pending">Pendiente</span>;
}

function AnimatedScore({
  value,
  highlight,
  animate,
}: {
  value: number;
  highlight: boolean;
  animate: boolean;
}) {
  const displayed = useCountUp(value, { enabled: animate });
  return (
    <span
      className={`te-pub-score__num${highlight ? " te-pub-score__num--win" : ""}`}
    >
      {displayed}
    </span>
  );
}

function PublicMatchCard({
  partido,
  localLabel,
  visitLabel,
  enVivo,
  index,
}: {
  partido: TorneoExpressPartido;
  localLabel: string;
  visitLabel: string;
  enVivo: boolean;
  index: number;
}) {
  const played = partido.estado === "jugado";
  const pl = partido.puntos_local ?? 0;
  const pv = partido.puntos_visitante ?? 0;
  const localWins = played && pl > pv;
  const visitWins = played && pv > pl;

  return (
    <article
      className="te-pub-match te-pub-fade-in-up"
      style={{ animationDelay: `${0.12 + index * 0.07}s` }}
    >
      <div className="te-pub-match__top">
        <PublicMatchStatus estado={partido.estado} enVivo={enVivo} />
        <span className="te-pub-cancha" title="Cancha">
          <span className="te-pub-cancha__icon" aria-hidden>
            🎾
          </span>
          {formatCanchaDisplay(partido.cancha)}
        </span>
      </div>

      <div className="te-pub-match__score-block">
        {played ? (
          <div className="te-pub-score">
            <AnimatedScore value={pl} highlight={localWins} animate={played} />
            <span className="te-pub-score__sep">—</span>
            <AnimatedScore value={pv} highlight={visitWins} animate={played} />
          </div>
        ) : (
          <span className="te-pub-score te-pub-score--pending">—</span>
        )}
      </div>

      <div className="te-pub-match__teams">
        <span
          className={`te-pub-match__team${localWins ? " te-pub-match__team--win" : ""}`}
        >
          {localLabel}
        </span>
        <span className="te-pub-match__vs">vs</span>
        <span
          className={`te-pub-match__team${visitWins ? " te-pub-match__team--win" : ""}`}
        >
          {visitLabel}
        </span>
      </div>
    </article>
  );
}

export const PublicPartidosSection: React.FC<{
  partidos: TorneoExpressPartido[];
  parejas: TorneoExpressGrupoPareja[];
  title?: string;
}> = ({ partidos, parejas, title = "Partidos" }) => {
  const sorted = useMemo(() => sortPartidosByOrden(partidos), [partidos]);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    parejas.forEach((p) =>
      m.set(p.pareja_id, p.pareja_display ?? p.pareja_id)
    );
    return m;
  }, [parejas]);

  const enVivoId = useMemo(() => {
    const first = sorted.find((p) => p.estado === "pendiente");
    return first?.id ?? null;
  }, [sorted]);

  if (sorted.length === 0) {
    return (
      <section className="te-public-section te-pub-fade-in te-pub-fade-in--delay-2">
        <h2 className="te-public-section__title">{title}</h2>
        <p className="te-public-empty">Sin partidos programados.</p>
      </section>
    );
  }

  return (
    <section className="te-public-section te-pub-fade-in te-pub-fade-in--delay-2">
      <h2 className="te-public-section__title">{title}</h2>
      <div className="te-public-section__divider" aria-hidden />
      <div className="te-pub-matches">
        {sorted.map((partido, index) => (
          <PublicMatchCard
            key={partido.id}
            partido={partido}
            localLabel={labelById.get(partido.pareja_local_id) ?? "Local"}
            visitLabel={
              labelById.get(partido.pareja_visitante_id) ?? "Visitante"
            }
            enVivo={partido.id === enVivoId}
            index={index}
          />
        ))}
      </div>
    </section>
  );
};
