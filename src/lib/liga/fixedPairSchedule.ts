/** Marcador interno para número impar de equipos (descansa una pareja por jornada). */
export const LIGA_EQUIPO_BYE = "__BYE__";

export type FixedPairLeagueMatch = {
  equipo1_id: string;
  equipo2_id: string;
  /** Segunda vuelta: local/visitante invertidos respecto a la primera. */
  invertSides: boolean;
};

export type FixedPairLeagueJornada = {
  numero: number;
  matches: FixedPairLeagueMatch[];
};

function rotateBergerCircle(rotation: string[]): string[] {
  const fixed = rotation[0];
  const rest = rotation.slice(1);
  const last = rest.pop();
  if (last === undefined) return [...rotation];
  rest.unshift(last);
  return [fixed, ...rest];
}

/** Una vuelta Berger (cada equipo juega como máximo un partido por jornada). */
export function buildBergerRounds(equipoIds: string[]): FixedPairLeagueJornada[] {
  const unique = Array.from(new Set(equipoIds.map((id) => id.trim()).filter(Boolean)));
  if (unique.length < 2) return [];

  const teams = [...unique];
  if (teams.length % 2 === 1) {
    teams.push(LIGA_EQUIPO_BYE);
  }

  const n = teams.length;
  const roundsPerVuelta = n - 1;
  let rotation = [...teams];
  const jornadas: FixedPairLeagueJornada[] = [];

  for (let r = 0; r < roundsPerVuelta; r++) {
    const matches: FixedPairLeagueMatch[] = [];
    for (let i = 0; i < n / 2; i++) {
      const t1 = rotation[i];
      const t2 = rotation[n - 1 - i];
      if (t1 === LIGA_EQUIPO_BYE || t2 === LIGA_EQUIPO_BYE || t1 === t2) {
        continue;
      }
      matches.push({
        equipo1_id: t1,
        equipo2_id: t2,
        invertSides: false,
      });
    }
    jornadas.push({ numero: jornadas.length + 1, matches });
    rotation = rotateBergerCircle(rotation);
  }

  return jornadas;
}

/**
 * Calendario liga por parejas fijas.
 * Jornadas totales ≈ (P−1)×vueltas para P par; con impar, Berger usa BYE (P jornadas/vuelta).
 */
export function buildFixedPairLeagueSchedule(
  equipoIds: string[],
  vueltas: number
): FixedPairLeagueJornada[] {
  const legs = Math.max(1, Math.min(3, Math.round(vueltas)));
  const base = buildBergerRounds(equipoIds);
  if (!base.length) return [];

  const full: FixedPairLeagueJornada[] = [];
  let numero = 1;

  for (let leg = 0; leg < legs; leg++) {
    const invert = leg % 2 === 1;
    for (const round of base) {
      full.push({
        numero,
        matches: round.matches.map((m) =>
          invert
            ? {
                equipo1_id: m.equipo2_id,
                equipo2_id: m.equipo1_id,
                invertSides: true,
              }
            : {
                equipo1_id: m.equipo1_id,
                equipo2_id: m.equipo2_id,
                invertSides: false,
              }
        ),
      });
      numero += 1;
    }
  }

  return full;
}

/** Cuenta enfrentamientos únicos (sin importar orden) a lo largo del calendario. */
export function countPairMeetings(
  schedule: FixedPairLeagueJornada[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const j of schedule) {
    for (const m of j.matches) {
      const key = [m.equipo1_id, m.equipo2_id].sort().join("|");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
