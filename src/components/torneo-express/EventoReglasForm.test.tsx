import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  CLASIFICACION_MODO_OPTIONS,
  PARTIDO_FORMATO_OPTIONS,
} from "../../lib/torneoExpress/clasificacionModo";
import { EventoReglasForm, type EventoReglasFormProps } from "./EventoReglasForm";

function setup(overrides: Partial<EventoReglasFormProps> = {}) {
  const props: EventoReglasFormProps = {
    clasificacionModo: "dif_puntos",
    partidoFormato: "flexible",
    onClasificacionChange: jest.fn(),
    onPartidoFormatoChange: jest.fn(),
    dirty: false,
    saving: false,
    onSave: jest.fn(),
    ...overrides,
  };
  render(<EventoReglasForm {...props} />);
  return props;
}

function radios(name: string): HTMLInputElement[] {
  return (screen.getAllByRole("radio") as HTMLInputElement[]).filter((r) => r.name === name);
}

describe("EventoReglasForm", () => {
  it("muestra todas las opciones existentes con su descripción y criterios", () => {
    setup();
    expect(radios("clasificacion_modo")).toHaveLength(CLASIFICACION_MODO_OPTIONS.length);
    expect(radios("partido_formato")).toHaveLength(PARTIDO_FORMATO_OPTIONS.length);
    for (const opt of [...CLASIFICACION_MODO_OPTIONS, ...PARTIDO_FORMATO_OPTIONS]) {
      expect(screen.getAllByText(opt.label).length).toBeGreaterThan(0);
      expect(screen.getByText(opt.description)).toBeInTheDocument();
      for (const step of opt.steps ?? []) {
        // Algunos criterios (p. ej. «Cara a cara») se repiten entre opciones.
        expect(screen.getAllByText(step.replace(/^\d+\.\s*/, "")).length).toBeGreaterThan(0);
      }
    }
  });

  it("marca la opción vigente de cada grupo", () => {
    setup({ clasificacionModo: "setto_pg", partidoFormato: "bo3_super_muerte" });
    expect(radios("clasificacion_modo").map((r) => r.checked)).toEqual([false, true]);
    expect(radios("partido_formato").map((r) => r.checked)).toEqual([false, true]);
  });

  it("elegir una opción avisa con el valor correcto", () => {
    const props = setup();
    fireEvent.click(radios("clasificacion_modo")[1]);
    expect(props.onClasificacionChange).toHaveBeenCalledWith("setto_pg");
    fireEvent.click(radios("partido_formato")[1]);
    expect(props.onPartidoFormatoChange).toHaveBeenCalledWith("bo3_super_muerte");
  });

  it("solo informa de cambios sin guardar cuando los hay", () => {
    setup({ dirty: true });
    expect(screen.getByRole("status")).toHaveTextContent("Tienes cambios sin guardar");
  });

  it("sin cambios no muestra el aviso y Guardar sigue disponible (comportamiento previo)", () => {
    const props = setup();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar reglas" }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("mientras guarda el botón indica el progreso y se deshabilita", () => {
    setup({ saving: true });
    expect(screen.getByRole("button", { name: /Guardando/ })).toBeDisabled();
  });
});
