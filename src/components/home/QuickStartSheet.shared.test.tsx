import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { QuickStartSheet } from "./QuickStartSheet";
import { RetaConfigFields } from "../reta/RetaConfigFields";
import type { RetaConfigFormValues } from "../../lib/reta/updateRetaConfig";
import { validateRetaConfigForm } from "../../lib/reta/retaConfigValidation";

jest.mock("../../club-experience", () => ({
  useClubModeEyebrow: () => "RivieraApp",
}));

/* eslint-disable testing-library/no-unnecessary-act */

describe("QuickStartSheet shared form", () => {
  let container: HTMLDivElement;
  let root: Root;

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

  it("17. QuickStartSheet monta RetaConfigFields (create) y envía payload", () => {
    const onSubmit = jest.fn();
    act(() => {
      root.render(
        <QuickStartSheet
          modeId="round-robin"
          onClose={() => {}}
          onSubmit={onSubmit}
        />
      );
    });
    const scope = document.body;
    expect(scope.querySelector(".reta-config-fields")).toBeTruthy();
    expect(scope.textContent).toMatch(/Remontada Final/);
    const btn = Array.from(scope.querySelectorAll("button")).find((b) =>
      /Iniciar reta/.test(b.textContent || "")
    );
    expect(btn).toBeTruthy();
    act(() => {
      btn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        modeId: "round-robin",
        courts: 2,
        championshipEnabled: false,
      })
    );
  });
  it("18. edit mode carga valores actuales en RetaConfigFields", () => {
    const values: RetaConfigFormValues = {
      name: "Reta cargada",
      description: "Desc",
      courts: 3,
      championshipEnabled: true,
      championshipRounds: 4,
      lugar: "Club",
      mostrar_lugar: true,
      cancha: "1-2",
      programado_en: "2026-07-20T18:00",
      duration_minutes: 120,
    };
    act(() => {
      root.render(
        <RetaConfigFields
          mode="edit"
          phase="draft"
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
    expect(container.textContent).toMatch(/Día y hora/);
    const errors = validateRetaConfigForm({
      ...values,
      mode: "edit",
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
