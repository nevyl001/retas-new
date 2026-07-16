/**
 * Presencia del CTA “Lanzar por WhatsApp” en pantallas reales.
 * Usa react-dom (sin RTL). Ver LigaGestionar.render.test.tsx.
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConvocatoriaWhatsAppPanel } from "../reta-abierta/ConvocatoriaWhatsAppPanel";
import { buildDueloConvocatoriaContext } from "../../lib/retaAbierta/adapters";
import {
  isConvocatoriaAllowedMode,
  CONVOCATORIA_EXCLUDED_MODES,
} from "../../lib/retaAbierta/modeWhitelist";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("../../lib/retaAbierta/retaAbiertaService", () => ({
  buildRetaAbiertaPublicUrl: (slug: string) => `https://app.test/jugar/${slug}`,
  fetchOpenGameRegistrationConfig: jest.fn().mockResolvedValue(null),
  fetchOpenRegistrationPublic: jest.fn(),
  listOpenGameRegistrationEntries: jest.fn().mockResolvedValue([]),
  promoteOpenRegistrationEntry: jest.fn(),
  removeOpenRegistrationEntry: jest.fn(),
  upsertOpenRegistrationConfig: jest.fn(),
}));

describe("ConvocatoriaWhatsAppPanel presencia", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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

  it("muestra Lanzar por WhatsApp para Duelo sin entityId (borrador)", async () => {
    await act(async () => {
      root.render(
        <ConvocatoriaWhatsAppPanel
          context={buildDueloConvocatoriaContext({
            dueloId: "",
            name: "Duelo test",
            locationLabel: "1",
          })}
          ensureDraftEntity={async () => ({ entityId: "duelo-draft-1" })}
          canLaunch={() => null}
          compact
        />
      );
    });

    expect(
      container.querySelector('[data-testid="lanzar-por-whatsapp"]')
    ).not.toBeNull();
    expect(container.textContent).toContain("Convocatoria Riviera");
    expect(container.textContent).toContain("Lanzar por WhatsApp");
  });

  it("whitelist: reta/americano/duelo permitidos; liga/TE excluidos", () => {
    expect(isConvocatoriaAllowedMode("reta")).toBe(true);
    expect(isConvocatoriaAllowedMode("americano")).toBe(true);
    expect(isConvocatoriaAllowedMode("duelo_2v2")).toBe(true);
    expect(isConvocatoriaAllowedMode("liga")).toBe(false);
    expect(isConvocatoriaAllowedMode("torneo_express")).toBe(false);
    expect(CONVOCATORIA_EXCLUDED_MODES).toEqual(
      expect.arrayContaining(["liga", "torneo_express", "torneo"])
    );
  });
});
