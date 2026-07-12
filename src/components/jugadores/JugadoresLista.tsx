import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useClubExperience, useOrganizerDisplayName } from "../../club-experience";
import { navigateToAppHome } from "../../lib/appRouting";
import { useUser } from "../../contexts/UserContext";
import { supabase } from "../../lib/supabaseClient";
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
  syncLegacyPlayersFromRivieraRegistry,
} from "../../lib/rivieraJugadores/playerPoolSync";
import {
  createRivieraJugador,
  deleteRivieraJugador,
  listRivieraJugadores,
  promoteImportedRivieraJugadores,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
  RIVIERA_GENERO_NEW_LABEL,
  RIVIERA_GENERO_REGISTRY_TITLE,
} from "../../lib/rivieraJugadores/genero";
import {
  rankingPosicionesFromSortedForClub,
} from "../../lib/rivieraJugadores/rankingPosition";
import { rankingPuntosJugadorLista, jugadorListaPartidosDisplay, jugadorListaPctVictoriasDisplay, prefetchOrganizerDisplayNames, resolveOrigenConcedidoOrganizadorId } from "../../lib/rivieraJugadores/grantedRankingDisplay";
import { buildPublicRankingUrl } from "./jugadoresPublicNav";
import { JugadoresGeneroTabs } from "./JugadoresGeneroTabs";
import { navigateJugadoresLista } from "./jugadoresGeneroNav";
import { JugadorAjustePuntosModal } from "./JugadorAjustePuntosModal";
import { LoadingProgressHint } from "../ui/LoadingProgressHint";
import { JugadorCompactRow } from "./JugadorCompactRow";
import { NuevoJugadorModal } from "./NuevoJugadorModal";
import { AgregarJugadorExistenteModal } from "./AgregarJugadorExistenteModal";
import {
  canDeleteGlobalPlayer,
  canRemovePlayerFromCurrentClub,
  mapPlayerMembershipUiError,
  removePlayerFromCurrentClub,
} from "../../lib/rivieraJugadores/playerMembership";
import "./riviera-jugadores.css";

