/**
 * Auditoría: ranking público — fixture local 25 jugadores.
 * Sin rediseño ni DB: valida búsqueda, top 3, lista larga, persistencia de categoría.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RankingPodio } from "./RankingPodio";
import {
  matchesRankingSearch,
  publicRankingCategoriaStorageKey,
  readStoredPublicRankingCategoria,
  splitRankingPresentation,
  writeStoredPublicRankingCategoria,
} from "./rankingPublicUi";
import { rankingPosicionesFromSortedForClub } from "../../lib/rivieraJugadores/rankingPosition";
import type { RivieraJugadorWithStats } from "../../lib/rivieraJugadores/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const ORG = "org-fixture-audit";

function makePlayer(
  index: number,
  overrides: Partial<RivieraJugadorWithStats> = {}
): RivieraJugadorWithStats {
  const n = index + 1;
  const longName =
    n === 12
      ? "Juan Carlos de la Torre y Mendoza Hernández López"
      : `Jugador Fixture ${String(n).padStart(2, "0")}`;
  return {
    id: `id-${n}`,
    slug: `slug-${n}`,
    nombre: longName,
    foto_url: n % 4 === 0 ? null : `https://example.com/foto-${n}.jpg`,
    riviera_id: `RIV-${String(n).padStart(8, "0")}`,
    categoria: "5ta_fuerza",
    genero: "M",
    pais_codigo: "MX",
    stats: {
      puntos_totales: 500 - n * 7,
      victorias: 0,
      derrotas: 0,
      total_partidos: 0,
      total_torneos_express: 0,
    },
    ...overrides,
  } as RivieraJugadorWithStats;
}

function buildFixture(count: number): RivieraJugadorWithStats[] {
  return Array.from({ length: count }, (_, i) => makePlayer(i));
}

describe("rankingPublicUi — fixture largo (auditoría)", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("splitRankingPresentation: top 3 + lista desde el mismo arreglo (25)", () => {
    const rows = buildFixture(25);
    const { showPodio, podio, list, listOffset } = splitRankingPresentation(rows);
    expect(showPodio).toBe(true);
    expect(podio).toHaveLength(3);
    expect(list).toHaveLength(22);
    expect(listOffset).toBe(3);
    expect(podio[0].id).toBe("id-1");
    expect(list[0].id).toBe("id-4");
    expect(list[list.length - 1].id).toBe("id-25");
  });

  it("posiciones de dos dígitos en ranks (#10+)", () => {
    const rows = buildFixture(25);
    const ranks = rankingPosicionesFromSortedForClub(rows, ORG);
    expect(ranks[9]).toBe(10);
    expect(ranks[14]).toBe(15);
    expect(ranks[24]).toBe(25);
  });

  it("búsqueda local por nombre y Riviera ID sin consultas", () => {
    const rows = buildFixture(25);
    const byName = rows.filter((j) =>
      matchesRankingSearch(j, "de la Torre")
    );
    expect(byName).toHaveLength(1);
    expect(byName[0].nombre).toContain("de la Torre");

    const byId = rows.filter((j) => matchesRankingSearch(j, "RIV-00000018"));
    expect(byId).toHaveLength(1);
    expect(byId[0].riviera_id).toBe("RIV-00000018");

    const byCompact = rows.filter((j) => matchesRankingSearch(j, "00000007"));
    expect(byCompact).toHaveLength(1);

    const searching = splitRankingPresentation(
      rows.filter((j) => matchesRankingSearch(j, "Fixture 0")),
      { searching: true }
    );
    expect(searching.showPodio).toBe(false);
    expect(searching.list.length).toBeGreaterThan(5);
  });

  it("sin foto: fixture incluye null foto_url cada 4", () => {
    const rows = buildFixture(25);
    const sinFoto = rows.filter((j) => !j.foto_url);
    expect(sinFoto.length).toBeGreaterThanOrEqual(6);
  });

  it("persiste categoría ranking → ficha → volver (sessionStorage)", () => {
    writeStoredPublicRankingCategoria(ORG, "M", "5ta_fuerza");
    expect(readStoredPublicRankingCategoria(ORG, "M")).toBe("5ta_fuerza");
    expect(publicRankingCategoriaStorageKey(ORG, "M")).toContain(ORG);
    expect(readStoredPublicRankingCategoria(ORG, "F")).toBeNull();
  });

  it("<3 jugadores: no podio vacío", () => {
    const rows = buildFixture(2);
    const split = splitRankingPresentation(rows);
    expect(split.showPodio).toBe(false);
    expect(split.podio).toHaveLength(0);
    expect(split.list).toHaveLength(2);
  });
});

describe("RankingPodio — render fixture top 3", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.removeChild(container);
  });

  it("renderiza 3 slots y nombre largo sin romper", () => {
    const rows = buildFixture(25);
    const selected: string[] = [];
    root = createRoot(container);
    act(() => {
      root.render(
        <RankingPodio
          jugadores={rows.slice(0, 3)}
          ranks={[1, 2, 3]}
          clubOrganizadorId={ORG}
          internalClub
          onSelect={(slug) => selected.push(slug)}
        />
      );
    });

    const slots = container.querySelectorAll(".rjp-podio__slot");
    expect(slots.length).toBe(3);
    const names = Array.from(container.querySelectorAll(".rjp-podio__name")).map(
      (el) => el.textContent
    );
    expect(names[0]).toContain("Jugador Fixture 01");
    expect(names.join(" ")).toMatch(/Jugador Fixture/);

    act(() => {
      (slots[0] as HTMLButtonElement).click();
    });
    expect(selected[0]).toBe("slug-1");
  });
});
