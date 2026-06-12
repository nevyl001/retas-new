import { crucesPrimeraRonda, grupoBadgeLabel } from "./bracket";
import { deserializeBracketSlots } from "./bracketPersistence";
import {
  isFinaleEliminatoriaStage,
  isRondaTercerLugar,
  labelRondaEliminatoria,
  maxRondaActual,
  partidosDeRonda,
  RONDA_TERCER_LUGAR,
  totalRondasEliminatoria,
} from "./bracketRounds";
import { parejaLabelFromMap } from "./eliminatoriaLabels";
import { getPartidoSets, matchWinnerSideFromPartido } from "./partidoSets";
import type { BracketQualifier } from "./bracketTypes";
import type {
  PartidoSetScore,
  TorneoExpressBundle,
  TorneoExpressEliminatoriaPartido,
  TorneoExpressFaseEliminacion,
} from "./types";

export type PublicMatchStatus = "pending" | "live" | "finished" | "bye";

export interface PublicBracketTeam {
  parejaId: string | null;
  label: string;
  seed: number | null;
  originBadge: string | null;
  isBye: boolean;
  isWinner: boolean;
  score: number | null;
}

export interface PublicMatchupCard {
  id: string;
  ronda: number;
  cruceIndex: number;
  roundLabel: string;
  matchTitle: string;
  local: PublicBracketTeam;
  visit: PublicBracketTeam;
  status: PublicMatchStatus;
  horaDisplay: string;
  scheduleMs: number | null;
  puntosLocal: number | null;
  puntosVisitante: number | null;
  sets: PartidoSetScore[];
  /** Cancha asignada; null si no hay. */
  canchaLabel: string | null;
}

export interface PublicFinalistEntry {
  label: string;
  parejaId: string | null;
}

export interface PublicBracketViewModel {
  championLabel: string | null;
  /** Semis completas y final pendiente — tarjeta de felicitación a finalistas. */
  finalistsCelebrate: { finalists: PublicFinalistEntry[] } | null;
  /** Ganador del partido por el 3.er lugar (pareja). */
  thirdPlaceCelebrate: { label: string } | null;
  /** Tarjeta del juego por el bronce (si ya está creado). */
  thirdPlaceCard: PublicMatchupCard | null;
  currentPhaseUpper: string;
  motivationalMessage: string;
  hasLiveMatch: boolean;
  activeRonda: number;
  /** Enfrentamientos de la ronda activa (tarjetas principales). */
  currentRoundCards: PublicMatchupCard[];
  /** Solo rondas futuras (ej. final cuando aún están las semis). */
  futureRoundCards: PublicMatchupCard[];
  /** Todas las rondas para el bracket visual. */
  allBracketCards: PublicMatchupCard[];
  totalRondas: number;
}

const STATUS_RANK: Record<PublicMatchStatus, number> = {
  bye: 0,
  pending: 1,
  live: 2,
  finished: 3,
};

function buildQualifierMap(
  slots: ReturnType<typeof deserializeBracketSlots>
): Map<string, BracketQualifier> {
  const map = new Map<string, BracketQualifier>();
  slots.forEach((s) => {
    if (s.type === "team") map.set(s.qualifier.parejaId, s.qualifier);
  });
  return map;
}

function originBadgeFor(q: BracketQualifier | undefined): string | null {
  if (!q) return null;
  if (q.posEnGrupo === 3 || q.isMejorTercero) return grupoBadgeLabel(q);
  return null;
}

function teamRow(
  parejaId: string | null,
  label: string,
  opts: {
    qualifier?: BracketQualifier;
    isBye?: boolean;
    isWinner?: boolean;
    score?: number | null;
  }
): PublicBracketTeam {
  const q = opts.qualifier;
  return {
    parejaId,
    label: opts.isBye ? "BYE" : label,
    seed: q?.seed ?? null,
    originBadge: opts.isBye ? null : originBadgeFor(q),
    isBye: Boolean(opts.isBye),
    isWinner: Boolean(opts.isWinner),
    score: opts.score ?? null,
  };
}

