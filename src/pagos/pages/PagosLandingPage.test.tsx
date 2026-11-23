import fs from "fs";
import path from "path";
import React from "react";
import { render, screen } from "@testing-library/react";
import { PagosLandingPage } from "./PagosLandingPage";

describe("landing universal de pagos", () => {
  it("explica monto y concepto y abre solo el enlace oficial", () => {
    render(<PagosLandingPage />);
    expect(screen.getByRole("heading", { name: "TU SIGUIENTE PARTIDO COMIENZA AQUÍ." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "REALIZA TU PAGO." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "MONTO" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "CONCEPTO DE PAGO" })).toBeTruthy();
    expect(screen.getByText(/cantidad exacta que te indicó el organizador/i)).toBeTruthy();
    expect(screen.getByText("Reta varonil — Sábado 21 de noviembre.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();

    const pay = screen.getByRole("link", { name: /pagar ahora/i });
    expect(pay.getAttribute("href")).toBe("https://linkdenegocio.mx/@rivieraopen");
    expect(pay.getAttribute("target")).toBe("_blank");
    expect(pay.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/no solicita ni almacena los datos de tu tarjeta/i)).toBeTruthy();
    expect(screen.getByText("Serás redirigido a Clip para completar tu pago de forma segura.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Pago directo y seguro" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Proceso claro" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Acceso inmediato" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "SIGUE JUGANDO. SIGUE SUMANDO." })).toBeTruthy();
    expect(
      screen.getByText("Cada partido es una nueva oportunidad para competir, mejorar y escribir tu historia.")
    ).toBeTruthy();
    expect(screen.getByText("RIVIERA OPEN — CADA PARTIDO CUENTA.")).toBeTruthy();
  });

  it("utiliza exclusivamente la paleta monocromática oficial de Riviera Open sin tonos gris azulados", () => {
    const css = fs.readFileSync(path.join(__dirname, "../pagos.css"), "utf8");

    // Tokens monocromáticos oficiales presentes
    expect(css).toContain("--pagos-bg-primary: #000000;");
    expect(css).toContain("--pagos-bg-secondary: #0a0a0a;");
    expect(css).toContain("--pagos-bg-elevated: #111111;");
    expect(css).toContain("--pagos-text-primary: #ffffff;");
    expect(css).toContain("--pagos-text-secondary: #a3a3a3;");
    expect(css).toContain("--pagos-text-muted: #737373;");
    expect(css).toContain("--pagos-border: #262626;");

    // Sin tonos gris azulados antiguos
    expect(css).not.toMatch(/#0d0f12/i);
    expect(css).not.toMatch(/#171a20/i);
    expect(css).not.toMatch(/#232833/i);
    expect(css).not.toMatch(/#2a2f38/i);
    expect(css).not.toMatch(/#8d939e/i);
    expect(css).not.toMatch(/#e5e7eb/i);
    expect(css).not.toMatch(/13,\s*15,\s*18/);
    expect(css).not.toMatch(/42,\s*47,\s*56/);
  });
});