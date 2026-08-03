import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrandingDegradedBanner } from "./BrandingDegradedBanner";
import * as bootstrapModule from "./bootstrapAppBranding";

jest.mock("./bootstrapAppBranding", () => {
  const actual = jest.requireActual("./bootstrapAppBranding");
  return {
    __esModule: true,
    ...actual,
    retryBrandingBootstrap: jest.fn(),
  };
});

describe("BrandingDegradedBanner", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("no renderiza nada si el branding no está degradado", () => {
    jest.spyOn(bootstrapModule, "isBrandingBootstrapDegraded").mockReturnValue(false);
    render(<BrandingDegradedBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("muestra el banner con botón de reintento si el branding está degradado", () => {
    jest.spyOn(bootstrapModule, "isBrandingBootstrapDegraded").mockReturnValue(true);
    render(<BrandingDegradedBanner />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reintentar/i })
    ).toBeInTheDocument();
  });

  it("al reintentar exitosamente, oculta el banner", async () => {
    jest.spyOn(bootstrapModule, "isBrandingBootstrapDegraded").mockReturnValue(true);
    (bootstrapModule.retryBrandingBootstrap as jest.Mock).mockResolvedValue(true);

    render(<BrandingDegradedBanner />);
    const retryBtn = screen.getByRole("button", { name: /reintentar/i });

    fireEvent.click(retryBtn);

    await waitFor(() =>
      expect(bootstrapModule.retryBrandingBootstrap).toHaveBeenCalledTimes(1)
    );
  });

  it("se puede cerrar manualmente sin reintentar", () => {
    jest.spyOn(bootstrapModule, "isBrandingBootstrapDegraded").mockReturnValue(true);
    render(<BrandingDegradedBanner />);

    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
