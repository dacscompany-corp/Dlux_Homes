// Brand accent palette, shared by every drawn brand asset (DluxMark,
// DluxLoader). These are the design file's own hexes rather than the app's
// --ink/--white tokens: a brand asset has to look identical wherever it is
// dropped, including outside this app's token scope.
//
// Type-only imports from here are erased at compile time, so a server
// component can pull the accent type without crossing a client boundary.

export type BrandAccent = "clay" | "gold" | "cream";

export const ACCENT_HEX: Record<BrandAccent, string> = {
  clay: "#B8754A",
  gold: "#D4A96A",
  cream: "#FAF7F1",
};

/** Resolve an accent to its hex, falling back to clay for an unknown value. */
export const accentHex = (accent: BrandAccent): string => ACCENT_HEX[accent] ?? ACCENT_HEX.clay;
