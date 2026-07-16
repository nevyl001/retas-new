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

import { supabase } from "../supabaseClient";
import {
  clearPublicEntryFotoCacheForTests,
  enrichPublicEntryPhotos,
} from "./retaAbiertaService";
import type { OpenRegistrationPublicDto } from "./types";

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

  it("rellena foto desde preview canónico por Riviera ID", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValue({
      data: {
        ok: true,
        riviera_id: "RIV-00000011",
        jugador_id: "j1",
        nombre: "Nevyl",
        foto_url: "https://cdn.example/nevyl.jpg",
        rating: 3.2,
        categoria: "5ta",
        club_origen_id: null,
      },
      error: null,
    });

    const out = await enrichPublicEntryPhotos(baseDto());
    expect(out.entries[0]?.foto_url).toBe("https://cdn.example/nevyl.jpg");
    expect(supabase.rpc).toHaveBeenCalledWith(
      "preview_riviera_id_for_open_registration",
      { p_slug: "ra-hack", p_riviera_id: "RIV-00000011" }
    );
  });

  it("no llama preview si ya hay foto", async () => {
    const dto = baseDto();
    dto.entries[0]!.foto_url = "https://cdn.example/already.jpg";
    const out = await enrichPublicEntryPhotos(dto);
    expect(out.entries[0]?.foto_url).toBe("https://cdn.example/already.jpg");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
