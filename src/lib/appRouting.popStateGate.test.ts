import { installHistoryIndexTracking } from "./historyIndex";
import {
  installPopStateGate,
  navigateAppTo,
  readHistoryIndex,
  registerPopStateGuard,
  resetProtectedPathToAppHome,
} from "./appRouting";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 40));

function popstate(): PopStateEvent {
  const event = new PopStateEvent("popstate", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

describe("puerta única de popstate", () => {
  let uninstallGate: () => void;
  beforeEach(() => {
    window.history.replaceState({}, "", "/inicio");
    uninstallGate = installPopStateGate();
  });
  afterEach(() => {
    uninstallGate();
  });

  describe("instalación", () => {
    it("es idempotente: instalar varias veces no añade listeners", () => {
      uninstallGate(); // empezar sin puerta
      const addSpy = jest.spyOn(window, "addEventListener");
      const first = installPopStateGate();
      const second = installPopStateGate();
      registerPopStateGuard(() => false)(); // registrar una guarda tampoco instala otra
      const popstateAdds = addSpy.mock.calls.filter(([type]) => type === "popstate");
      expect(popstateAdds).toHaveLength(1);
      expect(popstateAdds[0][2]).toBe(true); // en captura
      expect(second).toBe(first);
      addSpy.mockRestore();
      uninstallGate = first;
    });

    it("al desinstalar se quita el listener y se puede volver a instalar", () => {
      const guard = jest.fn(() => true);
      const unregister = registerPopStateGuard(guard);
      uninstallGate();
      popstate();
      expect(guard).not.toHaveBeenCalled();
      unregister();
      uninstallGate = installPopStateGate();
      const again = jest.fn(() => false);
      const unregisterAgain = registerPopStateGuard(again);
      popstate();
      expect(again).toHaveBeenCalledTimes(1);
      unregisterAgain();
    });

    it("registerPopStateGuard instala la puerta si faltaba (no deja la guarda sin efecto)", () => {
      uninstallGate();
      const guard = jest.fn(() => false);
      const unregister = registerPopStateGuard(guard);
      popstate();
      expect(guard).toHaveBeenCalledTimes(1);
      unregister();
      uninstallGate = installPopStateGate();
    });
  });

  describe("sin guarda activa", () => {
    it("no altera nada: los listeners de la app reciben el evento y nadie lo detiene", () => {
      const app = jest.fn();
      window.addEventListener("popstate", app);
      popstate();
      popstate();
      expect(app).toHaveBeenCalledTimes(2);
      window.removeEventListener("popstate", app);
    });

    it("tras quitar la guarda se restablece el flujo normal", () => {
      const app = jest.fn();
      window.addEventListener("popstate", app);
      const unregister = registerPopStateGuard(() => true);
      popstate();
      expect(app).not.toHaveBeenCalled();
      unregister();
      popstate();
      expect(app).toHaveBeenCalledTimes(1);
      window.removeEventListener("popstate", app);
    });
  });

  describe("bloqueo", () => {
    it.each([
      ["burbuja", false],
      ["captura", true],
    ])("true bloquea: ningún listener posterior (%s) procesa la navegación", (_n, capture) => {
      const app = jest.fn();
      window.addEventListener("popstate", app, capture);
      const unregister = registerPopStateGuard(() => true);
      popstate();
      expect(app).not.toHaveBeenCalled();
      unregister();
      window.removeEventListener("popstate", app, capture);
    });

    it("false deja pasar el evento sin detenerlo", () => {
      const app = jest.fn();
      window.addEventListener("popstate", app);
      const guard = jest.fn(() => false);
      const unregister = registerPopStateGuard(guard);
      popstate();
      expect(guard).toHaveBeenCalledTimes(1);
      expect(app).toHaveBeenCalledTimes(1);
      unregister();
      window.removeEventListener("popstate", app);
    });

    it("la puerta se ejecuta antes que los listeners de la app registrados después de ella", () => {
      const order: string[] = [];
      const app1 = () => order.push("app-1");
      const app2 = () => order.push("app-2");
      window.addEventListener("popstate", app1);
      window.addEventListener("popstate", app2, true);
      const unregister = registerPopStateGuard(() => {
        order.push("guarda");
        return false;
      });
      popstate();
      expect(order[0]).toBe("guarda");
      expect(order).toHaveLength(3);
      window.removeEventListener("popstate", app1);
      window.removeEventListener("popstate", app2, true);
      unregister();
    });

    it("solo detiene la propagación cuando una guarda bloquea (no cuando deja pasar)", () => {
      const spy = jest.spyOn(Event.prototype, "stopImmediatePropagation");
      const unregisterPass = registerPopStateGuard(() => false);
      popstate();
      expect(spy).not.toHaveBeenCalled();
      unregisterPass();
      const unregisterBlock = registerPopStateGuard(() => true);
      popstate();
      expect(spy).toHaveBeenCalledTimes(1);
      unregisterBlock();
      spy.mockRestore();
    });

    it("con varias guardas, la primera que bloquea corta la consulta", () => {
      const second = jest.fn(() => false);
      const unregisterA = registerPopStateGuard(() => true);
      const unregisterB = registerPopStateGuard(second);
      popstate();
      expect(second).not.toHaveBeenCalled();
      unregisterA();
      unregisterB();
    });
  });

  describe("eventos sintéticos y navegaciones forzosas", () => {
    it("la guarda recibe también los eventos sintéticos (isTrusted false) y decide ella", () => {
      const seen: boolean[] = [];
      const unregister = registerPopStateGuard((event) => {
        seen.push(event.isTrusted);
        return false;
      });
      navigateAppTo("/otra"); // dispara un popstate sintético tras pushState
      expect(window.location.pathname).toBe("/otra");
      expect(seen).toEqual([false]);
      unregister();
    });

    it("resetProtectedPathToAppHome (fin de sesión) emite un popstate que las guardas pueden dejar pasar", () => {
      window.history.replaceState({}, "", "/torneo-express/evento/e1");
      const app = jest.fn();
      window.addEventListener("popstate", app);
      const unregister = registerPopStateGuard(() => false);
      resetProtectedPathToAppHome();
      expect(window.location.pathname).toBe("/");
      expect(app).toHaveBeenCalledTimes(1);
      unregister();
      window.removeEventListener("popstate", app);
    });
  });

  describe("compatibilidad con historyIndex", () => {
    it("la numeración y el orden de entradas no cambian por usar la puerta", async () => {
      const uninstallIndex = installHistoryIndexTracking();
      window.history.replaceState({}, "", "/a");
      const base = readHistoryIndex() as number;
      const unregister = registerPopStateGuard(() => false);
      navigateAppTo("/b");
      navigateAppTo("/c");
      expect(readHistoryIndex()).toBe(base + 2);

      const visited: Array<[string, number | null]> = [];
      const app = () => visited.push([window.location.pathname, readHistoryIndex()]);
      window.addEventListener("popstate", app);
      window.history.back();
      await tick();
      window.history.back();
      await tick();
      window.history.forward();
      await tick();
      expect(visited).toEqual([
        ["/b", base + 1],
        ["/a", base],
        ["/b", base + 1],
      ]);
      window.removeEventListener("popstate", app);
      unregister();
      uninstallIndex();
    });
  });
});
