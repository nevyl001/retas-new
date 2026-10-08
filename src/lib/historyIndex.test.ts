import {
  HISTORY_INDEX_KEY,
  installHistoryIndexTracking,
  readHistoryIndex,
  withHistoryIndex,
} from "./historyIndex";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 40));

describe("historyIndex", () => {
  let uninstall: () => void;

  beforeEach(() => {
    window.history.replaceState({ previo: true }, "", "/inicio");
    uninstall = installHistoryIndexTracking();
  });

  afterEach(() => {
    uninstall();
  });

  describe("instalación", () => {
    it("es idempotente: una segunda instalación no envuelve de nuevo", () => {
      const wrapped = window.history.pushState;
      const second = installHistoryIndexTracking();
      expect(window.history.pushState).toBe(wrapped);
      second(); // no-op: solo la instalación original desinstala
      expect(window.history.pushState).toBe(wrapped);
    });

    it("desinstalar restaura los métodos originales y permite reinstalar", () => {
      const wrapped = window.history.pushState;
      uninstall();
      expect(window.history.pushState).not.toBe(wrapped);
      uninstall = installHistoryIndexTracking();
      expect(window.history.pushState).not.toBe(window.history.replaceState);
    });

    it("numera la entrada de partida conservando su estado y su URL", () => {
      expect(window.location.pathname).toBe("/inicio");
      expect(window.history.state).toEqual({ previo: true, [HISTORY_INDEX_KEY]: 0 });
    });

    it("si la entrada ya trae índice (recarga) lo conserva", () => {
      uninstall();
      window.history.replaceState({ [HISTORY_INDEX_KEY]: 7 }, "", "/inicio");
      uninstall = installHistoryIndexTracking();
      expect(readHistoryIndex()).toBe(7);
    });
  });

  describe("pushState / replaceState", () => {
    it("pushState suma 1 y preserva íntegramente el estado del llamador (copia, sin mutar)", () => {
      const original = { filtro: "x", anidado: { a: 1 } };
      window.history.pushState(original, "", "/uno");
      expect(window.history.state).toEqual({
        filtro: "x",
        anidado: { a: 1 },
        [HISTORY_INDEX_KEY]: 1,
      });
      expect(original).toEqual({ filtro: "x", anidado: { a: 1 } }); // no se mutó
      expect(Object.keys(original)).not.toContain(HISTORY_INDEX_KEY);
    });

    it("replaceState conserva el índice de la entrada y el estado nuevo del llamador", () => {
      window.history.pushState({}, "", "/uno");
      window.history.replaceState({ otro: 2 }, "", "/uno?x=1");
      expect(window.history.state).toEqual({ otro: 2, [HISTORY_INDEX_KEY]: 1 });
      expect(window.location.search).toBe("?x=1");
    });

    it("null y undefined pasan a ser { clave } (único cambio de forma)", () => {
      window.history.pushState(null, "", "/a");
      expect(window.history.state).toEqual({ [HISTORY_INDEX_KEY]: 1 });
      window.history.replaceState(undefined, "", "/a");
      expect(window.history.state).toEqual({ [HISTORY_INDEX_KEY]: 1 });
      window.history.replaceState(null, "", "/a#en-vivo");
      expect(readHistoryIndex()).toBe(1);
    });

    it("no pisa propiedades ajenas ni una clave propia con valor que no es índice", () => {
      const foreign = { [HISTORY_INDEX_KEY]: "uso-ajeno", dato: 1 };
      window.history.pushState(foreign, "", "/ajeno");
      expect(window.history.state).toEqual(foreign);
      expect(readHistoryIndex()).toBeNull();
    });

    it("una copia de history.state con índice viejo se actualiza (no se arrastra el viejo)", () => {
      window.history.pushState({}, "", "/uno");
      window.history.pushState(window.history.state, "", "/dos"); // copia con idx 1
      expect(readHistoryIndex()).toBe(2);
    });

    it("estados que no son objetos simples quedan intactos y sin numerar", () => {
      const casos: unknown[] = ["texto", 42, true, [1, 2], new Date(0), new Map([["a", 1]])];
      casos.forEach((estado, i) => {
        window.history.pushState(estado, "", `/caso-${i}`);
        expect(readHistoryIndex()).toBeNull();
        expect(window.history.state).toEqual(estado);
        // replaceState sobre una entrada sin numerar tampoco inventa índice.
        window.history.replaceState(estado, "", `/caso-${i}`);
        expect(readHistoryIndex()).toBeNull();
      });
    });

    it("los espías ven los argumentos originales del llamador", () => {
      const spy = jest.spyOn(window.history, "pushState");
      window.history.pushState({}, "", "/espiado");
      expect(spy).toHaveBeenCalledWith({}, "", "/espiado");
      spy.mockRestore();
    });

    it("withHistoryIndex devuelve el mismo valor cuando no se puede instrumentar", () => {
      const lista = [1];
      expect(withHistoryIndex(lista, 3)).toBe(lista);
      expect(withHistoryIndex("s", 3)).toBe("s");
      expect(withHistoryIndex({}, 3)).toEqual({ [HISTORY_INDEX_KEY]: 3 });
      expect(withHistoryIndex(Object.create(null), 3)).toEqual({ [HISTORY_INDEX_KEY]: 3 });
    });
  });

  describe("Atrás, Adelante y recarga", () => {
    it("los índices acompañan a cada entrada al recorrer el historial", async () => {
      window.history.pushState({}, "", "/uno");
      window.history.pushState({}, "", "/dos");
      window.history.pushState({}, "", "/tres");
      const base = (readHistoryIndex() as number) - 3;

      const visitar = async (delta: number) => {
        window.history.go(delta);
        await tick();
        return [window.location.pathname, readHistoryIndex()] as const;
      };
      expect(await visitar(-3)).toEqual(["/inicio", base]);
      expect(await visitar(1)).toEqual(["/uno", base + 1]);
      expect(await visitar(2)).toEqual(["/tres", base + 3]);
      expect(await visitar(-1)).toEqual(["/dos", base + 2]);
    });

    it("tras Atrás, un push descarta las entradas de Adelante y numera desde la actual", async () => {
      window.history.pushState({}, "", "/uno");
      window.history.pushState({}, "", "/dos");
      window.history.back();
      await tick();
      const enUno = readHistoryIndex() as number;
      window.history.pushState({}, "", "/nueva");
      expect(readHistoryIndex()).toBe(enUno + 1);
    });

    it("recarga: reinstalar conserva el índice persistido y continúa la secuencia", () => {
      window.history.pushState({}, "", "/uno");
      const antes = readHistoryIndex() as number;
      uninstall();
      uninstall = installHistoryIndexTracking();
      expect(readHistoryIndex()).toBe(antes);
      window.history.pushState({}, "", "/dos");
      expect(readHistoryIndex()).toBe(antes + 1);
    });
  });

  describe("compatibilidad con los envoltorios de App.tsx", () => {
    it("un envoltorio posterior (como el de App.tsx) deja pasar los argumentos y conserva la numeración", () => {
      const originalPush = window.history.pushState;
      const originalReplace = window.history.replaceState;
      const checks = jest.fn();
      window.history.pushState = function (...args: Parameters<History["pushState"]>) {
        originalPush.apply(window.history, args);
        setTimeout(checks, 0);
      };
      window.history.replaceState = function (...args: Parameters<History["replaceState"]>) {
        originalReplace.apply(window.history, args);
        setTimeout(checks, 0);
      };

      window.history.pushState({}, "", "/via-app");
      expect(readHistoryIndex()).toBe(1);
      window.history.replaceState({}, "", "/via-app?q=1");
      expect(readHistoryIndex()).toBe(1);

      // El cleanup de App restaura lo que capturó (nuestro envoltorio): sigue numerando.
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
      window.history.pushState({}, "", "/despues");
      expect(readHistoryIndex()).toBe(2);
    });

    it("desinstalar con un envoltorio de otro módulo restaura nuestro original sin romper nada", () => {
      uninstall();
      expect(() => window.history.pushState({}, "", "/sin-numeracion")).not.toThrow();
      expect(readHistoryIndex()).toBeNull();
      uninstall = installHistoryIndexTracking();
    });
  });
});
