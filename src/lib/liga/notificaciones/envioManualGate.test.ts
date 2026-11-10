import fs from "fs";
import path from "path";
import {
  claveIdempotenciaManual,
  decidirEncoladoManual,
  decidirReclamoEnvio,
  parseAllowlist,
  parseReplyTo,
  puedeDocumentarAutorizacionVerbal,
  simularLoteManual,
  type FilaEncolada,
  type FilaSimulada,
} from "./envioManualGate";
import { renderComunicacionEmail } from "./comunicacionTemplates";

const base = {
  email: "jugador@example.com",
  adminHabilitado: true,
  consentimientoEstado: "autorizado",
  consentimientoOrigen: "manifestacion_presencial",
  consentimientoRegistradoAt: "2026-11-09T12:00:00.000Z",
};

describe("envio manual simulado", () => {
  it("no reclama si el correo no está en la allowlist", () => {
    const decision = decidirReclamoEnvio({
      ...base,
      allowlist: parseAllowlist("otro@example.com"),
    });
    expect(decision).toEqual({ reclamar: false, motivo: "fuera_de_allowlist" });
  });

  it("reclama solo con allowlist, interruptor y autorización documentada", () => {
    const decision = decidirReclamoEnvio({
      ...base,
      allowlist: parseAllowlist("Jugador@Example.com"),
    });
    expect(decision.reclamar).toBe(true);
  });

  it("allowlist vacía no autoriza a nadie", () => {
    expect(
      decidirReclamoEnvio({ ...base, allowlist: parseAllowlist("") }).reclamar
    ).toBe(false);
  });

  it("sin reply-to no invita a responder", () => {
    expect(parseReplyTo("")).toBeNull();
    expect(parseReplyTo("noreply@appriviera.rivieraopen.com")).toBe(
      "noreply@appriviera.rivieraopen.com"
    );
    const view = renderComunicacionEmail({
      clubNombre: "Club Norte",
      ligaNombre: "Liga Norte",
      jugadorNombre: "Ana",
      asunto: "Aviso",
      cuerpo: "Hola <script>",
      vistaPrevia: false,
    });
    expect(view.html).toContain("Club Norte");
    expect(view.html).not.toContain("<script>");
    expect(view.html).not.toMatch(/responde a este correo/i);
    expect(view.html).toMatch(/no recibe respuestas/i);
  });

  it("no sobrescribe revocaciones ni autorizaciones ya guardadas", () => {
    expect(puedeDocumentarAutorizacionVerbal("revocado")).toBe(false);
    expect(puedeDocumentarAutorizacionVerbal("autorizado")).toBe(false);
    expect(puedeDocumentarAutorizacionVerbal(null)).toBe(true);
  });
});

const filaLista: FilaSimulada = {
  id: "fila-1",
  email: "jugador@example.com",
  adminHabilitado: true,
  consentimientoEstado: "autorizado",
  consentimientoOrigen: "manifestacion_presencial",
  consentimientoRegistradoAt: "2026-11-09T12:00:00.000Z",
};

