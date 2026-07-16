/**
 * Copia texto al portapapeles.
 * No usa navigator.share: el botón es "Copiar", no "Compartir".
 * Fallbacks: clipboard API → execCommand (Safari/iOS).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = text.trim();
  if (!value) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fallback */
  }

  return legacyExecCopy(value);
}

/** Fallback document.execCommand — necesario en iOS cuando clipboard API falla. */
export function legacyExecCopy(text: string): boolean {
  if (typeof document === "undefined") return false;

  const isIos =
    typeof navigator !== "undefined" &&
    /ipad|iphone|ipod/i.test(navigator.userAgent);

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "0";
  ta.style.width = "1px";
  ta.style.height = "1px";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  ta.style.fontSize = "16px"; // evita zoom en iOS al enfocar

  document.body.appendChild(ta);

  let ok = false;
  try {
    if (isIos) {
      ta.contentEditable = "true";
      ta.readOnly = false;
      const range = document.createRange();
      range.selectNodeContents(ta);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      ta.setSelectionRange(0, text.length);
    } else {
      ta.focus();
      ta.select();
    }
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    document.body.removeChild(ta);
  }

  return ok;
}
