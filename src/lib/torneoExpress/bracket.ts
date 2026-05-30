import { buildStandingsForGrupo } from "./standings";
import type {
  BracketBuildResult,
  BracketFase,
  BracketQualifier,
  BracketSlotEntry,
  ClasificadosSummary,
} from "./bracketTypes";
import {
  BRACKET_FASE_SLOTS,
  standingToQualifier,
} from "./bracketTypes";
import {
  previsualizarResolverBracket,
  resolverBracket,
} from "./resolverBracket";
import type {
  TorneoExpressBundle,
  TorneoExpressGrupo,
} from "./types";

export { validarChoques } from "./resolverBracket";

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
  const fijos = numGrupos * 2;
  const maxPlazas = BRACKET_FASE_SLOTS.octavos;

  if (fijos > maxPlazas) {
    return {
      ok: false,
      error: `Hay ${fijos} clasificados fijos (1° y 2°) pero el bracket máximo admite ${maxPlazas} plazas.`,
    };
  }

  const maxClasificados = Math.min(maxPlazas, fijos + numGrupos);
  try {
    previsualizarResolverBracket(numGrupos, fase, maxClasificados);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Formato no válido para esta fase.",
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
  opts?: { cantidadTerceros?: number; skipValidation?: boolean }
): BracketQualifier[] {
  if (!opts?.skipValidation) {
    const valid = validarFaseElegible(bundle.grupos.length, fase);
    if (!valid.ok) {
      throw new Error(valid.error);
    }
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
  fase: BracketFase,
  numGrupos: number
): BracketBuildResult {
  const resolved = resolverBracket(numGrupos, fase, clasificados);
  if (!resolved.valido) {
    throw new Error(resolved.descripcion || "No se pudo armar el bracket.");
  }

  const byeCount = resolved.slots.filter((s) => s.type === "bye").length;

  return {
    slots: resolved.slots,
    qualifiers: clasificados,
    byeCount,
    fase,
    advertencias: resolved.advertencias,
    resolver: resolved,
  };
}

export function calcularBracketInicial(
  bundle: TorneoExpressBundle,
  fase: BracketFase,
  opts?: { cantidadTerceros?: number }
): BracketBuildResult {
  const clasificados = calcularClasificadosFase(bundle, fase, opts);
  return armarBracket(clasificados, fase, bundle.grupos.length);
}

export function resumenConfirmacion(
  slots: BracketSlotEntry[],
  fase: BracketFase,
  resolver?: BracketBuildResult["resolver"]
): string {
  if (resolver?.descripcion) {
    return `${resolver.descripcion} (${labelFase(fase)}).`;
  }
  const teams = slots.filter((s) => s.type === "team").length;
  const byes = slots.filter((s) => s.type === "bye").length;
  const total = slots.length;
  return `${teams} clasificados + ${byes} BYE = ${total} plazas (${labelFase(fase)}).`;
}

export { previsualizarResolverBracket } from "./resolverBracket";

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
