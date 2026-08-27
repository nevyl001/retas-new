import { collectLigaParticipantLegacyJugadorIds } from "./ligaCareerInscripcionSync";
import type { LigaDetalle } from "../lib/liga/types";

describe("collectLigaParticipantLegacyJugadorIds", () => {
  it("rotativo: toma jugador_id de inscripciones", () => {
    const detalle = {
      modalidad: "individual_rotativo",
      inscripciones: [{ jugador_id: "j1" }, { jugador_id: "j2" }],
      equipos: [],
    } as unknown as Pick<LigaDetalle, "modalidad" | "inscripciones" | "equipos">;

    expect(collectLigaParticipantLegacyJugadorIds(detalle)).toEqual(["j1", "j2"]);
  });

  it("parejas fijas playoffs: toma jugadores de equipos", () => {
    const detalle = {
      modalidad: "parejas_fijas_playoffs",
      inscripciones: [],
      equipos: [
        { jugador1_id: "a", jugador2_id: "b" },
        { jugador1_id: "c", jugador2_id: "d" },
      ],
    } as unknown as Pick<LigaDetalle, "modalidad" | "inscripciones" | "equipos">;

    expect(collectLigaParticipantLegacyJugadorIds(detalle).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("deduplica si un jugador apareciera en dos equipos", () => {
    const detalle = {
      modalidad: "parejas_fijas",
      inscripciones: [],
      equipos: [
        { jugador1_id: "a", jugador2_id: "b" },
        { jugador1_id: "a", jugador2_id: "c" },
      ],
    } as unknown as Pick<LigaDetalle, "modalidad" | "inscripciones" | "equipos">;

    expect(collectLigaParticipantLegacyJugadorIds(detalle).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
