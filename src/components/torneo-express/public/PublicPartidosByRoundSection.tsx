import React, { useMemo } from "react";
import { dedupePartidosExpress } from "../../../lib/torneoExpress/roundRobin";
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
}> = ({ partidos, parejas, title = "Partidos" }) => {
  const sorted = useMemo(
    () => dedupePartidosExpress(partidos),
    [partidos]
  );

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

      <div className="te-pub-matches-grid">
        {sorted.map((partido, index) => (
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
    </section>
  );
};
