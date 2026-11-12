import fs from "fs";
import path from "path";
import { calcularPuntosEvento, PUNTOS_DUELO_2V2 } from "./rivieraRankingPoints";

const repairSql = fs.readFileSync(
  path.join(
    __dirname,
    "../../../supabase/migrations/0128_duelo_participacion_puntos_columna.sql"
  ),
  "utf8"
);

describe("reparación de la columna del duelo RIV-00000037", () => {
  it("el perdedor de un duelo 2v2 vale 20 puntos", () => {
    expect(PUNTOS_DUELO_2V2.PERDEDOR).toBe(20);
    expect(
      calcularPuntosEvento({ formato: "duelo_2v2", ganador_duelo: false })
    ).toBe(20);
  });

  it("solo iguala la columna cuando el ledger y el desglose ya dicen 20", () => {
    expect(repairSql).toMatch(/l\.points = 20/);
    expect(repairSql).toMatch(/jp\.puntos_obtenidos = 0/);
    expect(repairSql).toMatch(/duelo_2v2_perdedor' = '20'/);
    expect(repairSql).toMatch(/puntos_obtenidos = 20/);
    expect(repairSql).not.toMatch(/UPDATE\s+public\.riviera_official_points_ledger/i);
    expect(repairSql).not.toMatch(/UPDATE\s+public\.riviera_official_player_totals/i);
    expect(repairSql).not.toMatch(/DELETE\s+FROM/i);
  });
});
