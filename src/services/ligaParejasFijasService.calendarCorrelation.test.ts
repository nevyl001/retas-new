/**
 * Regresión: en `insertJornadasForLigaParejasFijas`, jornada -> id se
 * correlaciona por `numero` y equipo -> pareja_id se correlaciona por
 * `equipo_id` (ambos leídos del propio RETURNING), nunca por la posición del
 * arreglo. El fake de Supabase invierte deliberadamente el orden de cada
 * insert para probarlo.
 */

jest.mock("../lib/supabaseClient", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), auth: { getUser: jest.fn() } },
}));

import { supabase } from "../lib/supabaseClient";
import { insertJornadasForLigaParejasFijas } from "./ligaParejasFijasService";
import type { LigaEquipo } from "../lib/liga/types";

type Row = Record<string, unknown>;

function makeShuffledTables() {
  const tables: Record<string, Row[]> = {};
  const seq: Record<string, number> = {};

  function nextId(table: string): string {
    seq[table] = (seq[table] ?? 0) + 1;
    return `${table}-${seq[table]}`;
  }

  function builder(table: string, payload: unknown) {
    const api: any = {
      select() {
        return api;
      },
      then(resolve: (v: { data: unknown; error: unknown }) => void) {
        tables[table] = tables[table] ?? [];
        const list = Array.isArray(payload) ? payload : [payload];
        const created = list.map((r) => ({ id: nextId(table), ...(r as Row) }));
        tables[table].push(...created);
        resolve({ data: [...created].reverse(), error: null });
      },
    };
    return api;
  }

  return {
    getTable: (name: string) => tables[name] ?? [],
    from(table: string) {
      return { insert: (payload: unknown) => builder(table, payload) };
    },
  };
}

function equipo(id: string, jugador1_id: string, jugador2_id: string): LigaEquipo {
  return {
    id,
    liga_id: "liga-x",
    nombre: null,
    jugador1_id,
    jugador2_id,
    puntos: 0,
    partidos_jugados: 0,
    partidos_ganados: 0,
    partidos_perdidos: 0,
    games_favor: 0,
    games_contra: 0,
    diferencia_games: 0,
    created_at: "",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("insertJornadasForLigaParejasFijas — correlación sin depender del orden del RETURNING", () => {
  it("cada partido queda con la pareja de SU equipo, y cada pareja con la jornada correcta", async () => {
    const fake = makeShuffledTables();
    (supabase.from as jest.Mock).mockImplementation(fake.from);

    const equipos = [
      equipo("eq-1", "j1", "j2"),
      equipo("eq-2", "j3", "j4"),
      equipo("eq-3", "j5", "j6"),
      equipo("eq-4", "j7", "j8"),
    ];

    await insertJornadasForLigaParejasFijas("liga-x", equipos, 1, 2);

    const jornadas = fake.getTable("liga_jornadas");
    const parejas = fake.getTable("liga_jornada_parejas");
    const partidos = fake.getTable("liga_partidos");

    expect(jornadas.length).toBeGreaterThan(0);

    const jornadaById = new Map(jornadas.map((j) => [j.id, j]));
    const parejaById = new Map(parejas.map((p) => [p.id, p]));

    // Cada pareja apunta a una jornada real de esta liga.
    for (const pareja of parejas) {
      expect(jornadaById.has(pareja.jornada_id as string)).toBe(true);
    }

    // Cada partido referencia dos parejas reales, y esas parejas
    // corresponden exactamente a los equipos que definió el calendario
    // (nunca al equipo de otra pareja, que es lo que pasaría si se hubiera
    // correlacionado por índice contra el arreglo invertido).
    for (const partido of partidos) {
      const p1 = parejaById.get(partido.pareja1_id as string);
      const p2 = parejaById.get(partido.pareja2_id as string);
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p1!.jornada_id).toBe(partido.jornada_id);
      expect(p2!.jornada_id).toBe(partido.jornada_id);

      const eq1 = equipos.find((e) => e.id === p1!.equipo_id)!;
      const eq2 = equipos.find((e) => e.id === p2!.equipo_id)!;
      expect(p1!.jugador1_id).toBe(eq1.jugador1_id);
      expect(p1!.jugador2_id).toBe(eq1.jugador2_id);
      expect(p2!.jugador1_id).toBe(eq2.jugador1_id);
      expect(p2!.jugador2_id).toBe(eq2.jugador2_id);
    }
  });
});
