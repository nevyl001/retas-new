import type {
  BracketClashWarning,
  BracketFase,
  BracketQualifier,
  BracketResolverArbol,
  BracketResolverByeExtra,
  BracketResolverPartidoPrevia,
  BracketResolverResult,
  BracketResolverTipo,
  BracketSlotEntry,
} from "./bracketTypes";
import { BRACKET_FASE_SLOTS } from "./bracketTypes";

const SEED_SLOT_INDEX: Record<number, number[]> = {
  4: [0, 3, 2, 1],
  8: [0, 7, 3, 4, 2, 5, 6, 1],
  16: [0, 15, 7, 8, 3, 12, 4, 11, 2, 13, 6, 9, 5, 10, 14, 1],
};

function seedPlacementOrder(count: number): number[] {
  const map = SEED_SLOT_INDEX[count];
  if (!map) {
    throw new Error(`Bracket no soportado para ${count} plazas`);
  }
  return map;
}

function fasePrevia(fase: BracketFase): BracketFase | null {
  if (fase === "semifinal") return "cuartos";
  if (fase === "cuartos") return "octavos";
  return null;
}

function plazasCuadroHibrido(fase: BracketFase, teamCount: number): number {
  const base = fasePrevia(fase) ?? fase;
  let slots = BRACKET_FASE_SLOTS[base];
  while (slots < teamCount && slots < BRACKET_FASE_SLOTS.octavos) {
    slots *= 2;
  }
  return slots;
}

function labelFase(fase: BracketFase): string {
  if (fase === "semifinal") return "Semifinal";
  if (fase === "cuartos") return "Cuartos de final";
  return "Octavos de final";
}

function nombreFasePrevia(fase: BracketFase): string {
  const prev = fasePrevia(fase);
  if (prev === "cuartos") return "cuartos previos";
  if (prev === "octavos") return "octavos previos";
  return "fase previa";
}

export function generarDescripcion(
  byeDirecto: BracketQualifier[],
  enFasePrevia: BracketQualifier[],
  fase: BracketFase,
  _numGrupos: number,
  byeExtra: BracketResolverByeExtra | null,
  tipo: BracketResolverTipo
): string {
  const plazas = BRACKET_FASE_SLOTS[fase];
  const total = byeDirecto.length + enFasePrevia.length;

  if (tipo === "limpio") {
    return `${total} clasificados = bracket limpio, nadie juega previo`;
  }

  if (tipo === "con_byes") {
    const byes = plazas - total;
    return `${total} clasificados + ${byes} BYEs — los ${byes} mejores seeds pasan directo`;
  }

  const previaActivos =
    enFasePrevia.length - (byeExtra ? 1 : 0);
  const partidosPrevios = Math.max(0, Math.floor(previaActivos / 2));
  const fasePreviaLabel = nombreFasePrevia(fase);
  const byeExtraTxt = byeExtra
    ? ` + 1 BYE extra (seed #${byeExtra.qualifier.seed})`
    : "";
  return `${byeDirecto.length} van directo · ${enFasePrevia.length} juegan ${partidosPrevios} ${fasePreviaLabel}${byeExtraTxt}`;
}

function sameGrupo(a: BracketQualifier, b: BracketQualifier): boolean {
  return a.grupoId === b.grupoId;
}

function emparejarAntiChoque(
  teams: BracketQualifier[]
): BracketResolverPartidoPrevia[] {
  const remaining = [...teams];
  const partidos: BracketResolverPartidoPrevia[] = [];
  let cruceIndex = 0;

  while (remaining.length >= 2) {
    const local = remaining.shift()!;
    let visitIdx = remaining.length - 1;
    let choqueDeGrupo = false;

    for (let i = remaining.length - 1; i >= 0; i--) {
      if (!sameGrupo(local, remaining[i])) {
        visitIdx = i;
        break;
      }
      if (i === 0) {
        visitIdx = remaining.length - 1;
        choqueDeGrupo = sameGrupo(local, remaining[visitIdx]);
      }
    }

    const visitante = remaining.splice(visitIdx, 1)[0];
    if (sameGrupo(local, visitante)) {
      choqueDeGrupo = true;
    }

    partidos.push({
      cruceIndex,
      local,
      visitante,
      choqueDeGrupo,
    });
    cruceIndex += 1;
  }

  return partidos;
}

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

