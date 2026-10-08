import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  EventoCategoriaCard,
  type EventoCategoriaCardProps,
} from "./EventoCategoriaCard";

function setup(overrides: Partial<EventoCategoriaCardProps> = {}) {
  const props: EventoCategoriaCardProps = {
    title: "6ta Fuerza",
    displayEstado: "en_curso",
    fallbackEstadoLabel: "en_curso",
    isEditing: false,
    draftName: "6ta Fuerza",
    saving: false,
    deleting: false,
    onDraftChange: jest.fn(),
    onStartEdit: jest.fn(),
    onCommitEdit: jest.fn(),
    onCancelEdit: jest.fn(),
    onManage: jest.fn(),
    onDelete: jest.fn(),
    ...overrides,
  };
  render(
    <ul>
      <EventoCategoriaCard {...props} />
    </ul>
  );
  return props;
}

describe("EventoCategoriaCard", () => {
  it("muestra nombre, estado y las acciones Gestionar y Borrar", () => {
    const props = setup();
    expect(screen.getByRole("heading", { name: "6ta Fuerza" })).toBeInTheDocument();
    expect(screen.getByText("En curso")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gestionar" }));
    expect(props.onManage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
  });

  it("el lápiz inicia la edición", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Editar categoría 6ta Fuerza" }));
    expect(props.onStartEdit).toHaveBeenCalledTimes(1);
  });

  it("en edición: Enter confirma, Escape cancela y los botones hacen lo mismo", () => {
    const props = setup({ isEditing: true });
    const input = screen.getByRole("textbox", { name: "Nuevo nombre de la categoría" });
    fireEvent.change(input, { target: { value: "5ta Fuerza" } });
    expect(props.onDraftChange).toHaveBeenCalledWith("5ta Fuerza");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onCommitEdit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onCancelEdit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Guardar categoría" }));
    expect(props.onCommitEdit).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(props.onCancelEdit).toHaveBeenCalledTimes(2);
  });

  it("mientras guarda el renombre se bloquean la edición y Borrar", () => {
    setup({ isEditing: true, saving: true });
    expect(screen.getByRole("textbox", { name: "Nuevo nombre de la categoría" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar categoría" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Borrar" })).toBeDisabled();
  });

  it("con un borrado en curso Borrar queda deshabilitado", () => {
    setup({ deleting: true });
    expect(screen.getByRole("button", { name: "Borrar" })).toBeDisabled();
  });

  it.each([
    ["pendiente", "Pendiente"],
    ["finalizado", "Finalizado"],
  ] as const)("etiqueta el estado %s", (displayEstado, label) => {
    setup({ displayEstado });
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
