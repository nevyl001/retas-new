import { parseTorneoExpressPath } from "../../components/torneo-express/TorneoExpressRouter";
import { pathRequiresUserSession } from "../appRouting";
import {
  buildEnVivoBoard,
  compareCourtLabels,
  formatStartsIn,
  type EnVivoPairSide,
  type EnVivoPartido,
} from "./eventoEnVivo";

const NOW = new Date("2026-10-10T18:00:00.000Z");
const min = (n: number) => new Date(NOW.getTime() + n * 60_000).toISOString();

const side = (display: string): EnVivoPairSide => ({
  pairId: display,
  display,
  player1Id: null,
  player2Id: null,
  isVirtual: false,
});

function partido(
  id: string,
  offsetMin: number,
  extra: Partial<EnVivoPartido> = {}
): EnVivoPartido {
  const programadoEn = min(offsetMin);
  return {
    id,
    origen: "grupo",
    torneoId: "t1",
    categoria: "4ta",
    etapa: "Grupo A",
    cancha: "1",
    programadoEn,
    startMs: Date.parse(programadoEn),
    estado: "pendiente",
    local: side("A / B"),
    visitante: side("C / D"),
    ...extra,
  };
}

describe("buildEnVivoBoard", () => {
  it("separa partidos en juego (varias categorías a la vez) de los próximos", () => {
    const board = buildEnVivoBoard(
      [
        partido("live-c2", -20, { cancha: "2", categoria: "5ta" }),
        partido("live-c1", -10, { cancha: "1", categoria: "4ta" }),
        partido("next-c1", 60, { cancha: "1" }),
        partido("next-c3", 30, { cancha: "3", categoria: "Mixtos D" }),
      ],
      NOW
    );

    expect(board.live.map((p) => p.id)).toEqual(["live-c1", "live-c2"]);
    expect(board.upcoming.map((p) => p.id)).toEqual(["next-c3", "next-c1"]);
    expect(board.courts.map((c) => c.label)).toEqual([
      "Cancha 1",
      "Cancha 2",
      "Cancha 3",
    ]);
    expect(board.courts[0]!.live?.id).toBe("live-c1");
    expect(board.courts[0]!.next?.id).toBe("next-c1");
    expect(board.courts[2]!.live).toBeNull();
    expect(board.courts[2]!.next?.id).toBe("next-c3");
  });

  it("no marca en vivo un partido jugado ni uno fuera de la ventana de 90 min", () => {
    const board = buildEnVivoBoard(
      [
        partido("done", -10, { estado: "jugado" }),
        partido("old", -120, { cancha: "2" }),
      ],
      NOW
    );
    expect(board.live).toEqual([]);
    expect(board.upcoming).toEqual([]);
    // Las canchas siguen apareciendo como libres.
    expect(board.courts.map((c) => c.label)).toEqual(["Cancha 1", "Cancha 2"]);
  });

  it("trata cancha vacía como Cancha 1 igual que el resto de la app", () => {
    const board = buildEnVivoBoard(
      [partido("a", -5, { cancha: null }), partido("b", 30, { cancha: "1" })],
      NOW
    );
    expect(board.courts).toHaveLength(1);
    expect(board.courts[0]!.live?.id).toBe("a");
    expect(board.courts[0]!.next?.id).toBe("b");
  });

  it("pasa a «en vivo» solo con avanzar el reloj, sin nuevos datos", () => {
    const partidos = [partido("later", 10)];
    expect(buildEnVivoBoard(partidos, NOW).live).toEqual([]);
    const later = new Date(NOW.getTime() + 11 * 60_000);
    expect(buildEnVivoBoard(partidos, later).live.map((p) => p.id)).toEqual([
      "later",
    ]);
  });
});

describe("compareCourtLabels", () => {
  it("ordena numéricamente y deja los nombres sin número al final", () => {
    const labels = ["Cancha central", "Cancha 10", "Cancha 2"];
    expect(labels.sort(compareCourtLabels)).toEqual([
      "Cancha 2",
      "Cancha 10",
      "Cancha central",
    ]);
  });
});

describe("formatStartsIn", () => {
  it("formatea minutos y horas, y omite lo lejano", () => {
    expect(formatStartsIn(NOW.getTime() + 5 * 60_000, NOW)).toBe("en 5 min");
    expect(formatStartsIn(NOW.getTime() + 70 * 60_000, NOW)).toBe("en 1 h 10 min");
    expect(formatStartsIn(NOW.getTime() + 120 * 60_000, NOW)).toBe("en 2 h");
    expect(formatStartsIn(NOW.getTime() + 300 * 60_000, NOW)).toBeNull();
  });
});

describe("ruta /eventos/{slug}/en-vivo", () => {
  it("se reconoce como vista pública sin sesión", () => {
    expect(parseTorneoExpressPath("/eventos/hack-padel-fest/en-vivo")).toEqual({
      kind: "evento-en-vivo",
      slug: "hack-padel-fest",
    });
    expect(parseTorneoExpressPath("/eventos/hack-padel-fest")).toEqual({
      kind: "evento-publico",
      slug: "hack-padel-fest",
    });
    expect(pathRequiresUserSession("/eventos/hack-padel-fest/en-vivo")).toBe(
      false
    );
    expect(parseTorneoExpressPath("/torneo-express/aviso-cuadro")).toEqual({
      kind: "aviso-cuadro",
    });
    expect(pathRequiresUserSession("/torneo-express/aviso-cuadro")).toBe(false);
  });
});
