import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthCallback, sanitizeInternalRedirect } from "./AuthCallback";
import { supabase } from "../../lib/supabaseClient";

jest.mock("../../lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

describe("sanitizeInternalRedirect — Prevención de Open Redirect", () => {
  it("acepta rutas internas relativas válidas", () => {
    expect(sanitizeInternalRedirect("/coaching/mi-espacio")).toBe(
      "/coaching/mi-espacio"
    );
    expect(sanitizeInternalRedirect("/coaching/club?id=123")).toBe(
      "/coaching/club?id=123"
    );
    expect(sanitizeInternalRedirect("/rewards")).toBe("/rewards");
    expect(sanitizeInternalRedirect("/liga/456#posiciones")).toBe(
      "/liga/456#posiciones"
    );
  });

  it("rechaza URLs absolutas con esquema HTTP o HTTPS", () => {
    expect(sanitizeInternalRedirect("https://evil.com")).toBe("/");
    expect(sanitizeInternalRedirect("http://evil.com/phishing")).toBe("/");
    expect(sanitizeInternalRedirect("https://appriviera.com.attacker.com")).toBe(
      "/"
    );
  });

  it("rechaza URLs protocol-relative ('//evil.com')", () => {
    expect(sanitizeInternalRedirect("//evil.com")).toBe("/");
    expect(sanitizeInternalRedirect("//evil.com/coaching")).toBe("/");
  });

  it("rechaza bypasses con barras invertidas ('/\\evil.com')", () => {
    expect(sanitizeInternalRedirect("/\\evil.com")).toBe("/");
    expect(sanitizeInternalRedirect("/\\evil.com/path")).toBe("/");
  });

  it("rechaza esquemas maliciosos como javascript: o data:", () => {
    // eslint-disable-next-line no-script-url
    expect(sanitizeInternalRedirect("javascript:alert(1)")).toBe("/");
    // eslint-disable-next-line no-script-url
    expect(sanitizeInternalRedirect("/javascript:alert(1)")).toBe("/");
    expect(sanitizeInternalRedirect("data:text/html,evil")).toBe("/");
  });

  it("retorna fallback cuando el input es vacío, null o inválido", () => {
    expect(sanitizeInternalRedirect("")).toBe("/");
    expect(sanitizeInternalRedirect("   ")).toBe("/");
    expect(sanitizeInternalRedirect(null)).toBe("/");
    expect(sanitizeInternalRedirect(undefined)).toBe("/");
    expect(sanitizeInternalRedirect("dashboard")).toBe("/");
  });

  it("respeta un fallback personalizado seguro", () => {
    expect(sanitizeInternalRedirect("https://evil.com", "/home")).toBe("/home");
    expect(sanitizeInternalRedirect(null, "/home")).toBe("/home");
  });
});

describe("AuthCallback Component", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    jest.clearAllMocks();
    delete (window as unknown as { location: unknown }).location;
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it("redirige al destino seguro ?next=/coaching/mi-espacio tras confirmar sesión", async () => {
    window.location = {
      ...originalLocation,
      search: "?next=/coaching/mi-espacio",
    } as Location;

    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "coach-uuid-123" } } },
      error: null,
    });

    const onSuccess = jest.fn();
    render(<AuthCallback onSuccess={onSuccess} />);

    expect(screen.getByText(/Confirmando tu cuenta/i)).toBeTruthy();

    await waitFor(
      () => {
        expect(onSuccess).toHaveBeenCalledWith("/coaching/mi-espacio");
      },
      { timeout: 3000 }
    );
  });

  it("neutraliza intento de Open Redirect y redirige a la raíz '/'", async () => {
    window.location = {
      ...originalLocation,
      search: "?next=https://attacker-phishing.com/steal-session",
    } as Location;

    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "coach-uuid-456" } } },
      error: null,
    });

    const onSuccess = jest.fn();
    render(<AuthCallback onSuccess={onSuccess} />);

    await waitFor(
      () => {
        expect(onSuccess).toHaveBeenCalledWith("/");
      },
      { timeout: 3000 }
    );
  });

  it("muestra mensaje de error si falla la confirmación de la sesión", async () => {
    window.location = {
      ...originalLocation,
      search: "",
    } as Location;

    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null },
      error: new Error("Token expired"),
    });

    const onSuccess = jest.fn();
    render(<AuthCallback onSuccess={onSuccess} />);

    await waitFor(() => {
      expect(screen.getByText(/Error de Confirmación/i)).toBeTruthy();
    });
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
