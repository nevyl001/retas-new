import React, { useCallback, useEffect, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import { MANO_DOMINANTE_LABELS } from "../../lib/rivieraJugadores/constants";
import {
  getRivieraJugadorPublicBySlug,
  listParticipaciones,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import { getRedesPublicas } from "../../lib/rivieraJugadores/jugadorRedes";
import { resolvePublicOrganizadorId } from "../../lib/rivieraJugadores/publicOrganizador";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import { JugadorAvatarHero } from "./JugadorAvatarHero";
import { JugadorCategoriaBadge } from "./JugadorCategoriaBadge";
import { JugadorHistorialList } from "./JugadorHistorialList";
import { JugadorRedesPublicas } from "./JugadorRedesPublicas";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import { buildPublicRankingUrl, navigatePublicJugadores } from "./jugadoresPublicNav";

interface JugadorPublicFichaProps {
  slug: string;
}

export const JugadorPublicFicha: React.FC<JugadorPublicFichaProps> = ({ slug }) => {
  const { user } = useUser();
  const orgId = resolvePublicOrganizadorId(user?.id);
  const [jugador, setJugador] = useState<RivieraJugadorWithStats | null>(null);
  const [historial, setHistorial] = useState<
    Awaited<ReturnType<typeof listParticipaciones>>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await getRivieraJugadorPublicBySlug(slug, orgId ?? undefined);
      setJugador(j);
      if (j) {
        const h = await listParticipaciones(j.id, 100);
        setHistorial(h);
      }
    } finally {
      setLoading(false);
    }
  }, [slug, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <JugadoresPublicShell>
        <p className="rjp-empty">Cargando perfil…</p>
      </JugadoresPublicShell>
    );
  }

  if (!jugador) {
    return (
      <JugadoresPublicShell>
        <button
          type="button"
          className="rjp-back"
          onClick={() => navigatePublicJugadores(buildPublicRankingUrl(orgId))}
        >
          ← Ranking
        </button>
        <p className="rjp-empty">Jugador no encontrado o no está visible al público.</p>
      </JugadoresPublicShell>
    );
  }

  const puntos = jugador.stats?.puntos_totales ?? 0;
  const redes = getRedesPublicas(jugador);

  return (
    <JugadoresPublicShell>
      <button
        type="button"
        className="rjp-back"
        onClick={() => navigatePublicJugadores(buildPublicRankingUrl(orgId))}
      >
        ← Ranking
      </button>

      <section className="rjp-profile-card rjp-profile-card--hero">
        <div className="rjp-profile-card__shine" aria-hidden />
        <div className="rjp-profile-card__layout">
          <JugadorAvatarHero fotoUrl={jugador.foto_url} nombre={jugador.nombre} />
          <div className="rjp-profile-card__main">
            <p className="rjp-profile-card__eyebrow">Riviera Open · Jugador</p>
            <div className="rjp-profile-card__title">
              <h1>{jugador.nombre}</h1>
              <JugadorCategoriaBadge categoria={jugador.categoria} />
            </div>
            <div className="rjp-profile-stats">
              <div className="rjp-stat-tile">
                <span className="rjp-stat-tile__icon" aria-hidden>
                  #
                </span>
                <div>
                  <span className="rjp-profile-stats__lbl">Ranking</span>
                  <span className="rjp-profile-stats__val">—</span>
                </div>
              </div>
              <div className="rjp-stat-tile">
                <span className="rjp-stat-tile__icon" aria-hidden>
                  ★
                </span>
                <div>
                  <span className="rjp-profile-stats__lbl">Puntos totales</span>
                  <span className="rjp-profile-stats__val">
                    {puntos.toLocaleString("es-MX")}
                  </span>
                </div>
              </div>
            </div>
            {(jugador.edad != null || jugador.mano_dominante) && (
              <div className="rjp-profile-meta">
                {jugador.edad != null && (
                  <span className="rjp-profile-meta__chip">
                    {jugador.edad} años
                  </span>
                )}
                {jugador.mano_dominante && (
                  <span className="rjp-profile-meta__chip">
                    {MANO_DOMINANTE_LABELS[jugador.mano_dominante]}
                  </span>
                )}
              </div>
            )}
          </div>
          <JugadorRedesPublicas redes={redes} />
        </div>
      </section>

      <section className="rjp-card-block rjp-card-block--historial">
        <div className="rjp-card-block__head">
          <span className="rjp-card-block__icon" aria-hidden>
            🏆
          </span>
          <h2>Historial completo</h2>
        </div>
        <p className="rjp-muted rjp-historial-intro">
          Retas, Round Robin, Torneos, Liga, Pádel Americano y más.
        </p>
        <JugadorHistorialList
          participaciones={historial}
          variant="public"
          showResumen
        />
      </section>

      <footer className="rjp-public__footer">Riviera Open · Padel Club</footer>
    </JugadoresPublicShell>
  );
};