describe("allowlist fail-closed", () => {
  it.each([undefined, null, "", "   ", "\n\t"])(
    "lista inactiva (%j) no escribe ni llama a Resend",
    (raw) => {
      const resultado = simularLoteManual({
        enviosReales: "true",
        allowlistRaw: raw,
        filas: [filaLista],
      });
      expect(resultado).toMatchObject({
        procesados: 0,
        enviados: 0,
        escrituras: 0,
        llamadasResend: 0,
        fuera_allowlist: 0,
      });
    }
  );

  it("un flag distinto de true tampoco procesa", () => {
    const resultado = simularLoteManual({
      enviosReales: "false",
      allowlistRaw: "jugador@example.com",
      filas: [filaLista],
    });
    expect(resultado.procesados).toBe(0);
    expect(resultado.enviados).toBe(0);
    expect(resultado.llamadasResend).toBe(0);
    expect(resultado.escrituras).toBe(0);
  });

  it("acepta mayúsculas y coincidencia exacta", () => {
    const resultado = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "  Jugador@Example.com  ",
      filas: [filaLista],
    });
    expect(resultado.reclamadas).toEqual(["fila-1"]);
    expect(resultado.enviados).toBe(1);
    expect(resultado.llamadasResend).toBe(1);
    expect(resultado.fuera_allowlist).toBe(0);
  });

  it("A. de tres destinatarios solo reclama el incluido en la allowlist", () => {
    const resultado = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "edgardo@example.com",
      loteId: "lote-prueba",
      filas: [
        { ...filaLista, id: "zaid", email: "zaid@example.com", loteId: "lote-prueba" },
        {
          ...filaLista,
          id: "edgardo",
          email: "edgardo@example.com",
          loteId: "lote-prueba",
        },
        {
          ...filaLista,
          id: "eduardo",
          email: "eduardo@example.com",
          loteId: "lote-prueba",
        },
      ],
    });
    expect(resultado.reclamadas).toEqual(["edgardo"]);
    expect(resultado.llamadasResend).toBe(1);
    expect(resultado.excluidasSinEscritura.sort()).toEqual(["eduardo", "zaid"]);
    expect(resultado.fuera_allowlist).toBe(2);
    expect(resultado.escrituras).toBe(1);
  });

  it("deja fuera de la lista sin escritura ni Resend", () => {
    const resultado = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "otro@example.com",
      filas: [filaLista],
    });
    expect(resultado.fuera_allowlist).toBe(1);
    expect(resultado.excluidasSinEscritura).toEqual(["fila-1"]);
    expect(resultado.escrituras).toBe(0);
    expect(resultado.llamadasResend).toBe(0);
    expect(resultado.enviados).toBe(0);
  });

  it("la fecha de alta no autoriza ni sustituye el interruptor", () => {
    const conRegistro = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "jugador@example.com",
      filas: [
        {
          ...filaLista,
          consentimientoEstado: "sin_autorizacion",
          consentimientoOrigen: null,
          consentimientoRegistradoAt: null,
          registroAutorizadoAt: "2024-03-01T00:00:00.000Z",
        },
      ],
    });
    expect(conRegistro.reclamadas).toEqual([]);
    const apagado = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "jugador@example.com",
      filas: [
        {
          ...filaLista,
          adminHabilitado: false,
          registroAutorizadoAt: "2024-03-01T00:00:00.000Z",
        },
      ],
    });
    expect(apagado.reclamadas).toEqual([]);
  });

  it("la allowlist no sustituye consentimiento ni el interruptor", () => {
    const resultado = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "jugador@example.com",
      filas: [{ ...filaLista, adminHabilitado: false }],
    });
    expect(resultado.reclamadas).toEqual([]);
    expect(resultado.llamadasResend).toBe(0);
    expect(resultado.escrituras).toBe(1);
  });

  it("sin lote no procesa y un lote ajeno no se toca", () => {
    const sinLote = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "jugador@example.com",
      loteId: null,
      filas: [filaLista],
    });
    expect(sinLote).toMatchObject({
      procesados: 0,
      enviados: 0,
      escrituras: 0,
      llamadasResend: 0,
    });
    const soloPropio = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "jugador@example.com",
      loteId: "lote-propio",
      filas: [
        { ...filaLista, loteId: "lote-propio" },
        { ...filaLista, id: "ajena", loteId: "lote-ajeno" },
      ],
    });
    expect(soloPropio.reclamadas).toEqual(["fila-1"]);
    expect(soloPropio.procesados).toBe(1);
  });

  it("el worker autentica antes del flag y corta la allowlist vacía antes de la cola", () => {
    const worker = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/functions/procesar-liga-notificaciones/index.ts"
      ),
      "utf8"
    );
    const auth = worker.indexOf("LIGA_NOTIFICACIONES_WEBHOOK_SECRET");
    const flag = worker.indexOf('LIGA_NOTIFICACIONES_ENVIOS_REALES") === "true"');
    const modo = worker.indexOf('LIGA_NOTIFICACIONES_MODO") === "operativo"');
    const corte = worker.indexOf("allowlist.size === 0");
    const lote = worker.indexOf("lote_requerido");
    const cola = worker.indexOf('from("liga_notificaciones_queue")');
    const resend = worker.indexOf("await sendByResend");
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(flag);
    expect(flag).toBeLessThan(corte);
    expect(modo).toBeGreaterThan(flag);
    expect(modo).toBeLessThan(corte);
    expect(corte).toBeLessThan(lote);
    expect(lote).toBeLessThan(cola);
    expect(worker).toContain('.eq("lote_id", loteId)');
    expect(cola).toBeLessThan(resend);
    expect(worker).toContain("enviados: 0");
    expect(worker).toContain("fuera_allowlist");
    expect(worker).toContain('programadas: body?.programadas === true');
    expect(worker).toContain('.eq("estado", "pendiente")');
    expect(worker).toContain('.eq("origen", "automatico")');
    expect(worker).toContain('.lte("programado_para"');
    expect(worker).toContain("recordatorioTieneHorarioOficial");
    expect(worker).toContain("jornada_sin_horario");
    expect(worker).toContain(".eq(\"estado\", \"pendiente\")");
    expect(worker).not.toContain("correo_verificacion_origen");
  });

  it("la función de lote corta al worker si no responde y no llama con envíos apagados", () => {
    const fuente = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/functions/procesar-lote-liga-notificaciones/index.ts"
      ),
      "utf8"
    );
    const apagado = fuente.indexOf('return apagado(req, "envios_apagados")');
    const worker = fuente.indexOf("procesar-liga-notificaciones");
    expect(apagado).toBeGreaterThan(-1);
    expect(apagado).toBeLessThan(worker);
    expect(fuente.indexOf('return apagado(req, "modo_prueba")')).toBeGreaterThan(apagado);
    expect(fuente.indexOf('return apagado(req, "modo_prueba")')).toBeLessThan(worker);
    expect(fuente).toContain('LIGA_NOTIFICACIONES_MODO") === "operativo"');
    expect(fuente).toContain("AbortSignal.timeout(55000)");
    expect(fuente).toContain('.eq("estado", "pendiente")');
    expect(fuente).not.toContain('.eq("estado", "enviado")');
    expect(fuente).toContain("x-liga-notificaciones-secret");
    expect(fuente).toContain("fuera_allowlist");
  });
});

