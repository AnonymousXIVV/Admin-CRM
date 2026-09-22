
import React, { createContext, useState, useEffect, useRef, useCallback } from 'react';
import { authLogin, submitSignupRequest, verifySignupCode, authMe, authLogoutEverywhere, clearClientToken, readClientToken, readAdminToken, onSessionExpired, getCryptoData, getTradfiAssets, getTransactionData, getCardData, cardFreeze as apiCardFreeze, cardBlock as apiCardBlock, cardSetPin as apiCardSetPin, cardSetLimits as apiCardSetLimits, getNotifications, markAllNotificationsRead as apiMarkAllNotificationsRead, markNotificationRead as apiMarkNotificationRead, changeAccountPassword, getLead, getAdminPreviewTransactions, getAdminPreviewCards, submitKyc as apiSubmitKyc, submitKycForUser as apiSubmitKycForUser, getKycStatus as apiGetKycStatus, getKycStatusForUser as apiGetKycStatusForUser, getClientMessages, markClientMessagesRead, getClientPreferences, setClientPreferences, mapBackendBalances } from '../../api';
import { usePlatformSettings } from '../../platformDefaults';
import { formatCurrency } from '../utils';
import { tradfiSeedAssets } from '../../shared/tradfiCatalog';

const COINGECKO_IDS = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2',
  DOT: 'polkadot', LINK: 'chainlink', MATIC: 'matic-network', LTC: 'litecoin',
  USDT: 'tether', USDC: 'usd-coin', UNI: 'uniswap',
  TRX: 'tron', BCH: 'bitcoin-cash', XLM: 'stellar', FIL: 'filecoin', NEAR: 'near',
};

// Centralized default user settings
const DEFAULT_USER_SETTINGS = {
  name: '',
  email: '',
  currency: 'USD',
  timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
  showCardBalance: true,
  onlineStatus: true,
  priceAlertEnabled: false,
  priceAlertAsset: null,
  priceAlertLastPrice: 0,
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  securityAlerts: true,
  transactionAlerts: true,
  priceAlerts: false,
  newsletter: false,
  emailDelivery: true,
  pushDelivery: true,
};

function normalizeNotificationPrefs(raw) {
  const merged = { ...DEFAULT_NOTIFICATION_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
  if (typeof merged.priceAlerts === 'boolean') {
    merged.priceAlertEnabled = merged.priceAlerts;
  } else if (typeof merged.priceAlertEnabled === 'boolean') {
    merged.priceAlerts = merged.priceAlertEnabled;
  }
  return merged;
}

function sortCardsByStackOrder(cards, orderIds) {
  if (!Array.isArray(cards) || cards.length === 0) return cards || [];
  if (!Array.isArray(orderIds) || orderIds.length === 0) return cards;
  const map = new Map(cards.map((c) => [c.id, c]));
  const ordered = orderIds.map((id) => map.get(id)).filter(Boolean);
  const rest = cards.filter((c) => !orderIds.includes(c.id));
  return [...ordered, ...rest];
}

export const DataContext = createContext();

const getBalanceValue = (balances, asset) => {
  if (!balances || !asset) return 0;
  const candidates = [asset.id, asset.ticker, asset.ticker?.toLowerCase(), asset.asset, asset.asset?.toLowerCase()].filter(Boolean);
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(balances, key)) {
      const value = Number(balances[key]);
      return Number.isFinite(value) ? value : 0;
    }
  }
  return 0;
};

