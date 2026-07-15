/**
 * Logs temporales de auditoría — contrato puntos ranking.
 * Solo activos con REACT_APP_RANKING_POINTS_AUDIT=true (nunca en prod por defecto).
 */
import type { CareerPointsByClubResult } from "./careerPointsByClub";
import type { CareerPointsBreakdownView, PlayerPointsBreakdown } from "./playerPointsBreakdown";
import type { JugadorPuntosBreakdownLine } from "./jugadorPuntosBreakdown";
import type { RivieraJugadorWithStats } from "./types";

const HACKPADEL = "e724de97-3552-4a01-a269-f621e6f1ed26";
const RIVIERA_OPEN = "2770b522-9064-4c7b-a729-4a0ea7e3f6e8";

const AUDIT_SLUGS = new Set(["daniel-n"]);
const AUDIT_RIVIERA_IDS = new Set(["RIV-00000009"]);
const AUDIT_NAMES = new Set(["daniel n"]);

/** Evita spam del mismo layer+jugador en re-renders o polls cercanos. */
const AUDIT_DEDUPE_MS = 10_000;
const recentAuditKeys = new Map<string, number>();

export type RankingPointsAuditSnapshot = {
  clubPoints: number;
  rivieraPoints: number;
  totalPoints: number;
};

function isAuditTarget(jugador: {
  nombre?: string | null;
  slug?: string | null;
  riviera_id?: string | null;
}): boolean {
  const slug = jugador.slug?.trim().toLowerCase();
  if (slug && AUDIT_SLUGS.has(slug)) return true;
  const rivieraId = jugador.riviera_id?.trim().toUpperCase();
  if (rivieraId && AUDIT_RIVIERA_IDS.has(rivieraId)) return true;
  const nombre = jugador.nombre?.trim().toLowerCase();
  if (nombre && AUDIT_NAMES.has(nombre)) return true;
  return false;
}

export function isRankingPointsAuditEnabled(): boolean {
  return process.env.REACT_APP_RANKING_POINTS_AUDIT === "true";
}

function shouldLog(): boolean {
  return isRankingPointsAuditEnabled();
}

function shouldEmitAudit(layer: string, jugadorId?: string): boolean {
  const id = jugadorId?.trim();
  if (!id) return true;
  const key = `${layer}:${id}`;
  const now = Date.now();
  const last = recentAuditKeys.get(key);
  if (last != null && now - last < AUDIT_DEDUPE_MS) return false;
  recentAuditKeys.set(key, now);
  return true;
}

/** Solo para tests — limpia dedupe entre casos. */
export function resetRankingPointsAuditDedupeForTests(): void {
  recentAuditKeys.clear();
}

export function snapshotFromCareer(
  career: CareerPointsByClubResult,
  viewingOrganizadorId?: string | null
): RankingPointsAuditSnapshot {
  const viewOrg = viewingOrganizadorId?.trim() || HACKPADEL;
  const clubPoints = career.puntosByOrg.get(viewOrg) ?? 0;
  const rivieraPoints = career.puntosByOrg.get(RIVIERA_OPEN) ?? 0;
  return {
    clubPoints,
    rivieraPoints,
    totalPoints: career.total,
  };
}

export function snapshotFromBreakdown(
  breakdown: CareerPointsBreakdownView | PlayerPointsBreakdown,
  viewingOrganizadorId?: string | null
): RankingPointsAuditSnapshot {
  const viewOrg = viewingOrganizadorId?.trim() || HACKPADEL;
  const rivieraLine = breakdown.pointsByClub.find(
    (c) => c.organizador_id === RIVIERA_OPEN
  );
  const clubLine = breakdown.pointsByClub.find(
    (c) => c.organizador_id === viewOrg
  );
  return {
    clubPoints: clubLine?.points ?? breakdown.currentClubPoints,
    rivieraPoints: rivieraLine?.points ?? 0,
    totalPoints: breakdown.careerTotalAllClubs,
  };
}

export function snapshotFromDisplayLines(
  lines: JugadorPuntosBreakdownLine[],
  viewingOrganizadorId?: string | null
): RankingPointsAuditSnapshot {
  const viewOrg = viewingOrganizadorId?.trim() || HACKPADEL;
  const clubLine = lines.find((l) => l.key === viewOrg);
  const rivieraLine = lines.find((l) => l.key === RIVIERA_OPEN);
  const totalLine = lines.find(
    (l) => l.key === "career-total" || l.key === "total"
  );
  const clubPoints = clubLine?.puntos ?? 0;
  const rivieraPoints = rivieraLine?.puntos ?? 0;
  const totalPoints =
    totalLine?.puntos ?? clubPoints + rivieraPoints;
  return { clubPoints, rivieraPoints, totalPoints };
}

export function logRankingPointsAudit(
  layer: string,
  jugador: {
    id?: string;
    nombre?: string | null;
    slug?: string | null;
    riviera_id?: string | null;
  },
  snapshot: RankingPointsAuditSnapshot,
  extra?: Record<string, unknown>
): void {
  if (!shouldLog() || !isAuditTarget(jugador)) return;
  if (!shouldEmitAudit(layer, jugador.id)) return;

  // Caso excepcional documentado: rankingPointsAudit.test.ts espía
  // específicamente console.info (contrato de test existente, no se toca
  // el test para esta limpieza de logs). No puede convertirse a warn/error
  // sin romper esa aserción.
  // eslint-disable-next-line no-console -- ver rankingPointsAudit.test.ts:25 (spyOn console.info)
  console.info("[ranking-points-audit]", {
    layer,
    jugadorId: jugador.id,
    nombre: jugador.nombre,
    slug: jugador.slug,
    rivieraId: jugador.riviera_id,
    ...snapshot,
    ...extra,
  });
}

export function logRankingPointsAuditFromJugador(
  layer: string,
  jugador: RivieraJugadorWithStats,
  viewingOrganizadorId?: string | null,
  extra?: Record<string, unknown>
): void {
  if (!shouldLog() || !isAuditTarget(jugador)) return;
  if (!shouldEmitAudit(layer, jugador.id)) return;

  const viewOrg = viewingOrganizadorId?.trim() || HACKPADEL;
  const statsTotal = jugador.stats?.puntos_totales ?? null;
  const career = jugador.careerPuntosByClub;
  const breakdown = jugador.pointsBreakdown;

  let snapshot: RankingPointsAuditSnapshot;
  if (breakdown) {
    snapshot = snapshotFromBreakdown(breakdown, viewOrg);
  } else if (career?.length) {
    const puntosByOrg = new Map(
      career.map((c) => [c.organizadorId, c.puntos])
    );
    snapshot = snapshotFromCareer(
      {
        byClub: career,
        total: jugador.careerPuntosTotal ?? 0,
        puntosByOrg,
      },
      viewOrg
    );
  } else {
    snapshot = {
      clubPoints: statsTotal ?? 0,
      rivieraPoints: 0,
      totalPoints: statsTotal ?? 0,
    };
  }

  logRankingPointsAudit(layer, jugador, snapshot, {
    statsPuntosTotales: statsTotal,
    hasCareer: Boolean(career?.length),
    hasPointsBreakdown: Boolean(breakdown),
    careerByClub: career,
    ...extra,
  });
}
