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
const mockConsultarPeriodo = jest.fn();

jest.mock("../../services/ligaNotificacionesService", () => ({
  cargarNotificacionesLiga: (...args: unknown[]) => mockCargar(...args),
  consultarHistorialPeriodoLiga: (...args: unknown[]) =>
    mockConsultarPeriodo(...args),
  cargarContactoInscritosLiga: (...args: unknown[]) => mockContacto(...args),
  establecerHabilitacionJugador: (...args: unknown[]) => mockHabilitar(...args),
  establecerCorreoVerificado: jest.fn().mockResolvedValue({
    ok: false,
    motivo: "correo_sin_verificacion",
  }),
  registrarConsentimientoJugador: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  revocarConsentimientoJugador: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  guardarConfigLiga: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  guardarSupervisionLiga: jest.fn().mockResolvedValue({ ok: true, motivo: null }),
  enviarPruebaSupervision: jest.fn().mockResolvedValue({
    ok: false,
    enviosReales: false,
    motivo: "prueba_apagada",
  }),
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
    localStorage.removeItem("ro-liga-plantillas:liga-1");
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })) as unknown as typeof window.matchMedia;
    mockHabilitar.mockResolvedValue({ ok: true, motivo: null });
    mockContacto.mockResolvedValue([]);
    mockConsultarPeriodo.mockReset();
    mockConsultarPeriodo.mockResolvedValue(null);
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

  it("guarda el correo de supervisión y muestra la prueba sin estado de verificación", async () => {
    mockCargar.mockResolvedValue({
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: true,
      preferencias: [],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "automatico",
        supervision_email: "admin@club.com",
        supervision_activa: true,
        supervision_alcance: "resultados",
      },
      historial: [],
      cola: [],
      verificaciones: [],
    });
    const servicio = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ) as {
      guardarSupervisionLiga: jest.Mock;
      enviarPruebaSupervision: jest.Mock;
    };
    servicio.guardarSupervisionLiga.mockResolvedValue({ ok: true, motivo: null });
    servicio.enviarPruebaSupervision.mockResolvedValue({
      ok: false,
      enviosReales: false,
      motivo: "prueba_apagada",
    });
    await renderPanel();
    const configuracion = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Configuración"
    );
    await act(async () => {
      configuracion?.click();
    });
    expect(container.textContent).toContain("Supervisión de correos");
    expect(container.textContent).toContain("ENVIAR CORREO DE PRUEBA");
    expect(container.textContent).not.toContain("Sin verificar");
    expect(container.textContent).not.toContain("Verificado");
    const guardar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "GUARDAR"
    );
    await act(async () => {
      guardar?.click();
      await Promise.resolve();
    });
    expect(servicio.guardarSupervisionLiga).toHaveBeenCalledWith({
      ligaId: "liga-1",
      email: "admin@club.com",
      activa: true,
      alcance: "resultados",
    });
    const prueba = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "ENVIAR CORREO DE PRUEBA"
    );
    await act(async () => {
      prueba?.click();
    });
    expect(document.body.textContent).toContain("Vista previa");
    expect(servicio.enviarPruebaSupervision).not.toHaveBeenCalled();
    const confirmarOriginal = window.confirm;
    window.confirm = jest.fn(() => false);
    const confirmar = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "CONFIRMAR ENVÍO"
    );
    await act(async () => {
      confirmar?.click();
      await Promise.resolve();
    });
    expect(window.confirm).toHaveBeenCalled();
    expect(servicio.enviarPruebaSupervision).not.toHaveBeenCalled();
    window.confirm = confirmarOriginal;
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
    expect(container.textContent).not.toContain("SELECCIONAR DESTINATARIOS");
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
      (button) => button.textContent === "CONFIRMAR Y ENVIAR A 1 JUGADOR"
    );
    await act(async () => {
      enviar?.click();
      await Promise.resolve();
    });
    expect(mockEncolar).toHaveBeenCalledTimes(1);
    expect(mockEncolar.mock.calls[0][0].jugadorId).toBe("jug-1");
    expect(container.textContent).toContain("pendiente");
    expect(container.textContent).toContain("procesamiento");
    expect(container.textContent).not.toContain("Correo enviado");
  });

  it("el botón del correo abre la jornada en curso y hay un solo selector", async () => {
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
    await act(async () => {
      root.render(
        <LigaNotificacionesPanel
          ligaId="liga-1"
          ligaNombre="Liga Nocturna"
          inscripciones={inscripciones}
          equipos={[]}
          pool={pool}
          sustituciones={[]}
          jornadas={[
            { numero: 2, estado: "completed" },
            { numero: 3, estado: "in_progress" },
            { numero: 4, estado: "upcoming" },
          ]}
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    await abrirRedactar();
    const selectores = Array.from(container.querySelectorAll("button")).filter(
      (button) => button.textContent === "+ SELECCIONAR JUGADORES"
    );
    expect(selectores).toHaveLength(1);
    const plantilla = container.querySelector(
      "#plantilla-correo"
    ) as HTMLSelectElement;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    await act(async () => {
      setter?.call(plantilla, "jornada");
      plantilla.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("srcdoc")).toContain(
      "/public/liga/liga-1/jornada/3"
    );
    expect(frame?.getAttribute("srcdoc")).toContain("VER MI JORNADA");
    expect(container.textContent).toContain("El botón abre la Jornada 3, en curso.");
    await marcarEnSelector("Saúl Moreno de la Torre del Valle");
    const revisar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "REVISAR CORREO"
    );
    await act(async () => {
      revisar?.click();
    });
    const enviar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "CONFIRMAR Y ENVIAR A 1 JUGADOR"
    );
    await act(async () => {
      enviar?.click();
      await Promise.resolve();
    });
    expect(mockEncolar.mock.calls[0][0].cuerpo).toContain(
      "RESULTADOS_URL:/public/liga/liga-1/jornada/3"
    );
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
        (button) => button.textContent === "CONFIRMAR Y ENVIAR A 1 JUGADOR"
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
      (button) => button.textContent === "CONFIRMAR Y ENVIAR A 3 JUGADORES"
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
    expect(container.textContent).toContain("pendiente");
    expect(container.textContent).toContain("procesamiento");
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
      (button) => button.textContent === "CONFIRMAR Y ENVIAR A 1 JUGADOR"
    );
    await act(async () => {
      enviar?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      "La sesión no pudo autorizar el procesamiento"
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
        (button) => button.textContent === "CONFIRMAR Y ENVIAR A 1 JUGADOR"
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
      (button) => button.textContent === "CONFIRMAR Y ENVIAR A 1 JUGADOR"
    );
    await act(async () => {
      enviar?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain(
      "1 aceptado · 2 pendientes · 0 errores"
    );
    expect(container.textContent).toContain("no entran en esta prueba");
    expect(container.textContent).not.toContain("Entregado");
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
        button.textContent?.includes("CONFIRMAR Y ENVIAR")
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
    const filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas[0].textContent).toContain("Aceptado");
    expect(filas[0].textContent).toContain("Borrar");
    expect(filas[1].textContent).toContain("Pendiente");
    expect(filas[1].textContent).not.toContain("Procesar");
    expect(filas[1].textContent).toContain("Borrar");
    const servicioEnvio = jest.requireMock(
      "../../services/ligaNotificacionesService"
    ) as {
      solicitarProcesamientoLote: jest.Mock;
      solicitarComunicacionManual: jest.Mock;
    };
    expect(servicioEnvio.solicitarProcesamientoLote).not.toHaveBeenCalled();
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
    const borrarAceptado = Array.from(filas[0].querySelectorAll("button")).find(
      (button) => button.textContent === "Borrar"
    );
    await act(async () => {
      borrarAceptado?.click();
      await Promise.resolve();
    });
    expect(window.confirm).toHaveBeenCalledWith(
      "¿Quitar este correo aceptado del historial? No se reenvía."
    );
    expect(servicio.descartarCorreosNoEnviados).toHaveBeenCalledWith({
      ligaId: "liga-1",
      queueId: undefined,
      logId: "log-enviado",
    });
    expect(servicioEnvio.solicitarProcesamientoLote).not.toHaveBeenCalled();
  });

  it("muestra una sola fila aceptada y no repite la cola", async () => {
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
          id: "log-1",
          queue_id: "q-1",
          liga_jugador_id: "jug-1",
          tipo: "bienvenida",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          proveedor_estado: "aceptado",
          created_at: "2026-11-09T19:15:00Z",
        },
        {
          id: "log-previo",
          queue_id: "q-1",
          liga_jugador_id: "jug-1",
          tipo: "bienvenida",
          estado: "pendiente",
          attempts: 1,
          motivo: "error_temporal",
          proveedor_estado: null,
          created_at: "2026-11-09T19:14:00Z",
        },
      ],
      cola: [
        {
          id: "q-1",
          liga_jugador_id: "jug-1",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          lote_id: null,
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
    const filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain("Aceptado");
    expect(filas[0].textContent).not.toContain("cola");
    expect(container.textContent).not.toContain("Pendiente de reintento");
    expect(container.textContent).toContain("Exclusiones");
  });

  it("separa exclusiones de elegibilidad del historial operativo", async () => {
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
          id: "log-ok",
          queue_id: "q-ok",
          liga_jugador_id: "jug-1",
          tipo: "bienvenida",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          proveedor_estado: "aceptado",
          created_at: "2026-11-09T19:15:00Z",
        },
      ],
      cola: [
        {
          id: "q-ok",
          liga_jugador_id: "jug-1",
          tipo: "bienvenida",
          origen: "manual",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          lote_id: null,
        },
        {
          id: "q-omit",
          liga_jugador_id: "jug-2",
          tipo: "recordatorio_jornada",
          origen: "automatico",
          estado: "omitido",
          attempts: 0,
          motivo: "sin_correo",
          lote_id: null,
        },
        {
          id: "q-cancel",
          liga_jugador_id: "jug-1",
          tipo: "recordatorio_jornada",
          origen: "automatico",
          estado: "omitido",
          motivo: "cancelado",
          attempts: 0,
          lote_id: null,
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
    const operativas = Array.from(
      container.querySelectorAll(
        '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
      )
    ).map((node) => node.textContent ?? "");
    expect(operativas.some((text) => text.includes("Aceptado"))).toBe(true);
    expect(operativas.some((text) => text.includes("Cancelado"))).toBe(true);
    expect(operativas.some((text) => text.includes("Sin correo"))).toBe(false);
    expect(container.textContent).toContain("Exclusiones");
    expect(container.textContent).toMatch(/registro[s]? histórico/);
  });

  it("una confirmación nueva usa otro lote después de un envío aceptado", async () => {
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
      fueraAllowlist: 0,
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
    const revisar = () =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "REVISAR CORREO"
      );
    const enviar = () =>
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "CONFIRMAR Y ENVIAR A 1 JUGADOR"
      );
    await act(async () => {
      revisar()?.click();
    });
    await act(async () => {
      enviar()?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await abrirRedactar();
    await marcarEnSelector("Saúl Moreno de la Torre del Valle");
    await act(async () => {
      revisar()?.click();
    });
    await act(async () => {
      enviar()?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const lotes = servicio.solicitarComunicacionManual.mock.calls.map(
      (call) => call[0].loteId as string
    );
    expect(lotes).toHaveLength(2);
    expect(lotes[0]).not.toBe(lotes[1]);
    expect(container.textContent).toContain(
      "1 correo aceptado por el proveedor"
    );
    expect(container.textContent).not.toContain(
      "no se pudo completar el procesamiento"
    );
  });

  it("un lote que no se pudo guardar no se reporta como fallo genérico", async () => {
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
      enviosReales: true,
      enviados: 0,
      omitidos: 0,
      errores: 0,
      procesados: 0,
      fueraAllowlist: 0,
      motivo: "lote_no_encontrado",
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
      (button) => button.textContent === "CONFIRMAR Y ENVIAR A 1 JUGADOR"
    );
    await act(async () => {
      enviar?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("No se creó un envío nuevo");
    expect(container.textContent).not.toContain(
      "no se pudo completar el procesamiento"
    );
  });

  it("tres envíos aceptados del mismo jugador se ven como tres operaciones", async () => {
    const historial = [1, 2, 3].map((n) => ({
      id: `log-${n}`,
      queue_id: `q-${n}`,
      liga_jugador_id: "jug-1",
      tipo: "bienvenida",
      estado: "enviado",
      attempts: 1,
      motivo: null,
      proveedor_estado: "aceptado",
      created_at: `2026-11-09T19:${10 + n}:00Z`,
    }));
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
      historial,
      cola: historial.map((item) => ({
        id: item.queue_id,
        liga_jugador_id: "jug-1",
        estado: "enviado",
        attempts: 1,
        motivo: null,
        lote_id: `lote-${item.queue_id}`,
      })),
      verificaciones: [],
    });
    await renderPanel();
    const tab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Historial"
    );
    await act(async () => {
      tab?.click();
    });
    const filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(3);
    expect(container.textContent).not.toContain("cola");
    expect(container.textContent).toContain("Exclusiones");
  });

  it("Actualizar vuelve a leer el historial y muestra el estado nuevo", async () => {
    const base = {
      disponible: true,
      escriturasActivas: true,
      verificacionDisponible: true,
      preferencias: [],
      config: {
        bienvenida_pausada: true,
        modo_prueba: true,
        modo_operacion: "manual",
      },
      cola: [],
      verificaciones: [],
    };
    mockCargar.mockResolvedValue({
      ...base,
      historial: [
        {
          id: "log-1",
          queue_id: "q-1",
          liga_jugador_id: "jug-1",
          tipo: "bienvenida",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          proveedor_estado: "aceptado",
          created_at: "2026-11-10T14:34:00Z",
        },
      ],
    });
    await renderPanel();
    const tab = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Historial"
    );
    await act(async () => {
      tab?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Aceptado");
    mockCargar.mockResolvedValue({
      ...base,
      historial: [
        {
          id: "log-1",
          queue_id: "q-1",
          liga_jugador_id: "jug-1",
          tipo: "bienvenida",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          proveedor_estado: "entregado",
          created_at: "2026-11-10T14:34:00Z",
        },
      ],
    });
    const actualizar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Actualizar"
    );
    await act(async () => {
      actualizar?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Entregado");
    expect(container.textContent).toContain("Actualizado");
    expect(mockCargar.mock.calls.length).toBeGreaterThan(1);
  });

  it("guarda el texto editado y lo vuelve a abrir en la misma plantilla", async () => {
    await renderPanel();
    await abrirRedactar();
    const asunto = container.querySelector("#asunto-correo") as HTMLInputElement;
    const cuerpo = container.querySelector("#cuerpo-correo") as HTMLTextAreaElement;
    const escribir = (elemento: HTMLInputElement | HTMLTextAreaElement, valor: string) => {
      const proto =
        elemento instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(elemento, valor);
      elemento.dispatchEvent(new Event("input", { bubbles: true }));
    };
    await act(async () => {
      escribir(asunto, "Aviso de la semana");
      escribir(cuerpo, "Hola {{nombre}},\n\nEste es mi texto.");
    });
    const guardar = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "GUARDAR PLANTILLA"
    );
    await act(async () => {
      guardar?.click();
    });
    expect(container.textContent).toContain("Plantilla guardada");
    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    await renderPanel();
    await abrirRedactar();
    const asuntoOtraVez = container.querySelector(
      "#asunto-correo"
    ) as HTMLInputElement;
    expect(asuntoOtraVez.value).toBe("Aviso de la semana");
  });

  it("Historial: muestra mes actual, resumen del período, agrupa por día (CDMX) y permite abrir/cerrar días y navegar meses/años", async () => {
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
          id: "log-dia-10",
          liga_jugador_id: "jug-1",
          tipo: "bienvenida",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          proveedor_estado: "aceptado",
          created_at: "2026-11-10T18:00:00.000Z", // Martes 10 nov CDMX
        },
        {
          id: "log-dia-08",
          liga_jugador_id: "jug-1",
          tipo: "jornada",
          jornada_numero: 2,
          estado: "error",
          attempts: 2,
          motivo: "error_proveedor",
          proveedor_estado: null,
          created_at: "2026-11-08T18:00:00.000Z", // Domingo 8 nov CDMX
        },
      ],
      cola: [
        {
          id: "cola-prog-10",
          liga_jugador_id: "jug-1",
          tipo: "recordatorio_jornada",
          origen: "automatico",
          jornada_numero: 2,
          estado: "pendiente",
          attempts: 0,
          motivo: null,
          programado_para: "2026-11-10T23:00:00.000Z", // Martes 10 nov CDMX
        },
      ],
      verificaciones: [],
    });

    await renderPanel();
    const tabHistorial = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Historial"
    );
    await act(async () => {
      tabHistorial?.click();
      await Promise.resolve();
    });

    // 1. Muestra el período actual y resumen superior
    const periodoLabel = container.querySelector(
      '[data-testid="historial-periodo-label"]'
    );
    expect(periodoLabel?.textContent).toBe("NOVIEMBRE 2026");

    const resumen = container.querySelector(
      '[data-testid="historial-resumen-periodo"]'
    );
    expect(resumen?.textContent).toContain("1ACEPTADOS");
    expect(resumen?.textContent).toContain("1PENDIENTES");
    expect(resumen?.textContent).toContain("1ERRORES");

    // 2. Día más reciente (10 de noviembre) expandido por defecto; día anterior (8 de noviembre) contraído
    const headersDias = Array.from(
      container.querySelectorAll(".liga-notificaciones__day-header")
    ) as HTMLButtonElement[];
    expect(headersDias).toHaveLength(2);
    expect(headersDias[0].textContent).toContain("MARTES 10 DE NOVIEMBRE");
    expect(headersDias[0].textContent).toContain("2 comunicaciones");
    expect(headersDias[0].getAttribute("aria-expanded")).toBe("true");
    expect(headersDias[1].textContent).toContain("DOMINGO 8 DE NOVIEMBRE");
    expect(headersDias[1].textContent).toContain("1 comunicación");
    expect(headersDias[1].getAttribute("aria-expanded")).toBe("false");

    // Solo se renderizan las 2 filas del día expandido (10 de noviembre)
    const filasIniciales = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filasIniciales).toHaveLength(2);

    // 3. Abrir manualmente el día 8 de noviembre y cerrar el 10 de noviembre
    await act(async () => {
      headersDias[1].click();
      headersDias[0].click();
    });
    expect(headersDias[0].getAttribute("aria-expanded")).toBe("false");
    expect(headersDias[1].getAttribute("aria-expanded")).toBe("true");
    const filasTrasToggle = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filasTrasToggle).toHaveLength(1);
    expect(filasTrasToggle[0].textContent).toContain("Jornada 2");

    // 4. Navegación de mes y cambio de año (Noviembre 2026 → Diciembre 2026 → Enero 2027)
    const btnSiguiente = container.querySelector(
      'button[aria-label="Mes siguiente"]'
    ) as HTMLButtonElement;
    await act(async () => {
      btnSiguiente.click();
    });
    expect(periodoLabel?.textContent).toBe("DICIEMBRE 2026");
    await act(async () => {
      btnSiguiente.click();
    });
    expect(periodoLabel?.textContent).toBe("ENERO 2027");
  });

  it("Historial: filtra por estado (ACEPTADOS, PENDIENTES, ERRORES, PRUEBAS) y busca por jugador, tipo y jornada", async () => {
    const ids = ["jug-1", "jug-2"];
    const nombres = ["Saúl Moreno de la Torre del Valle", "Axel A"];
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
          id: "log-aceptado",
          liga_jugador_id: "jug-1",
          tipo: "bienvenida",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          proveedor_estado: "aceptado",
          created_at: "2026-11-10T18:00:00.000Z",
        },
        {
          id: "log-error",
          liga_jugador_id: "jug-2",
          tipo: "resultados_jornada",
          jornada_numero: 3,
          estado: "error",
          attempts: 2,
          motivo: "error_proveedor",
          proveedor_estado: null,
          created_at: "2026-11-10T18:10:00.000Z",
        },
        {
          id: "log-prueba",
          liga_jugador_id: null,
          tipo: "prueba",
          estado: "enviado",
          attempts: 1,
          motivo: null,
          proveedor_estado: "aceptado",
          created_at: "2026-11-10T18:20:00.000Z",
        },
      ],
      cola: [
        {
          id: "cola-pend",
          liga_jugador_id: "jug-2",
          tipo: "recordatorio_jornada",
          origen: "automatico",
          jornada_numero: 2,
          estado: "pendiente",
          attempts: 0,
          motivo: null,
          programado_para: "2026-11-10T22:00:00.000Z",
        },
      ],
      verificaciones: [],
    });

    await act(async () => {
      root.render(
        <LigaNotificacionesPanel
          ligaId="liga-1"
          ligaNombre="Liga Nocturna"
          inscripciones={ids.map((id, idx) => ({
            id: `ins-${idx}`,
            liga_id: "liga-1",
            jugador_id: id,
            puntos: 0,
          }))}
          equipos={[]}
          pool={ids.map((id, idx) => ({
            ...pool[0],
            id,
            nombre: nombres[idx],
            email: `j${idx}@example.com`,
          }))}
          sustituciones={[]}
        />
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const tabHistorial = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Historial"
    );
    await act(async () => {
      tabHistorial?.click();
    });

    const clickChip = async (label: string) => {
      const chip = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === label
      );
      await act(async () => {
        chip?.click();
      });
    };

    await clickChip("ACEPTADOS");
    let filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain("Saúl Moreno");

    await clickChip("PENDIENTES");
    filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain("Axel A");
    expect(filas[0].textContent).toContain("Programado");

    await clickChip("ERRORES");
    filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain("Resultados de jornada");

    await clickChip("PRUEBAS");
    filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain("Prueba enviada");

    await clickChip("TODOS");
    const inputBusqueda = container.querySelector(
      'input[aria-label="BUSCAR JUGADOR O COMUNICACIÓN"]'
    ) as HTMLInputElement;
    const setValor = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;

    await act(async () => {
      setValor?.call(inputBusqueda, "Jornada 2");
      inputBusqueda.dispatchEvent(new Event("input", { bubbles: true }));
      inputBusqueda.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      );
    });
    filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].textContent).toContain("Jornada 2");
  });

  it("Historial: soporta 1,000 registros con paginación CARGAR MÁS de 20 en 20 y descarta respuestas obsoletas al cambiar filtros rápido", async () => {
    const logsMasivos = Array.from({ length: 1000 }, (_, i) => ({
      id: `log-1000-${String(i).padStart(4, "0")}`,
      liga_jugador_id: "jug-1",
      tipo: "bienvenida",
      estado: "enviado",
      attempts: 1,
      motivo: null,
      proveedor_estado: "aceptado",
      created_at: `2026-11-10T${String(10 + (i % 10)).padStart(2, "0")}:${String(
        i % 60
      ).padStart(2, "0")}:00.000Z`,
    }));

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
      historial: logsMasivos,
      cola: [],
      verificaciones: [],
    });

    await renderPanel();
    const tabHistorial = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Historial"
    );
    await act(async () => {
      tabHistorial?.click();
    });

    // Solo 20 filas en la primera página, pero el resumen muestra 1000 aceptados
    let filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(20);
    expect(
      container.querySelector('[data-testid="historial-resumen-periodo"]')
        ?.textContent
    ).toContain("1000ACEPTADOS");
    expect(container.textContent).toContain("Mostrando 20 de 1000 comunicaciones");

    const cargarMas = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "CARGAR MÁS"
    );
    expect(cargarMas).toBeTruthy();

    await act(async () => {
      cargarMas?.click();
    });
    filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(40);
    expect(container.textContent).toContain("Mostrando 40 de 1000 comunicaciones");

    // Simular respuesta lenta obsoleta de consultarHistorialPeriodoLiga tras cambio rápido de filtro
    let resolverObsoleta: ((val: unknown) => void) | null = null;
    mockConsultarPeriodo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolverObsoleta = resolve;
        })
    );

    const chipErrores = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "ERRORES"
    );
    const chipAceptados = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "ACEPTADOS"
    );
    await act(async () => {
      chipErrores?.click();
    });
    await act(async () => {
      chipAceptados?.click();
    });

    // Al resolver tarde la petición obsoleta de ERRORES, no debe sobrescribir ACEPTADOS
    await act(async () => {
      resolverObsoleta?.({
        ok: true,
        errorCarga: null,
        logs: [],
        cola: [],
        pagina: {
          registrosPagina: [],
          gruposDia: [],
          resumenPeriodo: { aceptados: 0, pendientes: 0, errores: 0, pruebas: 0 },
          totalPeriodo: 0,
          totalFiltrados: 0,
          hasMore: false,
          page: 0,
          pageSize: 20,
        },
      });
      await Promise.resolve();
    });

    filas = container.querySelectorAll(
      '[data-historial-seccion="comunicaciones"] .liga-notificaciones__history-row'
    );
    expect(filas).toHaveLength(20);
  });
});
