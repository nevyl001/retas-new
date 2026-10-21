/**
 * @jest-environment jsdom
 */
/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudentAccessPage } from "./StudentAccessPage";
import * as coachingApi from "../../lib/coaching/coachingApi";
import { supabase } from "../../lib/supabaseClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../lib/appRouting", () => ({
  navigateAppTo: jest.fn(),
  normalizeAppPathname: (p: string) => p,
}));

jest.mock("./coachingNav", () => ({
  navigateStudentCoaching: jest.fn(),
  navigateCoaching: jest.fn(),
  navigateStudentAccess: jest.fn(),
}));

describe("StudentAccessPage Component Tests", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    jest.clearAllMocks();

    // Default Supabase mock session
    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          user: {
            id: "student-user-uuid",
            email: "student@test.com",
            email_confirmed_at: "2026-10-21T00:00:00Z",
          },
        } as any,
      },
      error: null,
    });

    jest.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
      data: {
        subscription: {
          unsubscribe: jest.fn(),
        },
      },
    } as any);

    jest.spyOn(supabase.auth, "updateUser").mockResolvedValue({
      data: { user: {} as any },
      error: null,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    // Limpiar window.location.search
    window.history.replaceState({}, "", "/coaching/acceso-alumno");
  });

  it("1. Una invitación nueva abre 'Crea tu contraseña', NO 'Ingresa la contraseña de tu cuenta'", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    jest.spyOn(coachingApi, "verifyStudentInvitation").mockResolvedValueOnce({
      ok: true,
      invitationId: "inv-uuid",
      email: "student@test.com",
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      clubName: "Hack Pádel",
      coachName: "Gabriel Duran",
      expiresAt: "2026-11-01T00:00:00Z",
      isExistingAccount: false, // Nueva invitación legítima
      isEmailVerified: true,
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    expect(container.textContent).toContain("Crea tu contraseña");
    expect(container.textContent).toContain("Alumno Zaid");
    expect(container.textContent).toContain("RIV-00000107");
    expect(container.textContent).toContain("Hack Pádel");
    expect(container.textContent).toContain("Gabriel Duran");
    expect(container.textContent).toContain("Nueva contraseña");
    expect(container.textContent).toContain("Continuar");

    // Verificar que NO muestra textos de cuenta existente ni contraseñas anteriores
    expect(container.textContent).not.toContain("Ingresa tu contraseña habitual");
    expect(container.textContent).not.toContain("AppRiviera");
    expect(container.textContent).not.toContain("contraseña anterior");
  });

  it("2. Mostrar / Ocultar alterna el tipo de input entre password y text", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    jest.spyOn(coachingApi, "verifyStudentInvitation").mockResolvedValueOnce({
      ok: true,
      invitationId: "inv-uuid",
      email: "student@test.com",
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      clubName: "Hack Pádel",
      coachName: "Gabriel Duran",
      expiresAt: "2026-11-01T00:00:00Z",
      isExistingAccount: false,
      isEmailVerified: true,
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    const passwordInput = container.querySelector("input[type='password']") as HTMLInputElement;
    expect(passwordInput).not.toBeNull();

    const toggleBtn = container.querySelector(".student-input-toggle") as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.textContent?.trim()).toBe("Mostrar");

    // Pulsar Mostrar
    await act(async () => {
      toggleBtn.click();
    });

    const textInput = container.querySelector("input[type='text']") as HTMLInputElement;
    expect(textInput).not.toBeNull();
    expect(toggleBtn.textContent?.trim()).toBe("Ocultar");

    // Pulsar Ocultar
    await act(async () => {
      toggleBtn.click();
    });
    expect(container.querySelector("input[type='password']")).not.toBeNull();
  });

  it("3. 'Continuar' valida longitud mínima (8) y abre el paso de confirmación sin guardar", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    jest.spyOn(coachingApi, "verifyStudentInvitation").mockResolvedValueOnce({
      ok: true,
      email: "student@test.com",
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      clubName: "Hack Pádel",
      coachName: "Gabriel Duran",
      isExistingAccount: false,
      isEmailVerified: true,
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    const continueBtn = container.querySelector("button[type='submit']") as HTMLButtonElement;

    // Intentar con contraseña corta
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, "short");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      continueBtn.click();
    });

    expect(container.textContent).toContain("al menos 8 caracteres");
    expect(container.querySelector(".student-modal-overlay")).toBeNull();

    // Contraseña válida de 8 o más caracteres
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, "SecurePass123!");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await act(async () => {
      continueBtn.click();
    });

    // Modal de confirmación abierto
    const modal = document.querySelector(".student-modal-overlay");
    expect(modal).not.toBeNull();
    expect(modal?.textContent).toContain("Confirma tu contraseña");
    expect(modal?.textContent).toContain("Confirmar contraseña");
    expect(modal?.textContent).toContain("Cancelar");

    // Validar que NO se ha llamado a updateUser todavía
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("4. 'Cancelar' en el modal cierra el diálogo y vuelve a Pantalla 1 sin guardar", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    jest.spyOn(coachingApi, "verifyStudentInvitation").mockResolvedValueOnce({
      ok: true,
      email: "student@test.com",
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      clubName: "Hack Pádel",
      coachName: "Gabriel Duran",
      isExistingAccount: false,
      isEmailVerified: true,
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    const continueBtn = container.querySelector("button[type='submit']") as HTMLButtonElement;

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, "SecurePass123!");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      continueBtn.click();
    });

    const cancelBtn = document.querySelector(".student-modal-actions .student-btn-secondary") as HTMLButtonElement;
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn.textContent).toContain("Cancelar");

    await act(async () => {
      cancelBtn.click();
    });

    // El modal se cierra
    expect(document.querySelector(".student-modal-overlay")).toBeNull();
    // La contraseña original sigue en el campo
    expect((container.querySelector("input") as HTMLInputElement).value).toBe("SecurePass123!");
    // No se alteró supabase.auth
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("5. Contraseñas diferentes muestran error y NO permiten avanzar", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    jest.spyOn(coachingApi, "verifyStudentInvitation").mockResolvedValueOnce({
      ok: true,
      email: "student@test.com",
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      clubName: "Hack Pádel",
      coachName: "Gabriel Duran",
      isExistingAccount: false,
      isEmailVerified: true,
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, "SecurePass123!");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      (container.querySelector("button[type='submit']") as HTMLButtonElement).click();
    });

    const confirmInput = document.querySelector(".student-modal-dialog input") as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(confirmInput, "DifferentPass999!");
      confirmInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const confirmSubmitBtn = document.querySelector(".student-modal-dialog button[type='submit']") as HTMLButtonElement;
    await act(async () => {
      confirmSubmitBtn.click();
    });

    expect(document.querySelector(".student-modal-dialog")?.textContent).toContain("Las contraseñas no coinciden");
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("6. Contraseñas coincidentes guardan una sola vez y vinculan el perfil", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    jest.spyOn(coachingApi, "verifyStudentInvitation").mockResolvedValueOnce({
      ok: true,
      email: "student@test.com",
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      clubName: "Hack Pádel",
      coachName: "Gabriel Duran",
      isExistingAccount: false,
      isEmailVerified: true,
    });

    const claimSpy = jest.spyOn(coachingApi, "claimStudentInvitation").mockResolvedValueOnce({
      ok: true,
      message: "¡Perfil vinculado!",
      rivieraId: "RIV-00000107",
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, "SecurePass123!");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      (container.querySelector("button[type='submit']") as HTMLButtonElement).click();
    });

    const confirmInput = document.querySelector(".student-modal-dialog input") as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(confirmInput, "SecurePass123!");
      confirmInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const confirmSubmitBtn = document.querySelector(".student-modal-dialog button[type='submit']") as HTMLButtonElement;
    await act(async () => {
      confirmSubmitBtn.click();
    });

    // Se guardó la contraseña con updateUser exactamente 1 vez
    expect(supabase.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "SecurePass123!" });

    // Se llamó a claimStudentInvitation con el token
    expect(claimSpy).toHaveBeenCalledTimes(1);
    expect(claimSpy).toHaveBeenCalledWith("test-valid-token-123");

    // Modal cerrado y mensaje de éxito visible
    expect(document.querySelector(".student-modal-overlay")).toBeNull();
    expect(container.textContent).toContain("¡Cuenta vinculada exitosamente!");
  });

  it("7. Prueba negativa: Sesión con correo diferente es rechazada y deja la contraseña intacta", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    // Mock sesión activa con correo distinto al del alumno invitado
    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          user: {
            id: "different-user-uuid",
            email: "other_person@example.com",
            email_confirmed_at: "2026-10-21T00:00:00Z",
            app_metadata: { role: "student", account_type: "STUDENT_ONLY" },
          },
        } as any,
      },
      error: null,
    });

    jest.spyOn(coachingApi, "verifyStudentInvitation").mockResolvedValueOnce({
      ok: true,
      email: "legitimate_student@test.com",
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      clubName: "Hack Pádel",
      coachName: "Gabriel Duran",
      isExistingAccount: false,
      isEmailVerified: true,
    });

    const claimSpy = jest.spyOn(coachingApi, "claimStudentInvitation");

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, "SecurePass123!");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Intentar avanzar a confirmación
    await act(async () => {
      (container.querySelector("button[type='submit']") as HTMLButtonElement).click();
    });

    // Debe mostrar error de disparidad de correo y bloquear
    expect(container.textContent).toContain("no coincide con el correo invitado");
    // La contraseña jamás se modifica
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    // La invitación jamás se consume
    expect(claimSpy).not.toHaveBeenCalled();
    // El modal de confirmación no se abre
    expect(document.querySelector(".student-modal-overlay")).toBeNull();
  });

  it("8. Prueba negativa: Sesión de administrador o entrenador es rechazada y deja la contraseña intacta", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    // Mock sesión activa con rol administrativo
    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: {
        session: {
          user: {
            id: "admin-organizer-uuid",
            email: "admin_user@test.com",
            email_confirmed_at: "2026-10-21T00:00:00Z",
            app_metadata: { role: "admin", account_type: "CLUB_ADMIN" },
          },
        } as any,
      },
      error: null,
    });

    jest.spyOn(coachingApi, "verifyStudentInvitation").mockResolvedValueOnce({
      ok: true,
      email: "admin_user@test.com", // Mismo email pero cuenta administrativa
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      clubName: "Hack Pádel",
      coachName: "Gabriel Duran",
      isExistingAccount: false,
      isEmailVerified: true,
    });

    const claimSpy = jest.spyOn(coachingApi, "claimStudentInvitation");

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, "SecurePass123!");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Intentar avanzar
    await act(async () => {
      (container.querySelector("button[type='submit']") as HTMLButtonElement).click();
    });

    // Debe mostrar error de cuenta administrativa/entrenador
    expect(container.textContent).toContain("cuenta administrativa o de entrenador");
    // La contraseña de la cuenta administrativa jamás se modifica
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    // La invitación jamás se consume
    expect(claimSpy).not.toHaveBeenCalled();
    // El modal de confirmación no se abre
    expect(document.querySelector(".student-modal-overlay")).toBeNull();
  });
});
