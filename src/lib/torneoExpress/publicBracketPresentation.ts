/**
 * Pure presentation mapper for the public elimination bracket.
 * Transforms existing PublicMatchupCard data for display only.
 * Does NOT compute winners, advancement, seeds, or scores.
 */

import { isRondaTercerLugar, RONDA_TERCER_LUGAR } from "./bracketRounds";
import type {
  PublicBracketTeam,
  PublicMatchStatus,
  PublicMatchupCard,
} from "./publicBracketModel";
import type { PartidoSetScore } from "./types";

export type BracketTeamSlotKind = "team" | "bye" | "dependency";

export interface BracketPlayerPresentation {
  /** Stable player identity from the pair record. */
  id: string;
  name: string;
  fotoUrl: string | null;
  rating: number | null;
}

export type BracketPairPlayersById = Record<
  string,
  Array<{
    id: string;
    name: string;
    fotoUrl?: string | null;
    rating?: number | null;
  }>
>;

export interface BracketTeamPresentation {
  kind: BracketTeamSlotKind;
  parejaId: string | null;
  /** Identity-safe player rows. Photo/name/rating always travel together by ID. */
  players: BracketPlayerPresentation[];
  /** Player display names (exactly once each). Empty when dependency/bye. */
  names: string[];
  /** Full pair label from the model (for aria / fallback). */
  label: string;
  seed: number | null;
  /** Compact origin, e.g. "3º · C". */
  originLabel: string | null;
  /** Pending feeder label, e.g. "Ganador Cuartos 1". */
  dependencyLabel: string | null;
  isWinner: boolean;
  isLoser: boolean;
  /** Per-set scores for this side (aligned with match.sets). */
  setScores: number[];
}

export interface BracketMatchLogisticsPresentation {
  /** Scheduled time, ready for high-contrast display. */
  timeLabel: string;
  /** Court label: confirmed uppercase (CANCHA 3) or muted pending copy. */
  courtLabel: string;
  timeConfirmed: boolean;
  courtConfirmed: boolean;
  /** Combined line for aria / scanning helpers. */
  metaLine: string;
}

export interface BracketMatchPresentation {
  id: string;
  ronda: number;
  cruceIndex: number;
  shortTitle: string;
  status: PublicMatchStatus;
  statusLabel: string;
  /** Operational schedule/court — first-class match logistics. */
  timeLabel: string;
  courtLabel: string;
  timeConfirmed: boolean;
  courtConfirmed: boolean;
  /** Single-line schedule/court for aria and legacy consumers. */
  metaLine: string;
  local: BracketTeamPresentation;
  visit: BracketTeamPresentation;
  sets: PartidoSetScore[];
  isFinal: boolean;
  isThirdPlace: boolean;
  /** Synthesized when the next-round row does not exist yet in the snapshot. */
  isPlaceholder: boolean;
}

export interface BracketRoundPresentation {
  id: string;
  ronda: number;
  title: string;
  tabLabel: string;
  matches: BracketMatchPresentation[];
  isThirdPlace: boolean;
  isSemifinal: boolean;
  isFinalRound: boolean;
  isActive: boolean;
  isCompleted: boolean;
}

export interface BracketMobileTab {
  id: string;
  label: string;
  roundId: string;
}

export interface BracketPresentationModel {
  rounds: BracketRoundPresentation[];
  thirdPlace: BracketRoundPresentation | null;
  /** Main path + optional third place, in column order. */
  allRounds: BracketRoundPresentation[];
  mobileTabs: BracketMobileTab[];
  defaultMobileTabId: string;
  totalRondas: number;
  activeRonda: number;
}

function parsePairNames(label: string): string[] {
  const parts = label
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  if (parts.length === 1) return [parts[0]];
  return [parts[0], parts[1]];
}

/** Improve compact badges like "3°C" → "3º · C". */
export function formatOriginLabel(originBadge: string | null): string | null {
  if (!originBadge?.trim()) return null;
  const raw = originBadge.trim();
  const m = raw.match(/^(\d+)\s*[°ºo]?\s*([A-Za-zÁÉÍÓÚáéíóú])$/);
  if (m) return `${m[1]}º · ${m[2].toUpperCase()}`;
  const m2 = raw.match(/^(\d+)\s*[°ºo]?\s*[·.-]\s*([A-Za-zÁÉÍÓÚáéíóú]+)/i);
  if (m2) return `${m2[1]}º · ${m2[2].charAt(0).toUpperCase()}`;
  return raw;
}

