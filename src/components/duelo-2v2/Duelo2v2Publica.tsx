import React, { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
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

async function fetchJugadorFotos(
  ids: (string | null)[]
): Promise<Map<string, string | null>> {
  const valid = ids.filter((id): id is string => Boolean(id));
  if (valid.length === 0) return new Map();

  const { data } = await supabase
    .from("riviera_jugadores")
    .select("id, foto_url")
    .in("id", valid);

  const map = new Map<string, string | null>();
  for (const row of data ?? []) {
    map.set(String(row.id), row.foto_url ? String(row.foto_url) : null);
  }
  return map;
}

export const Duelo2v2Publica: React.FC<Duelo2v2PublicaProps> = ({ dueloId }) => {
  const [duelo, setDuelo] = useState<Duelo2v2 | null>(null);
  const [fotos, setFotos] = useState<Map<string, string | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [clockNow, setClockNow] = useState(() => new Date());

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
      const fotoMap = await fetchJugadorFotos([
        d.pareja_a_j1_id,
        d.pareja_a_j2_id,
        d.pareja_b_j1_id,
        d.pareja_b_j2_id,
      ]);
      setFotos(fotoMap);
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

  const foto = (id: string | null) => (id ? fotos.get(id) ?? null : null);

  const teamA = [
    { id: duelo.pareja_a_j1_id, nombre: duelo.pareja_a_j1_nombre, fotoUrl: foto(duelo.pareja_a_j1_id) },
    { id: duelo.pareja_a_j2_id, nombre: duelo.pareja_a_j2_nombre, fotoUrl: foto(duelo.pareja_a_j2_id) },
  ] as const;

  const teamB = [
    { id: duelo.pareja_b_j1_id, nombre: duelo.pareja_b_j1_nombre, fotoUrl: foto(duelo.pareja_b_j1_id) },
    { id: duelo.pareja_b_j2_id, nombre: duelo.pareja_b_j2_nombre, fotoUrl: foto(duelo.pareja_b_j2_id) },
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
            teamAName={teamAName}
            teamBName={teamBName}
            teamA={teamA.map((p) => ({ name: p.nombre, fotoUrl: p.fotoUrl }))}
            teamB={teamB.map((p) => ({ name: p.nombre, fotoUrl: p.fotoUrl }))}
            ganador={duelo.ganador}
            setsA={duelo.sets_pareja_a}
            setsB={duelo.sets_pareja_b}
            detalle={duelo.detalle_sets}
            torneoNombre={duelo.nombre}
            finalizado={finalizado}
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
