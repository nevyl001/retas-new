import {
  decidirReclamoEnvio,
  parseAllowlist,
  parseReplyTo,
  puedeDocumentarAutorizacionVerbal,
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
