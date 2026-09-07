import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QuickStartSheet } from "./QuickStartSheet";
import { RetaConfigFields } from "../reta/RetaConfigFields";
import type { RetaConfigFormValues } from "../../lib/reta/updateRetaConfig";
import { validateRetaConfigForm } from "../../lib/reta/retaConfigValidation";

jest.mock("../../club-experience", () => ({
  useClubModeEyebrow: () => "RivieraApp",
  useConvocatoriaOriginName: () => "Club Test",
}));

/* eslint-disable testing-library/no-unnecessary-act */

describe("QuickStartSheet shared form", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    (global as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("17. QuickStartSheet usa shell Quick Mode (como Nuevo duelo) y Detalles", () => {
    act(() => {
      root.render(
        <QuickStartSheet
          modeId="round-robin"
          onClose={() => {}}
          onSubmit={() => {}}
        />
      );
    });
    const scope = document.body;
    expect(scope.querySelector(".qm-ws")).toBeTruthy();
    expect(scope.querySelector(".qm-ws__details-inline")).toBeTruthy();
    expect(scope.querySelector(".reta-details-form")).toBeTruthy();
    expect(scope.textContent).toMatch(/Nueva reta/i);
    expect(scope.textContent).toMatch(/Configura lo esencial/);
    expect(scope.textContent).toMatch(/Resumen/);
    expect(scope.textContent).toMatch(/Nivel/);
    expect(scope.querySelector('[data-testid="guardar-reta"]')).toBeTruthy();
    // Remontada vive en Detalles opcionales (colapsado al inicio).
    expect(scope.textContent).toMatch(/Detalles opcionales/);
  });

  it("18. edit mode carga valores actuales en RetaConfigFields", () => {
    const values: RetaConfigFormValues = {
      name: "Reta cargada",
      description: "Desc",
      nivel: "5ta Fuerza",
      courts: 3,
      championshipEnabled: true,
      championshipRounds: 4,
      lugar: "Club",
      mostrar_lugar: true,
      costo: "",
      mostrar_costo: false,
      premio: "",
      mostrar_premio: false,
      rama: "",
      cancha: "1-2",
      programado_en: "2026-07-20T18:00",
      duration_minutes: 120,
    };
    act(() => {
      root.render(
        <RetaConfigFields
          mode="edit"
          phase="draft"
          layout="essentials"
          values={values}
          onChange={() => {}}
        />
      );
    });
    const nameInput = container.querySelector(
      'input[placeholder="Reta del domingo…"]'
    ) as HTMLInputElement;
    expect(nameInput.value).toBe("Reta cargada");
    expect(container.textContent).toMatch(/3/);
    expect(container.textContent).toMatch(/Día/);
    expect(container.textContent).toMatch(/Hora/);
    expect(container.querySelector('input[type="date"]')).toBeTruthy();
    expect(container.querySelector('input[type="time"]')).toBeTruthy();
    const optionalBtn = Array.from(container.querySelectorAll("button")).find(
      (el) => /Detalles opcionales/i.test(el.textContent || "")
    );
    expect(optionalBtn).toBeTruthy();
    act(() => {
      optionalBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const costoToggle = Array.from(
      container.querySelectorAll('input[type="checkbox"]')
    ).find((el) =>
      /mostrar-costo|mostrar precio/i.test(
        (el as HTMLInputElement).id +
          " " +
          ((el as HTMLInputElement).nextElementSibling?.textContent || "")
      )
    ) as HTMLInputElement | undefined;
    const premioToggle = Array.from(
      container.querySelectorAll('input[type="checkbox"]')
    ).find((el) =>
      /mostrar-premio|mostrar premio/i.test(
        (el as HTMLInputElement).id +
          " " +
          ((el as HTMLInputElement).nextElementSibling?.textContent || "")
      )
    ) as HTMLInputElement | undefined;
    expect(costoToggle?.checked).toBe(false);
    expect(premioToggle?.checked).toBe(false);
    const costoInput = container.querySelector(
      'input[placeholder="$200 por jugador"]'
    ) as HTMLInputElement | null;
    const premioInput = Array.from(
      container.querySelectorAll("input[type='text']")
    ).find(
      (el) => (el as HTMLInputElement).placeholder === "Trofeo + pelotas"
    ) as HTMLInputElement | undefined;
    // Inputs siguen editables (dato oculto ≠ disabled).
    expect(costoInput?.disabled).toBe(false);
    expect(premioInput?.disabled).toBe(false);
    const errors = validateRetaConfigForm({
      ...values,
      mode: "edit",
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
