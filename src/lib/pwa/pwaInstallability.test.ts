import { readFileSync } from "fs";
import { resolve } from "path";
import { syncPwaInstallabilityForSession } from "./pwaInstallability";

const HOME = "/";
const PUBLIC_LIGA = "/public/liga/abc";
const PRIVATE_LIGA = "/liga/abc/gestionar";

function manifestLinks(): NodeListOf<Element> {
  return document.querySelectorAll('link[rel="manifest"]');
}

function applySession(input: {
  pathname: string;
  hasUserSession: boolean;
  isAdminLoggedIn?: boolean;
  authReady?: boolean;
}): void {
  syncPwaInstallabilityForSession({
    pathname: input.pathname,
    hasUserSession: input.hasUserSession,
    isAdminLoggedIn: input.isAdminLoggedIn ?? false,
    authReady: input.authReady ?? true,
  });
}

describe("syncPwaInstallability", () => {
  afterEach(() => {
    manifestLinks().forEach((node) => node.remove());
    delete (window as Window & { __rivieraAllowPwaInstall?: boolean })
      .__rivieraAllowPwaInstall;
  });

  it("A. sin sesión en /public/liga no deja manifest", () => {
    applySession({ pathname: PUBLIC_LIGA, hasUserSession: false });
    expect(manifestLinks()).toHaveLength(0);
  });

  it("B. sin sesión en / no deja manifest", () => {
    applySession({ pathname: HOME, hasUserSession: false });
    expect(manifestLinks()).toHaveLength(0);
  });

  it("C. con sesión en la liga de gestión inserta un manifest", () => {
    applySession({ pathname: PRIVATE_LIGA, hasUserSession: true });
    expect(manifestLinks()).toHaveLength(1);
    expect(manifestLinks()[0]?.getAttribute("href")).toBe("/manifest.json");
  });

  it("C. con admin en /admin-dashboard inserta un manifest", () => {
    applySession({
      pathname: "/admin-dashboard",
      hasUserSession: false,
      isAdminLoggedIn: true,
    });
    expect(manifestLinks()).toHaveLength(1);
  });

  it("D/E. con sesión, ida a la liga pública quita el manifest y volver lo pone", () => {
    applySession({ pathname: PRIVATE_LIGA, hasUserSession: true });
    expect(manifestLinks()).toHaveLength(1);

    applySession({ pathname: PUBLIC_LIGA, hasUserSession: true });
    expect(manifestLinks()).toHaveLength(0);

    applySession({ pathname: PRIVATE_LIGA, hasUserSession: true });
    expect(manifestLinks()).toHaveLength(1);
  });

  it("F. cerrar sesión en una ruta privada quita el manifest", () => {
    applySession({ pathname: PRIVATE_LIGA, hasUserSession: true });
    applySession({ pathname: PRIVATE_LIGA, hasUserSession: false });
    expect(manifestLinks()).toHaveLength(0);
    expect(
      (window as Window & { __rivieraAllowPwaInstall?: boolean })
        .__rivieraAllowPwaInstall
    ).toBe(false);
  });

  it("G. abrir directo una ruta pública con sesión persistida no inserta manifest", () => {
    applySession({ pathname: PUBLIC_LIGA, hasUserSession: true, authReady: true });
    expect(manifestLinks()).toHaveLength(0);
  });

  it("H. el login exitoso inserta el manifest al entrar al sistema, sin recarga", () => {
    applySession({ pathname: HOME, hasUserSession: false, authReady: false });
    expect(manifestLinks()).toHaveLength(0);

    applySession({ pathname: HOME, hasUserSession: true, authReady: true });
    expect(manifestLinks()).toHaveLength(1);
  });

  it("privado → público → privado deja un solo link", () => {
    const extra = document.createElement("link");
    extra.rel = "manifest";
    extra.href = "/manifest.json";
    document.head.appendChild(extra);
    document.head.appendChild(extra.cloneNode());

    applySession({ pathname: PRIVATE_LIGA, hasUserSession: true });
    applySession({ pathname: PUBLIC_LIGA, hasUserSession: true });
    applySession({ pathname: "/coaching", hasUserSession: true });
    applySession({ pathname: "/ranking", hasUserSession: true });
    applySession({ pathname: "/reta/abc", hasUserSession: true });

    expect(manifestLinks()).toHaveLength(1);
  });

  it("registra beforeinstallprompt una sola vez y cancela el prompt fuera del sistema", () => {
    const add = jest.spyOn(window, "addEventListener");
    applySession({ pathname: PRIVATE_LIGA, hasUserSession: true });
    applySession({ pathname: PUBLIC_LIGA, hasUserSession: true });
    applySession({ pathname: PRIVATE_LIGA, hasUserSession: true });
    const promptListeners = add.mock.calls.filter(
      (call) => call[0] === "beforeinstallprompt"
    );
    expect(promptListeners.length).toBeLessThanOrEqual(1);
    add.mockRestore();

    applySession({ pathname: PUBLIC_LIGA, hasUserSession: true });
    const blocked = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    applySession({ pathname: PRIVATE_LIGA, hasUserSession: true });
    const allowed = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
  });
});

describe("index.html y scripts de PWA", () => {
  const html = readFileSync(
    resolve(__dirname, "../../../public/index.html"),
    "utf8"
  );
  const scope = readFileSync(
    resolve(__dirname, "../../../public/pwa-scope.js"),
    "utf8"
  );
  const legacy = readFileSync(
    resolve(__dirname, "../../../public/sw-unregister.js"),
    "utf8"
  );

  it("no anuncia la PWA en el documento raíz y carga la puerta antes del bundle", () => {
    expect(html).not.toMatch(/rel=["']manifest["']/);
    expect(html.indexOf("pwa-scope.js")).toBeGreaterThan(-1);
    expect(html.indexOf("pwa-scope.js")).toBeLessThan(html.indexOf("static/js") === -1 ? html.length : html.indexOf("/static/js"));
    expect(html).toMatch(/<title>Riviera Open — Retas y torneos de pádel<\/title>/);
    expect(html).toMatch(/name="description"/);
    expect(html).toMatch(/property="og:title"/);
    expect(html).toMatch(/property="og:description"/);
    expect(html).toMatch(/property="twitter:card" content="summary"/);
    expect(html).toMatch(/rel="icon"/);
    expect(html).not.toMatch(/sw-unregister\.js/);
  });

  it("no toca sesión, cachés ni registro de service worker", () => {
    for (const source of [scope, legacy]) {
      expect(source).not.toMatch(/localStorage/);
      expect(source).not.toMatch(/document\.cookie/);
      expect(source).not.toMatch(/caches\./);
      expect(source).not.toMatch(/serviceWorker\.register/);
      expect(source).not.toMatch(/signOut/);
      expect(source).toMatch(/serviceWorker" in navigator/);
      expect(source).toMatch(/catch \(e\) \{\}/);
    }
  });
});
