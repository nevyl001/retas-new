import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TorneoExpressEvento } from "../../lib/torneoExpress/types";
import { confirmSessionExit, navigateAppTo } from "../../lib/appRouting";
import { EventoDetalle } from "./EventoDetalle";

const mockEvento: TorneoExpressEvento = {
  id: "e1",
  nombre: "Copa Riviera",
  organizador_id: "o1",
  slug: "copa-riviera",
  estado: "published",
  flyer_url: null,
  logo_source: "club",
  timezone: "America/Mexico_City",
  fecha_inicio: "2026-10-06",
  fecha_fin: "2026-10-10",
  clasificacion_modo: "dif_puntos",
  partido_formato: "flexible",
  created_at: "2026-09-01T00:00:00Z",
};

const mockUpdateEvento = jest.fn();

jest.mock("../../services/torneoExpressService", () => ({
  // Funciones planas: CRA activa resetMocks y vaciaría las implementaciones de jest.fn.
  deleteTorneoExpress: async () => undefined,
  fetchEventoConCategorias: async () => ({ evento: mockEvento, categorias: [] }),
  formatSupabaseError: (e: unknown) => String(e),
  saveTorneoExpressCategoria: async () => undefined,
  syncEventoEstadoFromCategorias: async () => null,
  updateEvento: (...args: unknown[]) => mockUpdateEvento(...args),
}));

jest.mock("../../contexts/UserContext", () => ({
  useUser: () => ({ user: { id: "u1" } }),
}));

jest.mock("./TePageShell", () => ({
  TePageShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function clasificacionRadios(): HTMLInputElement[] {
  return (screen.getAllByRole("radio") as HTMLInputElement[]).filter(
    (r) => r.name === "clasificacion_modo"
  );
}

function pickOtherClasificacion(): HTMLInputElement {
  const target = clasificacionRadios().find((r) => !r.checked);
  if (!target) throw new Error("No hay otra opción de clasificación");
  fireEvent.click(target);
  return target;
}

async function renderDetalle() {
  render(<EventoDetalle eventoId="e1" />);
  await screen.findByRole("heading", { name: "Copa Riviera" });
}

describe("EventoDetalle (Fase 2)", () => {
  beforeEach(() => {
    mockUpdateEvento.mockReset();
    window.history.replaceState({}, "", "/torneo-express/evento/e1");
  });

  it("muestra encabezado compacto y pestañas Categorías | Reglas | Branding", async () => {
    await renderDetalle();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual(["Categorías", "Reglas", "Branding"]);
    expect(screen.getByRole("tab", { name: "Categorías" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Volver a borrador" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar categoría" })).toBeInTheDocument();
  });

  it("solo el panel activo es visible y los demás se conservan montados", async () => {
    await renderDetalle();
    expect(screen.getByRole("tabpanel", { name: "Categorías" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Reglas" }));
    expect(screen.getByRole("tabpanel", { name: "Reglas" })).toBeVisible();
    const categorias = screen
      .getAllByRole("tabpanel", { hidden: true })
      .find((panel) => panel.id === "mode-panel-categorias");
    expect(categorias).toBeInTheDocument();
    expect(categorias).not.toBeVisible();
    expect(categorias).toHaveAttribute("aria-labelledby", "mode-tab-categorias");
  });

  it("flechas y Fin cambian de pestaña con el teclado", async () => {
    await renderDetalle();
    const first = screen.getByRole("tab", { name: "Categorías" });
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Reglas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Reglas" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Reglas" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Branding" })).toHaveAttribute("aria-selected", "true");
  });

  it("cambiar de pestaña conserva los cambios sin guardar", async () => {
    await renderDetalle();
    fireEvent.click(screen.getByRole("tab", { name: "Reglas" }));
    const picked = pickOtherClasificacion();
    const pickedIndex = clasificacionRadios().indexOf(picked);
    expect(picked.checked).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "Branding" }));
    fireEvent.click(screen.getByRole("tab", { name: "Reglas" }));
    expect(clasificacionRadios()[pickedIndex].checked).toBe(true);
    expect(screen.getByText("Tienes cambios sin guardar")).toBeInTheDocument();
  });

  it("sin cambios navegar no pide confirmación", async () => {
    await renderDetalle();
    act(() => navigateAppTo("/torneo-express/eventos"));
    expect(window.location.pathname).toBe("/torneo-express/eventos");
    expect(screen.queryByText("Cambios sin guardar")).not.toBeInTheDocument();
  });

  it("con cambios en Reglas bloquea la navegación y ofrece seguir o salir", async () => {
    await renderDetalle();
    fireEvent.click(screen.getByRole("tab", { name: "Reglas" }));
    pickOtherClasificacion();

    fireEvent.click(screen.getByRole("button", { name: "← Volver a Eventos" }));
    expect(window.location.pathname).toBe("/torneo-express/evento/e1");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Reglas");

    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.pathname).toBe("/torneo-express/evento/e1");

    fireEvent.click(screen.getByRole("button", { name: "← Volver a Eventos" }));
    fireEvent.click(await screen.findByRole("button", { name: "Salir sin guardar" }));
    expect(window.location.pathname).toBe("/torneo-express/eventos");
  });

  it("guardar reglas limpia el estado sucio y libera la navegación", async () => {
    await renderDetalle();
    fireEvent.click(screen.getByRole("tab", { name: "Reglas" }));
    pickOtherClasificacion();
    mockUpdateEvento.mockImplementation(async (_id: string, patch: Partial<TorneoExpressEvento>) => ({
      ...mockEvento,
      ...patch,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar reglas" }));
    await waitFor(() =>
      expect(screen.queryByText("Tienes cambios sin guardar")).not.toBeInTheDocument()
    );
    act(() => navigateAppTo("/torneo-express/eventos"));
    expect(window.location.pathname).toBe("/torneo-express/eventos");
  });

  it("muestra Ver página pública y Pantalla de canchas como enlaces visibles", async () => {
    await renderDetalle();
    expect(screen.getByRole("link", { name: "Ver página pública" })).toHaveAttribute(
      "href",
      "/eventos/copa-riviera"
    );
    expect(screen.getByRole("link", { name: "Pantalla de canchas" })).toHaveAttribute(
      "href",
      "/eventos/copa-riviera/en-vivo"
    );
  });

  it("cerrar sesión con cambios pendientes pide confirmar: cancelar aborta y confirmar continúa", async () => {
    await renderDetalle();
    fireEvent.click(screen.getByRole("tab", { name: "Reglas" }));
    pickOtherClasificacion();

    let first: Promise<boolean> = Promise.resolve(true);
    act(() => {
      first = confirmSessionExit();
    });
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("cierras sesión");
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    await expect(first).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    let second: Promise<boolean> = Promise.resolve(false);
    act(() => {
      second = confirmSessionExit();
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cerrar sesión sin guardar" }));
    await expect(second).resolves.toBe(true);
  });

  it("sin cambios, cerrar sesión no muestra ningún diálogo", async () => {
    await renderDetalle();
    await expect(confirmSessionExit()).resolves.toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
