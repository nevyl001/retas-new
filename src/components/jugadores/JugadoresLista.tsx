import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useClubExperience } from "../../club-experience";
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
  getRivieraJugadorPrivateById,
  listRivieraJugadores,
  promoteImportedRivieraJugadores,
} from "../../lib/rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import {
  RIVIERA_GENERO_NEW_LABEL,
  RIVIERA_GENERO_REGISTRY_TITLE,
} from "../../lib/rivieraJugadores/genero";
import { rankingPuntosJugadorLista, jugadorListaPartidosDisplay, jugadorListaPctVictoriasDisplay, prefetchOrganizerDisplayNames, resolveOrigenConcedidoOrganizadorId } from "../../lib/rivieraJugadores/grantedRankingDisplay";
import { buildPublicRankingUrl } from "./jugadoresPublicNav";
import { JugadoresGeneroTabs } from "./JugadoresGeneroTabs";
import { navigateJugadoresLista } from "./jugadoresGeneroNav";
import { JugadorAjustePuntosModal } from "./JugadorAjustePuntosModal";
import { LoadingProgressHint } from "../ui/LoadingProgressHint";
import { Button } from "../ui";
import { JugadorCard } from "./JugadorCard";
import { NuevoJugadorModal } from "./NuevoJugadorModal";
import { AgregarJugadorExistenteModal } from "./AgregarJugadorExistenteModal";
import {
  canDeleteGlobalPlayer,
  canRemovePlayerFromCurrentClub,
  mapPlayerMembershipUiError,
  removePlayerFromCurrentClub,
} from "../../lib/rivieraJugadores/playerMembership";
import "./riviera-jugadores.css";

const JUGADORES_PAGE_SIZE = 24;

