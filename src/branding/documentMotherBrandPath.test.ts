import { shouldKeepDocumentMotherBrand } from "./documentMotherBrandPath";

describe("shouldKeepDocumentMotherBrand", () => {
  it("mantiene madre en invitaciones /jugar y públicas", () => {
    expect(shouldKeepDocumentMotherBrand("/jugar/ra-abc")).toBe(true);
    expect(shouldKeepDocumentMotherBrand("/reta-abierta/ra-abc")).toBe(true);
    expect(shouldKeepDocumentMotherBrand("/public/abc")).toBe(true);
    expect(shouldKeepDocumentMotherBrand("/public/duelo-2v2/x")).toBe(true);
    expect(shouldKeepDocumentMotherBrand("/eventos/mi-evento")).toBe(true);
  });

  it("no fuerza madre en home ni ranking con org (path org aplica)", () => {
    expect(shouldKeepDocumentMotherBrand("/")).toBe(false);
    expect(shouldKeepDocumentMotherBrand("/ranking/o/uuid")).toBe(false);
    expect(shouldKeepDocumentMotherBrand("/liga")).toBe(false);
  });
});
