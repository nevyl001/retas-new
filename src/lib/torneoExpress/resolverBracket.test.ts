import type { BracketFase, BracketQualifier, BracketSlotEntry } from "./bracketTypes";
import {
  previsualizarResolverBracket,
  resolverBracket,
  resolverChoquesAutomaticos,
  validarChoques,
} from "./resolverBracket";

function makeClasificados(
  numGrupos: number,
  total: number
): BracketQualifier[] {
  return Array.from({ length: total }, (_, i) => ({
    seed: i + 1,
    parejaId: `p-${i + 1}`,
    parejaLabel: `Pareja ${i + 1}`,
    grupoId: `g${i % numGrupos}`,
    grupoNombre: String.fromCharCode(65 + (i % numGrupos)),
    grupoOrden: i % numGrupos,
    posEnGrupo: ((i % 2) + 1) as 1 | 2,
    isMejorTercero: i >= numGrupos * 2,
    pj: 3,
    pg: 2,
    pp: 1,
    ptsFav: 18,
    ptsCon: 12,
    dif: 6,
    puntos: 6,
  }));
}

type CasoTabla = {
  grupos: number;
  clasificados: number;
  fase: BracketFase;
  tipo: "limpio" | "con_byes" | "hibrido";
  byeDirecto: number;
  enFasePrevia: number;
  slotsCuadro: number;
  byeExtraSeed?: number;
};

const TABLA: CasoTabla[] = [
  { grupos: 2, clasificados: 4, fase: "semifinal", tipo: "limpio", byeDirecto: 4, enFasePrevia: 0, slotsCuadro: 4 },
  { grupos: 2, clasificados: 4, fase: "cuartos", tipo: "con_byes", byeDirecto: 4, enFasePrevia: 0, slotsCuadro: 8 },
  { grupos: 3, clasificados: 6, fase: "cuartos", tipo: "con_byes", byeDirecto: 6, enFasePrevia: 0, slotsCuadro: 8 },
  { grupos: 3, clasificados: 6, fase: "semifinal", tipo: "hibrido", byeDirecto: 2, enFasePrevia: 4, slotsCuadro: 8 },
  { grupos: 4, clasificados: 8, fase: "cuartos", tipo: "limpio", byeDirecto: 8, enFasePrevia: 0, slotsCuadro: 8 },
  { grupos: 4, clasificados: 8, fase: "semifinal", tipo: "hibrido", byeDirecto: 2, enFasePrevia: 6, slotsCuadro: 8 },
  { grupos: 4, clasificados: 8, fase: "octavos", tipo: "con_byes", byeDirecto: 8, enFasePrevia: 0, slotsCuadro: 16 },
  { grupos: 5, clasificados: 10, fase: "cuartos", tipo: "hibrido", byeDirecto: 4, enFasePrevia: 6, slotsCuadro: 16 },
  { grupos: 5, clasificados: 10, fase: "semifinal", tipo: "hibrido", byeDirecto: 2, enFasePrevia: 8, slotsCuadro: 16 },
  { grupos: 5, clasificados: 10, fase: "octavos", tipo: "con_byes", byeDirecto: 10, enFasePrevia: 0, slotsCuadro: 16 },
  { grupos: 6, clasificados: 12, fase: "cuartos", tipo: "hibrido", byeDirecto: 4, enFasePrevia: 8, slotsCuadro: 16 },
  { grupos: 6, clasificados: 12, fase: "semifinal", tipo: "hibrido", byeDirecto: 2, enFasePrevia: 10, slotsCuadro: 16 },
  { grupos: 6, clasificados: 12, fase: "octavos", tipo: "con_byes", byeDirecto: 12, enFasePrevia: 0, slotsCuadro: 16 },
  { grupos: 7, clasificados: 14, fase: "cuartos", tipo: "hibrido", byeDirecto: 4, enFasePrevia: 10, slotsCuadro: 16 },
  { grupos: 7, clasificados: 14, fase: "semifinal", tipo: "hibrido", byeDirecto: 2, enFasePrevia: 12, slotsCuadro: 16 },
  { grupos: 7, clasificados: 14, fase: "octavos", tipo: "con_byes", byeDirecto: 14, enFasePrevia: 0, slotsCuadro: 16 },
  { grupos: 8, clasificados: 16, fase: "cuartos", tipo: "hibrido", byeDirecto: 4, enFasePrevia: 12, slotsCuadro: 16 },
  { grupos: 8, clasificados: 16, fase: "semifinal", tipo: "hibrido", byeDirecto: 2, enFasePrevia: 14, slotsCuadro: 16 },
  { grupos: 8, clasificados: 16, fase: "octavos", tipo: "limpio", byeDirecto: 16, enFasePrevia: 0, slotsCuadro: 16 },
];

describe("resolverBracket — tabla completa", () => {
  it.each(TABLA.map((c) => [c.grupos, c.clasificados, c.fase, c] as const))(
    "%i grupos · %i clasificados · %s",
    (grupos, total, fase, caso) => {
      const clasificados = makeClasificados(grupos, total);
      const result = resolverBracket(grupos, fase, clasificados);

      expect(result.valido).toBe(true);
      expect(result.tipo).toBe(caso.tipo);
      expect(result.byeDirecto.length).toBe(caso.byeDirecto);
      expect(result.enFasePrevia.length).toBe(caso.enFasePrevia);
      expect(result.slots.length).toBe(caso.slotsCuadro);
      expect(result.slots.filter((s) => s.type === "team").length).toBe(total);

      const byeExtraOk =
        caso.byeExtraSeed != null
          ? result.byeExtra?.qualifier.seed === caso.byeExtraSeed &&
            result.byeExtra?.motivo === "impar_en_fase_previa"
          : caso.enFasePrevia % 2 === 1
            ? result.byeExtra !== null
            : result.byeExtra === null;
      expect(byeExtraOk).toBe(true);

      expect(result.descripcion.length).toBeGreaterThan(0);
    }
  );
});

