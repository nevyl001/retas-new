import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDueloRegistryHint, useOrganizerDisplayName } from "../../club-experience";
import { listRivieraJugadores } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugador } from "../../lib/rivieraJugadores/types";
import {
  JUGADOR_CATEGORIA_LABELS,
  JUGADOR_CATEGORIAS_ORDER,
} from "../../lib/rivieraJugadores/constants";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { JugadorCategoriaBadge } from "../jugadores/JugadorCategoriaBadge";
import { RivieraIdBadge } from "../jugadores/RivieraIdBadge";
import { navigateJugadoresLista } from "../jugadores/jugadoresGeneroNav";
import { Button } from "../ui";
import "../jugadores/riviera-jugadores.css";

export interface DueloPair {
  j1: RivieraJugador;
  j2: RivieraJugador;
}

interface DueloPairBuilderProps {
  organizadorId: string;
  pairA: DueloPair | null;
  pairB: DueloPair | null;
  onPairAChange: (pair: DueloPair | null) => void;
  onPairBChange: (pair: DueloPair | null) => void;
  /** Consola de gestión: arena deportiva + pool oscuro integrado. */
  console?: boolean;
  scoreA?: number;
  scoreB?: number;
}

const PAGE_SIZE = 24;

export function bothPairsReady(
  pairA: DueloPair | null,
  pairB: DueloPair | null
): boolean {
  return Boolean(pairA && pairB);
}

function playerInPairs(
  j: RivieraJugador,
  pairA: DueloPair | null,
  pairB: DueloPair | null
): boolean {
  return Boolean(
    (pairA && (pairA.j1.id === j.id || pairA.j2.id === j.id)) ||
      (pairB && (pairB.j1.id === j.id || pairB.j2.id === j.id))
  );
}

