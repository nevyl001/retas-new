import type { PodiumSharePresentation } from "./publicPodiumSharePresentation";
import {
  podiumShareFileName,
  renderTournamentPodiumSharePng,
} from "./renderTournamentPodiumShareCanvas";

export type ShareTournamentPodiumResult =
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

export async function shareTournamentPodiumImage(
  data: PodiumSharePresentation,
): Promise<ShareTournamentPodiumResult> {
  try {
    const blob = await renderTournamentPodiumSharePng(data);
    const fileName = podiumShareFileName(data);
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
