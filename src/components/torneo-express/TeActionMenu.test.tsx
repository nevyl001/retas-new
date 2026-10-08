import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeActionMenu } from "./TeActionMenu";

function setup(onDelete = jest.fn()) {
  render(
    <div>
      <TeActionMenu
        label="Más acciones de Copa"
        items={[
          { id: "public", label: "Ver página pública", href: "/eventos/copa", external: true },
          { id: "delete", label: "Eliminar evento", danger: true, separatorBefore: true, onSelect: onDelete },
        ]}
      />
      <button type="button">fuera</button>
    </div>
  );
  return { onDelete, trigger: screen.getByRole("button", { name: "Más acciones de Copa" }) };
}

describe("TeActionMenu", () => {
  it("expone aria-haspopup/aria-expanded y abre con foco en el primer ítem", () => {
    const { trigger } = setup();
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menu")).toHaveAttribute("id", trigger.getAttribute("aria-controls"));
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(screen.getByRole("menuitem", { name: "Ver página pública" })).toHaveFocus();
  });

  it("el enlace público abre en pestaña nueva de forma segura", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const link = screen.getByRole("menuitem", { name: "Ver página pública" });
    expect(link).toHaveAttribute("href", "/eventos/copa");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("navega con flechas, Inicio y Fin (cíclico)", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    const [first, second] = screen.getAllByRole("menuitem");
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "ArrowDown" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "End" });
    expect(second).toHaveFocus();
  });

  it("Escape cierra y devuelve el foco al botón", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0], { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("ArrowUp en el botón abre y enfoca el último ítem", () => {
    const { trigger } = setup();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowUp" });
    expect(screen.getByRole("menuitem", { name: "Eliminar evento" })).toHaveFocus();
  });

  it("cierra al hacer clic fuera y con Tab", () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.mouseDown(screen.getByRole("button", { name: "fuera" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0], { key: "Tab" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("seleccionar una acción la ejecuta una vez y cierra el menú", () => {
    const { trigger, onDelete } = setup();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar evento" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
