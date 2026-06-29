import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useClubExperience } from "../../club-experience";
import { navigateToAppHome } from "../../lib/appRouting";
import { useUser } from "../../contexts/UserContext";
import { useAccountFeatures } from "../../contexts/AccountFeaturesContext";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../../lib/rivieraJugadores/constants";
import {
  backfillHistorialJugadores,
} from "../../lib/rivieraJugadores/syncParticipaciones";
import {
  ensureLegacyPlayerForRivieraJugador,
  ensureLigaJugadorForRivieraJugador,
} from "../../lib/rivieraJugadores/playerPoolSync";
import {
  createRivieraJugador,
  deleteRivieraJugador,
  listRivieraJugadores,
  promoteImportedRivieraJugadores,
  rebuildJugadorStats,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
  RIVIERA_GENERO_NEW_LABEL,
  RIVIERA_GENERO_REGISTRY_TITLE,
} from "../../lib/rivieraJugadores/genero";
import {
  rankingPosicionesFromSorted,
} from "../../lib/rivieraJugadores/rankingPosition";
import { rankingPuntosJugadorLista } from "../../lib/rivieraJugadores/grantedRankingDisplay";
import { buildPublicRankingUrl } from "./jugadoresPublicNav";
import { JugadoresGeneroTabs } from "./JugadoresGeneroTabs";
import { navigateJugadoresLista } from "./jugadoresGeneroNav";
import { JugadorAjustePuntosModal } from "./JugadorAjustePuntosModal";
import { JugadorAvatar } from "./JugadorAvatar";
import { JugadorPaisBadge } from "./JugadorPaisBadge";
import { TablerIcon } from "../ui/TablerIcon";
import { JugadorCategoriaBadge } from "./JugadorCategoriaBadge";
import { JugadorPerfilMeta } from "./JugadorPerfilMeta";
import { navigateJugadorFicha } from "./jugadoresNav";
import { NuevoJugadorModal } from "./NuevoJugadorModal";
import "./riviera-jugadores.css";

