import React, { useEffect, useMemo, useState } from "react";
import { getPlayers, type Player } from "../lib/database";
import { useUser } from "../contexts/UserContext";
import type { RivieraJugadorCategoria } from "../lib/rivieraJugadores/types";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../lib/rivieraJugadores/constants";
import { JugadorCategoriaBadge } from "./jugadores/JugadorCategoriaBadge";
import { RivieraIdBadge } from "./jugadores/RivieraIdBadge";
import { shouldShowPlayerPoolLoading } from "../hooks/organizerPlayerPoolLogic";
import { navigateJugadoresLista } from "./jugadores/jugadoresGeneroNav";
import { Button } from "./ui";
import "./jugadores/riviera-jugadores.css";

interface ModernPlayerManagerProps {
  onPlayerSelect?: (players: Player[]) => void;
  selectedPlayers?: Player[];
  allowMultipleSelection?: boolean;
  playersInPairs?: string[];
  userId?: string;
  /** @deprecated tournamentId no afecta el pool; se ignora */
  tournamentId?: string;
  /** Pool compartido desde el padre (FourComponentsGrid) */
  players?: Player[];
  loading?: boolean;
  error?: string | null;
  onRefreshPlayers?: () => Promise<void> | void;
  isCreatingPair?: boolean;
}

type PoolPlayer = Player & {
  categoria?: RivieraJugadorCategoria | null;
  foto_url?: string | null;
  riviera_id?: string | null;
};

const PAGE_SIZE = 24;

