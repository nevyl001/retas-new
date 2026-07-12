import {
  buildCreatePairPayload,
  type CreatePairInsertPayload,
} from "./createPairPayload";

const T = "271dd1d2-1916-4bb1-8612-13b6e91c0fa0";
const P1 = "5aa3155f-9158-4b31-aa00-83f3a80e6731";
const P2 = "362ae76a-1329-408d-b52a-a664291f3e0b";

describe("buildCreatePairPayload", () => {
  it("arma payload limpio sin undefined ni user_id", () => {
    const result = buildCreatePairPayload({
      tournamentId: T,
      player1Id: P1,
      player2Id: P2,
      player1Name: "Ferrito",
      player2Name: "Ferro",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload: CreatePairInsertPayload = result.payload;
    expect(payload).toEqual({
      tournament_id: T,
      player1_id: P1,
      player2_id: P2,
      player1_name: "Ferrito",
      player2_name: "Ferro",
    });
    expect(Object.keys(payload).sort()).toEqual(
      [
        "player1_id",
        "player1_name",
        "player2_id",
        "player2_name",
        "tournament_id",
      ].sort()
    );
    expect(Object.values(payload).every((v) => v !== undefined)).toBe(true);
    expect("user_id" in payload).toBe(false);
  });

  it("no crea si falta tournamentId", () => {
    const result = buildCreatePairPayload({
      tournamentId: "",
      player1Id: P1,
      player2Id: P2,
      player1Name: "A",
      player2Name: "B",
    });
    expect(result.ok).toBe(false);
  });

  it("no crea si falta player1_id o player2_id", () => {
    expect(
      buildCreatePairPayload({
        tournamentId: T,
        player1Id: "",
        player2Id: P2,
        player1Name: "A",
        player2Name: "B",
      }).ok
    ).toBe(false);
    expect(
      buildCreatePairPayload({
        tournamentId: T,
        player1Id: P1,
        player2Id: undefined,
        player1Name: "A",
        player2Name: "B",
      }).ok
    ).toBe(false);
  });

  it("no crea jugador consigo mismo", () => {
    const result = buildCreatePairPayload({
      tournamentId: T,
      player1Id: P1,
      player2Id: P1,
      player1Name: "A",
      player2Name: "A",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/consigo mismo/i);
  });
});
