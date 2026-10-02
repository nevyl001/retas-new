import {
  expectedSideFromIdentity,
  pairIdentityFromRow,
  REAL_PAIR_INCOMPLETE_FALLBACK,
  VIRTUAL_LABEL_MISSING_FALLBACK,
} from "./pairIdentity";
import type { TorneoExpressPairRow } from "./types";

const PAIR_ID = "ffff0000-0000-4000-8000-000000000001";

function row(patch: Partial<TorneoExpressPairRow>): TorneoExpressPairRow {
  return {
    id: PAIR_ID,
    tournament_id: "torneo",
    player1_id: "juan",
    player2_id: "pedro",
    player1_name: "Juan",
    player2_name: "Pedro",
    is_virtual: false,
    virtual_label: null,
    created_at: "",
    ...patch,
  };
}

describe("pairIdentityFromRow", () => {
  it("una pareja real genera Juan / Pedro", () => {
    const identity = pairIdentityFromRow(row({}));
    expect(identity).toEqual({
      pairId: PAIR_ID,
      player1Id: "juan",
      player2Id: "pedro",
      isVirtual: false,
      display: "Juan / Pedro",
    });
    expect(expectedSideFromIdentity(identity)).toEqual({
      pair_id: PAIR_ID,
      player1_id: "juan",
      player2_id: "pedro",
      is_virtual: false,
    });
  });

  it("una pareja virtual usa virtual_label y no el UUID", () => {
    const identity = pairIdentityFromRow(
      row({
        is_virtual: true,
        virtual_label: "Pareja por definir 1",
        player1_id: null,
        player2_id: null,
        player1_name: null,
        player2_name: null,
      })
    );
    expect(identity.display).toBe("Pareja por definir 1");
    expect(identity.display).not.toContain(PAIR_ID);
    expect(identity.display).not.toMatch(/jugador/i);
    expect(expectedSideFromIdentity(identity)).toEqual({
      pair_id: PAIR_ID,
      player1_id: null,
      player2_id: null,
      is_virtual: true,
    });
  });

  it("una real incompleta es inválida y no muestra UUID", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const identity = pairIdentityFromRow(
      row({ player2_id: null, player2_name: null })
    );
    expect(identity.isVirtual).toBe(false);
    expect(identity.display).toBe(REAL_PAIR_INCOMPLETE_FALLBACK);
    expect(identity.display).not.toContain(PAIR_ID);
    expect(expectedSideFromIdentity(identity)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("una virtual con ids presentes es inválida", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const identity = pairIdentityFromRow(
      row({
        is_virtual: true,
        virtual_label: "Pareja por definir 1",
        player1_id: "mara",
        player2_id: "fer",
        player1_name: null,
        player2_name: null,
      })
    );
    expect(identity.display).toBe("Pareja por definir 1");
    expect(expectedSideFromIdentity(identity)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("una virtual sin etiqueta usa un fallback interno y no el UUID", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const identity = pairIdentityFromRow(
      row({
        is_virtual: true,
        virtual_label: "   ",
        player1_id: null,
        player2_id: null,
        player1_name: null,
        player2_name: null,
      })
    );
    expect(identity.display).toBe(VIRTUAL_LABEL_MISSING_FALLBACK);
    expect(identity.display).not.toContain(PAIR_ID);
    expect(identity.display).not.toBe("null");
    expect(identity.display).not.toBe("undefined");
    expect(warn).toHaveBeenCalledWith(
      "[torneoExpress] pareja virtual inválida:",
      PAIR_ID
    );
    warn.mockRestore();
  });

  it("resolver la misma plaza cambia el display y conserva pair.id", () => {
    const before = pairIdentityFromRow(
      row({
        is_virtual: true,
        virtual_label: "Pareja por definir 1",
        player1_id: null,
        player2_id: null,
        player1_name: null,
        player2_name: null,
      })
    );
    const after = pairIdentityFromRow(
      row({
        is_virtual: false,
        virtual_label: null,
        player1_id: "mara",
        player2_id: "fer",
        player1_name: "Mara",
        player2_name: "Fernanda",
      })
    );
    expect(after.pairId).toBe(before.pairId);
    expect(before.display).toBe("Pareja por definir 1");
    expect(after.display).toBe("Mara / Fernanda");
    expect(after.isVirtual).toBe(false);
  });
});
