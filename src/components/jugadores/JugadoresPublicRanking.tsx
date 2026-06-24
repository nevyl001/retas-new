import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIA_SHORT_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../../lib/rivieraJugadores/constants";
import { RIVIERA_RANKING_PUBLIC_POLL_INTERVAL_MS } from "../../lib/rivieraJugadores/publicPoll";
import { listOfficialSiteJugadoresRanking, listPublicJugadoresRanking } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import { isOrganizadorRankingPublico } from "../../lib/admin/accountControls";
import { subscribeRivieraRanking } from "../../lib/rivieraJugadores/subscribeRivieraRanking";
import { rankingPosicionesFromSorted } from "../../lib/rivieraJugadores/rankingPosition";
import { navigateAppTo } from "../../lib/appRouting";
import {
  getPublicOrganizadorIdFromPath,
  getPublicOrganizadorIdFromSearch,
  getPublicOrganizadorIdWithoutUser,
} from "../../lib/rivieraJugadores/publicOrganizador";
import type {
  RivieraJugadorCategoria,
  RivieraJugadorWithStats,
} from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
  RIVIERA_GENERO_RANKING_TITLE,
  RIVIERA_GENERO_REGISTRY_TITLE,
} from "../../lib/rivieraJugadores/genero";
import { TablerIcon } from "../ui/TablerIcon";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import {
  buildPublicRankingUrl,
  buildRankingComoFuncionaPath,
  navigateOfficialPlayerFicha,
  navigatePublicJugadorFicha,
} from "./jugadoresPublicNav";
import { JugadoresGeneroTabs } from "./JugadoresGeneroTabs";
import { RankingPodio } from "./RankingPodio";
import { RankingPuntosTeaser } from "./RankingPuntosTeaser";
import "./riviera-jugadores-public-ranking.css";

interface JugadoresPublicRankingProps {
  /** Org de la ruta `/ranking/o/{id}` (evita mezclar rankings entre perfiles). */
  organizadorId?: string;
  genero?: RivieraJugadorGenero;
}

