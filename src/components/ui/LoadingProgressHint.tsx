import React, { useEffect, useState } from "react";
import "./LoadingProgressHint.css";

export function useLoadingElapsed(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    setSeconds(0);
    const id = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  return seconds;
}

function messageFor(seconds: number, label: string): string {
  if (seconds <= 0) return label;
  if (seconds < 6) return `${label} (${seconds}s)`;
  if (seconds < 12) return `${label} — sincronizando datos (${seconds}s)`;
  return `${label} — un momento más (${seconds}s)`;
}

interface LoadingProgressHintProps {
  active: boolean;
  label?: string;
  className?: string;
}

export const LoadingProgressHint: React.FC<LoadingProgressHintProps> = ({
  active,
  label = "Cargando…",
  className = "",
}) => {
  const seconds = useLoadingElapsed(active);
  if (!active) return null;

  return (
    <div
      className={`loading-progress-hint${className ? ` ${className}` : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="loading-progress-hint__spinner" aria-hidden />
      <p className="loading-progress-hint__text">{messageFor(seconds, label)}</p>
    </div>
  );
};
