import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  JUGADOR_CATEGORIA_AVATAR_BADGE,
  JUGADOR_CATEGORIA_LABELS,
} from "../../lib/rivieraJugadores/constants";
import { getJugadorPerfilMeta } from "../../lib/rivieraJugadores/jugadorPerfilDisplay";
import {
  computePublicProfileStats,
  filterParticipacionesHistorialVisible,
  participacionToHistorialItem,
} from "../../lib/rivieraJugadores/historialDisplay";
import {
  getRankingPosicionEnCategoria,
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
  const [rankingPos, setRankingPos] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await getRivieraJugadorPublicBySlug(slug, orgId ?? undefined);
      setJugador(j);
      if (j) {
        const [h, pos] = await Promise.all([
          listParticipaciones(j.id, 100),
          orgId
            ? getRankingPosicionEnCategoria(orgId, j.id, j.categoria)
            : Promise.resolve(null),
        ]);
        setHistorial(h);
        setRankingPos(pos);
      } else {
        setRankingPos(null);
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
      filterParticipacionesHistorialVisible(historial)
        .map((row) =>
          participacionToHistorialItem(row, {
            categoriaFallback: jugador?.categoria,
          })
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [historial, jugador?.categoria]
  );

  const profileStats = useMemo(() => {
    const fromHist = computePublicProfileStats(historial);
    const teStats = jugador?.stats?.total_torneos_express ?? 0;
    return {
      ...fromHist,
      torneosExpress: Math.max(fromHist.torneosExpress, teStats),
      retas: Math.max(fromHist.retas, jugador?.stats?.total_retas ?? 0),
    };
  }, [historial, jugador?.stats?.total_torneos_express, jugador?.stats?.total_retas]);

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
  const rankingVal = rankingPos != null ? `#${rankingPos}` : "—";
  const perfilMeta = getJugadorPerfilMeta(jugador);
  const hasPhoto = Boolean(jugador.foto_url?.trim());
  const catBadge = JUGADOR_CATEGORIA_AVATAR_BADGE[jugador.categoria];

  const metaIcon = (label: string) => {
    if (label === "Edad") return "user";
    if (label === "Mano dominante") return "hand-finger";
    return "arrows-left-right";
  };

  return (
    <JugadoresPublicShell variant="ficha">
      <div className="rjp-ficha">
        <FichaTopbar rankingUrl={rankingUrl} />

        <div className="rjp-ficha__layout">
          <div className="rjp-ficha__col rjp-ficha__col--profile">
            <section
              className={`rjp-ficha-card rjp-ficha-hero${
                hasPhoto ? " rjp-ficha-hero--photo" : ""
              }`}
            >
              {hasPhoto && jugador.foto_url && (
                <img
                  className="rjp-ficha-hero__photo"
                  src={jugador.foto_url}
                  alt=""
                  decoding="async"
                  fetchPriority="high"
                />
              )}
              <div className="rjp-ficha-hero__dim" aria-hidden />
              <div className="rjp-ficha-hero__veil" aria-hidden />
              <div className="rjp-ficha-hero__gold-line" aria-hidden />

              <div className="rjp-ficha-hero__content">
                <div className="rjp-ficha-hero__top">
                  <p className="rjp-ficha-hero__brand">Riviera Open · Jugador</p>
                  {hasPhoto ? (
                    <span className="rjp-ficha-hero__cat-badge">{catBadge}</span>
                  ) : null}
                </div>

                {!hasPhoto && (
                  <JugadorAvatarHero
                    fotoUrl={null}
                    nombre={jugador.nombre}
                    categoria={jugador.categoria}
                  />
                )}

                <div
                  className={
                    hasPhoto
                      ? "rjp-ficha-hero__panel rjp-ficha-hero__panel--photo"
                      : "rjp-ficha-hero__panel"
                  }
                >
                  <div className="rjp-ficha-hero__main">
                    <h1 className="rjp-ficha-hero__name">{jugador.nombre}</h1>

                    <div className="rjp-ficha-hero__pills">
                      <span className="rjp-ficha-pill rjp-ficha-pill--open">
                        <TablerIcon name="trophy" size={14} />
                        {JUGADOR_CATEGORIA_LABELS[jugador.categoria]}
                      </span>
                      {perfilMeta.map((item) => (
                        <span
                          key={item.label}
                          className="rjp-ficha-pill rjp-ficha-pill--muted rjp-ficha-pill--labeled"
                        >
                          <TablerIcon name={metaIcon(item.label)} size={14} />
                          <span className="rjp-ficha-pill__text">
                            <span className="rjp-ficha-pill__lbl">
                              {item.label}
                            </span>
                            <span className="rjp-ficha-pill__val">
                              {item.value}
                            </span>
                          </span>
                        </span>
                      ))}
                    </div>

                    <div className="rjp-ficha-hero__stats">
                      <div className="rjp-ficha-stat">
                        <TablerIcon
                          name="hash"
                          size={14}
                          className="rjp-ficha-stat__icon"
                        />
                        <span className="rjp-ficha-stat__lbl">Ranking</span>
                        <span
                          className={`rjp-ficha-stat__val${
                            rankingPos == null ? " rjp-ficha-stat__val--empty" : ""
                          }`}
                        >
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
                  categoriaFallback={jugador.categoria}
                  variant="public"
                  showResumen={false}
                />
              </div>
            </section>
          </div>

          <JugadorPublicFichaAside
            retas={profileStats.retas}
            torneosExpress={profileStats.torneosExpress}
            victorias={profileStats.victorias}
            winRate={profileStats.winRate}
            recent={recentActivity}
          />
        </div>

        <footer className="rjp-ficha-footer">
          Riviera Open · Vive el pádel diferente
        </footer>
      </div>
    </JugadoresPublicShell>
  );
};
