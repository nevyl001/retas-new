import { isValidUuid, sanitizeUuid } from "./schemaHelpers";

describe("isValidUuid", () => {
  it("acepta UUID v4 válidos", () => {
    expect(isValidUuid("cd45cea7-a8ac-4596-b0ee-24959b4cbb5d")).toBe(true);
  });

  it("rechaza undefined, null y literales corruptos", () => {
    expect(isValidUuid(undefined)).toBe(false);
    expect(isValidUuid(null)).toBe(false);
    expect(isValidUuid("")).toBe(false);
    expect(isValidUuid("undefined")).toBe(false);
    expect(isValidUuid("null")).toBe(false);
  });

  it("sanitizeUuid normaliza o devuelve null", () => {
    expect(sanitizeUuid("  cd45cea7-a8ac-4596-b0ee-24959b4cbb5d  ")).toBe(
      "cd45cea7-a8ac-4596-b0ee-24959b4cbb5d"
    );
    expect(sanitizeUuid("undefined")).toBeNull();
  });
});
