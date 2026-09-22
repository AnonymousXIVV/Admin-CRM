/* ============================================================================
 * src/api.js - Client-portal data layer.
 * ----------------------------------------------------------------------------
 * Talks to the real PHP backend at /api/client/* for everything that has a
 * backend equivalent (auth, balances, transactions, cards, notifications,
 * KYC). Anything without a backend yet (crypto market prices, per-user
 * settings) returns app defaults or empty shapes - NEVER mock seed records.
 *
 * Platform branding/settings are owned entirely by ./platformDefaults.js and
 * are NOT proxied through this module.
 *
 * No DEMO_* constants. No fake leads, no fake cards, no fake transactions.
 * ==========================================================================*/

import { tradfiSeedAssets } from './shared/tradfiCatalog';

// Resolve immediately - kept async so call sites can `await` without churn.
const ok = (value) => Promise.resolve(value);

// ---------------------------------------------------------------------------
// Asset display metadata (NOT mock data - this is the static lookup that
// converts a backend ticker code into UI-ready name/icon/decimals).
// ---------------------------------------------------------------------------

const ASSET_INFO = {
  BTC:  { name: 'Bitcoin',      decimals: 8, displayDp: 4, icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/btc.png'  },
  ETH:  { name: 'Ethereum',     decimals: 9, displayDp: 4, icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/eth.png'  },
  USDT: { name: 'Tether',       decimals: 2, displayDp: 2, icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/usdt.png' },
  USDC: { name: 'USD Coin',     decimals: 2, displayDp: 2, icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/usdc.png' },
  BNB:  { name: 'Binance Coin', decimals: 8, displayDp: 4, icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/bnb.png'  },
  SOL:  { name: 'Solana',       decimals: 9, displayDp: 4, icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/sol.png'  },
  USD:  { name: 'US Dollar',    decimals: 2, displayDp: 2, icon: '' },
};

// ---------------------------------------------------------------------------
// Crypto market prices - static seed list. Prices start at 0 and are
// replaced within seconds by the live market feed in DataContext.js.
// Balances start at 0 and are merged from currentUser.balances once the
// user is authenticated. The id / ticker keys must match COINGECKO_IDS in
// DataContext.js so the live-price effect can find and update each entry.
// ---------------------------------------------------------------------------
const CRYPTO_SEED = [
  { id: 'asset-btc',   asset: 'Bitcoin',      ticker: 'BTC',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/btc.png'   },
  { id: 'asset-eth',   asset: 'Ethereum',      ticker: 'ETH',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/eth.png'   },
  { id: 'asset-bnb',   asset: 'Binance Coin',  ticker: 'BNB',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/bnb.png'   },
  { id: 'asset-sol',   asset: 'Solana',        ticker: 'SOL',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/sol.png'   },
  { id: 'asset-xrp',   asset: 'XRP',           ticker: 'XRP',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/xrp.png'   },
  { id: 'asset-ada',   asset: 'Cardano',       ticker: 'ADA',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/ada.png'   },
  { id: 'asset-doge',  asset: 'Dogecoin',      ticker: 'DOGE', icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/doge.png'  },
  { id: 'asset-avax',  asset: 'Avalanche',     ticker: 'AVAX', icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/avax.png'  },
  { id: 'asset-dot',   asset: 'Polkadot',      ticker: 'DOT',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/dot.png'   },
  { id: 'asset-link',  asset: 'Chainlink',     ticker: 'LINK', icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/link.png'  },
  { id: 'asset-matic', asset: 'Polygon',       ticker: 'MATIC',icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/matic.png' },
  { id: 'asset-ltc',   asset: 'Litecoin',      ticker: 'LTC',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/ltc.png'   },
  { id: 'asset-usdt',  asset: 'USDT',          ticker: 'USDT', icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/usdt.png'  },
  { id: 'asset-usdc',  asset: 'USDC',          ticker: 'USDC', icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/usdc.png'  },
  { id: 'asset-uni',   asset: 'Uniswap',       ticker: 'UNI',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/uni.png'   },
  { id: 'asset-trx',   asset: 'TRON',          ticker: 'TRX',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/trx.png'   },
  { id: 'asset-bch',   asset: 'Bitcoin Cash',  ticker: 'BCH',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/bch.png'   },
  { id: 'asset-xlm',   asset: 'Stellar',       ticker: 'XLM',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/xlm.png'   },
  { id: 'asset-fil',   asset: 'Filecoin',      ticker: 'FIL',  icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/fil.png'   },
  { id: 'asset-near',  asset: 'NEAR Protocol', ticker: 'NEAR', icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/near.png' },
];

export const getCryptoData = () => ok(
  CRYPTO_SEED.map(a => ({ ...a, price: 0, change: 0, balance: 0, category: 'crypto' }))
);

// Stocks / commodities / forex - catalog in src/shared/tradfi_catalog.json (API + UI).
export async function getTradfiAssets() {
  const fallback = tradfiSeedAssets();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('/api/market/tradfi', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return fallback;
    const json = await res.json();
    const assets = Array.isArray(json?.assets) ? json.assets : [];
    return assets.length > 0 ? assets : fallback;
  } catch (_) {
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Transaction asset / amount mapping
// ---------------------------------------------------------------------------
//
// The backend stores transactions with:
//   - `asset`        - short ticker code (e.g. "BTC", "ETH", "USDT")
//   - `amount_minor` - signed integer in the asset's smallest unit
//                      (positive = inflow, negative = outflow)
// The UI iterates over a much richer shape (display name, icon URL, formatted
// signed amount, JS Date). This table is the single boundary that converts
// between the two.

const formatTxAmount = (amountMinor, assetCode) => {
  const info = ASSET_INFO[assetCode] || { decimals: 2, displayDp: 2 };
  const sign  = amountMinor < 0 ? '-' : '+';
  const abs   = Math.abs(amountMinor);
  const value = abs / Math.pow(10, info.decimals);
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: info.displayDp,
    maximumFractionDigits: info.displayDp,
  });
  return `${sign}${formatted} ${assetCode}`;
};

const mapBackendTransaction = (row) => {
  const assetCode = (row.asset || '').toUpperCase();
  const info      = ASSET_INFO[assetCode] || { name: assetCode, icon: '', decimals: 2, displayDp: 2 };
  const feeMinor  = Number(row.fee_minor) || 0;
  return {
    id:          row.id,
    type:        row.type,
    asset:       info.name,
    assetCode,
    icon:        info.icon,
    amount:      formatTxAmount(row.amount_minor, assetCode),
    amountMinor: row.amount_minor,
    fee:         feeMinor > 0 ? formatTxAmount(feeMinor, assetCode).replace(/^[+-]/, '') : '-',
    description: row.description || '',
    status:      (row.status || 'completed').toLowerCase(),
    date:        new Date(row.created_at),
    createdAt:   row.created_at,
  };
};

// Returns the most-recent 100 backend transactions for the authenticated
// client (or [] if no token). The legacy `userId` argument is accepted but
// ignored - the JWT scopes the query server-side.
export const getTransactionData = async (_legacyUserId = '') => {
  if (!readClientToken()) return [];
  const data = await apiFetch('/api/client/transactions?limit=100', { auth: true });
  return Array.isArray(data?.transactions)
    ? data.transactions.map(mapBackendTransaction)
    : [];
};

// GET /api/client/transactions with server-side pagination + filters.
// Returns: { transactions, total, limit, offset, hasMore }
export const getTransactionsPage = async ({ limit = 20, offset = 0, type = '', asset = '', from = '', to = '' } = {}) => {
  if (!readClientToken()) {
    return { transactions: [], total: 0, limit, offset, hasMore: false };
  }
  const qs = new URLSearchParams();
  qs.set('limit',  String(limit));
  qs.set('offset', String(offset));
  if (type)  qs.set('type',  type);
  if (asset) qs.set('asset', asset);
  if (from)  qs.set('from',  from);
  if (to)    qs.set('to',    to);
  const data = await apiFetch(`/api/client/transactions?${qs.toString()}`, { auth: true });
  return {
    transactions: Array.isArray(data?.transactions) ? data.transactions.map(mapBackendTransaction) : [],
    total:        Number.isFinite(data?.total)  ? data.total  : 0,
    limit:        Number.isFinite(data?.limit)  ? data.limit  : limit,
    offset:       Number.isFinite(data?.offset) ? data.offset : offset,
    hasMore:      !!data?.has_more,
  };
};

// ---------------------------------------------------------------------------
// Trades
// ---------------------------------------------------------------------------
//
// POST /api/client/trades - execute an asset swap at the live USD-bridge rate.
// Server validates KYC, debits source, credits target, writes two ledger rows
// and returns the filled trade + fresh balances. UI is responsible for
// converting display units → minor units (integers) before calling.
//
// Body: { fromAsset, toAsset, fromAmountMinor }
// Returns: { trade: {...}, balances: {...} } on success; throws on failure
//   (the apiFetch error carries .status + .body so callers can branch on
//   'kyc_required' / 'insufficient_funds' / 'unprocessable' etc.).
export const submitTrade = async ({ fromAsset, toAsset, fromAmountMinor }) => {
  const payload = {
    from_asset:        String(fromAsset || '').toUpperCase(),
    to_asset:          String(toAsset   || '').toUpperCase(),
    from_amount_minor: Math.trunc(Number(fromAmountMinor) || 0),
  };
  return apiFetch('/api/client/trades', { method: 'POST', body: payload, auth: true });
};

// ---------------------------------------------------------------------------
// Card mapping
// ---------------------------------------------------------------------------
//
// The backend `cards` table stores only non-sensitive metadata (id, type,
// status, issued_at, issued_by). PAN/CVV/expiry are never persisted. We
// synthesize the display-only fields here, deterministically, so the UI
// can render an Apple-Wallet-style card face. Nothing here is real card
// data - it's a placeholder surface until a real card-issuer integration
// is wired in.

const CARD_TYPE_BRAND = {
  Platinum: { brand: 'visa',       binPrefix: '4539' },
  Gold:     { brand: 'mastercard', binPrefix: '5325' },
  Premium:  { brand: 'virtual',    binPrefix: '4716' },
};

const hashString = (s) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const buildDisplayCardNumber = (id, binPrefix) => {
  const h1 = hashString(id).toString().padStart(10, '0').slice(-6);
  const h2 = hashString(`${id}::salt`).toString().padStart(10, '0').slice(-6);
  return `${binPrefix}${h1}${h2}`;
};

const buildDisplayExpiry = (issuedAtIso) => {
  const issued = new Date(issuedAtIso);
  if (isNaN(issued.getTime())) return '12/29';
  const exp = new Date(issued);
  exp.setUTCFullYear(exp.getUTCFullYear() + 4);
  const mm = String(exp.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(exp.getUTCFullYear()).slice(-2);
  return `${mm}/${yy}`;
};

const mapBackendCard = (row, ctx = {}) => {
  const typeKey = row.type || 'Premium';
  const brand   = CARD_TYPE_BRAND[typeKey] || CARD_TYPE_BRAND.Premium;
  const realPan = typeof row.pan === 'string' && /^\d{12,19}$/.test(row.pan) ? row.pan : null;
  const number  = realPan || buildDisplayCardNumber(row.id, brand.binPrefix);
  const expiry  = (row.expiry_month && row.expiry_year)
    ? `${String(row.expiry_month).padStart(2, '0')}/${String(row.expiry_year).slice(-2)}`
    : buildDisplayExpiry(row.issued_at);
  const realCvv = typeof row.cvv === 'string' && /^\d{3,4}$/.test(row.cvv) ? row.cvv : null;
  const lower   = String(row.status || 'Active').toLowerCase();
  return {
    id:                 row.id,
    userId:             undefined,
    cardholderName:     ctx.userName || 'Card Holder',
    cardNumber:         number,
    expiry,
    expiryDate:         expiry,
    cvv:                realCvv || '***',
    expiryMonth:        row.expiry_month ? Number(row.expiry_month) : null,
    expiryYear:         row.expiry_year  ? Number(row.expiry_year)  : null,
    panSet:             !!realPan,
    cvvSet:             !!realCvv,
    expirySet:          !!(row.expiry_month && row.expiry_year),
    type:               typeKey.toLowerCase(),
    balance:            Number(ctx.cardBalance) || 0,
    status:             lower,
    isBlocked:          lower === 'blocked',
    isFrozen:           lower === 'frozen',
    physicalCardStatus: brand.brand,
    issuedAt:           row.issued_at,
    // Backend stores limits as a JSON object on the cards row. Default to the
    // platform's recommended caps when nothing has been set yet so the UI's
    // sliders/preview render meaningful numbers on first open.
    limits: row.limits && typeof row.limits === 'object' ? {
      dailySpending:     Number(row.limits.dailySpending     ?? 1000),
      monthlySpending:   Number(row.limits.monthlySpending   ?? 5000),
      singleTransaction: Number(row.limits.singleTransaction ?? 500),
      atmWithdrawal:     Number(row.limits.atmWithdrawal     ?? 300),
      onlinePurchases:   Number(row.limits.onlinePurchases   ?? 2000),
      international:     Number(row.limits.international     ?? 1000),
    } : {
      dailySpending: 1000, monthlySpending: 5000, singleTransaction: 500,
      atmWithdrawal: 300,  onlinePurchases: 2000, international: 1000,
    },
  };
};

// Returns the authenticated client's cards mapped to UI shape, or [] if no
// token. The legacy `userId` argument is accepted but ignored - the JWT
// scopes the query server-side. `ctx` carries cardholder name + USD card
// balance (DataContext re-runs this once the user is hydrated).
export const getCardData = async (_legacyUserId = '', ctx = {}) => {
  if (!readClientToken()) return [];
  const data = await apiFetch('/api/client/cards', { auth: true });
  return Array.isArray(data?.cards)
    ? data.cards.map((row) => mapBackendCard(row, ctx))
    : [];
};

// Toggle a card between Active ↔ Frozen. Throws ApiError on 401/403/404/409.
export const cardFreeze = async (cardId) => {
  const data = await apiFetch(`/api/client/cards/${encodeURIComponent(cardId)}/freeze`, {
    method: 'POST',
    auth: true,
  });
  return data?.status;
};

// Toggle a card between { Active | Frozen } ↔ Blocked. Unblock lands on Active.
export const cardBlock = async (cardId) => {
  const data = await apiFetch(`/api/client/cards/${encodeURIComponent(cardId)}/block`, {
    method: 'POST',
    auth: true,
  });
  return data?.status;
};

// POST /api/client/cards/{id}/pin - rotate the card PIN. Server requires the
// current PIN as proof of possession plus a 4-6 digit new PIN.
export const cardSetPin = async (cardId, currentPin, newPin) => {
  return apiFetch(`/api/client/cards/${encodeURIComponent(cardId)}/pin`, {
    method: 'POST',
    auth: true,
    body: { current_pin: currentPin, new_pin: newPin },
  });
};

// POST /api/client/cards/{id}/limits - update spending limits. Server merges
// the partial body into the stored JSON; missing keys keep their value.
// Returns the merged limits object so the caller can mirror local state.
export const cardSetLimits = async (cardId, limits) => {
  const data = await apiFetch(`/api/client/cards/${encodeURIComponent(cardId)}/limits`, {
    method: 'POST',
    auth: true,
    body: limits,
  });
  return data?.limits;
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

const mapBackendNotification = (row) => ({
  id:        row.id,
  kind:      row.kind || 'info',
  message:   row.message,
  read:      row.read_at !== null && row.read_at !== undefined,
  readAt:    row.read_at || null,
  timestamp: row.created_at,
});

export const getNotifications = async () => {
  if (!readClientToken()) return [];
  const data = await apiFetch('/api/client/notifications', { auth: true });
  return Array.isArray(data?.notifications)
    ? data.notifications.map(mapBackendNotification)
    : [];
};

// POST /api/client/notifications/read-all - idempotent.
export const markNotificationRead = async (notificationId) => {
  if (!notificationId || !readClientToken()) return { ok: false };
  return apiFetch(`/api/client/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
    auth: true,
    body: {},
  });
};

export const markAllNotificationsRead = async () => {
  return apiFetch('/api/client/notifications/read-all', {
    method: 'POST',
    auth: true,
  });
};

// ---------------------------------------------------------------------------
// Per-user settings (no backend yet - we return defaults).
// Platform-level settings live entirely in src/platformDefaults.js and
// localStorage; admin Settings.jsx is the sole writer, and consumers read
// them via loadPlatformSettings() / subscribePlatformSettings().
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lead lookup - the `leads` table is admin-only data, but the impersonation
// handoff happens on the *client* SPA (the admin clicks "Enter Lead Account"
// which redirects to /login?impersonateLeadId=...). At that moment the
// admin's bearer token is still in localStorage, so we can hit the admin
// backend directly to fetch the real, fresh lead row. Returns the camelCase
// shape the rest of the client app expects, or null if the token is missing
// (the LoginPage falls back to its sessionStorage stash in that case).
// ---------------------------------------------------------------------------

const ADMIN_TOKEN_KEY = 'chainiq_admin_token';

export const readAdminToken = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(ADMIN_TOKEN_KEY) || null;
  } catch (_) {
    return null;
  }
};

// Converts a backend `balances` row (integers in minor / satoshi units)
// into the simple display-unit dict the React UI uses (keyed by lowercase
// ticker). Defined here so it can be used by both mapLeadRow and mapBackendUser.
export const mapBackendBalances = (row) => {
  if (!row || typeof row !== 'object') return {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    usd:          num(row.fiat_minor) / 100,
    btc:          num(row.btc_sat)    / 1e8,
    eth:          num(row.eth_wei_e9) / 1e9,
    usdt:         num(row.usdt_minor) / 100,
    cardUsd:      num(row.card_minor) / 100,
    fiatCurrency: row.fiat_currency || 'USD',
    updatedAt:    row.updated_at || null,
  };
};

const mapLeadRow = (l) => {
  if (!l) return null;
  const first = l.first_name || '';
  const last  = l.last_name  || '';
  return {
    id:                l.id,
    firstName:         first,
    lastName:          last,
    name:              `${first} ${last}`.trim(),
    email:             l.email || '',
    phone:             l.phone || '',
    country:           l.country || '',
    countryCode:       l.country_code || '',
    stage:             l.stage || '',
    funnel:            l.funnel || '',
    affiliate:         l.affiliate || '',
    clientPassword:    l.client_password || '',
    tradesEnabled:     l.trades_enabled !== false,
    cardsEnabled:      l.cards_enabled  !== false,
    assignedToOffice:  l.assigned_office_id || null,
    assignedToTeam:    l.assigned_team_id   || null,
    assignedToAgent:   l.assigned_agent_id  || null,
    assignedAgentName: l.assigned_agent_name || null,
    registeredDate:    l.registered_date || '',
    createdAt:         l.created_at || null,
    updatedAt:         l.updated_at || null,
    // Map the backend `balance` (minor-unit integers) to display-unit floats
    // so the client-portal polling loop can update the UI without a page refresh.
    balances:          mapBackendBalances(l.balance || null),
  };
};

export const getLead = async (leadId) => {
  if (!leadId) return null;
  const token = readAdminToken();
  if (!token) return null;
  try {
    const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    return mapLeadRow(body.lead);
  } catch (_) {
    return null;
  }
};


// ---------------------------------------------------------------------------
// Auth (real backend: PHP API at /api/client/*)
// ---------------------------------------------------------------------------

export const CLIENT_TOKEN_KEY = 'chainiq_client_token';

export const readClientToken = () => {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(CLIENT_TOKEN_KEY);
  } catch (_) {
    return null;
  }
};

const writeClientToken = (token) => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (token) localStorage.setItem(CLIENT_TOKEN_KEY, token);
    else localStorage.removeItem(CLIENT_TOKEN_KEY);
  } catch (_) {}
};

export const clearClientToken = () => writeClientToken(null);

// ---- session-expired subscription -----------------------------------------
const sessionExpiredListeners = new Set();

export const onSessionExpired = (cb) => {
  if (typeof cb !== 'function') return () => {};
  sessionExpiredListeners.add(cb);
  return () => sessionExpiredListeners.delete(cb);
};

const emitSessionExpired = (reason) => {
  sessionExpiredListeners.forEach((cb) => {
    try { cb(reason); } catch (_) {}
  });
};


const mapBackendUser = (raw, rawBalances = null) => {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id:        raw.id,
    name:      raw.name || (raw.email ? raw.email.split('@')[0] : 'Account'),
    email:     raw.email || '',
    phone:     raw.phone || '',
    country:   raw.country || '',
    status:    (raw.status || 'Active').toLowerCase(),
    kycStatus: raw.kyc_status || raw.kycStatus || 'Not Submitted',
    avatarUrl: raw.avatar_url || null,
    balances:  mapBackendBalances(rawBalances),
    tradesEnabled: raw.trades_enabled !== false && raw.tradesEnabled !== false,
    cardsEnabled:  raw.cards_enabled  !== false && raw.cardsEnabled  !== false,
    registeredDate: (raw.created_at || '').slice(0, 10),
    passwordLastChanged: raw.password_changed_at || null,
  };
};

const readCsrfCookie = () => {
  try {
    const match = document.cookie.match(/(?:^|;\s*)ciq_csrf=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch (_) { return null; }
};

const apiFetch = async (path, { method = 'GET', body, auth = false } = {}) => {
  const headers = { 'Accept': 'application/json' };
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = readClientToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = readCsrfCookie();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (networkErr) {
    throw new Error('Cannot reach the server. Please try again in a moment.');
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch (_) { data = null; }
  }

  if (!res.ok) {
    const errCode = data && data.error;
    const isPinError = errCode === 'pin_required' || errCode === 'invalid_pin';
    if (auth && !isPinError && (res.status === 401 || res.status === 403) && readClientToken()) {
      const reason = res.status === 403 ? 'disabled' : 'expired';
      clearClientToken();
      emitSessionExpired(reason);
    }

    const msg = (data && (data.message || data.error)) || `Request failed (${res.status}).`;
    const err = new Error(msg);
    err.status = res.status;
    err.code = errCode;
    throw err;
  }

  return data;
};

// POST /api/client/logout-everywhere - server-side revocation (bumps
// token_version, instantly invalidating every JWT for this user).
export const authLogoutEverywhere = async () => {
  const data = await apiFetch('/api/client/logout-everywhere', {
    method: 'POST',
    auth: true,
  });
  clearClientToken();
  return data;
};

export const authMe = async () => {
  if (!readClientToken()) return null;
  try {
    const data = await apiFetch('/api/client/me', { auth: true });
    return mapBackendUser(data?.user, data?.balances || null);
  } catch (err) {
    if (err.status === 401 || err.status === 403) return null;
    throw err;
  }
};

export const authLogin = async (email, password) => {
  const data = await apiFetch('/api/client/login', {
    method: 'POST',
    body: { email, password },
  });
  if (data?.token) writeClientToken(data.token);
  const hydrated = await authMe();
  return hydrated || mapBackendUser(data?.user);
};

export const submitSignupRequest = async (name, email, password) => {
  return apiFetch('/api/client/signup-request', {
    method: 'POST',
    body: { name, email, password },
  });
};

export const getSignupRequestStatus = async (email) => {
  const qs = new URLSearchParams({ email });
  return apiFetch(`/api/client/signup-request/status?${qs}`);
};

export const verifySignupCode = async (email, code) => {
  const data = await apiFetch('/api/client/signup-request/verify', {
    method: 'POST',
    body: { email, code },
  });
  if (data?.token) writeClientToken(data.token);
  const hydrated = await authMe();
  return hydrated || mapBackendUser(data?.user);
};

/** @deprecated Direct register - use submitSignupRequest + admin approval flow. */
export const authRegister = async (name, email, password) => {
  const data = await submitSignupRequest(name, email, password);
  if (data?.token) writeClientToken(data.token);
  if (data?.token) {
    const hydrated = await authMe();
    return hydrated || mapBackendUser(data?.user);
  }
  return data;
};

// PATCH /api/client/profile - update name, phone, and/or country.
// Returns the server's canonical user snapshot so callers can mirror it.
export const updateClientProfile = async (updates = {}) => {
  const data = await apiFetch('/api/client/profile', {
    method: 'PATCH',
    auth: true,
    body: updates,
  });
  return data?.user || null;
};

// POST /api/client/email - change email address.
// Requires current_password as proof of possession.
export const changeClientEmail = async (currentPassword, newEmail) => {
  const data = await apiFetch('/api/client/email', {
    method: 'POST',
    auth: true,
    body: { current_password: currentPassword, new_email: newEmail },
  });
  return data?.user || null;
};

// POST /api/client/profile/avatar/preset - save a preset avatar key.
// Returns the saved avatar_url string (same as the key passed in).
export const selectPresetAvatar = async (presetKey) => {
  const data = await apiFetch('/api/client/profile/avatar/preset', {
    method: 'POST',
    auth: true,
    body: { key: presetKey },
  });
  return data?.avatar_url || null;
};

export const changeAccountPassword = async (_userId, currentPassword, newPassword) => {
  const data = await apiFetch('/api/client/password', {
    method: 'POST',
    auth: true,
    body: { current_password: currentPassword, new_password: newPassword },
  });
  // Backend bumps token_version and issues a fresh JWT so every other session
  // is revoked immediately, but this one keeps working without re-login.
  if (data?.token) writeClientToken(data.token);
  return { success: true };
};

// ---------------------------------------------------------------------------
// Per-account preferences (favorited assets, etc.) - backed by the database
// at /api/client/preferences. Replaces the old per-browser localStorage caches
// (`cryptoFavorites`) so prefs are scoped to the account and sync across
// devices instead of leaking between users sharing a browser.
// ---------------------------------------------------------------------------

export const getClientPreferences = async () => {
  if (!readClientToken()) return {};
  try {
    const data = await apiFetch('/api/client/preferences', { auth: true });
    const prefs = data?.preferences;
    return prefs && typeof prefs === 'object' ? prefs : {};
  } catch (err) {
    if (err.status === 401 || err.status === 403) return {};
    throw err;
  }
};

export const setClientPreferences = async (preferences) => {
  if (!readClientToken()) return preferences || {};
  const safe = preferences && typeof preferences === 'object' ? preferences : {};
  const data = await apiFetch('/api/client/preferences', {
    method: 'PUT',
    auth: true,
    body: { preferences: safe },
  });
  const echoed = data?.preferences;
  return echoed && typeof echoed === 'object' ? echoed : safe;
};

/** @deprecated Use getClientPreferences() for logged-in clients. */
export const getUserSettings = async (userId) => {
  if (!userId) return Promise.reject(new Error('User ID is required for user settings.'));
  if (readClientToken()) {
    const prefs = await getClientPreferences();
    return {
      userId,
      currency: prefs.currency || 'USD',
      timezone: prefs.timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'),
      showCardBalance: prefs.showCardBalance !== false,
      onlineStatus: prefs.onlineStatus !== false,
      priceAlertEnabled: prefs.priceAlertEnabled === true,
      priceAlertAsset: prefs.priceAlertAsset || null,
      priceAlertLastPrice: prefs.priceAlertLastPrice || 0,
    };
  }
  return {
    userId,
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
};

export const requestPasswordReset = async (email) => {
  return apiFetch('/api/client/password/reset-request', {
    method: 'POST',
    body: { email },
  });
};

export const resetPasswordWithToken = async (token, newPassword) => {
  return apiFetch('/api/client/password/reset', {
    method: 'POST',
    body: { token, new_password: newPassword },
  });
};

export const resetPasswordWithCode = async (email, code, newPassword) => {
  return apiFetch('/api/client/password/reset', {
    method: 'POST',
    body: { email, code, new_password: newPassword },
  });
};

const mapAdminTxnToClientRow = (r) => {
  const DIVISORS = { BTC: 1e8, ETH: 1e9, USDT: 100, USD: 100, CARD: 100 };
  const divisor = DIVISORS[r.asset] || 100;
  const amt = Number(r.amount ?? (Number(r.amount_minor) / divisor));
  const sign = amt >= 0 ? '+' : '';
  return {
    id: r.id,
    type: r.type,
    asset: r.asset,
    amount: `${sign}${Math.abs(amt).toFixed(8).replace(/\.?0+$/, '')} ${r.asset}`,
    amountMinor: Number(r.amount_minor ?? 0),
    fee: '-',
    description: r.description || '',
    status: (r.status || 'completed').toLowerCase(),
    date: new Date(r.created_at || r.createdAt || Date.now()),
    createdAt: r.created_at || r.createdAt,
  };
};

/** Admin preview: transactions for impersonated lead (requires admin JWT in storage). */
export const getAdminPreviewTransactions = async (userId, opts = {}) => {
  const token = readAdminToken();
  if (!token || !userId) return { transactions: [], total: 0, hasMore: false };
  const qs = new URLSearchParams({ limit: String(opts.limit || 100), offset: String(opts.offset || 0) });
  if (opts.type) qs.set('type', opts.type);
  if (opts.asset) qs.set('asset', opts.asset);
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/transactions?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return { transactions: [], total: 0, hasMore: false };
  const data = await res.json();
  const rows = (data.transactions || []).map(mapAdminTxnToClientRow);
  return { transactions: rows, total: data.total || rows.length, hasMore: Boolean(data.has_more) };
};

/** Admin preview: cards for impersonated lead. */
export const getAdminPreviewCards = async (userId, ctx = {}) => {
  const token = readAdminToken();
  if (!token || !userId) return [];
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/cards`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const list = data.cards || [];
  return Array.isArray(list) ? list.map((row) => mapBackendCard(row, ctx)) : [];
};

// ---------------------------------------------------------------------------
// One-time purge of legacy localStorage keys that were migrated to the
// database. Safe to call on every app boot - the keys are simply removed if
// present. Mirrors the pattern used in src/admin-app/App.jsx for admin caches.
// ---------------------------------------------------------------------------
const LEGACY_CLIENT_STORAGE_KEYS = [
  'chainiq_simulated_users', // dataset now served by /api/admin/users
  'cryptoFavorites',         // now served by /api/client/preferences
];

export const purgeLegacyClientStorage = () => {
  if (typeof localStorage === 'undefined') return;
  LEGACY_CLIENT_STORAGE_KEYS.forEach((k) => {
    try { localStorage.removeItem(k); } catch (_) {}
  });
};

// ---------------------------------------------------------------------------
// Client appointments (real backend at /api/client/appointments)
// ---------------------------------------------------------------------------

export const getAppointments = async () => {
  const data = await apiFetch({ path: '/api/client/appointments', auth: true });
  return Array.isArray(data?.appointments) ? data.appointments : [];
};

export const createAppointment = async ({ title, date, notes = '', type = 'call' }) => {
  const data = await apiFetch({
    path: '/api/client/appointments',
    method: 'POST',
    auth: true,
    body: { title, date, notes, type },
  });
  return data?.appointment ?? null;
};

export const deleteAppointment = async (apptId) => {
  const data = await apiFetch({
    path: `/api/client/appointments/${encodeURIComponent(apptId)}`,
    method: 'DELETE',
    auth: true,
  });
  return data?.deleted === true;
};

// ---------------------------------------------------------------------------
// Client ↔ Agent support chat (real backend at /api/client/messages)
// ---------------------------------------------------------------------------
//
// The backend stores a single thread per user keyed by users.id. Sender is
// either 'client' (the logged-in user) or 'agent' (the assigned admin).
// We expose a small mapper so the UI can use friendlier field names
// (text / timestamp) without losing the original backend keys.

const mapChatMessage = (m) => ({
  id:        m.id,
  sender:    m.sender,
  text:      m.body || '',
  body:      m.body || '',
  timestamp: m.created_at || null,
  createdAt: m.created_at || null,
  readAt:    m.read_at || null,
  attachment: m.attachment
    ? { ...m.attachment, url: `/api/client/messages/${encodeURIComponent(m.id)}/attachment` }
    : null,
});

export const getClientMessages = async ({ before, limit = 100 } = {}) => {
  const empty = { messages: [], unreadCount: 0, agent: null, hasMore: false };
  if (!readClientToken()) return empty;
  const qs = new URLSearchParams();
  if (before) qs.set('before', before);
  if (limit)  qs.set('limit', String(limit));
  try {
    const data = await apiFetch(`/api/client/messages?${qs.toString()}`, { auth: true });
    return {
      messages:    Array.isArray(data?.messages) ? data.messages.map(mapChatMessage) : [],
      unreadCount: Number(data?.unread_count || 0),
      agent:       data?.agent || null,
      hasMore:     Boolean(data?.has_more),
    };
  } catch (err) {
    if (err.status === 401 || err.status === 403) return empty;
    throw err;
  }
};

export const getClientPresence = async () => {
  if (!readClientToken()) return { online: false, is_typing: false };
  try {
    return await apiFetch('/api/client/presence', { auth: true });
  } catch (_) {
    return { online: false, is_typing: false };
  }
};

export const sendClientMessage = async (text, attachment = null) => {
  const body = attachment ? new FormData() : { body: String(text || '').trim() };
  if (attachment) {
    body.append('body', String(text || '').trim());
    body.append('attachment', attachment);
  }
  const data = await apiFetch('/api/client/messages', {
    method: 'POST',
    body,
    auth:   true,
  });
  return data?.message ? mapChatMessage(data.message) : null;
};

export const getClientMessageAttachmentUrl = async (messageId) => {
  const token = readClientToken();
  if (!messageId || !token) throw new Error('Not signed in.');
  const res = await fetch(`/api/client/messages/${encodeURIComponent(messageId)}/attachment`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('Could not load attachment.');
  return URL.createObjectURL(await res.blob());
};

// POST /api/client/kyc/profile - step-1 personal info for the KYC wizard
export const saveKycProfile = async (profile) => {
  return apiFetch('/api/client/kyc/profile', {
    method: 'POST',
    body:   profile,
    auth:   true,
  });
};

export const markClientMessagesRead = async () => {
  if (!readClientToken()) return { ok: false, marked: 0 };
  try {
    return await apiFetch('/api/client/messages/read', { method: 'POST', auth: true });
  } catch (_) {
    return { ok: false, marked: 0 };
  }
};

// ---------------------------------------------------------------------------
// KYC: real backend bridge
// ---------------------------------------------------------------------------

const KYC_FIELD_FOR = (docType, side) => {
  const t = (docType || '').toLowerCase();
  if (t === 'passport')                                         return 'id_front';
  if (t === 'national id')         return side === 'back' ? 'id_back' : 'id_front';
  if (t === 'driver license')      return side === 'back' ? 'id_back' : 'id_front';
  if (t === 'proof of address')                                 return 'poa';
  if (t === 'selfie with id')                                   return 'selfie';
  return null;
};

const dataUrlToBlob = (dataUrl) => {
  const [meta, b64] = String(dataUrl || '').split(',');
  const mime = (meta.match(/data:(.*?);base64/) || [])[1] || 'application/octet-stream';
  const bin  = atob(b64 || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

// POST /api/client/kyc - multipart upload of one or more documents.
// `docs` is the modal's pending[] array: { name, type, docType, side, dataUrl }
export const submitKyc = async (docs) => {
  const list = Array.isArray(docs) ? docs : [];
  if (!list.length) {
    const err = new Error('Please attach at least one document.');
    err.code = 'no_files';
    throw err;
  }

  const fd = new FormData();
  const usedFields = new Set();
  const skipped = [];

  for (const d of list) {
    const field = KYC_FIELD_FOR(d.docType, d.side);
    if (!field) {
      skipped.push(d.name || d.docType || 'document');
      continue;
    }
    if (usedFields.has(field)) fd.delete(field);
    usedFields.add(field);
    fd.append(field, dataUrlToBlob(d.dataUrl), d.name || `${field}.bin`);
  }

  if (![...fd.keys()].length) {
    const err = new Error(
      `No supported document types in your selection${skipped.length ? ` (skipped: ${skipped.join(', ')})` : ''}. ` +
      `Please upload Passport, National ID, Driver License, Selfie with ID, or Proof of Address.`
    );
    err.code = 'no_supported_files';
    throw err;
  }

  const headers = { 'Accept': 'application/json' };
  const token = readClientToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch('/api/client/kyc', { method: 'POST', headers, body: fd });
  } catch (_) {
    throw new Error('Cannot reach the server. Please try again in a moment.');
  }

  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch (_) {} }

  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && token) {
      const reason = res.status === 403 ? 'disabled' : 'expired';
      clearClientToken();
      emitSessionExpired(reason);
    }
    const err = new Error((data && (data.message || data.error)) || `Upload failed (${res.status}).`);
    err.status = res.status;
    err.code = data && data.error;
    throw err;
  }

  return { ...data, skipped };
};

/** POST /api/admin/users/{userId}/kyc - admin uploads on behalf of a client (preview). */
export const submitKycForUser = async (userId, docs) => {
  const list = Array.isArray(docs) ? docs : [];
  if (!list.length || !userId) {
    throw new Error('Please attach at least one document.');
  }
  const token = readAdminToken();
  if (!token) throw new Error('Admin session required to upload KYC.');

  const fd = new FormData();
  const usedFields = new Set();
  const skipped = [];
  for (const d of list) {
    const field = KYC_FIELD_FOR(d.docType, d.side);
    if (!field) { skipped.push(d.name || d.docType || 'document'); continue; }
    if (usedFields.has(field)) fd.delete(field);
    usedFields.add(field);
    fd.append(field, dataUrlToBlob(d.dataUrl), d.name || `${field}.bin`);
  }
  if (![...fd.keys()].length) {
    throw new Error('No supported document types in your selection.');
  }
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/kyc`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body: fd,
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (_) {} }
  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `Upload failed (${res.status}).`);
  }
  return { ...data, skipped };
};

/** GET /api/market/orderbook - live depth (Binance or quote-derived). */
export const fetchMarketOrderBook = async ({ symbol, yf } = {}) => {
  const qs = new URLSearchParams();
  if (symbol) qs.set('symbol', symbol);
  if (yf) qs.set('yf', yf);
  try {
    const res = await fetch(`/api/market/orderbook?${qs}`);
    if (res.ok) return res.json();
  } catch (_) { /* try direct fallback */ }
  if (symbol) {
    const direct = await fetch(`https://data-api.binance.vision/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=20`);
    if (direct.ok) {
      const data = await direct.json();
      const asks = (data.asks || []).map((r) => ({ price: parseFloat(r[0]), size: parseFloat(r[1]) }));
      const bids = (data.bids || []).map((r) => ({ price: parseFloat(r[0]), size: parseFloat(r[1]) }));
      return { source: 'binance', symbol, asks, bids };
    }
  }
  throw new Error('Order book unavailable');
};

/** GET /api/market/recent-trades - Binance trades for crypto pairs. */
export const fetchMarketRecentTrades = async (symbol, limit = 25) => {
  const qs = new URLSearchParams({ symbol, limit: String(limit) });
  const res = await fetch(`/api/market/recent-trades?${qs}`);
  if (!res.ok) return { trades: [] };
  return res.json();
};

// GET /api/client/kyc - current status + sanitised document index.
export const getKycStatus = async () => {
  return apiFetch('/api/client/kyc', { auth: true });
};

/** GET /api/admin/users/{userId}/kyc - for impersonation preview. */
export const getKycStatusForUser = async (userId) => {
  const token = readAdminToken();
  if (!token || !userId) return { documents: [], kyc_status: null };
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/kyc`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) return { documents: [], kyc_status: null };
  const data = await res.json();
  return {
    kyc_status: data.user?.kyc_status || null,
    documents: (data.documents || []).map((d) => ({
      id: d.id,
      kind: d.kind,
      uploaded_at: d.uploaded_at,
      decision: d.decision,
    })),
  };
};

// ---------------------------------------------------------------------------
// Lead impersonation helper - used by the admin "preview as lead" KYC path
// which has no JWT and no real backend endpoint for lead-side updates.
// ---------------------------------------------------------------------------
/** Persists lead fields via admin API when previewing as a lead (admin JWT). */
export const updateLead = async (leadId, updates) => {
  const token = readAdminToken();
  if (!token || !leadId) return { id: leadId, ...updates };
  const body = { ...updates };
  if (body.kycStatus !== undefined) {
    body.kyc_status = body.kycStatus;
    delete body.kycStatus;
  }
  const res = await fetch(`/api/admin/leads/${encodeURIComponent(leadId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Could not update lead on server');
  }
  const data = await res.json();
  return data.lead || data;
};

// POST /api/client/cards/apply - submits a real card application (audit + admin
// notification on the server). The legacy `userId` argument is accepted but
// ignored; the JWT identifies the client server-side.
export const requestCard = async (_legacyUserId, cardDetails = {}) => {
  if (!readClientToken()) {
    return { success: false, message: 'You must be signed in to request a card.' };
  }
  const tier = String(cardDetails?.tier || 'premium').toLowerCase();
  const type = tier === 'platinum' ? 'Platinum'
    : tier === 'gold'              ? 'Gold'
    : 'Premium';
  const noteParts = [];
  if (cardDetails?.cardType)   noteParts.push(`Form: ${cardDetails.cardType}`);
  if (cardDetails?.fullName)   noteParts.push(`Name: ${cardDetails.fullName}`);
  if (cardDetails?.country)    noteParts.push(`Country: ${cardDetails.country}`);
  if (cardDetails?.cardType === 'physical' && cardDetails?.address) {
    noteParts.push(`Ship: ${cardDetails.address}, ${cardDetails.city || ''} ${cardDetails.state || ''} ${cardDetails.zip || ''}`.trim());
  }
  try {
    const res = await apiFetch('/api/client/cards/apply', {
      method: 'POST',
      auth: true,
      body: { type, note: noteParts.join(' | ') || undefined },
    });
    return { success: true, ...(res || {}) };
  } catch (err) {
    return { success: false, message: err?.message || 'Could not submit your request.' };
  }
};
// GET /api/client/crypto/addresses?asset=BTC
// Returns the list of Active deposit addresses for the calling client and
// the requested asset (max 3, deduped). The server prefers client-specific
// addresses (set by an admin in the Crypto Address Book) and falls back to
// the global pool. When nothing is provisioned, `provisioned` is false and
// the server has already pinged the admin audience to provision the asset.
//
// Auth/network errors propagate so the caller can show a generic technical
// error message to the user.
export const getClientDepositAddresses = async (asset) => {
  if (!asset) return { asset: '', scope: 'none', provisioned: false, addresses: [], network: null, networks: [] };
  const data = await apiFetch(
    `/api/client/crypto/addresses?asset=${encodeURIComponent(asset)}`,
    { auth: true }
  );
  const rawNetworks = Array.isArray(data?.networks) ? data.networks : [];
  const addresses = Array.isArray(data?.addresses) ? data.addresses.filter(Boolean).slice(0, 3) : [];
  // Accept older/alternate API responses that provide a flat address list
  // instead of the newer per-network buckets.
  const networks = rawNetworks.filter(n => Array.isArray(n?.addresses) && n.addresses.length > 0);
  if (networks.length === 0 && addresses.length > 0) {
    networks.push({ network: data?.network || null, addresses });
  }
  return {
    asset:       data?.asset || asset,
    scope:       data?.scope || 'none',
    provisioned: data?.provisioned === true || addresses.length > 0,
    addresses,
    network:     data?.network || null,
    // Array of { network: string|null, addresses: string[] }
    networks,
  };
};

// GET /api/admin/users/{userId}/crypto/addresses?asset=BTC
// Used only while an admin is previewing a client account. The admin token
// authorizes the target-user read; a client token is intentionally not
// available during impersonation.
export const getAdminPreviewDepositAddresses = async (userId, asset) => {
  if (!userId || !asset) {
    return { asset: asset || '', scope: 'none', provisioned: false, addresses: [], network: null, networks: [] };
  }
  const token = readAdminToken();
  if (!token) throw new Error('Admin session required to view deposit addresses.');
  const data = await fetch(
    `/api/admin/users/${encodeURIComponent(userId)}/crypto/addresses?asset=${encodeURIComponent(asset)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
  ).then(async (res) => {
    const text = await res.text();
    let body = null;
    if (text) { try { body = JSON.parse(text); } catch (_) {} }
    if (!res.ok) {
      const err = new Error((body && (body.message || body.error)) || `Request failed (${res.status}).`);
      err.status = res.status;
      err.code = body && body.error;
      throw err;
    }
    return body;
  });
  const rawNetworks = Array.isArray(data?.networks) ? data.networks : [];
  const addresses = Array.isArray(data?.addresses) ? data.addresses.filter(Boolean).slice(0, 3) : [];
  const networks = rawNetworks.filter(n => Array.isArray(n?.addresses) && n.addresses.length > 0);
  if (networks.length === 0 && addresses.length > 0) {
    networks.push({ network: data?.network || null, addresses });
  }
  return {
    asset: data?.asset || asset,
    scope: data?.scope || 'none',
    provisioned: data?.provisioned === true || addresses.length > 0,
    addresses,
    network: data?.network || null,
    networks,
  };
};

// ---------------------------------------------------------------------------
// Deposit request - client declares they have sent funds to an address.
// Creates a Pending deposit_request row; a Super Admin will review and credit
// the balance once the on-chain credit is verified.
//
//   asset    - 'BTC' | 'ETH' | 'USDT' | 'USD'
//   amount   - display-unit float (e.g. 0.5 for 0.5 BTC)
//   address  - destination address string (1..200 chars)
//   network  - optional network label ('ERC20', 'TRC20', ..., max 40 chars)
//
// Returns: { deposit_request: { id, asset, amount_display, address, network, status, created_at } }
// ---------------------------------------------------------------------------
export const getClientDepositRequests = () =>
  apiFetch('/api/client/deposit-requests', { auth: true });

export const createDepositRequest = async ({ asset, amount, address, network = null } = {}) => {
  if (!asset) throw new Error('Asset is required.');
  if (!amount || Number(amount) <= 0) throw new Error('Amount must be greater than 0.');
  if (!address || !String(address).trim()) throw new Error('Deposit address is required.');
  const body = { asset, amount: Number(amount), address: String(address).trim() };
  if (network) body.network = String(network).trim().slice(0, 40);
  return apiFetch('/api/client/deposit-requests', { method: 'POST', auth: true, body });
};

// ---------------------------------------------------------------------------
// Withdrawal submission - POSTs a real withdrawal request to the backend.
// The backend holds the amount immediately (debits balance, creates a Pending
// transactions row) and puts it in the admin review queue.
//
//   asset        - 'BTC' | 'ETH' | 'USDT' | 'USD'
//   amountDisplay - display-unit float (e.g. 0.05 for 0.05 BTC)
//   destination  - wallet address or bank account description (max 200 chars)
//   network      - optional network label ('ERC20', 'TRC20', 'SWIFT', 'ACH', ...)
//   note         - optional free-form note (max 500 chars)
//
// Returns the server response: { withdrawal, balances }
// ---------------------------------------------------------------------------
const WITHDRAWAL_DECIMALS = { BTC: 1e8, ETH: 1e9, USDT: 100, USD: 100, CARD: 100 };

export const submitWithdrawal = async ({ asset, amountDisplay, destination, network, note } = {}) => {
  const decimals = WITHDRAWAL_DECIMALS[asset];
  if (!decimals) throw new Error(`Unsupported asset: ${asset}`);
  const amount_minor = Math.round(Number(amountDisplay) * decimals);
  if (!Number.isFinite(amount_minor) || amount_minor <= 0) {
    throw new Error('Please enter a valid amount.');
  }
  const body = {
    asset,
    amount_minor,
    destination: String(destination || '').trim(),
  };
  if (network) body.network = String(network).trim().slice(0, 40);
  if (note)    body.note    = String(note).trim().slice(0, 500);
  return apiFetch('/api/client/withdrawals', { method: 'POST', auth: true, body });
};
