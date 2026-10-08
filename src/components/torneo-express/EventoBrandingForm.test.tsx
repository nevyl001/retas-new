import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { EventoBrandingForm, type EventoBrandingFormProps } from "./EventoBrandingForm";

function setup(overrides: Partial<EventoBrandingFormProps> = {}) {
  const props: EventoBrandingFormProps = {
    logoSource: "flyer",
    onLogoSourceChange: jest.fn(),
    flyerUrl: "https://cdn.example.com/flyer.png",
    onFlyerUrlChange: jest.fn(),
    fileInputRef: React.createRef<HTMLInputElement>(),
    uploading: false,
    uploadDisabled: false,
    onFileSelected: jest.fn(),
    dirty: false,
    saving: false,
    onSave: jest.fn(),
    ...overrides,
  };
  const view = render(<EventoBrandingForm {...props} />);
  return { props, view };
}

describe("EventoBrandingForm", () => {
  it("con flyer muestra la vista previa completa y las herramientas de subida", () => {
    setup();
    const img = screen.getByRole("img", { name: "Vista previa del flyer" });
    expect(img).toHaveAttribute("src", "https://cdn.example.com/flyer.png");
    expect(screen.getByRole("button", { name: "Subir flyer" })).toBeEnabled();
    expect(screen.getByPlaceholderText("https://…")).toHaveValue(
      "https://cdn.example.com/flyer.png"
    );
  });

  it("cambiar el origen avisa con el valor correcto", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("radio", { name: "Logo del club (upgrade / Riviera)" }));
    expect(props.onLogoSourceChange).toHaveBeenCalledWith("club");
  });

  it("con el logo del club no hay herramientas de flyer y la vista previa lo indica", () => {
    setup({ logoSource: "club" });
    expect(screen.queryByRole("button", { name: "Subir flyer" })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("https://…")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Vista previa del flyer" })).not.toBeInTheDocument();
    expect(screen.getByText("Se usa el logo del club")).toBeInTheDocument();
  });

  it("flyer sin URL: estado vacío en la vista previa", () => {
    setup({ flyerUrl: "   " });
    expect(screen.queryByRole("img", { name: "Vista previa del flyer" })).not.toBeInTheDocument();
    expect(screen.getByText("Sin flyer todavía")).toBeInTheDocument();
  });

  it("si la imagen no carga, muestra un estado de error en lugar de una imagen rota", () => {
    setup();
    fireEvent.error(screen.getByRole("img", { name: "Vista previa del flyer" }));
    expect(screen.queryByRole("img", { name: "Vista previa del flyer" })).not.toBeInTheDocument();
    expect(screen.getByText("No se pudo cargar la imagen")).toBeInTheDocument();
  });

  it("escribir en la URL y elegir archivo avisan al contenedor", () => {
    const { props, view } = setup();
    fireEvent.change(screen.getByPlaceholderText("https://…"), {
      target: { value: "https://otra.example.com/f.webp" },
    });
    expect(props.onFlyerUrlChange).toHaveBeenCalledWith("https://otra.example.com/f.webp");

    const file = new File(["x"], "f.png", { type: "image/png" });
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onFileSelected).toHaveBeenCalledWith(file);
  });

  it("Subir flyer queda deshabilitado sin usuario o mientras sube", () => {
    const { view } = setup({ uploadDisabled: true });
    expect(screen.getByRole("button", { name: "Subir flyer" })).toBeDisabled();
    view.unmount();
    setup({ uploading: true });
    expect(screen.getByRole("button", { name: /Subiendo/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardar branding" })).toBeDisabled();
  });

  it("informa de cambios sin guardar y guarda con el botón", () => {
    const { props, view } = setup({ dirty: true });
    expect(screen.getByRole("status")).toHaveTextContent("Tienes cambios sin guardar");
    fireEvent.click(screen.getByRole("button", { name: "Guardar branding" }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    view.unmount();
    setup({ saving: true });
    expect(screen.getByRole("button", { name: /Guardando/ })).toBeDisabled();
  });
});