export const ModernPlayerManager: React.FC<ModernPlayerManagerProps> = ({
  onPlayerSelect,
  selectedPlayers = [],
  allowMultipleSelection = false,
  playersInPairs = [],
  userId,
  players: playersProp,
  loading: loadingProp,
  error: errorProp,
  onRefreshPlayers,
  isCreatingPair = false,
}) => {
  const { user } = useUser();
  const organizadorId = (userId ?? user?.id)?.trim() || undefined;
  const usesExternalPool = playersProp !== undefined;

  const [internalPlayers, setInternalPlayers] = useState<Player[]>([]);
  const [internalLoading, setInternalLoading] = useState(!usesExternalPool);
  const [internalError, setInternalError] = useState<string | null>(null);

  const [gridSearch, setGridSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  React.useEffect(() => {
    if (usesExternalPool) return;
    if (!organizadorId) {
      setInternalPlayers([]);
      setInternalLoading(false);
      setInternalError(null);
      return;
    }

    let cancelled = false;
    const requestId = { current: 0 };
    const run = async () => {
      const id = ++requestId.current;
      const isFirst = internalPlayers.length === 0;
      if (isFirst) setInternalLoading(true);
      try {
        const data = await getPlayers(organizadorId);
        if (cancelled || id !== requestId.current) return;
        setInternalPlayers(data);
        setInternalError(null);
      } catch (err) {
        if (cancelled || id !== requestId.current) return;
        setInternalError(
          err instanceof Error ? err.message : "Error al cargar jugadores"
        );
      } finally {
        if (!cancelled && id === requestId.current) {
          setInternalLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      requestId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pool interno solo por organizer
  }, [usesExternalPool, organizadorId]);

  const players = usesExternalPool ? playersProp! : internalPlayers;
  const loading = usesExternalPool ? Boolean(loadingProp) : internalLoading;
  const error = usesExternalPool ? errorProp ?? null : internalError;

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [gridSearch, categoryFilter, onlyAvailable]);

  const filteredPlayers = useMemo(() => {
    const q = gridSearch.trim().toLowerCase();
    return players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (categoryFilter) {
        const cat = (p as PoolPlayer).categoria;
        if (cat !== categoryFilter) return false;
      }
      if (onlyAvailable && playersInPairs.includes(p.id)) return false;
      return true;
    });
  }, [players, gridSearch, categoryFilter, onlyAvailable, playersInPairs]);

  const visiblePlayers = filteredPlayers.slice(0, visibleCount);

  const emptyHint = useMemo(
    () =>
      organizadorId
        ? "Los jugadores se crean solo en Registro de jugadores (dashboard). Aquí solo eliges quién juega esta reta."
        : "Inicia sesión para cargar el registro de jugadores",
    [organizadorId]
  );

  const handlePlayerSelect = (player: Player) => {
    if (isCreatingPair) return;
    if (playersInPairs.includes(player.id)) {
      alert(
        `No puedes seleccionar a ${player.name} porque ya está en una pareja. Debes eliminar su pareja actual primero.`
      );
      return;
    }

    if (onPlayerSelect) {
      if (allowMultipleSelection) {
        const isSelected = selectedPlayers.some((p) => p.id === player.id);
        if (isSelected) {
          onPlayerSelect(selectedPlayers.filter((p) => p.id !== player.id));
        } else {
          onPlayerSelect([...selectedPlayers, player]);
        }
      } else {
        onPlayerSelect([player]);
      }
    }
  };

  // Primera carga sin datos: spinner. Con datos o refetch: no ocultar lista.
  if (shouldShowPlayerPoolLoading(loading, players.length)) {
    return (
      <div className="elegant-player-manager">
        <div className="elegant-loading">
          <div className="elegant-loading-spinner"></div>
          <p>Cargando jugadores...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="elegant-player-manager">
      <div className="elegant-player-header">
        <h3 className="elegant-player-header__title">
          Jugadores <span className="elegant-player-count">{players.length}</span>
        </h3>
        <div className="elegant-player-header__actions">
          {isCreatingPair ? (
            <span className="elegant-form-hint" role="status">
              Creando pareja…
            </span>
          ) : null}
          {onRefreshPlayers ? (
            <button
              type="button"
              className="elegant-text-action"
              disabled={loading}
              onClick={() => void onRefreshPlayers()}
            >
              Actualizar
            </button>
          ) : null}
          <span className="elegant-text-action-sep" aria-hidden>
            ·
          </span>
          <button
            type="button"
            className="elegant-text-action"
            onClick={() => navigateJugadoresLista("M")}
          >
            Ir al registro de jugadores →
          </button>
        </div>
      </div>

      {error ? (
        <p className="elegant-form-hint" role="alert">
          {error}
        </p>
      ) : null}

      {players.length === 0 ? (
        <div className="elegant-empty-state">
          <h4>No hay jugadores listos</h4>
          <p>{emptyHint}</p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => navigateJugadoresLista("M")}
          >
            Ir al registro de jugadores
          </Button>
        </div>
      ) : (
        <>
          <div className="elegant-grid-filters">
            <input
              type="search"
              className="elegant-grid-search"
              placeholder="Buscar jugador por nombre…"
              value={gridSearch}
              onChange={(e) => setGridSearch(e.target.value)}
            />
            <select
              className="riviera-input"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filtrar por categoría"
            >
              <option value="">Todas las categorías</option>
              {JUGADOR_CATEGORIAS_ORDER.map((c) => (
                <option key={c} value={c}>
                  {JUGADOR_CATEGORIA_LABELS[c]}
                </option>
              ))}
            </select>
            <label className="rj-checkbox-pill">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
              />
              Solo disponibles
            </label>
          </div>

          {filteredPlayers.length === 0 ? (
            <p className="elegant-form-hint">
              Ningún jugador coincide con la búsqueda o los filtros.
            </p>
          ) : (
            <div className="elegant-players-grid" role="list">
              {visiblePlayers.map((player) => {
                const poolPlayer = player as PoolPlayer;
                const categoria = poolPlayer.categoria;
                const fotoUrl =
                  typeof poolPlayer.foto_url === "string" &&
                  poolPlayer.foto_url.trim()
                    ? poolPlayer.foto_url.trim()
                    : null;
                const rivieraId =
                  typeof poolPlayer.riviera_id === "string" &&
                  poolPlayer.riviera_id.trim()
                    ? poolPlayer.riviera_id.trim()
                    : null;
                const isSelected = selectedPlayers.some(
                  (p) => p.id === player.id
                );
                const isInPair = playersInPairs.includes(player.id);
                const statusLabel = isInPair
                  ? "Pareja asignada"
                  : isSelected
                    ? "Seleccionado"
                    : "Disponible";
                const showSelectedMark = isSelected || isInPair;

                return (
                  <div key={player.id} role="listitem">
                    <button
                      type="button"
                      className={`elegant-player-card${
                        fotoUrl ? " elegant-player-card--has-photo" : ""
                      }${isSelected ? " selected" : ""}${
                        isInPair ? " in-pair" : ""
                      }`}
                      onClick={() => handlePlayerSelect(player)}
                      disabled={isCreatingPair}
                      aria-pressed={isSelected || isInPair}
                      aria-label={`${player.name} — ${statusLabel}`}
                    >
                      {fotoUrl ? (
                        <>
                          <span
                            className="elegant-player-card__photo"
                            style={{ backgroundImage: `url(${fotoUrl})` }}
                            aria-hidden
                          />
                          <span
                            className="elegant-player-card__overlay"
                            aria-hidden
                          />
                        </>
                      ) : null}
                      <span className="elegant-player-info">
                        <span className="elegant-player-name" title={player.name}>
                          {player.name}
                        </span>
                        <span className="elegant-player-meta">
                          {categoria ? (
                            <JugadorCategoriaBadge
                              categoria={categoria}
                              className="elegant-player-cat"
                            />
                          ) : null}
                          {rivieraId ? (
                            <RivieraIdBadge
                              rivieraId={rivieraId}
                              size="sm"
                              embedded
                              className="elegant-player-riviera-id"
                            />
                          ) : null}
                        </span>
                      </span>
                      {showSelectedMark ? (
                        <span
                          className={`elegant-player-mark${
                            isInPair && !isSelected
                              ? " elegant-player-mark--assigned"
                              : ""
                          }`}
                          aria-hidden
                        >
                          ✓
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {filteredPlayers.length > visibleCount && (
            <div className="elegant-load-more">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
              >
                Mostrar más jugadores · {filteredPlayers.length - visibleCount}{" "}
                restantes
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
