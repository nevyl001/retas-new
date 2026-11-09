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
const mockContacto = jest.fn();
const mockHabilitar = jest.fn();

jest.mock("../../services/ligaNotificacionesService", () => ({
  cargarNotificacionesLiga: (...args: unknown[]) => mockCargar(...args),
  cargarContactoInscritosLiga: (...args: unknown[]) => mockContacto(...args),
  establecerHabilitacionJugador: (...args: unknown[]) => mockHabilitar(...args),
  establecerCorreoVerificado: jest.fn().mockResolvedValue({
    ok: false,
    motivo: "correo_sin_verificacion",
  }),
  registrarConsentimientoJugador: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  revocarConsentimientoJugador: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  guardarConfigLiga: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  solicitarComunicacionManual: jest.fn().mockResolvedValue({
    ok: false,
    encolado: false,
    motivo: "deshabilitado",
  }),
  solicitarProcesamientoLote: jest.fn().mockResolvedValue({
    ok: true,
    enviosReales: false,
    enviados: 0,
    omitidos: 0,
    errores: 0,
    procesados: 0,
    motivo: "envios_apagados",
  }),
  descartarCorreosNoEnviados: jest.fn().mockResolvedValue({
    ok: true,
    descartados: 1,
    motivo: null,
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
    mockContacto.mockResolvedValue([]);
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: true,
      preferencias: [],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    const servicio = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ) as {
      solicitarProcesamientoLote: jest.Mock;
      solicitarComunicacionManual: jest.Mock;
    };
    servicio.solicitarProcesamientoLote.mockResolvedValue({
      ok: true,
      enviosReales: false,
      enviados: 0,
      omitidos: 0,
      errores: 0,
      procesados: 0,
      fueraAllowlist: 0,
      motivo: "envios_apagados",
    });
    servicio.solicitarComunicacionManual.mockResolvedValue({
      ok: false,
      encolado: false,
      motivo: "deshabilitado",
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
    expect(container.textContent).toContain("Sin autorización");
    expect(container.textContent).toContain("0 seleccionados");
    expect(container.textContent).toContain("1 excluidos");
    expect(container.querySelector(".liga-notificaciones__grid")).not.toBeNull();
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent?.toLowerCase()).not.toContain("habilitar a todos");
    expect(container.textContent).not.toContain("Autorización verbal");
    expect(container.textContent).not.toContain("Marcar correo verificado");
    expect(container.textContent).not.toContain("Iniciar verificación");
    expect(container.textContent).not.toContain("Por verificar");
    const checkbox = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it("guarda la fecha real indicada y no mueve el interruptor", async () => {
    const servicio = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ) as { registrarConsentimientoJugador: jest.Mock };
    servicio.registrarConsentimientoJugador.mockResolvedValue({
      ok: true,
      motivo: null,
    });
    mockHabilitar.mockClear();
    await renderPanel();
    const gestionar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Gestionar"
    );
    await act(async () => {
      gestionar?.click();
    });
    const fecha = document.body.querySelector(
      'input[type="date"]'
    ) as HTMLInputElement;
    expect(fecha).not.toBeNull();
    const asignar = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;
    await act(async () => {
      asignar?.call(fecha, "2026-06-15");
      fecha.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const guardar = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Guardar autorización"
    );
    await act(async () => {
      guardar?.click();
      await Promise.resolve();
    });
    expect(servicio.registrarConsentimientoJugador).toHaveBeenCalledWith(
      expect.objectContaining({
        jugadorId: "jug-1",
        origen: "manifestacion_presencial",
        registradoAt: expect.stringContaining("2026-06-15"),
      })
    );
    const enviado = servicio.registrarConsentimientoJugador.mock.calls[0][0]
      .registradoAt as string;
    expect(enviado.startsWith("2026-11-09")).toBe(false);
    expect(mockHabilitar).not.toHaveBeenCalled();
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

  it("la vista previa se identifica como vista previa y no incluye el correo", async () => {
    await renderPanel();
    const preview = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Redactar correo"
    );
    await act(async () => {
      preview?.click();
    });
    expect(container.textContent).toContain("Vista previa");
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("srcdoc")).toContain("VISTA PREVIA");
    expect(frame?.getAttribute("srcdoc")).toContain("Saúl Moreno de la Torre del Valle");
    expect(frame?.getAttribute("srcdoc")).not.toContain("saul@example.com");
  });

  it("24. una preferencia guardada sigue marcada al volver a abrir el panel", async () => {
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: true,
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
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
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
    expect(badges).toContain("Sin autorización");
    expect(badges).not.toContain("Listo para enviar");
  });

  it("con backend incompleto muestra revisión visual y no escribe", async () => {
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: false,
      verificacionDisponible: false,
      preferencias: [],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    expect(container.textContent).toContain("Vista de revisión");
    expect(container.textContent).toContain("están desactivados");
    const checkbox = container.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
    await act(async () => {
      checkbox.click();
      await Promise.resolve();
    });
    expect(mockHabilitar).not.toHaveBeenCalled();
  });

  it("muestra el correo global cuando el roster local está vacío", async () => {
    const poolSinCorreo = [
      {
        ...pool[0],
        email: null,
      },
    ];
    mockContacto.mockResolvedValue([
      {
        ligaJugadorId: "jug-1",
        email: "saul.global@example.com",
        telefono: null,
        rivieraJugadorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        identidadGlobalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        origen: "global_source",
      },
    ]);
    await act(async () => {
      root.render(
        <LigaNotificacionesPanel
          ligaId="liga-1"
          ligaNombre="Liga Nocturna"
          inscripciones={inscripciones}
          equipos={[]}
          pool={poolSinCorreo}
          sustituciones={[]}
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("saul.global@example.com");
    expect(container.textContent).not.toContain("Sin correo");
  });

  function preferenciaLista(
    id: string,
    extra: Record<string, unknown> = {}
  ) {
    return {
      liga_jugador_id: id,
      riviera_jugador_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      admin_habilitado: true,
      consentimiento_estado: "autorizado",
      consentimiento_origen: "manifestacion_presencial",
      consentimiento_registrado_at: "2026-01-01T00:00:00.000Z",
      correo_verificado: false,
      correo_verificacion_origen: null,
      correo_verificado_email: null,
      ...extra,
    };
  }

  async function abrirRedactar() {
    const tab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Redactar correo"
    );
    await act(async () => {
      tab?.click();
    });
  }

  async function marcarEnSelector(nombre: string) {
    const abrir = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "+ SELECCIONAR JUGADORES"
    );
    await act(async () => {
      abrir?.click();
    });
    const check = document.body.querySelector(
      `input[aria-label="Agregar a ${nombre} a este correo"]`
    ) as HTMLInputElement;
    expect(check).toBeTruthy();
    if (!check.checked) {
      await act(async () => {
        check.click();
      });
    }
    const agregar = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.startsWith("AGREGAR ")
    );
    await act(async () => {
      agregar?.click();
    });
  }

  it("A. selecciona un jugador, revisa y encola una sola fila", async () => {
    const mockEncolar = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ).solicitarComunicacionManual as jest.Mock;
    mockEncolar.mockResolvedValue({ ok: true, encolado: true, motivo: null });
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: [preferenciaLista("jug-1")],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    await abrirRedactar();
    expect(container.textContent).toContain("+ SELECCIONAR JUGADORES");
    expect(container.textContent).toContain("REVISAR CORREO");
    const revisarAntes = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    ) as HTMLButtonElement;
    expect(revisarAntes.disabled).toBe(true);
    await marcarEnSelector("Saúl Moreno de la Torre del Valle");
    const revisar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    ) as HTMLButtonElement;
    expect(revisar.disabled).toBe(false);
    await act(async () => {
      revisar.click();
    });
    expect(mockEncolar).not.toHaveBeenCalled();
    const enviar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "ENVIAR CORREO A 1 JUGADOR"
    );
    await act(async () => {
      enviar?.click();
      await Promise.resolve();
    });
    expect(mockEncolar).toHaveBeenCalledTimes(1);
    expect(mockEncolar.mock.calls[0][0].jugadorId).toBe("jug-1");
    expect(container.textContent).toContain("Pendiente de procesamiento");
    expect(container.textContent).not.toContain("Correo enviado");
  });

  it("C. volver a editar no encola", async () => {
    const mockEncolar = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ).solicitarComunicacionManual as jest.Mock;
    mockEncolar.mockClear();
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: [preferenciaLista("jug-1")],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    await abrirRedactar();
    await marcarEnSelector("Saúl Moreno de la Torre del Valle");
    const revisar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    );
    await act(async () => {
      revisar?.click();
    });
    const volver = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "VOLVER A EDITAR"
    );
    await act(async () => {
      volver?.click();
    });
    expect(mockEncolar).not.toHaveBeenCalled();
    expect(container.textContent).toContain("REVISAR CORREO");
  });

  it("D y E. desactivado o revocado no se puede agregar", async () => {
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: [
        preferenciaLista("jug-1", { admin_habilitado: false }),
      ],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    await abrirRedactar();
    const abrir = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "+ SELECCIONAR JUGADORES"
    );
    await act(async () => {
      abrir?.click();
    });
    const check = document.body.querySelector(
      'input[aria-label="Agregar a Saúl Moreno de la Torre del Valle a este correo"]'
    ) as HTMLInputElement;
    expect(check.disabled).toBe(true);
    expect(document.body.textContent).toContain("Sigue deshabilitado");
  });

  it("G. un error del RPC se muestra y se puede reintentar con el mismo lote", async () => {
    const mockEncolar = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ).solicitarComunicacionManual as jest.Mock;
    mockEncolar.mockResolvedValue({
      ok: false,
      encolado: false,
      motivo: "sin_autorizacion",
    });
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: [preferenciaLista("jug-1")],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    await abrirRedactar();
    await marcarEnSelector("Saúl Moreno de la Torre del Valle");
    const revisar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    );
    await act(async () => {
      revisar?.click();
    });
    const enviar = () =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "ENVIAR CORREO A 1 JUGADOR"
      );
    await act(async () => {
      enviar()?.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Falta autorización documentada");
    await act(async () => {
      enviar()?.click();
      await Promise.resolve();
    });
    expect(mockEncolar).toHaveBeenCalledTimes(2);
    expect(mockEncolar.mock.calls[0][0].loteId).toBe(
      mockEncolar.mock.calls[1][0].loteId
    );
  });

  it("B. tres jugadores elegibles generan tres encolados del mismo lote", async () => {
    const mockEncolar = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ).solicitarComunicacionManual as jest.Mock;
    mockEncolar.mockResolvedValue({ ok: true, encolado: true, motivo: null });
    const ids = ["jug-1", "jug-2", "jug-3"];
    const nombres = ["Saúl Moreno de la Torre del Valle", "Axel A", "Zaid"];
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: ids.map((id) => preferenciaLista(id)),
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await act(async () => {
      root.render(
        <LigaNotificacionesPanel
          ligaId="liga-1"
          ligaNombre="Liga Nocturna"
          inscripciones={ids.map((id, index) => ({
            id: `ins-${index}`,
            liga_id: "liga-1",
            jugador_id: id,
            puntos: 0,
          })) as LigaInscripcion[]}
          equipos={[]}
          pool={ids.map((id, index) => ({
            ...pool[0],
            id,
            nombre: nombres[index],
            email: `jugador${index}@example.com`,
          }))}
          sustituciones={[]}
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await abrirRedactar();
    for (const nombre of nombres) {
      await marcarEnSelector(nombre);
    }
    const revisar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    );
    await act(async () => {
      revisar?.click();
    });
    const enviar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "ENVIAR CORREO A 3 JUGADORES"
    );
    await act(async () => {
      enviar?.click();
      await Promise.resolve();
    });
    expect(mockEncolar).toHaveBeenCalledTimes(3);
    const jugadores = mockEncolar.mock.calls.map((call) => call[0].jugadorId);
    expect(new Set(jugadores).size).toBe(3);
    const lotes = new Set(mockEncolar.mock.calls.map((call) => call[0].loteId));
    expect(lotes.size).toBe(1);
    expect(container.textContent).toContain("Pendiente de procesamiento");
    expect(container.textContent).not.toContain("Correo enviado");
    expect(container.textContent).not.toContain("Procesando…");
  });

  it("C. un 401 del lote se muestra y no vuelve a llamar al procesador", async () => {
    const servicio = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ) as {
      solicitarComunicacionManual: jest.Mock;
      solicitarProcesamientoLote: jest.Mock;
    };
    servicio.solicitarComunicacionManual.mockResolvedValue({
      ok: true,
      encolado: true,
      motivo: null,
    });
    servicio.solicitarProcesamientoLote.mockResolvedValue({
      ok: false,
      enviosReales: false,
      enviados: 0,
      omitidos: 0,
      errores: 0,
      procesados: 0,
      fueraAllowlist: 0,
      motivo: "sesion_invalida",
    });
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: [preferenciaLista("jug-1")],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    await abrirRedactar();
    await marcarEnSelector("Saúl Moreno de la Torre del Valle");
    const revisar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    );
    await act(async () => {
      revisar?.click();
    });
    const enviar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "ENVIAR CORREO A 1 JUGADOR"
    );
    await act(async () => {
      enviar?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      "Correo preparado, pero no se pudo completar el procesamiento"
    );
    expect(container.textContent).not.toContain("Procesando…");
    expect(servicio.solicitarProcesamientoLote).toHaveBeenCalledTimes(1);
  });

  it("D. un fallo del procesador libera el botón y reintenta el mismo lote", async () => {
    const servicio = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ) as {
      solicitarComunicacionManual: jest.Mock;
      solicitarProcesamientoLote: jest.Mock;
    };
    servicio.solicitarComunicacionManual
      .mockResolvedValueOnce({ ok: true, encolado: true, motivo: null })
      .mockResolvedValueOnce({
        ok: true,
        encolado: false,
        motivo: "ya_encolado",
      });
    servicio.solicitarProcesamientoLote.mockResolvedValue({
      ok: false,
      enviosReales: false,
      enviados: 0,
      omitidos: 0,
      errores: 1,
      procesados: 0,
      fueraAllowlist: 0,
      motivo: "procesador_no_disponible",
    });
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: [preferenciaLista("jug-1")],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    await abrirRedactar();
    await marcarEnSelector("Saúl Moreno de la Torre del Valle");
    const revisar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    );
    await act(async () => {
      revisar?.click();
    });
    const enviar = () =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "ENVIAR CORREO A 1 JUGADOR"
      );
    await act(async () => {
      enviar()?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      "Correo preparado, pero no se pudo completar el procesamiento"
    );
    const lote = servicio.solicitarComunicacionManual.mock.calls[0][0].loteId;
    await act(async () => {
      const tab = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Redactar correo"
      );
      tab?.click();
    });
    await act(async () => {
      const otra = Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "REVISAR CORREO"
      );
      otra?.click();
    });
    await act(async () => {
      enviar()?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(servicio.solicitarComunicacionManual.mock.calls[1][0].loteId).toBe(
      lote
    );
    expect(servicio.solicitarProcesamientoLote).toHaveBeenCalledTimes(2);
    expect(
      servicio.solicitarProcesamientoLote.mock.calls.every(
        (call) => call[0].loteId === lote
      )
    ).toBe(true);
  });

  it("E. una aceptación de Resend se muestra sin dejar el botón cargando", async () => {
    const servicio = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ) as {
      solicitarComunicacionManual: jest.Mock;
      solicitarProcesamientoLote: jest.Mock;
    };
    servicio.solicitarComunicacionManual.mockResolvedValue({
      ok: true,
      encolado: true,
      motivo: null,
    });
    servicio.solicitarProcesamientoLote.mockResolvedValue({
      ok: true,
      enviosReales: true,
      enviados: 1,
      omitidos: 0,
      errores: 0,
      procesados: 1,
      fueraAllowlist: 2,
      motivo: null,
    });
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: [preferenciaLista("jug-1")],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    await abrirRedactar();
    await marcarEnSelector("Saúl Moreno de la Torre del Valle");
    const revisar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    );
    await act(async () => {
      revisar?.click();
    });
    const enviar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "ENVIAR CORREO A 1 JUGADOR"
    );
    await act(async () => {
      enviar?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Resend aceptó 1 correo");
    expect(container.textContent).toContain("no entran en esta prueba");
    expect(container.textContent).not.toContain("Procesando…");
  });

  it("G. un segundo clic mientras prepara no vuelve a encolar", async () => {
    const servicio = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ) as { solicitarComunicacionManual: jest.Mock };
    let soltar: (valor: {
      ok: boolean;
      encolado: boolean;
      motivo: null;
    }) => void = () => undefined;
    servicio.solicitarComunicacionManual.mockReturnValue(
      new Promise((resolve) => {
        soltar = resolve;
      })
    );
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: [preferenciaLista("jug-1")],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    await abrirRedactar();
    await marcarEnSelector("Saúl Moreno de la Torre del Valle");
    const revisar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    );
    await act(async () => {
      revisar?.click();
    });
    const enviar = () =>
      Array.from(container.querySelectorAll("button")).find((button) =>
        button.textContent?.includes("ENVIAR CORREO")
      ) as HTMLButtonElement;
    const boton = enviar();
    await act(async () => {
      boton.click();
    });
    expect(boton.disabled).toBe(true);
    expect(boton.textContent).toContain("Preparando envío");
    await act(async () => {
      boton.click();
    });
    expect(servicio.solicitarComunicacionManual).toHaveBeenCalledTimes(1);
    await act(async () => {
      soltar({ ok: true, encolado: true, motivo: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).not.toContain("Preparando envío");
    servicio.solicitarComunicacionManual.mockResolvedValue({
      ok: false,
      encolado: false,
      motivo: "deshabilitado",
    });
  });

  it("E. una revocación se muestra y no se puede marcar", async () => {
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: false,
      preferencias: [
        preferenciaLista("jug-1", { consentimiento_estado: "revocado" }),
      ],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    await renderPanel();
    await abrirRedactar();
    const abrir = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "+ SELECCIONAR JUGADORES"
    );
    await act(async () => {
      abrir?.click();
    });
    const check = document.body.querySelector(
      'input[aria-label="Agregar a Saúl Moreno de la Torre del Valle a este correo"]'
    ) as HTMLInputElement;
    expect(check.disabled).toBe(true);
    expect(document.body.textContent).toContain("autorización revocada");
  });

  it("borra del historial un pendiente y conserva el aceptado", async () => {
    const servicio = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ) as { descartarCorreosNoEnviados: jest.Mock };
    servicio.descartarCorreosNoEnviados.mockResolvedValue({
      ok: true,
      descartados: 1,
      motivo: null,
    });
    window.confirm = jest.fn(() => true);
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: true,
      preferencias: [],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      historial: [
        {
          id: "log-enviado",
          liga_jugador_id: "jug-1",
          tipo: "bienvenida",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          proveedor_estado: "aceptado",
          created_at: "2026-11-09T12:00:00Z",
        },
      ],
      cola: [
        {
          id: "cola-1",
          liga_jugador_id: "jug-1",
          estado: "pendiente",
          attempts: 0,
          motivo: null,
          lote_id: "11111111-1111-4111-8111-111111111111",
        },
      ],
      verificaciones: [],
    });
    await renderPanel();
    const tab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Historial"
    );
    await act(async () => {
      tab?.click();
    });
    const filas = container.querySelectorAll(".liga-notificaciones__history-row");
    expect(filas[0].textContent).toContain("Aceptado");
    expect(filas[0].textContent).not.toContain("Borrar");
    expect(filas[1].textContent).toContain("Pendiente");
    expect(filas[1].textContent).toContain("Borrar");
    const borrar = Array.from(filas[1].querySelectorAll("button")).find(
      (button) => button.textContent === "Borrar"
    );
    await act(async () => {
      borrar?.click();
      await Promise.resolve();
    });
    expect(servicio.descartarCorreosNoEnviados).toHaveBeenCalledWith({
      ligaId: "liga-1",
      queueId: "cola-1",
      logId: undefined,
    });
  });
});
