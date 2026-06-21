import React, { useId, useState } from "react";

export interface PasswordFieldProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "className"
  > {
  label: string;
  className?: string;
  inputClassName?: string;
  error?: string;
  hint?: string;
}

export const PasswordField: React.FC<PasswordFieldProps> = ({
  label,
  className = "",
  inputClassName = "",
  error,
  hint,
  id,
  disabled,
  ...props
}) => {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);

  const controlClass = [
    "riviera-input",
    "auth-password-field__input",
    error && "riviera-input--error",
    inputClassName,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`riviera-field auth-field auth-password-field ${className}`.trim()}>
      <label className="riviera-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="auth-password-field__wrap">
        <input
          id={inputId}
          className={controlClass}
          type={visible ? "text" : "password"}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          {...props}
        />
        <button
          type="button"
          className="auth-password-field__toggle"
          disabled={disabled}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      {hint && !error ? (
        <p id={`${inputId}-hint`} className="riviera-field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="riviera-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};