export const JugadoresPublicRanking: React.FC<JugadoresPublicRankingProps> = ({
  organizadorId: routeOrganizadorId,
  genero = "M",
}) => {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [officialGlobal, setOfficialGlobal] = useState(false);
  const [orgReady, setOrgReady] = useState(false);
  const [categoria, setCategoria] = useState<RivieraJugadorCategoria>("open");
  const [jugadores, setJugadores] = useState<RivieraJugadorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teaserOpen, setTeaserOpen] = React.useState(false);

  const jugadoresFiltrados = jugadores;

  const rankingRanks = useMemo(
    () => rankingPosicionesFromSorted(jugadoresFiltrados),
    [jugadoresFiltrados]
  );

  useEffect(() => {
    try {
      sessionStorage.removeItem("riviera_public_organizador_id");
    } catch {
      /* ignore */
    }

    const queryOrg = getPublicOrganizadorIdFromSearch();
    const pathOrg = getPublicOrganizadorIdFromPath();
    if (queryOrg && !pathOrg && !routeOrganizadorId) {
      navigateAppTo(buildPublicRankingUrl(queryOrg, genero));
      return;
    }

    const fromUrl =
      routeOrganizadorId?.trim() ||
      getPublicOrganizadorIdWithoutUser() ||
      null;
    setOfficialGlobal(!fromUrl);
    setOrgId(fromUrl);
    setOrgReady(true);
  }, [routeOrganizadorId, genero]);

  const openPlayer = useCallback(
    (j: RivieraJugadorWithStats) => {
      if (officialGlobal) {
        navigateOfficialPlayerFicha(j.id);
        return;
      }
      navigatePublicJugadorFicha(j.slug, orgId ?? undefined);
    },
    [officialGlobal, orgId]
  );

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!orgReady) return;

    const silent = opts?.silent ?? false;

    if (!officialGlobal && !orgId) {
      setJugadores([]);
      setError(
        "No hay ranking público en esta ruta. El organizador puede compartir su enlace desde Registro Riviera Open."
      );
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      if (officialGlobal) {
        const rows = await listOfficialSiteJugadoresRanking(categoria, genero);
        setJugadores(rows);
        return;
      }

      const publicado = await isOrganizadorRankingPublico(orgId!);
      if (!publicado) {
        setJugadores([]);
        setError(
          "Este club aún no está publicado en el ranking oficial de Riviera Open."
        );
        return;
      }
      const rows = await listPublicJugadoresRanking(orgId!, categoria, genero);
      setJugadores(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el ranking");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [orgId, categoria, genero, orgReady, officialGlobal]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void loadRef.current();
  }, [load]);

  useEffect(() => {
    if (!orgId || officialGlobal) return;

    return subscribeRivieraRanking(orgId, () => {
      void loadRef.current({ silent: true });
    });
  }, [orgId, officialGlobal]);

  useEffect(() => {
    if (!orgReady) return;

    const id = window.setInterval(() => {
      void loadRef.current({ silent: true });
    }, RIVIERA_RANKING_PUBLIC_POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [orgReady, officialGlobal, orgId]);

  const personaLabel =
    genero === "F"
      ? jugadoresFiltrados.length === 1
        ? "jugadora"
        : "jugadoras"
      : jugadoresFiltrados.length === 1
        ? "jugador"
        : "jugadores";

  const metaLine = loading
    ? "Cargando ranking…"
    : `${jugadoresFiltrados.length} ${personaLabel} · ${JUGADOR_CATEGORIA_LABELS[categoria]}`;

  const listWide = jugadoresFiltrados.length > 8;

  return (
    <JugadoresPublicShell variant="ranking">
      <div className="rjp-ranking">
        <header className="rjp-ranking-header">
          <p className="rjp-ranking-header__brand">Riviera Open</p>
          <h1 className="rjp-ranking-header__title">
            {RIVIERA_GENERO_RANKING_TITLE[genero]}
          </h1>
          <p className="rjp-ranking-header__sub">
            Retas, ligas, americanos y torneos suman al ranking{" "}
            {genero === "F" ? "femenil" : "varonil"}. Sin puntos negativos.
          </p>
          <a className="rjp-ranking-header__cta" href={buildRankingComoFuncionaPath()}>
            Ver reglas completas
            <TablerIcon name="chevron-right" size={18} />
          </a>
        </header>

        <JugadoresGeneroTabs
          className="rjp-ranking-genero-tabs"
          genero={genero}
          onChange={(g) =>
            navigateAppTo(
              officialGlobal
                ? g === "F"
                  ? "/ranking/femenil"
                  : "/ranking"
                : buildPublicRankingUrl(orgId, g)
            )
          }
        />

        <button
          type="button"
          className="rjp-ranking-teaser-toggle"
          onClick={() => setTeaserOpen((v) => !v)}
          aria-expanded={teaserOpen}
        >
          <span className="rjp-ranking-teaser-toggle__pills">
            Liga <strong>600</strong> · Torneo <strong>600</strong> · Americano{" "}
            <strong>140</strong> · Reta <strong>100</strong>
          </span>
          <span
            className="rjp-ranking-teaser-toggle__chevron"
            data-open={teaserOpen}
            aria-hidden
          >
            ›
          </span>
        </button>
        <div
          className={`rjp-ranking-teaser-body${
            teaserOpen ? " rjp-ranking-teaser-body--open" : ""
          }`}
        >
          <RankingPuntosTeaser />
        </div>

        <section className="rjp-ranking-panel" aria-label="Ranking por categoría">
          <div className="rjp-ranking-panel__picker">
            <p className="rjp-ranking-panel__label">
              <TablerIcon name="layout-grid" size={14} />
              Categoría
            </p>
            <div className="rjp-cat-grid" role="tablist" aria-label="Categorías">
              {JUGADOR_CATEGORIAS_ORDER.map((cat) => {
                const active = categoria === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`rjp-cat-chip${active ? " rjp-cat-chip--active" : ""}${
                      cat === "open" ? " rjp-cat-chip--open" : ""
                    }`}
                    onClick={() => setCategoria(cat)}
                  >
                    {cat === "open" && (
                      <TablerIcon name="trophy" size={12} className="rjp-cat-chip__icon" />
                    )}
                    <span className="rjp-cat-chip__short">
                      {JUGADOR_CATEGORIA_SHORT_LABELS[cat]}
                    </span>
                    <span className="rjp-cat-chip__full">
                      {JUGADOR_CATEGORIA_LABELS[cat]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rjp-ranking-panel__body">
            <p className="rjp-ranking-panel__meta">{metaLine}</p>

            {error && <p className="rjp-ranking-empty">{error}</p>}
            {!error && !loading && jugadoresFiltrados.length === 0 && (
              <p className="rjp-ranking-empty">
                Aún no hay {RIVIERA_GENERO_REGISTRY_TITLE[genero]} en esta
                categoría. Si cambiaste la categoría de alguien, búscalo en la
                pestaña de su nueva categoría.
              </p>
            )}

            {!error && jugadoresFiltrados.length > 0 && (
              <>
                <RankingPodio
                  jugadores={jugadoresFiltrados.slice(0, 3)}
                  ranks={rankingRanks.slice(0, 3)}
                  onSelect={(slug) => {
                    const j = jugadoresFiltrados.find((row) => row.slug === slug);
                    if (j) openPlayer(j);
                  }}
                />

                <ul
                  className={`rjp-ranking-list${
                    listWide ? " rjp-ranking-list--wide" : ""
                  }${loading ? " is-loading" : ""}`}
                >
                  {jugadoresFiltrados.slice(3).map((j, idx) => {
                    const pos = rankingRanks[idx + 3] ?? idx + 4;
                    return (
                      <li key={j.id}>
                        <button
                          type="button"
                          className="rjp-ranking-card"
                          onClick={() => openPlayer(j)}
                        >
                          <span className="rjp-ranking-card__rank">#{pos}</span>
                          <JugadorAvatar
                            fotoUrl={j.foto_url}
                            nombre={j.nombre}
                            size="md"
                            className="rjp-ranking-card__avatar"
                          />
                          <div className="rjp-ranking-card__body">
                            <span className="rjp-ranking-card__name">
                              {j.nombre}
                            </span>
                            <span className="rjp-ranking-card__meta">
                              <JugadorPaisBadge codigo={j.pais_codigo} size="sm" />
                              <span className="rjp-ranking-card__pts">
                                {(j.stats?.puntos_totales ?? 0).toLocaleString(
                                  "es-MX"
                                )}{" "}
                                pts
                              </span>
                            </span>
                          </div>
                          <TablerIcon
                            name="chevron-right"
                            size={18}
                            className="rjp-ranking-card__chev"
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </section>

        <footer className="rjp-ranking-footer">
          Riviera Open · Vive el pádel diferente
        </footer>
      </div>
    </JugadoresPublicShell>
  );
};
