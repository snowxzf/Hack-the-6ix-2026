/**
 * PlotTwist color palettes.
 *
 * Default ("day") is the main garden scheme. Later we'll add dawn / midday /
 * dusk / night / late-night and sync to phone time-of-day when the user opts
 * in via Settings ("sync colors with time of day"). That feature is not wired
 * yet: only the day tokens are applied via CSS `:root`.
 */

export type ThemeId = "day";

export interface AppPalette {
  id: ThemeId;
  label: string;
  /** Hex swatches from the design palette (for docs / future theme switcher). */
  swatches: {
    forest: string;
    sage: string;
    apricot: string;
    seafoam: string;
    cream: string;
    olive: string;
    brown: string;
    leaf: string;
  };
}

/** Main application palette (current default). */
export const DAY_PALETTE: AppPalette = {
  id: "day",
  label: "Day",
  swatches: {
    forest: "#255843",
    sage: "#97BD8A",
    apricot: "#DC9D52",
    seafoam: "#93BDA6",
    cream: "#F1FFDD",
    olive: "#698751",
    brown: "#291D18",
    leaf: "#659466",
  },
};

export const PALETTES: Record<ThemeId, AppPalette> = {
  day: DAY_PALETTE,
};

export const DEFAULT_THEME_ID: ThemeId = "day";
