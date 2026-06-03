import React, { useCallback, useEffect, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIA_SHORT_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../../lib/rivieraJugadores/constants";
import { listPublicJugadoresRanking } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import {
  getPublicOrganizadorIdWithoutUser,
  resolvePublicOrganizadorIdAsync,
} from "../../lib/rivieraJugadores/publicOrganizador";
import type {
  RivieraJugadorCategoria,
  RivieraJugadorWithStats,
} from "../../lib/rivieraJugadores/types";
import { TablerIcon } from "../ui/TablerIcon";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import { navigatePublicJugadorFicha } from "./jugadoresPublicNav";
import { RankingPuntosTeaser } from "./RankingPuntosTeaser";
import "./riviera-jugadores-public-ranking.css";

export const JugadoresPublicRanking: React.FC = () => {
  const { user } = useUser();
  const [orgId, setOrgId] = useState<string | null>(() =>
    getPublicOrganizadorIdWithoutUser()
  );
  const [orgReady, setOrgReady] = useState(() => !!getPublicOrganizadorIdWithoutUser());
  const [categoria, setCategoria] = useState<RivieraJugadorCategoria>("open");
  const [jugadores, setJugadores] = useState<RivieraJugadorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const preset = getPublicOrganizadorIdWithoutUser();
    if (preset) {
      setOrgId(preset);
      setOrgReady(true);
      return;
    }

    setOrgReady(false);
    void resolvePublicOrganizadorIdAsync(user?.id).then((id) => {
      if (cancelled) return;
      setOrgId(id);
      setOrgReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!orgReady) return;

    if (!orgId) {
      setJugadores([]);
      setError(
        "No hay jugadores públicos configurados todavía. El organizador puede compartir el enlace con ?org=UUID."
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rows = await listPublicJugadoresRanking(orgId, categoria);
      setJugadores(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el ranking");
    } finally {
      setLoading(false);
    }
  }, [orgId, categoria, orgReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const metaLine = loading
    ? "Cargando ranking…"
    : `${jugadores.length} jugador${jugadores.length === 1 ? "" : "es"} · ${JUGADOR_CATEGORIA_LABELS[categoria]}`;

  return (
    <JugadoresPublicShell variant="ranking">
      <div className="rjp-ranking">
        <header className="rjp-ranking-header">
          <p className="rjp-ranking-header__brand">Riviera Open</p>
          <h1 className="rjp-ranking-header__title">Ranking de jugadores</h1>
        </header>

        <RankingPuntosTeaser />

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
            {!error && !loading && jugadores.length === 0 && (
              <p className="rjp-ranking-empty">
                Aún no hay jugadores publicados en esta categoría.
              </p>
            )}

            {!error && jugadores.length > 0 && (
              <ul className="rjp-ranking-list">
                {jugadores.map((j, idx) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      className={`rjp-ranking-card${
                        idx === 0 ? " rjp-ranking-card--first" : ""
                      }`}
                      onClick={() =>
                        navigatePublicJugadorFicha(j.slug, orgId ?? undefined)
                      }
                    >
                      <span
                        className={`rjp-ranking-card__rank${
                          idx === 0 ? " rjp-ranking-card__rank--gold" : ""
                        }`}
                      >
                        {idx === 0 ? (
                          <TablerIcon name="trophy" size={14} />
                        ) : (
                          `#${idx + 1}`
                        )}
                      </span>
                      <JugadorAvatar
                        fotoUrl={j.foto_url}
                        nombre={j.nombre}
                        size="md"
                      />
                      <div className="rjp-ranking-card__body">
                        <span className="rjp-ranking-card__name">{j.nombre}</span>
                        <span className="rjp-ranking-card__pts">
                          {(j.stats?.puntos_totales ?? 0).toLocaleString("es-MX")}{" "}
                          pts
                        </span>
                      </div>
                      <TablerIcon
                        name="chevron-right"
                        size={18}
                        className="rjp-ranking-card__chev"
                      />
                    </button>
                  </li>
                ))}
              </ul>
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