describe("previsualizarResolverBracket", () => {
  it("coincide con resolverBracket para 4 grupos semifinal", () => {
    const clasificados = makeClasificados(4, 8);
    const full = resolverBracket(4, "semifinal", clasificados);
    const preview = previsualizarResolverBracket(4, "semifinal", 8);
    expect(preview.tipo).toBe(full.tipo);
    expect(preview.byeDirecto.length).toBe(full.byeDirecto.length);
    expect(preview.enFasePrevia.length).toBe(full.enFasePrevia.length);
    expect(preview.slots.length).toBe(full.slots.length);
  });
});

describe("impar en fase previa", () => {
  it("asigna BYE extra al peor seed del bloque previo", () => {
    const clasificados = makeClasificados(3, 7);
    const result = resolverBracket(3, "semifinal", clasificados);
    expect(result.enFasePrevia.length).toBe(5);
    expect(result.byeExtra?.qualifier.seed).toBe(7);
    expect(result.partidosPrevios.length).toBe(2);
    expect(result.slots.filter((s) => s.type === "team").length).toBe(7);
  });
});

describe("resolverChoquesAutomaticos", () => {
  function qf(
    grupo: string,
    label: string,
    pos: 1 | 2 | 3,
    seed: number
  ): BracketQualifier {
    const grupoOrden = grupo.charCodeAt(0) - 65;
    return {
      seed,
      parejaId: `p-${seed}`,
      parejaLabel: label,
      grupoId: `g-${grupo}`,
      grupoNombre: grupo,
      grupoOrden,
      posEnGrupo: pos,
      isMejorTercero: pos === 3,
      pj: 3,
      pg: 4 - pos,
      pp: pos - 1,
      ptsFav: 20 - seed,
      ptsCon: 10,
      dif: 10 - seed,
      puntos: 6,
    };
  }

  /** Coloca seeds en slots con el mapa clásico de 8. */
  function placeClassic8(qs: BracketQualifier[]): BracketSlotEntry[] {
    const map = [0, 7, 3, 4, 2, 5, 6, 1];
    const slots: BracketSlotEntry[] = Array.from({ length: 8 }, () => ({
      type: "bye" as const,
    }));
    for (const q of qs) {
      slots[map[q.seed - 1]] = { type: "team", qualifier: q };
    }
    return slots;
  }

  function partnerSeed(slots: BracketSlotEntry[], seed: number): number {
    const idx = slots.findIndex(
      (s) => s.type === "team" && s.qualifier.seed === seed
    );
    const p = idx % 2 === 0 ? idx + 1 : idx - 1;
    const slot = slots[p];
    return slot?.type === "team" ? slot.qualifier.seed : -1;
  }

  it("caso Summer: resuelve 1ºC vs 2ºC sin sacar terceros de #1/#2", () => {
    // Tras swap premium: #1 vs #7, #2 vs #8; mid sigue con #5C vs #3C.
    const slots = placeClassic8([
      qf("A", "Tpvs1", 1, 1),
      qf("B", "Tpvs11", 1, 2),
      qf("C", "Tpvs19", 1, 3),
      qf("B", "Tpvs9", 2, 4),
      qf("C", "Tpvs23", 2, 5),
      qf("A", "Tpvs7", 2, 6),
      qf("C", "Tpvs17", 3, 7),
      qf("A", "Tpvs5", 3, 8),
    ]);
    // Simula el estado del screenshot (#1 ya vs #7, #2 vs #8).
    const pre = slots.map((s) =>
      s.type === "team"
        ? { type: "team" as const, qualifier: { ...s.qualifier } }
        : { type: "bye" as const }
    );
    // Classic starts #1 vs #8 (mismo grupo A); el auto-resolver premium lo cruza.
    const fixed = resolverChoquesAutomaticos(pre);

    expect([partnerSeed(fixed, 1), partnerSeed(fixed, 2)].sort()).toEqual([
      7, 8,
    ]);
    expect(validarChoques(fixed)).toEqual([]);
  });

  it("mantiene #1/#2 vs #7/#8 y limpia choque mid 1ºC–2ºC", () => {
    // #3 y #5 del mismo grupo C (cruce mid clásico); #1/#2 vs terceros intactos.
    const slots = placeClassic8([
      qf("A", "A1", 1, 1),
      qf("B", "B1", 1, 2),
      qf("C", "C1", 1, 3),
      qf("B", "B2", 2, 4),
      qf("C", "C2", 2, 5),
      qf("A", "A2", 2, 6),
      qf("D", "D3", 3, 7),
      qf("A", "A3", 3, 8),
    ]);
    // Classic: #1A vs #8A → swap premium a #1 vs #7 / #2 vs #8.
    const fixed = resolverChoquesAutomaticos(slots);
    expect([partnerSeed(fixed, 1), partnerSeed(fixed, 2)].sort()).toEqual([
      7, 8,
    ]);
    expect(validarChoques(fixed)).toEqual([]);
  });
});