function slotsDesdePartidosPrevios(
  partidos: BracketResolverPartidoPrevia[],
  byeDirecto: BracketQualifier[],
  byeExtra: BracketResolverByeExtra | null,
  slotCount: number
): BracketSlotEntry[] {
  const playing = new Map<string, BracketQualifier>();
  partidos.forEach((p) => {
    playing.set(p.local.parejaId, p.local);
    playing.set(p.visitante.parejaId, p.visitante);
  });

  const byeTeams = [...byeDirecto, ...(byeExtra ? [byeExtra.qualifier] : [])].sort(
    (a, b) => a.seed - b.seed
  );
  const playTeams = Array.from(playing.values()).sort((a, b) => a.seed - b.seed);

  const orderedTeams = [...byeTeams, ...playTeams];
  return colocarEnSlots(orderedTeams, slotCount);
}

function sameGrupoPair(
  a: BracketSlotEntry | undefined,
  b: BracketSlotEntry | undefined
): boolean {
  if (a?.type !== "team" || b?.type !== "team") return false;
  return a.qualifier.grupoId === b.qualifier.grupoId;
}

function partnerSlotIndex(slotIndex: number): number {
  return slotIndex % 2 === 0 ? slotIndex + 1 : slotIndex - 1;
}

function slotIndexBySeed(
  slots: BracketSlotEntry[]
): Map<number, number> {
  const map = new Map<number, number>();
  slots.forEach((s, i) => {
    if (s.type === "team") map.set(s.qualifier.seed, i);
  });
  return map;
}

function swapSlots(slots: BracketSlotEntry[], a: number, b: number): void {
  const tmp = slots[a];
  slots[a] = slots[b];
  slots[b] = tmp;
}

function countChoques(slots: BracketSlotEntry[]): number {
  let n = 0;
  for (let i = 0; i < slots.length; i += 2) {
    if (sameGrupoPair(slots[i], slots[i + 1])) n += 1;
  }
  return n;
}

/**
 * Busca un intercambio que reduzca choques de grupo sin tocar slots protegidos
 * (cruces de seeds #1 y #2 contra N / N-1).
 */
function findMiddleSwapCandidate(
  slots: BracketSlotEntry[],
  clashSlot: number,
  protectedSlots: Set<number>
): number | null {
  const team = slots[clashSlot];
  if (team?.type !== "team") return null;
  const partner = partnerSlotIndex(clashSlot);
  const before = countChoques(slots);

  for (let other = 0; other < slots.length; other++) {
    if (other === clashSlot || other === partner) continue;
    if (protectedSlots.has(other) || protectedSlots.has(clashSlot)) continue;
    if (protectedSlots.has(partnerSlotIndex(other))) continue;
    if (slots[other]?.type !== "team") continue;

    swapSlots(slots, clashSlot, other);
    const after = countChoques(slots);
    swapSlots(slots, clashSlot, other); // revert trial

    if (after < before) return other;
  }
  return null;
}

/**
 * Evita choques de grupo SIN romper el seeding premium:
 * - #1 y #2 siguen enfrentando a N y N-1 (mejores terceros / peores seeds).
 * - El resto del cuadro sí puede reordenarse para evitar mismo grupo en 1ª ronda.
 */
