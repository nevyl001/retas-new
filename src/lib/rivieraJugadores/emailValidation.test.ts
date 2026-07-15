import {
  EMAIL_INVALID_MESSAGE,
  EMAIL_REQUIRED_MESSAGE,
  isValidEmailFormat,
  normalizeEmailInput,
  normalizeOptionalEmail,
  normalizeRequiredEmail,
} from "./emailValidation";

describe("emailValidation", () => {
  describe("isValidEmailFormat", () => {
    it("acepta un correo con formato válido", () => {
      expect(isValidEmailFormat("jugador@example.com")).toBe(true);
    });

    it("rechaza sin @", () => {
      expect(isValidEmailFormat("jugadorexample.com")).toBe(false);
    });

    it("rechaza sin dominio con punto", () => {
      expect(isValidEmailFormat("jugador@example")).toBe(false);
    });

    it("rechaza con espacios", () => {
      expect(isValidEmailFormat("jugador @example.com")).toBe(false);
    });

    it("rechaza vacío", () => {
      expect(isValidEmailFormat("")).toBe(false);
    });
  });

  describe("normalizeEmailInput (trim + lowercase, sin exigir)", () => {
    it("aplica trim", () => {
      expect(normalizeEmailInput("  jugador@example.com  ")).toBe(
        "jugador@example.com"
      );
    });

    it("aplica lowercase", () => {
      expect(normalizeEmailInput("Jugador@EXAMPLE.com")).toBe(
        "jugador@example.com"
      );
    });

    it("aplica trim + lowercase combinados", () => {
      expect(normalizeEmailInput("  Jugador@EXAMPLE.COM  ")).toBe(
        "jugador@example.com"
      );
    });

    it("null/undefined se normalizan a string vacío", () => {
      expect(normalizeEmailInput(null)).toBe("");
      expect(normalizeEmailInput(undefined)).toBe("");
    });
  });

  describe("normalizeRequiredEmail (alta nueva)", () => {
    it("acepta correo válido y lo normaliza", () => {
      expect(normalizeRequiredEmail("  Jugador@EXAMPLE.COM  ")).toBe(
        "jugador@example.com"
      );
    });

    it("lanza mensaje exacto si no hay correo", () => {
      expect(() => normalizeRequiredEmail("")).toThrow(EMAIL_REQUIRED_MESSAGE);
      expect(() => normalizeRequiredEmail(null)).toThrow(EMAIL_REQUIRED_MESSAGE);
      expect(() => normalizeRequiredEmail(undefined)).toThrow(
        EMAIL_REQUIRED_MESSAGE
      );
    });

    it("lanza mensaje exacto si solo hay espacios", () => {
      expect(() => normalizeRequiredEmail("   ")).toThrow(
        EMAIL_REQUIRED_MESSAGE
      );
    });

    it("lanza mensaje de formato inválido si el correo no es válido", () => {
      expect(() => normalizeRequiredEmail("no-es-un-correo")).toThrow(
        EMAIL_INVALID_MESSAGE
      );
    });
  });

  describe("normalizeOptionalEmail (histórico / sync, no exige)", () => {
    it("normaliza si hay valor", () => {
      expect(normalizeOptionalEmail("  Jugador@EXAMPLE.COM  ")).toBe(
        "jugador@example.com"
      );
    });

    it("devuelve null si no hay valor, sin lanzar", () => {
      expect(normalizeOptionalEmail(null)).toBeNull();
      expect(normalizeOptionalEmail(undefined)).toBeNull();
      expect(normalizeOptionalEmail("")).toBeNull();
      expect(normalizeOptionalEmail("   ")).toBeNull();
    });
  });
});
