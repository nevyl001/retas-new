/**
 * Regresión: createMatch / createMatchesBulk no deben mandar user_id
 * (columna inexistente en prod → PGRST204/400 por cada partido al iniciar).
 */
import * as fs from "fs";
import * as path from "path";

describe("createMatch payload (matches sin user_id)", () => {
  const src = fs.readFileSync(path.join(__dirname, "database.ts"), "utf8");

  it("createMatchesBulk no incluye user_id en el payload", () => {
    const fnMatch = src.match(
      /export async function createMatchesBulk[\s\S]*?\n\}\n/
    );
    expect(fnMatch).not.toBeNull();
    const fnBody = fnMatch![0];
    expect(fnBody).not.toMatch(/user_id/);
    expect(fnBody).toMatch(/\.insert\(payloads\)/);
  });

  it("inicio de reta usa createMatchesBulk (no createMatch en serie)", () => {
    const scheduler = fs.readFileSync(
      path.join(__dirname, "../components/CircleRoundRobinScheduler.tsx"),
      "utf8"
    );
    expect(scheduler).toMatch(/createMatchesBulk/);
    expect(scheduler).not.toMatch(/await createMatch\(/);
  });
});