export const JugadoresLista: React.FC<{ genero?: RivieraJugadorGenero }> = ({
  genero: generoProp = "M",
}) => {
  const genero = generoProp;
  const { user } = useUser();
  const { organizadorId } = useClubExperience();
  const organizerName = useOrganizerDisplayName(organizadorId ?? user?.id);
  const { permiteAjustePuntosManuales } = useAccountFeatures();
  const [jugadores, setJugadores] = useState<RivieraJugadorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [nivelFilter, setNivelFilter] = useState("");
  const [recientes, setRecientes] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [existingModalOpen, setExistingModalOpen] = useState(false);
  const [ajusteJugador, setAjusteJugador] =
    useState<RivieraJugadorWithStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const orgId = organizadorId ?? user?.id;
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Misma fuente que ranking/ficha: carrera por club (no stats locales del clon).
      const data = await listRivieraJugadores(orgId, {
        search,
        nivel: nivelFilter || undefined,
        activosRecientes: recientes,
        genero,
      });
      void prefetchOrganizerDisplayNames([
        orgId,
        ...data.map((j) => resolveOrigenConcedidoOrganizadorId(j)),
      ]);
      setJugadores(data);
      void syncLegacyPlayersFromRivieraRegistry(orgId).catch((e) => {
        console.warn("[jugadores-lista] sync legacy en segundo plano:", e);
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo cargar el registro de jugadores."
      );
    } finally {
      setLoading(false);
    }
  }, [organizadorId, user?.id, search, nivelFilter, recientes, genero]);

  useEffect(() => {
    const t = setTimeout(load, search ? 280 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void promoteImportedRivieraJugadores(organizadorId ?? user.id).then((n) => {
      if (!cancelled && n > 0) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [organizadorId, user?.id, load]);

  const pct = (j: RivieraJugadorWithStats) => jugadorListaPctVictoriasDisplay(j);

  const handleDeleteJugador = async (j: RivieraJugadorWithStats) => {
    const orgId = organizadorId ?? user?.id;
    if (!orgId || !canDeleteGlobalPlayer(j, orgId)) return;
    const ok = window.confirm(
      `¿Eliminar a «${j.nombre}» del registro?\n\nSe borrarán su historial, puntos y estadísticas en tu club. Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    setDeletingId(j.id);
    setError(null);
    try {
      await deleteRivieraJugador(orgId, j.id);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo eliminar el jugador."
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleLeaveFromClub = async (j: RivieraJugadorWithStats) => {
    const orgId = organizadorId ?? user?.id;
    if (!orgId || !canRemovePlayerFromCurrentClub(j, orgId)) return;
    const ok = window.confirm(
      `¿Quitar a «${j.nombre}» de tu club?\n\nEsto solo quitará al jugador de tu club. Su Riviera ID, historial y resultados se conservarán.`
    );
    if (!ok) return;
    setDeletingId(j.id);
    setError(null);
    try {
      await removePlayerFromCurrentClub(j.id);
      await syncLegacyPlayersFromRivieraRegistry(orgId);
      await load();
    } catch (e) {
      setError(mapPlayerMembershipUiError(e));
    } finally {
      setDeletingId(null);
    }
  };

  const orgIdForPoints = organizadorId ?? user?.id ?? null;

  const { jugadoresOrdenados, rankById } = useMemo(() => {
    // Ranking (posición / trofeo) sigue por puntos del club (carrera en este org).
    const byPoints = [...jugadores].sort((a, b) => {
      const pa = rankingPuntosJugadorLista(a, orgIdForPoints);
      const pb = rankingPuntosJugadorLista(b, orgIdForPoints);
      if (pb !== pa) return pb - pa;
      return a.nombre.localeCompare(b.nombre, "es");
    });
    const ranks = rankingPosicionesFromSortedForClub(byPoints, orgIdForPoints);
    const map = new Map<string, number>();
    byPoints.forEach((j, i) => map.set(j.id, ranks[i] ?? i + 1));

    // Lista del registro: orden alfabético (más fácil de encontrar jugadores).
    const sorted = [...jugadores].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    );
    return { jugadoresOrdenados: sorted, rankById: map };
  }, [jugadores, orgIdForPoints]);

  const handleImportHistorial = useCallback(async () => {
    if (!user?.id) return;
    setBackfilling(true);
    try {
      const [resumen, nPromoted] = await Promise.all([
        backfillHistorialJugadores(user.id),
        promoteImportedRivieraJugadores(user.id),
      ]);
      const {
        retas: nRetas,
        americanos: nAmericanos,
        ligas: nLigas,
        duelos: nDuelos,
      } = resumen;
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
        e instanceof Error ? e.message : "No se pudo actualizar el historial"
      );
    } finally {
      setBackfilling(false);
    }
  }, [user?.id, load]);

  const renderSecondaryActions = () => (
    <>
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
          onClick={() => void handleImportHistorial()}
        >
          {backfilling ? "Importando…" : "Importar historial"}
        </button>
      ) : null}
      <button
        type="button"
        className="rj-btn rj-btn--ghost"
        onClick={() => setExistingModalOpen(true)}
      >
        Agregar jugador existente
      </button>
    </>
  );

  const pageTitle = `Registro ${organizerName}`;

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
            <div className="rj-page__actions-desktop">
              {renderSecondaryActions()}
            </div>
            <button
              type="button"
              className="rj-btn rj-btn--primary"
              onClick={() => setModalOpen(true)}
            >
              + {RIVIERA_GENERO_NEW_LABEL[genero]}
            </button>
            <details className="rj-page__more">
              <summary className="rj-btn rj-btn--ghost rj-page__more-summary">
                Más ⋯
              </summary>
              <div className="rj-page__more-menu">
                {renderSecondaryActions()}
              </div>
            </details>
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
        {loading && !error && (
          <LoadingProgressHint
            active
            label="Cargando jugadores"
            className="rj-loading-hint"
          />
        )}
        {!loading && !error && jugadores.length === 0 && (
          <p className="rj-empty">
            Aún no hay {RIVIERA_GENERO_REGISTRY_TITLE[genero]} en el registro.
            Crea el primero o ejecuta la migración desde players/liga.
          </p>
        )}

        <div className="rj-list" role="list">
          <div className="rj-list__head" aria-hidden="true">
            <span>Rank</span>
            <span>Jugador</span>
            <span>Categoría</span>
            <span>Puntos</span>
            <span>Partidos</span>
            <span>% Vic.</span>
            <span>Acciones</span>
          </div>
          {jugadoresOrdenados.map((j) => {
            const pos = rankById.get(j.id) ?? 0;
            const puntos = rankingPuntosJugadorLista(j, orgIdForPoints);
            const orgId = organizadorId ?? user?.id;
            const canRemove = canRemovePlayerFromCurrentClub(j, orgId);
            const canDelete = canDeleteGlobalPlayer(j, orgId);
            return (
              <div key={j.id} role="listitem">
                <JugadorCompactRow
                  jugador={j}
                  rank={pos}
                  puntos={puntos}
                  partidosLabel={String(jugadorListaPartidosDisplay(j))}
                  pctLabel={pct(j)}
                  showAjustePuntos={Boolean(
                    canDelete && !canRemove && permiteAjustePuntosManuales
                  )}
                  canRemove={canRemove}
                  canDelete={canDelete}
                  deleting={deletingId === j.id}
                  onAjustePuntos={() => setAjusteJugador(j)}
                  onRemoveFromClub={() => void handleLeaveFromClub(j)}
                  onDelete={() => void handleDeleteJugador(j)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <AgregarJugadorExistenteModal
        open={existingModalOpen}
        onClose={() => setExistingModalOpen(false)}
        onAdded={async (membership) => {
          if (!user?.id) return;
          const { data: localRow } = await supabase
            .from("riviera_jugadores")
            .select("*")
            .eq("id", membership.localJugadorId)
            .maybeSingle();
          if (localRow) {
            const local = localRow as RivieraJugadorWithStats;
            await Promise.all([
              ensureLegacyPlayerForRivieraJugador(user.id, local),
              ensureLigaJugadorForRivieraJugador(user.id, local),
            ]);
          }
          await syncLegacyPlayersFromRivieraRegistry(user.id);
          await load();
        }}
      />

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