export function formatMatchLogistics(
  horaDisplay: string,
  canchaLabel: string | null
): BracketMatchLogisticsPresentation {
  const timeRaw = (horaDisplay || "").trim();
  const timeConfirmed =
    Boolean(timeRaw) && !/^por confirmar$/i.test(timeRaw);
  const timeLabel = timeConfirmed ? timeRaw : "Horario por confirmar";

  const courtRaw = canchaLabel?.trim() ?? "";
  const courtConfirmed = Boolean(courtRaw);
  const courtLabel = courtConfirmed
    ? `CANCHA ${courtRaw.replace(/^cancha\s*/i, "").trim()}`.replace(
        /\s+/g,
        " "
      )
    : "Cancha por confirmar";

  return {
    timeLabel,
    courtLabel,
    timeConfirmed,
    courtConfirmed,
    metaLine: `${timeLabel} · ${courtLabel}`,
  };
}

/** @deprecated Prefer formatMatchLogistics for structured logistics. */
export function formatMatchMetaLine(
  horaDisplay: string,
  canchaLabel: string | null
): string {
  return formatMatchLogistics(horaDisplay, canchaLabel).metaLine;
}

export function statusLabelEs(status: PublicMatchStatus): string {
  switch (status) {
    case "live":
      return "En juego";
    case "finished":
      return "Finalizado";
    case "bye":
      return "Bye";
    default:
      return "Pendiente";
  }
}

function shortRoundName(roundLabel: string, ronda: number, totalRondas: number): string {
  if (isRondaTercerLugar(ronda)) return "3.er lugar";
  if (ronda === totalRondas) return "Final";
  const lower = roundLabel.toLowerCase();
  if (lower.includes("octavo")) return "Octavos";
  if (lower.includes("cuarto")) return "Cuartos";
  if (lower.includes("semi")) return "Semifinales";
  if (lower.includes("final")) return "Final";
  return roundLabel;
}

function columnTitle(roundLabel: string, ronda: number, totalRondas: number): string {
  if (isRondaTercerLugar(ronda)) return "3.ER LUGAR";
  if (ronda === totalRondas) return "FINAL";
  const lower = roundLabel.toLowerCase();
  if (lower.includes("octavo")) return "OCTAVOS";
  if (lower.includes("cuarto")) return "CUARTOS";
  if (lower.includes("semi")) return "SEMIFINALES";
  return shortRoundName(roundLabel, ronda, totalRondas).toUpperCase();
}

function matchShortTitle(
  card: PublicMatchupCard | null,
  ronda: number,
  cruceIndex: number,
  totalRondas: number,
  matchCount: number
): string {
  if (isRondaTercerLugar(ronda)) return "3.er lugar";
  if (ronda === totalRondas) return "Final";
  const label = (card?.roundLabel ?? "").toLowerCase();
  let prefix = "R";
  if (label.includes("octavo")) prefix = "OF";
  else if (label.includes("cuarto")) prefix = "QF";
  else if (label.includes("semi")) prefix = "SF";
  else if (ronda === totalRondas - 1) prefix = "SF";
  else if (ronda === totalRondas - 2) prefix = "QF";
  if (matchCount <= 1 && prefix === "SF") return "SF";
  return `${prefix}${cruceIndex + 1}`;
}

function feederRoundPrefix(
  feederRoundLabel: string,
  feederRonda: number,
  totalRondas: number
): string {
  const short = shortRoundName(feederRoundLabel, feederRonda, totalRondas);
  if (short === "Semifinales") return "SF";
  if (short === "Cuartos") return "Cuartos";
  if (short === "Octavos") return "Octavos";
  if (short === "Final") return "Final";
  return short;
}

function winnerDependencyLabel(
  feeder: PublicMatchupCard | undefined,
  feederRonda: number,
  feederCruceIndex: number,
  totalRondas: number,
  matchCountInFeeder: number
): string {
  if (feeder) {
    const prefix = feederRoundPrefix(feeder.roundLabel, feederRonda, totalRondas);
    if (matchCountInFeeder <= 1 && prefix === "SF") {
      return "Ganador SF";
    }
    return `Ganador ${prefix} ${feederCruceIndex + 1}`;
  }
  const prefix =
    feederRonda === totalRondas - 1
      ? "SF"
      : feederRonda === totalRondas - 2
        ? "Cuartos"
        : `Ronda ${feederRonda}`;
  return `Ganador ${prefix} ${feederCruceIndex + 1}`;
}

function loserDependencyLabel(feederCruceIndex: number, matchCount: number): string {
  if (matchCount <= 1) return "Perdedor SF";
  return `Perdedor SF${feederCruceIndex + 1}`;
}

function teamHasParticipant(team: PublicBracketTeam): boolean {
  if (team.isBye) return true;
  return Boolean(team.parejaId) || Boolean(team.label?.trim());
}

