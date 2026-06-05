/** ISO 3166-1 alpha-2 (almacenado en riviera_jugadores.pais_codigo). */
export type PaisCodigo = string;

export interface PaisOption {
  codigo: PaisCodigo;
  iso3: string;
  nombre: string;
}

/** Países habituales en pádel internacional (México primero, luego alfabético). */
export const PAISES_RIVIERA: readonly PaisOption[] = [
  { codigo: "MX", iso3: "MEX", nombre: "México" },
  { codigo: "AR", iso3: "ARG", nombre: "Argentina" },
  { codigo: "AU", iso3: "AUS", nombre: "Australia" },
  { codigo: "AT", iso3: "AUT", nombre: "Austria" },
  { codigo: "BE", iso3: "BEL", nombre: "Bélgica" },
  { codigo: "BO", iso3: "BOL", nombre: "Bolivia" },
  { codigo: "BR", iso3: "BRA", nombre: "Brasil" },
  { codigo: "CA", iso3: "CAN", nombre: "Canadá" },
  { codigo: "CL", iso3: "CHL", nombre: "Chile" },
  { codigo: "CO", iso3: "COL", nombre: "Colombia" },
  { codigo: "CR", iso3: "CRI", nombre: "Costa Rica" },
  { codigo: "HR", iso3: "HRV", nombre: "Croacia" },
  { codigo: "EC", iso3: "ECU", nombre: "Ecuador" },
  { codigo: "SV", iso3: "SLV", nombre: "El Salvador" },
  { codigo: "AE", iso3: "ARE", nombre: "Emiratos Árabes Unidos" },
  { codigo: "ES", iso3: "ESP", nombre: "España" },
  { codigo: "US", iso3: "USA", nombre: "Estados Unidos" },
  { codigo: "FR", iso3: "FRA", nombre: "Francia" },
  { codigo: "DE", iso3: "DEU", nombre: "Alemania" },
  { codigo: "GT", iso3: "GTM", nombre: "Guatemala" },
  { codigo: "HN", iso3: "HND", nombre: "Honduras" },
  { codigo: "IN", iso3: "IND", nombre: "India" },
  { codigo: "IE", iso3: "IRL", nombre: "Irlanda" },
  { codigo: "IT", iso3: "ITA", nombre: "Italia" },
  { codigo: "JP", iso3: "JPN", nombre: "Japón" },
  { codigo: "MA", iso3: "MAR", nombre: "Marruecos" },
  { codigo: "NL", iso3: "NLD", nombre: "Países Bajos" },
  { codigo: "PA", iso3: "PAN", nombre: "Panamá" },
  { codigo: "PY", iso3: "PRY", nombre: "Paraguay" },
  { codigo: "PE", iso3: "PER", nombre: "Perú" },
  { codigo: "PT", iso3: "PRT", nombre: "Portugal" },
  { codigo: "GB", iso3: "GBR", nombre: "Reino Unido" },
  { codigo: "DO", iso3: "DOM", nombre: "República Dominicana" },
  { codigo: "ZA", iso3: "ZAF", nombre: "Sudáfrica" },
  { codigo: "SE", iso3: "SWE", nombre: "Suecia" },
  { codigo: "CH", iso3: "CHE", nombre: "Suiza" },
  { codigo: "UY", iso3: "URY", nombre: "Uruguay" },
  { codigo: "VE", iso3: "VEN", nombre: "Venezuela" },
] as const;

const BY_CODIGO = new Map(PAISES_RIVIERA.map((p) => [p.codigo, p]));

export function getPaisOption(
  codigo: string | null | undefined
): PaisOption | null {
  if (!codigo?.trim()) return null;
  return BY_CODIGO.get(codigo.trim().toUpperCase()) ?? null;
}

export function countryCodeToFlagEmoji(
  codigo: string | null | undefined
): string {
  const c = codigo?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{2}$/.test(c)) return "";
  const chars = Array.from(c);
  return String.fromCodePoint(
    ...chars.map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)
  );
}

export function normalizePaisCodigo(
  codigo: string | null | undefined
): string | null {
  if (!codigo?.trim()) return null;
  const c = codigo.trim().toUpperCase();
  return getPaisOption(c) ? c : null;
}

export function paisSelectLabel(p: PaisOption): string {
  return `${countryCodeToFlagEmoji(p.codigo)} ${p.nombre} (${p.iso3})`;
}