function elegible(id: string, email: string): FilaSimulada {
  return {
    id,
    loteId: "lote-confirmado",
    email,
    adminHabilitado: true,
    consentimientoEstado: "autorizado",
    consentimientoOrigen: "manifestacion_presencial",
    consentimientoRegistradoAt: "2026-11-09T12:00:00.000Z",
    estado: "pendiente",
    attempts: 0,
  };
}

describe("modo operativo manual simulado", () => {
  const operativo = {
    enviosReales: "true" as const,
    allowlistRaw: "",
    modo: "operativo",
    loteId: "lote-confirmado",
  };

  it("1. un destinatario elegible se entrega sin allowlist", () => {
    const resultado = simularLoteManual({
      ...operativo,
      filas: [elegible("uno", "uno@example.com")],
    });
    expect(resultado.reclamadas).toEqual(["uno"]);
    expect(resultado.llamadasResend).toBe(1);
  });

  it("2 y 3. tres y doce destinatarios elegibles se procesan todos", () => {
    const tres = Array.from({ length: 3 }, (_, i) =>
      elegible(`j${i}`, `j${i}@example.com`)
    );
    const doce = Array.from({ length: 12 }, (_, i) =>
      elegible(`d${i}`, `d${i}@example.com`)
    );
    expect(
      simularLoteManual({ ...operativo, filas: tres }).reclamadas
    ).toHaveLength(3);
    expect(
      simularLoteManual({ ...operativo, filas: doce }).reclamadas
    ).toHaveLength(12);
  });

  it("4, 5 y 6. revocado, desactivado y correo ambiguo no se reclaman", () => {
    const resultado = simularLoteManual({
      ...operativo,
      filas: [
        elegible("ok", "ok@example.com"),
        { ...elegible("revocado", "revocado@example.com"), consentimientoEstado: "revocado" },
        { ...elegible("apagado", "apagado@example.com"), adminHabilitado: false },
        { ...elegible("ambiguo", "no-es-correo"), email: null },
      ],
    });
    expect(resultado.reclamadas).toEqual(["ok"]);
    expect(resultado.llamadasResend).toBe(1);
    expect(resultado.escrituras).toBe(4);
  });

  it("7. un fallo parcial de Resend no detiene al resto", () => {
    const resultado = simularLoteManual({
      ...operativo,
      fallos: ["j1"],
      filas: [
        elegible("j0", "j0@example.com"),
        elegible("j1", "j1@example.com"),
        elegible("j2", "j2@example.com"),
      ],
    });
    expect(resultado.reclamadas).toEqual(["j0", "j2"]);
    expect(resultado.llamadasResend).toBe(3);
    expect(resultado.enviados).toBe(2);
  });

  it("8. el reintento sigue disponible antes del tercer intento", () => {
    const fresco = simularLoteManual({
      ...operativo,
      filas: [{ ...elegible("reintento", "reintento@example.com"), attempts: 2 }],
    });
    const agotado = simularLoteManual({
      ...operativo,
      filas: [{ ...elegible("reintento", "reintento@example.com"), attempts: 3 }],
    });
    expect(fresco.reclamadas).toEqual(["reintento"]);
    expect(agotado.reclamadas).toEqual([]);
    expect(agotado.llamadasResend).toBe(0);
  });

  it("9 y 14. un segundo pase no reprocesa un mensaje ya enviado", () => {
    const primero = simularLoteManual({
      ...operativo,
      filas: [elegible("uno", "uno@example.com")],
    });
    const segundo = simularLoteManual({
      ...operativo,
      filas: [{ ...elegible("uno", "uno@example.com"), estado: "enviado" }],
    });
    expect(primero.enviados).toBe(1);
    expect(segundo).toMatchObject({
      enviados: 0,
      llamadasResend: 0,
      escrituras: 0,
    });
  });

  it("10. con envíos apagados no hay lecturas ni Resend", () => {
    const resultado = simularLoteManual({
      ...operativo,
      enviosReales: "false",
      filas: [elegible("uno", "uno@example.com")],
    });
    expect(resultado).toMatchObject({
      procesados: 0,
      enviados: 0,
      llamadasResend: 0,
      escrituras: 0,
    });
  });

  it("11. el modo prueba sigue exigiendo allowlist", () => {
    const vacia = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "",
      modo: "prueba",
      loteId: "lote-confirmado",
      filas: [elegible("uno", "uno@example.com")],
    });
    const una = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "uno@example.com",
      modo: "",
      loteId: "lote-confirmado",
      filas: [
        elegible("uno", "uno@example.com"),
        elegible("dos", "dos@example.com"),
      ],
    });
    expect(vacia.procesados).toBe(0);
    expect(una.reclamadas).toEqual(["uno"]);
    expect(una.fuera_allowlist).toBe(1);
  });

  it("12. operativo no se activa porque la allowlist esté vacía", () => {
    const sinModo = simularLoteManual({
      enviosReales: "true",
      allowlistRaw: "",
      loteId: "lote-confirmado",
      filas: [elegible("uno", "uno@example.com")],
    });
    const activo = simularLoteManual({
      ...operativo,
      filas: [
        elegible("uno", "uno@example.com"),
        elegible("dos", "dos@example.com"),
      ],
    });
    expect(sinModo.procesados).toBe(0);
    expect(activo.reclamadas).toEqual(["uno", "dos"]);
  });

  it("13. la cola histórica de otro lote y un enviado no entran en la confirmación", () => {
    const resultado = simularLoteManual({
      ...operativo,
      filas: [
        elegible("nuevo", "nuevo@example.com"),
        { ...elegible("historico", "historico@example.com"), loteId: "lote-viejo" },
        { ...elegible("entregado", "entregado@example.com"), estado: "enviado" },
      ],
    });
    expect(resultado.reclamadas).toEqual(["nuevo"]);
    expect(resultado.procesados).toBe(2);
  });
});

