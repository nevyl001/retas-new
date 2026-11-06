/**
 * Podio oficial de una liga para carrera Riviera.
 * Parejas con playoffs: Gran Final y partido THIRD (los dos jugadores).
 * Parejas sin playoffs: los tres primeros equipos por puntos de temporada.
 * Individual: las tres primeras inscripciones.
 * Nunca empareja por nombre.
 */
import {
  resolveGranFinalCelebrateSides,
  resolveThirdPlaceCelebrateSide,
} from "./jornadaCelebrate";
import { isEquiposModalidad, isParejasFijasPlayoffs } from "./ligaModalidad";
import type {
  LigaEquipo,
  LigaInscripcion,
  LigaJornada,
  LigaJornadaPareja,
  LigaModalidad,
  LigaPartido,
} from "./types";

export type LigaPodioPosicion = 1 | 2 | 3;

export type LigaPodioPlayerRef = {
  legacyLigaJugadorId: string;
  nombre: string;
};

export type LigaPodioEntry = {
  posicion: LigaPodioPosicion;
  players: LigaPodioPlayerRef[];
};

export type LigaPodioResolution = {
  source: "playoff" | "equipos" | "inscripciones" | null;
  entries: LigaPodioEntry[];
  /** Plaza de pareja sin jugador identificable. No se inventa un nombre. */
  missingSlots: Array<{ posicion: LigaPodioPosicion; parejaId: string }>;
  reason?: string;
};

export type LigaPodioInput = {
  modalidad: LigaModalidad;
  inscripciones: readonly Pick<LigaInscripcion, "jugador_id" | "puntos" | "jugador">[];
  equipos?: readonly Pick<
    LigaEquipo,
    "id" | "puntos" | "jugador1_id" | "jugador2_id" | "jugador1" | "jugador2"
  >[];
  jornadas: readonly Pick<LigaJornada, "parejas" | "partidos">[];
};

function playerRef(
  id: string | null | undefined,
  nombre: string | null | undefined
): LigaPodioPlayerRef | null {
  const legacyLigaJugadorId = String(id ?? "").trim();
  if (!legacyLigaJugadorId) return null;
  const trimmed = String(nombre ?? "").trim();
  return {
    legacyLigaJugadorId,
    nombre: trimmed || "Jugador",
  };
}

function playersOfPareja(
  pareja: Pick<
    LigaJornadaPareja,
    "jugador1_id" | "jugador2_id" | "jugador1" | "jugador2" | "equipo_id"
  >,
  equipos: LigaPodioInput["equipos"]
): { players: LigaPodioPlayerRef[]; complete: boolean } {
  const equipo = pareja.equipo_id
    ? equipos?.find((item) => item.id === pareja.equipo_id)
    : undefined;
  const first =
    playerRef(pareja.jugador1?.id ?? pareja.jugador1_id, pareja.jugador1?.nombre) ??
    playerRef(equipo?.jugador1_id, equipo?.jugador1?.nombre);
  const second =
    playerRef(pareja.jugador2?.id ?? pareja.jugador2_id, pareja.jugador2?.nombre) ??
    playerRef(equipo?.jugador2_id, equipo?.jugador2?.nombre);
  const players = [first, second].filter((item): item is LigaPodioPlayerRef => item != null);
  const unique: LigaPodioPlayerRef[] = [];
  for (const player of players) {
    if (unique.some((item) => item.legacyLigaJugadorId === player.legacyLigaJugadorId)) {
      continue;
    }
    unique.push(player);
  }
  return { players: unique, complete: unique.length === 2 };
}

function findPareja(
  parejaId: string,
  jornadas: LigaPodioInput["jornadas"]
): LigaJornadaPareja | undefined {
  for (const jornada of jornadas) {
    const found = jornada.parejas?.find((pareja) => pareja.id === parejaId);
    if (found) return found;
  }
  return undefined;
}

function pushPair(
  entries: LigaPodioEntry[],
  missingSlots: LigaPodioResolution["missingSlots"],
  used: Set<string>,
  posicion: LigaPodioPosicion,
  parejaId: string,
  input: LigaPodioInput
): void {
  const pareja = findPareja(parejaId, input.jornadas);
  if (!pareja) {
    missingSlots.push({ posicion, parejaId });
    return;
  }
  const { players, complete } = playersOfPareja(pareja, input.equipos);
  if (!complete) missingSlots.push({ posicion, parejaId });
  const fresh = players.filter((player) => !used.has(player.legacyLigaJugadorId));
  for (const player of fresh) used.add(player.legacyLigaJugadorId);
  if (fresh.length > 0) entries.push({ posicion, players: fresh });
}

