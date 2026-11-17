import fs from "fs";
import path from "path";
import { shouldBootPagos } from "./shouldBootPagos";

describe("entrada de producción por hostname", () => {
  it("monta pagos antes que AppRiviera cuando el host es el subdominio", () => {
    const source = fs.readFileSync(path.join(__dirname, "../index.tsx"), "utf8");
    const gate = source.indexOf("if (pagosSurface)");
    const bootPagos = source.indexOf('import("./pagos/bootPagos")');
    const bootApp = source.indexOf("bootstrapAppBranding()");
    expect(gate).toBeGreaterThan(-1);
    expect(bootPagos).toBeGreaterThan(gate);
    expect(bootApp).toBeGreaterThan(bootPagos);
    expect(shouldBootPagos({ hostname: "pagos.rivieraopen.com", pathname: "/" }, { nodeEnv: "production" })).toBe(
      true
    );
    expect(
      shouldBootPagos({ hostname: "appriviera.rivieraopen.com", pathname: "/" }, { nodeEnv: "production" })
    ).toBe(false);
  });
});
