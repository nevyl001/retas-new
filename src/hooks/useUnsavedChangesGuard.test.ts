import { act, renderHook } from "@testing-library/react";
import {
  confirmSessionExit,
  installPopStateGate,
  navigateAppTo,
  resetProtectedPathToAppHome,
} from "../lib/appRouting";
import { installHistoryIndexTracking, readHistoryIndex } from "../lib/historyIndex";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

// Mayor que el SETTLE_MS (50 ms) con el que la guarda junta ráfagas de Atrás/Adelante.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 160));

/** jsdom resuelve history.back/forward/go de forma asíncrona y emite popstate. */
async function traverse(action: () => void) {
  await act(async () => {
    action();
    await tick();
  });
}

function fireBeforeUnload(): BeforeUnloadEvent {
  const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent;
  window.dispatchEvent(event);
  return event;
}

describe("useUnsavedChangesGuard — navegación interna", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/torneo-express/evento/e1");
  });

  it("sin cambios no bloquea navegación ni salida de página", () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(false));
    navigateAppTo("/torneo-express/eventos");
    expect(window.location.pathname).toBe("/torneo-express/eventos");
    expect(result.current.isPending).toBe(false);
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it("con cambios bloquea la navegación interna y expone el tipo de salida", () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    act(() => navigateAppTo("/torneo-express/eventos"));
    expect(window.location.pathname).toBe("/torneo-express/evento/e1");
    expect(result.current.isPending).toBe(true);
    expect(result.current.pendingKind).toBe("navigate");
  });

  it("stay cancela la salida sin navegar", () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    act(() => navigateAppTo("/otra"));
    act(() => result.current.stay());
    expect(result.current.isPending).toBe(false);
    expect(window.location.pathname).toBe("/torneo-express/evento/e1");
  });

  it("confirmLeave navega al destino bloqueado", () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    act(() => navigateAppTo("/otra"));
    act(() => result.current.confirmLeave());
    expect(window.location.pathname).toBe("/otra");
    expect(result.current.isPending).toBe(false);
  });

  it("beforeunload pide confirmación solo mientras hay cambios", () => {
    const { rerender } = renderHook(({ dirty }) => useUnsavedChangesGuard(dirty), {
      initialProps: { dirty: true },
    });
    expect(fireBeforeUnload().defaultPrevented).toBe(true);
    rerender({ dirty: false });
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });

  it("al guardar (dirty → false) se libera la navegación y se limpia lo pendiente", () => {
    const { result, rerender } = renderHook(({ dirty }) => useUnsavedChangesGuard(dirty), {
      initialProps: { dirty: true },
    });
    act(() => navigateAppTo("/otra"));
    expect(result.current.isPending).toBe(true);
    rerender({ dirty: false });
    expect(result.current.isPending).toBe(false);
    navigateAppTo("/otra");
    expect(window.location.pathname).toBe("/otra");
  });

  it("al desmontar se eliminan guarda y listeners (no bloquea rutas ajenas)", () => {
    window.history.replaceState({}, "", "/e");
    const { unmount } = renderHook(() => useUnsavedChangesGuard(true));
    unmount();
    navigateAppTo("/libre");
    expect(window.location.pathname).toBe("/libre");
    expect(fireBeforeUnload().defaultPrevented).toBe(false);
  });
});