function resolvePlayoffPodio(input: LigaPodioInput): LigaPodioResolution {
  const partidos: LigaPartido[] = input.jornadas.flatMap(
    (jornada) => jornada.partidos ?? []
  );
  const finalSides = resolveGranFinalCelebrateSides(partidos, true);
  if (!finalSides) {
    return {
      source: null,
      entries: [],
      missingSlots: [],
      reason: "La Gran Final no tiene un ganador oficial.",
    };
  }

  const entries: LigaPodioEntry[] = [];
  const missingSlots: LigaPodioResolution["missingSlots"] = [];
  const used = new Set<string>();
  pushPair(entries, missingSlots, used, 1, finalSides.campeonId, input);
  pushPair(entries, missingSlots, used, 2, finalSides.subcampeonId, input);

  const third = resolveThirdPlaceCelebrateSide(partidos, true);
  if (third.status === "resolved") {
    pushPair(entries, missingSlots, used, 3, third.tercerId, input);
  }

  return { source: "playoff", entries, missingSlots };
}

function resolveEquiposPodio(input: LigaPodioInput): LigaPodioResolution {
  const equipos = [...(input.equipos ?? [])].sort((a, b) => {
    const byPoints = b.puntos - a.puntos;
    if (byPoints !== 0) return byPoints;
    return a.id.localeCompare(b.id);
  });
  if (equipos.length === 0) {
    return {
      source: null,
      entries: [],
      missingSlots: [],
      reason: "La liga de parejas no tiene equipos para el podio.",
    };
  }

  const entries: LigaPodioEntry[] = [];
  const missingSlots: LigaPodioResolution["missingSlots"] = [];
  const used = new Set<string>();
  equipos.slice(0, 3).forEach((equipo, index) => {
    const posicion = (index + 1) as LigaPodioPosicion;
    const players = [
      playerRef(equipo.jugador1_id, equipo.jugador1?.nombre),
      playerRef(equipo.jugador2_id, equipo.jugador2?.nombre),
    ].filter((item): item is LigaPodioPlayerRef => item != null);
    if (players.length < 2) {
      missingSlots.push({ posicion, parejaId: equipo.id });
    }
    const fresh = players.filter((player) => !used.has(player.legacyLigaJugadorId));
    for (const player of fresh) used.add(player.legacyLigaJugadorId);
    if (fresh.length > 0) entries.push({ posicion, players: fresh });
  });
  return { source: "equipos", entries, missingSlots };
}

function resolveInscripcionesPodio(input: LigaPodioInput): LigaPodioResolution {
  const ranking = [...input.inscripciones]
    .filter((item) => item.jugador_id.trim())
    .sort((a, b) => {
      const byPoints = b.puntos - a.puntos;
      if (byPoints !== 0) return byPoints;
      return a.jugador_id.localeCompare(b.jugador_id);
    })
    .slice(0, 3);

  if (ranking.length === 0) {
    return {
      source: null,
      entries: [],
      missingSlots: [],
      reason: "La liga no tiene inscripciones para el podio.",
    };
  }

  return {
    source: "inscripciones",
    entries: ranking.map((item, index) => ({
      posicion: (index + 1) as LigaPodioPosicion,
      players: [
        {
          legacyLigaJugadorId: item.jugador_id,
          nombre: item.jugador?.nombre?.trim() || "Jugador",
        },
      ],
    })),
    missingSlots: [],
  };
}

export function resolveLigaPodio(input: LigaPodioInput): LigaPodioResolution {
  if (isParejasFijasPlayoffs(input.modalidad)) return resolvePlayoffPodio(input);
  if (isEquiposModalidad(input.modalidad)) return resolveEquiposPodio(input);
  return resolveInscripcionesPodio(input);
}

export function ligaPodioLugarLabel(posicion: LigaPodioPosicion): string {
  if (posicion === 1) return "Campeón";
  if (posicion === 2) return "Subcampeón";
  return "3er lugar";
}

export function ligaPodioPlacement(
  posicion: LigaPodioPosicion
): "campeon" | "subcampeon" | "tercer" {
  if (posicion === 1) return "campeon";
  if (posicion === 2) return "subcampeon";
  return "tercer";
}