function mapTeam(
  team: PublicBracketTeam,
  side: "local" | "visitante",
  card: PublicMatchupCard | null,
  opts: {
    dependencyLabel: string | null;
    played: boolean;
  },
  pairPlayersById: BracketPairPlayersById
): BracketTeamPresentation {
  if (team.isBye) {
    return {
      kind: "bye",
      parejaId: null,
      players: [],
      names: [],
      label: "BYE",
      seed: null,
      originLabel: null,
      dependencyLabel: null,
      isWinner: false,
      isLoser: false,
      setScores: [],
    };
  }

  if (!teamHasParticipant(team)) {
    return {
      kind: "dependency",
      parejaId: null,
      players: [],
      names: [],
      label: "",
      seed: null,
      originLabel: null,
      dependencyLabel: opts.dependencyLabel ?? "Por definir",
      isWinner: false,
      isLoser: false,
      setScores: [],
    };
  }

  const setScores =
    card?.sets.map((s) => (side === "local" ? s.local : s.visitante)) ?? [];
  const isWinner = Boolean(opts.played && team.isWinner);
  const isLoser = Boolean(
    opts.played &&
      !team.isWinner &&
      (card?.local.isWinner || card?.visit.isWinner)
  );

  return {
    kind: "team",
    parejaId: team.parejaId,
    players: team.parejaId
      ? (pairPlayersById[team.parejaId] ?? []).map((player) => ({
          id: player.id,
          name: player.name,
          fotoUrl: player.fotoUrl ?? null,
          rating: player.rating ?? null,
        }))
      : [],
    names: parsePairNames(team.label),
    label: team.label,
    seed: team.seed,
    originLabel: formatOriginLabel(team.originBadge),
    dependencyLabel: null,
    isWinner,
    isLoser,
    setScores,
  };
}

function cardsByRound(cards: PublicMatchupCard[]): Map<number, PublicMatchupCard[]> {
  const map = new Map<number, PublicMatchupCard[]>();
  for (const c of cards) {
    const list = map.get(c.ronda) ?? [];
    list.push(c);
    map.set(c.ronda, list);
  }
  map.forEach((list, r) => {
    map.set(
      r,
      [...list].sort((a, b) => a.cruceIndex - b.cruceIndex)
    );
  });
  return map;
}

function expectedMatchCount(totalRondas: number, ronda: number): number {
  if (isRondaTercerLugar(ronda)) return 1;
  return Math.max(1, 2 ** (totalRondas - ronda));
}

function mapMatchCard(
  card: PublicMatchupCard,
  totalRondas: number,
  byRound: Map<number, PublicMatchupCard[]>,
  pairPlayersById: BracketPairPlayersById
): BracketMatchPresentation {
  const played = card.status === "finished";
  const matchCount = expectedMatchCount(totalRondas, card.ronda);
  const isThird = isRondaTercerLugar(card.ronda);
  const isFinal = !isThird && card.ronda === totalRondas;

  let localDep: string | null = null;
  let visitDep: string | null = null;

  if (isThird && totalRondas >= 2) {
    const semi = byRound.get(totalRondas - 1) ?? [];
    localDep = loserDependencyLabel(0, semi.length || 2);
    visitDep = loserDependencyLabel(1, semi.length || 2);
  } else if (card.ronda > 1) {
    const feederRonda = card.ronda - 1;
    const feeders = byRound.get(feederRonda) ?? [];
    const a = card.cruceIndex * 2;
    const b = card.cruceIndex * 2 + 1;
    localDep = winnerDependencyLabel(
      feeders[a],
      feederRonda,
      a,
      totalRondas,
      feeders.length || expectedMatchCount(totalRondas, feederRonda)
    );
    visitDep = winnerDependencyLabel(
      feeders[b],
      feederRonda,
      b,
      totalRondas,
      feeders.length || expectedMatchCount(totalRondas, feederRonda)
    );
  }

  return {
    id: card.id,
    ronda: card.ronda,
    cruceIndex: card.cruceIndex,
    shortTitle: matchShortTitle(
      card,
      card.ronda,
      card.cruceIndex,
      totalRondas,
      matchCount
    ),
    status: card.status,
    statusLabel: statusLabelEs(card.status),
    ...formatMatchLogistics(card.horaDisplay, card.canchaLabel),
    local: mapTeam(
      card.local,
      "local",
      card,
      {
        dependencyLabel: localDep,
        played,
      },
      pairPlayersById
    ),
    visit: mapTeam(
      card.visit,
      "visitante",
      card,
      {
        dependencyLabel: visitDep,
        played,
      },
      pairPlayersById
    ),
    sets: card.sets,
    isFinal,
    isThirdPlace: isThird,
    isPlaceholder: false,
  };
}

