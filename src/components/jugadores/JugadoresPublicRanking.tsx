import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClubExperienceScope,
  ClubIdentity,
  useClubExperience,
  useOrganizerDisplayName,
} from "../../club-experience";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIA_SHORT_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../../lib/rivieraJugadores/constants";
import { RIVIERA_RANKING_PUBLIC_POLL_INTERVAL_MS } from "../../lib/rivieraJugadores/publicPoll";
import { listInternalClubJugadoresRanking } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import { resolveOrganizerDisplayName } from "../../lib/organizer/organizerDisplayName";
import { subscribeRivieraRanking } from "../../lib/rivieraJugadores/subscribeRivieraRanking";
import { rankingPosicionesFromSortedForClub } from "../../lib/rivieraJugadores/rankingPosition";
import {
  prefetchOrganizerDisplayNames,
  resolveOrigenConcedidoOrganizadorId,
} from "../../lib/rivieraJugadores/grantedRankingDisplay";
import { navigateAppTo } from "../../lib/appRouting";
import {
  getPublicOrganizadorIdFromPath,
  getPublicOrganizadorIdFromSearch,
  getPublicOrganizadorIdWithoutUser,
  PUBLIC_ORGANIZER_RPC_FALLBACK,
} from "../../lib/rivieraJugadores/publicOrganizador";
import type {
  RivieraJugadorCategoria,
  RivieraJugadorWithStats,
} from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
  RIVIERA_GENERO_LABELS,
  RIVIERA_GENERO_RANKING_TITLE,
  RIVIERA_GENERO_REGISTRY_TITLE,
} from "../../lib/rivieraJugadores/genero";
import { TablerIcon } from "../ui/TablerIcon";
import { PublicModeShell } from "../platform/PublicModeShell";
import { StatusBadge } from "../platform/StatusBadge";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
import { RivieraIdBadgeFromJugador } from "./RivieraIdBadge";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import {
  buildInternalClubRankingUrl,
  buildRankingComoFuncionaPath,
  navigateInternalClubJugadorFicha,
  navigatePublicJugadorFicha,
} from "./jugadoresPublicNav";
import { JugadoresGeneroTabs } from "./JugadoresGeneroTabs";
import { RankingInternoDisclaimer } from "./RankingInternoDisclaimer";
import { RankingPodio } from "./RankingPodio";
import { RankingPtsDisplay } from "./RankingPtsDisplay";
import { RankingPuntosTeaser, RankingPuntosTeaserPills } from "./RankingPuntosTeaser";
import "./riviera-jugadores-public-ranking.css";

interface JugadoresPublicRankingProps {
  /** Org de la ruta `/ranking/o/{id}` (evita mezclar rankings entre perfiles). */
  organizadorId?: string;
  genero?: RivieraJugadorGenero;
}

function resolvePublicRankingOrgId(routeOrganizadorId?: string): string | null {
  return (
    routeOrganizadorId?.trim() ||
    getPublicOrganizadorIdFromPath() ||
    getPublicOrganizadorIdWithoutUser() ||
    null
  );
}

function RankingFooter() {
  const organizerName = useOrganizerDisplayName();
  return (
    <footer className="rjp-ranking-footer">
      {organizerName} · Vive el pádel diferente
    </footer>
  );
}

function RankingUnifiedHeader({ genero }: { genero: RivieraJugadorGenero }) {
  const { isClubBranded } = useClubExperience();
  const organizerName = useOrganizerDisplayName();

  return (
    <header className="rjp-ranking-header">
      <div className="rjp-ranking-header__top">
        {isClubBranded ? (
          <ClubIdentity
            variant="compact"
            showTagline={false}
            logoSurface="dark"
            wordmarkOnly
            className="rjp-ranking-header__club-identity"
          />
        ) : (
          <p className="rjp-ranking-header__brand">{organizerName}</p>
        )}
        <StatusBadge variant="muted">Ranking interno</StatusBadge>
      </div>
      <h1 className="rjp-ranking-header__title">
        {RIVIERA_GENERO_RANKING_TITLE[genero]}
      </h1>
      <p className="rjp-ranking-header__genero">{RIVIERA_GENERO_LABELS[genero]}</p>
    </header>
  );
}

