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

describe("listRivieraJugadores — select PUBLIC (pin de fuente)", () => {
  it("list de producto usa withJugadorSelectPublicFallback vía listRivieraJugadoresWithCacheKey", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "rivieraJugadoresService.ts"),
      "utf8"
    );
    const listFn = src.match(
      /export async function listRivieraJugadores(?!Private)\([\s\S]*?\n\}/
    )?.[0];
    const withCacheKeyFn = src.match(
      /async function listRivieraJugadoresWithCacheKey\([\s\S]*?\n\}/
    )?.[0];
    expect(listFn).toBeTruthy();
    expect(withCacheKeyFn).toBeTruthy();
    // listRivieraJugadores delega en el helper compartido, que es quien hace el select.
    expect(listFn).toContain("listRivieraJugadoresWithCacheKey");
    expect(withCacheKeyFn).toContain("withJugadorSelectPublicFallback");
    expect(withCacheKeyFn).not.toContain("withJugadorSelectFallback(");
  });

  it("listRivieraJugadoresPrivate ya no hace SELECT directo: usa la RPC SECURITY DEFINER", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "rivieraJugadoresService.ts"),
      "utf8"
    );
    const privateFn = src.match(
      /export async function listRivieraJugadoresPrivate\([\s\S]*?\n\}/
    )?.[0];
    expect(privateFn).toBeTruthy();
    expect(privateFn).toContain('"riviera_jugadores_privados_listar"');
    expect(privateFn).not.toContain("withJugadorSelectFallback");
    expect(privateFn).not.toContain("withJugadorSelectPublicFallback");
    expect(privateFn).not.toMatch(/from\("riviera_jugadores"\)/);
  });

  it("getRivieraJugadorPrivateById ya no hace SELECT directo: usa la RPC SECURITY DEFINER", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.join(__dirname, "rivieraJugadoresService.ts"),
      "utf8"
    );
    const fn = src.match(
      /export async function getRivieraJugadorPrivateById\([\s\S]*?\n\}/
    )?.[0];
    expect(fn).toBeTruthy();
    expect(fn).toContain('"riviera_jugador_privado_por_id"');
    expect(fn).not.toMatch(/from\("riviera_jugadores"\)/);
  });
});
