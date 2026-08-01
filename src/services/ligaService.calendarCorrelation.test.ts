/**
 * Regresión: la correlación jornada -> parejas en `insertJornadasForLiga`
 * (liga individual rotativa) ya no depende del orden del RETURNING de un
 * insert multi-fila — se reconstruye por `numero` (clave estable, única por
 * liga_id). Este test devuelve las filas del insert de jornadas en orden
 * DELIBERADAMENTE distinto al de entrada para probarlo: si el código
 * volviera a asumir `returnedRows[index]`, las parejas quedarían pegadas a
 * la jornada equivocada.
 */

import { supabase } from "../lib/supabaseClient";
import { insertJornadasForLiga } from "./ligaService";

// jest.mock se hoistea automáticamente por encima de los imports (Jest +
// babel-plugin-jest-hoist), así que escribirlo después es equivalente en
// tiempo de ejecución y respeta la regla import/first.
jest.mock("../lib/supabaseClient", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), auth: { getUser: jest.fn() } },
}));

type Row = Record<string, unknown>;

function makeShuffledTables(seedTables: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seedTables).map(([k, v]) => [k, v.map((r) => ({ ...r }))])
  );
  const seq: Record<string, number> = {};

  function nextId(table: string): string {
    seq[table] = (seq[table] ?? 0) + 1;
    return `${table}-${seq[table]}`;
  }

  function builder(table: string, op: "select" | "insert", payload?: unknown) {
    const filters: Array<(row: Row) => boolean> = [];

    const api: any = {
      select() {
        return api;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return api;
      },
      in(col: string, vals: unknown[]) {
        const set = new Set(vals);
        filters.push((r) => set.has(r[col]));
        return api;
      },
      then(resolve: (v: { data: unknown; error: unknown }) => void) {
        tables[table] = tables[table] ?? [];
        let data: unknown;
        if (op === "insert") {
          const list = Array.isArray(payload) ? payload : [payload];
          const created = list.map((r) => ({ id: nextId(table), ...(r as Row) }));
          tables[table].push(...created);
          // Orden deliberadamente invertido respecto al de entrada: prueba
          // que el código correlaciona por clave de negocio, no por índice.
          data = [...created].reverse();
        } else {
          data = tables[table].filter((r) => filters.every((f) => f(r)));
        }
        resolve({ data, error: null });
      },
    };
    return api;
  }

  return {
    getTable: (name: string) => tables[name] ?? [],
    from(table: string) {
      return {
        select: () => builder(table, "select"),
        insert: (payload: unknown) => builder(table, "insert", payload),
      };
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("insertJornadasForLiga — correlación sin depender del orden del RETURNING", () => {
  it("cada pareja queda asociada a SU jornada (numero) aunque el insert devuelva las filas en otro orden", async () => {
    const fake = makeShuffledTables();
    (supabase.from as jest.Mock).mockImplementation(fake.from);

    const players = ["p1", "p2", "p3", "p4", "p5", "p6"]; // 5 rondas round-robin
    await insertJornadasForLiga("liga-x", players);

    const jornadas = fake.getTable("liga_jornadas");
    const parejas = fake.getTable("liga_jornada_parejas");

    expect(jornadas).toHaveLength(5);
    // Cada jornada tiene 3 parejas (6 jugadores / 2).
    expect(parejas).toHaveLength(15);

    const jornadaById = new Map(jornadas.map((j) => [j.id, j]));

    for (const pareja of parejas) {
      const jornada = jornadaById.get(pareja.jornada_id as string);
      expect(jornada).toBeDefined();
      expect(jornada!.liga_id).toBe("liga-x");
    }

    // Cada numero de jornada (1..5) tiene exactamente 3 parejas asociadas —
    // si la correlación se hubiera hecho por índice contra el arreglo
    // invertido, algunas jornadas quedarían con 0 o con parejas de otra.
    for (let numero = 1; numero <= 5; numero++) {
      const jornada = jornadas.find((j) => j.numero === numero)!;
      const susParejas = parejas.filter((p) => p.jornada_id === jornada.id);
      expect(susParejas).toHaveLength(3);
    }
  });

  it("no reutiliza el índice del arreglo devuelto: el numero mayor no queda pegado a la primera jornada", async () => {
    const fake = makeShuffledTables();
    (supabase.from as jest.Mock).mockImplementation(fake.from);

    await insertJornadasForLiga("liga-y", ["a", "b", "c", "d"]); // 3 rondas

    const jornadas = fake.getTable("liga_jornadas");
    const parejas = fake.getTable("liga_jornada_parejas");
    const jornadaNumero3 = jornadas.find((j) => j.numero === 3)!;
    const parejasDeLaJornada3 = parejas.filter((p) => p.jornada_id === jornadaNumero3.id);

    // Con el insert devuelto en orden invertido, si el código usara
    // returnedRows[index] la jornada número 3 habría quedado con las
    // parejas de la jornada número 1 (o vacía). Debe tener las suyas.
    expect(parejasDeLaJornada3).toHaveLength(2); // 4 jugadores / 2
  });
});