function scheduleIsoFromPartido(
  p: TorneoExpressEliminatoriaPartido
): string | null {
  return p.programado_en ?? p.created_at ?? null;
}

function scheduleMs(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function formatHora(iso: string | null): string {
  if (!iso) return "Por confirmar";
  try {
    return new Date(iso).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Por confirmar";
  }
}

function rawStatusFromPartido(
  partido: TorneoExpressEliminatoriaPartido | null,
  isBye: boolean
): PublicMatchStatus {
  if (isBye || !partido) return isBye ? "bye" : "pending";
  if (partido.es_bye) return "bye";
  if (partido.estado === "jugado") return "finished";
  return "pending";
}

function buildTeamFromId(
  parejaId: string | null,
  labelMap: Record<string, string>,
  qualifierMap: Map<string, BracketQualifier>,
  isWinner: boolean,
  score: number | null,
  isBye: boolean
): PublicBracketTeam {
  if (isBye || !parejaId) {
    return teamRow(null, "BYE", { isBye: true });
  }
  const q = qualifierMap.get(parejaId);
  return teamRow(parejaId, parejaLabelFromMap(labelMap, parejaId), {
    qualifier: q,
    isWinner,
    score,
  });
}

function teamIsWinner(
  parejaId: string | null,
  side: "local" | "visitante",
  partido: TorneoExpressEliminatoriaPartido | null
): boolean {
  if (!parejaId || !partido || partido.estado !== "jugado") return false;
  const winnerSide = matchWinnerSideFromPartido(partido);
  if (!winnerSide) return partido.ganador_id === parejaId;
  return winnerSide === side;
}

function roundLabelUpper(
  fase: TorneoExpressFaseEliminacion,
  ronda: number,
  totalRondas: number,
  bracketSlotCount?: number
): string {
  const label = labelRondaEliminatoria(
    fase,
    ronda,
    totalRondas,
    bracketSlotCount
  );
  if (label === "Tercer lugar") return "TERCER LUGAR";
  if (label === "Final") return "FINAL";
  if (label === "Semifinal") return "SEMIFINALES";
  if (label === "Cuartos de final") return "CUARTOS DE FINAL";
  if (label === "Octavos de final") return "OCTAVOS DE FINAL";
  return label.toUpperCase();
}

function matchTitle(
  roundLabel: string,
  cruceIndex: number,
  totalInRound: number
): string {
  if (roundLabel === "FINAL") return "FINAL";
  if (roundLabel === "TERCER LUGAR") return "TERCER LUGAR";
  if (totalInRound <= 1) return roundLabel;
  const singular = roundLabel
    .replace(/SEMIFINALES\b/, "SEMIFINAL")
    .replace(/CUARTOS DE FINAL\b/, "CUARTOS")
    .replace(/OCTAVOS DE FINAL\b/, "OCTAVOS");
  return `${singular} ${cruceIndex + 1}`;
}

function winnerLabelFromCard(card: PublicMatchupCard): string | null {
  if (card.local.isWinner) return card.local.label;
  if (card.visit.isWinner) return card.visit.label;
  return null;
}

function winnerPairFromCard(
  card: PublicMatchupCard
): PublicFinalistEntry | null {
  if (card.local.isWinner) {
    return { label: card.local.label, parejaId: card.local.parejaId };
  }
  if (card.visit.isWinner) {
    return { label: card.visit.label, parejaId: card.visit.parejaId };
  }
  return null;
}

function resolveFinalistsCelebrate(
  allCards: PublicMatchupCard[],
  totalRondas: number,
  championLabel: string | null
): { finalists: PublicFinalistEntry[] } | null {
  if (championLabel || totalRondas < 2) return null;

  const semiRound = totalRondas - 1;
  const semiCards = allCards
    .filter((c) => c.ronda === semiRound && c.status !== "bye")
    .sort((a, b) => a.cruceIndex - b.cruceIndex);

  if (semiCards.length === 0) return null;
  if (!semiCards.every((c) => c.status === "finished")) return null;

  const finalists = semiCards
    .map((c) => winnerPairFromCard(c))
    .filter((entry): entry is PublicFinalistEntry => Boolean(entry));

  if (finalists.length < 2) return null;
  return { finalists };
}

function motivationalMessageLegacy(currentPhaseUpper: string): string {
  if (currentPhaseUpper.includes("CAMPEONES")) {
    return "¡Tenemos campeones! Gracias por competir con pasión, esfuerzo y entrega.";
  }
  if (currentPhaseUpper === "FINAL") {
    return "¡La gran final ha llegado. Solo uno puede ganar!";
  }
  if (currentPhaseUpper.includes("SEMIFINAL")) {
    return "¡Felicidades semifinalistas! Den su mejor juego hoy";
  }
  if (currentPhaseUpper.includes("CUARTOS")) {
    return "¡Los mejores 8 se enfrentan. Que gane el mejor!";
  }
  if (currentPhaseUpper.includes("OCTAVOS")) {
    return "¡Octavos de final! Cada punto cuenta.";
  }
  return "¡Que gane el mejor!";
}

function phaseFriendlyLabel(currentPhaseUpper: string): string {
  if (currentPhaseUpper.includes("TERCER")) return "al partido por el tercer lugar";
  if (currentPhaseUpper.includes("SEMIFINAL")) return "semifinalistas";
  if (currentPhaseUpper.includes("CUARTOS")) return "a cuartos de final";
  if (currentPhaseUpper === "FINAL") return "finalistas";
  if (currentPhaseUpper.includes("OCTAVOS")) return "a octavos de final";
  return "";
}

function motivationalMessageForRound(
  currentPhaseUpper: string,
  cards: PublicMatchupCard[],
  context?: {
    allCards: PublicMatchupCard[];
    totalRondas: number;
    championLabel: string | null;
  }
): string {
  if (currentPhaseUpper.includes("CAMPEONES")) {
    return motivationalMessageLegacy(currentPhaseUpper);
  }

  const actionable = cards.filter((c) => c.status !== "bye");
  if (actionable.length === 0 && context) {
    const semiRound = context.totalRondas - 1;
    if (semiRound >= 1 && !context.championLabel) {
      const semiCards = context.allCards.filter(
        (c) => c.ronda === semiRound && c.status !== "bye"
      );
      const semisDone =
        semiCards.length > 0 &&
        semiCards.every((c) => c.status === "finished");
      if (semisDone) {
        return "¡Felicidades finalistas! La gran final está por llegar 🏆";
      }
    }
    return motivationalMessageLegacy(currentPhaseUpper);
  }

  if (actionable.length === 0) {
    return motivationalMessageLegacy(currentPhaseUpper);
  }

  const allFinished = actionable.every((c) => c.status === "finished");
  const hasLive = actionable.some((c) => c.status === "live");
  const allPending = actionable.every((c) => c.status === "pending");

  if (allFinished) {
    if (context && !context.championLabel) {
      const semiRound = context.totalRondas - 1;
      const semiCards = context.allCards.filter(
        (c) => c.ronda === semiRound && c.status !== "bye"
      );
      const semisDone =
        semiRound >= 1 &&
        semiCards.length > 0 &&
        semiCards.every((c) => c.status === "finished");
      const inSemiPhase = currentPhaseUpper.includes("SEMIFINAL");

      if (semisDone && (inSemiPhase || actionable.every((c) => c.ronda === semiRound))) {
        return "¡Felicidades finalistas! La gran final está por llegar 🏆";
      }

      if (currentPhaseUpper === "FINAL") {
        return "¡Felicidades finalistas! Den lo mejor en la gran final";
      }
      if (currentPhaseUpper.includes("FINAL Y TERCER")) {
        return "¡Gran final y partido por el bronce! Den lo mejor en la cancha 🏆🥉";
      }
    }

    return "¡Increíbles partidos! Nos vemos en la siguiente ronda 🏆";
  }
  if (hasLive) {
    return "¡Partidos en curso! Sigan dando todo";
  }
  if (allPending) {
    const phase = phaseFriendlyLabel(currentPhaseUpper);
    if (phase) return `¡Felicidades ${phase}! Den su mejor juego hoy`;
    return "¡Felicidades! Den su mejor juego hoy";
  }

  return motivationalMessageLegacy(currentPhaseUpper);
}

function canchaFromPartido(
  partido: TorneoExpressEliminatoriaPartido | null
): string | null {
  const raw = partido?.cancha?.trim();
  if (!raw || raw.toLowerCase() === "por asignar") return null;
  return raw;
}

function activeRondaFromPartidos(
  partidos: TorneoExpressEliminatoriaPartido[],
  totalRondas: number
): number {
  if (isFinaleEliminatoriaStage(partidos, totalRondas)) {
    return totalRondas;
  }

  for (let r = 1; r <= totalRondas; r++) {
    const round = partidosDeRonda(partidos, r);
    if (round.some((p) => !p.es_bye && p.estado === "pendiente")) return r;
  }
  return Math.max(
    maxRondaActual(partidos.filter((p) => !isRondaTercerLugar(p.ronda))),
    1
  );
}

function clusterByScheduleTime(
  cards: PublicMatchupCard[],
  windowMs: number
): PublicMatchupCard[][] {
  const sorted = [...cards].sort((a, b) => {
    const ta = a.scheduleMs ?? 0;
    const tb = b.scheduleMs ?? 0;
    return ta - tb;
  });

  const clusters: PublicMatchupCard[][] = [];
  for (const card of sorted) {
    const t = card.scheduleMs;
    const last = clusters[clusters.length - 1];
    if (!last || last.length === 0) {
      clusters.push([card]);
      continue;
    }
    const ref = last[0].scheduleMs;
    if (
      t === null ||
      ref === null ||
      Math.abs(t - ref) >= windowMs
    ) {
      clusters.push([card]);
    } else {
      last.push(card);
    }
  }
  return clusters;
}

/** Partidos a la misma hora comparten el estado más avanzado del grupo. */
function harmonizeSimultaneousStatuses(cards: PublicMatchupCard[]): void {
  const clusters = clusterByScheduleTime(
    cards.filter((c) => c.status !== "bye"),
    60_000
  );

  clusters.forEach((cluster) => {
    if (cluster.length < 2) return;
    let best: PublicMatchStatus = "pending";
    cluster.forEach((c) => {
      if (STATUS_RANK[c.status] > STATUS_RANK[best]) best = c.status;
    });
    cluster.forEach((c) => {
      c.status = best;
    });
  });
}

/** El bloque pendiente más próximo en la ronda activa se marca EN JUEGO. */
function markLiveBatch(cards: PublicMatchupCard[]): void {
  const pending = cards.filter((c) => c.status === "pending");
  if (pending.length === 0) return;

  const withTime = pending.filter((c) => c.scheduleMs != null);
  if (withTime.length === 0) {
    pending.forEach((c) => {
      c.status = "live";
    });
    return;
  }

  const minTime = Math.min(
    ...withTime.map((c) => c.scheduleMs as number)
  );

  pending.forEach((c) => {
    if (c.scheduleMs == null) {
      c.status = "live";
      return;
    }
    if (Math.abs(c.scheduleMs - minTime) < 60_000) {
      c.status = "live";
    }
  });
}

function buildRoundOneCards(
  fase: TorneoExpressFaseEliminacion,
  ronda: number,
  totalRondas: number,
  partidos: TorneoExpressEliminatoriaPartido[],
  slots: ReturnType<typeof deserializeBracketSlots>,
  labelMap: Record<string, string>,
  qualifierMap: Map<string, BracketQualifier>,
  bracketSlotCount?: number
): PublicMatchupCard[] {
  const cruces = crucesPrimeraRonda(slots);
  const roundLabel = labelRondaEliminatoria(
    fase,
    ronda,
    totalRondas,
    bracketSlotCount
  );

  return cruces
    .map((c) => {
      const partido =
        partidos.find(
          (p) => p.ronda === ronda && p.cruce_index === c.cruceIndex
        ) ?? null;

      const localBye = c.local === null && c.visitante !== null;
      const visitBye = c.visitante === null && c.local !== null;
      const fullBye = c.esBye && !c.local && !c.visitante;

      if (fullBye) return null;

      const iso = partido ? scheduleIsoFromPartido(partido) : null;

      return {
        id: partido?.id ?? `r${ronda}-${c.cruceIndex}`,
        ronda,
        cruceIndex: c.cruceIndex,
        roundLabel,
        matchTitle: matchTitle(
          roundLabelUpper(fase, ronda, totalRondas, bracketSlotCount),
          c.cruceIndex,
          cruces.length
        ),
        local: buildTeamFromId(
          partido?.pareja_local_id ?? c.local?.parejaId ?? null,
          labelMap,
          qualifierMap,
          teamIsWinner(
            partido?.pareja_local_id ?? c.local?.parejaId ?? null,
            "local",
            partido
          ),
          partido?.puntos_local ?? null,
          localBye
        ),
        visit: buildTeamFromId(
          partido?.pareja_visitante_id ?? c.visitante?.parejaId ?? null,
          labelMap,
          qualifierMap,
          teamIsWinner(
            partido?.pareja_visitante_id ?? c.visitante?.parejaId ?? null,
            "visitante",
            partido
          ),
          partido?.puntos_visitante ?? null,
          visitBye
        ),
        status: rawStatusFromPartido(partido, false),
        canchaLabel: canchaFromPartido(partido),
        horaDisplay: formatHora(iso),
        scheduleMs: scheduleMs(iso),
        puntosLocal: partido?.puntos_local ?? null,
        puntosVisitante: partido?.puntos_visitante ?? null,
        sets: partido ? getPartidoSets(partido) : [],
      };
    })
    .filter(Boolean) as PublicMatchupCard[];
}

function buildDbRoundCards(
  fase: TorneoExpressFaseEliminacion,
  ronda: number,
  totalRondas: number,
  partidos: TorneoExpressEliminatoriaPartido[],
  labelMap: Record<string, string>,
  qualifierMap: Map<string, BracketQualifier>,
  bracketSlotCount?: number
): PublicMatchupCard[] {
  const inRound = partidosDeRonda(partidos, ronda);
  const roundLabel = labelRondaEliminatoria(
    fase,
    ronda,
    totalRondas,
    bracketSlotCount
  );

  return inRound
    .filter((p) => !p.es_bye || (p.pareja_local_id && p.pareja_visitante_id))
    .map((p) => {
      const iso = scheduleIsoFromPartido(p);
      return {
        id: p.id,
        ronda,
        cruceIndex: p.cruce_index,
        roundLabel,
        matchTitle: matchTitle(
          roundLabelUpper(fase, ronda, totalRondas, bracketSlotCount),
          p.cruce_index,
          inRound.length
        ),
        local: buildTeamFromId(
          p.pareja_local_id,
          labelMap,
          qualifierMap,
          teamIsWinner(p.pareja_local_id, "local", p),
          p.puntos_local,
          p.es_bye && !p.pareja_local_id
        ),
        visit: buildTeamFromId(
          p.pareja_visitante_id,
          labelMap,
          qualifierMap,
          teamIsWinner(p.pareja_visitante_id, "visitante", p),
          p.puntos_visitante,
          p.es_bye && !p.pareja_visitante_id
        ),
        status: rawStatusFromPartido(p, p.es_bye),
        canchaLabel: canchaFromPartido(p),
        horaDisplay: formatHora(iso),
        scheduleMs: scheduleMs(iso),
        puntosLocal: p.puntos_local,
        puntosVisitante: p.puntos_visitante,
        sets: getPartidoSets(p),
      };
    });
}

function currentPhaseUpper(
  fase: TorneoExpressFaseEliminacion,
  partidos: TorneoExpressEliminatoriaPartido[],
  totalRondas: number,
  championLabel: string | null,
  activeRonda: number,
  bracketSlotCount?: number
): string {
  if (championLabel) return "CAMPEONES DEFINIDOS";
  if (
    isFinaleEliminatoriaStage(partidos, totalRondas) &&
    partidos.some((p) => isRondaTercerLugar(p.ronda))
  ) {
    return "FINAL Y TERCER LUGAR";
  }
  return roundLabelUpper(fase, activeRonda, totalRondas, bracketSlotCount);
}

export function buildPublicBracketViewModel(
  bundle: TorneoExpressBundle,
  labelMap: Record<string, string>
): PublicBracketViewModel {
  const fase = bundle.torneo.fase_eliminacion ?? "cuartos";
  const partidos = bundle.eliminatoriaPartidos;
  const slots = deserializeBracketSlots(bundle.torneo.bracket_slots);
  const qualifierMap = buildQualifierMap(slots);
  const bracketSlotCount = slots.length > 0 ? slots.length : undefined;
  const totalRondas = totalRondasEliminatoria(fase, bracketSlotCount);
  const activeRonda = activeRondaFromPartidos(partidos, totalRondas);

  const allCards: PublicMatchupCard[] = [];

  for (let r = 1; r <= totalRondas; r++) {
    const dbRound = partidosDeRonda(partidos, r);
    const cards =
      r === 1 && slots.length > 0
        ? buildRoundOneCards(
            fase,
            r,
            totalRondas,
            partidos,
            slots,
            labelMap,
            qualifierMap,
            bracketSlotCount
          )
        : dbRound.length > 0
          ? buildDbRoundCards(
              fase,
              r,
              totalRondas,
              partidos,
              labelMap,
              qualifierMap,
              bracketSlotCount
            )
          : [];

    if (cards.length > 0) allCards.push(...cards);
  }

  const tercerPartidos = partidos.filter((p) => isRondaTercerLugar(p.ronda));
  if (tercerPartidos.length > 0) {
    allCards.push(
      ...buildDbRoundCards(
        fase,
        RONDA_TERCER_LUGAR,
        totalRondas,
        partidos,
        labelMap,
        qualifierMap,
        bracketSlotCount
      )
    );
  }

  const finaleStage = isFinaleEliminatoriaStage(partidos, totalRondas);
  const currentRoundCards = finaleStage
    ? allCards.filter(
        (c) => c.ronda === totalRondas || isRondaTercerLugar(c.ronda)
      )
    : allCards.filter((c) => c.ronda === activeRonda);
  markLiveBatch(currentRoundCards);
  harmonizeSimultaneousStatuses(currentRoundCards);

  const futureRoundCards = finaleStage
    ? []
    : allCards.filter(
        (c) =>
          c.ronda > activeRonda &&
          !isRondaTercerLugar(c.ronda)
      );
  futureRoundCards.forEach((c) => {
    if (c.status !== "finished") c.status = "pending";
  });

  let championLabel: string | null = null;
  const finalCards = allCards.filter((c) => c.ronda === totalRondas);
  const finalDone = finalCards.find((c) => c.status === "finished");
  if (finalDone) {
    championLabel = finalDone.local.isWinner
      ? finalDone.local.label
      : finalDone.visit.isWinner
        ? finalDone.visit.label
        : null;
  }

  const phaseUpper = currentPhaseUpper(
    fase,
    partidos,
    totalRondas,
    championLabel,
    activeRonda,
    bracketSlotCount
  );

  const displayCards = allCards.map((c) => {
    const activeMatch = currentRoundCards.find((a) => a.id === c.id);
    return activeMatch ?? c;
  });

  const finalistsCelebrate = resolveFinalistsCelebrate(
    displayCards,
    totalRondas,
    championLabel
  );

  const thirdPlaceCard =
    displayCards.find((c) => isRondaTercerLugar(c.ronda)) ?? null;
  let thirdPlaceCelebrate: { label: string } | null = null;
  if (thirdPlaceCard?.status === "finished") {
    const label = winnerLabelFromCard(thirdPlaceCard);
    if (label) thirdPlaceCelebrate = { label };
  }

  return {
    championLabel,
    finalistsCelebrate,
    thirdPlaceCelebrate,
    thirdPlaceCard,
    currentPhaseUpper: phaseUpper,
    motivationalMessage: motivationalMessageForRound(
      phaseUpper,
      currentRoundCards,
      {
        allCards: displayCards,
        totalRondas,
        championLabel,
      }
    ),
    hasLiveMatch: currentRoundCards.some((c) => c.status === "live"),
    activeRonda,
    currentRoundCards,
    futureRoundCards,
    allBracketCards: displayCards,
    totalRondas,
  };
}