export const JugadoresPublicRanking: React.FC<JugadoresPublicRankingProps> = ({
  organizadorId: routeOrganizadorId,
  genero = "M",
}) => {
  const orgId = useMemo(
    () => resolvePublicRankingOrgId(routeOrganizadorId),
    [routeOrganizadorId]
  );
  const [categoria, setCategoria] = useState<RivieraJugadorCategoria>("open");
  const [jugadores, setJugadores] = useState<RivieraJugadorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teaserOpen, setTeaserOpen] = React.useState(false);

  const jugadoresFiltrados = jugadores;

  const rankingRanks = useMemo(
    () => rankingPosicionesFromSortedForClub(jugadoresFiltrados, orgId),
    [jugadoresFiltrados, orgId]
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
      navigateAppTo(buildInternalClubRankingUrl(queryOrg, genero));
    }
  }, [routeOrganizadorId, genero]);

  const scopeOrgId = orgId ?? routeOrganizadorId?.trim() ?? null;

  const openPlayer = useCallback(
    (j: RivieraJugadorWithStats) => {
      if (orgId) {
        navigateInternalClubJugadorFicha(j.id, orgId);
        return;
      }
      navigatePublicJugadorFicha(j.slug);
    },
    [orgId]
  );

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;

    if (!orgId) {
      setJugadores([]);
      setError(
        "No hay ranking en esta ruta. Abre el ranking desde el registro de jugadores."
      );
      if (!silent) setLoading(false);
      return;
    }

    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      void resolveOrganizerDisplayName(orgId);
      const rows = await listInternalClubJugadoresRanking(
        orgId,
        categoria,
        genero,
        PUBLIC_ORGANIZER_RPC_FALLBACK
      );
      setJugadores(rows);
      void prefetchOrganizerDisplayNames([
        orgId,
        ...rows.map((j) => resolveOrigenConcedidoOrganizadorId(j)),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el ranking");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [orgId, categoria, genero]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void loadRef.current();
  }, [load]);

  useEffect(() => {
    if (!orgId) return;

    return subscribeRivieraRanking(orgId, () => {
      void loadRef.current({ silent: true });
    });
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;

    const id = window.setInterval(() => {
      void loadRef.current({ silent: true });
    }, RIVIERA_RANKING_PUBLIC_POLL_INTERVAL_MS);

    return () => window.clearInterval(id);
  }, [orgId]);

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
    <ClubExperienceScope organizadorId={scopeOrgId}>
    <JugadoresPublicShell variant="ranking">
      <PublicModeShell className="rjp-ranking-shell">
      <div className="rjp-ranking">
        <RankingUnifiedHeader genero={genero} />

        <div className="rjp-ranking-header__extras">
          <RankingInternoDisclaimer organizadorId={orgId} />
          <a className="rjp-ranking-header__cta" href={buildRankingComoFuncionaPath()}>
            Ver reglas completas
            <TablerIcon name="chevron-right" size={18} />
          </a>
        </div>

        <JugadoresGeneroTabs
          className="rjp-ranking-genero-tabs"
          genero={genero}
          onChange={(g) =>
            orgId
              ? navigateAppTo(buildInternalClubRankingUrl(orgId, g))
              : undefined
          }
        />

        <button
          type="button"
          className="rjp-ranking-teaser-toggle"
          onClick={() => setTeaserOpen((v) => !v)}
          aria-expanded={teaserOpen}
        >
          <span className="rjp-ranking-teaser-toggle__pills">
            <RankingPuntosTeaserPills />
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
                  clubOrganizadorId={orgId}
                  internalClub
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
                            size="lg"
                            className="rjp-ranking-card__avatar"
                          />
                          <div className="rjp-ranking-card__body">
                            <span className="rjp-ranking-card__name">
                              {j.nombre}
                            </span>
                            <RivieraIdBadgeFromJugador jugador={j} embedded />
                            <span className="rjp-ranking-card__meta">
                              <JugadorPaisBadge codigo={j.pais_codigo} size="sm" />
                              <RankingPtsDisplay
                                jugador={j}
                                clubOrganizadorId={orgId}
                                internalClub
                                className="rjp-ranking-card__pts"
                                variant="stacked"
                              />
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

        <RankingFooter />
      </div>
      </PublicModeShell>
    </JugadoresPublicShell>
    </ClubExperienceScope>
  );
};
