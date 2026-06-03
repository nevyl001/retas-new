import React, { useCallback, useEffect, useState } from "react";
import { useUser } from "../../contexts/UserContext";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../../lib/rivieraJugadores/constants";
import { listPublicJugadoresRanking } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import {
  getPublicOrganizadorIdWithoutUser,
  resolvePublicOrganizadorId,
} from "../../lib/rivieraJugadores/publicOrganizador";
import type {
  RivieraJugadorCategoria,
  RivieraJugadorWithStats,
} from "../../lib/rivieraJugadores/types";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadoresPublicShell } from "./JugadoresPublicShell";
import { navigatePublicJugadorFicha } from "./jugadoresPublicNav";

export const JugadoresPublicRanking: React.FC = () => {
  const { user, loading: userLoading } = useUser();
  const orgId = resolvePublicOrganizadorId(user?.id);
  const [categoria, setCategoria] = useState<RivieraJugadorCategoria>("open");
  const [jugadores, setJugadores] = useState<RivieraJugadorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) {
      if (userLoading && !getPublicOrganizadorIdWithoutUser()) {
        setLoading(true);
        return;
      }
      setError(
        "No se pudo cargar el ranking del club. Abre el enlace con ?org= o inicia sesión como organizador."
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
  }, [orgId, categoria, userLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <JugadoresPublicShell>
      <header className="rjp-header">
        <p className="rjp-brand">Riviera Open</p>
        <h1 className="rjp-title">Ranking de jugadores</h1>
      </header>

      <nav className="rjp-tabs" aria-label="Categorías">
        {JUGADOR_CATEGORIAS_ORDER.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`rjp-tab${categoria === cat ? " rjp-tab--active" : ""}`}
            onClick={() => setCategoria(cat)}
          >
            {JUGADOR_CATEGORIA_LABELS[cat]}
          </button>
        ))}
      </nav>

      <div className="rjp-section-head">
        <h2>{JUGADOR_CATEGORIA_LABELS[categoria]}</h2>
        <p>
          {loading
            ? "Cargando…"
            : `Mostrando ${jugadores.length} jugador${jugadores.length === 1 ? "" : "es"} en esta categoría`}
        </p>
      </div>

      {error && <p className="rjp-empty">{error}</p>}
      {!error && !loading && jugadores.length === 0 && (
        <p className="rjp-empty">Aún no hay jugadores publicados en esta categoría.</p>
      )}

      <ul className="rjp-list">
        {jugadores.map((j, idx) => (
          <li key={j.id}>
            <button
              type="button"
              className="rjp-card"
              onClick={() => navigatePublicJugadorFicha(j.slug, orgId ?? undefined)}
            >
              <span className="rjp-rank">#{idx + 1}</span>
              <JugadorAvatar fotoUrl={j.foto_url} nombre={j.nombre} size="md" />
              <div className="rjp-card__body">
                <span className="rjp-card__name">{j.nombre}</span>
                <span className="rjp-card__meta">
                  <span className="rjp-card__pts">
                    {(j.stats?.puntos_totales ?? 0).toLocaleString("es-MX")} pts
                  </span>
                  <span className="rjp-card__cat">
                    {JUGADOR_CATEGORIA_LABELS[j.categoria]}
                  </span>
                </span>
              </div>
              {(j.instagram_url || j.facebook_url) && (
                <span className="rjp-card__social" aria-hidden>
                  {j.instagram_url ? "◎" : ""}
                  {j.facebook_url ? "f" : ""}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <footer className="rjp-public__footer">Riviera Open · Padel Club</footer>
    </JugadoresPublicShell>
  );
};