export function resolverChoquesAutomaticos(
  slots: BracketSlotEntry[]
): BracketSlotEntry[] {
  const n = slots.length;
  if (n < 4) return slots;

  const next = slots.map((s) =>
    s.type === "team"
      ? { type: "team" as const, qualifier: { ...s.qualifier } }
      : { type: "bye" as const }
  );

  const bySeed = slotIndexBySeed(next);
  const slot1 = bySeed.get(1);
  const slot2 = bySeed.get(2);
  const slotN = bySeed.get(n);
  const slotNm1 = bySeed.get(n - 1);

  const protectedSlots = new Set<number>();

  if (
    slot1 != null &&
    slot2 != null &&
    slotN != null &&
    slotNm1 != null
  ) {
    const opp1 = partnerSlotIndex(slot1);
    const opp2 = partnerSlotIndex(slot2);
    const oppSeeds = new Set(
      [next[opp1], next[opp2]]
        .filter(
          (s): s is { type: "team"; qualifier: BracketQualifier } =>
            s.type === "team"
        )
        .map((s) => s.qualifier.seed)
    );

    if (oppSeeds.has(n) && oppSeeds.has(n - 1)) {
      protectedSlots.add(slot1);
      protectedSlots.add(slot2);
      protectedSlots.add(opp1);
      protectedSlots.add(opp2);

      const clash1 = sameGrupoPair(next[slot1], next[opp1]);
      const clash2 = sameGrupoPair(next[slot2], next[opp2]);
      if (clash1 || clash2) {
        swapSlots(next, opp1, opp2);
        const after =
          Number(sameGrupoPair(next[slot1], next[opp1])) +
          Number(sameGrupoPair(next[slot2], next[opp2]));
        const before = Number(clash1) + Number(clash2);
        if (after >= before) {
          swapSlots(next, opp1, opp2);
        }
      }
    }
  }

  // Resolver choques en el resto del cuadro (p. ej. 1ºC vs 2ºC).
  for (let pass = 0; pass < n; pass++) {
    let progressed = false;
    for (let i = 0; i < next.length; i += 2) {
      if (!sameGrupoPair(next[i], next[i + 1])) continue;
      // No tocar cruces protegidos de #1/#2.
      if (protectedSlots.has(i) || protectedSlots.has(i + 1)) continue;

      const candidates = [i, i + 1];
      for (const from of candidates) {
        const to = findMiddleSwapCandidate(next, from, protectedSlots);
        if (to == null) continue;
        swapSlots(next, from, to);
        progressed = true;
        break;
      }
    }
    if (!progressed) break;
  }

  return next;
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

function armarPartidosPrevios(
  previaActivos: BracketQualifier[]
): BracketResolverPartidoPrevia[] {
  return emparejarAntiChoque(previaActivos);
}

function faseDesdePlazasCuadro(slotCount: number): BracketFase {
  if (slotCount >= BRACKET_FASE_SLOTS.octavos) return "octavos";
  if (slotCount >= BRACKET_FASE_SLOTS.cuartos) return "cuartos";
  return "semifinal";
}

function construirArbol(
  faseElegida: BracketFase,
  plazasCuadro: number,
  tipo: BracketResolverTipo
): BracketResolverArbol {
  const rondaInicial =
    tipo === "hibrido" ? faseDesdePlazasCuadro(plazasCuadro) : faseElegida;
  return {
    faseElegida,
    fasePrevia: tipo === "hibrido" ? rondaInicial : null,
    plazasObjetivo: BRACKET_FASE_SLOTS[faseElegida],
    plazasCuadro,
    rondaInicial,
  };
}

function construirSlots(
  clasificados: BracketQualifier[],
  faseElegida: BracketFase,
  byeDirecto: BracketQualifier[],
  partidosPrevios: BracketResolverPartidoPrevia[],
  byeExtra: BracketResolverByeExtra | null,
  tipo: BracketResolverTipo,
  plazasCuadro: number
): BracketSlotEntry[] {
  const plazas = BRACKET_FASE_SLOTS[faseElegida];

  if (tipo === "hibrido") {
    return slotsDesdePartidosPrevios(
      partidosPrevios,
      byeDirecto,
      byeExtra,
      plazasCuadro
    );
  }

  return colocarEnSlots(clasificados, plazas);
}

/**
 * Función maestra: resuelve BYEs, fase previa híbrida, emparejamientos y cuadro inicial.
 */
export function resolverBracket(
  numGrupos: number,
  faseElegida: BracketFase,
  clasificados: BracketQualifier[]
): BracketResolverResult {
  const plazas = BRACKET_FASE_SLOTS[faseElegida];
  const total = clasificados.length;

  if (total === 0) {
    return {
      valido: false,
      tipo: "limpio",
      byeDirecto: [],
      enFasePrevia: [],
      byeExtra: null,
      partidosPrevios: [],
      arbol: construirArbol(faseElegida, plazas, "limpio"),
      descripcion: "Sin clasificados",
      slots: [],
      advertencias: [],
    };
  }

  if (total > 16) {
    throw new Error(
      `Demasiados clasificados (${total}) para un bracket de ${labelFase(faseElegida)}.`
    );
  }

  let tipo: BracketResolverTipo;
  let byeDirecto: BracketQualifier[];
  let enFasePrevia: BracketQualifier[];
  let byeExtra: BracketResolverByeExtra | null = null;

  if (total === plazas) {
    tipo = "limpio";
    byeDirecto = [...clasificados];
    enFasePrevia = [];
  } else if (total < plazas) {
    tipo = "con_byes";
    byeDirecto = [...clasificados];
    enFasePrevia = [];
  } else {
    tipo = "hibrido";
    const cuantosVanDirecto = plazas / 2;
    byeDirecto = clasificados.slice(0, cuantosVanDirecto);
    enFasePrevia = clasificados.slice(cuantosVanDirecto);
  }

  let previaActivos = [...enFasePrevia];
  if (previaActivos.length % 2 === 1) {
    const worst = previaActivos.pop()!;
    byeExtra = {
      qualifier: worst,
      motivo: "impar_en_fase_previa",
    };
  }

  const partidosPrevios =
    previaActivos.length > 0 ? armarPartidosPrevios(previaActivos) : [];

  const equiposEnCuadro =
    byeDirecto.length +
    previaActivos.length +
    (byeExtra ? 1 : 0);

  const plazasCuadro =
    tipo === "hibrido"
      ? plazasCuadroHibrido(faseElegida, equiposEnCuadro)
      : plazas;

  let slots = construirSlots(
    clasificados,
    faseElegida,
    byeDirecto,
    partidosPrevios,
    byeExtra,
    tipo,
    plazasCuadro
  );

  slots = resolverChoquesAutomaticos(slots);
  const advertencias = validarChoques(slots);

  const descripcion = generarDescripcion(
    byeDirecto,
    enFasePrevia,
    faseElegida,
    numGrupos,
    byeExtra,
    tipo
  );

  return {
    valido: true,
    tipo,
    byeDirecto,
    enFasePrevia,
    byeExtra,
    partidosPrevios,
    arbol: construirArbol(faseElegida, plazasCuadro, tipo),
    descripcion,
    slots,
    advertencias,
  };
}

/** Previsualiza resolverBracket con el total de clasificados esperado (sin seeds). */
export function previsualizarResolverBracket(
  numGrupos: number,
  faseElegida: BracketFase,
  totalClasificados: number
): BracketResolverResult {
  const clasificados: BracketQualifier[] = Array.from(
    { length: totalClasificados },
    (_, i) => ({
      seed: i + 1,
      parejaId: `preview-${i + 1}`,
      parejaLabel: `#${i + 1}`,
      grupoId: `g${i % numGrupos}`,
      grupoNombre: String.fromCharCode(65 + (i % numGrupos)),
      grupoOrden: i % numGrupos,
      posEnGrupo: (i % 3) + 1 as 1 | 2 | 3,
      isMejorTercero: i >= numGrupos * 2,
      pj: 0,
      pg: 0,
      pp: 0,
      ptsFav: 0,
      ptsCon: 0,
      dif: 0,
      puntos: 0,
    })
  );
  return resolverBracket(numGrupos, faseElegida, clasificados);
}
