import React, { useEffect, useState } from "react";

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

function fullscreenElement(): Element | null {
  const doc = document as FullscreenDocument;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function canFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  const node = document.documentElement as FullscreenElement;
  return Boolean(node.requestFullscreen || node.webkitRequestFullscreen);
}

function enterFullscreen(): void {
  const node = document.documentElement as FullscreenElement;
  const request = node.requestFullscreen?.bind(node) ?? node.webkitRequestFullscreen?.bind(node);
  if (request) void Promise.resolve(request()).catch(() => undefined);
}

function exitFullscreen(): void {
  const doc = document as FullscreenDocument;
  const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(document);
  if (exit) void Promise.resolve(exit()).catch(() => undefined);
}

function MaximizeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden focusable="false">
      <polyline points="15 3 21 3 21 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="9 21 3 21 3 15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="21" y1="3" x2="14" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="3" y1="21" x2="10" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden focusable="false">
      <polyline points="4 14 10 14 10 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="20 10 14 10 14 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="14" y1="10" x2="21" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="3" y1="21" x2="10" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Botón fijo para cualquier vista pública de espectador. */
export const PublicFullscreenButton: React.FC = () => {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(canFullscreen());
    const sync = () => setActive(Boolean(fullscreenElement()));
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  if (!supported) return null;

  return (
    <button
      type="button"
      className="ro-public-fullscreen"
      aria-label={active ? "Salir de pantalla completa" : "Expandir"}
      title={active ? "Salir de pantalla completa" : "Pantalla completa"}
      onClick={() => (fullscreenElement() ? exitFullscreen() : enterFullscreen())}
    >
      {active ? <MinimizeIcon /> : <MaximizeIcon />}
    </button>
  );
};
