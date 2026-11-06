/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LigaVerificarCorreoPublica } from "./LigaVerificarCorreoPublica";
import {
  confirmarVerificacionCorreo,
  inspeccionarVerificacionCorreo,
} from "../../services/ligaNotificacionesService";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("../../services/ligaNotificacionesService", () => ({
  inspeccionarVerificacionCorreo: jest.fn(),
  confirmarVerificacionCorreo: jest.fn(),
}));

const inspeccionar = inspeccionarVerificacionCorreo as jest.Mock;
const confirmar = confirmarVerificacionCorreo as jest.Mock;
const TOKEN = "a".repeat(64);

describe("LigaVerificarCorreoPublica", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.history.pushState({}, "", `/public/verificar-correo?t=${TOKEN}`);
    inspeccionar.mockResolvedValue({ ok: true, estado: "pendiente" });
    confirmar.mockResolvedValue({ ok: true, estado: "confirmado" });
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

  it("el GET solo inspecciona y no confirma", async () => {
    await act(async () => {
      root.render(<LigaVerificarCorreoPublica />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(inspeccionar).toHaveBeenCalledWith(TOKEN);
    expect(confirmar).not.toHaveBeenCalled();
    expect(container.textContent).toContain("CONFIRMAR MI CORREO");
  });

  it("la confirmación requiere el botón", async () => {
    await act(async () => {
      root.render(<LigaVerificarCorreoPublica />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const boton = Array.from(container.querySelectorAll("button")).find((el) =>
      el.textContent?.includes("CONFIRMAR MI CORREO")
    );
    await act(async () => {
      boton?.click();
      await Promise.resolve();
    });
    expect(confirmar).toHaveBeenCalledWith(TOKEN);
    expect(container.textContent).toContain("Tu correo quedó verificado");
  });
});
