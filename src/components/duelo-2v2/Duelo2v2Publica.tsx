import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ClubExperienceScope,
  ClubIdentity,
  useClubExperience,
  useOrganizerDisplayName,
} from "../../club-experience";
import { isPubDsV2Enabled } from "../../config/peds";
import { fetchRivieraJugadorProfilesByIds } from "../../lib/rivieraJugadores/publicPlayerAvatars";
import { fetchDuelo2v2RatingBySlot } from "../../lib/duelo2v2/duelo2v2RatingDisplay";
import type { RatingMovimientoPartido } from "../../lib/rivieraJugadores/types";
import { DUELO_2V2_PUBLIC_POLL_INTERVAL_MS } from "../../lib/duelo2v2/publicPoll";
import { getDueloPublicStatus } from "../../lib/duelo2v2/schedule";
import type { Duelo2v2 } from "../../lib/duelo2v2/types";
import { formatPartidoFecha } from "../../lib/torneoExpress/partidoSchedule";
import {
  getDuelo2v2ById,
  parejaLabel,
  subscribeDuelo2v2,
} from "../../services/duelo2v2Service";
import { StatusBadge, type StatusBadgeVariant } from "../platform/StatusBadge";
import { PublicHero } from "../public/peds";
import { Duelo2v2CelebrateSection } from "./Duelo2v2CelebrateSection";
import { Duelo2v2LiveBoard } from "./Duelo2v2LiveBoard";
import { PublicModeShell } from "../platform/PublicModeShell";
import { Duelo2v2PageShell } from "./Duelo2v2PageShell";
import "../../styles/riviera-public-celebrate.css";
import "./duelo2v2-page.css";

interface Duelo2v2PublicaProps {
  dueloId: string;
}

function dueloStatusBadgeVariant(
  tone: NonNullable<ReturnType<typeof getDueloPublicStatus>>["tone"]
): StatusBadgeVariant {
  if (tone === "live") return "live";
  if (tone === "done") return "gold";
  if (tone === "upcoming") return "pending";
  return "muted";
}

interface Duelo2v2PublicHeroProps {
  duelo: Duelo2v2;
  clockNow: Date;
}

const Duelo2v2PublicHero: React.FC<Duelo2v2PublicHeroProps> = ({
  duelo,
  clockNow,
}) => {
  const { isClubBranded } = useClubExperience();
  const organizerName = useOrganizerDisplayName(duelo.organizador_id);
  const status = getDueloPublicStatus(duelo, clockNow);
  const fechaLabel = duelo.programado_en
    ? formatPartidoFecha(duelo.programado_en)
    : undefined;

  return (
    <PublicHero
      logoClub={
        isClubBranded ? (
          <ClubIdentity
            variant="compact"
            showTagline={false}
            logoSurface="dark"
            wordmarkOnly
            className="peds-hero__club-identity"
          />
        ) : undefined
      }
      estado={
        status ? (
          <StatusBadge variant={dueloStatusBadgeVariant(status.tone)}>
            {status.label}
          </StatusBadge>
        ) : undefined
      }
      nombreEvento={duelo.nombre}
      club={organizerName}
      categoria={duelo.descripcion || undefined}
      fecha={fechaLabel}
      meta="Duelo 2 vs 2"
    />
  );
};

async function fetchJugadorProfiles(
  ids: (string | null)[],
  organizadorId?: string | null
): Promise<Map<string, { fotoUrl: string | null; rating: number }>> {
  return fetchRivieraJugadorProfilesByIds(ids, {
    publicOnly: true,
    organizadorId: organizadorId ?? undefined,
  });
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
      ], d.organizador_id);
      setProfiles(profileMap);
      if (d.estado === "finalizado" && d.ganador) {
        setRatingByJugadorId(
          await fetchDuelo2v2RatingBySlot(d.organizador_id, d.id, [
            d.pareja_a_j1_id,
            d.pareja_a_j2_id,
            d.pareja_b_j1_id,
            d.pareja_b_j2_id,
          ])
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

  if (loading) {
    return (
      <ClubExperienceScope organizadorId={null}>
      <Duelo2v2PageShell publicView className="duelo2v2-publica">
        <PublicModeShell className="duelo2v2-public-board">
          <p className="duelo2v2-card__meta rv-muted">Cargando encuentro…</p>
        </PublicModeShell>
      </Duelo2v2PageShell>
      </ClubExperienceScope>
    );
  }

  if (!duelo || error) {
    return (
      <ClubExperienceScope organizadorId={null}>
      <Duelo2v2PageShell publicView className="duelo2v2-publica">
        <PublicModeShell className="duelo2v2-public-board">
          <p className="duelo2v2-error">{error ?? "Duelo no encontrado"}</p>
        </PublicModeShell>
      </Duelo2v2PageShell>
      </ClubExperienceScope>
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
    <ClubExperienceScope organizadorId={duelo.organizador_id}>
    <Duelo2v2PageShell publicView className="duelo2v2-publica">
      <PublicModeShell className="duelo2v2-public-board">
        {isPubDsV2Enabled ? (
          <Duelo2v2PublicHero duelo={duelo} clockNow={clockNow} />
        ) : null}
        <Duelo2v2LiveBoard
          duelo={duelo}
          teamA={[...teamA]}
          teamB={[...teamB]}
          showBrand={!tieneGanador && !isPubDsV2Enabled}
          hidePublicHeader={isPubDsV2Enabled}
          clockNow={clockNow}
        />

        {tieneGanador && duelo.ganador && (
          <Duelo2v2CelebrateSection
            teamAName={teamAName}
            teamBName={teamBName}
            teamA={teamA.map((p) => ({
              name: p.nombre,
              fotoUrl: p.fotoUrl,
              jugadorId: p.id,
              rating: p.rating,
            }))}
            teamB={teamB.map((p) => ({
              name: p.nombre,
              fotoUrl: p.fotoUrl,
              jugadorId: p.id,
              rating: p.rating,
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
      </PublicModeShell>
    </Duelo2v2PageShell>
    </ClubExperienceScope>
  );
};
