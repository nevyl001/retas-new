import React, { useCallback, useRef, useState } from "react";
import { Pair } from "../lib/database";
import { TeamBadge } from "./teams/TeamBadge";
import { TablerIcon } from "./ui/TablerIcon";
import {
  getPairTeamIndex,
  getPairTeamName,
  type TeamConfigLike,
} from "../lib/teamConfigDisplay";

interface PairsDisplayProps {
  pairs: Pair[];
  pairStats: Map<string, { sets: number; matches: number; points: number }>;
  teamConfig?: TeamConfigLike | null;
  /** Si se pasa, habilita drag-and-drop de jugadores entre parejas. */
  onSwapPlayers?: (
    pairAId: string,
    slotA: "player1" | "player2",
    pairBId: string,
    slotB: "player1" | "player2"
  ) => Promise<void>;
}

type DragPayload = {
  pairId: string;
  slot: "player1" | "player2";
  playerName: string;
};

function DraggablePlayer({
  pair,
  slot,
  canDrag,
  dragOverSlot,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  pair: Pair;
  slot: "player1" | "player2";
  canDrag: boolean;
  dragOverSlot: boolean;
  onDragStart: (pairId: string, slot: "player1" | "player2") => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, pairId: string, slot: "player1" | "player2") => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, pairId: string, slot: "player1" | "player2") => void;
}) {
  const player = slot === "player1" ? pair.player1 : pair.player2;
  const name = player?.name || (slot === "player1" ? "Jugador 1" : "Jugador 2");

  return (
    <span
      className={[
        "compact-pair-player",
        canDrag ? "compact-pair-player--draggable" : "",
        dragOverSlot ? "compact-pair-player--drag-over" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      draggable={canDrag}
      onDragStart={canDrag ? () => onDragStart(pair.id, slot) : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      onDragOver={canDrag ? (e) => onDragOver(e, pair.id, slot) : undefined}
      onDragLeave={canDrag ? onDragLeave : undefined}
      onDrop={canDrag ? (e) => onDrop(e, pair.id, slot) : undefined}
      title={canDrag ? "Arrastra para intercambiar con otro jugador" : undefined}
    >
      {canDrag ? (
        <span className="compact-pair-player__grip" aria-hidden>⠿</span>
      ) : null}
      {name}
    </span>
  );
}

export const PairsDisplay: React.FC<PairsDisplayProps> = ({
  pairs,
  pairStats,
  teamConfig = null,
  onSwapPlayers,
}) => {
  const canDrag = Boolean(onSwapPlayers);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dragOver, setDragOver] = useState<{ pairId: string; slot: "player1" | "player2" } | null>(null);
  const [swapping, setSwapping] = useState(false);
  const dragRef = useRef<DragPayload | null>(null);

  const handleDragStart = useCallback((pairId: string, slot: "player1" | "player2") => {
    const pair = pairs.find((p) => p.id === pairId);
    if (!pair) return;
    const player = slot === "player1" ? pair.player1 : pair.player2;
    const payload: DragPayload = { pairId, slot, playerName: player?.name || "" };
    dragRef.current = payload;
    setDragging(payload);
  }, [pairs]);

  const handleDragEnd = useCallback(() => {
    dragRef.current = null;
    setDragging(null);
    setDragOver(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, pairId: string, slot: "player1" | "player2") => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const src = dragRef.current;
    if (!src) return;
    if (src.pairId === pairId && src.slot === slot) {
      setDragOver(null);
      return;
    }
    setDragOver({ pairId, slot });
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent, targetPairId: string, targetSlot: "player1" | "player2") => {
      e.preventDefault();
      const src = dragRef.current;
      if (!src || !onSwapPlayers) return;
      if (src.pairId === targetPairId && src.slot === targetSlot) return;

      setSwapping(true);
      try {
        await onSwapPlayers(src.pairId, src.slot, targetPairId, targetSlot);
      } finally {
        setSwapping(false);
        handleDragEnd();
      }
    },
    [onSwapPlayers, handleDragEnd]
  );

  if (pairs.length === 0) return null;

  return (
    <div className={`compact-pairs-manager${swapping ? " compact-pairs-manager--swapping" : ""}`}>
      {/* Header Compacto */}
      <div className="compact-header">
        <div className="compact-header-content">
          <div className="compact-title">
            <span className="compact-icon" aria-hidden>
              <TablerIcon name="users" size={16} />
            </span>
            <h3>Parejas registradas ({pairs.length})</h3>
          </div>
          {canDrag ? (
            <p className="compact-pairs-hint">
              Arrastra un jugador sobre otro para intercambiarlos
            </p>
          ) : null}
        </div>
      </div>

      {/* Grid de Parejas Compacto */}
      <div className="compact-pairs-grid">
        {pairs.map((pair, index) => {
          const teamName = getPairTeamName(pair.id, teamConfig);
          const teamIndex = getPairTeamIndex(pair.id, teamConfig);
          const isDragSource = dragging?.pairId === pair.id;

          return (
            <div
              key={pair.id}
              className={[
                "compact-pair-card ro-surface-dark",
                isDragSource ? "compact-pair-card--drag-source" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Número de Pareja */}
              <div className="compact-pair-number">#{index + 1}</div>

              {/* Información de la Pareja */}
              <div className="compact-pair-info">
                {teamName ? (
                  <TeamBadge
                    name={teamName}
                    teamIndex={teamIndex ?? undefined}
                    className="compact-pair-team"
                  />
                ) : null}
                <div className="compact-pair-names">
                  <DraggablePlayer
                    pair={pair}
                    slot="player1"
                    canDrag={canDrag}
                    dragOverSlot={dragOver?.pairId === pair.id && dragOver?.slot === "player1"}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  />
                  <span className="compact-pair-sep">/</span>
                  <DraggablePlayer
                    pair={pair}
                    slot="player2"
                    canDrag={canDrag}
                    dragOverSlot={dragOver?.pairId === pair.id && dragOver?.slot === "player2"}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  />
                </div>

                {/* Estadísticas Compactas */}
                <div className="compact-stats">
                  <div className="compact-stat">
                    <span className="compact-stat-label">VIC</span>
                    <span className="compact-stat-value">
                      {pairStats.get(pair.id)?.sets || 0}
                    </span>
                  </div>
                  <div className="compact-stat">
                    <span className="compact-stat-label">PJ</span>
                    <span className="compact-stat-value">
                      {pairStats.get(pair.id)?.matches || 0}
                    </span>
                  </div>
                  <div className="compact-stat">
                    <span className="compact-stat-label">PTS</span>
                    <span className="compact-stat-value">
                      {pairStats.get(pair.id)?.points || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Efectos de partículas */}
              <div className="compact-particles">
                <div className="compact-particle"></div>
                <div className="compact-particle"></div>
                <div className="compact-particle"></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PairsDisplay;
