import React, { useCallback, useEffect, useState } from "react";
import {
  createUserAdmin,
  type AdminCreateUserRole,
} from "../../lib/admin/createUserAdmin";
import "./AdminCreateUserModal.css";

interface AdminCreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

type ModalStep = "form" | "success";

const PASSWORD_CHARS =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";

function generateTemporaryPassword(length = 14): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length]).join(
    ""
  );
}

export const AdminCreateUserModal: React.FC<AdminCreateUserModalProps> = ({
  open,
  onClose,
  onCreated,
}) => {
  const [step, setStep] = useState<ModalStep>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminCreateUserRole>("organizador");
  const [adminMaestroConfirmed, setAdminMaestroConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdEmail, setCreatedEmail] = useState("");
  const [createdPassword, setCreatedPassword] = useState("");
  const [copyLabel, setCopyLabel] = useState("Copiar contraseña");

  const resetForm = useCallback(() => {
    setStep("form");
    setName("");
    setEmail("");
    setPassword("");
    setRole("organizador");
    setAdminMaestroConfirmed(false);
    setSaving(false);
    setError(null);
    setCreatedEmail("");
    setCreatedPassword("");
    setCopyLabel("Copiar contraseña");
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleGeneratePassword = () => {
    setPassword(generateTemporaryPassword());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!email.trim()) {
      setError("El correo electrónico es obligatorio.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (role === "admin_maestro" && !adminMaestroConfirmed) {
      setError(
        "Confirma que entiendes que este usuario tendrá acceso al panel de administración."
      );
      return;
    }

    setSaving(true);
    const passwordForDisplay = password;

    try {
      const result = await createUserAdmin({
        email: email.trim(),
        name: name.trim(),
        password: passwordForDisplay,
        role,
      });

      setCreatedEmail(result.email);
      setCreatedPassword(passwordForDisplay);
      setPassword("");
      setStep("success");
      await onCreated();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear el usuario"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPassword = async () => {
    try {
      await navigator.clipboard.writeText(createdPassword);
      setCopyLabel("Copiada");
      window.setTimeout(() => setCopyLabel("Copiar contraseña"), 2000);
    } catch {
      setError("No se pudo copiar al portapapeles. Copia la contraseña manualmente.");
    }
  };

  if (!open) return null;

  return (
    <div
      className="admin-create-user-modal"
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="admin-create-user-modal__panel"
        role="dialog"
        aria-labelledby="admin-create-user-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="admin-create-user-modal__close"
          onClick={handleClose}
          aria-label="Cerrar"
        >
          ×
        </button>

        {step === "form" ? (
          <>
            <h2 id="admin-create-user-title" className="admin-create-user-modal__title">
              Crear usuario
            </h2>
            <p className="admin-create-user-modal__subtitle">
              Crea una cuenta con contraseña temporal. Compártela con el usuario de
              forma segura; no se guardará en el sistema.
            </p>

            <form className="admin-create-user-modal__form" onSubmit={handleSubmit}>
              <label className="admin-create-user-modal__field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="off"
                  disabled={saving}
                  placeholder="Nombre del organizador"
                />
              </label>

              <label className="admin-create-user-modal__field">
                <span>Correo electrónico</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                  disabled={saving}
                  placeholder="correo@ejemplo.com"
                />
              </label>

              <div className="admin-create-user-modal__field">
                <span>Contraseña temporal</span>
                <div className="admin-create-user-modal__password-row">
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={saving}
                    placeholder="Mínimo 8 caracteres"
                  />
                  <button
                    type="button"
                    className="admin-create-user-modal__btn admin-create-user-modal__btn--ghost"
                    onClick={handleGeneratePassword}
                    disabled={saving}
                  >
                    Generar automática
                  </button>
                </div>
              </div>

              <fieldset className="admin-create-user-modal__role-fieldset">
                <legend>Tipo de cuenta</legend>
                <label className="admin-create-user-modal__radio">
                  <input
                    type="radio"
                    name="account-role"
                    value="organizador"
                    checked={role === "organizador"}
                    onChange={() => {
                      setRole("organizador");
                      setAdminMaestroConfirmed(false);
                    }}
                    disabled={saving}
                  />
                  <span>
                    <strong>Organizador</strong> — acceso a la app para gestionar
                    retas y torneos
                  </span>
                </label>
                <label className="admin-create-user-modal__radio">
                  <input
                    type="radio"
                    name="account-role"
                    value="admin_maestro"
                    checked={role === "admin_maestro"}
                    onChange={() => setRole("admin_maestro")}
                    disabled={saving}
                  />
                  <span>
                    <strong>Administrador maestro</strong> — acceso al panel de
                    administración
                  </span>
                </label>
              </fieldset>

              {role === "admin_maestro" && (
                <div className="admin-create-user-modal__warn">
                  <p>
                    Este usuario podrá gestionar todas las cuentas, borrar usuarios
                    y cambiar permisos globales. Úsalo solo para personal de
                    confianza.
                  </p>
                  <label className="admin-create-user-modal__confirm">
                    <input
                      type="checkbox"
                      checked={adminMaestroConfirmed}
                      onChange={(e) => setAdminMaestroConfirmed(e.target.checked)}
                      disabled={saving}
                    />
                    <span>Entiendo y quiero crear un administrador maestro</span>
                  </label>
                </div>
              )}

              {error && (
                <p className="admin-create-user-modal__error" role="alert">
                  {error}
                </p>
              )}

              <div className="admin-create-user-modal__actions">
                <button
                  type="button"
                  className="admin-create-user-modal__btn admin-create-user-modal__btn--ghost"
                  onClick={handleClose}
                  disabled={saving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="admin-create-user-modal__btn admin-create-user-modal__btn--primary"
                  disabled={saving}
                >
                  {saving ? "Creando…" : "Crear usuario"}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h2 className="admin-create-user-modal__title">Usuario creado</h2>
            <p className="admin-create-user-modal__subtitle">
              Guarda la contraseña ahora. <strong>No se volverá a mostrar</strong>{" "}
              al cerrar este cuadro.
            </p>

            <dl className="admin-create-user-modal__success">
              <div>
                <dt>Correo</dt>
                <dd>{createdEmail}</dd>
              </div>
              <div>
                <dt>Contraseña temporal</dt>
                <dd className="admin-create-user-modal__password-display">
                  <code>{createdPassword}</code>
                  <button
                    type="button"
                    className="admin-create-user-modal__btn admin-create-user-modal__btn--ghost"
                    onClick={handleCopyPassword}
                  >
                    {copyLabel}
                  </button>
                </dd>
              </div>
            </dl>

            <div className="admin-create-user-modal__actions">
              <button
                type="button"
                className="admin-create-user-modal__btn admin-create-user-modal__btn--primary"
                onClick={handleClose}
              >
                Cerrar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
