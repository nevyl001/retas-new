import fs from "fs";
import path from "path";
import {
  decidirReclamoEnvio,
  parseAllowlist,
  parseReplyTo,
  puedeDocumentarAutorizacionVerbal,
  simularLoteManual,
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
    const corte = worker.indexOf("allowlist.size === 0");
    const lote = worker.indexOf("lote_requerido");
    const cola = worker.indexOf('from("liga_notificaciones_queue")');
    const resend = worker.indexOf("await sendByResend");
    expect(auth).toBeGreaterThan(-1);
    expect(auth).toBeLessThan(flag);
    expect(flag).toBeLessThan(corte);
    expect(corte).toBeLessThan(lote);
    expect(lote).toBeLessThan(cola);
    expect(worker).toContain('.eq("lote_id", loteId)');
    expect(cola).toBeLessThan(resend);
    expect(worker).toContain("enviados: 0");
    expect(worker).toContain("fuera_allowlist");
    expect(worker).not.toContain("correo_verificacion_origen");
  });
});
