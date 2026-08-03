export type Ground = "dark" | "light";

export interface Theme {
  name: string;
  ground: Ground;
  /** [primary, support, signal] */
  colors: [string, string, string];
  bg?: string;
  surface?: string;
  side?: string;
  sunken?: string;
}

export const BUILT_IN_THEMES: Theme[] = [
  { name: "Nocturne", ground: "dark", colors: ["#7c4dff", "#00e5c0", "#ff5252"], bg: "#161826", surface: "#232532", side: "#1b1d2c", sunken: "#12131f" },
  { name: "Vapor", ground: "dark", colors: ["#ff4081", "#7c4dff", "#ffab00"], bg: "#130f1c", surface: "#211a30", side: "#181125", sunken: "#0e0a16" },
  { name: "Cobalt", ground: "dark", colors: ["#2979ff", "#00e5ff", "#ff6e40"], bg: "#0a1120", surface: "#13203a", side: "#0d1729", sunken: "#070d18" },
  { name: "Terminal", ground: "dark", colors: ["#aeea00", "#00e676", "#ffd600"], bg: "#0c0e0c", surface: "#171a17", side: "#101210", sunken: "#070806" },
  { name: "Daylight", ground: "light", colors: ["#6200ee", "#00bfa5", "#ff3d00"], bg: "#f3f2ef", surface: "#ffffff", side: "#eceae5", sunken: "#e4e2dd" },
];

const DARK_NEUTRALS = ["#f3f5fe", "#e4e7f5", "#cfd3e5", "#b2b6ca", "#9397ab", "#75798c", "#595d6c", "#3f424d", "#292b31"];
const LIGHT_NEUTRALS = ["#2a2a30", "#3a3a42", "#4d4d56", "#66666f", "#8a8a92", "#adadb4", "#cfcfd3", "#e6e5e1", "#f0efec"];

function relativeLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ground colors for user-built themes, derived from the primary (spec formulas). */
function derivedGrounds(c1: string, ground: Ground) {
  return ground === "dark"
    ? {
        bg: `color-mix(in oklab, ${c1} 10%, #101119)`,
        surface: `color-mix(in oklab, ${c1} 9%, #1e1f28)`,
        side: `color-mix(in oklab, ${c1} 10%, #16171f)`,
        sunken: `color-mix(in oklab, ${c1} 6%, #0b0c12)`,
      }
    : {
        bg: `color-mix(in oklab, ${c1} 5%, #f5f4f1)`,
        surface: "#ffffff",
        side: `color-mix(in oklab, ${c1} 7%, #edecea)`,
        sunken: `color-mix(in oklab, ${c1} 9%, #e3e2e0)`,
      };
}

/**
 * Compute the ~40 CSS custom properties a theme writes to the document root.
 * Tonal ramps and Material roles are declared once in globals.css with
 * color-mix() over these base tokens, so they update automatically.
 */
export function computeThemeVars(theme: Theme): Record<string, string> {
  const [c1, c2, c3] = theme.colors;
  const grounds = {
    bg: theme.bg, surface: theme.surface, side: theme.side, sunken: theme.sunken,
    ...(theme.bg ? {} : derivedGrounds(c1, theme.ground)),
  };
  const dark = theme.ground === "dark";
  const neutrals = dark ? DARK_NEUTRALS : LIGHT_NEUTRALS;
  const text = dark ? "#e9e9ed" : "#1b1b21";
  const vars: Record<string, string> = {
    "--color-accent": c1,
    "--color-accent-2": c2,
    "--color-signal": c3,
    "--warn": c3,
    "--color-bg": grounds.bg!,
    "--color-surface": grounds.surface!,
    "--side-bg": grounds.side!,
    "--sunken": grounds.sunken!,
    "--color-text": text,
    "--color-divider": `color-mix(in srgb, ${text} ${dark ? 16 : 14}%, transparent)`,
    "--on-accent": relativeLuminance(c1) > 0.45 ? "#141414" : "#ffffff",
    "--accent-container": dark
      ? `color-mix(in oklab, black 58%, ${c1})`
      : `color-mix(in oklab, white 80%, ${c1})`,
    "--on-accent-container": dark
      ? `color-mix(in oklab, white 72%, ${c1})`
      : `color-mix(in oklab, black 60%, ${c1})`,
    "--surface-variant": `color-mix(in oklab, ${c1} ${dark ? 11 : 7}%, ${grounds.surface})`,
    "--color-accent-text": dark
      ? `color-mix(in oklab, white 58%, ${c1})`
      : `color-mix(in oklab, black 36%, ${c1})`,
    "--shadow-sm": dark
      ? "0 1px 2px rgba(0,0,0,.30), 0 1px 3px 1px rgba(0,0,0,.14)"
      : "0 1px 2px rgba(27,27,33,.10), 0 1px 3px 1px rgba(27,27,33,.10)",
    "--shadow-md": dark
      ? "0 1px 2px rgba(0,0,0,.30), 0 4px 8px 3px rgba(0,0,0,.16)"
      : "0 1px 2px rgba(27,27,33,.12), 0 4px 8px 3px rgba(27,27,33,.12)",
    "--shadow-lg": dark
      ? "0 2px 3px rgba(0,0,0,.30), 0 8px 16px 6px rgba(0,0,0,.18)"
      : "0 2px 3px rgba(27,27,33,.14), 0 8px 16px 6px rgba(27,27,33,.14)",
  };
  neutrals.forEach((c, i) => (vars[`--color-neutral-${(i + 1) * 100}`] = c));
  return vars;
}

export function applyThemeVars(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}
