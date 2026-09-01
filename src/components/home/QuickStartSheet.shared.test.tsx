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
    expect(scope.textContent).toMatch(/Detalles de la reta/);
    expect(scope.textContent).toMatch(/Listo para guardar/);
    expect(scope.textContent).toMatch(/Remontada/);
    expect(scope.textContent).toMatch(/Nivel/);
    expect(scope.querySelector('[data-testid="guardar-reta"]')).toBeTruthy();
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
    const costoCb = container.querySelector(
      'input[aria-label="Incluir costo en la convocatoria"]'
    ) as HTMLInputElement | null;
    const premioCb = container.querySelector(
      'input[aria-label="Incluir premio en la convocatoria"]'
    ) as HTMLInputElement | null;
    expect(costoCb?.checked).toBe(false);
    expect(premioCb?.checked).toBe(false);
    const costoInput = container.querySelector(
      'input[placeholder="$200 por jugador"]'
    ) as HTMLInputElement | null;
    const premioInput = Array.from(
      container.querySelectorAll("input[type='text']")
    ).find(
      (el) => (el as HTMLInputElement).placeholder === "Trofeo + pelotas"
    ) as HTMLInputElement | undefined;
    expect(costoInput?.disabled).toBe(true);
    expect(premioInput?.disabled).toBe(true);
    const errors = validateRetaConfigForm({
      ...values,
      mode: "edit",
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
