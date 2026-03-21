/**
 * Swip Lease — clean Hinge-inspired palette (refined from Figma low-fi)
 */
export const colors = {
  canvas: "#E6C9C9",
  bg: "#FDF8F6",
  surface: "#FFFFFF",
  primary: "#B91C1C",
  primaryPressed: "#991B1B",
  ink: "#1C1917",
  muted: "#78716C",
  subtle: "#A8A29E",
  border: "#E7E5E4",
  overlay: "rgba(28, 25, 23, 0.55)",
  success: "#15803D",
  pass: "#B91C1C",
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 28,
  full: 9999,
};

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
};

export const type = {
  title: { fontSize: 26, fontWeight: "700" as const, letterSpacing: -0.4, color: colors.ink },
  headline: { fontSize: 20, fontWeight: "600" as const, color: colors.ink },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  caption: { fontSize: 13, color: colors.subtle },
  brand: { fontSize: 32, fontWeight: "800" as const, letterSpacing: -0.8, color: colors.primary },
};
