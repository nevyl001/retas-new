import { OFFICIAL_CLIP_URL, authorizedClipUrl, officialClipUrl } from "./paymentLinks";

describe("enlace oficial de Clip", () => {
  it("es exactamente el enlace de negocio", () => {
    expect(officialClipUrl()).toBe("https://linkdenegocio.mx/@rivieraopen");
    expect(OFFICIAL_CLIP_URL).toBe("https://linkdenegocio.mx/@rivieraopen");
  });

  it("rechaza otro destino aunque el host parezca Clip", () => {
    expect(authorizedClipUrl("http://linkdenegocio.mx/@rivieraopen")).toBeNull();
    expect(authorizedClipUrl("https://evil.example/pago")).toBeNull();
    expect(authorizedClipUrl("https://linkdenegocio.mx/@otro")).toBeNull();
    expect(authorizedClipUrl("https://pay.linkdenegocio.mx/@rivieraopen")).toBeNull();
    expect(authorizedClipUrl("https://user:pass@linkdenegocio.mx/@rivieraopen")).toBeNull();
    expect(authorizedClipUrl(["java", "script:alert(1)"].join(""))).toBeNull();
  });

  it("no cambia el destino con la query de la landing", () => {
    window.history.replaceState({}, "", "/pagos?enlace=https://evil.example/robo");
    expect(officialClipUrl()).toBe("https://linkdenegocio.mx/@rivieraopen");
  });
});
