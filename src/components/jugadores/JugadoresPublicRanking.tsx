import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClubExperienceScope,
  PublicEventBrandIdentity,
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
import { RankingPuntosTeaser } from "./RankingPuntosTeaser";
import {
  matchesRankingSearch,
  readStoredPublicRankingCategoria,
  splitRankingPresentation,
  writeStoredPublicRankingCategoria,
} from "./rankingPublicUi";
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
  const { isScopeBrandingReady, brandingStatus } = useClubExperience();
  const organizerName = useOrganizerDisplayName();
  if (!isScopeBrandingReady || brandingStatus === "pending") {
    return <footer className="rjp-ranking-footer" aria-hidden />;
  }
  return (
    <footer className="rjp-ranking-footer">
      {organizerName} · Vive el pádel diferente
    </footer>
  );
}

function RankingHero({
  genero,
  categoria,
  playerCount,
  loading,
}: {
  genero: RivieraJugadorGenero;
  categoria: RivieraJugadorCategoria;
  playerCount: number;
  loading: boolean;
}) {
  const { isScopeBrandingReady, brandingStatus } = useClubExperience();
  const organizerName = useOrganizerDisplayName();
  const brandingReady =
    isScopeBrandingReady && brandingStatus !== "pending";

  const personaLabel =
    genero === "F"
      ? playerCount === 1
        ? "jugadora"
        : "jugadoras"
      : playerCount === 1
        ? "jugador"
        : "jugadores";

  return (
    <header className="rjp-ranking-hero">
      <div className="rjp-ranking-hero__top">
        <PublicEventBrandIdentity className="rjp-ranking-hero__brand" />
        <StatusBadge variant="muted">Ranking interno</StatusBadge>
      </div>
      <h1 className="rjp-ranking-hero__title">
        {RIVIERA_GENERO_RANKING_TITLE[genero]}
      </h1>
      <p className="rjp-ranking-hero__meta">
        <span>{RIVIERA_GENERO_LABELS[genero]}</span>
        <span className="rjp-ranking-hero__dot" aria-hidden>
          ·
        </span>
        <span>{JUGADOR_CATEGORIA_LABELS[categoria]}</span>
        {brandingReady ? (
          <>
            <span className="rjp-ranking-hero__dot" aria-hidden>
              ·
            </span>
            <span>{organizerName}</span>
          </>
        ) : null}
      </p>
      <p className="rjp-ranking-hero__count" aria-live="polite">
        {loading
          ? "Cargando…"
          : `${playerCount} ${personaLabel}`}
      </p>
    </header>
  );
}