export const JugadoresLista: React.FC<{ genero?: RivieraJugadorGenero }> = ({
  genero: generoProp = "M",
}) => {
  const genero = generoProp;
  const { user } = useUser();
  const { manifest, isClubBranded } = useClubExperience();
  const { permiteAjustePuntosManuales } = useAccountFeatures();
  const [jugadores, setJugadores] = useState<RivieraJugadorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nivelFilter, setNivelFilter] = useState("");
  const [recientes, setRecientes] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [ajusteJugador, setAjusteJugador] =
    useState<RivieraJugadorWithStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listRivieraJugadores(user.id, {
        search,
        nivel: nivelFilter || undefined,
        activosRecientes: recientes,
        genero,
      });
      setJugadores(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar el registro de jugadores."
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, search, nivelFilter, recientes, genero]);

  useEffect(() => {
    const t = setTimeout(load, search ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void promoteImportedRivieraJugadores(user.id).then((n) => {
      if (!cancelled && n > 0) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, load]);

  const pct = (j: RivieraJugadorWithStats) => {
    const s = j.stats;
    if (!s?.total_partidos) return "—";
    return `${Number(s.pct_victorias).toFixed(0)}%`;
  };

  const handleDeleteJugador = async (j: RivieraJugadorWithStats) => {
    if (!user?.id || j.concedidoPorAdmin) return;
    const ok = window.confirm(
      `¿Eliminar a «${j.nombre}» del registro?\n\nSe borrarán su historial, puntos y estadísticas. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    setDeletingId(j.id);
    setError(null);
    try {
      await deleteRivieraJugador(user.id, j.id);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo eliminar el jugador."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const { jugadoresOrdenados, rankById } = useMemo(() => {
    const sorted = [...jugadores].sort((a, b) => {
      const pa = rankingPuntosJugadorLista(a);
      const pb = rankingPuntosJugadorLista(b);
      if (pb !== pa) return pb - pa;
      return a.nombre.localeCompare(b.nombre, "es");
    });
    const ranks = rankingPosicionesFromSorted(sorted);
    const map = new Map<string, number>();
    sorted.forEach((j, i) => map.set(j.id, ranks[i] ?? i + 1));
    return { jugadoresOrdenados: sorted, rankById: map };
  }, [jugadores]);

  const pageTitle = isClubBranded
    ? `Registro de jugadores en ${manifest.displayName}`
    : "Registro Riviera Open";

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
            <h1 className="rj-page__title">{pageTitle}</h1>
            <p className="rj-page__sub">
              Perfiles, categoría y estadísticas de tus{" "}
              {RIVIERA_GENERO_REGISTRY_TITLE[genero]}
            </p>
          </div>
          <div className="rj-page__top-actions">
            {user?.id ? (
              <a
                className="rj-btn rj-btn--ghost"
                href={buildPublicRankingUrl(user.id, genero)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ranking {genero === "F" ? "femenil" : "varonil"}
              </a>
            ) : null}
            {user?.id ? (
              <button
                type="button"
                className="rj-btn rj-btn--ghost"
                disabled={backfilling}
                title="Importa historial y recalcula rating de retas, americanos, ligas y duelos finalizados"
                onClick={async () => {
                  if (!user?.id) return;
                  setBackfilling(true);
                  try {
                    const [resumen, nPromoted] = await Promise.all([
                      backfillHistorialJugadores(user.id),
                      promoteImportedRivieraJugadores(user.id),
                    ]);
                    const { retas: nRetas, americanos: nAmericanos, ligas: nLigas, duelos: nDuelos } =
                      resumen;
                    const todos = await listRivieraJugadores(user.id);
                    await Promise.allSettled(
                      todos.map((j) => rebuildJugadorStats(j.id))
                    );
                    await load();
                    const total = nRetas + nAmericanos + nLigas + nDuelos;
                    const promoNote =
                      nPromoted > 0
                        ? ` ${nPromoted} jugador(es) activados en ranking público.`
                        : "";
                    alert(
                      total > 0
                        ? `Historial actualizado: ${nRetas} reta(s), ${nAmericanos} americano(s), ${nLigas} jornada(s) de liga, ${nDuelos} duelo(s). Se recalculó el rating de partidos ya cerrados.${promoNote}`
                        : nPromoted > 0
                          ? `${nPromoted} jugador(es) activados en ranking público.`
                          : "No hay eventos cerrados para importar."
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
                {backfilling ? "Importando…" : "Importar historial"}
              </button>
            ) : null}
            <button
              type="button"
              className="rj-btn rj-btn--primary"
              onClick={() => setModalOpen(true)}
            >
              + {RIVIERA_GENERO_NEW_LABEL[genero]}
            </button>
          </div>
        </div>

        <JugadoresGeneroTabs
          genero={genero}
          onChange={(g) => navigateJugadoresLista(g)}
        />

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
            Aún no hay {RIVIERA_GENERO_REGISTRY_TITLE[genero]} en el registro.
            Crea el primero o ejecuta la migración desde players/liga.
          </p>
        )}

        <div className="rj-grid">
          {jugadoresOrdenados.map((j) => {
            const pos = rankById.get(j.id) ?? 0;
            const puntos = rankingPuntosJugadorLista(j);
            const esPrimero = pos === 1;
            return (
              <article key={j.id} className="rj-card">
                <div className="rj-card__top">
                  <span
                    className={`rj-card__rank${
                      esPrimero ? " rj-card__rank--gold" : ""
                    }`}
                  >
                    {esPrimero ? (
                      <TablerIcon name="trophy" size={12} />
                    ) : (
                      `#${pos}`
                    )}
                  </span>
                  <span className="rj-card__pts">
                    {puntos.toLocaleString("es-MX")} pts
                  </span>
                  {!j.concedidoPorAdmin ? (
                  <div className="rj-card__actions">
                    {permiteAjustePuntosManuales ? (
                      <button
                        type="button"
                        className="rj-card__edit"
                        title="Sumar o restar puntos"
                        aria-label={`Ajustar puntos de ${j.nombre}`}
                        onClick={() => setAjusteJugador(j)}
                      >
                        <TablerIcon name="pencil" size={14} aria-hidden={false} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rj-card__delete"
                      title="Eliminar jugador"
                      aria-label={`Eliminar a ${j.nombre}`}
                      disabled={deletingId === j.id}
                      onClick={() => void handleDeleteJugador(j)}
                    >
                      <TablerIcon name="trash" size={14} aria-hidden={false} />
                    </button>
                  </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="rj-card__body"
                  onClick={() => navigateJugadorFicha(j.slug)}
                >
                  <JugadorAvatar
                    fotoUrl={j.foto_url}
                    nombre={j.nombre}
                    size="md"
                  />
                  <div className="rj-card__name-row">
                    <p className="rj-card__name">{j.nombre}</p>
                    <JugadorPaisBadge codigo={j.pais_codigo} size="sm" />
                    {j.concedidoPorAdmin ? (
                      <span
                        className="rj-granted-badge rj-granted-badge--inline"
                        title="Acceso concedido por Admin Principal"
                      >
                        <TablerIcon name="share-3" size={11} />
                        <span>Concedido</span>
                      </span>
                    ) : null}
                  </div>
                  <JugadorCategoriaBadge categoria={j.categoria} />
                  <JugadorPerfilMeta jugador={j} variant="card" />
                  <p className="rj-card__stats">
                    {(j.rating_partidos ?? 0) > 0 ? (
                      <>
                        Nivel {(j.rating ?? 3).toFixed(2)}
                        {" · "}
                      </>
                    ) : null}
                    {j.stats?.total_partidos ?? 0} partidos · {pct(j)} victorias
                  </p>
                </button>
              </article>
            );
          })}
        </div>
      </div>

      <NuevoJugadorModal
        open={modalOpen}
        genero={genero}
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

      {user?.id && (
        <JugadorAjustePuntosModal
          open={ajusteJugador !== null}
          jugador={ajusteJugador}
          organizadorId={user.id}
          onClose={() => setAjusteJugador(null)}
          onSaved={load}
        />
      )}
    </div>
  );
};
