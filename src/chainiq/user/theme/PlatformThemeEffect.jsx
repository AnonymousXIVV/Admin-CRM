import { useEffect } from 'react';
import { usePlatformSettings } from '../../platformDefaults';
import { applyPlatformTheme } from './applyPlatformTheme';

/**
 * Applies admin theme colors to document CSS variables for every User UI route.
 */
export default function PlatformThemeEffect() {
  const settings = usePlatformSettings();

  useEffect(() => {
    applyPlatformTheme(settings);
  }, [settings]);

  return null;
}
