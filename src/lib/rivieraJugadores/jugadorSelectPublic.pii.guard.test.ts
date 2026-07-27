/**
 * Pin: el SELECT público de riviera_jugadores nunca debe pedir columnas de
 * contacto. PRIVATE conserva el hub histórico (incluye esas columnas).
 */
import {
  JUGADOR_SELECT_PRIVATE,
  JUGADOR_SELECT_PUBLIC,
  getJugadorSelectColumnsPublic,
} from "./rivieraJugadoresService";

const PII_COLUMNS = [
  "email",
  "telefono",
  "whatsapp",
  "fecha_nacimiento",
] as const;

function selectColumns(select: string): string[] {
  return select.split(",").map((c) => c.trim()).filter(Boolean);
}

describe("JUGADOR_SELECT_PUBLIC — sin PII", () => {
  it("excluye email, telefono, whatsapp y fecha_nacimiento", () => {
    const cols = selectColumns(JUGADOR_SELECT_PUBLIC);
    for (const pii of PII_COLUMNS) {
      expect(cols).not.toContain(pii);
    }
  });

  it("getJugadorSelectColumnsPublic tampoco incluye PII (con o sin rating)", () => {
    const cols = selectColumns(getJugadorSelectColumnsPublic());
    for (const pii of PII_COLUMNS) {
      expect(cols).not.toContain(pii);
    }
  });

  it("PUBLIC es PRIVATE menos exactamente las 4 columnas de contacto", () => {
    const privateCols = selectColumns(JUGADOR_SELECT_PRIVATE);
    const publicCols = selectColumns(JUGADOR_SELECT_PUBLIC);
    const expected = privateCols.filter(
      (c) => !(PII_COLUMNS as readonly string[]).includes(c)
    );
    expect(publicCols).toEqual(expected);
  });

  it("PRIVATE sigue incluyendo las 4 columnas de contacto (hub actual)", () => {
    const cols = selectColumns(JUGADOR_SELECT_PRIVATE);
    for (const pii of PII_COLUMNS) {
      expect(cols).toContain(pii);
    }
  });
});
