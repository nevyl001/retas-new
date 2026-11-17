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
});