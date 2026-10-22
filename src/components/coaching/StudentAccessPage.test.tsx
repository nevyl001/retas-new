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

    jest.spyOn(supabase.auth, "signInWithPassword").mockResolvedValue({
      data: {
        user: { id: "student-user-uuid", email: "student@test.com" } as any,
        session: { access_token: "tok" } as any,
      },
      error: null,
    });

    jest.spyOn(supabase.auth, "resetPasswordForEmail").mockResolvedValue({
      data: {} as any,
      error: null,
    });

    jest.spyOn(coachingApi, "loginStudentWithIdentifier").mockResolvedValue({
      ok: true,
      session: {
        access_token: "mock-access-token",
        user: { id: "student-user-uuid", email: "student@test.com" },
      } as any,
    });

    jest.spyOn(coachingApi, "requestStudentPasswordReset").mockResolvedValue({
      ok: true,
      message: "Enlace de recuperación enviado.",
    });

    jest.spyOn(coachingApi, "requestStudentAccessLink").mockResolvedValue({
      ok: true,
      message: "Enlace de acceso enviado a tu correo.",
    });

    jest.spyOn(coachingApi, "resolveStudentLoginIdentifier").mockResolvedValue({
      ok: true,
      email: "student@test.com",
      rivieraId: "RIV-00000107",
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

    expect(container.querySelector("input[type='password']")).toBeNull();
    expect(container.textContent).toContain("no coincide con el correo invitado");
    expect(container.textContent).toContain("Solicitar nuevo enlace de acceso");
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

  it("9. Seguridad: Si no hay sesión autenticada en el navegador, bloquea la definición de contraseña sin crear sesiones automáticas por mero token", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    // Simular que el navegador NO tiene sesión activa (ej. abierto sin haber hecho clic en el enlace en este navegador)
    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });

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

    const claimSpy = jest.spyOn(coachingApi, "claimStudentInvitation");
    const resendSpy = jest.spyOn(coachingApi, "requestStudentAccessLink").mockResolvedValueOnce({
      ok: true,
      message: "Enlace enviado a tu correo electrónico. Ábrelo en este navegador.",
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    expect(container.querySelector("input[type='password']")).toBeNull();
    expect(container.textContent).toContain("Falta la sesión en este navegador");
    expect(container.textContent).not.toContain("Nueva contraseña");

    const resendBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Solicitar nuevo enlace de acceso")
    );
    expect(resendBtn).toBeDefined();

    await act(async () => {
      resendBtn?.click();
    });

    expect(resendSpy).toHaveBeenCalledWith("test-valid-token-123");
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(claimSpy).not.toHaveBeenCalled();
  });

  it("10. Login con Riviera ID: Alumno ingresa 'RIV-00000107', invoca loginStudentWithIdentifier y entra sin exponer correos", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno");

    const loginSpy = jest.spyOn(coachingApi, "loginStudentWithIdentifier").mockResolvedValueOnce({
      ok: true,
      session: {
        access_token: "mock-valid-token",
        user: { id: "student-user-uuid", email: "student@test.com" },
      } as any,
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    const idInput = container.querySelector("input[type='text']") as HTMLInputElement;
    const passInput = container.querySelector("input[type='password']") as HTMLInputElement;
    const submitBtn = container.querySelector("button[type='submit']") as HTMLButtonElement;

    expect(container.textContent).toContain("Correo Electrónico o Riviera ID");

    await act(async () => {
      const nativeSetterText = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetterText?.call(idInput, "RIV-00000107");
      idInput.dispatchEvent(new Event("input", { bubbles: true }));

      const nativeSetterPass = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetterPass?.call(passInput, "SecurePass123!");
      passInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      submitBtn.click();
    });

    expect(loginSpy).toHaveBeenCalledWith("RIV-00000107", "SecurePass123!");
  });

  it("11. Login con credenciales incorrectas muestra error genérico sin revelar existencia de cuentas", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno");

    jest.spyOn(coachingApi, "loginStudentWithIdentifier").mockResolvedValueOnce({
      ok: false,
      error: "Credenciales incorrectas. Verifica tu identificador y contraseña.",
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    const idInput = container.querySelector("input[type='text']") as HTMLInputElement;
    const passInput = container.querySelector("input[type='password']") as HTMLInputElement;
    const submitBtn = container.querySelector("button[type='submit']") as HTMLButtonElement;

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(idInput, "RIV-99999999");
      idInput.dispatchEvent(new Event("input", { bubbles: true }));

      nativeSetter?.call(passInput, "WrongPass123!");
      passInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      submitBtn.click();
    });

    expect(container.textContent).toContain("Credenciales incorrectas. Verifica tu identificador y contraseña.");
  });

  it("12. Recuperación de contraseña: Permite ingresar Riviera ID y utiliza requestStudentPasswordReset sin filtrar correos", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno");

    const resetSpy = jest.spyOn(coachingApi, "requestStudentPasswordReset").mockResolvedValueOnce({
      ok: true,
      message: "Si existe una cuenta asociada, se ha enviado un enlace de recuperación.",
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    // Hacer clic en "¿Olvidaste tu contraseña?"
    const forgotBtn = container.querySelector(".student-text-btn") as HTMLButtonElement;
    await act(async () => {
      forgotBtn.click();
    });

    expect(container.textContent).toContain("Recuperar Contraseña");

    const recoveryInput = container.querySelector("input[type='text']") as HTMLInputElement;
    const submitBtn = container.querySelector("button[type='submit']") as HTMLButtonElement;

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(recoveryInput, "RIV-00000107");
      recoveryInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      submitBtn.click();
    });

    expect(resetSpy).toHaveBeenCalledWith("RIV-00000107", expect.anything());
    expect(container.textContent).toContain("Correo enviado");
  });

  it("13. Reenvío seguro de enlace de acceso: Permite al alumno solicitar enlace a su correo", async () => {
    window.history.replaceState({}, "", "/coaching/acceso-alumno?token=test-valid-token-123");

    jest.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: null },
      error: null,
    });

    jest.spyOn(coachingApi, "verifyStudentInvitation").mockResolvedValueOnce({
      ok: true,
      email: "student@test.com",
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      clubName: "Hack Pádel",
      coachName: "Gabriel Duran",
      isExistingAccount: false,
      isEmailVerified: false,
    });

    const resendSpy = jest.spyOn(coachingApi, "requestStudentAccessLink").mockResolvedValueOnce({
      ok: true,
      message: "Enlace enviado a tu correo.",
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    expect(container.textContent).toContain("Verificación de Correo Requerida");

    const resendBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Reenviar Enlace")
    );
    expect(resendBtn).toBeDefined();

    await act(async () => {
      resendBtn?.click();
    });

    expect(resendSpy).toHaveBeenCalledWith("test-valid-token-123");
  });

  it("14. Flujo del alumno (Paso 4-5): Al activar y vincular Riviera ID, pasa a login con su Riviera ID previamente completado sin pedir correo", async () => {
    jest.useFakeTimers();
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

    jest.spyOn(coachingApi, "claimStudentInvitation").mockResolvedValueOnce({
      ok: true,
      studentName: "Alumno Zaid",
      rivieraId: "RIV-00000107",
      message: "¡Cuenta activada!",
    });

    await act(async () => {
      root.render(<StudentAccessPage />);
    });

    // Ingresar contraseña
    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(input, "SecurePass123!");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      (container.querySelector("button[type='submit']") as HTMLButtonElement).click();
    });

    // Confirmar en el modal
    const confirmInput = document.querySelector(".student-modal-dialog input") as HTMLInputElement;
    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      nativeSetter?.call(confirmInput, "SecurePass123!");
      confirmInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      (document.querySelector(".student-modal-dialog button[type='submit']") as HTMLButtonElement).click();
    });

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "SecurePass123!" });
    expect(coachingApi.claimStudentInvitation).toHaveBeenCalledWith("test-valid-token-123");

    // Avanzar timer de transición a login
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });

    // Modo login activo
    expect(container.textContent).toContain("Acceso de Alumno");
    expect(container.textContent).toContain("RIV-00000107");
    // El input de usuario tiene completado el Riviera ID
    const loginIdInput = container.querySelector("input[type='text']") as HTMLInputElement;
    expect(loginIdInput.value).toBe("RIV-00000107");

    jest.useRealTimers();
  });
});


