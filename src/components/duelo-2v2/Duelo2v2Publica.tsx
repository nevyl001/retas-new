import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchRivieraJugadorProfilesByIds } from "../../lib/rivieraJugadores/publicPlayerAvatars";
import { fetchRatingMovimientosByPartidoRef } from "../../lib/rivieraJugadores/rivieraJugadoresService";
import type { RatingMovimientoPartido } from "../../lib/rivieraJugadores/types";
import { DUELO_2V2_PUBLIC_POLL_INTERVAL_MS } from "../../lib/duelo2v2/publicPoll";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";
import {
  getDuelo2v2ById,
  parejaLabel,
  subscribeDuelo2v2,
} from "../../services/duelo2v2Service";
import { Duelo2v2CelebrateSection } from "./Duelo2v2CelebrateSection";
import { Duelo2v2LiveBoard } from "./Duelo2v2LiveBoard";
import "../../styles/riviera-public-celebrate.css";
import "./duelo2v2-page.css";

interface Duelo2v2PublicaProps {
  dueloId: string;
}

async function fetchJugadorProfiles(
  ids: (string | null)[]
): Promise<Map<string, { fotoUrl: string | null; rating: number }>> {
  return fetchRivieraJugadorProfilesByIds(ids, { publicOnly: true });
}

export const Duelo2v2Publica: React.FC<Duelo2v2PublicaProps> = ({ dueloId }) => {
  const [duelo, setDuelo] = useState<Duelo2v2 | null>(null);
  const [profiles, setProfiles] = useState<
    Map<string, { fotoUrl: string | null; rating: number }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date());
  const [ratingByJugadorId, setRatingByJugadorId] = useState<
    Record<string, RatingMovimientoPartido>
  >({});
  const [celebrateCompact, setCelebrateCompact] = useState(false);
  const celebrateRef = useRef<HTMLElement>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;
    try {
      const d = await getDuelo2v2ById(dueloId);
      if (!d) {
        setError("Duelo no disponible");
        setDuelo(null);
        return;
      }
      setDuelo(d);
      setError(null);
      setLastRefreshedAt(new Date());
      setClockNow(new Date());
      const profileMap = await fetchJugadorProfiles([
        d.pareja_a_j1_id,
        d.pareja_a_j2_id,
        d.pareja_b_j1_id,
        d.pareja_b_j2_id,
      ]);
      setProfiles(profileMap);
      if (d.estado === "finalizado" && d.ganador) {
        const moves = await fetchRatingMovimientosByPartidoRef(`duelo2v2:${d.id}`);
        setRatingByJugadorId(
          Object.fromEntries(moves.map((m) => [m.jugadorId, m]))
        );
      } else {
        setRatingByJugadorId({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No disponible");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [dueloId]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    void loadRef.current();
  }, [dueloId]);

  useEffect(() => {
    return subscribeDuelo2v2(dueloId, () => {
      void loadRef.current({ silent: true });
    });
  }, [dueloId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void loadRef.current({ silent: true });
    }, DUELO_2V2_PUBLIC_POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [dueloId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setClockNow(new Date());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const updateCompact = () => {
      const el = celebrateRef.current;
      if (!el) {
        setCelebrateCompact(false);
        return;
      }
      const rect = el.getBoundingClientRect();
      setCelebrateCompact(rect.top < 8);
    };

    updateCompact();
    window.addEventListener("scroll", updateCompact, { passive: true });
    window.addEventListener("resize", updateCompact);
    return () => {
      window.removeEventListener("scroll", updateCompact);
      window.removeEventListener("resize", updateCompact);
    };
  }, [duelo?.id, duelo?.ganador]);

  if (loading) {
    return (
      <div className="duelo2v2-page duelo2v2-page--public duelo2v2-publica">
        <div className="duelo2v2-page__inner duelo2v2-page__inner--public">
          <p className="duelo2v2-card__meta">Cargando encuentro…</p>
        </div>
      </div>
    );
  }

  if (!duelo || error) {
    return (
      <div className="duelo2v2-page duelo2v2-page--public duelo2v2-publica">
        <div className="duelo2v2-page__inner duelo2v2-page__inner--public">
          <p className="duelo2v2-error">{error ?? "Duelo no encontrado"}</p>
        </div>
      </div>
    );
  }

  const teamAName = parejaLabel(
    duelo.pareja_a_j1_nombre,
    duelo.pareja_a_j2_nombre
  );
  const teamBName = parejaLabel(
    duelo.pareja_b_j1_nombre,
    duelo.pareja_b_j2_nombre
  );
  const tieneGanador = Boolean(duelo.ganador);
  const finalizado = duelo.estado === "finalizado";

  const profile = (id: string | null) =>
    id ? profiles.get(id) ?? { fotoUrl: null, rating: 3.0 } : { fotoUrl: null, rating: 3.0 };

  const teamA = [
    {
      id: duelo.pareja_a_j1_id,
      nombre: duelo.pareja_a_j1_nombre,
      fotoUrl: profile(duelo.pareja_a_j1_id).fotoUrl,
      rating: profile(duelo.pareja_a_j1_id).rating,
    },
    {
      id: duelo.pareja_a_j2_id,
      nombre: duelo.pareja_a_j2_nombre,
      fotoUrl: profile(duelo.pareja_a_j2_id).fotoUrl,
      rating: profile(duelo.pareja_a_j2_id).rating,
    },
  ] as const;

  const teamB = [
    {
      id: duelo.pareja_b_j1_id,
      nombre: duelo.pareja_b_j1_nombre,
      fotoUrl: profile(duelo.pareja_b_j1_id).fotoUrl,
      rating: profile(duelo.pareja_b_j1_id).rating,
    },
    {
      id: duelo.pareja_b_j2_id,
      nombre: duelo.pareja_b_j2_nombre,
      fotoUrl: profile(duelo.pareja_b_j2_id).fotoUrl,
      rating: profile(duelo.pareja_b_j2_id).rating,
    },
  ] as const;

  return (
    <div className="duelo2v2-page duelo2v2-page--public duelo2v2-publica">
      <div className="duelo2v2-page__inner duelo2v2-page__inner--public">
        <Duelo2v2LiveBoard
          duelo={duelo}
          teamA={[...teamA]}
          teamB={[...teamB]}
          showBrand={!tieneGanador}
          clockNow={clockNow}
        />

        {tieneGanador && duelo.ganador && (
          <Duelo2v2CelebrateSection
            sectionRef={celebrateRef}
            compact={celebrateCompact}
            teamAName={teamAName}
            teamBName={teamBName}
            teamA={teamA.map((p) => ({
              name: p.nombre,
              fotoUrl: p.fotoUrl,
              jugadorId: p.id,
            }))}
            teamB={teamB.map((p) => ({
              name: p.nombre,
              fotoUrl: p.fotoUrl,
              jugadorId: p.id,
            }))}
            ganador={duelo.ganador}
            setsA={duelo.sets_pareja_a}
            setsB={duelo.sets_pareja_b}
            detalle={duelo.detalle_sets}
            torneoNombre={duelo.nombre}
            finalizado={finalizado}
            ratingByJugadorId={ratingByJugadorId}
          />
        )}

        <footer className="duelo2v2-public-sync" aria-live="polite">
          <p className="duelo2v2-public-sync__line">
            Esta página se actualiza automáticamente cada 60 segundos
            {lastRefreshedAt
              ? ` · Última actualización: ${lastRefreshedAt.toLocaleTimeString("es-MX", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}`
              : ""}
          </p>
          <p className="duelo2v2-public-sync__line">Vista pública · solo lectura</p>
        </footer>
      </div>
    </div>
  );
};