function RankingSkeleton() {
  return (
    <div className="rjp-ranking-skeleton" aria-hidden>
      <div className="rjp-ranking-skeleton__hero">
        <div className="rjp-sk rjp-sk--brand" />
        <div className="rjp-sk rjp-sk--title" />
        <div className="rjp-sk rjp-sk--line" />
      </div>
      <div className="rjp-sk rjp-sk--tabs" />
      <div className="rjp-ranking-skeleton__cats">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rjp-sk rjp-sk--chip" />
        ))}
      </div>
      <div className="rjp-ranking-skeleton__podio">
        <div className="rjp-sk rjp-sk--podio" />
        <div className="rjp-sk rjp-sk--podio" />
        <div className="rjp-sk rjp-sk--podio" />
      </div>
      <div className="rjp-ranking-skeleton__rows">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="rjp-sk rjp-sk--row" />
        ))}
      </div>
    </div>
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
  const [categoria, setCategoria] = useState<RivieraJugadorCategoria>(() => {
    const resolved =
      routeOrganizadorId?.trim() ||
      getPublicOrganizadorIdFromPath() ||
      getPublicOrganizadorIdWithoutUser() ||
      null;
    return readStoredPublicRankingCategoria(resolved, genero) ?? "open";
  });
  const [jugadores, setJugadores] = useState<RivieraJugadorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const jugadoresVisibles = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return jugadores;
    return jugadores.filter((j) => matchesRankingSearch(j, q));
  }, [jugadores, searchQuery]);

  const rankingRanks = useMemo(
    () => rankingPosicionesFromSortedForClub(jugadoresVisibles, orgId),
    [jugadoresVisibles, orgId]
  );

  const isSearching = searchQuery.trim().length > 0;
  const {
    showPodio,
    podio: podioJugadores,
    list: listJugadores,
    listOffset: listRankOffset,
  } = useMemo(
    () =>
      splitRankingPresentation(jugadoresVisibles, { searching: isSearching }),
    [jugadoresVisibles, isSearching]
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

  useEffect(() => {
    const stored = readStoredPublicRankingCategoria(orgId, genero);
    setCategoria(stored ?? "open");
  }, [orgId, genero]);

  useEffect(() => {
    writeStoredPublicRankingCategoria(orgId, genero, categoria);
  }, [orgId, genero, categoria]);

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

  useEffect(() => {
    setSearchQuery("");
  }, [categoria, genero]);

  return (
    <ClubExperienceScope
      organizadorId={scopeOrgId}
      pendingUntilOrganizador={!scopeOrgId}
    >
      <JugadoresPublicShell variant="ranking">
        <PublicModeShell className="rjp-ranking-shell">
          <div className="rjp-ranking">
            <RankingHero
              genero={genero}
              categoria={categoria}
              playerCount={jugadores.length}
              loading={loading}
            />

            <JugadoresGeneroTabs
              className="rjp-ranking-genero-tabs"
              genero={genero}
              onChange={(g) =>
                orgId
                  ? navigateAppTo(buildInternalClubRankingUrl(orgId, g))
                  : undefined
              }
            />

            <section
              className="rjp-ranking-main"
              aria-label="Ranking por categoría"
            >
              <div className="rjp-ranking-cats" role="tablist" aria-label="Categorías">
                {JUGADOR_CATEGORIAS_ORDER.map((cat) => {
                  const active = categoria === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-current={active ? "true" : undefined}
                      className={`rjp-cat-chip${active ? " rjp-cat-chip--active" : ""}${
                        cat === "open" ? " rjp-cat-chip--open" : ""
                      }`}
                      onClick={() => setCategoria(cat)}
                    >
                      {cat === "open" && (
                        <TablerIcon
                          name="trophy"
                          size={14}
                          className="rjp-cat-chip__icon"
                        />
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

              <div className="rjp-ranking-toolbar">
                <label className="rjp-ranking-search">
                  <span className="sr-only">
                    Buscar por nombre o Riviera ID
                  </span>
                  <TablerIcon
                    name="search"
                    size={18}
                    className="rjp-ranking-search__icon"
                    aria-hidden
                  />
                  <input
                    type="search"
                    className="rjp-ranking-search__input"
                    placeholder="Buscar nombre o Riviera ID"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      className="rjp-ranking-search__clear"
                      onClick={() => setSearchQuery("")}
                      aria-label="Limpiar búsqueda"
                    >
                      <TablerIcon name="x" size={16} />
                    </button>
                  ) : null}
                </label>
              </div>

              <div className="rjp-ranking-body">
                {loading && jugadores.length === 0 ? (
                  <RankingSkeleton />
                ) : null}

                {error ? (
                  <p className="rjp-ranking-empty" role="alert">
                    {error}
                  </p>
                ) : null}

                {!error && !loading && jugadores.length === 0 ? (
                  <div className="rjp-ranking-empty-state">
                    <p className="rjp-ranking-empty-state__title">
                      Aún no hay {RIVIERA_GENERO_REGISTRY_TITLE[genero]} en{" "}
                      {JUGADOR_CATEGORIA_LABELS[categoria]}
                    </p>
                    <p className="rjp-ranking-empty-state__hint">
                      Si un jugador cambió de categoría, búscalo en su nueva
                      categoría.
                    </p>
                  </div>
                ) : null}

                {!error &&
                !loading &&
                jugadores.length > 0 &&
                jugadoresVisibles.length === 0 ? (
                  <div className="rjp-ranking-empty-state">
                    <p className="rjp-ranking-empty-state__title">
                      Sin resultados para “{searchQuery.trim()}”
                    </p>
                    <p className="rjp-ranking-empty-state__hint">
                      Prueba otro nombre o Riviera ID en esta categoría.
                    </p>
                    <button
                      type="button"
                      className="rjp-ranking-empty-state__action"
                      onClick={() => setSearchQuery("")}
                    >
                      Limpiar búsqueda
                    </button>
                  </div>
                ) : null}

                {!error && jugadoresVisibles.length > 0 ? (
                  <>
                    {showPodio ? (
                      <RankingPodio
                        jugadores={podioJugadores}
                        ranks={rankingRanks.slice(0, 3)}
                        clubOrganizadorId={orgId}
                        internalClub
                        onSelect={(slug) => {
                          const j = jugadoresVisibles.find(
                            (row) => row.slug === slug
                          );
                          if (j) openPlayer(j);
                        }}
                      />
                    ) : null}

                    {listJugadores.length > 0 ? (
                      <>
                        <div className="rjp-ranking-list-head">
                          <h2 className="rjp-ranking-list-head__title">
                            {showPodio ? "Ranking completo" : "Ranking"}
                          </h2>
                          {showPodio ? (
                            <p className="rjp-ranking-list-head__note">
                              Incluye del 4.º en adelante
                            </p>
                          ) : null}
                        </div>

                        <div
                          className="rjp-ranking-list-cols"
                          aria-hidden
                        >
                          <span>Pos.</span>
                          <span>Jugador</span>
                          <span className="rjp-ranking-list-cols__id">
                            Riviera ID
                          </span>
                          <span className="rjp-ranking-list-cols__cat">
                            Categoría
                          </span>
                          <span className="rjp-ranking-list-cols__pts">
                            Puntos
                          </span>
                        </div>

                        <ul
                          className={`rjp-ranking-list${
                            loading ? " is-loading" : ""
                          }`}
                        >
                          {listJugadores.map((j, idx) => {
                            const pos =
                              rankingRanks[idx + listRankOffset] ??
                              idx + listRankOffset + 1;
                            const catLabel =
                              JUGADOR_CATEGORIA_LABELS[categoria];
                            return (
                              <li key={j.id}>
                                <button
                                  type="button"
                                  className="rjp-ranking-card"
                                  onClick={() => openPlayer(j)}
                                  aria-label={`Ver perfil de ${j.nombre}, posición ${pos}`}
                                >
                                  <span className="rjp-ranking-card__rank">
                                    #{pos}
                                  </span>
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
                                    <span className="rjp-ranking-card__id-mobile">
                                      <RivieraIdBadgeFromJugador
                                        jugador={j}
                                        embedded
                                      />
                                    </span>
                                  </div>
                                  <span className="rjp-ranking-card__id-desktop">
                                    <RivieraIdBadgeFromJugador
                                      jugador={j}
                                      embedded
                                    />
                                  </span>
                                  <span className="rjp-ranking-card__cat">
                                    {catLabel}
                                  </span>
                                  <RankingPtsDisplay
                                    jugador={j}
                                    clubOrganizadorId={orgId}
                                    internalClub
                                    className="rjp-ranking-card__pts"
                                    variant="stacked"
                                  />
                                  <TablerIcon
                                    name="chevron-right"
                                    size={18}
                                    className="rjp-ranking-card__chev"
                                    aria-hidden
                                  />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </>
                    ) : null}
                  </>
                ) : null}
              </div>
            </section>

            <section className="rjp-ranking-rules" aria-labelledby="rjp-rules-title">
              <button
                type="button"
                id="rjp-rules-title"
                className="rjp-ranking-rules__toggle"
                aria-expanded={rulesOpen}
                aria-controls="rjp-rules-panel"
                onClick={() => setRulesOpen((v) => !v)}
              >
                <span className="rjp-ranking-rules__toggle-text">
                  <span className="rjp-ranking-rules__eyebrow">
                    Cómo funciona este ranking
                  </span>
                  <span className="rjp-ranking-rules__label">
                    Ver reglas y sistema de puntos
                  </span>
                </span>
                <TablerIcon
                  name={rulesOpen ? "chevron-up" : "chevron-down"}
                  size={20}
                  className="rjp-ranking-rules__chev"
                  aria-hidden
                />
              </button>
              <div
                id="rjp-rules-panel"
                className={`rjp-ranking-rules__panel${
                  rulesOpen ? " rjp-ranking-rules__panel--open" : ""
                }`}
                hidden={!rulesOpen}
              >
                <RankingInternoDisclaimer
                  organizadorId={orgId}
                  className="rjp-ranking-rules__disclaimer"
                />
                <a
                  className="rjp-ranking-rules__cta"
                  href={buildRankingComoFuncionaPath()}
                >
                  Ver reglas completas
                  <TablerIcon name="chevron-right" size={18} />
                </a>
                <RankingPuntosTeaser />
              </div>
            </section>

            <RankingFooter />
          </div>
        </PublicModeShell>
      </JugadoresPublicShell>
    </ClubExperienceScope>
  );
};