function PairCard({
  label,
  pair,
  emptyHint,
  onClear,
  consoleMode = false,
}: {
  label: string;
  pair: DueloPair | null;
  emptyHint: string;
  onClear: () => void;
  consoleMode?: boolean;
}) {
  const slotClass = [
    "duelo2v2-pair-slot",
    pair ? "duelo2v2-pair-slot--filled" : "duelo2v2-pair-slot--empty",
    consoleMode ? "duelo2v2-pair-slot--console" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (!pair) {
    return (
      <div className={slotClass}>
        <span className="duelo2v2-pair-slot__label">{label}</span>
        <p className="duelo2v2-pair-slot__hint">
          {consoleMode ? "+ Seleccionar pareja" : emptyHint}
        </p>
      </div>
    );
  }

  return (
    <div className={slotClass}>
      <div className="duelo2v2-pair-slot__head">
        <span className="duelo2v2-pair-slot__label">{label}</span>
        <button
          type="button"
          className="duelo2v2-pair-slot__clear"
          onClick={onClear}
        >
          Quitar
        </button>
      </div>
      <div className="duelo2v2-pair-slot__players">
        {[pair.j1, pair.j2].map((j) => (
          <div key={j.id} className="duelo2v2-pair-slot__player">
            <JugadorAvatar
              fotoUrl={j.foto_url}
              nombre={j.nombre}
              size={consoleMode ? "md" : "lg"}
            />
            {consoleMode ? (
              <div className="duelo2v2-pair-slot__player-meta">
                <span className="duelo2v2-pair-slot__player-name">{j.nombre}</span>
                {j.categoria ? (
                  <span className="duelo2v2-pair-slot__player-cat">
                    {JUGADOR_CATEGORIA_LABELS[j.categoria] ?? j.categoria}
                  </span>
                ) : null}
              </div>
            ) : (
              <span>{j.nombre}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Selector de parejas: mismo grid elegante que Round Robin / Americano
 * (`elegant-player-card`), con carga rápida (`skipCareerEnrich`).
 */
export const DueloPairBuilder: React.FC<DueloPairBuilderProps> = ({
  organizadorId,
  pairA,
  pairB,
  onPairAChange,
  onPairBChange,
  console: consoleMode = false,
  scoreA = 0,
  scoreB = 0,
}) => {
  const organizerName = useOrganizerDisplayName(organizadorId);
  const [jugadores, setJugadores] = useState<RivieraJugador[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<RivieraJugador[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selectionBarRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Mismo path ligero que el pool de RR/Americano: sin career enrich.
      const rows = await listRivieraJugadores(organizadorId, {
        skipCareerEnrich: true,
      });
      setJugadores(rows);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron cargar jugadores"
      );
    } finally {
      setLoading(false);
    }
  }, [organizadorId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filter, categoryFilter, onlyAvailable]);

  useEffect(() => {
    if (selected.length !== 1) return;
    selectionBarRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selected]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return jugadores.filter((j) => {
      if (q && !j.nombre.toLowerCase().includes(q)) return false;
      if (categoryFilter) {
        const cat = (j.categoria || "").trim();
        if (cat !== categoryFilter) return false;
      }
      if (onlyAvailable && playerInPairs(j, pairA, pairB)) return false;
      return true;
    });
  }, [jugadores, filter, categoryFilter, onlyAvailable, pairA, pairB]);

  const visiblePlayers = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  const nextPairSlot = !pairA ? "a" : !pairB ? "b" : null;
  const pairsComplete = bothPairsReady(pairA, pairB);

  const handleClearPairA = () => {
    onPairAChange(null);
    setSelected([]);
  };

  const handleClearPairB = () => {
    onPairBChange(null);
    setSelected([]);
  };

  const assignPair = useCallback(
    (j1: RivieraJugador, j2: RivieraJugador, slot: "a" | "b") => {
      const pair: DueloPair = { j1, j2 };
      if (slot === "a") onPairAChange(pair);
      else onPairBChange(pair);
      setSelected([]);
    },
    [onPairAChange, onPairBChange]
  );

  const togglePlayer = (j: RivieraJugador) => {
    if (playerInPairs(j, pairA, pairB)) return;
    if (!nextPairSlot) return;

    const isSelected = selected.some((s) => s.id === j.id);
    if (isSelected) {
      setSelected(selected.filter((s) => s.id !== j.id));
      return;
    }
    if (selected.length >= 2) {
      setSelected([j]);
      return;
    }
    const next = [...selected, j];
    if (next.length === 2) {
      assignPair(next[0], next[1], nextPairSlot);
      return;
    }
    setSelected(next);
  };

  const rosterTitle =
    nextPairSlot === "b"
      ? "Selecciona la segunda pareja"
      : "Selecciona la primera pareja";

  return (
    <section
      className={`duelo2v2-pair-builder${
        pairsComplete ? " duelo2v2-pair-builder--complete" : ""
      }${consoleMode ? " duelo2v2-pair-builder--console" : ""}`}
      aria-label="Seleccionar parejas"
      data-pairs-complete={pairsComplete ? "true" : "false"}
    >
      {consoleMode ? (
        <div className="duelo2v2-match-arena">
          <PairCard
            label="Pareja A"
            pair={pairA}
            emptyHint="Selecciona la primera pareja"
            onClear={handleClearPairA}
            consoleMode
          />
          <div className="duelo2v2-match-arena__center" aria-hidden>
            <span className="duelo2v2-match-arena__vs">VS</span>
            <div className="duelo2v2-match-arena__score">
              <span>{scoreA}</span>
              <span className="duelo2v2-match-arena__score-sep">:</span>
              <span>{scoreB}</span>
            </div>
          </div>
          <PairCard
            label="Pareja B"
            pair={pairB}
            emptyHint="Selecciona la segunda pareja"
            onClear={handleClearPairB}
            consoleMode
          />
        </div>
      ) : (
        <div className="duelo2v2-pairs-row">
          <PairCard
            label="Pareja 1"
            pair={pairA}
            emptyHint="Selecciona la primera pareja"
            onClear={handleClearPairA}
          />
          <div className="duelo2v2-vs duelo2v2-vs--large">VS</div>
          <PairCard
            label="Pareja 2"
            pair={pairB}
            emptyHint="Selecciona la segunda pareja"
            onClear={handleClearPairB}
          />
        </div>
      )}

      {pairsComplete ? null : (
        <div className="duelo2v2-roster">
          <div className="duelo2v2-roster__head">
            <div>
              <h2 className="duelo2v2-roster__title">
                {consoleMode ? "Jugadores disponibles" : rosterTitle}
              </h2>
              {!consoleMode ? (
                <p className="duelo2v2-roster__sub">
                  {getDueloRegistryHint(organizerName)}
                </p>
              ) : null}
            </div>
            {consoleMode ? (
              <span className="duelo2v2-roster__count">
                {jugadores.length} jugador{jugadores.length === 1 ? "" : "es"}
              </span>
            ) : selected.length > 0 ? (
              <span className="duelo2v2-roster__sel">
                {selected.length}/2 seleccionados
              </span>
            ) : null}
          </div>

          <div className="duelo2v2-roster__pool">
          {selected.length === 1 ? (
            <div
              ref={selectionBarRef}
              className="duelo2v2-roster__selection-bar"
              role="status"
              aria-live="polite"
            >
              <p className="duelo2v2-roster__selection-preview">
                Seleccionado: <strong>{selected[0].nombre}</strong> — elige el
                segundo jugador
              </p>
              <div className="duelo2v2-roster__selection-actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected([])}
                >
                  Limpiar
                </Button>
              </div>
            </div>
          ) : null}

          {loading && (
            <p className="elegant-form-hint">Cargando jugadores…</p>
          )}
          {error && <p className="duelo2v2-error">{error}</p>}

          {!loading && jugadores.length === 0 && (
            <div className="elegant-empty-state">
              <h4>No hay jugadores en tu registro</h4>
              <p>{getDueloRegistryHint(organizerName)}</p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => navigateJugadoresLista("M")}
              >
                Ir al registro
              </Button>
            </div>
          )}

          {!loading && jugadores.length > 0 && (
            <>
              <div className="elegant-grid-filters">
                <input
                  type="search"
                  className="elegant-grid-search"
                  placeholder="Buscar jugador por nombre…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
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

              {filtered.length === 0 ? (
                <p className="elegant-form-hint">
                  Ningún jugador coincide con la búsqueda o los filtros.
                </p>
              ) : (
                <div className="elegant-players-grid" role="list">
                  {visiblePlayers.map((j) => {
                    const inPair = playerInPairs(j, pairA, pairB);
                    const isSelected = selected.some((s) => s.id === j.id);
                    const fotoUrl =
                      typeof j.foto_url === "string" && j.foto_url.trim()
                        ? j.foto_url.trim()
                        : null;
                    const rivieraId =
                      typeof j.riviera_id === "string" && j.riviera_id.trim()
                        ? j.riviera_id.trim()
                        : null;
                    const statusLabel = inPair
                      ? "Pareja asignada"
                      : isSelected
                        ? "Seleccionado"
                        : "Disponible";

                    return (
                      <div key={j.id} role="listitem">
                        <button
                          type="button"
                          className={`elegant-player-card${
                            fotoUrl ? " elegant-player-card--has-photo" : ""
                          }${isSelected ? " selected" : ""}${
                            inPair ? " in-pair" : ""
                          }`}
                          onClick={() => !inPair && togglePlayer(j)}
                          disabled={inPair}
                          aria-pressed={isSelected || inPair}
                          aria-label={`${j.nombre} — ${statusLabel}`}
                        >
                          {fotoUrl ? (
                            <>
                              <span
                                className="elegant-player-card__photo"
                                style={{
                                  backgroundImage: `url(${fotoUrl})`,
                                }}
                                aria-hidden
                              />
                              <span
                                className="elegant-player-card__overlay"
                                aria-hidden
                              />
                            </>
                          ) : null}
                          <span className="elegant-player-info">
                            <span
                              className="elegant-player-name"
                              title={j.nombre}
                            >
                              {j.nombre}
                            </span>
                            <span className="elegant-player-meta">
                              {j.categoria ? (
                                <JugadorCategoriaBadge
                                  categoria={j.categoria}
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
                          {isSelected || inPair ? (
                            <span
                              className={`elegant-player-mark${
                                inPair && !isSelected
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

              {filtered.length > visibleCount ? (
                <div className="elegant-load-more">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                  >
                    Mostrar más jugadores · {filtered.length - visibleCount}{" "}
                    restantes
                  </Button>
                </div>
              ) : null}
            </>
          )}
          </div>
        </div>
      )}
    </section>
  );
};
