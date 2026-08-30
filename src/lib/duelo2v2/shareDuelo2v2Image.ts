import type { Duelo2v2SharePresentation } from "./duelo2v2SharePresentation";
import { duelo2v2ShareFileName } from "./duelo2v2SharePresentation";
import { renderDuelo2v2SharePng } from "./renderDuelo2v2ShareCanvas";

export type ShareDuelo2v2Result =
  | { status: "shared" }
  | { status: "downloaded"; fileName: string }
  | { status: "cancelled" }
  | { status: "error"; message: string };

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareDuelo2v2Image(
  data: Duelo2v2SharePresentation,
): Promise<ShareDuelo2v2Result> {
  try {
    const blob = await renderDuelo2v2SharePng(data);
    const fileName = duelo2v2ShareFileName(data);
    const file = new File([blob], fileName, { type: "image/png" });
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };

    if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
        return { status: "shared" };
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          (error as { name?: string }).name === "AbortError"
        ) {
          return { status: "cancelled" };
        }
      }
    }

    download(blob, fileName);
    return { status: "downloaded", fileName };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "share_generation_failed",
    };
  }
}
