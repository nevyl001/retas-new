import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeProgramacionMenu } from "./TeProgramacionMenu";

describe("TeProgramacionMenu", () => {
  it("abre Programar faltantes y Reorganizar pendientes desde Editar programación", () => {
    const onProgramarFaltantes = jest.fn();
    const onReorganizar = jest.fn();
    const onEditarCalendario = jest.fn();
    render(
      <TeProgramacionMenu
        onProgramarFaltantes={onProgramarFaltantes}
        onReorganizar={onReorganizar}
        onEditarCalendario={onEditarCalendario}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar programación" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Programar faltantes" }));
    expect(onProgramarFaltantes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Editar programación" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reorganizar pendientes" }));
    expect(onReorganizar).toHaveBeenCalledTimes(1);
    expect(onEditarCalendario).not.toHaveBeenCalled();
  });
});
