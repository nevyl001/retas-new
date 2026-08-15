import {
  renderGroupWinnerSharePng,
  slugifyGroupWinnerShareFileName,
  type GroupWinnerShareData,
} from "./renderGroupWinnerShareCanvas";

export type ShareGroupWinnerResult =
  | { status: "shared" }
  | { status: "downloaded"; fileName: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

function canShareFiles(file: File): boolean {
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") {
    return false;
  }
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

export function downloadGroupWinnerPng(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function isAbortError(error: unknown): boolean {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: string }).name)
      : "";
  if (name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /abort|cancel/i.test(message);
}

/**
 * Comparte exclusivamente un PNG con Web Share Files. Nunca adjunta URL,
 * texto ni title: los canales reciben el arte generado por Riviera.
 */
export async function shareGroupWinnerImage(
  data: GroupWinnerShareData
): Promise<ShareGroupWinnerResult> {
  try {
    const blob = await renderGroupWinnerSharePng(data);
    const fileName = slugifyGroupWinnerShareFileName(data);
    const file = new File([blob], fileName, { type: "image/png" });

    if (canShareFiles(file)) {
      try {
        await navigator.share({ files: [file] });
        return { status: "shared" };
      } catch (error) {
        if (isAbortError(error)) return { status: "cancelled" };
        // Política del SO / Web Share: conservar la imagen con descarga.
      }
    }

    downloadGroupWinnerPng(blob, fileName);
    return { status: "downloaded", fileName };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error && error.message
          ? error.message
          : "share_generation_failed",
    };
  }
}
