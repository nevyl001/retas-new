import { supabase } from "../supabaseClient";
import { fetchRivieraJugadorProfilesByIds } from "../rivieraJugadores/publicPlayerAvatars";
import {
  clearPublicEntryFotoCacheForTests,
  enrichPublicEntryPhotos,
} from "./retaAbiertaService";
import type { OpenRegistrationPublicDto } from "./types";

jest.mock("../supabaseClient", () => ({
  supabase: {
    rpc: jest.fn(),
  },
  supabasePublicRead: {
    rpc: jest.fn(),
  },
}));

jest.mock("../rivieraJugadores/publicPlayerAvatars", () => ({
  fetchRivieraJugadorProfilesByIds: jest.fn().mockResolvedValue(new Map()),
}));

const baseDto = (): OpenRegistrationPublicDto => ({
  ok: true,
  slug: "ra-hack",
  mode_type: "reta",
  entity_id: "t1",
  tournament_id: "t1",
  organizador_id: "o1",
  name: "Hack The Game",
  description: null,
  status: "open",
  capacity: 8,
  confirmed_count: 1,
  waitlist_count: 0,
  spots_left: 7,
  waitlist_enabled: true,
  approval_required: false,
  registration_deadline: null,
  scheduled_at: null,
  duration_minutes: 120,
  category_label: null,
  rama_label: null,
  location_label: null,
  display_rating: true,
  display_photo: true,
  entries: [
    {
      id: "e1",
      status: "confirmed",
      riviera_id: "RIV-00000011",
      riviera_jugador_id: "j1",
      nombre: "Nevyl",
      foto_url: null,
      rating: 3.2,
      categoria: "5ta Fuerza",
    },
  ],
  is_finished: false,
  is_started: false,
});

describe("enrichPublicEntryPhotos", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearPublicEntryFotoCacheForTests();
  });

  it("rellena foto desde perfiles públicos (sin RPC preview rate-limited)", async () => {
    (fetchRivieraJugadorProfilesByIds as jest.Mock).mockResolvedValue(
      new Map([
        [
          "j1",
          {
            fotoUrl: "https://cdn.example/nevyl.jpg",
            nombre: "Nevyl",
          },
        ],
      ])
    );

    const out = await enrichPublicEntryPhotos(baseDto());
    expect(out.entries[0]?.foto_url).toBe("https://cdn.example/nevyl.jpg");
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(fetchRivieraJugadorProfilesByIds).toHaveBeenCalled();
  });

  it("NO llama preview_riviera_id aunque falte foto (protege cupo anti-enumeración)", async () => {
    (fetchRivieraJugadorProfilesByIds as jest.Mock).mockResolvedValue(new Map());
    const out = await enrichPublicEntryPhotos(baseDto());
    expect(out.entries[0]?.foto_url).toBeNull();
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      "preview_riviera_id_for_open_registration",
      expect.anything()
    );
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("no llama preview si ya hay foto", async () => {
    const dto = baseDto();
    dto.entries[0]!.foto_url = "https://cdn.example/already.jpg";
    const out = await enrichPublicEntryPhotos(dto);
    expect(out.entries[0]?.foto_url).toBe("https://cdn.example/already.jpg");
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(fetchRivieraJugadorProfilesByIds).not.toHaveBeenCalled();
  });
});
