import { DEFAULT_PLATFORM_SETTINGS } from '../../platformDefaults';
import {
  contrastRatio,
  contrastText,
  darken,
  ensureDistinct,
  isDarkColor,
  lighten,
  mixColors,
  mutedOnBackground,
  normalizeThemeColors,
  pickReadableText,
  softTextOnSurface,
  withAlpha,
} from './colorUtils';

/**
 * Maps admin platform color settings onto CSS custom properties for the User UI.
 * Consumer styles must use --ui-* tokens (never hardcoded hex in components).
 */
export function applyPlatformTheme(settings = {}) {
  if (typeof document === 'undefined') return;

  const merged = normalizeThemeColors({ ...DEFAULT_PLATFORM_SETTINGS, ...settings });
  const root = document.documentElement;

  const bg = merged.backgroundColor;
  const primary = merged.primaryColor;
  const accent = merged.accentColor;
  const button = merged.buttonColor;
  const text = merged.textColor;
  const isDarkBg = isDarkColor(bg);

  let surface = merged.secondaryColor;
  if (isDarkBg) {
    if (!surface || !isDarkColor(surface)) {
      surface = darken(bg, 0.1);
    }
    surface = ensureDistinct(surface, bg, 1.12);
    if (contrastRatio(surface, bg) < 1.08) {
      surface = lighten(bg, 0.14);
    }
  } else {
    if (!surface || isDarkColor(surface)) {
      surface = mixColors('#FFFFFF', bg, 0.06);
    }
    surface = ensureDistinct(surface, bg, 1.06);
    if (contrastRatio(surface, bg) < 1.05) {
      surface = darken(bg, 0.05);
    }
  }

  const surfaceHi = isDarkBg ? lighten(surface, 0.1) : darken(surface, 0.06);
  const surfaceDeep = isDarkBg ? darken(bg, 0.06) : lighten(bg, 0.03);

  let inputBg = isDarkBg
    ? ensureDistinct(mixColors(surface, bg, 0.35), bg, 1.1)
    : ensureDistinct(mixColors('#FFFFFF', surface, 0.35), bg, 1.04);
  if (!isDarkBg && contrastRatio(inputBg, bg) < 1.03) {
    inputBg = '#FFFFFF';
  }
  const inputBgHover = isDarkBg ? lighten(inputBg, 0.06) : darken(inputBg, 0.04);

  let border = ensureDistinct(mixColors(surface, bg, isDarkBg ? 0.45 : 0.55), bg, 1.08);
  if (!isDarkBg && contrastRatio(border, bg) < 1.15) {
    border = darken(mixColors(surface, '#94A3B8', 0.35), 0.08);
  }
  const borderHi = isDarkBg ? lighten(border, 0.12) : darken(border, 0.1);

  const textOnBg = pickReadableText(bg, text, undefined, undefined, 4.5);
  const textOnSurface = pickReadableText(surface, text, undefined, undefined, 4.5);
  const textSoft = softTextOnSurface(textOnSurface, surface, isDarkBg, 4);
  const textMuted = mutedOnBackground(textOnBg, bg, isDarkBg, 3.2);
  const menuMuted = softTextOnSurface(textOnSurface, surface, isDarkBg, 3.5);

  const accentStrong = isDarkBg ? lighten(accent, 0.14) : darken(accent, 0.1);
  const primaryStrong = isDarkBg ? lighten(primary, 0.14) : darken(primary, 0.1);

  const buttonText = contrastText(button);
  const accentText = contrastText(accent);
  const primaryText = contrastText(primary);

  const focusRing = withAlpha(accent, isDarkBg ? 0.38 : 0.28);
  const accentTint = withAlpha(accent, isDarkBg ? 0.12 : 0.2);
  const accentTintStrong = withAlpha(accent, isDarkBg ? 0.45 : 0.38);
  const navActiveBg = isDarkBg
    ? withAlpha(accent, 0.12)
    : mixColors(withAlpha(accent, 0.14), surface, 0.55);
  const navActiveText = pickReadableText(navActiveBg, text, undefined, undefined, 4.5);
  const hoverOverlay = isDarkBg ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.06)';
  const withdraw = '#F6465D';
  const withdrawHover = lighten(withdraw, 0.08);
  const onWithdraw = '#FFFFFF';

  const shadowMd = isDarkBg
    ? '0 4px 8px rgba(0, 0, 0, 0.15)'
    : '0 2px 8px rgba(15, 23, 42, 0.08)';
  const shadowLg = isDarkBg
    ? '0 8px 16px rgba(0, 0, 0, 0.2)'
    : '0 8px 24px rgba(15, 23, 42, 0.1)';

  const pairs = {
    '--color-surface-0': bg,
    '--color-primary-dark': bg,
    '--color-primary-darker': surfaceDeep,
    '--color-surface-1': surface,
    '--color-surface-2': surfaceHi,
    '--color-surface-3': surfaceHi,
    '--color-surface-hover': surfaceHi,
    '--color-primary-yellow': primary,
    '--color-accent-yellow': accent,
    '--color-accent-yellow-strong': accentStrong,
    '--color-button': button,
    '--color-text-primary': textOnBg,
    '--color-text-secondary': textSoft,
    '--color-text-tertiary': textMuted,
    '--color-border-primary': border,
    '--color-border-secondary': borderHi,
    '--color-border-subtle': mixColors(bg, surface, 0.5),

    '--ui-bg': bg,
    '--ui-surface': surface,
    '--ui-surface-hover': surfaceHi,
    '--ui-surface-deep': surfaceDeep,
    '--ui-input-bg': inputBg,
    '--ui-input-bg-hover': inputBgHover,
    '--ui-border': border,
    '--ui-border-strong': borderHi,
    '--ui-primary': primary,
    '--ui-primary-strong': primaryStrong,
    '--ui-accent': accent,
    '--ui-accent-strong': accentStrong,
    '--ui-button': button,
    '--ui-button-text': buttonText,
    '--ui-primary-text': primaryText,
    '--ui-on-accent': accentText,
    '--ui-text': textOnBg,
    '--ui-text-on-surface': textOnSurface,
    '--ui-text-soft': textSoft,
    '--ui-text-muted': textMuted,
    '--ui-menu-text': menuMuted,
    '--ui-menu-text-hover': textOnSurface,
    '--ui-focus-ring': focusRing,
    '--ui-accent-tint': accentTint,
    '--ui-accent-tint-strong': accentTintStrong,
    '--ui-nav-active-bg': navActiveBg,
    '--ui-nav-active-text': navActiveText,
    '--ui-hover-overlay': hoverOverlay,
    '--ui-overlay': isDarkBg ? 'rgba(0, 0, 0, 0.72)' : 'rgba(15, 23, 42, 0.45)',
    '--ui-surface-glass': withAlpha(surface, isDarkBg ? 0.88 : 0.97),
    '--shadow-md': shadowMd,
    '--shadow-lg': shadowLg,

    '--ciq-bg': bg,
    '--ciq-surface': surface,
    '--ciq-surface-hi': surfaceHi,
    '--ciq-border': border,
    '--ciq-border-hi': borderHi,
    '--ciq-text': textOnSurface,
    '--ciq-text-soft': textSoft,
    '--ciq-accent': accent,

    '--text': textOnBg,
    '--text-secondary': textSoft,
    '--panel': surface,
    '--border': border,
    '--accent': accent,
    '--bg': bg,
    '--muted': textMuted,
    '--surface': inputBg,

    '--ui-withdraw': withdraw,
    '--ui-withdraw-hover': withdrawHover,
    '--ui-withdraw-text': onWithdraw,

    '--ui-chart-bg': bg,
    '--ui-chart-panel': surface,
    '--ui-chart-grid': withAlpha(border, 0.65),
    '--ui-chart-toolbar': surfaceDeep,
  };

  Object.entries(pairs).forEach(([name, value]) => {
    if (value != null && value !== '') {
      root.style.setProperty(name, value);
    }
  });

  root.classList.add('user-theme-active');
  root.dataset.themeMode = isDarkBg ? 'dark' : 'light';
  window.dispatchEvent(new CustomEvent('platform-theme-updated', { detail: { isDarkBg, settings: merged } }));
}

export { normalizeThemeColors };
