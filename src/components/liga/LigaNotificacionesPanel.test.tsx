/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LigaInscripcion, LigaJugadorPoolItem } from "../../lib/liga/types";
import { LigaNotificacionesPanel } from "./LigaNotificacionesPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("../../club-experience/ClubExperienceContext", () => ({
  useClubExperience: () => ({
    manifest: {
      displayName: "Hack Pádel",
      logos: {
        dark: "https://cdn.example.com/hack.png",
        light: null,
        square: null,
        favicon: null,
      },
      colors: { primary: "#123456" },
      emails: { footerLine: null, bannerImage: null },
    },
  }),
}));

const mockCargar = jest.fn();
const mockHabilitar = jest.fn();

jest.mock("../../services/ligaNotificacionesService", () => ({
  cargarNotificacionesLiga: (...args: unknown[]) => mockCargar(...args),
  establecerHabilitacionJugador: (...args: unknown[]) => mockHabilitar(...args),
  establecerCorreoVerificado: jest.fn().mockResolvedValue({
    ok: false,
    motivo: "correo_sin_verificacion",
  }),
  registrarConsentimientoJugador: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  revocarConsentimientoJugador: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  guardarConfigLiga: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  solicitarVerificacionCorreo: jest.fn().mockResolvedValue({
    ok: false,
    motivo: "deshabilitado",
    simulado: false,
    enlaceSimulado: null,
    solicitudId: null,
  }),
  solicitarBienvenidaJugador: jest.fn().mockResolvedValue({
    ok: false,
    encolado: false,
    motivo: "deshabilitado",
  }),
}));

const pool = [
  {
    id: "jug-1",
    nombre: "Saúl Moreno de la Torre del Valle",
    email: "saul@example.com",
    telefono: null,
    genero: "M",
    nivel: 3,
    estado: "activo",
    organizador_id: "org-1",
    created_at: "2026-01-01T00:00:00Z",
    categoria: "4ta_fuerza",
    riviera_id: null,
    riviera_jugador_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    foto_url: null,
  },
] as LigaJugadorPoolItem[];

const inscripciones = [
  {
    id: "ins-1",
    liga_id: "liga-1",
    jugador_id: "jug-1",
    puntos: 0,
  },
] as LigaInscripcion[];

describe("LigaNotificacionesPanel", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
    mockHabilitar.mockResolvedValue({ ok: true, motivo: null });
    mockCargar.mockResolvedValue({
      disponible: true,
      preferencias: [],
      config: { bienvenida_pausada: true, modo_prueba: true },
      historial: [],
      cola: [],
      verificaciones: [],
    });
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

  async function renderPanel() {
    await act(async () => {
      root.render(
        <LigaNotificacionesPanel
          ligaId="liga-1"
          ligaNombre="Liga Nocturna"
          inscripciones={inscripciones}
          equipos={[]}
          pool={pool}
          sustituciones={[]}
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("muestra al jugador deshabilitado, sin un control para habilitar a todos", async () => {
    await renderPanel();
    expect(container.textContent).toContain("Saúl Moreno de la Torre del Valle");
    expect(container.textContent).toContain("Correo por verificar");
    expect(container.textContent).toContain("0 seleccionados");
    expect(container.textContent).toContain("1 excluidos");
    expect(container.textContent?.toLowerCase()).not.toContain("habilitar a todos");
    expect(container.textContent).not.toContain("Marcar correo verificado");
    expect(container.textContent).toContain("Correo por verificar");
    expect(container.textContent).not.toContain("Solicitar verificación");
    const checkbox = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("guarda la autorización individual sin convertirla en consentimiento", async () => {
    await renderPanel();
    const checkbox = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    await act(async () => {
      checkbox.click();
      await Promise.resolve();
    });
    expect(mockHabilitar).toHaveBeenCalledWith(
      expect.objectContaining({
        ligaId: "liga-1",
        jugadorId: "jug-1",
        habilitado: true,
      })
    );
    expect(container.textContent).toContain("Cambios guardados");
    expect(container.textContent).not.toContain("saul@example.com enviado");
  });

  it("la vista previa se identifica como vista previa y no incluye el correo en el enlace", async () => {
    await renderPanel();
    const preview = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Correo de bienvenida"
    );
    await act(async () => {
      preview?.click();
    });
    expect(container.textContent).toContain("Vista previa");
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("srcdoc")).toContain("VISTA PREVIA");
    expect(frame?.getAttribute("srcdoc")).toContain("Saúl Moreno de la Torre del Valle");
    expect(frame?.getAttribute("srcdoc")).toContain(
      "/players/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
    expect(frame?.getAttribute("srcdoc")).not.toContain("saul@example.com");
    expect(frame?.getAttribute("srcdoc")).toContain("by Riviera Open");
  });

  it("24. una preferencia guardada sigue marcada al volver a abrir el panel", async () => {
    mockCargar.mockResolvedValue({
      disponible: true,
      preferencias: [
        {
          liga_jugador_id: "jug-1",
          riviera_jugador_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          admin_habilitado: true,
          consentimiento_estado: "sin_autorizacion",
          consentimiento_origen: null,
          consentimiento_registrado_at: null,
          correo_verificado: false,
          correo_verificacion_origen: null,
          correo_verificado_email: null,
        },
      ],
      config: { bienvenida_pausada: true, modo_prueba: true },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    const checkbox = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(container.textContent).toContain("1 seleccionados");
    const badges = Array.from(
      container.querySelectorAll(".liga-notificaciones__badge")
    ).map((badge) => badge.textContent);
    expect(badges).toContain("Correo por verificar");
    expect(badges).not.toContain("Habilitado");
  });
});
