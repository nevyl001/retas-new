import type { StandingRowExpress } from "./types";
import {
  groupWinnerOfficialStatRows,
  groupWinnerOfficialStats,
} from "./groupWinnerStats";

const row: StandingRowExpress = {
  parejaId: "p1",
  parejaLabel: "Alan Villa / Ivan Olivares",
  grupoId: "g1",
  grupoNombre: "Grupo A",
  grupoOrden: 1,
  posicion: 1,
  tie: { status: "resolved" },
  pj: 2,
  pg: 2,
  pp: 0,
  ptsFav: 25,
  ptsCon: 13,
  dif: 12,
  puntos: 4,
};

describe("groupWinnerOfficialStats", () => {
  it("devuelve las siete estadísticas oficiales en el orden PJ·PG·PP·PTS·GF·GC·DIF", () => {
    const stats = groupWinnerOfficialStats(row);
    expect(stats.map((s) => s.label)).toEqual([
      "PJ",
      "PG",
      "PP",
      "PTS",
      "GF",
      "GC",
      "DIF",
    ]);
    expect(stats.map((s) => s.value)).toEqual([
      "2",
      "2",
      "0",
      "4",
      "25",
      "13",
      "+12",
    ]);
  });

  it("toma los valores de los campos de la clasificación sin recalcular", () => {
    const stats = groupWinnerOfficialStats(row);
    const byId = Object.fromEntries(stats.map((s) => [s.id, s.value]));
    expect(byId.pj).toBe(String(row.pj));
    expect(byId.pg).toBe(String(row.pg));
    expect(byId.pp).toBe(String(row.pp));
    expect(byId.pts).toBe(String(row.puntos));
    expect(byId.gf).toBe(String(row.ptsFav));
    expect(byId.gc).toBe(String(row.ptsCon));
    expect(byId.dif).toBe("+12");
  });

  it("incluye el nombre completo de cada sigla para lectores de pantalla", () => {
    const names = Object.fromEntries(
      groupWinnerOfficialStats(row).map((s) => [s.label, s.name])
    );
    expect(names).toEqual({
      PJ: "Partidos jugados",
      PG: "Partidos ganados",
      PP: "Partidos perdidos",
      PTS: "Puntos",
      GF: "Games a favor",
      GC: "Games en contra",
      DIF: "Diferencia de games",
    });
  });

  it("PTS es el principal y DIF solo se resalta cuando es positivo", () => {
    const stats = groupWinnerOfficialStats(row);
    expect(stats.filter((s) => s.primary).map((s) => s.label)).toEqual(["PTS"]);
    expect(stats.find((s) => s.id === "dif")?.highlight).toBe(true);

    const neutral = groupWinnerOfficialStats({ ...row, ptsFav: 13, dif: 0 });
    expect(neutral.find((s) => s.id === "dif")).toMatchObject({
      value: "0",
      highlight: false,
    });
    const negative = groupWinnerOfficialStats({ ...row, ptsFav: 9, dif: -4 });
    expect(negative.find((s) => s.id === "dif")).toMatchObject({
      value: "-4",
      highlight: false,
    });
  });

  it("reparte en dos filas: cuatro arriba y tres abajo", () => {
    const rows = groupWinnerOfficialStatRows(row);
    expect(rows).toHaveLength(2);
    expect(rows[0].map((s) => s.label)).toEqual(["PJ", "PG", "PP", "PTS"]);
    expect(rows[1].map((s) => s.label)).toEqual(["GF", "GC", "DIF"]);
  });
});
