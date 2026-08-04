/**
 * Fase B: navigatePublicJugadores debe rechazar cualquier destino que no sea
 * (a) una ruta interna relativa o (b) https://rivieraopen.com (o subdominio).
 * Ver CVE-style riesgo: open redirect / esquema no-http vía valores externos.
 */
import { navigatePublicJugadores } from "./jugadoresPublicNav";

function setLocation(pathname: string) {
  window.history.pushState({}, "", pathname);
}

describe("navigatePublicJugadores — allowlist de destino", () => {
  let hrefSetter: jest.Mock;
  let pushStateSpy: jest.SpyInstance;

  beforeEach(() => {
    setLocation("/ranking/o/club-1/varonil");
    hrefSetter = jest.fn();
    // jsdom no permite navegación real; interceptamos el setter de href.
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        get href() {
          return "http://localhost/";
        },
        set href(v: string) {
          hrefSetter(v);
        },
        pathname: "/ranking/o/club-1/varonil",
        search: "",
        origin: "http://localhost",
      },
    });
    pushStateSpy = jest.spyOn(window.history, "pushState");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("navega internamente a una ruta relativa segura", () => {
    navigatePublicJugadores("/ranking/femenil");
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalled();
  });

  test("permite el destino externo confiable https://www.rivieraopen.com/rankings", () => {
    navigatePublicJugadores("https://www.rivieraopen.com/rankings?org=club-1");
    expect(hrefSetter).toHaveBeenCalledWith(
      "https://www.rivieraopen.com/rankings?org=club-1"
    );
  });

  test("permite un subdominio real de rivieraopen.com", () => {
    navigatePublicJugadores("https://appriviera.rivieraopen.com/ranking");
    expect(hrefSetter).toHaveBeenCalledWith(
      "https://appriviera.rivieraopen.com/ranking"
    );
  });

  test("ATAQUE: rechaza javascript: y no navega ni ejecuta", () => {
    const jsSchemePayload = ["javascript", "alert(document.cookie)"].join(":");
    navigatePublicJugadores(jsSchemePayload);
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/ranking");
  });

  test("ATAQUE: rechaza data: URIs", () => {
    navigatePublicJugadores("data:text/html,<script>alert(1)</script>");
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/ranking");
  });

  test("ATAQUE: rechaza vbscript:", () => {
    navigatePublicJugadores("vbscript:msgbox(1)");
    expect(hrefSetter).not.toHaveBeenCalled();
  });

  test("ATAQUE: rechaza http:// (sin TLS) incluso hacia el host confiable", () => {
    navigatePublicJugadores("http://www.rivieraopen.com/rankings");
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/ranking");
  });

  test("ATAQUE: rechaza un dominio externo no autorizado", () => {
    navigatePublicJugadores("https://evil.com/phishing");
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/ranking");
  });

  test("ATAQUE: rechaza el truco de sufijo 'rivieraopen.com.evil.com'", () => {
    navigatePublicJugadores("https://rivieraopen.com.evil.com/rankings");
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/ranking");
  });

  test("ATAQUE: rechaza el truco de prefijo 'notrivieraopen.com'", () => {
    navigatePublicJugadores("https://notrivieraopen.com/rankings");
    expect(hrefSetter).not.toHaveBeenCalled();
    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/ranking");
  });
});
