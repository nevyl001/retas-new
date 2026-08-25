/**
 * Auditoría final generalización N-variable (A–F).
 * No cambia reglas deportivas; valida scheduling, seeds, edge cases y jornadas.
 */
import * as fs from "fs";
import * as path from "path";
import {
  assertPlayoffsFixtureInvariants,
  buildPlayoffsRegularFixture,
  expectedRegularMatchCount,
  inferTeamCountFromRegularMatchTotal,
  totalRegularJornadas,
} from "./parejasFijasPlayoffsFixture";
import {
  assertNoTeamDoubleBookedInRound,
  packPlayoffsJornadaBergerBlocks,
} from "./parejasFijasPlayoffsSchedule";
import {
  buildPlayoffCrosses,
  parsePlayoffSeeds,
  PLAYOFFS_SEEDS_BYE_KEY,
  playoffsJornadaNumero,
  seedCount,
  seedsFromRankingOrder,
} from "./parejasFijasPlayoffsBracket";
import { ligaJornadaTitulo } from "./types";

function teams(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `T${i + 1}`);
}

function letters(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
}

describe("A. Scheduling — sin doble-booking + bloques Berger", () => {
  it.each([8, 10, 12, 15])(
    "N=%i con 3 canchas: no solapa pareja en misma ronda; bloques Berger separados",
    (n) => {
      const fixture = buildPlayoffsRegularFixture(teams(n));
      assertPlayoffsFixtureInvariants(fixture, teams(n));

      for (const j of fixture.jornadas) {
        expect(j.bergerBlocks.length).toBeGreaterThanOrEqual(1);
        expect(j.bergerBlocks.length).toBeLessThanOrEqual(2);
        expect(j.matches).toHaveLength(
          j.bergerBlocks.reduce((a, b) => a + b.length, 0)
        );

        // Dentro de cada ronda Berger, con N par cada equipo juega ≤1 partido.
        for (const block of j.bergerBlocks) {
          const ids = block.flatMap((m) => [m.equipo1_id, m.equipo2_id]);
          expect(new Set(ids).size).toBe(ids.length);
        }

        const packed = packPlayoffsJornadaBergerBlocks(j.bergerBlocks, 3);
        expect(packed).toHaveLength(j.matches.length);
        expect(() => assertNoTeamDoubleBookedInRound(packed)).not.toThrow();

        // Separación lógica: max ronda del bloque0 < min ronda del bloque1
        const block0Keys = new Set(
          (j.bergerBlocks[0] ?? []).map(
            (m) => `${m.equipo1_id}|${m.equipo2_id}`
          )
        );
        const r0 = packed
          .filter((m) => block0Keys.has(`${m.equipo1_id}|${m.equipo2_id}`))
          .map((m) => m.ronda);
        const r1 = packed
          .filter((m) => !block0Keys.has(`${m.equipo1_id}|${m.equipo2_id}`))
          .map((m) => m.ronda);
        const bergerSeparated =
          j.bergerBlocks.length < 2 ||
          (r0.length > 0 &&
            r1.length > 0 &&
            Math.max(...r0) < Math.min(...r1));
        expect(bergerSeparated).toBe(true);

        // 3 canchas ⇒ ≤3 partidos por ronda horaria
        const byRonda = new Map<number, number>();
        for (const m of packed) {
          byRonda.set(m.ronda, (byRonda.get(m.ronda) ?? 0) + 1);
        }
        for (const [, c] of Array.from(byRonda.entries())) {
          expect(c).toBeLessThanOrEqual(3);
        }
      }
    }
  );
});