describe("reenvío manual intencional", () => {
  const base = {
    tipo: "bienvenida",
    ligaId: "liga-1",
    jugadorId: "edgardo",
    permiteOtroEnviado: true,
  };

  function confirmar(filas: FilaEncolada[], loteId: string, permite = true) {
    return decidirEncoladoManual({
      ...base,
      filas,
      loteId,
      permiteOtroEnviado: permite,
    });
  }

  it("tres confirmaciones iguales crean tres lotes y tres claves", () => {
    let filas: FilaEncolada[] = [];
    const lotes = ["lote-1", "lote-2", "lote-3"];
    for (const loteId of lotes) {
      const paso = confirmar(filas, loteId);
      expect(paso.motivo).toBe("encolado");
      filas = paso.filas.map((fila) =>
        fila.loteId === loteId ? { ...fila, estado: "enviado" } : fila
      );
    }
    expect(filas.map((fila) => fila.loteId)).toEqual(lotes);
    expect(new Set(filas.map((fila) => fila.clave)).size).toBe(3);
  });

  it("el doble clic de la misma confirmación no crea otra fila", () => {
    const primero = confirmar([], "lote-1");
    const segundo = confirmar(
      primero.filas,
      "lote-1"
    );
    expect(segundo.motivo).toBe("ya_encolado");
    expect(segundo.filas).toHaveLength(1);
    expect(claveIdempotenciaManual({ ...base, loteId: "lote-1" })).toBe(
      claveIdempotenciaManual({ ...base, loteId: "lote-1" })
    );
  });

  it("un aceptado de la misma operación no se reintenta y uno nuevo sí", () => {
    const primero = confirmar([], "lote-1");
    const aceptado = primero.filas.map((fila) => ({
      ...fila,
      estado: "enviado" as const,
    }));
    expect(confirmar(aceptado, "lote-1").motivo).toBe("ya_enviado");
    expect(confirmar(aceptado, "lote-2").motivo).toBe("encolado");
    expect(confirmar(aceptado, "lote-2", false).motivo).toBe(
      "bloqueado_por_enviado"
    );
  });

  it("un fallo parcial no vuelve a encolar al que ya fue aceptado", () => {
    const filas: FilaEncolada[] = [
      {
        clave: claveIdempotenciaManual({ ...base, loteId: "lote-1" }),
        loteId: "lote-1",
        jugadorId: "edgardo",
        estado: "enviado",
      },
    ];
    const otro = decidirEncoladoManual({
      ...base,
      jugadorId: "zaid",
      filas,
      loteId: "lote-1",
    });
    expect(otro.motivo).toBe("encolado");
    expect(otro.filas.filter((fila) => fila.jugadorId === "edgardo")).toHaveLength(1);
  });

  it("la migración deja libres las bienvenidas enviadas y conserva el envío en curso", () => {
    const sql = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/0110_liga_bienvenida_reenvio_manual.sql"
      ),
      "utf8"
    );
    const indice = sql.slice(sql.indexOf("CREATE UNIQUE INDEX"));
    expect(indice).toContain("estado IN ('pendiente', 'procesando')");
    expect(indice).not.toContain("'enviado'");
    expect(sql).toContain("DROP INDEX IF EXISTS public.liga_notificaciones_queue_una_bienvenida");
  });
});
