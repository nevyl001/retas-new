import { installHistoryIndexTracking } from "./historyIndex";
import {
  confirmSessionExit,
  isForcedNavigationInProgress,
  navigateAppTo,
  readHistoryIndex,
  registerNavigationGuard,
  registerSessionExitGuard,
  resetProtectedPathToAppHome,
} from "./appRouting";

describe("registerNavigationGuard", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/inicio");
  });

  it("sin guardas navega como siempre", () => {
    navigateAppTo("/torneo-express/eventos");
    expect(window.location.pathname).toBe("/torneo-express/eventos");
  });

  it("una guarda que devuelve false bloquea la navegación y recibe la ruta destino", () => {
    const guard = jest.fn(() => false);
    const unregister = registerNavigationGuard(guard);
    navigateAppTo("/torneo-express/eventos?x=1");
    expect(guard).toHaveBeenCalledWith("/torneo-express/eventos?x=1");
    expect(window.location.pathname).toBe("/inicio");
    unregister();
  });

  it("una guarda que devuelve true permite navegar", () => {
    const unregister = registerNavigationGuard(() => true);
    navigateAppTo("/otra");
    expect(window.location.pathname).toBe("/otra");
    unregister();
  });

  it("no consulta guardas si la URL no cambia", () => {
    const guard = jest.fn(() => false);
    const unregister = registerNavigationGuard(guard);
    navigateAppTo("/inicio");
    expect(guard).not.toHaveBeenCalled();
    unregister();
  });

  it("al quitar la guarda se restablece la navegación", () => {
    const unregister = registerNavigationGuard(() => false);
    unregister();
    navigateAppTo("/libre");
    expect(window.location.pathname).toBe("/libre");
  });
});

describe("historial numerado, cierre de sesión y navegación forzosa", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/inicio");
  });

  it("navigateAppTo no cambia la forma de history.state (sigue siendo {})", () => {
    const pushSpy = jest.spyOn(window.history, "pushState");
    navigateAppTo("/uno");
    expect(pushSpy).toHaveBeenCalledWith({}, "", "/uno");
    pushSpy.mockRestore();
  });

  it("readHistoryIndex lee la numeración de history.state (null si la entrada no está numerada)", () => {
    expect(readHistoryIndex()).toBeNull();
    const uninstall = installHistoryIndexTracking();
    expect(readHistoryIndex()).toBe(0);
    navigateAppTo("/uno");
    expect(readHistoryIndex()).toBe(1);
    uninstall();
  });

  it("resetProtectedPathToAppHome (fin de sesión) conserva el índice de la entrada", () => {
    const uninstall = installHistoryIndexTracking();
    window.history.replaceState({}, "", "/torneo-express/evento/e1");
    navigateAppTo("/torneo-express/evento/e2");
    const antes = readHistoryIndex();
    resetProtectedPathToAppHome();
    expect(window.location.pathname).toBe("/");
    expect(readHistoryIndex()).toBe(antes);
    uninstall();
  });

  it("confirmSessionExit sin guardas resuelve true", async () => {
    await expect(confirmSessionExit()).resolves.toBe(true);
  });

  it("confirmSessionExit respeta una guarda que cancela y se limpia al quitarla", async () => {
    const unregister = registerSessionExitGuard(async () => false);
    await expect(confirmSessionExit()).resolves.toBe(false);
    unregister();
    await expect(confirmSessionExit()).resolves.toBe(true);
  });

  it("resetProtectedPathToAppHome ignora las guardas de navegación y marca la salida como forzosa", () => {
    window.history.replaceState({}, "", "/torneo-express/evento/e1");
    const guard = jest.fn(() => false);
    const unregister = registerNavigationGuard(guard);
    let forcedDuring = false;
    const listener = () => {
      forcedDuring = isForcedNavigationInProgress();
    };
    window.addEventListener("popstate", listener);
    resetProtectedPathToAppHome();
    window.removeEventListener("popstate", listener);
    unregister();
    expect(window.location.pathname).toBe("/");
    expect(forcedDuring).toBe(true);
    expect(isForcedNavigationInProgress()).toBe(false);
    expect(guard).not.toHaveBeenCalled();
  });
});
