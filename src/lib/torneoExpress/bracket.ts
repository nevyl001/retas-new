import { buildStandingsForGrupo } from "./standings";
import type {
  BracketBuildResult,
  BracketClashWarning,
  BracketFase,
  BracketQualifier,
  BracketSlotEntry,
  ClasificadosSummary,
} from "./bracketTypes";
import {
  BRACKET_FASE_SLOTS,
  standingToQualifier,
} from "./bracketTypes";
import type {
  TorneoExpressBundle,
  TorneoExpressGrupo,
} from "./types";

/** Posición de cada seed (1-based) en el cuadro estándar de pádel/tenis */
const SEED_SLOT_INDEX: Record<number, number[]> = {
  4: [0, 3, 2, 1],
  8: [0, 7, 3, 4, 2, 5, 6, 1],
  16: [0, 15, 7, 8, 3, 12, 4, 11, 2, 13, 6, 9, 5, 10, 14, 1],
};

function compareQualifiers(a: BracketQualifier, b: BracketQualifier): number {
  if (b.puntos !== a.puntos) return b.puntos - a.puntos;
  if (b.dif !== a.dif) return b.dif - a.dif;
  if (b.ptsFav !== a.ptsFav) return b.ptsFav - a.ptsFav;
  return a.seed - b.seed;
}

export function grupoBadgeLabel(q: BracketQualifier): string {
  const letter =
    q.grupoNombre?.trim().length <= 2
      ? q.grupoNombre.trim().toUpperCase()
      : String.fromCharCode(65 + (q.grupoOrden % 26));
  return `${q.posEnGrupo}°${letter}`;
}

/** Máximo de mejores terceros que pueden entrar (el resto del hueco son BYE). */
export function mejoresTercerosNecesarios(
  numGrupos: number,
  fase: BracketFase
): number {
  const slots = BRACKET_FASE_SLOTS[fase];
  const gap = Math.max(0, slots - numGrupos * 2);
  return Math.min(numGrupos, gap);
}

export function sugerirFaseAutomatica(numGrupos: number): BracketFase {
  const fijos = numGrupos * 2;
  if (fijos <= 4) return "semifinal";
  if (fijos <= 8) return "cuartos";
  return "octavos";
}

export function validarFaseElegible(
  numGrupos: number,
  fase: BracketFase
): { ok: true } | { ok: false; error: string } {
  const slots = BRACKET_FASE_SLOTS[fase];
  const fijos = numGrupos * 2;
  const tercerosNec = mejoresTercerosNecesarios(numGrupos, fase);

  if (fijos > slots) {
    return {
      ok: false,
      error: `Hay ${fijos} clasificados fijos (1° y 2°) pero ${labelFase(fase)} solo tiene ${slots} plazas. Elige una fase con más cupos.`,
    };
  }
  if (tercerosNec > numGrupos) {
    return {
      ok: false,
      error: `Se necesitan ${tercerosNec} mejores terceros pero solo hay ${numGrupos} grupos. Elige otra fase.`,
    };
  }
  return { ok: true };
}

function labelFase(fase: BracketFase): string {
  if (fase === "semifinal") return "Semifinal";
  if (fase === "cuartos") return "Cuartos de final";
  return "Octavos de final";
}

export function calcularResumenClasificados(
  bundle: TorneoExpressBundle,
  fase: BracketFase
): ClasificadosSummary {
  const numGrupos = bundle.grupos.length;
  const fijos: BracketQualifier[] = [];
  const tercerosCandidatos: BracketQualifier[] = [];

  bundle.grupos.forEach((grupo) => {
    const tabla = getTablaOrdenada(bundle, grupo);
    if (tabla[0]) {
      fijos.push({
        ...standingToQualifier(tabla[0], 1, false),
        seed: 0,
      });
    }
    if (tabla[1]) {
      fijos.push({
        ...standingToQualifier(tabla[1], 2, false),
        seed: 0,
      });
    }
    if (tabla[2]) {
      tercerosCandidatos.push({
        ...standingToQualifier(tabla[2], 3, false),
        seed: 0,
      });
    }
  });

  const mejoresTercerosNec = mejoresTercerosNecesarios(numGrupos, fase);
  const tercerosOrdenados = [...tercerosCandidatos].sort(compareQualifiers);
  const mejoresTerceros = tercerosOrdenados.slice(0, mejoresTercerosNec).map(
    (q) => ({ ...q, isMejorTercero: true })
  );

  const todos = [...fijos, ...mejoresTerceros];
  return {
    fijos,
    tercerosCandidatos,
    mejoresTercerosNecesarios: mejoresTercerosNec,
    totalClasificados: todos.length,
  };
}

