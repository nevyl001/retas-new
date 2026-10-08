import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TorneoExpressEvento } from "../../lib/torneoExpress/types";
import { EventoListaCard, formatEventoRango, isEventoPublicado } from "./EventoListaCard";

const base: TorneoExpressEvento = {
  id: "e1",
  nombre: "Copa Riviera",
  organizador_id: "o1",
  slug: "copa-riviera",
  estado: "published",
  flyer_url: "https://cdn.test/flyer.jpg",
  logo_source: "flyer",
  timezone: "America/Mexico_City",
  fecha_inicio: "2026-10-06",
  fecha_fin: "2026-10-10",
  clasificacion_modo: "dif_puntos",
  partido_formato: "flexible",
  created_at: "2026-09-01T00:00:00Z",
};

function renderCard(over: Partial<TorneoExpressEvento> = {}, extra = {}) {
  const onManage = jest.fn();
  const onDelete = jest.fn();
  render(
    <ul>
      <EventoListaCard
        evento={{ ...base, ...over }}
        categoriaCount={3}
        temporal="en_curso"
        deleting={false}
        onManage={onManage}
        onDelete={onDelete}
        {...extra}
      />
    </ul>
  );
  return { onManage, onDelete };
}

describe("EventoListaCard", () => {
  it("muestra estado temporal, categorías y publicación por separado", () => {
    renderCard();
    expect(screen.getByRole("heading", { name: "Copa Riviera" })).toBeInTheDocument();
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByText("3 categorías")).toBeInTheDocument();
    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByAltText("Flyer de Copa Riviera")).toBeInTheDocument();
  });

  it("Gestionar evento y Eliminar evento conservan sus handlers", () => {
    const { onManage, onDelete } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Gestionar evento" }));
    expect(onManage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Copa Riviera" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar evento" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("el enlace público solo aparece si hay slug y está publicado", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Más acciones/ }));
    expect(screen.getByRole("menuitem", { name: "Ver página pública" })).toHaveAttribute(
      "href",
      "/eventos/copa-riviera"
    );
  });

  it("borrador sin flyer: placeholder, «Sin publicar» y sin enlace público", () => {
    renderCard({ estado: "draft", flyer_url: null }, { temporal: "borrador" });
    expect(screen.getByText("Sin flyer")).toBeInTheDocument();
    expect(screen.getByText("Sin publicar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Más acciones/ }));
    expect(screen.queryByRole("menuitem", { name: "Ver página pública" })).toBeNull();
  });

  it("si el flyer falla al cargar cae al placeholder", () => {
    renderCard();
    fireEvent.error(screen.getByAltText("Flyer de Copa Riviera"));
    expect(screen.getByText("Sin flyer")).toBeInTheDocument();
  });
});

describe("helpers", () => {
  it("formatEventoRango", () => {
    expect(formatEventoRango(null, null)).toBe("Fechas por definir");
    expect(formatEventoRango("2026-10-06", "2026-10-06")).toMatch(/2026/);
    expect(formatEventoRango("2026-10-06", "2026-10-10")).toContain("–");
  });

  it("isEventoPublicado", () => {
    expect(isEventoPublicado("draft")).toBe(false);
    expect(isEventoPublicado("archived")).toBe(false);
    expect(isEventoPublicado("published")).toBe(true);
    expect(isEventoPublicado("completed")).toBe(true);
  });
});
