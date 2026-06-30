import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDueloRegistryHint, useOrganizerDisplayName } from "../../club-experience";
import { listRivieraJugadores } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import type { RivieraJugador } from "../../lib/rivieraJugadores/types";
import { JugadorAvatar } from "../jugadores/JugadorAvatar";
import { JugadorCategoriaBadge } from "../jugadores/JugadorCategoriaBadge";
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
}

export function bothPairsReady(
  pairA: DueloPair | null,
  pairB: DueloPair | null
): boolean {
  return Boolean(pairA && pairB);
}

function PairCard({
  label,
  pair,
  onClear,
}: {
  label: string;
  pair: DueloPair | null;
  onClear: () => void;
}) {
  if (!pair) {
    return (
      <div className="duelo2v2-pair-slot duelo2v2-pair-slot--empty">
        <span className="duelo2v2-pair-slot__label">{label}</span>
        <p className="duelo2v2-pair-slot__hint">Selecciona 2 jugadores y agrega la pareja</p>
      </div>
    );
  }

  return (
    <div className="duelo2v2-pair-slot duelo2v2-pair-slot--filled">
      <div className="duelo2v2-pair-slot__head">
        <span className="duelo2v2-pair-slot__label">{label}</span>
        <button type="button" className="duelo2v2-pair-slot__clear" onClick={onClear}>
          Quitar
        </button>
      </div>
      <div className="duelo2v2-pair-slot__players">
        {[pair.j1, pair.j2].map((j) => (
          <div key={j.id} className="duelo2v2-pair-slot__player">
            <JugadorAvatar fotoUrl={j.foto_url} nombre={j.nombre} size="lg" />
            <span>{j.nombre}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const DueloPairBuilder: React.FC<DueloPairBuilderProps> = ({
  organizadorId,
  pairA,
  pairB,
  onPairAChange,
  onPairBChange,
}) => {
  const organizerName = useOrganizerDisplayName(organizadorId);
  const [jugadores, setJugadores] = useState<RivieraJugador[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<RivieraJugador[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selectionBarRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listRivieraJugadores(organizadorId);
      setJugadores(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar jugadores");
    } finally {
      setLoading(false);
    }
  }, [organizadorId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected.length === 0) return;
    selectionBarRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [selected]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return jugadores;
    return jugadores.filter((j) => j.nombre.toLowerCase().includes(q));
  }, [jugadores, filter]);

  const nextPairSlot = !pairA ? "a" : !pairB ? "b" : null;

  const togglePlayer = (j: RivieraJugador) => {
    if (pairA && (pairA.j1.id === j.id || pairA.j2.id === j.id)) return;
    if (pairB && (pairB.j1.id === j.id || pairB.j2.id === j.id)) return;

    const isSelected = selected.some((s) => s.id === j.id);
    if (isSelected) {
      setSelected(selected.filter((s) => s.id !== j.id));
      return;
    }
    if (selected.length >= 2) {
      setSelected([j]);
      return;
    }
    setSelected([...selected, j]);
  };

  const addPair = () => {
    if (selected.length !== 2 || !nextPairSlot) return;
    const [j1, j2] = selected;
    const pair: DueloPair = { j1, j2 };
    if (nextPairSlot === "a") onPairAChange(pair);
    else onPairBChange(pair);
    setSelected([]);
  };

  return (
    <section className="duelo2v2-pair-builder" aria-label="Agregar parejas">
      <div className="duelo2v2-pairs-row">
        <PairCard label="Pareja 1" pair={pairA} onClear={() => onPairAChange(null)} />
        <div className="duelo2v2-vs duelo2v2-vs--large">VS</div>
        <PairCard label="Pareja 2" pair={pairB} onClear={() => onPairBChange(null)} />
      </div>

      <div className="duelo2v2-roster">
        <div className="duelo2v2-roster__head">
          <div>
            <h2 className="duelo2v2-roster__title">Agregar parejas</h2>
            <p className="duelo2v2-roster__sub">
              {getDueloRegistryHint(organizerName)}
            </p>
          </div>
          {selected.length > 0 && (
            <span className="duelo2v2-roster__sel">
              {selected.length}/2 seleccionados
            </span>
          )}
        </div>

        <input
          type="search"
          className="duelo2v2-roster__search"
          placeholder="Filtrar jugadores…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />

        {selected.length > 0 && nextPairSlot ? (
          <div
            ref={selectionBarRef}
            className="duelo2v2-roster__selection-bar"
            role="region"
            aria-label="Confirmar pareja seleccionada"
          >
            <p className="duelo2v2-roster__selection-preview">
              {selected.length === 2 ? (
                <>
                  Pareja: <strong>{selected[0].nombre}</strong> +{" "}
                  <strong>{selected[1].nombre}</strong>
                </>
              ) : (
                <>
                  Seleccionado: <strong>{selected[0].nombre}</strong> — elige el
                  segundo jugador
                </>
              )}
            </p>
            <div className="duelo2v2-roster__selection-actions">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={selected.length !== 2}
                onClick={addPair}
              >
                Agregar pareja {nextPairSlot === "b" ? "2" : "1"}
              </Button>
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

        {loading && <p className="duelo2v2-card__meta">Cargando jugadores…</p>}
        {error && <p className="duelo2v2-error">{error}</p>}

        {!loading && jugadores.length === 0 && (
          <div className="duelo2v2-roster__empty">
            <p>No hay jugadores en tu registro.</p>
            <Button type="button" variant="primary" size="sm" onClick={() => navigateJugadoresLista("M")}>
              Ir al registro
            </Button>
          </div>
        )}

        {!loading && jugadores.length > 0 && (
          <>
            <div className="duelo2v2-players-grid">
              {filtered.map((j) => {
                const inPair = Boolean(
                  (pairA && (pairA.j1.id === j.id || pairA.j2.id === j.id)) ||
                    (pairB && (pairB.j1.id === j.id || pairB.j2.id === j.id))
                );
                const isSelected = selected.some((s) => s.id === j.id);
                return (
                  <button
                    key={j.id}
                    type="button"
                    className={`duelo2v2-player-chip${isSelected ? " duelo2v2-player-chip--selected" : ""}${inPair ? " duelo2v2-player-chip--used" : ""}`}
                    onClick={() => !inPair && togglePlayer(j)}
                    disabled={inPair}
                  >
                    <JugadorAvatar fotoUrl={j.foto_url} nombre={j.nombre} size="md" />
                    <span className="duelo2v2-player-chip__name">{j.nombre}</span>
                    <JugadorCategoriaBadge categoria={j.categoria} />
                    {inPair && <span className="duelo2v2-player-chip__tag">En pareja</span>}
                    {isSelected && <span className="duelo2v2-player-chip__check">✓</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
};
