import { timeInputValue } from "../../../lib/liga/programacion";
import type { LigaJornada, LigaPartido } from "../../../lib/liga/types";

export function parejaLabel(
  parejaId: string,
  jornada: LigaJornada | undefined
): string {
  const p = jornada?.parejas?.find((x) => x.id === parejaId);
  if (!p) return "Pareja";
  const n1 = p.jugador1?.nombre ?? "?";
  const n2 = p.jugador2?.nombre ?? "?";
  return `${n1} / ${n2}`;
}

export function parejaPlayerNames(
  parejaId: string,
  jornada: LigaJornada | undefined
): {
  name1: string;
  name2: string;
  rating1: number | null;
  rating2: number | null;
} {
  const p = jornada?.parejas?.find((x) => x.id === parejaId);
  if (!p) {
    return {
      name1: "Jugador 1",
      name2: "Jugador 2",
      rating1: null,
      rating2: null,
    };
  }
  return {
    name1: p.jugador1?.nombre?.trim() || "?",
    name2: p.jugador2?.nombre?.trim() || "?",
    rating1:
      p.jugador1?.nivel != null && Number.isFinite(p.jugador1.nivel)
        ? Number(p.jugador1.nivel)
        : null,
    rating2:
      p.jugador2?.nivel != null && Number.isFinite(p.jugador2.nivel)
        ? Number(p.jugador2.nivel)
        : null,
  };
}

function playerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  const compact = (parts[0] ?? "?").replace(/[^a-zA-Z0-9]/g, "");
  return compact.slice(0, 2).toUpperCase() || "?";
}

export { playerInitials };

export function partidoHora(partido: LigaPartido): string {
  return partido.hora_inicio ? timeInputValue(partido.hora_inicio) : "";
}

export function rondaHoraLabel(partidos: LigaPartido[]): string | null {
  for (const p of partidos) {
    const h = partidoHora(p);
    if (h) return h;
  }
  return null;
}

export function groupPartidosByRonda(
  partidos: LigaPartido[]
): [number, LigaPartido[]][] {
  const map = new Map<number, LigaPartido[]>();
  for (const p of partidos) {
    const ronda = p.ronda ?? 1;
    const list = map.get(ronda) ?? [];
    list.push(p);
    map.set(ronda, list);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(
      ([ronda, list]) =>
        [
          ronda,
          [...list].sort((a, b) => {
            const byCancha = (a.cancha ?? 0) - (b.cancha ?? 0);
            if (byCancha !== 0) return byCancha;
            return a.id.localeCompare(b.id);
          }),
        ] as [number, LigaPartido[]]
    );
}

export function filterPartidosByCancha(
  partidos: LigaPartido[],
  canchaFilter: number | "all"
): LigaPartido[] {
  if (canchaFilter === "all") return partidos;
  return partidos.filter((p) => p.cancha === canchaFilter);
}
