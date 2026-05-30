import type { BracketFase, BracketQualifier } from "./bracketTypes";
import { previsualizarResolverBracket, resolverBracket } from "./resolverBracket";

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

      if (caso.byeExtraSeed != null) {
        expect(result.byeExtra?.qualifier.seed).toBe(caso.byeExtraSeed);
        expect(result.byeExtra?.motivo).toBe("impar_en_fase_previa");
      } else if (caso.enFasePrevia % 2 === 1) {
        expect(result.byeExtra).not.toBeNull();
      } else {
        expect(result.byeExtra).toBeNull();
      }

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
