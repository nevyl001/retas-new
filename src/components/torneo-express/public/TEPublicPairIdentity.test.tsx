import React from "react";
import { render, screen } from "@testing-library/react";
import {
  collectPairPlayerEntries,
  paintPairSide,
  pairSideFromRoster,
  TEPublicPairIdentity,
  type TEPublicPairSide,
} from "./TEPublicPairIdentity";

function side(
  partial: Partial<TEPublicPairSide> & Pick<TEPublicPairSide, "player1">
): TEPublicPairSide {
  return { player2: null, ...partial };
}

describe("TEPublicPairIdentity", () => {
  it("separa una pareja real en dos jugadores con id", () => {
    expect(
      pairSideFromRoster({
        display: "Fernanda Tapia / Josue",
        player1Id: "p1",
        player2Id: "p2",
      })
    ).toEqual({
      player1: { id: "p1", nombre: "Fernanda Tapia" },
      player2: { id: "p2", nombre: "Josue" },
    });
  });

  it("una plaza virtual no busca foto ni inventa un segundo jugador", () => {
    expect(
      pairSideFromRoster({
        isVirtual: true,
        display: "Pareja por definir 1",
        player1Id: "no-debe-usarse",
        player2Id: "tampoco",
      })
    ).toEqual({
      player1: { id: null, nombre: "Pareja por definir 1" },
      player2: null,
    });
  });

  it("agrupa ids y no repite a la misma persona", () => {
    const shared = side({
      player1: { id: "ana", nombre: "Ana" },
      player2: { id: "luis", nombre: "Luis" },
    });
    const again = side({
      player1: { id: "ana", nombre: "Ana López" },
      player2: { id: null, nombre: "Plaza" },
    });

    expect(
      collectPairPlayerEntries([shared, again], [
        { id: "ana", name: "Ana" },
        { id: "  ", name: "vacío" },
        { id: null, name: "sin id" },
      ])
    ).toEqual([
      { id: "ana", name: "Ana" },
      { id: "luis", name: "Luis" },
    ]);
  });

  it("pinta foto solo donde el lookup la tiene", () => {
    const painted = paintPairSide(
      side({
        player1: { id: "a", nombre: "Ana" },
        player2: { id: "b", nombre: "Beto" },
      }),
      { a: "https://cdn.example/ana.jpg", b: null }
    );

    expect(painted.player1.fotoUrl).toBe("https://cdn.example/ana.jpg");
    expect(painted.player2?.fotoUrl).toBeNull();
  });

  describe("render", () => {
    it("muestra dos nombres separados y no el texto con barra", () => {
      render(
        <TEPublicPairIdentity
          variant="match"
          player1={{
            id: "a",
            nombre: "Fernanda Tapia",
            fotoUrl: "https://cdn.example/fer.jpg",
          }}
          player2={{
            id: "b",
            nombre: "Josue",
            fotoUrl: "https://cdn.example/josue.jpg",
          }}
        />
      );

      expect(screen.getByText("Fernanda Tapia")).toBeTruthy();
      expect(screen.getByText("Josue")).toBeTruthy();
      expect(screen.queryByText("Fernanda Tapia / Josue")).toBeNull();
      expect(screen.queryByText("FT")).toBeNull();
      expect(screen.queryByText("JE")).toBeNull();
    });

    it("usa iniciales si no hay foto y un solo jugador si la plaza es virtual", () => {
      render(
        <TEPublicPairIdentity
          variant="standings"
          player1={{ id: null, nombre: "Pareja por definir 1" }}
          player2={null}
        />
      );

      expect(screen.getByText("Pareja por definir 1")).toBeTruthy();
      expect(screen.getByText("P1")).toBeTruthy();
      expect(screen.queryByText("Pareja por definir 1 / Open")).toBeNull();
    });

    it("conserva el nombre largo y las iniciales del jugador sin foto", () => {
      const largo = "María Fernanda Guadalupe Tapia Hernández";
      render(
        <TEPublicPairIdentity
          variant="match"
          player1={{ id: "a", nombre: largo, fotoUrl: null }}
          player2={{ id: "b", nombre: "Josue", fotoUrl: "https://cdn.example/josue.jpg" }}
        />
      );

      expect(screen.getByText(largo)).toBeTruthy();
      expect(screen.getByText("MH")).toBeTruthy();
      expect(screen.getByText("Josue")).toBeTruthy();
      expect(screen.queryByText("JE")).toBeNull();
    });
  });
});
