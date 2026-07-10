import {
  clearDuelo2v2CreateDraft,
  DUELO_2V2_DRAFT_TTL_MS,
  duelo2v2DraftStorageKey,
  isDuelo2v2CreateDraftExpired,
  readDuelo2v2CreateDraft,
  rehydrateDueloPairFromDraft,
  writeDuelo2v2CreateDraft,
} from "./duelo2v2CreateDraft";
import type { RivieraJugador } from "../rivieraJugadores/types";

function mockStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function jugador(id: string): RivieraJugador {
  return {
    id,
    nombre: id,
    slug: id,
    foto_url: null,
    email: null,
    telefono: null,
    whatsapp: null,
    nivel: "intermedio",
    categoria: "open",
    edad: null,
    mano_dominante: null,
    en_cancha: null,
    pais_codigo: null,
    instagram_url: null,
    facebook_url: null,
    tiktok_url: null,
    visible_publico: false,
    suma_ranking: true,
    genero: "M",
    fecha_nacimiento: null,
    club: null,
    organizador_id: "org-1",
    estado: "activo",
    legacy_player_id: null,
    legacy_liga_jugador_id: null,
    created_at: "",
    updated_at: "",
    rating: 3,
    rating_partidos: 0,
    rating_fiabilidad: 0.2,
  };
}

describe("duelo2v2CreateDraft", () => {
  const ORG = "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d";

  it("guarda y lee un borrador por organizador", () => {
    const storage = mockStorage();
    writeDuelo2v2CreateDraft(
      ORG,
      {
        nombre: "Test duelo",
        cancha: "1",
        draftDate: "2026-07-09",
        draftTimeStart: "15:00",
        draftTimeEnd: "17:00",
        pairA: { j1Id: "j1", j2Id: "j2" },
        pairB: null,
      },
      storage,
      "2026-07-09T12:00:00.000Z"
    );

    expect(storage.getItem(duelo2v2DraftStorageKey(ORG))).toBeTruthy();
    const draft = readDuelo2v2CreateDraft(ORG, storage);
    expect(draft?.nombre).toBe("Test duelo");
    expect(draft?.pairA).toEqual({ j1Id: "j1", j2Id: "j2" });
    expect(draft?.pairB).toBeNull();
  });

  it("expira borradores de más de 24h y los elimina", () => {
    const storage = mockStorage();
    const savedAt = new Date(Date.now() - DUELO_2V2_DRAFT_TTL_MS - 1000).toISOString();
    writeDuelo2v2CreateDraft(
      ORG,
      {
        nombre: "Viejo",
        cancha: "1",
        draftDate: "2026-07-09",
        draftTimeStart: "15:00",
        draftTimeEnd: "17:00",
        pairA: null,
        pairB: null,
      },
      storage,
      savedAt
    );

    expect(isDuelo2v2CreateDraftExpired({ savedAt } as never)).toBe(true);
    expect(readDuelo2v2CreateDraft(ORG, storage)).toBeNull();
    expect(storage.getItem(duelo2v2DraftStorageKey(ORG))).toBeNull();
  });

  it("clearDuelo2v2CreateDraft elimina el borrador", () => {
    const storage = mockStorage();
    writeDuelo2v2CreateDraft(
      ORG,
      {
        nombre: "X",
        cancha: "1",
        draftDate: "2026-07-09",
        draftTimeStart: "15:00",
        draftTimeEnd: "17:00",
        pairA: null,
        pairB: null,
      },
      storage
    );
    clearDuelo2v2CreateDraft(ORG, storage);
    expect(readDuelo2v2CreateDraft(ORG, storage)).toBeNull();
  });

  it("rehydrateDueloPairFromDraft devuelve null si falta algún jugador", () => {
    const jugadores = [jugador("j1")];
    expect(
      rehydrateDueloPairFromDraft(jugadores, { j1Id: "j1", j2Id: "missing" })
    ).toBeNull();
    expect(
      rehydrateDueloPairFromDraft(jugadores, { j1Id: "j1", j2Id: "j2" })
    ).toBeNull();
    expect(
      rehydrateDueloPairFromDraft([jugador("j1"), jugador("j2")], {
        j1Id: "j1",
        j2Id: "j2",
      })
    ).toEqual({
      j1: jugador("j1"),
      j2: jugador("j2"),
    });
  });
});
