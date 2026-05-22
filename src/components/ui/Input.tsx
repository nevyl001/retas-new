import React, { useId } from "react";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  inputClassName?: string;
}

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  inputClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      label,
      error,
      hint,
      icon,
      className = "",
      inputClassName = "",
      id,
      ...props
    },
    ref
  ) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const controlClass = [
      "riviera-input",
      error && "riviera-input--error",
      inputClassName,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={`riviera-field ${className}`.trim()}>
        {label ? (
          <label className="riviera-label" htmlFor={inputId}>
            {label}
          </label>
        ) : null}
        <div className="riviera-input-wrap">
          {icon}
          <input
            ref={ref}
            id={inputId}
            className={controlClass}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />
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
  }
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { label, error, hint, className = "", inputClassName = "", id, ...props },
    ref
  ) {
    const autoId = useId();
    const inputId = id ?? autoId;
    const controlClass = [
      "riviera-textarea",
      "riviera-input",
      error && "riviera-input--error",
      inputClassName,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={`riviera-field ${className}`.trim()}>
        {label ? (
          <label className="riviera-label" htmlFor={inputId}>
            {label}
          </label>
        ) : null}
        <textarea
          ref={ref}
          id={inputId}
          className={controlClass}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {hint && !error ? (
          <p className="riviera-field-hint">{hint}</p>
        ) : null}
        {error ? (
          <p className="riviera-field-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
);
