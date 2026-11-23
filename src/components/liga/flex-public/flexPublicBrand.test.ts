import fs from "fs";
import path from "path";
import { resolveBrandingKeyForOrganizador } from "../../../club-experience/organizerBindingResolver";

const live = fs.readFileSync(
  path.join(__dirname, "flex-public-live.css"),
  "utf8"
);
const jornada = fs.readFileSync(
  path.join(__dirname, "flex-public-jornada.css"),
  "utf8"
);

describe("identidad pública de Flex", () => {
  it("Club Test sin upgrade resuelve la marca Riviera Open", () => {
    expect(
      resolveBrandingKeyForOrganizador("cd45cea7-a8ac-4596-b0ee-24959b4cbb5d")
    ).toBe("riviera");
  });

  it("una cuenta con upgrade conserva su manifiesto", () => {
    expect(
      resolveBrandingKeyForOrganizador("e724de97-3552-4a01-a269-f621e6f1ed26")
    ).toBe("hack-padel");
  });

  it("la vista no impone otra fuente ni otro fondo encima del sistema público", () => {
    for (const css of [live, jornada]) {
      expect(css).not.toMatch(/Bebas Neue|Manrope|Arial Narrow/);
      expect(css).toContain("var(--font-display)");
      expect(css).toContain("var(--font-body)");
      expect(css).not.toMatch(/ro-public-view::before/);
      expect(css).not.toMatch(/ro-public-view::after/);
      expect(css).not.toContain("--liga-pub-gold");
    }
  });
});
