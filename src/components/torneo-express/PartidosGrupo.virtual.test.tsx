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
