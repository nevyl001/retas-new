import { canOfferPwaInstall } from "./publicWebPath";

const MANIFEST_SELECTOR = 'link[rel="manifest"]';
const ALLOW_FLAG = "__rivieraAllowPwaInstall" as const;

type PwaWindow = Window & {
  __rivieraAllowPwaInstall?: boolean;
};

function pwaWindow(): PwaWindow | null {
  if (typeof window === "undefined") return null;
  return window as PwaWindow;
}

/**
 * Un solo listener para toda la vida de la página. Lee la bandera en el
 * momento del evento, así un cambio de ruta no registra otro ni necesita
 * removeEventListener.
 */
let promptGateInstalled = false;

export function installPwaPromptGate(): void {
  const w = pwaWindow();
  if (!w || promptGateInstalled) return;
  promptGateInstalled = true;
  w.addEventListener("beforeinstallprompt", (event) => {
    if (w[ALLOW_FLAG] === true) return;
    event.preventDefault();
  });
}

function stripManifestLink(): void {
  document.querySelectorAll(MANIFEST_SELECTOR).forEach((node) => node.remove());
}

function ensureManifestLink(): void {
  const links = Array.from(document.querySelectorAll(MANIFEST_SELECTOR));
  const alreadySingle =
    links.length === 1 && links[0]?.getAttribute("href") === "/manifest.json";
  if (alreadySingle) return;
  links.forEach((node) => node.remove());
  const link = document.createElement("link");
  link.rel = "manifest";
  link.href = "/manifest.json";
  document.head.appendChild(link);
}

/**
 * El manifest no va en el HTML. Solo se inserta cuando el usuario ya está
 * dentro del sistema. La web pública no se anuncia como PWA.
 */
export function syncPwaInstallability(allowInstall: boolean): void {
  const w = pwaWindow();
  if (!w) return;
  installPwaPromptGate();
  w[ALLOW_FLAG] = allowInstall;
  if (allowInstall) {
    ensureManifestLink();
    return;
  }
  stripManifestLink();
}

export function syncPwaInstallabilityForSession(input: {
  pathname: string;
  hasUserSession: boolean;
  isAdminLoggedIn: boolean;
  authReady: boolean;
}): void {
  const allow =
    input.authReady &&
    canOfferPwaInstall({
      pathname: input.pathname,
      hasUserSession: input.hasUserSession,
      isAdminLoggedIn: input.isAdminLoggedIn,
    });
  syncPwaInstallability(allow);
}
