jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock("../rivieraJugadores/aplicarRatingPartido", () => ({
  aplicarRatingDuelo2v2: jest.fn(),
  resolveDuelo2v2RatingPlayerIds: jest.fn(),
}));

import { aplicarRatingDuelo2v2, resolveDuelo2v2RatingPlayerIds } from "../rivieraJugadores/aplicarRatingPartido";
import { supabase } from "../supabaseClient";
import { ensureDuelo2v2RatingApplied } from "./duelo2v2RatingApply";

const mockFrom = supabase.from as jest.Mock;
const mockResolve = resolveDuelo2v2RatingPlayerIds as jest.MockedFunction<
  typeof resolveDuelo2v2RatingPlayerIds
>;
const mockApply = aplicarRatingDuelo2v2 as jest.MockedFunction<
  typeof aplicarRatingDuelo2v2
>;

const BASE_DUELO = {
  id: "duelo-uuid",
  estado: "finalizado" as const,
  ganador: "a" as const,
  nombre: "Reta test",
  pareja_a_j1_id: "j1",
  pareja_a_j2_id: "j2",
  pareja_b_j1_id: "j3",
  pareja_b_j2_id: "j4",
};

function mockRatingCount(count: number | null) {
  mockFrom.mockReturnValue({
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ count, error: null }),
    }),
  });
}

describe("ensureDuelo2v2RatingApplied", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockResolve.mockReset();
    mockApply.mockReset();
  });

  it("no aplica si el duelo no está finalizado", async () => {
    expect(
      await ensureDuelo2v2RatingApplied("org-1", {
        ...BASE_DUELO,
        estado: "en_juego",
      })
    ).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("re-aplica rating cuando no hay filas en historial", async () => {
    mockRatingCount(0);
    mockResolve.mockResolvedValue({
      j1: "j1",
      j2: "j2",
      j3: "j3",
      j4: "j4",
    });
    mockApply.mockResolvedValue(true);

    const ok = await ensureDuelo2v2RatingApplied("org-1", BASE_DUELO);

    expect(ok).toBe(true);
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "duelo-uuid", ganador: "a" })
    );
  });

  it("no re-aplica si ya hay 4 movimientos", async () => {
    mockRatingCount(4);

    expect(await ensureDuelo2v2RatingApplied("org-1", BASE_DUELO)).toBe(true);
    expect(mockApply).not.toHaveBeenCalled();
  });
});
