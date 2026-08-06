/**
 * Regresión: createMatch no debe mandar user_id (columna inexistente en prod →
 * PGRST204/400 por cada partido del cuadro al iniciar la reta).
 */
import * as fs from "fs";
import * as path from "path";

describe("createMatch payload (matches sin user_id)", () => {
  it("no incluye user_id en el payload inicial de insert", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "database.ts"),
      "utf8"
    );
    const fnMatch = src.match(
      /export const createMatch = async \([\s\S]*?\n\};\n/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).not.toMatch(/user_id:\s*_?userId/);
    expect(fnBody).not.toMatch(/user_id:\s*userId/);
    expect(fnBody).toMatch(/Sin user_id/);
  });
});
