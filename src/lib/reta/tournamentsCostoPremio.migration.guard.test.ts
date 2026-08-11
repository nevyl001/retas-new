/**
 * Guard offline: 0027 agrega costo/premio + mostrar_* idempotentes.
 * No ejecuta SQL contra prod.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { tournamentToFormValues } from "./updateRetaConfig";
import type { Tournament } from "../db/types";

const MIGRATION = join(
  __dirname,
  "../../../supabase/migrations/0027_tournaments_costo_premio.sql"
);

describe("tournaments costo/premio (0027)", () => {
  const sql = readFileSync(MIGRATION, "utf8");

  it("migración idempotente ADD COLUMN IF NOT EXISTS", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS costo text NULL/);
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS mostrar_costo boolean NOT NULL DEFAULT false/
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS premio text NULL/);
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS mostrar_premio boolean NOT NULL DEFAULT false/
    );
  });

  it("form defaults: mostrar_costo/premio off si null o ausente", () => {
    const base = {
      id: "t1",
      name: "Reta",
      courts: 2,
      is_started: false,
      is_finished: false,
      user_id: "u1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    } as Tournament;

    const absent = tournamentToFormValues(base);
    expect(absent.mostrar_costo).toBe(false);
    expect(absent.mostrar_premio).toBe(false);
    expect(absent.costo).toBe("");
    expect(absent.premio).toBe("");

    const explicitOff = tournamentToFormValues({
      ...base,
      costo: "$100",
      mostrar_costo: false,
      premio: "Pelotas",
      mostrar_premio: false,
    });
    expect(explicitOff.mostrar_costo).toBe(false);
    expect(explicitOff.mostrar_premio).toBe(false);
    expect(explicitOff.costo).toBe("$100");
    expect(explicitOff.premio).toBe("Pelotas");

    const on = tournamentToFormValues({
      ...base,
      costo: "$200",
      mostrar_costo: true,
      premio: "Trofeo",
      mostrar_premio: true,
    });
    expect(on.mostrar_costo).toBe(true);
    expect(on.mostrar_premio).toBe(true);
  });
});
