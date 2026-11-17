import fs from "fs";
import path from "path";
import { PAGOS_DESCRIPTION, PAGOS_TITLE, buildPagosMeta, injectPagosDocument } from "./documentMeta";

describe("metadatos de la landing de pagos", () => {
  it("describe una sola página y no hereda el texto de AppRiviera", () => {
    const meta = buildPagosMeta();
    expect(meta.title).toBe(PAGOS_TITLE);
    expect(meta.description).toBe(PAGOS_DESCRIPTION);
    expect(meta.canonical).toBe("https://pagos.rivieraopen.com/");
    expect(meta.image).toBe("https://pagos.rivieraopen.com/pagos/og.png");
    expect(meta.notFound).toBe(false);
    expect(meta.description).not.toMatch(/evento/i);

    const html = injectPagosDocument(
      `<html><head><title>Riviera Open — Retas y torneos de pádel</title>
        <meta property="og:title" content="Riviera Open — Retas y torneos de pádel" />
        <meta property="og:description" content="Organiza. Juega. Compite." />
        <meta name="description" content="Organiza. Juega. Compite." />
        </head><body></body></html>`,
      meta
    );
    expect(html).toContain(`<title>${PAGOS_TITLE}</title>`);
    expect(html).not.toContain("Organiza. Juega. Compite.");
    expect(html).not.toContain("Retas y torneos de pádel");
    expect(html.match(/<title>/g)).toHaveLength(1);
  });
});

describe("middleware de pagos", () => {
  it("solo actúa en pagos.rivieraopen.com y usa una sola ficha", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../../middleware.ts"), "utf8");
    expect(source).toContain('const PAGOS_HOST = "pagos.rivieraopen.com"');
    expect(source).toContain("if (host !== PAGOS_HOST) return;");
    expect(source.indexOf("if (host !== PAGOS_HOST) return;")).toBeLessThan(source.indexOf("fetch("));
    expect(source).toContain("buildPagosMeta()");
    expect(source).not.toContain("getEventosOficiales");
  });
});