describe("useUnsavedChangesGuard — Atrás y Adelante (historial real de jsdom + numeración)", () => {
  let uninstall: () => void;
  let uninstallGate: () => void;
  beforeEach(() => {
    // Mismo orden que `index.tsx`: puerta primero, antes de cualquier listener de la app.
    uninstallGate = installPopStateGate();
    uninstall = installHistoryIndexTracking();
  });
  afterEach(() => {
    uninstall();
    uninstallGate();
  });

  let baseIndexOfA = 0;

  /** Pila [/a, /e, /f] con el usuario parado en /e (entradas creadas con navigateAppTo). */
  async function stackAtE() {
    window.history.replaceState({}, "", "/a");
    baseIndexOfA = readHistoryIndex() as number;
    navigateAppTo("/e");
    navigateAppTo("/f");
    await traverse(() => window.history.back());
    expect(window.location.pathname).toBe("/e");
  }

  /** Recorre la pila de /a a /f verificando ORDEN de URLs e índices consecutivos. */
  async function expectStackAF() {
    await traverse(() => window.history.go(baseIndexOfA - (readHistoryIndex() as number)));
    expect(window.location.pathname).toBe("/a");
    const base = readHistoryIndex() as number;
    expect(base).toBe(baseIndexOfA);
    const seen: Array<[string, number | null]> = [["/a", base]];
    for (const path of ["/e", "/f"]) {
      await traverse(() => window.history.forward());
      expect(window.location.pathname).toBe(path);
      seen.push([path, readHistoryIndex()]);
    }
    expect(seen).toEqual([
      ["/a", base],
      ["/e", base + 1],
      ["/f", base + 2],
    ]);
  }

  it("Adelante: restaura /e sin añadir entradas; cancelar deja la pila intacta", async () => {
    await stackAtE();
    const index = readHistoryIndex();
    const { result, unmount } = renderHook(() => useUnsavedChangesGuard(true));

    await traverse(() => window.history.forward());
    expect(window.location.pathname).toBe("/e");
    expect(readHistoryIndex()).toBe(index);
    expect(result.current.isPending).toBe(true);

    act(() => result.current.stay());
    expect(result.current.isPending).toBe(false);
    expect(window.location.pathname).toBe("/e");
    unmount();
    await expectStackAF();
  });

  it("Adelante + Salir sin guardar: llega a /f y la pila sigue siendo [/a, /e, /f]", async () => {
    await stackAtE();
    const index = readHistoryIndex() as number;
    const { result, unmount } = renderHook(() => useUnsavedChangesGuard(true));

    await traverse(() => window.history.forward());
    await traverse(() => result.current.confirmLeave());
    expect(window.location.pathname).toBe("/f");
    expect(readHistoryIndex()).toBe(index + 1);
    unmount(); // en la app la pantalla se desmonta al cambiar de ruta
    await expectStackAF();
  });

  it("Atrás: restaura /e; cancelar mantiene pantalla y pila", async () => {
    await stackAtE();
    const index = readHistoryIndex();
    const { result, unmount } = renderHook(() => useUnsavedChangesGuard(true));

    await traverse(() => window.history.back());
    expect(window.location.pathname).toBe("/e");
    expect(readHistoryIndex()).toBe(index);
    expect(result.current.isPending).toBe(true);

    act(() => result.current.stay());
    expect(window.location.pathname).toBe("/e");
    unmount();
    await expectStackAF();
  });

  it("Atrás + Salir sin guardar: llega a /a sin entrada extra de /e", async () => {
    await stackAtE();
    const index = readHistoryIndex() as number;
    const { result, unmount } = renderHook(() => useUnsavedChangesGuard(true));

    await traverse(() => window.history.back());
    await traverse(() => result.current.confirmLeave());
    expect(window.location.pathname).toBe("/a");
    expect(readHistoryIndex()).toBe(index - 1);
    unmount();

    // Adelante vuelve a la MISMA /e original y luego a /f: no hay copias intercaladas.
    await expectStackAF();
  });

  it("varias pulsaciones consecutivas de Atrás se juntan en una sola corrección", async () => {
    window.history.replaceState({}, "", "/a");
    navigateAppTo("/b");
    navigateAppTo("/c");
    navigateAppTo("/e");
    const index = readHistoryIndex() as number;
    const { result, unmount } = renderHook(() => useUnsavedChangesGuard(true));

    // Pulsaciones rápidas (separadas por menos que el tiempo de espera de la guarda).
    await act(async () => {
      for (let i = 0; i < 3; i += 1) {
        window.history.back();
        await new Promise((resolve) => setTimeout(resolve, 12));
      }
      await tick();
    });
    expect(window.location.pathname).toBe("/e");
    expect(readHistoryIndex()).toBe(index);
    expect(result.current.isPending).toBe(true);

    await traverse(() => result.current.confirmLeave());
    expect(window.location.pathname).toBe("/a"); // 3 pasos atrás, destino correcto
    expect(readHistoryIndex()).toBe(index - 3);
    unmount();
    // La pila conserva el orden original.
    const order: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      await traverse(() => window.history.forward());
      order.push(window.location.pathname);
    }
    expect(order).toEqual(["/b", "/c", "/e"]);
  });

  it("ráfaga de Atrás y luego cancelar: sigue en /e y se puede volver a intentar", async () => {
    window.history.replaceState({}, "", "/a");
    navigateAppTo("/b");
    navigateAppTo("/e");
    const index = readHistoryIndex();
    const { result } = renderHook(() => useUnsavedChangesGuard(true));

    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 12));
      window.history.back();
      await tick();
    });
    act(() => result.current.stay());
    expect(window.location.pathname).toBe("/e");
    expect(readHistoryIndex()).toBe(index);

    await traverse(() => window.history.back());
    expect(window.location.pathname).toBe("/e");
    expect(result.current.isPending).toBe(true);
  });

  it("navegación repetida (Atrás/Adelante/cancelar ×4) no deriva ni altera la pila", async () => {
    await stackAtE();
    const index = readHistoryIndex();
    const { result, unmount } = renderHook(() => useUnsavedChangesGuard(true));

    for (let i = 0; i < 4; i += 1) {
      await traverse(() => (i % 2 === 0 ? window.history.back() : window.history.forward()));
      expect(window.location.pathname).toBe("/e");
      expect(readHistoryIndex()).toBe(index);
      expect(result.current.isPending).toBe(true);
      act(() => result.current.stay());
    }
    unmount();
    await expectStackAF();
  });

  it("al ir a rutas de otros módulos y públicas se pregunta y, al confirmar, llega al destino exacto", () => {
    window.history.replaceState({}, "", "/torneo-express/evento/e1");
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    for (const target of ["/eventos/copa-riviera", "/jugadores/ranking", "/liga", "/public/americano/x"]) {
      act(() => navigateAppTo(target));
      expect(window.location.pathname).toBe("/torneo-express/evento/e1");
      expect(result.current.isPending).toBe(true);
      act(() => result.current.stay());
    }
    act(() => navigateAppTo("/eventos/copa-riviera"));
    act(() => result.current.confirmLeave());
    expect(window.location.pathname).toBe("/eventos/copa-riviera");
  });

  it("sin cambios Atrás/Adelante pasan intactos a los listeners de la app", async () => {
    await stackAtE();
    renderHook(() => useUnsavedChangesGuard(false));
    const appListener = jest.fn();
    window.addEventListener("popstate", appListener);
    await traverse(() => window.history.forward());
    expect(window.location.pathname).toBe("/f");
    await traverse(() => window.history.back());
    expect(window.location.pathname).toBe("/e");
    expect(appListener).toHaveBeenCalledTimes(2);
    window.removeEventListener("popstate", appListener);
  });

  it("los listeners de ruteo de la app no ven el salto bloqueado", async () => {
    await stackAtE();
    renderHook(() => useUnsavedChangesGuard(true));
    const appListener = jest.fn();
    window.addEventListener("popstate", appListener);
    await traverse(() => window.history.forward());
    expect(window.location.pathname).toBe("/e");
    // Solo puede verse la restauración de /e, nunca /f.
    const paths = appListener.mock.calls.length;
    expect(paths).toBeLessThanOrEqual(1);
    window.removeEventListener("popstate", appListener);
  });

  describe("regresión: un listener permanente de navegación desmontaría la pantalla protegida", () => {
    // Fallo original en la app real: `useSyncPathname`/`App.tsx` se registran al arrancar,
    // cambian la ruta en cuanto llega `popstate` y React desmonta la pantalla (y su guarda)
    // ANTES de que un listener propio, registrado después, llegue a ejecutarse.
    it("control: un listener registrado después de uno permanente llega tarde (causa original)", async () => {
      await stackAtE();
      const order: string[] = [];
      const own = () => {
        order.push("guarda-propia");
      };
      const appRoute = () => {
        order.push("ruteo-app");
        window.removeEventListener("popstate", own, true); // el desmontaje retira la guarda
      };
      window.addEventListener("popstate", appRoute, true);
      window.addEventListener("popstate", own, true);

      await traverse(() => window.history.forward());

      expect(order).toEqual(["ruteo-app"]);
      window.removeEventListener("popstate", appRoute, true);
    });

    it.each([
      ["burbuja", false],
      ["captura", true],
    ])(
      "la puerta intercepta Atrás/Adelante antes de un listener permanente (%s) que desmontaría la pantalla",
      async (_nombre, capture) => {
        await stackAtE();
        const indexAtE = readHistoryIndex();
        // Registrado ANTES de montar la pantalla, como los listeners de `App.tsx`: en cuanto
        // ve una ruta distinta de la protegida, la "app" actualiza la ruta y desmonta la pantalla.
        // (Ver la restauración a la propia entrada protegida es inofensivo y esperado.)
        const seenPaths: string[] = [];
        let unmountScreen: () => void = () => undefined;
        const screenUnmounted = jest.fn();
        const appRoute = jest.fn(() => {
          seenPaths.push(window.location.pathname);
          if (window.location.pathname !== "/e") {
            screenUnmounted();
            unmountScreen();
          }
        });
        window.addEventListener("popstate", appRoute, capture);
        const { result, unmount } = renderHook(() => useUnsavedChangesGuard(true));
        unmountScreen = unmount;

        // Adelante con cambios pendientes: el listener permanente NO debe verlo.
        await traverse(() => window.history.forward());
        expect(seenPaths.every((path) => path === "/e")).toBe(true);
        expect(screenUnmounted).not.toHaveBeenCalled();
        expect(result.current.isPending).toBe(true);
        expect(window.location.pathname).toBe("/e");
        expect(readHistoryIndex()).toBe(indexAtE);

        // Cancelar mantiene la pantalla protegida.
        act(() => result.current.stay());
        expect(window.location.pathname).toBe("/e");

        // Atrás también se intercepta.
        await traverse(() => window.history.back());
        expect(seenPaths.every((path) => path === "/e")).toBe(true);
        expect(screenUnmounted).not.toHaveBeenCalled();
        expect(result.current.isPending).toBe(true);
        expect(window.location.pathname).toBe("/e");

        // Confirmar sí lo deja pasar: el listener permanente lo procesa y la pantalla se desmonta.
        act(() => result.current.confirmLeave());
        await act(async () => {
          await tick();
        });
        expect(screenUnmounted).toHaveBeenCalledTimes(1);
        expect(seenPaths[seenPaths.length - 1]).toBe("/a");
        expect(window.location.pathname).toBe("/a");
        window.removeEventListener("popstate", appRoute, capture);
      }
    );
  });

  it("una entrada sin numerar (estado no simple) usa la restauración de URL sin crecer la pila", async () => {
    window.history.replaceState({}, "", "/a");
    window.history.pushState("estado-no-instrumentable", "", "/e");
    expect(readHistoryIndex()).toBeNull();
    const { result } = renderHook(() => useUnsavedChangesGuard(true));

    await traverse(() => window.history.back());
    expect(window.location.pathname).toBe("/e");
    expect(result.current.isPending).toBe(true);
    act(() => result.current.stay());
    // Atrás sigue llevando a /a: no se creó una copia de /e en medio.
    renderHook(() => useUnsavedChangesGuard(false));
  });

  it("recarga: con la numeración reinstalada se conserva el índice y se continúa sin colisiones", async () => {
    window.history.replaceState({}, "", "/a");
    navigateAppTo("/e");
    const index = readHistoryIndex() as number;

    uninstall(); // la página se recarga: el módulo se vuelve a ejecutar
    uninstall = installHistoryIndexTracking();
    expect(readHistoryIndex()).toBe(index); // history.state sobrevive a la recarga
    navigateAppTo("/f");
    expect(readHistoryIndex()).toBe(index + 1);
  });

  it("desmontar tras interceptar un salto devuelve el historial a la entrada protegida", async () => {
    await stackAtE();
    const index = readHistoryIndex();
    const { unmount } = renderHook(() => useUnsavedChangesGuard(true));
    await act(async () => {
      window.history.forward();
      await new Promise((resolve) => setTimeout(resolve, 5)); // antes de que corra la corrección
    });
    unmount();
    await act(async () => {
      await tick();
    });
    expect(window.location.pathname).toBe("/e");
    expect(readHistoryIndex()).toBe(index);
  });
});

