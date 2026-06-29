export type BrandKey = "riviera" | "hack-padel";

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  success: string;
  warning: string;
  danger: string;
}

export interface BrandTypography {
  heading: string;
  body: string;
  headingWeight: number;
  headingLetterSpacing: string;
}

export interface BrandConfig {
  key: BrandKey;
  displayName: string;
  motherBrandName: string;
  coBrandLine: string;
  coBrandCompact: string;
  logoUrl: string | null;
  slogan?: string;
  colors: BrandColors;
  typography: BrandTypography;
}
