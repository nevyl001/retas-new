/* eslint-disable testing-library/no-unnecessary-act */
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { PublicRetaMatchCard } from "../components/public/PublicRetaMatchCard";
import { UNASSIGNED_COURT_LABEL } from "./matchCourt";

describe("PublicRetaMatchCard court NULL", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("vista pública: court null → Por asignar (no Cancha 1)", () => {
    act(() => {
      root.render(
        <PublicRetaMatchCard
          pair1Label="A / B"
          pair2Label="C / D"
          score1={0}
          score2={0}
          hasResult={false}
          court={null}
          status="active"
          index={0}
        />
      );
    });
    expect(container.textContent).toContain(UNASSIGNED_COURT_LABEL);
    expect(container.textContent).not.toMatch(/Cancha 1/);
  });

  it("vista pública: court 2 → Cancha 2", () => {
    act(() => {
      root.render(
        <PublicRetaMatchCard
          pair1Label="A / B"
          pair2Label="C / D"
          score1={6}
          score2={4}
          hasResult
          court={2}
          status="finished"
          index={0}
        />
      );
    });
    expect(container.textContent).toContain("Cancha 2");
  });
});