export function getTablaOrdenada(
  bundle: TorneoExpressBundle,
  grupo: TorneoExpressGrupo
) {
  const parejas = bundle.parejasPorGrupo[grupo.id] ?? [];
  const partidos = bundle.partidosPorGrupo[grupo.id] ?? [];
  return buildStandingsForGrupo(grupo, parejas, partidos);
}

export function calcularClasificadosFase(
  bundle: TorneoExpressBundle,
  fase: BracketFase,
  opts?: { cantidadTerceros?: number }
): BracketQualifier[] {
  const valid = validarFaseElegible(bundle.grupos.length, fase);
  if (!valid.ok) {
    throw new Error(valid.error);
  }

  const resumen = calcularResumenClasificados(bundle, fase);
  const primeros = resumen.fijos
    .filter((q) => q.posEnGrupo === 1)
    .sort(compareQualifiers);
  const segundos = resumen.fijos
    .filter((q) => q.posEnGrupo === 2)
    .sort(compareQualifiers);
  const maxTerceros =
    opts?.cantidadTerceros ??
    resumen.mejoresTercerosNecesarios;
  const terceros = resumen.tercerosCandidatos
    .sort(compareQualifiers)
    .slice(0, Math.max(0, Math.min(maxTerceros, resumen.tercerosCandidatos.length)))
    .map((q) => ({ ...q, isMejorTercero: true }));

  const ordenados = [...primeros, ...segundos, ...terceros];
  return ordenados.map((q, i) => ({ ...q, seed: i + 1 }));
}

function seedPlacementOrder(count: number): number[] {
  const map = SEED_SLOT_INDEX[count];
  if (!map) {
    throw new Error(`Bracket no soportado para ${count} plazas`);
  }
  return map;
}

/** Coloca clasificados en slots; huecos = BYE (seeds altos primero) */
function colocarEnSlots(
  clasificados: BracketQualifier[],
  totalSlots: number
): BracketSlotEntry[] {
  const slots: BracketSlotEntry[] = Array.from({ length: totalSlots }, () => ({
    type: "bye" as const,
  }));
  const placement = seedPlacementOrder(totalSlots);

  clasificados.forEach((q) => {
    const slotIndex = placement[q.seed - 1];
    if (slotIndex === undefined) return;
    slots[slotIndex] = { type: "team", qualifier: q };
  });

  return slots;
}

export function validarChoques(slots: BracketSlotEntry[]): BracketClashWarning[] {
  const choques: BracketClashWarning[] = [];
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    if (a?.type !== "team" || b?.type !== "team") continue;
    if (a.qualifier.grupoId === b.qualifier.grupoId) {
      choques.push({
        cruceIndex: i / 2,
        slotA: i,
        slotB: i + 1,
        mensaje: `${a.qualifier.parejaLabel} y ${b.qualifier.parejaLabel} son del mismo grupo (${a.qualifier.grupoNombre})`,
      });
    }
  }
  return choques;
}

function sameGrupoPair(
  a: BracketSlotEntry | undefined,
  b: BracketSlotEntry | undefined
): boolean {
  if (a?.type !== "team" || b?.type !== "team") return false;
  return a.qualifier.grupoId === b.qualifier.grupoId;
}

function findSwapCandidate(
  slots: BracketSlotEntry[],
  teamSlot: number,
  partnerSlot: number
): number | null {
  const team = slots[teamSlot];
  if (team?.type !== "team") return null;

  for (let d = 1; d < slots.length; d++) {
    for (const delta of [d, -d]) {
      const other = teamSlot + delta;
      if (other < 0 || other >= slots.length || other === partnerSlot) continue;
      const otherEntry = slots[other];
      if (otherEntry?.type !== "team") continue;
      if (otherEntry.qualifier.grupoId === team.qualifier.grupoId) continue;

      const otherPartner = other % 2 === 0 ? other + 1 : other - 1;
      const partnerEntry = slots[otherPartner];
      if (partnerEntry?.type === "team") {
        if (partnerEntry.qualifier.grupoId === otherEntry.qualifier.grupoId) {
          continue;
        }
      }
      return other;
    }
  }
  return null;
}

