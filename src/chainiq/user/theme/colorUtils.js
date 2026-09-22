/**
 * Color helpers for admin-driven theme tokens and accessible contrast.
 */

const HEX_RE = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;

const LIGHT_TEXT = '#F9FAFB';
const DARK_TEXT = '#111827';
const LIGHT_SURFACE_FALLBACK = '#FFFFFF';
const DARK_SURFACE_FALLBACK = '#1E2026';

export function parseHex(color) {
  if (!color || typeof color !== 'string') return null;
  const trimmed = color.trim();
  const short = /^#?([a-f\d])([a-f\d])([a-f\d])$/i.exec(trimmed);
  if (short) {
    const [, r, g, b] = short;
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
    };
  }
  const match = HEX_RE.exec(trimmed);
  if (!match) return null;
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

export function toHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function mixColors(a, b, weight = 0.5) {
  const c1 = parseHex(a);
  const c2 = parseHex(b);
  if (!c1) return b || a || '#000000';
  if (!c2) return a;
  const w = Math.max(0, Math.min(1, weight));
  return toHex({
    r: c1.r * (1 - w) + c2.r * w,
    g: c1.g * (1 - w) + c2.g * w,
    b: c1.b * (1 - w) + c2.b * w,
  });
}

export function lighten(hex, amount = 0.12) {
  return mixColors(hex, '#ffffff', amount);
}

export function darken(hex, amount = 0.12) {
  return mixColors(hex, '#000000', amount);
}

export function withAlpha(hex, alpha = 1) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

export function relativeLuminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(rgb.r);
  const g = channel(rgb.g);
  const b = channel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDarkColor(hex) {
  return relativeLuminance(hex) < 0.35;
}

export function contrastRatio(a, b) {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick light or dark text that reads on `bg`. */
export function contrastText(bg, light = LIGHT_TEXT, dark = DARK_TEXT) {
  const lightRatio = contrastRatio(bg, light);
  const darkRatio = contrastRatio(bg, dark);
  if (lightRatio >= darkRatio) return light;
  return dark;
}

/** Prefer `preferred` on `bg`; fall back to best-contrast neutral. */
export function pickReadableText(bg, preferred, light = LIGHT_TEXT, dark = DARK_TEXT, minRatio = 4.5) {
  if (preferred && contrastRatio(bg, preferred) >= minRatio) return preferred;
  return contrastText(bg, light, dark);
}

/** Nudge `color` away from `bg` until they are visually distinct (surfaces). */
export function ensureDistinct(color, bg, minRatio = 1.12) {
  let current = color;
  for (let i = 0; i < 10; i += 1) {
    if (contrastRatio(current, bg) >= minRatio) return current;
    current = relativeLuminance(current) >= relativeLuminance(bg)
      ? darken(current, 0.08)
      : lighten(current, 0.08);
  }
  return current;
}

/** Muted label on a background - mix toward a neutral mid-tone for readability. */
export function mutedText(text, bg, amount = 0.42) {
  return mixColors(text, bg, amount);
}

/**
 * Secondary/muted copy on a card surface with guaranteed minimum contrast.
 */
export function softTextOnSurface(baseText, surface, isDarkBg, minRatio = 4) {
  const anchor = isDarkBg ? mixColors(baseText, surface, 0.38) : mixColors(baseText, '#4B5563', 0.72);
  return pickReadableText(surface, anchor, LIGHT_TEXT, '#374151', minRatio);
}

/**
 * Caption/muted copy on page background.
 */
export function mutedOnBackground(baseText, bg, isDarkBg, minRatio = 3.2) {
  const anchor = isDarkBg ? mutedText(baseText, bg, 0.52) : mixColors(baseText, '#6B7280', 0.55);
  return pickReadableText(bg, anchor, LIGHT_TEXT, '#6B7280', minRatio);
}

/**
 * Fix admin palette combos where background and secondary/text disagree (e.g. light bg + dark card hex).
 */
export function normalizeThemeColors(settings = {}) {
  const bg = settings.backgroundColor;
  if (!bg || !parseHex(bg)) return settings;

  const isDarkBg = isDarkColor(bg);
  const out = { ...settings };

  if (isDarkBg) {
    if (out.secondaryColor && !isDarkColor(out.secondaryColor)) {
      out.secondaryColor = darken(bg, 0.1);
    }
    if (out.textColor && relativeLuminance(out.textColor) < 0.45) {
      out.textColor = LIGHT_TEXT;
    }
  } else {
    if (!out.secondaryColor || isDarkColor(out.secondaryColor)) {
      out.secondaryColor = mixColors(LIGHT_SURFACE_FALLBACK, bg, 0.08);
    }
    if (!out.textColor || relativeLuminance(out.textColor) > 0.72) {
      out.textColor = DARK_TEXT;
    }
    const btn = out.buttonColor || out.primaryColor;
    if (btn && contrastRatio(btn, bg) < 3) {
      out.buttonColor = out.primaryColor || DARK_TEXT;
    }
  }

  return out;
}
