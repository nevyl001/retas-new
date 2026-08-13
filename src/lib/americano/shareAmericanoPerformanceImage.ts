import {
  buildAmericanoShareFileName,
  renderAmericanoPerformanceSharePng,
  type AmericanoPerformanceSharePayload,
} from "./renderAmericanoPerformanceShareCanvas";

export type ShareAmericanoPerformanceResult =
  | { status: "shared" }
  | { status: "downloaded"; fileName: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

function canShareFiles(file: File): boolean {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  if (typeof nav.share !== "function") return false;
  if (typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function downloadBlobAsFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Genera PNG 9:16 y lo comparte (Web Share con archivos) o descarga.
 */
export async function shareAmericanoPerformanceImage(
  payload: AmericanoPerformanceSharePayload
): Promise<ShareAmericanoPerformanceResult> {
  try {
    const blob = await renderAmericanoPerformanceSharePng(payload);
    const fileName = buildAmericanoShareFileName(payload.playerName);
    const file = new File([blob], fileName, { type: "image/png" });

    if (canShareFiles(file)) {
      try {
        await navigator.share({
          files: [file],
          title: `Desempeño · ${payload.playerName}`,
          text: payload.eventName?.trim()
            ? `Mi desempeño en ${payload.eventName.trim()}`
            : "Mi desempeño en Americano",
        });
        return { status: "shared" };
      } catch (err) {
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name?: string }).name)
            : "";
        if (name === "AbortError") {
          return { status: "cancelled" };
        }
        const msg =
          err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
        if (msg.includes("abort") || msg.includes("cancel")) {
          return { status: "cancelled" };
        }
        // Fallback seguro a descarga si share falla por política del SO.
      }
    }

    downloadBlobAsFile(blob, fileName);
    return { status: "downloaded", fileName };
  } catch (err) {
    const message =
      err instanceof Error && err.message
        ? err.message
        : "No se pudo generar la imagen";
    return { status: "error", message };
  }
}