describe("B. Seguridad 0031 vs 0030 (freeze RPC)", () => {
  function extractFreezeBody(sql: string): string {
    const marker = "liga_playoffs_freeze_and_generate_jornada9";
    const idx = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${marker}`);
    expect(idx).toBeGreaterThanOrEqual(0);
    return sql.slice(idx);
  }

  function assertSecurityContract(body: string, label: string) {
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path\s*=\s*public/);
    expect(body).toMatch(/auth\.uid\(\)\s+IS NULL/);
    expect(body).toMatch(/organizador_id/);
    expect(body).toMatch(/IS DISTINCT FROM auth\.uid\(\)/);
    expect(body).toMatch(/FOR UPDATE/);
    expect(body).toMatch(
      /REVOKE ALL ON FUNCTION public\.liga_playoffs_freeze_and_generate_jornada9\([\s\S]*?\) FROM PUBLIC,\s*anon/
    );
    expect(body).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.liga_playoffs_freeze_and_generate_jornada9\([\s\S]*?\) TO authenticated/
    );
    // No ampliar a anon
    expect(body).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.liga_playoffs_freeze_and_generate_jornada9\([\s\S]*?\) TO anon/
    );
    void label;
  }

  it("0030 y 0031 conservan el mismo contrato de seguridad efectiva", () => {
    const root = path.join(__dirname, "../../../supabase/migrations");
    const m30 = fs.readFileSync(
      path.join(root, "0030_liga_parejas_fijas_playoffs.sql"),
      "utf8"
    );
    const m31 = fs.readFileSync(
      path.join(root, "0031_liga_parejas_fijas_playoffs_n_variable.sql"),
      "utf8"
    );
    const b30 = extractFreezeBody(m30);
    const b31 = extractFreezeBody(m31);
    assertSecurityContract(b30, "0030");
    assertSecurityContract(b31, "0031");
    // Controles de fase regular siguen filtrando fase='regular'
    expect(b31).toMatch(/fase\s*=\s*'regular'/);
    expect(b31).toMatch(/v_playoff_jornada\s*:=\s*v_last_regular\s*\+\s*1/);
    expect(b31).not.toMatch(/numero\s*=\s*9/);
  });
});

describe("C. Conteo regular N(N-1) solo fase regular", () => {
  it("infiere N desde total de partidos regulares", () => {
    expect(inferTeamCountFromRegularMatchTotal(12)).toBe(4); // 4*3
    expect(inferTeamCountFromRegularMatchTotal(56)).toBe(8);
    expect(inferTeamCountFromRegularMatchTotal(90)).toBe(10);
    expect(inferTeamCountFromRegularMatchTotal(132)).toBe(12);
    expect(inferTeamCountFromRegularMatchTotal(210)).toBe(15);
    expect(inferTeamCountFromRegularMatchTotal(55)).toBeNull();
    expect(inferTeamCountFromRegularMatchTotal(57)).toBeNull();
  });

  it("fixture.matchCount === N(N-1) y no incluye BYE", () => {
    for (const n of [4, 5, 7, 8, 10, 12, 15]) {
      const f = buildPlayoffsRegularFixture(teams(n));
      expect(f.matchCount).toBe(expectedRegularMatchCount(n));
      expect(inferTeamCountFromRegularMatchTotal(f.matchCount)).toBe(n);
    }
  });
});

describe("D. playoff_seeds — no Object.keys().length", () => {
  it("seedCount ignora classification_bye", () => {
    const seeds = seedsFromRankingOrder(letters(15));
    expect(Object.keys(seeds).length).toBe(16); // 1..15 + bye
    expect(seedCount(seeds)).toBe(15);
    expect(parsePlayoffSeeds(seeds)).not.toBeNull();
    expect(seedCount(parsePlayoffSeeds(seeds)!)).toBe(15);
  });

  it("parsePlayoffSeeds rechaza huecos y duplicados; acepta bye válido", () => {
    expect(
      parsePlayoffSeeds({
        "1": "a",
        "2": "b",
        "3": "c",
        "4": "d",
        "6": "f",
      })
    ).toBeNull();
    expect(
      parsePlayoffSeeds({
        "1": "a",
        "2": "b",
        "3": "c",
        "4": "a",
      })
    ).toBeNull();
    const ok = parsePlayoffSeeds({
      "1": "a",
      "2": "b",
      "3": "c",
      "4": "d",
      "5": "e",
      [PLAYOFFS_SEEDS_BYE_KEY]: "e",
    });
    expect(ok).not.toBeNull();
    expect(seedCount(ok!)).toBe(5);
    expect(
      parsePlayoffSeeds({
        "1": "a",
        "2": "b",
        "3": "c",
        "4": "d",
        [PLAYOFFS_SEEDS_BYE_KEY]: "zzz",
      })
    ).toBeNull();
  });
});

describe("E. Edge cases bracket N=4/5/7 + matriz 8/10/12/15", () => {
  it("N=4: solo SF1/SF2; cero CL; cero BYE", () => {
    const { crosses, byeSeed } = buildPlayoffCrosses(
      seedsFromRankingOrder(letters(4))
    );
    expect(byeSeed).toBeNull();
    expect(crosses.map((c) => c.slot)).toEqual(["SF1", "SF2"]);
    expect(crosses.filter((c) => c.slot.startsWith("CL"))).toHaveLength(0);
  });

  it("N=5: SF1/SF2; seed5 BYE; cero CL", () => {
    const seeds = seedsFromRankingOrder(letters(5));
    const { crosses, byeSeed, byeEquipoId } = buildPlayoffCrosses(seeds);
    expect(crosses.map((c) => c.slot)).toEqual(["SF1", "SF2"]);
    expect(byeSeed).toBe(5);
    expect(byeEquipoId).toBe("E");
    expect(seeds[PLAYOFFS_SEEDS_BYE_KEY]).toBe("E");
  });

  it("N=7: SF1/SF2; CL1=5v7; seed6 BYE", () => {
    const seeds = seedsFromRankingOrder(letters(7));
    const { crosses, byeSeed, byeEquipoId } = buildPlayoffCrosses(seeds);
    expect(byeSeed).toBe(6);
    expect(byeEquipoId).toBe("F");
    expect(
      crosses.map((c) => [c.slot, c.seedHome, c.seedAway])
    ).toEqual([
      ["SF1", 1, 4],
      ["SF2", 2, 3],
      ["CL1", 5, 7],
    ]);
  });

  it.each([
    [8, ["CL1", 5, 8], ["CL2", 6, 7], null],
    [10, ["CL1", 5, 10], ["CL3", 7, 8], null],
    [12, ["CL1", 5, 12], ["CL4", 8, 9], null],
    [15, ["CL1", 5, 15], ["CL5", 9, 11], 10],
  ] as const)(
    "N=%i cruces extremos",
    (n, firstCl, lastCl, bye) => {
      const { crosses, byeSeed } = buildPlayoffCrosses(
        seedsFromRankingOrder(letters(n))
      );
      const cls = crosses.filter((c) => c.slot.startsWith("CL"));
      expect(cls[0]).toMatchObject({
        slot: firstCl[0],
        seedHome: firstCl[1],
        seedAway: firstCl[2],
      });
      expect(cls[cls.length - 1]).toMatchObject({
        slot: lastCl[0],
        seedHome: lastCl[1],
        seedAway: lastCl[2],
      });
      expect(byeSeed).toBe(bye);
      expect(crosses.filter((c) => c.slot === "SF1" || c.slot === "SF2")).toHaveLength(
        2
      );
    }
  );
});

describe("F. Jornada dinámica lastRegular+1/+2", () => {
  it.each([
    [4, 4, 5, 6],
    [8, 8, 9, 10],
    [10, 10, 11, 12],
    [15, 16, 17, 18],
  ])(
    "N=%i → regular=%i playoffs=%i final=%i",
    (n, lastReg, playoffs, finalNum) => {
      expect(totalRegularJornadas(n)).toBe(lastReg);
      expect(playoffsJornadaNumero(lastReg, "playoffs")).toBe(playoffs);
      expect(playoffsJornadaNumero(lastReg, "final")).toBe(finalNum);
      expect(
        ligaJornadaTitulo(playoffs, "parejas_fijas_playoffs", n)
      ).toMatch(/Semifinales/);
      expect(
        ligaJornadaTitulo(finalNum, "parejas_fijas_playoffs", n)
      ).toMatch(/Gran Final/);
    }
  );

  it("N≠8: números salen de lastRegular+1/+2 (N=10 → 11/12)", () => {
    for (const n of [4, 5, 7, 10, 12, 15]) {
      const lastReg = totalRegularJornadas(n);
      expect(playoffsJornadaNumero(lastReg, "playoffs")).toBe(lastReg + 1);
      expect(playoffsJornadaNumero(lastReg, "final")).toBe(lastReg + 2);
    }
    // Coincidencia N=7 → también 9/10; N=10 no
    expect(playoffsJornadaNumero(totalRegularJornadas(10), "playoffs")).toBe(11);
    expect(playoffsJornadaNumero(totalRegularJornadas(10), "final")).toBe(12);
    expect(playoffsJornadaNumero(totalRegularJornadas(15), "playoffs")).toBe(17);
  });

  it("N=4: lastRegular=4 (no J9)", () => {
    expect(totalRegularJornadas(4)).toBe(4);
    expect(playoffsJornadaNumero(4, "playoffs")).toBe(5);
    expect(playoffsJornadaNumero(4, "final")).toBe(6);
  });
});
