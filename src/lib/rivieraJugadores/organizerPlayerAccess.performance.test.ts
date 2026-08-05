/**
 * Regresión del incidente de rendimiento 2026-08-05 (ficha pública de
 * jugador, 15s+ de carga): findGrantedAccessMetaForJugador se llamaba una
 * vez por jugador del roster del club, cada vez re-pidiendo la lista
 * completa de grants del organizador (RPC list_public_grants_for_ranking)
 * y, en caso de no encontrarlo ahí, una consulta directa adicional a
 * organizer_player_access. Estas pruebas cubren el nuevo camino batched
 * (listOrganizerPlayerAccessRowsForJugadorIds) y confirman que pasar
 * preloadedGrants/grantsFullyResolved no cambia el resultado -- solo evita
 * las llamadas repetidas.
 */
/* eslint-disable import/first -- jest.mock debe preceder los imports que mockea */
jest.mock("../supabaseClient", () => ({
  supabase: { rpc: jest.fn(), from: jest.fn() },
  supabasePublicRead: { rpc: jest.fn(), from: jest.fn() },
}));

import { supabase, supabasePublicRead } from "../supabaseClient";
import {
  findGrantedAccessMetaForJugador,
  listOrganizerPlayerAccessRowsForJugadorIds,
  type OrganizerPlayerAccessRow,
} from "./organizerPlayerAccess";
/* eslint-enable import/first */

function chainReturning(result: { data: unknown; error: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.or = jest.fn().mockResolvedValue(result);
  return chain;
}

const ROW: OrganizerPlayerAccessRow = {
  id: "grant-1",
  jugador_id: "src-1",
  owner_organizador_id: "owner-org",
  local_jugador_id: "local-1",
  local_display_name: "Local Display",
  local_category: "6ta_fuerza",
};

describe("listOrganizerPlayerAccessRowsForJugadorIds", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("una sola consulta con .in() para varios ids, no una por id", async () => {
    const chain = chainReturning({ data: [ROW], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await listOrganizerPlayerAccessRowsForJugadorIds("org-1", [
      "src-1",
      "local-1",
      "unrelated",
    ]);

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(chain.or).toHaveBeenCalledTimes(1);
    const [orExpr] = chain.or.mock.calls[0];
    expect(orExpr).toContain("jugador_id.in.(src-1,local-1,unrelated)");
    expect(orExpr).toContain("local_jugador_id.in.(src-1,local-1,unrelated)");
    expect(result).toEqual([ROW]);
  });

  it("ids vacíos o duplicados: no dispara la consulta / los deduplica", async () => {
    const empty = await listOrganizerPlayerAccessRowsForJugadorIds("org-1", []);
    expect(empty).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();

    const chain = chainReturning({ data: [], error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);
    await listOrganizerPlayerAccessRowsForJugadorIds("org-1", [
      "src-1",
      "src-1",
      " src-1 ",
    ]);
    const [orExpr] = chain.or.mock.calls[0];
    expect(orExpr).toBe("jugador_id.in.(src-1),local_jugador_id.in.(src-1)");
  });

  it("error de tabla ausente se degrada a lista vacía, no lanza", async () => {
    const chain = chainReturning({
      data: null,
      error: { code: "42P01", message: "relation does not exist" },
    });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    await expect(
      listOrganizerPlayerAccessRowsForJugadorIds("org-1", ["src-1"])
    ).resolves.toEqual([]);
  });
});

describe("findGrantedAccessMetaForJugador — preloadedGrants/grantsFullyResolved", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("con preloadedGrants: no llama a la RPC de grants ni a la tabla directa", async () => {
    const meta = await findGrantedAccessMetaForJugador("org-1", "src-1", {
      preloadedGrants: [ROW],
    });

    expect(meta).toEqual({
      accessId: "grant-1",
      sourceJugadorId: "src-1",
      ownerOrganizadorId: "owner-org",
      localJugadorId: "local-1",
      localDisplayName: "Local Display",
      localCategory: "6ta_fuerza",
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(supabasePublicRead.rpc).not.toHaveBeenCalled();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("mismo resultado que sin preloadedGrants para el caso 'encontrado en la lista' (no cambia el valor, solo el costo)", async () => {
    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [ROW],
      error: null,
    });

    const withoutPreload = await findGrantedAccessMetaForJugador(
      "org-1",
      "src-1"
    );
    const withPreload = await findGrantedAccessMetaForJugador(
      "org-1",
      "src-1",
      { preloadedGrants: [ROW] }
    );

    expect(withPreload).toEqual(withoutPreload);
  });

  it("grantsFullyResolved:true evita la consulta directa cuando el id no está en preloadedGrants", async () => {
    const result = await findGrantedAccessMetaForJugador("org-1", "missing", {
      preloadedGrants: [ROW],
      grantsFullyResolved: true,
    });

    expect(result).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("sin options: preserva el comportamiento anterior (RPC + fallback directo si no aparece)", async () => {
    (supabasePublicRead.rpc as jest.Mock).mockResolvedValue({
      data: [],
      error: null,
    });
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.or = jest.fn().mockReturnValue(chain);
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: ROW, error: null });
    (supabase.from as jest.Mock).mockReturnValue(chain);

    const result = await findGrantedAccessMetaForJugador("org-1", "src-1");

    expect(result?.accessId).toBe("grant-1");
    expect(supabasePublicRead.rpc).toHaveBeenCalledWith(
      "list_public_grants_for_ranking",
      { p_grantee_organizador_id: "org-1" }
    );
    expect(chain.maybeSingle).toHaveBeenCalledTimes(1);
  });
});