export const JugadoresLista: React.FC<{ genero?: RivieraJugadorGenero }> = ({
  genero: generoProp = "M",
}) => {
  const genero = generoProp;
  const { user } = useUser();
  const { organizadorId } = useClubExperience();
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
  const [visibleCount, setVisibleCount] = useState(JUGADORES_PAGE_SIZE);

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
      // La lista solo necesita puntos/partidos/% de este club (ya vienen en el
      // join de stats de la query base) — se salta la resolución de carrera
      // global multi-club (identidad + hasta 500 participaciones por jugador)
      // que sí hace falta en la ficha individual, pero no aquí.
      const data = await listRivieraJugadores(orgId, {
        search,
        nivel: nivelFilter || undefined,
        activosRecientes: recientes,
        genero,
        skipCareerEnrich: true,
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

  // Reinicia la paginación solo cuando cambia lo que el usuario busca/filtra
  // (no en cada recarga incidental tras editar/eliminar un jugador).
  useEffect(() => {
    setVisibleCount(JUGADORES_PAGE_SIZE);
  }, [search, nivelFilter, recientes, genero]);

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
    const contextUserId = user?.id ?? null;
    const { data: authData } = await supabase.auth.getUser();
    const sessionAuthUid = authData.user?.id ?? null;

    // La RPC exige p_organizador_id = auth.uid(). Usar siempre la sesión.
    const orgId = sessionAuthUid ?? contextUserId;
    if (!orgId || !canDeleteGlobalPlayer(j, orgId)) {
      if (sessionAuthUid && j.organizador_id !== sessionAuthUid) {
        window.alert(
          "No puedes eliminar este jugador: tu sesión no es el club de origen."
        );
      }
      return;
    }
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
      const msg =
        e instanceof Error ? e.message : "No se pudo eliminar el jugador.";
      console.error("[jugadores-lista] deleteRivieraJugador failed:", e);
      setError(msg);
      window.alert(msg);
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

  // Lista del registro: orden alfabético (más fácil de encontrar jugadores).
  const jugadoresOrdenados = useMemo(
    () =>
      [...jugadores].sort((a, b) =>
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
      ),
    [jugadores]
  );

  // Resumen: solo datos ya disponibles en la lista cargada, sin queries nuevas.
  const summary = useMemo(() => {
    const ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - ACTIVITY_WINDOW_MS;
    const activos = jugadores.filter((j) => {
      const ultima = j.stats?.ultima_actividad;
      if (!ultima) return false;
      const t = new Date(ultima).getTime();
      return Number.isFinite(t) && t >= cutoff;
    }).length;
    return { total: jugadores.length, activos };
  }, [jugadores]);

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
        <Button
          as="a"
          variant="ghost"
          size="sm"
          href={buildPublicRankingUrl(user.id, genero)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ranking {genero === "F" ? "femenil" : "varonil"}
        </Button>
      ) : null}
      {user?.id ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={backfilling}
          title="Importa historial y recalcula rating de retas, americanos, ligas y duelos finalizados"
          onClick={() => void handleImportHistorial()}
        >
          {backfilling ? "Importando…" : "Importar historial"}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExistingModalOpen(true)}
      >
        Agregar jugador existente
      </Button>
    </>
  );

  return (
    <div className="rj-page">
      <div className="rj-page__inner">
        <Button type="button" variant="ghost" size="sm" onClick={() => navigateToAppHome()}>
          ← Volver al inicio
        </Button>
        <div className="rj-page__top">
          <div>
            <h1 className="rj-page__title">Registro de jugadores</h1>
            <p className="rj-page__sub">
              Administra perfiles, categorías y actividad de tus jugadores.
            </p>
          </div>
          <div className="rj-page__top-actions">
            <Button type="button" variant="primary" size="sm" onClick={() => setModalOpen(true)}>
              + {RIVIERA_GENERO_NEW_LABEL[genero]}
            </Button>
            <details className="rj-page__more">
              <summary
                className="riviera-btn riviera-btn-secondary riviera-btn--sm rj-page__more-summary"
                aria-label="Más acciones"
              >
                Más
              </summary>
              <div className="rj-page__more-menu" role="menu">
                {renderSecondaryActions()}
              </div>
            </details>
          </div>
        </div>

        <JugadoresGeneroTabs
          genero={genero}
          onChange={(g) => navigateJugadoresLista(g)}
        />

        {!loading && !error && summary.total > 0 && (
          <p className="rj-summary">
            {summary.total} jugador{summary.total === 1 ? "" : "es"} ·{" "}
            {summary.activos} activo{summary.activos === 1 ? "" : "s"}{" "}
            recientemente
          </p>
        )}

        <div className="rj-filters">
          <input
            className="rj-search"
            type="search"
            placeholder="Buscar por nombre…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="riviera-input"
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
          <label className="rj-checkbox-pill">
            <input
              type="checkbox"
              checked={recientes}
              onChange={(e) => setRecientes(e.target.checked)}
            />
            Actividad reciente
          </label>
        </div>

        {error && (
          <p className="rj-error" role="alert">
            {error}
          </p>
        )}
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

        <div className="rj-cards" role="list">
          {jugadoresOrdenados.slice(0, visibleCount).map((j) => {
            const puntos = rankingPuntosJugadorLista(j, orgIdForPoints);
            const orgId = organizadorId ?? user?.id;
            const canRemove = canRemovePlayerFromCurrentClub(j, orgId);
            const canDelete = canDeleteGlobalPlayer(j, orgId);
            return (
              <div key={j.id} role="listitem">
                <JugadorCard
                  jugador={j}
                  puntos={puntos}
                  partidosCount={jugadorListaPartidosDisplay(j)}
                  pctLabel={pct(j)}
                  showEditar={Boolean(canDelete && !canRemove)}
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

        {!loading && !error && jugadoresOrdenados.length > visibleCount && (
          <div className="rj-load-more">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setVisibleCount((v) => v + JUGADORES_PAGE_SIZE)}
            >
              Cargar más ({jugadoresOrdenados.length - visibleCount} restantes)
            </Button>
          </div>
        )}
      </div>

      <AgregarJugadorExistenteModal
        open={existingModalOpen}
        onClose={() => setExistingModalOpen(false)}
        onAdded={async (membership) => {
          if (!user?.id) return;
          const localRow = await getRivieraJugadorPrivateById(
            membership.localJugadorId
          );
          if (localRow) {
            const local = localRow as RivieraJugadorWithStats;
            try {
              await Promise.all([
                ensureLegacyPlayerForRivieraJugador(user.id, local),
                ensureLigaJugadorForRivieraJugador(user.id, local),
              ]);
            } catch (e) {
              console.warn("[jugadores] ensure legacy fail-closed:", e);
            }
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
          try {
            await Promise.all([
              ensureLegacyPlayerForRivieraJugador(user.id, created),
              ensureLigaJugadorForRivieraJugador(user.id, created),
            ]);
          } catch (e) {
            console.warn("[jugadores] ensure legacy fail-closed:", e);
          }
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
