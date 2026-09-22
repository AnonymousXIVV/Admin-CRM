import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for platform defaults.
//
// These values represent the original Chain-IQ visual identity. They are
// used ONLY as the initial state before the backend responds and as the
// target for "Revert to Default Design". They are NEVER persisted to
// localStorage - the database is the only persistent store.
// ---------------------------------------------------------------------------

export const DEFAULT_PLATFORM_SETTINGS = Object.freeze({
  // Identity
  platformName: 'Chain-IQ',
  platformAbbreviation: 'CIQ',
  cardBrandName: 'Chain-IQ',
  cardBrandFollowsPlatformName: false,
  platformYear: '2025',

  // Contact
  platformPhone: '+1 (555) 123-4567',
  platformAddress: '123 Blockchain Street, Crypto City, CC 12345',
  supportEmail: 'support@chain-iq.com',

  // Hero (landing page)
  heroHeader: 'The next-gen\ncrypto wallet.\nPowered by insights.',
  heroStatement:
    'Real-time market analytics, DeFi tools, and seamless cross-chain swaps in one non-custodial wallet.',

  // Currency
  baseCurrency: 'USD',

  // Toggles
  registrationEnabled: true,
  kycRequiredForWithdrawals: true,
  twoFactorAuthEnabled: true,
  sessionTimeoutMinutes: 30,
  maxFailedLoginAttempts: 5,

  // Color scheme - the original Chain-IQ identity
  primaryColor: '#F0B90B',
  secondaryColor: '#1E2026',
  accentColor: '#F0B90B',
  buttonColor: '#F0B90B',
  backgroundColor: '#0a0a0f',
  textColor: '#F9FAFB',

  // Card tier display names
  cardTypes: {
    platinum: { name: 'Platinum' },
    gold: { name: 'Gold' },
    premium: { name: 'Premium' },
    virtual: { name: 'Virtual' },
    silver: { name: 'Silver' },
  },

  // Fee schedule
  userFees: {
    depositFee: 0,
    withdrawalFee: 1,
    tradingFee: 0.1,
    cardIssuanceFee: 0,
    cardMaintenanceFee: 0,
  },

  // Per-client fee overrides { [clientId]: { depositFee, ... } }
  clientFees: {},

  // Custom color palettes saved by the admin
  customThemes: [],

  // Deposit asset whitelist - only tickers in this array appear in the client
  // deposit dropdown. An empty array or missing key means ALL assets are shown.
  availableDepositAssets: [
    'BTC','ETH','USDT','TRX','BNB','USDC','SOL','XRP','ADA','DOGE','MATIC',
    'DOT','AVAX','LINK','UNI','LTC','BCH','XLM','FIL','NEAR',
  ],
});

/**
 * Merge overrides on top of the canonical defaults so every consumer sees
 * a complete settings object regardless of what the database contains.
 */
export const mergePlatformSettings = (overrides = {}) => ({
  ...DEFAULT_PLATFORM_SETTINGS,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Backend-driven module singleton.
//
// This is the only in-memory store for platform settings at runtime.
// It starts as null (not yet loaded), is populated by the first fetch from
// the backend, and is updated whenever the admin saves new settings.
//
// NO localStorage is used here. The database is the authoritative store.
// ---------------------------------------------------------------------------

let _settings = null;
const _listeners = new Set();
let _syncInProgress = false;

function _notifyAll() {
  _listeners.forEach((fn) => fn());
}

/**
 * Update the in-memory singleton and notify all React subscribers.
 * Called after a successful backend fetch or after the admin saves settings.
 * This propagates the change instantly to every component that calls
 * usePlatformSettings(), across the entire tab, with no page reload.
 */
export const updateLocalSettingsState = (settings) => {
  _settings = mergePlatformSettings(settings);
  _notifyAll();
};

/**
 * Fetch the current settings from the public backend endpoint and update
 * the module singleton. Idempotent - concurrent calls are collapsed.
 */
export const syncSettingsFromBackend = async () => {
  if (_syncInProgress) return;
  _syncInProgress = true;
  try {
    const res = await fetch('/api/platform/settings');
    if (res.ok) {
      const data = await res.json();
      if (data?.settings && typeof data.settings === 'object') {
        updateLocalSettingsState(data.settings);
      }
    }
  } catch {
    // Network error - module singleton keeps its current value (defaults).
  } finally {
    _syncInProgress = false;
  }
};

/**
 * Save settings to the backend API using the admin JWT.
 * On success, updates the module singleton so all subscribers re-render.
 *
 * Returns { ok: true, settings } on success, { ok: false } on failure.
 */
export const saveSettingsToApi = async (settings, adminToken) => {
  try {
    const res = await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      },
      body: JSON.stringify(settings),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[platformDefaults] API save failed:', err);
      return { ok: false };
    }
    const data = await res.json();
    if (data?.settings) {
      updateLocalSettingsState(data.settings);
    }
    return { ok: true, settings: data?.settings ?? settings };
  } catch (err) {
    console.warn('[platformDefaults] API save error:', err);
    return { ok: false };
  }
};

/**
 * Fetch settings from the admin-auth endpoint (used by the admin Settings
 * form to load the authoritative values on mount).
 */
export const fetchAdminSettings = async (adminToken) => {
  try {
    const res = await fetch('/api/admin/settings', {
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.settings ?? null;
  } catch {
    return null;
  }
};

/**
 * Fetch settings change history from the backend.
 * Returns the history array or [] on failure.
 */
export const fetchSettingsHistory = async (adminToken, { limit = 50, offset = 0 } = {}) => {
  try {
    const url = `/api/admin/settings/history?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: adminToken ? { Authorization: `Bearer ${adminToken}` } : {},
    });
    if (!res.ok) return { history: [], total: 0 };
    return await res.json();
  } catch {
    return { history: [], total: 0 };
  }
};

// ---------------------------------------------------------------------------
// useSyncExternalStore wiring
// ---------------------------------------------------------------------------

function _subscribe(notify) {
  _listeners.add(notify);
  return () => _listeners.delete(notify);
}

function _getSnapshot() {
  return _settings ?? DEFAULT_PLATFORM_SETTINGS;
}

function _getServerSnapshot() {
  return DEFAULT_PLATFORM_SETTINGS;
}

/**
 * Read the current platform settings. Every component that calls this hook
 * automatically re-renders whenever the settings are updated - whether from
 * a backend fetch on startup, an admin save in the same tab, or any direct
 * call to updateLocalSettingsState().
 *
 * The hook kicks off a backend fetch on first mount so the data is always
 * fresh from the database, regardless of any prior state.
 */
export const usePlatformSettings = () => {
  const settings = useSyncExternalStore(_subscribe, _getSnapshot, _getServerSnapshot);

  useEffect(() => {
    syncSettingsFromBackend();
  }, []);

  return settings;
};
