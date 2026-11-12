import fs from "fs";
import path from "path";

const repairSql = fs.readFileSync(
  path.join(
    __dirname,
    "../../../supabase/migrations/0129_resultado_detalle_playoff_y_duelo.sql"
  ),
  "utf8"
);

const archived = fs.readFileSync(
  path.join(
    __dirname,
    "../../../supabase/_archive/migrations/0107_liga_autorizacion_registro_jugador.sql"
  ),
  "utf8"
);

describe("reparación del resultado derivado", () => {
  it("conserva marcadores y no toca el ledger ni los puntos", () => {
    expect(repairSql).toContain("d6852631-9648-42df-91e3-83dc94b7cc18");
    expect(repairSql).toContain("fa99a5d2-1125-4ebb-851f-8f5682261a5b");
    expect(repairSql).toContain("c46767cf-74fd-4e03-9e39-5c5773319f20");
    expect(repairSql).toContain("RIV-00000037");
    expect(repairSql).toMatch(/jsonb_set\(v_item, '\{resultado\}'/);
    expect(repairSql).not.toMatch(/UPDATE\s+public\.riviera_official_points_ledger/i);
    expect(repairSql).not.toMatch(/UPDATE\s+public\.riviera_official_player_totals/i);
    expect(repairSql).not.toMatch(/SET\s+puntos_obtenidos/i);
    expect(repairSql).not.toMatch(/DELETE\s+FROM/i);
    expect(repairSql).toContain("games_favor");
    expect(repairSql).toContain("detalle_resultado_antes");
  });

  it("0107 quedó fuera del directorio ejecutable y sigue abortando", () => {
    expect(
      fs.existsSync(
        path.join(
          process.cwd(),
          "supabase/migrations/0107_liga_autorizacion_registro_jugador.sql"
        )
      )
    ).toBe(false);
    expect(archived).toContain("0107 descartada");
    expect(archived).toContain("RAISE EXCEPTION");
    expect(archived).toContain("Fuera de supabase/migrations");
    expect(archived).not.toContain("CREATE OR REPLACE FUNCTION");
  });
});
