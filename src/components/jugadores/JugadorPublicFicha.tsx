import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  JUGADOR_CATEGORIA_LABELS,
  MANO_DOMINANTE_LABELS,
} from "../../lib/rivieraJugadores/constants";
import {
  computePublicProfileStats,
  participacionToHistorialItem,
} from "../../lib/rivieraJugadores/historialDisplay";
import {
  getRivieraJugadorPublicBySlug,
  listParticipaciones,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import { getRedesPublicas } from "../../lib/rivieraJugadores/jugadorRedes";
import { resolvePublicOrganizadorId } from "../../lib/rivieraJugadores/publicOrganizador";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import { TablerIcon } from "../ui/TablerIcon";
import { JugadorAvatarHero } from "./JugadorAvatarHero";
import { JugadorHistorialList } from "./JugadorHistorialList";
import { JugadorPublicFichaAside } from "./JugadorPublicFichaAside";
import { JugadorRedesPublicas } from "./JugadorRedesPublicas";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import { buildPublicRankingUrl, navigatePublicJugadores } from "./jugadoresPublicNav";
import "./riviera-jugadores-public-ficha.css";

interface JugadorPublicFichaProps {
  slug: string;
}

function FichaTopbar({ rankingUrl }: { rankingUrl: string }) {
  return (
    <nav className="rjp-ficha-topbar">
      <button
        type="button"
        className="rjp-ficha-topbar__back"
        onClick={() => navigatePublicJugadores(rankingUrl)}
      >
        <TablerIcon name="arrow-left" size={16} />
        Ranking
      </button>
    </nav>
  );
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

  const rankingUrl = buildPublicRankingUrl(orgId);

  const historialItems = useMemo(
    () =>
      [...historial]
        .map(participacionToHistorialItem)
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [historial]
  );

  const profileStats = useMemo(
    () => computePublicProfileStats(historial),
    [historial]
  );

  const recentActivity = useMemo(() => historialItems.slice(0, 3), [historialItems]);

  if (loading) {
    return (
      <JugadoresPublicShell variant="ficha">
        <p className="rjp-ficha-empty">Cargando perfil…</p>
      </JugadoresPublicShell>
    );
  }

  if (!jugador) {
    return (
      <JugadoresPublicShell variant="ficha">
        <FichaTopbar rankingUrl={rankingUrl} />
        <p className="rjp-ficha-empty">
          Jugador no encontrado o no está visible al público.
        </p>
      </JugadoresPublicShell>
    );
  }

  const puntos = jugador.stats?.puntos_totales ?? 0;
  const redes = getRedesPublicas(jugador);
  const rankingVal = "—";

  return (
    <JugadoresPublicShell variant="ficha">
      <div className="rjp-ficha">
        <FichaTopbar rankingUrl={rankingUrl} />

        <div className="rjp-ficha__layout">
          <div className="rjp-ficha__col rjp-ficha__col--profile">
            <section className="rjp-ficha-card rjp-ficha-hero">
              <div className="rjp-ficha-hero__banner" aria-hidden>
                <p className="rjp-ficha-hero__brand">Riviera Open · Jugador</p>
              </div>

              <div className="rjp-ficha-hero__body">
                <JugadorAvatarHero
                  fotoUrl={jugador.foto_url}
                  nombre={jugador.nombre}
                  categoria={jugador.categoria}
                />

                <div className="rjp-ficha-hero__main">
                  <h1 className="rjp-ficha-hero__name">{jugador.nombre}</h1>

                  <div className="rjp-ficha-hero__pills">
                    <span className="rjp-ficha-pill rjp-ficha-pill--open">
                      <TablerIcon name="trophy" size={14} />
                      {JUGADOR_CATEGORIA_LABELS[jugador.categoria]}
                    </span>
                    {jugador.edad != null && (
                      <span className="rjp-ficha-pill rjp-ficha-pill--muted">
                        <TablerIcon name="user" size={14} />
                        {jugador.edad} años
                      </span>
                    )}
                    {jugador.mano_dominante && (
                      <span className="rjp-ficha-pill rjp-ficha-pill--muted">
                        <TablerIcon name="hand-finger" size={14} />
                        {MANO_DOMINANTE_LABELS[jugador.mano_dominante]}
                      </span>
                    )}
                  </div>

                  <div className="rjp-ficha-hero__stats">
                    <div className="rjp-ficha-stat">
                      <TablerIcon
                        name="hash"
                        size={14}
                        className="rjp-ficha-stat__icon"
                      />
                      <span className="rjp-ficha-stat__lbl">Ranking</span>
                      <span className="rjp-ficha-stat__val rjp-ficha-stat__val--empty">
                        {rankingVal}
                      </span>
                    </div>
                    <div className="rjp-ficha-stat">
                      <TablerIcon
                        name="star"
                        size={14}
                        className="rjp-ficha-stat__icon"
                      />
                      <span className="rjp-ficha-stat__lbl">Puntos totales</span>
                      <span className="rjp-ficha-stat__val">
                        {puntos.toLocaleString("es-MX")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <JugadorRedesPublicas redes={redes} />
          </div>

          <div className="rjp-ficha__col rjp-ficha__col--historial">
            <section className="rjp-ficha-card rjp-ficha-historial">
              <header className="rjp-ficha-historial__head">
                <span className="rjp-ficha-historial__chip" aria-hidden>
                  <TablerIcon name="trophy" size={16} />
                </span>
                <div>
                  <h2 className="rjp-ficha-historial__title">Historial completo</h2>
                  <p className="rjp-ficha-historial__sub">
                    Retas, Round Robin, Torneos, Liga, Pádel Americano y más.
                  </p>
                </div>
              </header>
              <div className="rjp-ficha-historial__body">
                <JugadorHistorialList
                  participaciones={historial}
                  variant="public"
                  showResumen={false}
                />
              </div>
            </section>
          </div>

          <JugadorPublicFichaAside
            torneos={profileStats.torneos}
            victorias={profileStats.victorias}
            winRate={profileStats.winRate}
            recent={recentActivity}
          />
        </div>

        <footer className="rjp-ficha-footer">Riviera Open · Padel Club</footer>
      </div>
    </JugadoresPublicShell>
  );
};
