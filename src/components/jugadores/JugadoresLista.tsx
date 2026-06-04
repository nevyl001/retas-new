import React, { useCallback, useEffect, useState } from "react";
import { navigateToAppHome } from "../../lib/appRouting";
import { useUser } from "../../contexts/UserContext";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../../lib/rivieraJugadores/constants";
import { backfillRetasHistorial } from "../../lib/rivieraJugadores/syncParticipaciones";
import {
  ensureLegacyPlayerForRivieraJugador,
  ensureLigaJugadorForRivieraJugador,
} from "../../lib/rivieraJugadores/playerPoolSync";
import {
  createRivieraJugador,
  listRivieraJugadores,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import { buildPublicRankingUrl } from "./jugadoresPublicNav";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadorCategoriaBadge } from "./JugadorCategoriaBadge";
import { JugadorPerfilMeta } from "./JugadorPerfilMeta";
import { navigateJugadorFicha } from "./jugadoresNav";
import { NuevoJugadorModal } from "./NuevoJugadorModal";
import "./riviera-jugadores.css";

export const JugadoresLista: React.FC = () => {
  const { user } = useUser();
  const [jugadores, setJugadores] = useState<RivieraJugadorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nivelFilter, setNivelFilter] = useState("");
  const [recientes, setRecientes] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listRivieraJugadores(user.id, {
        search,
        nivel: nivelFilter || undefined,
        activosRecientes: recientes,
      });
      setJugadores(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar el registro. ¿Ejecutaste la migración SQL?"
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, search, nivelFilter, recientes]);

  useEffect(() => {
    const t = setTimeout(load, search ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const pct = (j: RivieraJugadorWithStats) => {
    const s = j.stats;
    if (!s?.total_partidos) return "—";
    return `${Number(s.pct_victorias).toFixed(0)}%`;
  };

  return (
    <div className="rj-page">
      <div className="rj-page__inner">
        <button
          type="button"
          className="rj-back"
          onClick={() => navigateToAppHome()}
        >
          ← Volver al inicio
        </button>
        <div className="rj-page__top">
          <div>
            <h1 className="rj-page__title">Registro Riviera Open</h1>
            <p className="rj-page__sub">
              Perfiles, categoría y estadísticas de tus jugadores
            </p>
          </div>
          <div className="rj-page__top-actions">
            {user?.id && (
              <>
                <a
                  className="rj-btn rj-btn--ghost"
                  href={buildPublicRankingUrl(user.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ranking público
                </a>
                <button
                  type="button"
                  className="rj-btn rj-btn--ghost"
                  disabled={backfilling}
                  title="Importa historial de retas ya finalizadas"
                  onClick={async () => {
                    if (!user?.id) return;
                    setBackfilling(true);
                    try {
                      const n = await backfillRetasHistorial(user.id);
                      await load();
                      alert(
                        n > 0
                          ? `Historial actualizado desde ${n} reta(s) finalizada(s).`
                          : "No hay retas finalizadas para importar."
                      );
                    } catch (e) {
                      alert(
                        e instanceof Error
                          ? e.message
                          : "No se pudo actualizar el historial"
                      );
                    } finally {
                      setBackfilling(false);
                    }
                  }}
                >
                  {backfilling ? "Importando…" : "Importar retas"}
                </button>
              </>
            )}
            <button
              type="button"
              className="rj-btn rj-btn--primary"
              onClick={() => setModalOpen(true)}
            >
              + Nuevo jugador
            </button>
          </div>
        </div>

        <div className="rj-filters">
          <input
            className="rj-search"
            type="search"
            placeholder="Buscar por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rj-select"
            value={nivelFilter}
            onChange={(e) => setNivelFilter(e.target.value)}
            aria-label="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>
            {JUGADOR_CATEGORIAS_ORDER.map((n) => (
              <option key={n} value={n}>
                {JUGADOR_CATEGORIA_LABELS[n]}
              </option>
            ))}
          </select>
          <label className="rj-select" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={recientes}
              onChange={(e) => setRecientes(e.target.checked)}
            />
            Actividad reciente
          </label>
        </div>

        {error && <p className="rj-empty">{error}</p>}
        {loading && !error && <p className="rj-empty">Cargando jugadores…</p>}
        {!loading && !error && jugadores.length === 0 && (
          <p className="rj-empty">
            Aún no hay jugadores en el registro. Crea el primero o ejecuta la
            migración desde players/liga.
          </p>
        )}

        <div className="rj-grid">
          {jugadores.map((j) => (
            <button
              key={j.id}
              type="button"
              className="rj-card"
              onClick={() => navigateJugadorFicha(j.slug)}
            >
              <JugadorAvatar fotoUrl={j.foto_url} nombre={j.nombre} size="md" />
              <p className="rj-card__name">{j.nombre}</p>
              <JugadorCategoriaBadge categoria={j.categoria} />
              <JugadorPerfilMeta jugador={j} variant="card" />
              <p className="rj-card__stats">
                {j.stats?.total_partidos ?? 0} partidos · {pct(j)} victorias
              </p>
            </button>
          ))}
        </div>
      </div>

      <NuevoJugadorModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={async (data) => {
          if (!user?.id) return;
          const created = await createRivieraJugador(user.id, data);
          await Promise.all([
            ensureLegacyPlayerForRivieraJugador(user.id, created),
            ensureLigaJugadorForRivieraJugador(user.id, created),
          ]);
          await load();
        }}
      />
    </div>
  );
};
