import catalog from './tradfi_catalog.json';

/** Offline / API-failure fallback - same symbols as GET /api/market/tradfi */
export const TRADFI_CATALOG = catalog;

export const tradfiSeedAssets = () =>
  TRADFI_CATALOG.map((entry) => ({
    id: entry.id,
    asset: entry.asset,
    ticker: entry.ticker,
    category: entry.category,
    icon: entry.icon || '',
    price: 0,
    change: 0,
    balance: 0,
    sparkline: [],
  }));
