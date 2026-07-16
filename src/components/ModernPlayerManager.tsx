import React, { useState, useMemo } from "react";
import { getPlayers, type Player } from "../lib/database";
import { useUser } from "../contexts/UserContext";
import type { RivieraJugador } from "../lib/rivieraJugadores/types";
import { isGrantedJugadorRow } from "../lib/rivieraJugadores/organizerPlayerAccess";
import {
  findPoolPlayerByLegacyId,
  hintWhenRegistryPlayerMissingFromRetaPool,
} from "../lib/retaAbierta/registrySelectForReta";
import { linkLegacyOnSelectForReta } from "../lib/retaAbierta/linkLegacyOnSelectForReta";
import { shouldShowPlayerPoolLoading } from "../hooks/organizerPlayerPoolLogic";
import { JugadorAutocomplete } from "./jugadores/JugadorAutocomplete";
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
  const [registrySearch, setRegistrySearch] = useState("");
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
  const [registryHint, setRegistryHint] = useState<string | null>(null);
  const [linkingLegacy, setLinkingLegacy] = useState(false);

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

  const handleRegistrySelect = (rj: RivieraJugador) => {
    if (isCreatingPair || linkingLegacy) return;
    setRegistryHint(null);

    // Match solo por legacy_player_id (riviera → players), nunca por nombre.
    const pl = findPoolPlayerByLegacyId(players, rj.legacy_player_id);

    if (pl) {
      handlePlayerSelect(pl);
      setRegistrySearch("");
      return;
    }

    if (!organizadorId) {
      setRegistryHint("Inicia sesión para vincular jugadores al pool de retas.");
      return;
    }

    const needsNewLegacyLink = !rj.legacy_player_id?.trim();
    const rivieraLabel = rj.riviera_id?.trim() || rj.id;

    if (needsNewLegacyLink) {
      const ok = window.confirm(
        `¿Vincular a ${rj.nombre} (${rivieraLabel}) al pool de retas de este club?\n\nSe usará su ficha Riviera existente (sin crear identidad nueva).`
      );
      if (!ok) return;
    }

    void (async () => {
      setLinkingLegacy(true);
      try {
        const linked = await linkLegacyOnSelectForReta(organizadorId, rj.id);
        if (onRefreshPlayers) {
          await onRefreshPlayers();
        }
        handlePlayerSelect(linked.player);
        setRegistrySearch("");
        setRegistryHint(
          linked.created
            ? "Agregado al pool de retas."
            : "Jugador ya vinculado — pool actualizado."
        );
      } catch (err) {
        const hint = hintWhenRegistryPlayerMissingFromRetaPool({
          rivieraJugadorId: rj.id,
          legacyPlayerId: rj.legacy_player_id,
          isGranted: isGrantedJugadorRow(rj),
        });
        setRegistryHint(
          err instanceof Error ? err.message : hint.message
        );
      } finally {
        setLinkingLegacy(false);
      }
    })();
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
        <div className="elegant-header-content">
          <div className="elegant-header-title">
            <h3>Jugadores</h3>
            <div className="elegant-player-count">{players.length}</div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {isCreatingPair ? (
              <span className="elegant-form-hint" role="status">
                Creando pareja…
              </span>
            ) : null}
            {onRefreshPlayers ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={() => void onRefreshPlayers()}
              >
                Actualizar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigateJugadoresLista("M")}
            >
              Ir al registro
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="elegant-form-hint" role="alert">
          {error}
        </p>
      ) : null}

      {organizadorId ? (
        <div className="elegant-create-form">
          <div className="elegant-form-header">
            <h4>Buscar en el registro</h4>
            <p>
              Solo puedes elegir jugadores ya registrados. Para dar de alta a
              alguien nuevo, usa «Registro de jugadores» en el dashboard.
            </p>
          </div>
          <JugadorAutocomplete
            organizadorId={organizadorId}
            value={registrySearch}
            onChange={setRegistrySearch}
            onSelect={handleRegistrySelect}
            placeholder="Buscar jugador registrado…"
          />
          {linkingLegacy ? (
            <p className="elegant-form-hint" role="status">
              Vinculando al pool de retas…
            </p>
          ) : null}
          {registryHint ? (
            <p className="elegant-form-hint" role="status">
              {registryHint}{" "}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => navigateJugadoresLista("M")}
              >
                Abrir registro
              </Button>
            </p>
          ) : null}
        </div>
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
        <div className="elegant-players-grid">
          {players.map((player) => {
            const isSelected = selectedPlayers.some((p) => p.id === player.id);
            const isInPair = playersInPairs.includes(player.id);
            const isHovered = hoveredPlayer === player.id;

            return (
              <div
                key={player.id}
                className={`elegant-player-card ${
                  isSelected ? "selected" : ""
                } ${isInPair ? "in-pair" : ""} ${isHovered ? "hovered" : ""} ${
                  isCreatingPair ? "disabled" : ""
                }`}
                onClick={() => handlePlayerSelect(player)}
                aria-disabled={isCreatingPair}
                style={
                  isCreatingPair
                    ? { opacity: 0.65, pointerEvents: "none" }
                    : undefined
                }
                onMouseEnter={() => setHoveredPlayer(player.id)}
                onMouseLeave={() => setHoveredPlayer(null)}
              >
                <div className="elegant-card-background"></div>

                <div className="elegant-player-content">
                  <div className="elegant-player-avatar">
                    {player.name.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="elegant-player-info">
                    <span className="elegant-player-name">{player.name}</span>
                    {isInPair && (
                      <span className="elegant-pair-indicator">
                        <span className="elegant-indicator-dot"></span>
                        En pareja
                      </span>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="elegant-selection-indicator">
                    <span className="elegant-check-icon">✓</span>
                  </div>
                )}

                <div className="elegant-particles">
                  <div className="elegant-particle"></div>
                  <div className="elegant-particle"></div>
                  <div className="elegant-particle"></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