function resolverChoquesAutomaticos(
  slots: BracketSlotEntry[]
): BracketSlotEntry[] {
  const next = slots.map((s) =>
    s.type === "team"
      ? { type: "team" as const, qualifier: { ...s.qualifier } }
      : { type: "bye" as const }
  );

  for (let i = 0; i < next.length; i += 2) {
    if (!sameGrupoPair(next[i], next[i + 1])) continue;
    const swapIdx = findSwapCandidate(next, i, i + 1);
    if (swapIdx == null) continue;
    const tmp = next[i + 1];
    next[i + 1] = next[swapIdx];
    next[swapIdx] = tmp;
  }

  return next;
}

export function swapBracketSlots(
  slots: BracketSlotEntry[],
  origen: number,
  destino: number
): BracketSlotEntry[] {
  if (
    origen === destino ||
    origen < 0 ||
    destino < 0 ||
    origen >= slots.length ||
    destino >= slots.length
  ) {
    return slots;
  }
  const next = [...slots];
  [next[origen], next[destino]] = [next[destino], next[origen]];
  return next;
}

export function armarBracket(
  clasificados: BracketQualifier[],
  fase: BracketFase
): BracketBuildResult {
  const totalSlots = BRACKET_FASE_SLOTS[fase];
  if (clasificados.length > totalSlots) {
    throw new Error(
      `Demasiados clasificados (${clasificados.length}) para ${labelFase(fase)} (${totalSlots} plazas).`
    );
  }
  if (clasificados.length % 2 !== 0 && clasificados.length > 0) {
    throw new Error(
      `El número de clasificados (${clasificados.length}) no encaja en un bracket de ${labelFase(fase)}.`
    );
  }

  let slots = colocarEnSlots(clasificados, totalSlots);
  slots = resolverChoquesAutomaticos(slots);
  const advertencias = validarChoques(slots);
  const byeCount = slots.filter((s) => s.type === "bye").length;

  return {
    slots,
    qualifiers: clasificados,
    byeCount,
    fase,
    advertencias,
  };
}

export function calcularBracketInicial(
  bundle: TorneoExpressBundle,
  fase: BracketFase,
  opts?: { cantidadTerceros?: number }
): BracketBuildResult {
  const clasificados = calcularClasificadosFase(bundle, fase, opts);
  return armarBracket(clasificados, fase);
}

export function resumenConfirmacion(
  slots: BracketSlotEntry[],
  fase: BracketFase
): string {
  const teams = slots.filter((s) => s.type === "team").length;
  const byes = slots.filter((s) => s.type === "bye").length;
  const total = BRACKET_FASE_SLOTS[fase];
  return `${teams} clasificados + ${byes} BYE = ${total} plazas (${labelFase(fase)}).`;
}

export function validarAntesDeConfirmar(
  slots: BracketSlotEntry[]
): { ok: true } | { ok: false; error: string } {
  const teamIds = new Set<string>();
  for (const slot of slots) {
    if (slot.type !== "team") continue;
    if (teamIds.has(slot.qualifier.parejaId)) {
      return { ok: false, error: "Hay una pareja repetida en el bracket." };
    }
    teamIds.add(slot.qualifier.parejaId);
  }
  return { ok: true };
}

/** Partidos de primera ronda (índice de cruce → parejas) */
export function crucesPrimeraRonda(slots: BracketSlotEntry[]): Array<{
  cruceIndex: number;
  local: BracketQualifier | null;
  visitante: BracketQualifier | null;
  esBye: boolean;
}> {
  const cruces: Array<{
    cruceIndex: number;
    local: BracketQualifier | null;
    visitante: BracketQualifier | null;
    esBye: boolean;
  }> = [];

  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    const local = a?.type === "team" ? a.qualifier : null;
    const visitante = b?.type === "team" ? b.qualifier : null;
    const esBye =
      (a?.type === "bye" && b?.type === "team") ||
      (a?.type === "team" && b?.type === "bye") ||
      (a?.type === "bye" && b?.type === "bye");
    cruces.push({
      cruceIndex: i / 2,
      local,
      visitante,
      esBye,
    });
  }
  return cruces;
}
