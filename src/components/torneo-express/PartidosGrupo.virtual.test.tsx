import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PartidosGrupo } from "./PartidosGrupo";
import type {
  TorneoExpressGrupoPareja,
  TorneoExpressPartido,
} from "../../lib/torneoExpress/types";

function pareja(
  id: string,
  label: string,
  virtual: boolean
): TorneoExpressGrupoPareja {
  return {
    id: `gp-${id}`,
    grupo_id: "g",
    pareja_id: id,
    pareja_display: label,
    is_virtual: virtual,
    player1_id: virtual ? null : "p1",
    player2_id: virtual ? null : "p2",
    created_at: "2026-10-07T23:00:00Z",
  };
}

const partido: TorneoExpressPartido = {
  id: "m1",
  grupo_id: "g",
  pareja_local_id: "real",
  pareja_visitante_id: "virtual",
  puntos_local: null,
  puntos_visitante: null,
  ganador_id: null,
  estado: "pendiente",
  created_at: "2026-10-07T23:00:00Z",
};

describe("PartidosGrupo plaza virtual", () => {
  it("ofrece sustituir solo la pareja por definir", () => {
    const onDefine = jest.fn();
    render(
      <PartidosGrupo
        partidos={[partido]}
        parejas={[
          pareja("real", "Itzi M / Edgardo T", false),
          pareja("virtual", "Pareja por definir", true),
        ]}
        editable
        onDefineVirtualPair={onDefine}
      />
    );

    expect(
      screen.queryByRole("button", { name: "Sustituir Itzi M / Edgardo T" })
    ).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Sustituir Pareja por definir" })
    );
    expect(onDefine).toHaveBeenCalledWith("virtual", "Pareja por definir");
  });

  it("abre día, hora y cancha en un solo guardado", () => {
    render(
      <PartidosGrupo
        partidos={[partido]}
        parejas={[
          pareja("real", "Joel He / Eder Mendoza", false),
          pareja("virtual", "Kevin perez / Brandon perez", false),
        ]}
        canchaEditable
        horarioEditable
        onSaveProgramacion={jest.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Editar día/ }));
    expect(screen.getByText("Día, hora y cancha")).toBeTruthy();
    expect(screen.getByText("Día")).toBeTruthy();
    expect(screen.getByText("Hora")).toBeTruthy();
    expect(screen.getByText("Cancha")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Guardar" })).toHaveLength(1);
  });
});

describe("PartidosGrupo borrar resultado", () => {
  const jugado: TorneoExpressPartido = {
    ...partido,
    puntos_local: 6,
    puntos_visitante: 1,
    ganador_id: "real",
    estado: "jugado",
  };

  const parejas = [
    pareja("real", "Zaid / Mauricio", false),
    pareja("virtual", "Isra / Isbi", false),
  ];

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("muestra Borrar resultado junto a Corregir cuando el partido ya se jugó", () => {
    render(
      <PartidosGrupo
        partidos={[jugado]}
        parejas={parejas}
        editable
        onSaveResultado={jest.fn()}
        onResetResultado={jest.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Corregir resultado" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Borrar resultado" })).toBeTruthy();
  });

  it("pide confirmación y borra el resultado", () => {
    const onReset = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <PartidosGrupo
        partidos={[jugado]}
        parejas={parejas}
        editable
        onSaveResultado={jest.fn()}
        onResetResultado={onReset}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Borrar resultado" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledWith("m1");
  });

  it("no borra si se cancela la confirmación", () => {
    const onReset = jest.fn();
    jest.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <PartidosGrupo
        partidos={[jugado]}
        parejas={parejas}
        editable
        onSaveResultado={jest.fn()}
        onResetResultado={onReset}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Borrar resultado" }));
    expect(onReset).not.toHaveBeenCalled();
  });
});