function inferRoundLabel(ronda: number, totalRondas: number): string {
  if (isRondaTercerLugar(ronda)) return "Tercer lugar";
  if (ronda === totalRondas) return "Final";
  const matchesInRound = expectedMatchCount(totalRondas, ronda);
  if (matchesInRound >= 8) return "Octavos de final";
  if (matchesInRound >= 4) return "Cuartos de final";
  if (matchesInRound >= 2) return "Semifinal";
  if (ronda === totalRondas - 1) return "Semifinal";
  return `Ronda ${ronda}`;
}

function buildRoundPresentation(
  ronda: number,
  totalRondas: number,
  byRound: Map<number, PublicMatchupCard[]>,
  activeRonda: number,
  pairPlayersById: BracketPairPlayersById
): BracketRoundPresentation {
  const isThird = isRondaTercerLugar(ronda);
  const existing = (byRound.get(ronda) ?? []).filter(
    (card) =>
      (card.local.isBye || Boolean(card.local.parejaId)) &&
      (card.visit.isBye || Boolean(card.visit.parejaId))
  );
  const matches = existing.map((card) =>
    mapMatchCard(card, totalRondas, byRound, pairPlayersById)
  );

  const labelSource = existing[0]?.roundLabel ?? inferRoundLabel(ronda, totalRondas);
  const isFinalRound = !isThird && ronda === totalRondas;
  return {
    id: isThird ? "tercer" : `ronda-${ronda}`,
    ronda,
    title: columnTitle(labelSource, ronda, totalRondas),
    tabLabel: shortRoundName(labelSource, ronda, totalRondas),
    matches,
    isThirdPlace: isThird,
    isSemifinal: !isThird && !isFinalRound && ronda === totalRondas - 1,
    isFinalRound,
    isActive: !isThird && ronda === activeRonda,
    isCompleted:
      matches.length > 0 && matches.every((match) => match.status === "finished"),
  };
}

/**
 * Map existing public match cards into a shared presentation model
 * consumed by both desktop tree and mobile round navigation.
 */
export function buildBracketPresentationModel(
  allCards: PublicMatchupCard[],
  totalRondas: number,
  activeRonda?: number,
  pairPlayersById: BracketPairPlayersById = {}
): BracketPresentationModel {
  const byRound = cardsByRound(allCards);
  const resolvedActive =
    activeRonda != null && activeRonda >= 1
      ? activeRonda
      : Math.min(
          Math.max(
            1,
            allCards
              .filter((c) => !isRondaTercerLugar(c.ronda))
              .reduce((max, c) => Math.max(max, c.ronda), 1)
          ),
          totalRondas
        );

  const rounds: BracketRoundPresentation[] = [];
  for (let r = 1; r <= totalRondas; r++) {
    const round = buildRoundPresentation(
      r,
      totalRondas,
      byRound,
      resolvedActive,
      pairPlayersById
    );
    if (round.matches.length > 0) rounds.push(round);
  }

  const tercerCards = byRound.get(RONDA_TERCER_LUGAR) ?? [];
  let thirdPlace: BracketRoundPresentation | null = null;
  if (tercerCards.length > 0) {
    thirdPlace = buildRoundPresentation(
      RONDA_TERCER_LUGAR,
      totalRondas,
      byRound,
      resolvedActive,
      pairPlayersById
    );
    if (thirdPlace.matches.length === 0) thirdPlace = null;
  }

  const allRounds = thirdPlace ? [...rounds, thirdPlace] : rounds;

  const mobileTabs: BracketMobileTab[] = allRounds.map((r) => ({
    id: r.id,
    label: r.isThirdPlace ? "3.er lugar" : r.tabLabel,
    roundId: r.id,
  }));

  let defaultMobileTabId = rounds[0]?.id ?? "ronda-1";
  const activeRound = rounds.find((r) => r.ronda === resolvedActive);
  if (activeRound) {
    defaultMobileTabId = activeRound.id;
  } else if (thirdPlace && resolvedActive >= totalRondas) {
    const unfinishedThird = thirdPlace.matches.some(
      (m) => m.status !== "finished"
    );
    if (unfinishedThird) defaultMobileTabId = thirdPlace.id;
  }

  const unfinished = allRounds.find((r) =>
    r.matches.some((m) => m.status === "live" || m.status === "pending")
  );
  if (unfinished && !activeRound) {
    defaultMobileTabId = unfinished.id;
  } else if (activeRound) {
    defaultMobileTabId = activeRound.id;
  }

  return {
    rounds,
    thirdPlace,
    allRounds,
    mobileTabs,
    defaultMobileTabId,
    totalRondas,
    activeRonda: resolvedActive,
  };
}
