import { mapAuthLoginError } from "./mapAuthLoginError";

describe("mapAuthLoginError", () => {
  it("traduce email no confirmado", () => {
    expect(
      mapAuthLoginError({
        code: "email_not_confirmed",
        message: "Email not confirmed",
      })
    ).toMatch(/no está confirmado/i);
  });

  it("traduce credenciales inválidas", () => {
    expect(
      mapAuthLoginError({
        code: "invalid_credentials",
        message: "Invalid login credentials",
      })
    ).toMatch(/incorrectos/i);
  });
});
