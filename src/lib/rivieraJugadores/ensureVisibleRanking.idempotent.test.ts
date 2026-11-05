/**
 * ensureRivieraJugadorVisibleEnRanking no debe reescribir estado=activo
 * cuando la fila ya está activa. El PATCH con estado=neq.archivado era la
 * escritura repetida al abrir jornadas cerradas.
 */
/* eslint-disable import/first -- jest.mock precede al import del servicio */
jest.mock("../supabaseClient", () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
  supabasePublicRead: { from: jest.fn(), rpc: jest.fn() },
}));

import { supabase } from "../supabaseClient";
import { ensureRivieraJugadorVisibleEnRanking } from "./rivieraJugadoresService";

const fromMock = supabase.from as jest.Mock;

function mockJugadorRead(row: {
  suma_ranking: boolean;
  estado: string;
} | null) {
  const update = jest.fn();
  fromMock.mockImplementation((table: string) => {
    if (table !== "riviera_jugadores") {
      throw new Error(`tabla inesperada: ${table}`);
    }
    const builder: {
      select: jest.Mock;
      eq: jest.Mock;
      neq: jest.Mock;
      maybeSingle: jest.Mock;
      update: jest.Mock;
    } = {
      select: jest.fn(),
      eq: jest.fn(),
      neq: jest.fn(() => Promise.resolve({ error: null })),
      maybeSingle: jest.fn(async () => ({ data: row, error: null })),
      update: jest.fn(),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.update.mockImplementation((payload: { estado: string }) => {
      update(payload);
      return builder;
    });
    return builder;
  });
  return update;
}

describe("ensureRivieraJugadorVisibleEnRanking", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("no escribe si el jugador ya está activo", async () => {
    const update = mockJugadorRead({ suma_ranking: true, estado: "activo" });

    await ensureRivieraJugadorVisibleEnRanking("jugador-activo");

    expect(update).not.toHaveBeenCalled();
  });

  it("promueve a activo a un invitado que suma ranking", async () => {
    const update = mockJugadorRead({ suma_ranking: true, estado: "invitado" });

    await ensureRivieraJugadorVisibleEnRanking("jugador-invitado");

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ estado: "activo" });
  });

  it("no toca archivados ni quien no suma ranking", async () => {
    const archived = mockJugadorRead({ suma_ranking: true, estado: "archivado" });
    await ensureRivieraJugadorVisibleEnRanking("archivado");
    expect(archived).not.toHaveBeenCalled();

    const off = mockJugadorRead({ suma_ranking: false, estado: "invitado" });
    await ensureRivieraJugadorVisibleEnRanking("sin-ranking");
    expect(off).not.toHaveBeenCalled();
  });
});
