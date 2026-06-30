function readHtmlDataClub(): string | null {
  if (typeof document === "undefined") return null;
  return (
    document.documentElement.getAttribute("data-club") ??
    document.documentElement.getAttribute("data-brand")
  );
}

/** Logs temporales solo en desarrollo — branding bootstrap / sesión. */
export function brandingDevLog(
  label: string,
  payload: Record<string, unknown> = {}
): void {
  if (process.env.NODE_ENV === "production") return;

  console.log(`[branding] ${label}`, {
    ...payload,
    htmlDataClub: readHtmlDataClub(),
    htmlClasses: typeof document !== "undefined"
      ? document.documentElement.className
      : null,
  });
}

export function brandingDevLogHtmlTransition(
  label: string,
  beforeClub: string | null
): void {
  if (process.env.NODE_ENV === "production") return;

  const afterClub = readHtmlDataClub();
  console.log(`[branding] ${label}`, {
    htmlDataClubBefore: beforeClub,
    htmlDataClubAfter: afterClub,
  });
}
