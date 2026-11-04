/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LigaJugadorPoolItem } from "../../lib/liga/types";
import { LigaInscripcionesPanel } from "./LigaInscripcionesPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function player(
  id: string,
  nombre: string,
  extras: Partial<LigaJugadorPoolItem> = {}
): LigaJugadorPoolItem {
  return {
    id,
    nombre,
    email: null,
    telefono: null,
    genero: "M",
    nivel: 3.5,
    estado: "activo",
    organizador_id: "org",
    created_at: "",
    categoria: null,
    ...extras,
  };
}

describe("LigaInscripcionesPanel — roster inscritos + modal agregar", () => {
  let container: HTMLDivElement;
  let root: Root;
  const onToggle = jest.fn();
  const onGoToRegistro = jest.fn();
  const onSustituir = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  async function renderPanel(inscritos: string[] = ["a", "b"]) {
    root = createRoot(container);
    await act(async () => {
      root.render(
        <LigaInscripcionesPanel
          jugadoresPool={[
            player("a", "Alfonso F"),
            player("b", "Arturo Gomez"),
            player("c", "Disponible Uno"),
            player("d", "Disponible Dos"),
          ]}
          inscritosIds={new Set(inscritos)}
          ligaEditable
          busy={false}
          canSustituir
          onToggleInscripcion={onToggle}
          onSustituirJugador={onSustituir}
          onGoToRegistro={onGoToRegistro}
        />
      );
      await Promise.resolve();
    });
  }

  it("muestra solo inscritos en la grilla principal", async () => {
    await renderPanel();
    const names = Array.from(
      container.querySelectorAll(".liga-inscripciones__grid .liga-inscripciones__name")
    ).map((n) => n.textContent);
    expect(names).toEqual(["Alfonso F", "Arturo Gomez"]);
    expect(container.textContent).not.toContain("Disponible Uno");
    expect(container.textContent).toContain("Agregar jugador");
    expect(container.textContent).toContain("Inscritos");
    expect(container.textContent).toContain("Disponibles");
  });

  it("abre el modal de disponibles y permite inscribir", async () => {
    onToggle.mockResolvedValue(undefined);
    await renderPanel();

    const addBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Agregar jugador")
    ) as HTMLButtonElement;
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    const modal = document.querySelector(".liga-inscripciones-add-modal");
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain("Disponible Uno");
    expect(modal?.textContent).toContain("Disponible Dos");

    const inscribir = Array.from(
      document.querySelectorAll(".liga-inscripciones-add-list button")
    ).find((b) => b.textContent?.trim() === "Inscribir") as HTMLButtonElement;
    expect(inscribir).toBeDefined();

    await act(async () => {
      inscribir.click();
      await Promise.resolve();
    });

    expect(onToggle).toHaveBeenCalledWith("c", false);
  });
});