export const DataProvider = ({ children }) => {
  const [cryptoDataState, setCryptoDataState] = useState([]);
  // Render the static catalog immediately; live prices replace these rows in
  // the background so market filters never wait on an external provider.
  const [tradfiAssetsState, setTradfiAssetsState] = useState(() => tradfiSeedAssets());
  const [transactionDataState, setTransactionDataState] = useState([]);
  const [cardDataState, setCardDataState] = useState([]);
  const [notificationsDataState, setNotificationsDataState] = useState([]);
  // Live count of unread agent→client chat messages, polled every few
  // seconds so the bell badge + Support nav badge stay current even when
  // the user isn't sitting on the Support page.
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [supportLastUpdate, setSupportLastUpdate] = useState(null);
  const [topCardId, setTopCardIdState] = useState(null);
  const [shuffleMode, setShuffleMode] = useState(null); // 'shuffle', 'reorder', or null
  const [dismissedBannersState, setDismissedBannersState] = useState([]);
  const [notificationSettingsState, setNotificationSettingsState] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [userSettingsState, setUserSettingsState] = useState(() => {
    try {
      const saved = localStorage.getItem('chainiq_currency');
      if (saved && typeof saved === 'string') return { currency: saved };
    } catch (_) {}
    return {};
  });

  // 7-day daily closes per crypto ticker - used to render sparklines in the
  // asset table. Fetched once on first load then refreshed every 6 hours.
  // Shape: { BTC: [p0, p1, ..., p6], ETH: [...], ... }
  const [cryptoSparklinesState, setCryptoSparklinesState] = useState({});
  useEffect(() => {
    if (cryptoDataState.length === 0) return;

    const tickers = cryptoDataState.map(a => a.ticker).filter(Boolean).join(',');
    if (!tickers) return;

    let cancelled = false;
    const fetchSparklines = async () => {
      try {
        const res = await fetch(`/api/market/crypto-sparklines?tickers=${encodeURIComponent(tickers)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.sparklines && !cancelled) setCryptoSparklinesState(data.sparklines);
      } catch (_) {}
    };
    fetchSparklines();
    const t = setInterval(fetchSparklines, 6 * 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [cryptoDataState.length]);

  // Live fiat FX rates (base USD). Fetched from Frankfurter (free, no key).
  // Fallback values keep the UI usable if the network request fails.
  const [fxRates, setFxRates] = useState({ USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.55 });
  useEffect(() => {
    let cancelled = false;
    const fetchRates = async () => {
      try {
        const res = await fetch('/api/market/fx-rates');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data?.rates && !cancelled) {
          setFxRates({ USD: 1, ...data.rates });
        }
      } catch (_) {}
    };
    fetchRates();
    const t = setInterval(fetchRates, 60 * 60 * 1000); // refresh every hour
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  // Convert a USD amount to the user's chosen display currency and format it.
  const formatBalance = useCallback((usdAmount) => {
    const currency = userSettingsState.currency || 'USD';
    const rate = fxRates[currency] ?? 1;
    return formatCurrency((usdAmount || 0) * rate, currency);
  }, [userSettingsState.currency, fxRates]);

  // Platform settings (brand, colors, hero copy, etc.) live in an external
  // store backed by localStorage and the platform-settings event bus. We
  // subscribe via the hook so the CSS-variable effect below repaints the
  // moment ANY caller (admin Settings page, another tab, etc.) saves.
  // Components that need to read these settings should call usePlatformSettings()
  // directly - the user DataContext intentionally does NOT re-expose them
  // (single source of truth, no two contexts to keep in sync).
  const platformSettingsState = usePlatformSettings();

  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = localStorage.getItem('chainiq_current_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Per-account preferences (favorited assets, top card, dismissed
  // banners, etc.) backed by /api/client/preferences. Hydrated after a
  // JWT-backed session is available; reset on logout. A SINGLE debounced
  // PUT covers every key so a flurry of changes (toggle a star, click a
  // card, dismiss a banner in quick succession) collapses into one
  // round-trip instead of three.
  const [cryptoFavoritesState, setCryptoFavoritesState] = useState([]);
  const prefsHydratedForUserRef = useRef(null);
  const prefsPutTimerRef = useRef(null);
  // Latest values mirrored into refs so the debounced flush always reads
  // the freshest snapshot, even if multiple setters fired before the
  // timer expired.
  const cryptoFavoritesRef = useRef([]);
  const topCardIdRef = useRef(null);
  const cardStackOrderRef = useRef([]);
  const dismissedBannersRef = useRef([]);
  const notificationSettingsRef = useRef(DEFAULT_NOTIFICATION_SETTINGS);
  const currencyRef = useRef('USD');
  const timezoneRef = useRef(DEFAULT_USER_SETTINGS.timezone);
  const onlineStatusRef = useRef(DEFAULT_USER_SETTINGS.onlineStatus);
  const priceAlertEnabledRef = useRef(DEFAULT_USER_SETTINGS.priceAlertEnabled);
  const priceAlertAssetRef = useRef(DEFAULT_USER_SETTINGS.priceAlertAsset);
  const showCardBalanceRef = useRef(DEFAULT_USER_SETTINGS.showCardBalance);
  // Mirror "is this a real, JWT-backed session?" into a ref so the
  // debounced flush can check it without closing over a stale render.
  const isRealSessionRef = useRef(false);

  const [authError, setAuthError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  // Set to { kind: 'expired' | 'disabled', at: <ts> } when an authenticated
  // backend call comes back 401/403. The SessionExpiredToast (mounted at the
  // App root) reads this and shows a graceful "please sign in again" toast.
  const [sessionNotice, setSessionNotice] = useState(null);

  const dismissSessionNotice = () => setSessionNotice(null);

  // Subscribe to the API client's session-expired channel. Real (non-
  // impersonated) sessions get cleared so the route guard bounces the user
  // to /login. Impersonated sessions are admin-driven and have no JWT, so
  // they're left alone.
  useEffect(() => {
    const off = onSessionExpired((reason) => {
      setCurrentUser((prev) => (prev?.impersonated ? prev : null));
      try { localStorage.removeItem('chainiq_current_user'); } catch (_) {}
      setSessionNotice({ kind: reason || 'expired', at: Date.now() });
    });
    return off;
  }, []);

  // Restore session from localStorage, then revalidate the JWT against the
  // backend so a disabled / expired session is dropped immediately.
  // Note: the simulated-users dataset is no longer cached client-side -
  // it now comes exclusively from /api/admin/users for admin views.
  useEffect(() => {
    const storedCurrentUser = localStorage.getItem('chainiq_current_user');

    if (storedCurrentUser) {
      try {
        setCurrentUser(JSON.parse(storedCurrentUser));
      } catch {
        localStorage.removeItem('chainiq_current_user');
      }
    }

    // Best-effort: if there's a client JWT, ask the backend who we are.
    // Don't disturb impersonation sessions (those are admin-driven, no token).
    (async () => {
      try {
        const me = await authMe();
        if (me) {
          setCurrentUser(prev => (prev?.impersonated ? prev : me));
        }
      } catch (_) {
        // Network hiccup - leave whatever is in localStorage alone.
      }
    })();
  }, []);

  // Hydrate per-account preferences (favorites, top card, dismissed
  // banners, etc.) from the database whenever a real (non-impersonated)
  // JWT-backed session becomes active. Reset to empty on logout /
  // impersonation so one user's prefs never bleed into another's UI.
  useEffect(() => {
    const userId = currentUser?.id || null;
    const isReal = !!userId && !currentUser?.impersonated && !!readClientToken();
    isRealSessionRef.current = isReal;

    if (!isReal) {
      // Cancel any in-flight debounced PUT and reset every pref slot.
      if (prefsPutTimerRef.current) {
        clearTimeout(prefsPutTimerRef.current);
        prefsPutTimerRef.current = null;
      }
      prefsHydratedForUserRef.current = null;
      cryptoFavoritesRef.current = [];
      topCardIdRef.current = null;
      cardStackOrderRef.current = [];
      dismissedBannersRef.current = [];
      notificationSettingsRef.current = DEFAULT_NOTIFICATION_SETTINGS;
      setNotificationSettingsState(DEFAULT_NOTIFICATION_SETTINGS);
      setCryptoFavoritesState([]);
      setTopCardIdState(null);
      setDismissedBannersState([]);
      return;
    }

    if (prefsHydratedForUserRef.current === userId) return;
    prefsHydratedForUserRef.current = userId;

    let cancelled = false;
    (async () => {
      try {
        const prefs = await getClientPreferences();
        if (cancelled) return;
        const favs = Array.isArray(prefs?.cryptoFavorites) ? prefs.cryptoFavorites : [];
        const tc = typeof prefs?.topCardId === 'string' ? prefs.topCardId : null;
        const banners = Array.isArray(prefs?.dismissedBanners)
          ? prefs.dismissedBanners.filter((b) => typeof b === 'string')
          : [];
        // Update refs first so any setter racing the hydration doesn't
        // overwrite the freshly loaded value with a stale ref snapshot.
        const currency = typeof prefs?.currency === 'string' && prefs.currency ? prefs.currency : 'USD';
        cryptoFavoritesRef.current = favs;
        topCardIdRef.current = tc;
        dismissedBannersRef.current = banners;
        currencyRef.current = currency;
        try { localStorage.setItem('chainiq_currency', currency); } catch (_) {}
        setCryptoFavoritesState(favs);
        setTopCardIdState(tc);
        setDismissedBannersState(banners);
        const timezone = typeof prefs?.timezone === 'string' && prefs.timezone ? prefs.timezone : DEFAULT_USER_SETTINGS.timezone;
        const onlineStatus = typeof prefs?.onlineStatus === 'boolean' ? prefs.onlineStatus : DEFAULT_USER_SETTINGS.onlineStatus;
        const priceAlertEnabled = typeof prefs?.priceAlertEnabled === 'boolean' ? prefs.priceAlertEnabled : DEFAULT_USER_SETTINGS.priceAlertEnabled;
        const priceAlertAsset = prefs?.priceAlertAsset || DEFAULT_USER_SETTINGS.priceAlertAsset;
        const showCardBalance = typeof prefs?.showCardBalance === 'boolean' ? prefs.showCardBalance : DEFAULT_USER_SETTINGS.showCardBalance;
        timezoneRef.current = timezone;
        onlineStatusRef.current = onlineStatus;
        priceAlertEnabledRef.current = priceAlertEnabled;
        priceAlertAssetRef.current = priceAlertAsset;
        showCardBalanceRef.current = showCardBalance;
        setUserSettingsState(prev => ({ ...prev, currency, timezone, onlineStatus, priceAlertEnabled, priceAlertAsset, showCardBalance }));
        const stack = Array.isArray(prefs?.cardStackOrder)
          ? prefs.cardStackOrder.filter((id) => typeof id === 'string')
          : [];
        cardStackOrderRef.current = stack;

        const nPrefs = normalizeNotificationPrefs(prefs?.notificationSettings);
        notificationSettingsRef.current = nPrefs;
        setNotificationSettingsState(nPrefs);
        if (typeof nPrefs.priceAlerts === 'boolean') {
          priceAlertEnabledRef.current = nPrefs.priceAlerts;
          setUserSettingsState((prev) => ({ ...prev, priceAlertEnabled: nPrefs.priceAlerts }));
        }
      } catch (_) {
        // Network hiccup - leave the defaults in place; the next save
        // will create / update the row.
      }
    })();

    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.impersonated]);

  // Schedule a single debounced PUT that ships the latest snapshot of
  // every pref slot at once. Skips the network call when there is no
  // real session (e.g. impersonation preview, logged-out, no JWT).
  const schedulePrefsSave = () => {
    if (!isRealSessionRef.current) return;
    if (prefsPutTimerRef.current) clearTimeout(prefsPutTimerRef.current);
    prefsPutTimerRef.current = setTimeout(() => {
      prefsPutTimerRef.current = null;
      const nPrefs = normalizeNotificationPrefs(notificationSettingsRef.current);
      setClientPreferences({
        cryptoFavorites: cryptoFavoritesRef.current,
        topCardId: topCardIdRef.current,
        cardStackOrder: cardStackOrderRef.current,
        dismissedBanners: dismissedBannersRef.current,
        currency: currencyRef.current,
        notificationSettings: nPrefs,
        timezone: timezoneRef.current,
        onlineStatus: onlineStatusRef.current,
        priceAlertEnabled: priceAlertEnabledRef.current,
        priceAlertAsset: priceAlertAssetRef.current,
        showCardBalance: showCardBalanceRef.current,
      }).catch((err) => {
        console.warn('[DataContext] could not save preferences:', err?.message || err);
      });
    }, 500);
  };

  // Public setter used by the favorites UI. Updates state immediately
  // for a snappy click and schedules a debounced PUT.
  const setCryptoFavorites = (next) => {
    const value = Array.isArray(next) ? next : [];
    cryptoFavoritesRef.current = value;
    setCryptoFavoritesState(value);
    schedulePrefsSave();
  };

  // Wraps useState's setTopCardId so picking a card on one device shows
  // up on every other device on next reload. Accepts either a value or a
  // (prev) => next updater, matching React's setState contract.
  const setTopCardId = (next) => {
    setTopCardIdState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      topCardIdRef.current = value;
      schedulePrefsSave();
      return value;
    });
  };

  // Banner-dismissal helpers. `dismissedBanners` is a stable list of
  // string ids - any UI surface that wants a "show once, then never
  // again" hint just calls dismissBanner('my-banner-id') and reads
  // isBannerDismissed('my-banner-id') on render. Persisted across
  // devices via the preferences blob. restoreBanner() is exposed mostly
  // so a future "Reset hints" button in Settings can wipe a single id.
  const isBannerDismissed = (id) => dismissedBannersRef.current.includes(id);

  const dismissBanner = (id) => {
    if (!id || typeof id !== 'string') return;
    if (dismissedBannersRef.current.includes(id)) return;
    const next = [...dismissedBannersRef.current, id];
    dismissedBannersRef.current = next;
    setDismissedBannersState(next);
    schedulePrefsSave();
  };

  const restoreBanner = (id) => {
    if (!id || typeof id !== 'string') return;
    if (!dismissedBannersRef.current.includes(id)) return;
    const next = dismissedBannersRef.current.filter((b) => b !== id);
    dismissedBannersRef.current = next;
    setDismissedBannersState(next);
    schedulePrefsSave();
  };

  // Immediately persists the chosen display currency to the account.
  // Returns a promise so the caller can show a loading/success state.
  const saveCurrencyPreference = async (code) => {
    if (!code || typeof code !== 'string') return;
    currencyRef.current = code;
    setUserSettingsState(prev => ({ ...prev, currency: code }));
    try { localStorage.setItem('chainiq_currency', code); } catch (_) {}
    await setClientPreferences({
      cryptoFavorites: cryptoFavoritesRef.current,
      topCardId: topCardIdRef.current,
      dismissedBanners: dismissedBannersRef.current,
      currency: code,
      notificationSettings: notificationSettingsRef.current,
      timezone: timezoneRef.current,
      onlineStatus: onlineStatusRef.current,
      priceAlertEnabled: priceAlertEnabledRef.current,
      priceAlertAsset: priceAlertAssetRef.current,
      showCardBalance: showCardBalanceRef.current,
    });
  };

  const saveNotificationSettings = async (next) => {
    const value = normalizeNotificationPrefs(next);
    notificationSettingsRef.current = value;
    setNotificationSettingsState(value);
    if (typeof value.priceAlerts === 'boolean') {
      priceAlertEnabledRef.current = value.priceAlerts;
      setUserSettingsState((prev) => ({ ...prev, priceAlertEnabled: value.priceAlerts }));
      if (value.priceAlerts && !priceAlertAssetRef.current) {
        priceAlertAssetRef.current = 'BTC';
        setUserSettingsState((prev) => ({ ...prev, priceAlertAsset: 'BTC' }));
      }
    }
    if (!isRealSessionRef.current) return value;
    await setClientPreferences({
      cryptoFavorites: cryptoFavoritesRef.current,
      topCardId: topCardIdRef.current,
      cardStackOrder: cardStackOrderRef.current,
      dismissedBanners: dismissedBannersRef.current,
      currency: currencyRef.current,
      notificationSettings: value,
      priceAlertEnabled: priceAlertEnabledRef.current,
      priceAlertAsset: priceAlertAssetRef.current || 'BTC',
      priceAlerts: priceAlertEnabledRef.current,
      timezone: timezoneRef.current,
      onlineStatus: onlineStatusRef.current,
      showCardBalance: showCardBalanceRef.current,
    });
    return value;
  };

  const persistCardStackOrder = (cards) => {
    const ids = (cards || []).map((c) => c.id).filter(Boolean);
    cardStackOrderRef.current = ids;
    schedulePrefsSave();
    return ids;
  };

  const saveUserSetting = (key, value) => {
    setUserSettingsState(prev => ({ ...prev, [key]: value }));
    if (key === 'timezone') timezoneRef.current = value;
    else if (key === 'onlineStatus') onlineStatusRef.current = value;
    else if (key === 'priceAlertEnabled') priceAlertEnabledRef.current = value;
    else if (key === 'priceAlertAsset') priceAlertAssetRef.current = value;
    else if (key === 'showCardBalance') showCardBalanceRef.current = value;
    schedulePrefsSave();
  };

  const markOneNotificationRead = async (id) => {
    if (!id || id === '__support_unread__') return;
    if (currentUser?.impersonated) {
      setNotificationsDataState((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      return;
    }
    await apiMarkNotificationRead(id);
    setNotificationsDataState((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  // Persist current user
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('chainiq_current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('chainiq_current_user');
    }
  }, [currentUser]);

  // Sync user settings with current user
  useEffect(() => {
    if (currentUser) {
      setUserSettingsState(prev => ({
        ...prev,
        name: currentUser.name,
        email: currentUser.email,
      }));
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.balances || cryptoDataState.length === 0) return;
    setCryptoDataState(prev => prev.map(asset => ({
      ...asset,
      balance: getBalanceValue(currentUser.balances, asset),
    })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.balances, cryptoDataState.length]);

  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;

    // Users with lead- prefix don't have cards by default
    if (currentUser.id.startsWith('lead-')) {
      setCardDataState([]);
    }

    const refreshCurrentAccount = async () => {
      try {
        if (currentUser.id.startsWith('lead-')) {
          const [lead, transactions, cards] = await Promise.all([
            getLead(currentUser.id),
            getTransactionData(currentUser.id),
            getCardData(currentUser.id),
          ]);
          if (cancelled) return;

          if (!lead) {
            console.warn('Lead data not found for current user:', currentUser.id);
            setTransactionDataState([]);
            setCardDataState([]);
            return;
          }

          const cardsToShow = Array.isArray(cards) ? cards : [];
          const transactionsToShow = Array.isArray(transactions) ? transactions : [];

          if (Array.isArray(cards) && cards.length === 0) {
            console.warn('Lead account has no direct cards; showing no cards for this lead.');
          }

          if (Array.isArray(transactions) && transactions.length === 0) {
            console.warn('Lead account has no direct transactions; showing no transactions for this lead.');
          }

          setCurrentUser(prev => prev?.id === lead.id ? {
            ...prev,
            name: lead.name || prev.name,
            email: lead.email || prev.email,
            phone: lead.phone || prev.phone,
            status: lead.accountStatus || prev.status,
            kycStatus: lead.kycStatus || prev.kycStatus,
            balances: lead.balances || {},
            balanceHistory: lead.balanceHistory || [],
            tradesEnabled: lead.tradesEnabled !== false,
            cardsEnabled:  lead.cardsEnabled  !== false,
          } : prev);
          setTransactionDataState(Array.isArray(transactionsToShow) ? transactionsToShow : []);
          setCardDataState(prevCards => {
            if (!Array.isArray(cardsToShow)) return [];
            if (prevCards.length === 0) return cardsToShow;
            const cardMap = {};
            cardsToShow.forEach(c => { cardMap[c.id] = c; });
            const updated = prevCards.map(c => cardMap[c.id] ? { ...c, ...cardMap[c.id] } : c).filter(c => cardMap[c.id]);
            const existingIds = new Set(prevCards.map(c => c.id));
            const newCards = cardsToShow.filter(c => !existingIds.has(c.id));
            return [...updated, ...newCards];
          });
        }
      } catch (error) {
        console.error('Failed to refresh current account:', error);
      }
    };

    let accountInFlight = false;
    const refreshCurrentAccountGuarded = async () => {
      if (accountInFlight) return;
      accountInFlight = true;
      try { await refreshCurrentAccount(); } finally { accountInFlight = false; }
    };
    refreshCurrentAccountGuarded();
    const intervalId = window.setInterval(refreshCurrentAccountGuarded, 15000);

    // Heartbeat - keeps client session marked as online in sessions table.
    const sendHb = () => {
      const tok = readClientToken();
      if (!tok) return;
      fetch('/api/heartbeat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
      }).catch(() => {});
    };
    sendHb();
    const hbId = window.setInterval(sendHb, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.clearInterval(hbId);
    };
  }, [currentUser?.id]);

  // Fetch platform and app data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // If we're already hydrated as a lead user, don't pull global demo
        // cards/transactions - those would otherwise leak demo data into the
        // user's view until the user-specific refresh runs.
        const token = readClientToken();
        const skipUserScopedFallback = currentUser?.id && currentUser.id.startsWith('lead-');
        let cachedUser = null;
        try {
          const raw = localStorage.getItem('chainiq_current_user');
          if (raw) cachedUser = JSON.parse(raw);
        } catch (_) {}
        const [crypto, transactions, cards, notifications] = await Promise.all([
          getCryptoData(),
          skipUserScopedFallback || !token ? Promise.resolve([]) : getTransactionData(),
          skipUserScopedFallback || !token ? Promise.resolve([]) : getCardData('', {
            userName: cachedUser?.name,
            cardBalance: cachedUser?.balances?.cardUsd,
          }),
          token ? getNotifications() : Promise.resolve([]),
        ]);
        // Merge in the cached user balances at the same time the crypto list
        // lands, so the dashboard renders the correct per-asset balances on
        // the very first paint instead of briefly flashing zeros while a
        // separate effect re-applies them on the next tick. We read from
        // localStorage directly because this effect's closure captures the
        // initial currentUser (null) - by the time this resolves, the
        // hydration effect has already populated localStorage but `currentUser`
        // in this closure is still stale.
        let cachedBalances = null;
        try {
          const raw = localStorage.getItem('chainiq_current_user');
          if (raw) cachedBalances = JSON.parse(raw)?.balances || null;
        } catch (_) { /* ignore malformed cache */ }
        const cryptoWithBalances = cachedBalances
          ? crypto.map(asset => ({ ...asset, balance: getBalanceValue(cachedBalances, asset) }))
          : crypto;
        setCryptoDataState(cryptoWithBalances);
        setTransactionDataState(transactions);
        setCardDataState(sortCardsByStackOrder(cards, cardStackOrderRef.current));
        setNotificationsDataState(notifications);
        setUserSettingsState(prev => ({ ...DEFAULT_USER_SETTINGS, ...prev }));
      } catch (error) {
        console.error("Failed to fetch data:", error);
        setCryptoDataState([]);
        setTransactionDataState([]);
        setCardDataState([]);
        setNotificationsDataState([]);
        setUserSettingsState(prev => ({ ...DEFAULT_USER_SETTINGS, ...prev }));
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Imperative refresh exposed to consumers (e.g. Notifications page on mount)
  // so the list is always fresh the moment the user views it, without waiting
  // for the next automatic poll tick.
  const refreshNotifications = useCallback(async () => {
    if (!currentUser || currentUser.impersonated) return;
    try {
      const list = await getNotifications();
      setNotificationsDataState(list);
    } catch (err) {
      if (err?.status !== 401 && err?.status !== 403) {
        console.error('Failed to refresh notifications:', err);
      }
    }
  }, [currentUser?.id, currentUser?.impersonated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notifications are per-user, so the global fetch above resolves them to
  // an empty array when no token is set. Re-pull the real list every time the
  // user changes (login, switch via impersonation, or page reload + restore).
  // Impersonated sessions have no JWT, so we skip the fetch there too.
  // Also polls every 10 s so admin-sent notifications surface without a reload.
  useEffect(() => {
    if (!currentUser || currentUser.impersonated) {
      if (!currentUser) setNotificationsDataState([]);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const list = await getNotifications();
        if (!cancelled) setNotificationsDataState(list);
      } catch (err) {
        // 401/403 already cleared the token + fired sessionExpired upstream.
        // For any other failure just leave the existing list in place rather
        // than clobbering it with an empty array on a transient blip.
        if (!cancelled && err?.status !== 401 && err?.status !== 403) {
          console.error('Failed to refresh notifications:', err);
        }
      }
    };
    refresh();
    const intervalId = window.setInterval(refresh, 10000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [currentUser?.id, currentUser?.impersonated]);

  // Cards are per-user too. Same pattern as transactions: skip lead-impersonation
  // (handled by the dedicated lead-refresh effect higher up) and re-fetch on
  // every currentUser.id change. We pass `userName` + `cardBalance` from the
  // authenticated user so the card face renders the right name and balance -
  // the backend `cards` table doesn't store either (cardholder = user.name;
  // balance comes from `balances.card_minor`).
  useEffect(() => {
    if (!currentUser || currentUser.impersonated) {
      if (!currentUser) setCardDataState([]);
      return;
    }
    if (currentUser.id && currentUser.id.startsWith('lead-')) return;
    let cancelled = false;

    // Poll the card list so admin-side lifecycle changes (revoke, freeze,
    // block, limits) reach the open client session without forcing a manual
    // reload. The same 3-second cadence the lead-impersonation effect uses
    // - short enough that "Revoke" feels instantaneous from the admin side,
    // long enough that a logged-in client doesn't hammer the API.
    const refreshCards = async () => {
      try {
        const list = await getCardData('', {
          userName:    currentUser.name,
          cardBalance: currentUser.balances?.cardUsd,
        });
        if (!cancelled) {
          setCardDataState(sortCardsByStackOrder(Array.isArray(list) ? list : [], cardStackOrderRef.current));
        }
      } catch (err) {
        if (!cancelled && err?.status !== 401 && err?.status !== 403) {
          console.error('Failed to refresh cards:', err);
        }
      }
    };

    refreshCards();
    const intervalId = window.setInterval(refreshCards, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentUser?.id, currentUser?.impersonated, currentUser?.name, currentUser?.balances?.cardUsd]);

  // Transactions are per-user too. The global fetch above resolves them to
  // an empty array for unauthenticated visitors, so this effect re-runs the
  // call once the user lands and any time the user-id changes (login,
  // page-reload + restore). Lead impersonation hits its own dedicated
  // refresh effect higher up that pulls demo data, so we skip those here.
  useEffect(() => {
    if (!currentUser || currentUser.impersonated) {
      if (!currentUser) setTransactionDataState([]);
      return;
    }
    if (currentUser.id && currentUser.id.startsWith('lead-')) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await getTransactionData();
        if (!cancelled) setTransactionDataState(Array.isArray(list) ? list : []);
      } catch (err) {
        // 401/403 already cleared the token + fired sessionExpired upstream.
        if (!cancelled && err?.status !== 401 && err?.status !== 403) {
          console.error('Failed to refresh transactions:', err);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.impersonated]);

  // Server-side mark-all-as-read. Optimistically flips every entry locally so
  // the badge clears instantly, then reconciles with the backend response. On
  // failure we revert to the snapshot so the UI doesn't lie. Also clears any
  // unread support-message badge in the same call so the bell icon zeros out
  // after one tap, not after two.
  const markAllNotificationsRead = async () => {
    if (!currentUser || currentUser.impersonated) {
      setNotificationsDataState(prev => prev.map(n => ({ ...n, read: true })));
      setSupportUnreadCount(0);
      return { ok: true, marked: 0 };
    }
    const snapshot = notificationsDataState;
    const supportSnapshot = supportUnreadCount;
    setNotificationsDataState(prev => prev.map(n => (n.read ? n : { ...n, read: true })));
    setSupportUnreadCount(0);
    try {
      const [result] = await Promise.all([
        apiMarkAllNotificationsRead(),
        supportSnapshot > 0 ? markClientMessagesRead() : Promise.resolve({ ok: true, marked: 0 }),
      ]);
      return result;
    } catch (err) {
      setNotificationsDataState(snapshot);
      setSupportUnreadCount(supportSnapshot);
      throw err;
    }
  };

  // Poll the support thread's unread count every 5 seconds while a real
  // (non-impersonated) client session is active. We use the existing
  // /api/client/messages list endpoint with limit=1 so the request is
  // cheap - we only care about the unread_count field. The agent name is
  // also captured so the Support page can render "Chat with X" without an
  // extra fetch on its first paint.
  useEffect(() => {
    if (!currentUser || currentUser.impersonated) {
      setSupportUnreadCount(0);
      setSupportLastUpdate(null);
      return undefined;
    }
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const result = await getClientMessages({ limit: 1 });
        if (!cancelled) {
          setSupportUnreadCount(prev => {
            if (prev !== result.unreadCount) setSupportLastUpdate(new Date().toISOString());
            return result.unreadCount;
          });
        }
      } catch (_) {
        // 401/403 already cleared the session upstream; transient network
        // failures we just swallow so the badge doesn't flip to 0 on a blip.
      } finally {
        inFlight = false;
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [currentUser?.id, currentUser?.impersonated]);

  // Synthetic "you have new support messages" notification, prepended to
  // the real notification list whenever the server says there are unread
  // agent replies. It's marked read=false so it bumps the bell badge, and
  // disappears the moment markClientMessagesRead is called (Support page
  // open, or the bell's "Mark all as read" button).
  const supportNotification = (currentUser && !currentUser.impersonated && supportUnreadCount > 0)
    ? {
        id:        '__support_unread__',
        kind:      'message',
        message:   `You have ${supportUnreadCount} new message${supportUnreadCount === 1 ? '' : 's'} from support`,
        read:      false,
        timestamp: supportLastUpdate || new Date().toISOString(),
      }
    : null;
  const effectiveNotifications = supportNotification
    ? [supportNotification, ...notificationsDataState]
    : notificationsDataState;

  const tradesEnabled = currentUser?.tradesEnabled !== false;
  const cryptoPriceBootstrappedRef = useRef(false);

  // TradFi rows (stocks / commodities / forex) for the assets table - always loaded
  // so Crypto Assets / dashboard market tabs work even when the Trades page is disabled.
  useEffect(() => {
    let cancelled = false;
    const loadTradfi = async () => {
      const list = await getTradfiAssets();
      if (!cancelled) setTradfiAssetsState(Array.isArray(list) ? list : []);
    };
    loadTradfi();
    const intervalId = window.setInterval(loadTradfi, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  // Live crypto prices - every 30s. Backend cache TTL matches; upstream is hit at most once/30s.
  useEffect(() => {
    let cancelled = false;
    const updateLivePrices = async () => {
      try {
        const currentCrypto = cryptoDataState.filter(
          (a) => (a.category || 'crypto') === 'crypto'
        );
        if (currentCrypto.length === 0) return;
        const coinIds = [...new Set(
          currentCrypto.map((a) => COINGECKO_IDS[a.ticker]).filter(Boolean)
        )];
        if (coinIds.length === 0) return;
        const fresh = cryptoPriceBootstrappedRef.current ? '' : '&fresh=1';
        cryptoPriceBootstrappedRef.current = true;
        const res = await fetch(
          `/api/market/crypto?ids=${coinIds.join(',')}${fresh}`,
          { headers: { 'Accept': 'application/json' } }
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const markets = Array.isArray(data?.coins) ? data.coins : [];
        const priceMap = {};
        markets.forEach((m) => { priceMap[m.id] = m; });
        setCryptoDataState((prev) => prev.map((asset) => {
          if ((asset.category || 'crypto') !== 'crypto') return asset;
          const coinId = COINGECKO_IDS[asset.ticker];
          const live = coinId ? priceMap[coinId] : null;
          if (!live || live.current_price == null) return asset;
          return {
            ...asset,
            price: live.current_price,
            change: live.price_change_percentage_24h ?? asset.change ?? 0,
          };
        }));
      } catch (_) { /* keep last good prices */ }
    };
    if (cryptoDataState.length === 0) return undefined;
    updateLivePrices();
    const intervalId = window.setInterval(updateLivePrices, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [cryptoDataState.length]);

  const shuffleCards = () => {
    setCardDataState((prevCards) => {
      const shuffled = [...prevCards];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      persistCardStackOrder(shuffled);
      return shuffled;
    });
  };

  const reorderCardToTop = (cardId) => {
    setCardDataState((prevCards) => {
      const clickedCardIndex = prevCards.findIndex((c) => c.id === cardId);
      if (clickedCardIndex === -1) return prevCards;

      if (clickedCardIndex === 0) {
        setShuffleMode('shuffle');
        const shuffled = [...prevCards];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        window.setTimeout(() => setShuffleMode(null), 600);
        persistCardStackOrder(shuffled);
        return shuffled;
      }

      setShuffleMode('reorder');
      const clickedCard = prevCards[clickedCardIndex];
      const reordered = [clickedCard, ...prevCards.filter((c) => c.id !== cardId)];
      window.setTimeout(() => setShuffleMode(null), 600);
      setTopCardId(cardId);
      persistCardStackOrder(reordered);
      return reordered;
    });
  };

  const updateCardState = (updatedCard) => {
    setCardDataState(prevCards => prevCards.map(c => c.id === updatedCard.id ? updatedCard : c));
  };

  // Re-derive the UI flags (`status`, `isFrozen`, `isBlocked`) from a backend
  // status string. The wire format is capitalized (`Frozen`, `Blocked`,
  // `Active`) but the React UI checks the lowercased version, plus the two
  // boolean flags. Centralizing this keeps freezeCard / blockCard from
  // disagreeing on which flags they flip.
  const applyCardStatus = (cardId, backendStatus) => {
    const lower = String(backendStatus || 'Active').toLowerCase();
    setCardDataState(prev => prev.map(c => c.id === cardId
      ? { ...c, status: lower, isFrozen: lower === 'frozen', isBlocked: lower === 'blocked' }
      : c
    ));
  };

  // POST /api/client/cards/{id}/freeze. Server toggles Active ↔ Frozen and
  // returns the new status; we mirror it locally so the UI updates without a
  // refetch round-trip. Errors bubble up so the caller can show a toast -
  // notably 409 ("card is blocked; unblock first"), which is a real user
  // mistake we want to surface, not swallow.
  const freezeCard = async (cardId) => {
    const next = await apiCardFreeze(cardId);
    applyCardStatus(cardId, next);
    return next;
  };

  // POST /api/client/cards/{id}/block. Server toggles { Active | Frozen } ↔
  // Blocked. Unblock always lands on Active by design.
  const blockCard = async (cardId) => {
    const next = await apiCardBlock(cardId);
    applyCardStatus(cardId, next);
    return next;
  };

  // POST /api/client/cards/{id}/pin. Server validates the current PIN before
  // accepting the new one (so a stolen JWT alone can't lock the legitimate
  // user out). Returns the API response or throws ApiError.
  const setCardPin = async (cardId, currentPin, newPin) => {
    return apiCardSetPin(cardId, currentPin, newPin);
  };

  // POST /api/client/cards/{id}/limits. Server merges the partial body and
  // returns the merged limits - we mirror them locally so the UI sliders
  // stay in sync without a refetch.
  const setCardLimits = async (cardId, limits) => {
    const merged = await apiCardSetLimits(cardId, limits);
    if (merged && typeof merged === 'object') {
      setCardDataState(prev => prev.map(c => c.id === cardId
        ? { ...c, limits: { ...(c.limits || {}), ...merged } }
        : c
      ));
    }
    return merged;
  };

  // --- Auth ---

  const login = async (email, password) => {
    setAuthError(null);
    try {
      const matchedUser = await authLogin(email, password);
      if (!matchedUser) throw new Error('Login failed.');
      setCurrentUser(matchedUser);
      return matchedUser;
    } catch (apiError) {
      const errMsg = apiError?.message || 'Invalid email or password.';
      setAuthError(errMsg);
      throw new Error(errMsg);
    }
  };

  // Re-fetches GET /api/client/me and merges the server's view of the user
  // (name, KYC status, balances, account status) into currentUser. Called by
  // the Dashboard on every mount so visiting the dashboard always reflects
  // the latest database state. Skips impersonation sessions (those have no
  // client JWT - they're admin-driven).
  const mergeBalancesFromApi = useCallback((balanceRow) => {
    if (!balanceRow || currentUser?.impersonated) return;
    const balances = mapBackendBalances(balanceRow);
    setCurrentUser((prev) => (prev ? { ...prev, balances } : prev));
    setCryptoDataState((prev) => prev.map((asset) => ({
      ...asset,
      balance: getBalanceValue(balances, asset),
    })));
    getTransactionData()
      .then((txs) => setTransactionDataState(Array.isArray(txs) ? txs : []))
      .catch(() => {});
  }, [currentUser?.impersonated]);

  const refreshSession = async () => {
    if (currentUser?.impersonated) return null;
    try {
      const me = await authMe();
      if (me) {
        setCurrentUser(prev => prev ? { ...prev, ...me } : me);
        return me;
      }
      // Server says the session is gone - clear the local session too so the
      // user gets bounced to /login by the route guard.
      if (currentUser && !currentUser.impersonated) {
        setCurrentUser(null);
      }
      return null;
    } catch (_) {
      // Network hiccup - leave currentUser alone; UI will keep the cached view.
      return null;
    }
  };

  // Keep `refreshSession` reachable from effects without re-binding listeners
  // every render. Using a ref avoids tearing the polling interval / focus
  // listener down and rebuilding them on every state change.
  const refreshSessionRef = useRef(refreshSession);
  refreshSessionRef.current = refreshSession;

  // Live propagation for server-side changes the client can't trigger itself
  // - the canonical case is an admin pushing a new balance, toggling the
  // per-client Trades flag, or freezing/unfreezing the account while the
  // client is logged in. We:
  //   • poll /api/client/me every 1s for non-impersonated sessions
  //     (60 calls/min - pulls fresh balances + status near-instantly)
  //   • guard with an in-flight flag so a slow round-trip can't pile up
  //     concurrent requests against the PHP/SQLite backend
  //   • re-fetch immediately when the tab regains focus / becomes visible
  //   • mirror cross-tab updates by listening for storage events on the
  //     persisted currentUser key (fires in *other* tabs of the same browser)
  // Impersonation sessions are admin-driven and have no JWT, so we skip them.
  useEffect(() => {
    if (!currentUser || currentUser.impersonated) return undefined;

    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (cancelled || document.hidden || inFlight) return;
      inFlight = true;
      try {
        await refreshSessionRef.current?.();
      } finally {
        inFlight = false;
      }
    };

    const intervalId = setInterval(tick, 10000);

    const onFocus = () => { if (!cancelled) refreshSessionRef.current?.(); };
    const onVisibility = () => {
      if (!cancelled && !document.hidden) refreshSessionRef.current?.();
    };
    const onStorage = (event) => {
      if (cancelled) return;
      if (event.key !== 'chainiq_current_user' || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue);
        if (next && next.id === currentUser.id && !next.impersonated) {
          setCurrentUser((prev) => (prev ? { ...prev, ...next } : next));
        }
      } catch (_) { /* ignore malformed payloads */ }
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('storage', onStorage);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
    };
  }, [currentUser?.id, currentUser?.impersonated]);

  // Admin preview: load real lead txs/cards via admin JWT (still in localStorage).
  useEffect(() => {
    if (!currentUser?.impersonated || !currentUser.id) return undefined;
    let cancelled = false;
    const refresh = async () => {
      try {
        const lead = await getLead(currentUser.id);
        const [txResult, cards] = await Promise.all([
          getAdminPreviewTransactions(currentUser.id, { limit: 200 }),
          getAdminPreviewCards(currentUser.id, {
            userName: currentUser.name,
            cardBalance: currentUser.balances?.cardUsd,
          }),
        ]);
        if (cancelled) return;
        if (lead) {
          setCurrentUser((prev) => (prev?.id === lead.id ? {
            ...prev,
            name: lead.name || prev.name,
            email: lead.email || prev.email,
            balances: lead.balances || prev.balances,
            kycStatus: lead.kycStatus || prev.kycStatus,
            tradesEnabled: lead.tradesEnabled !== false,
            cardsEnabled: lead.cardsEnabled !== false,
          } : prev));
        }
        setTransactionDataState(txResult.transactions || []);
        setCardDataState(sortCardsByStackOrder(cards || [], cardStackOrderRef.current));
      } catch (err) {
        if (!cancelled) console.warn('[impersonation] preview refresh failed', err);
      }
    };
    refresh();
    const intervalId = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [currentUser?.id, currentUser?.impersonated, currentUser?.name]);

  const impersonateLead = (lead) => {
    if (!lead || !lead.id) {
      throw new Error('Invalid lead for impersonation.');
    }
    const leadName = lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email || 'Lead';
    const impersonatedUser = {
      id: lead.id,
      name: leadName,
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      country: lead.country || '',
      countryCode: lead.countryCode || '',
      password: lead.clientPassword || '',
      status: lead.accountStatus || 'active',
      kycStatus: lead.kycStatus || 'Not Submitted',
      kycDocuments: Array.isArray(lead.kycDocuments) ? lead.kycDocuments : [],
      kycNotes: lead.kycNotes || '',
      balances: lead.balances || {},
      balanceHistory: lead.balanceHistory || [],
      tradesEnabled: lead.tradesEnabled !== false,
      cardsEnabled:  lead.cardsEnabled  !== false,
      impersonated: true,
    };
    setCurrentUser(impersonatedUser);

    // Seed the notification list from the pre-fetched stash the admin panel
    // writes to sessionStorage just before navigating to the impersonation URL.
    // This lets admins verify that sent notifications appear in the client view
    // without requiring a client JWT (which doesn't exist for impersonated sessions).
    try {
      const raw = sessionStorage.getItem('chainiq_impersonate_notifications');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNotificationsDataState(parsed);
        }
        sessionStorage.removeItem('chainiq_impersonate_notifications');
      }
    } catch (_) { /* non-fatal - stash is best-effort */ }

    return impersonatedUser;
  };

  const logout = () => {
    clearClientToken();
    setCurrentUser(null);
    try { localStorage.removeItem('chainiq_currency'); } catch (_) {}
    setUserSettingsState(prev => ({
      ...prev,
      name: prev.name || 'Guest',
      email: '',
      currency: 'USD',
    }));
  };

  // Sign out of *every* device for the current user. Calls the server-side
  // revocation endpoint (which bumps users.token_version → all outstanding
  // JWTs become invalid on their next request) and then runs the same local
  // teardown as logout(). Throws on backend failure so the UI can surface
  // the error and not strand the user.
  const logoutEverywhere = async () => {
    if (currentUser?.impersonated) {
      // Impersonation has no JWT and shouldn't touch the user's revocation
      // counter - silently fall back to a normal local logout.
      logout();
      return { ok: true, impersonated: true };
    }
    const result = await authLogoutEverywhere();
    logout();
    return result;
  };

  const register = async ({ name, email, password }) => {
    setAuthError(null);
    try {
      const result = await submitSignupRequest(name, email, password);
      return result;
    } catch (apiError) {
      const errMsg = apiError?.message || 'Could not submit registration.';
      setAuthError(errMsg);
      throw new Error(errMsg);
    }
  };

  const completeSignupVerification = async (email, code) => {
    setAuthError(null);
    try {
      const newUser = await verifySignupCode(email, code);
      if (!newUser) throw new Error('Verification failed.');
      setCurrentUser(newUser);
      return newUser;
    } catch (apiError) {
      const errMsg = apiError?.message || 'Invalid verification code.';
      setAuthError(errMsg);
      throw new Error(errMsg);
    }
  };

  // Change current user's password. The current-password check happens
  // server-side in changeAccountPassword (the backend rejects with a clear
  // error if the old password is wrong), so there's no client-side mirror
  // to consult here - the database is the only source of truth.
  const changePassword = async (currentPwd, newPwd) => {
    if (!currentUser) throw new Error('Not logged in.');
    await changeAccountPassword(currentUser.id, currentPwd, newPwd);
    const updated = { ...currentUser, passwordLastChanged: new Date().toISOString() };
    setCurrentUser(updated);
  };

  // Update current user profile fields
  const updateCurrentUser = (updates) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    setUserSettingsState(prev => ({
      ...prev,
      ...(updates.name ? { name: updates.name } : {}),
      ...(updates.email ? { email: updates.email } : {}),
    }));
  };

  const submitKycDocuments = async (newDocs, nextStatus = 'Pending') => {
    if (!currentUser?.id) throw new Error('Not logged in.');

    // Real authenticated client → POST /api/client/kyc (multipart). The
    // server is the source of truth for both the document list and the
    // user's kyc_status, so after a successful upload we re-fetch /me to
    // mirror that into currentUser. If the user picked an unsupported doc
    // type ("Other"), the wrapper returns it in `skipped` and we surface
    // a non-fatal warning to the caller.
    if (readClientToken()) {
      const result = await apiSubmitKyc(newDocs);

      // Re-pull the canonical user (kyc_status now 'Under Review') and the
      // server-truth document index so the modal shows what's actually on
      // file - no localStorage cache needed.
      const [hydrated, statusPayload] = await Promise.all([
        authMe(),
        apiGetKycStatus().catch(() => null),
      ]);
      // Pretty-print server kinds for the modal's "Submitted documents" list.
      const KIND_LABEL = {
        ID_FRONT: 'Identity Document (Front)',
        ID_BACK:  'Identity Document (Back)',
        SELFIE:   'Selfie with ID',
        POA:      'Proof of Address',
      };
      const docs = (statusPayload && Array.isArray(statusPayload.documents))
        ? statusPayload.documents.map(d => ({
            id: d.id,
            name: KIND_LABEL[d.kind] || d.kind,   // modal shows .name as the row title
            type: 'image/*',                       // forces the 🖼 icon path
            docType: KIND_LABEL[d.kind] || d.kind, // shown as the subtitle
            kind: d.kind,                          // raw enum kept for any consumer that wants it
            uploadedAt: d.uploaded_at,
            decision: d.decision,
            reviewedAt: d.reviewed_at,
          }))
        : [];

      const next = hydrated
        ? { ...hydrated, kycDocuments: docs }
        : { ...currentUser, kycStatus: result.kyc_status || nextStatus, kycDocuments: docs };
      setCurrentUser(next);

      // Drop the legacy localStorage mirror - the backend is authoritative now.
      try { localStorage.removeItem(`chainiq_kyc_${currentUser.id}`); } catch (_) {}

      if (result.skipped && result.skipped.length) {
        const e = new Error(`Some files were skipped (server has no slot for: ${result.skipped.join(', ')}).`);
        e.code = 'partial_skip';
        e.uploaded = result.uploaded;
        // Non-fatal: throwing lets the modal show a toast, but the supported
        // files were still uploaded successfully.
        throw e;
      }
      return next;
    }

    // Admin preview: upload via admin API (requires admin JWT in storage).
    if (currentUser.impersonated && readAdminToken()) {
      const result = await apiSubmitKycForUser(currentUser.id, newDocs);
      const statusPayload = await apiGetKycStatusForUser(currentUser.id).catch(() => null);
      const KIND_LABEL = {
        ID_FRONT: 'Identity Document (Front)',
        ID_BACK:  'Identity Document (Back)',
        SELFIE:   'Selfie with ID',
        POA:      'Proof of Address',
      };
      const docs = (statusPayload && Array.isArray(statusPayload.documents))
        ? statusPayload.documents.map((d) => ({
            id: d.id,
            name: KIND_LABEL[d.kind] || d.kind,
            type: 'image/*',
            docType: KIND_LABEL[d.kind] || d.kind,
            kind: d.kind,
            uploadedAt: d.uploaded_at,
          }))
        : [];
      const updated = {
        ...currentUser,
        kycStatus: result.kyc_status || nextStatus,
        kycDocuments: docs.length ? docs : currentUser.kycDocuments,
      };
      setCurrentUser(updated);
      try { localStorage.removeItem(`chainiq_kyc_${currentUser.id}`); } catch (_) {}
      if (result.skipped && result.skipped.length) {
        const e = new Error(`Some files were skipped: ${result.skipped.join(', ')}.`);
        e.code = 'partial_skip';
        throw e;
      }
      return updated;
    }

    throw new Error('Sign in as the client or open preview from the CRM with an active admin session.');
  };

  return (
    <DataContext.Provider value={{
      cryptoDataState,
      transactionDataState,
      cardDataState,
      // Notifications surfaced to the UI include the synthetic
      // "support has new messages" entry, so the bell badge and the
      // dropdown both reflect chat replies without any consumer changes.
      notificationsDataState: effectiveNotifications,
      supportUnreadCount,
      userSettingsState,
      isLoading,
      currentUser,
      authError,
      login,
      logout,
      logoutEverywhere,
      register,
      completeSignupVerification,
      refreshSession,
      mergeBalancesFromApi,
      sessionNotice,
      dismissSessionNotice,
      refreshNotifications,
      markAllNotificationsRead,
      markOneNotificationRead,
      notificationSettings: notificationSettingsState,
      saveNotificationSettings,
      impersonateLead,
      shuffleCards,
      reorderCardToTop,
      updateCardState,
      freezeCard,
      blockCard,
      setCardPin,
      setCardLimits,
      setUserSettingsState,
      formatBalance,
      fxRates,
      topCardId,
      setTopCardId,
      changePassword,
      updateCurrentUser,
      submitKycDocuments,
      shuffleMode,
      cryptoFavoritesState,
      setCryptoFavorites,
      cryptoSparklinesState,
      tradfiAssetsState,
      tradesEnabled,
      dismissedBannersState,
      isBannerDismissed,
      dismissBanner,
      restoreBanner,
      saveCurrencyPreference,
      saveUserSetting,
    }}>
      {children}
    </DataContext.Provider>
  );
};