describe("useUnsavedChangesGuard — cierre de sesión", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/torneo-express/evento/e1");
  });

  it("sin cambios el cierre de sesión continúa de inmediato", async () => {
    renderHook(() => useUnsavedChangesGuard(false));
    await expect(confirmSessionExit()).resolves.toBe(true);
  });

  it("con cambios pide confirmación; cancelar aborta el cierre", async () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    let outcome: Promise<boolean> = Promise.resolve(true);
    act(() => {
      outcome = confirmSessionExit();
    });
    expect(result.current.pendingKind).toBe("signout");

    act(() => result.current.stay());
    await expect(outcome).resolves.toBe(false);
    expect(result.current.isPending).toBe(false);
    expect(window.location.pathname).toBe("/torneo-express/evento/e1");
  });

  it("con cambios, confirmar descarta y el cierre continúa", async () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    let outcome: Promise<boolean> = Promise.resolve(false);
    act(() => {
      outcome = confirmSessionExit();
    });
    act(() => result.current.confirmLeave());
    await expect(outcome).resolves.toBe(true);
    expect(result.current.isPending).toBe(false);
  });

  it("si la pantalla se desmonta o guarda mientras espera, el cierre continúa (no queda colgado)", async () => {
    const { unmount } = renderHook(() => useUnsavedChangesGuard(true));
    let outcome: Promise<boolean> = Promise.resolve(false);
    act(() => {
      outcome = confirmSessionExit();
    });
    unmount();
    await expect(outcome).resolves.toBe(true);
  });

  it("tras cerrar la sesión, el redireccionamiento forzoso NO se bloquea aunque haya cambios", () => {
    const { result } = renderHook(() => useUnsavedChangesGuard(true));
    act(() => resetProtectedPathToAppHome());
    expect(window.location.pathname).toBe("/");
    expect(result.current.isPending).toBe(false);
  });

  it("una segunda solicitud de cierre cancela la anterior sin dejarla colgada", async () => {
    renderHook(() => useUnsavedChangesGuard(true));
    let first: Promise<boolean> = Promise.resolve(true);
    let second: Promise<boolean> = Promise.resolve(true);
    act(() => {
      first = confirmSessionExit();
    });
    act(() => {
      second = confirmSessionExit();
    });
    await expect(first).resolves.toBe(false);
    expect(second).toBeInstanceOf(Promise);
  });
});
