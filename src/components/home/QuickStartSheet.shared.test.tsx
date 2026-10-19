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
    // Remontada final tiene su propia sección visible.
    expect(scope.textContent).toMatch(/Detalles opcionales/);
    expect(scope.textContent).toMatch(/Remontada/);
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
    const courtsInput = container.querySelector(
      'input[aria-label="Número de canchas"]'
    ) as HTMLInputElement | null;
    expect(courtsInput?.value).toBe("3");
    expect(container.textContent).toMatch(/Día/);
    expect(container.textContent).toMatch(/Hora/);
    expect(container.querySelector('input[type="date"]')).toBeTruthy();
    expect(container.querySelector('input[type="time"]')).toBeTruthy();
    expect(container.textContent).toMatch(/Detalles opcionales/);
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

  it("la duración se puede vaciar, escribir y subir con +", () => {
    const values: RetaConfigFormValues = {
      name: "Reta",
      description: "",
      nivel: "",
      courts: 2,
      championshipEnabled: false,
      championshipRounds: 2,
      lugar: "",
      mostrar_lugar: false,
      costo: "",
      mostrar_costo: false,
      premio: "",
      mostrar_premio: false,
      rama: "",
      cancha: "",
      programado_en: "2026-09-29T19:00",
      duration_minutes: 15,
    };

    const Harness = () => {
      const [current, setCurrent] = React.useState(values);
      return (
        <RetaConfigFields
          mode="edit"
          phase="draft"
          layout="essentials"
          values={current}
          onChange={setCurrent}
        />
      );
    };

    act(() => {
      root.render(<Harness />);
    });

    const input = container.querySelector(
      'input[aria-label="Duración en minutos"]'
    ) as HTMLInputElement;
    const setValue = (next: string) => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set;
      setter?.call(input, next);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };

    act(() => {
      setValue("");
    });
    expect(input.value).toBe("");

    act(() => {
      setValue("90");
    });
    expect(input.value).toBe("90");

    const plus = container.querySelector(
      'button[aria-label="Más duración"]'
    ) as HTMLButtonElement;
    act(() => {
      plus.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(input.value).toBe("105");
  });

  it("19. flujo guiado por pasos muestra microcopy contextual y actualiza el checklist de revisión final", () => {
    const onSubmit = jest.fn();
    act(() => {
      root.render(
        <QuickStartSheet
          modeId="americano"
          onClose={() => {}}
          onSubmit={onSubmit}
        />
      );
    });

    const scope = document.body;
    expect(scope.textContent).toMatch(/Configura tu reta paso a paso/);
    expect(scope.textContent).toMatch(/Paso 1/);
    expect(scope.textContent).toMatch(/Paso 2/);
    expect(scope.textContent).toMatch(/Paso 3/);
    expect(scope.textContent).toMatch(/Paso 4 · Revisión final/);

    // Microcopy contextual integrado
    expect(scope.textContent).toMatch(
      /Pon un nombre fácil de identificar para tu reta\./
    );
    expect(scope.textContent).toMatch(/Define cuándo se jugará la reta\./);
    expect(scope.textContent).toMatch(
      /La duración ayuda a calcular la estructura del juego\./
    );
    expect(scope.textContent).toMatch(
      /Indica cuántas canchas usarás para organizar mejor la dinámica\./
    );
    expect(scope.textContent).toMatch(
      /Especifica la fuerza o categoría que jugará\./
    );
    expect(scope.textContent).toMatch(
      /Selecciona si la reta es varonil, femenil o mixta\./
    );
    expect(scope.textContent).toMatch(
      /Actívala si quieres que los jugadores puedan registrarse mediante enlace\./
    );

    const saveBtn = scope.querySelector(
      '[data-testid="guardar-reta"]'
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(scope.textContent).toMatch(/3 de 4 esenciales/);
    expect(scope.textContent).not.toMatch(/Paso 3 · Registro/);
    expect(scope.textContent).not.toMatch(/Solo manual/);
    expect(scope.querySelector(".qm-primary-cta__hint")).toBeNull();

    const stepNumsBefore = Array.from(
      scope.querySelectorAll(".qm-compose-steps__num")
    ).map((el) => el.textContent?.trim());
    expect(stepNumsBefore).toEqual(["1", "2", "3", "4"]);

    const nameInput = scope.querySelector(
      'input[placeholder="Reta del domingo…"]'
    ) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;

    act(() => {
      setter?.call(nameInput, "Reta Nocturna Riviera");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const stepNumsAfter = Array.from(
      scope.querySelectorAll(".qm-compose-steps__num")
    ).map((el) => el.textContent?.trim());
    expect(stepNumsAfter).toEqual(["✓", "2", "✓", "✓"]);

    expect(scope.textContent).toMatch(/✓ 4 de 4 listos/);
    expect(scope.textContent).toMatch(/✓ Todo listo para continuar/);
    expect(saveBtn.disabled).toBe(false);

    act(() => {
      saveBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].name).toBe("Reta Nocturna Riviera");
  });
});
