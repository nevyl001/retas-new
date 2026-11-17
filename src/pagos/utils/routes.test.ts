import { shouldBootPagos } from "../shouldBootPagos";
import { pagosHomePath } from "./routes";

describe("compuerta de la landing de pagos", () => {
  const production = { nodeEnv: "production" };
  const development = { nodeEnv: "development" };

  it("no arranca en AppRiviera", () => {
    expect(shouldBootPagos({ hostname: "appriviera.rivieraopen.com", pathname: "/" }, production)).toBe(false);
    expect(shouldBootPagos({ hostname: "appriviera.rivieraopen.com", pathname: "/pagos" }, production)).toBe(
      false
    );
  });

  it("arranca en pagos.rivieraopen.com dentro del mismo proyecto", () => {
    expect(shouldBootPagos({ hostname: "pagos.rivieraopen.com", pathname: "/" }, production)).toBe(true);
    expect(shouldBootPagos({ hostname: "pagos.rivieraopen.com", pathname: "/cualquier-ruta" }, production)).toBe(
      true
    );
  });

  it("en local solo abre /pagos durante desarrollo", () => {
    expect(shouldBootPagos({ hostname: "localhost", pathname: "/pagos" }, development)).toBe(true);
    expect(shouldBootPagos({ hostname: "127.0.0.1", pathname: "/pagos" }, development)).toBe(true);
    expect(shouldBootPagos({ hostname: "localhost", pathname: "/" }, development)).toBe(false);
    expect(shouldBootPagos({ hostname: "localhost", pathname: "/pagos" }, production)).toBe(false);
    expect(pagosHomePath("pagos.rivieraopen.com")).toBe("/");
    expect(pagosHomePath("localhost")).toBe("/pagos");
  });
});
