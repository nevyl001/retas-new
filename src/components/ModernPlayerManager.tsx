import React, { useState, useEffect, useCallback, useMemo } from "react";
import { getPlayers, type Player } from "../lib/database";
import { useUser } from "../contexts/UserContext";
import { ensureLegacyPlayerForRivieraJugador } from "../lib/rivieraJugadores/playerPoolSync";
import type { RivieraJugador } from "../lib/rivieraJugadores/types";
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
  tournamentId?: string;
}

export const ModernPlayerManager: React.FC<ModernPlayerManagerProps> = ({
  onPlayerSelect,
  selectedPlayers = [],
  allowMultipleSelection = false,
  playersInPairs = [],
  userId,
  tournamentId,
}) => {
  const { user } = useUser();
  const organizadorId = userId ?? user?.id;
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [registrySearch, setRegistrySearch] = useState("");
  const [hoveredPlayer, setHoveredPlayer] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const loadPlayers = useCallback(async () => {
    if (!organizadorId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await getPlayers(organizadorId, tournamentId);
      setPlayers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [organizadorId, tournamentId]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  const emptyHint = useMemo(
    () =>
      organizadorId
        ? "Registra jugadores en el registro Riviera Open para usarlos aquí."
        : "Inicia sesión para cargar el registro de jugadores",
    [organizadorId]
  );

  const handlePlayerSelect = (player: Player) => {
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

  const handleRegistrySelect = async (rj: RivieraJugador) => {
    if (!organizadorId) return;
    setLinking(true);
    try {
      const existing = players.find((p) => p.id === rj.legacy_player_id);
      const pl =
        existing ??
        (await ensureLegacyPlayerForRivieraJugador(organizadorId, rj));
      if (pl) {
        await loadPlayers();
        handlePlayerSelect(pl);
        setRegistrySearch("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
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

      {organizadorId ? (
        <div className="elegant-create-form">
          <div className="elegant-form-header">
            <h4>Buscar en el registro</h4>
            <p>Selecciona un jugador ya registrado para usarlo en esta reta.</p>
          </div>
          <JugadorAutocomplete
            organizadorId={organizadorId}
            value={registrySearch}
            onChange={setRegistrySearch}
            onSelect={(rj) => void handleRegistrySelect(rj)}
            placeholder="Buscar en registro Riviera…"
          />
          {linking ? (
            <p className="elegant-form-hint">Enlazando jugador…</p>
          ) : null}
        </div>
      ) : null}

      {players.length === 0 ? (
        <div className="elegant-empty-state">
          <h4>No hay jugadores</h4>
          <p>{emptyHint}</p>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => navigateJugadoresLista("M")}
          >
            Registrar jugadores
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
                } ${isInPair ? "in-pair" : ""} ${isHovered ? "hovered" : ""}`}
                onClick={() => handlePlayerSelect(player)}
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
