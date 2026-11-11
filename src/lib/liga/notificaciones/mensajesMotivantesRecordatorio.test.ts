import fs from "fs";
import path from "path";
import {
  MENSAJES_MOTIVANTES_RECORDATORIO,
  asegurarCuerpoRecordatorioMotivante,
  cuerpoRecordatorioSinFechaDuplicada,
  hashEstableMensaje,
  seleccionarMensajeMotivanteRecordatorio,
} from "./mensajesMotivantesRecordatorio";
import { cuerpoRecordatorioOficial } from "./datosOficialesJornada";
import { renderCorreoComunicacion } from "./correoCompartido";
import { resolveLigaMailBranding } from "./ligaMailBranding";

const branding = resolveLigaMailBranding({ clubNombre: "Hack Pádel" });

describe("mensajes motivantes de recordatorio", () => {
  it("tiene al menos 30 mensajes de longitud razonable", () => {
    expect(MENSAJES_MOTIVANTES_RECORDATORIO.length).toBeGreaterThanOrEqual(30);
    for (const mensaje of MENSAJES_MOTIVANTES_RECORDATORIO) {
      const palabras = mensaje.trim().split(/\s+/).length;
      expect(palabras).toBeGreaterThanOrEqual(20);
      expect(palabras).toBeLessThanOrEqual(35);
      expect(mensaje).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
      expect(mensaje).not.toMatch(/\d{1,2}:\d{2}/);
    }
    const sql = fs.readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/0123_liga_recordatorio_mensaje_motivante.sql"
      ),
      "utf8"
    );
    for (const mensaje of MENSAJES_MOTIVANTES_RECORDATORIO) {
      expect(sql).toContain(mensaje.replace(/'/g, "''"));
    }
  });

  it("es determinista y evita repetición consecutiva entre jornadas", () => {
    const base = {
      jugadorId: "jugador-zaid",
      ligaId: "liga-5ta-advance",
      jornadaId: "jornada-uuid-1",
    };
    const a = seleccionarMensajeMotivanteRecordatorio({ ...base, jornadaNumero: 2 });
    const b = seleccionarMensajeMotivanteRecordatorio({ ...base, jornadaNumero: 2 });
    expect(a).toBe(b);
    const c = seleccionarMensajeMotivanteRecordatorio({ ...base, jornadaNumero: 3 });
    expect(c).not.toBe(a);
    expect(hashEstableMensaje("abc")).toBe(hashEstableMensaje("abc"));
  });

  it("el cuerpo oficial no repite fecha/horario fuera de la tarjeta", () => {
    const pieza = cuerpoRecordatorioOficial({
      ligaId: "liga-1",
      ligaNombre: "Liga 5ta Advance",
      numero: 2,
      fechaIso: "2026-11-11",
      horaInicio: "21:00",
      jugadorId: "jugador-zaid",
      jornadaId: "jor-2",
    });
    expect(pieza).not.toBeNull();
    expect(pieza!.cuerpo).not.toMatch(/La Jornada 2 de .+ es el /);
    expect(pieza!.cuerpo).toContain("Fecha: 11/11/2026");
    expect(pieza!.cuerpo).toContain("Horario: 21:00 hrs");
    expect(pieza!.cuerpo).toContain("Sede: {{club}}");
    expect(MENSAJES_MOTIVANTES_RECORDATORIO.some((m) => pieza!.cuerpo.includes(m))).toBe(
      true
    );
  });

  it("preview y render real comparten el mismo mensaje", () => {
    const pieza = cuerpoRecordatorioOficial({
      ligaId: "liga-1",
      ligaNombre: "Liga 5ta Advance",
      numero: 2,
      fechaIso: "2026-11-11",
      horaInicio: "21:00",
      jugadorId: "jugador-zaid",
      jornadaId: "jor-2",
    })!;
    const seed = {
      jugadorId: "jugador-zaid",
      ligaId: "liga-1",
      jornadaId: "jor-2",
      jornadaNumero: 2,
    };
    const buildMail = (vistaPrevia: boolean) =>
      renderCorreoComunicacion({
        clubNombre: "Hack Pádel",
        ligaNombre: "Liga 5ta Advance",
        asunto: pieza.asunto,
        cuerpo: pieza.cuerpo.replace(/\{\{\s*nombre\s*\}\}/gi, "Zaid"),
        branding,
        tipo: "recordatorio_jornada",
        vistaPrevia,
        ligaUrl: "https://appriviera.rivieraopen.com/public/liga/liga-1",
        jornadaUrl: "https://appriviera.rivieraopen.com/public/liga/liga-1/jornada/2",
        ...seed,
      });
    const htmlPreview = buildMail(true).html;
    const htmlReal = buildMail(false).html;
    const stripBanner = (html: string) =>
      html.replace(
        /<tr><td style="background-color:#111827[\s\S]*?VISTA PREVIA[\s\S]*?<\/td><\/tr>/i,
        ""
      );
    expect(stripBanner(htmlPreview)).toBe(stripBanner(htmlReal));
    expect(htmlPreview.split("11/11/2026").length - 1).toBe(1);
    expect(htmlPreview.split("21:00 hrs").length - 1).toBe(1);
    expect(htmlPreview).toContain("Hola Zaid,");
    expect(htmlPreview).not.toMatch(/La Jornada 2 de .+ es el /);
    expect(htmlPreview).toContain("max-width:640px");
    expect(buildMail(false).html).toBe(htmlReal);
  });

  it("limpia cuerpos legacy con párrafo duplicado y conserva el mensaje", () => {
    const legado = [
      "Hola Zaid,",
      "",
      "La Jornada 2 de Liga 5ta Advance es el 11/11/2026 a las 21:00 hrs.",
      "",
      "Fecha: 11/11/2026",
      "Horario: 21:00 hrs",
      "Sede: Hack Pádel",
    ].join("\n");
    expect(cuerpoRecordatorioSinFechaDuplicada(legado)).not.toMatch(/La Jornada 2/);
    const normalizado = asegurarCuerpoRecordatorioMotivante(legado, {
      jugadorId: "jugador-zaid",
      ligaId: "liga-1",
      jornadaNumero: 2,
      jornadaId: "jor-2",
    });
    expect(normalizado).not.toMatch(/La Jornada 2/);
    expect(MENSAJES_MOTIVANTES_RECORDATORIO.some((m) => normalizado.includes(m))).toBe(
      true
    );
  });
});
