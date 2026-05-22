import React, { useMemo } from "react";
import { sortPartidosByOrden } from "../../../lib/torneoExpress/roundRobin";
import type {
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../../lib/torneoExpress/types";
import { TePublicMatchCard } from "./TePublicMatchCard";
import "../../public/riviera-public-americano.css";

export const PublicPartidosByRoundSection: React.FC<{
  partidos: TorneoExpressPartido[];
  parejas: TorneoExpressGrupoPareja[];
  grupoLabel?: string;
  title?: string;
}> = ({ partidos, parejas, grupoLabel, title = "Partidos por ronda" }) => {
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

  const byRound = useMemo(() => {
    const map = new Map<number, TorneoExpressPartido[]>();
    sorted.forEach((p) => {
      const r = p.ronda ?? 1;
      const list = map.get(r) ?? [];
      list.push(p);
      map.set(r, list);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
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

      {byRound.map(([ronda, roundPartidos], roundIdx) => {
        const roundHasLive = roundPartidos.some(
          (p) => p.estado === "pendiente" && p.id === enVivoId
        );
        const roundInProgress = roundPartidos.some(
          (p) => p.estado === "pendiente"
        );

        return (
          <div
            key={ronda}
            className="te-public-round-block"
            style={{ animationDelay: `${0.05 + roundIdx * 0.06}s` }}
          >
            <div className="te-public-round-head">
              <h3 className="te-public-round-head__title">
                <span className="te-public-round-head__num">Ronda {ronda}</span>
                {grupoLabel ? (
                  <>
                    <span className="te-public-round-head__sep">·</span>
                    <span className="te-public-round-head__phase">
                      {grupoLabel}
                    </span>
                  </>
                ) : null}
                {roundInProgress && roundHasLive && (
                  <span className="te-public-round-head__live">
                    <span className="te-pub-status__dot" aria-hidden />
                    en curso
                  </span>
                )}
              </h3>
            </div>

            <div className="te-pub-matches-grid">
              {roundPartidos.map((partido, index) => (
                <TePublicMatchCard
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
          </div>
        );
      })}
    </section>
  );
};
