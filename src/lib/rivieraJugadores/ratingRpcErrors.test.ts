import {
  isMissingRatingRpcInfrastructureError,
  isRpcAuthorizationDeniedError,
  shouldFallbackRatingRpcError,
} from "./ratingRpcErrors";

describe("ratingRpcErrors", () => {
  it("detecta 42501 y mensajes de no autorizado", () => {
    expect(
      isRpcAuthorizationDeniedError({
        code: "42501",
        message: "No autorizado para este organizador",
      })
    ).toBe(true);
    expect(
      isRpcAuthorizationDeniedError({
        status: 403,
        message: "permission denied for function riviera_rating_canonico_para_jugador",
      })
    ).toBe(true);
    expect(
      isRpcAuthorizationDeniedError({
        status: 401,
        message: "Unauthorized",
      })
    ).toBe(true);
  });

  it("en contexto público degrada denegación sin throw", () => {
    const err = { code: "42501", message: "No autorizado para el mapa de cedidos" };
    expect(shouldFallbackRatingRpcError(err, { publicRpcContext: false })).toBe(
      false
    );
    expect(shouldFallbackRatingRpcError(err, { publicRpcContext: true })).toBe(
      true
    );
  });

  it("en contexto privado degrada solo infraestructura faltante", () => {
    const missing = { code: "PGRST202", message: "Could not find the function" };
    expect(shouldFallbackRatingRpcError(missing)).toBe(true);
    expect(isMissingRatingRpcInfrastructureError(missing)).toBe(true);
  });
});
