import { navigateAppTo } from "./appRouting";

export const PRIVACIDAD_TERMINOS_PATH = "/privacidad-terminos";

export function buildPrivacidadTerminosPath(): string {
  return PRIVACIDAD_TERMINOS_PATH;
}

export function navigatePrivacidadTerminos(): void {
  navigateAppTo(PRIVACIDAD_TERMINOS_PATH);
}
