import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TablerIcon } from "../ui/TablerIcon";
import { JugadorAvatar } from "./JugadorAvatar";
import { RivieraIdBadge } from "./RivieraIdBadge";
import { ParticipacionesDetalleOverlay } from "./ParticipacionesDetalleOverlay";
import {
  currentYearMonthMexico,
  formatYearMonthLong,
  isFutureYearMonth,
  isSameYearMonth,
  listRankingParticipacionesMensual,
  shiftYearMonth,
  type ParticipacionRankingRow,
  type YearMonth,
} from "../../lib/rivieraJugadores/participacionesMensuales";
import { subscribeRivieraRanking } from "../../lib/rivieraJugadores/subscribeRivieraRanking";
import { RIVIERA_RANKING_PUBLIC_POLL_INTERVAL_MS } from "../../lib/rivieraJugadores/publicPoll";
import { useVisiblePolling } from "../../hooks/useVisiblePolling";
import type { RivieraJugadorCategoria } from "../../lib/rivieraJugadores/types";
import type { RivieraJugadorGenero } from "../../lib/rivieraJugadores/genero";
import "./riviera-jugadores-public-participaciones.css";

interface JugadoresPublicParticipacionesProps {
  organizadorId: string | null;
  genero: RivieraJugadorGenero;
  categoria: RivieraJugadorCategoria;
}

/** Oro/plata/bronce son semánticos (top 1/2/3 real), nunca branding del club. */
function medalModifierClass(posicionCompetitiva: number): string {
  if (posicionCompetitiva === 1) return " rjp-part-card--gold";
  if (posicionCompetitiva === 2) return " rjp-part-card--silver";
  if (posicionCompetitiva === 3) return " rjp-part-card--bronze";
  return "";
}

function ParticipacionesSkeleton() {
  return (
    <div className="rjp-part-skeleton" aria-hidden>
      <div className="rjp-sk rjp-sk--chip" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="rjp-sk rjp-sk--row" />
      ))}
    </div>
  );
}

export const JugadoresPublicParticipaciones: React.FC<
  JugadoresPublicParticipacionesProps
> = ({ organizadorId, genero, categoria }) => {
  const [ym, setYm] = useState<YearMonth>(() => currentYearMonthMexico());
  const [rows, setRows] = useState<ParticipacionRankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ParticipacionRankingRow | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!organizadorId) {
        setRows([]);
        if (!silent) setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      setError(null);
      try {
        const data = await listRankingParticipacionesMensual(
          organizadorId,
          ym,
          categoria,
          genero
        );
        if (data === null) {
          setError("No se pudo cargar Participaciones. Intenta de nuevo.");
          return;
        }
        setRows(data);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [organizadorId, ym, categoria, genero]
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void loadRef.current();
  }, [load]);

  useEffect(() => {
    if (!organizadorId) return;
    return subscribeRivieraRanking(organizadorId, () => {
      void loadRef.current({ silent: true });
    });
  }, [organizadorId]);

  useVisiblePolling({
    callback: () => loadRef.current({ silent: true }),
    intervalMs: RIVIERA_RANKING_PUBLIC_POLL_INTERVAL_MS,
    enabled: Boolean(organizadorId),
    runImmediately: false,
  });

  useEffect(() => {
    setSelected(null);
  }, [ym, categoria, genero]);

  const now = useMemo(() => currentYearMonthMexico(), []);
  const isCurrentMonth = isSameYearMonth(ym, now);
  const prevYm = useMemo(() => shiftYearMonth(ym, -1), [ym]);
  const nextYm = useMemo(() => shiftYearMonth(ym, 1), [ym]);
  const nextDisabled = isFutureYearMonth(nextYm, now);

  return (
    <div className="rjp-part">
      <div className="rjp-part-monthnav" aria-label="Navegación de mes">
        <button
          type="button"
          className="rjp-part-monthnav__btn"
          onClick={() => setYm(prevYm)}
          aria-label={`Ver ${formatYearMonthLong(prevYm)}`}
        >
          <TablerIcon name="chevron-left" size={18} />
          <span className="rjp-part-monthnav__btn-label">
            {formatYearMonthLong(prevYm)}
          </span>
        </button>

        <span className="rjp-part-monthnav__current" aria-live="polite">
          {formatYearMonthLong(ym)}
          {isCurrentMonth ? (
            <span className="rjp-part-monthnav__badge">En curso</span>
          ) : null}
        </span>

        <button
          type="button"
          className="rjp-part-monthnav__btn"
          onClick={() => setYm(nextYm)}
          disabled={nextDisabled}
          aria-label={
            nextDisabled ? "No hay mes siguiente" : `Ver ${formatYearMonthLong(nextYm)}`
          }
        >
          <span className="rjp-part-monthnav__btn-label">
            {formatYearMonthLong(nextYm)}
          </span>
          <TablerIcon name="chevron-right" size={18} />
        </button>
      </div>

      {loading && rows.length === 0 ? <ParticipacionesSkeleton /> : null}

      {error ? (
        <p className="rjp-ranking-empty" role="alert">
          {error}
        </p>
      ) : null}

      {!error && !loading && rows.length === 0 ? (
        <div className="rjp-ranking-empty-state">
          <p className="rjp-ranking-empty-state__title">
            Aún no hay participaciones registradas en {formatYearMonthLong(ym)}
          </p>
          <p className="rjp-ranking-empty-state__hint">
            Las participaciones aparecen automáticamente cuando se cierra un evento
            oficial (Reta, Duelo 2v2, Americano, Torneo Express o jornada de Liga).
          </p>
        </div>
      ) : null}

      {!error && rows.length > 0 ? (
        <ul className={`rjp-part-list${loading ? " is-loading" : ""}`}>
          {rows.map((row) => {
            const personaLabel =
              row.total_participaciones === 1 ? "participación" : "participaciones";
            return (
              <li key={row.jugador_id}>
                <button
                  type="button"
                  className={`rjp-part-card${medalModifierClass(row.posicion_competitiva)}`}
                  onClick={() => setSelected(row)}
                  aria-label={`Ver participaciones de ${row.nombre}, posición ${row.posicion_competitiva}`}
                >
                  <span className="rjp-part-card__rank">
                    {row.posicion_competitiva}º
                  </span>
                  <JugadorAvatar
                    fotoUrl={row.foto_url}
                    nombre={row.nombre}
                    size="md"
                    className="rjp-part-card__avatar"
                  />
                  <div className="rjp-part-card__body">
                    <span className="rjp-part-card__name">{row.nombre}</span>
                    <span className="rjp-part-card__id">
                      <RivieraIdBadge rivieraId={row.riviera_id} embedded />
                    </span>
                  </div>
                  <div className="rjp-part-card__stats">
                    <span className="rjp-part-card__count">
                      {row.total_participaciones} {personaLabel}
                    </span>
                    <span className="rjp-part-card__pts">{row.puntos_mes} pts</span>
                  </div>
                  <TablerIcon
                    name="chevron-right"
                    size={18}
                    className="rjp-part-card__chev"
                    aria-hidden
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {selected && organizadorId ? (
        <ParticipacionesDetalleOverlay
          organizadorId={organizadorId}
          jugador={selected}
          ym={ym}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
};
