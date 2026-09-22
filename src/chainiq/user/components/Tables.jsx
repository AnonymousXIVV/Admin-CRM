import React, { useState, useEffect, useMemo, useContext } from 'react';
import { DataContext } from '../contexts/DataContext';
import { formatMarketPrice } from '../utils/formatMarketPrice';

const PAGE_SIZE = 5;

// Maps every known transaction type to a CSS modifier class.
const TX_TYPE_CLASS = {
  'deposit':    'tx-type-deposit',
  'withdrawal': 'tx-type-withdraw',
  'withdraw':   'tx-type-withdraw',
  'trade':      'tx-type-trade',
  'transfer':   'tx-type-transfer',
  'card top-up': 'tx-type-card-topup',
  'adjustment': 'tx-type-topup',
  'top up':     'tx-type-topup',
};

// Normalise raw backend type strings to user-friendly display labels.
const TX_TYPE_LABEL = {
  'adjustment': 'Top Up',
};

function TxTypeBadge({ type }) {
  const key = (type || '').toLowerCase().trim();
  const cls = TX_TYPE_CLASS[key] || 'tx-type-default';
  const label = TX_TYPE_LABEL[key] || type || '-';
  return <span className={`tx-type-badge ${cls}`} style={{ fontWeight: 400 }}>{label}</span>;
}

// Status icons and CSS modifier map.
const TX_STATUS_META = {
  completed: { cls: 'tx-status-completed', icon: 'fa-check-circle' },
  pending:   { cls: 'tx-status-pending',   icon: 'fa-clock'        },
  failed:    { cls: 'tx-status-failed',     icon: 'fa-times-circle' },
  blocked:   { cls: 'tx-status-failed',     icon: 'fa-ban'          },
  frozen:    { cls: 'tx-status-pending',    icon: 'fa-snowflake'    },
  reversed:  { cls: 'tx-status-failed',     icon: 'fa-undo'         },
  cancelled: { cls: 'tx-status-failed',     icon: 'fa-times-circle' },
};

function TxStatusBadge({ status }) {
  const key  = (status || '').toLowerCase().trim();
  const meta = TX_STATUS_META[key] || { cls: 'tx-status-default', icon: 'fa-circle' };
  const label = key.charAt(0).toUpperCase() + key.slice(1);
  return (
    <span className={`tx-status-badge ${meta.cls}`} style={{ fontWeight: 400 }}>
      <i className={`fas ${meta.icon}`} style={{ fontSize: '0.7rem' }}></i>
      {label || '-'}
    </span>
  );
}

function truncId(id) {
  const s = String(id || '');
  return s.length > 10 ? s.slice(0, 8) + '...' : s;
}

function CopyIdButton({ id }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(String(id || '')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : 'Copy transaction ID'}
      style={{
        background: 'none',
        border: 'none',
        padding: '0 0 0 4px',
        cursor: 'pointer',
        color: copied ? 'var(--color-accent-green, #0ECB81)' : 'var(--color-text-disabled, #848E9C)',
        fontSize: '0.72rem',
        lineHeight: 1,
        verticalAlign: 'middle',
        transition: 'color 0.15s',
        flexShrink: 0,
      }}
      aria-label="Copy transaction ID"
    >
      <i className={copied ? 'fas fa-check' : 'far fa-copy'} />
    </button>
  );
}

function formatTxDate(date) {
  if (!(date instanceof Date) || isNaN(date)) return '-';
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC',
  });
}

// Tiny inline SVG sparkline - renders a polyline of the last 7 daily closes.
// Coloured green when trend is up, red when down. No external dependencies.
function Sparkline({ data }) {
  const W = 80, H = 28;
  if (!Array.isArray(data) || data.length < 2) {
    return <span style={{ color: 'var(--color-text-disabled)', fontSize: '0.65rem' }}>-</span>;
  }
  const prices = data.filter(p => p != null && Number.isFinite(p));
  if (prices.length < 2) {
    return <span style={{ color: 'var(--color-text-disabled)', fontSize: '0.65rem' }}>-</span>;
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * W;
      const y = H - ((p - min) / range) * (H - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const positive = prices[prices.length - 1] >= prices[0];
  const color = positive ? 'var(--color-accent-green)' : 'var(--color-accent-red)';
  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Asset icon with a fallback circle when the CDN icon URL is empty or fails.
// Fiat assets (USD, EUR, etc.) don't have crypto icons, so we render their
// ticker symbol inside a coloured circle instead.
const FIAT_SYMBOL = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$' };

function AssetIcon({ assetCode, icon, asset }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (assetCode === 'CARD') {
    return (
      <span className="asset-icon tx-asset-icon-fiat" style={{ backgroundColor: 'var(--ui-primary)' }}>
        <i className="fas fa-credit-card" style={{ fontSize: '10px', color: 'var(--ui-primary-text)' }}></i>
      </span>
    );
  }

  // Fallback: coloured circle with fiat symbol or first letter of ticker.
  const sym = FIAT_SYMBOL[assetCode] || (assetCode ? assetCode.charAt(0) : '?');
  const fallback = <span className="asset-icon tx-asset-icon-fiat">{sym}</span>;

  if (icon && !imgFailed) {
    return (
      <img
        src={icon}
        className="asset-icon"
        alt={asset}
        onError={() => setImgFailed(true)}
      />
    );
  }
  return fallback;
}

function useIsMobile(breakpoint = 768) {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= breakpoint);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [breakpoint]);

    return isMobile;
}

export const CryptoTable = ({ data, tradesEnabled = false, extendedMarketFilters = false }) => {
    const [currentPage, setCurrentPage] = useState(1);
    const [currentFilter, setCurrentFilter] = useState('all');
    const [currentSearch, setCurrentSearch] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    // Favorites live on the server (per account, synced across devices) -
    // see DataContext: cryptoFavoritesState + setCryptoFavorites.
    const { cryptoFavoritesState, setCryptoFavorites } = useContext(DataContext);
    const favorites = Array.isArray(cryptoFavoritesState) ? cryptoFavoritesState : [];
    const isMobile = useIsMobile();

    useEffect(() => {
        setCurrentPage(1);
    }, [currentSearch, currentFilter]);

    const handleFavorite = (id) => {
        const next = favorites.includes(id)
            ? favorites.filter(i => i !== id)
            : [...favorites, id];
        setCryptoFavorites(next);
    };

    const SPOT_TICKERS = useMemo(
        () => new Set(['BTC', 'ETH', 'BNB', 'SOL', 'USDT', 'USDC', 'ADA', 'MATIC', 'AVAX', 'LINK']),
        []
    );

    // Filter tabs differ based on whether the trades feature is enabled.
    // Trades on  → All / Crypto / Stocks / Commodities / Forex / Favorites
    // Trades off → All / Spot / Favorites (existing behaviour)
    const filterTabs = useMemo(
        () => (tradesEnabled || extendedMarketFilters)
            ? ['all', 'crypto', 'stocks', 'commodities', 'forex', 'favorites']
            : ['all', 'spot', 'favorites'],
        [tradesEnabled, extendedMarketFilters]
    );

    // If the active filter no longer exists for this mode, fall back to "all".
    useEffect(() => {
        if (!filterTabs.includes(currentFilter)) setCurrentFilter('all');
    }, [filterTabs, currentFilter]);

    const filteredData = useMemo(() => {
        let result = [...data];
        if (currentSearch.trim()) {
            const s = currentSearch.trim().toLowerCase();
            result = result.filter(
                d =>
                    d.asset.toLowerCase().includes(s) ||
                    d.ticker.toLowerCase().includes(s)
            );
        }
        if (currentFilter === 'favorites') {
            result = result.filter(d => favorites.includes(d.id));
        } else if (currentFilter === 'spot') {
            result = result.filter(d => SPOT_TICKERS.has(d.ticker));
        } else if (['crypto', 'stocks', 'commodities', 'forex'].includes(currentFilter)) {
            result = result.filter(d => (d.category || 'crypto') === currentFilter);
        }
        return result;
    }, [data, currentSearch, currentFilter, favorites, SPOT_TICKERS]);

    const pageCount = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, pageCount);

    const items = isMobile
        ? filteredData
        : filteredData.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const fallbackIcon = (ticker) =>
        `https://placehold.co/24x24/1e1e26/f0f0f5?text=${ticker}`;

    return (
        <div className="table-container">
            <div className="table-controls">
                <div className="search-box">
                    <i className="fas fa-search search-icon"></i>
                    <input
                        type="search"
                        name="crypto-asset-search-no-fill"
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck="false"
                        data-form-type="other"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-bwignore="true"
                        placeholder="Search assets..."
                        className="search-input crypto-search-input"
                        value={currentSearch}
                        readOnly={!searchFocused}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                        onChange={(e) => setCurrentSearch(e.target.value)}
                    />
                </div>
                <div className="table-tabs crypto-tabs">
                    {filterTabs.map(tab => (
                        <div
                            key={tab}
                            className={`table-tab ${currentFilter === tab ? 'active' : ''}`}
                            onClick={() => setCurrentFilter(tab)}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </div>
                    ))}
                </div>
            </div>

            <div className={`scrollable-table-wrapper${isMobile ? ' scrollable-table-wrapper--scroll' : ''}`}>
                {items.length === 0 ? (
                    <div className="account-row" style={{ justifyContent: 'center', margin: 12 }}>
                        <span className="account-row__desc">No assets match this filter.</span>
                    </div>
                ) : isMobile ? (
                    <div className="table-card-list">
                        {items.map(item => {
                            const isFav = favorites.includes(item.id);
                            const holdingValue = item.balance * item.price;
                            return (
                                <div className="table-card" key={item.id}>
                                    <div className="table-card-row">
                                        <div className="asset">
                                            <img
                                                src={item.icon}
                                                className="asset-icon"
                                                alt={item.asset}
                                                onError={(e) => { e.target.src = fallbackIcon(item.ticker); }}
                                            />
                                            <div>
                                                <span className="asset-name">{item.asset}</span>{' '}
                                                <span className="asset-ticker">{item.ticker}</span>
                                            </div>
                                        </div>
                                        <i
                                            className={`favorite-star ${isFav ? 'fas fa-star favorited' : 'far fa-star'}`}
                                            onClick={() => handleFavorite(item.id)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                    </div>
                                    <div className="table-card-row">
                                        <span className="label">Price</span>
                                        <span className="value">{formatMarketPrice(item.price, item.category)}</span>
                                    </div>
                                    <div className="table-card-row">
                                        <span className="label">24h</span>
                                        <span className={`value ${(Number.isFinite(item.change) ? item.change : 0) >= 0 ? 'positive' : 'negative'}`}>
                                            {(Number.isFinite(item.change) ? item.change : 0).toFixed(2)}%
                                        </span>
                                    </div>
                                    {Array.isArray(item.sparkline) && item.sparkline.length >= 2 && (
                                        <div className="table-card-row">
                                            <span className="label">7D Trend</span>
                                            <span className="value" style={{ lineHeight: 0 }}>
                                                <Sparkline data={item.sparkline} />
                                            </span>
                                        </div>
                                    )}
                                    <div className="table-card-row">
                                        <span className="label">Holdings</span>
                                        <span className="value">${(Number.isFinite(holdingValue) ? holdingValue : 0).toFixed(2)}</span>
                                    </div>
                                    <div className="table-card-row">
                                        <span className="label">Balance</span>
                                        <span className="value">{item.balance} {item.ticker}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <table className="crypto-table">
                        <thead>
                            <tr>
                                <th className="w-1/4 text-left">Asset</th>
                                <th className="w-1/6 text-left">Price</th>
                                <th className="w-1/6 text-left">24h</th>
                                <th style={{ width: '96px' }} className="text-left">7D Trend</th>
                                <th className="w-1/6 text-left">Holdings (USD)</th>
                                <th className="w-1/6 text-left">Balance</th>
                                <th className="w-1/12 text-left">Favorite</th>
                            </tr>
                        </thead>
                        <tbody className="crypto-table-body">
                            {items.map(item => {
                                const isFav = favorites.includes(item.id);
                                const safePrice = Number.isFinite(item.price) ? item.price : 0;
                                const safeBalance = Number.isFinite(item.balance) ? item.balance : 0;
                                const safeChange = Number.isFinite(item.change) ? item.change : 0;
                                const holdingValue = safeBalance * safePrice;
                                return (
                                    <tr key={item.id}>
                                        <td>
                                            <div className="asset">
                                                <img
                                                    src={item.icon}
                                                    className="asset-icon"
                                                    alt={item.asset}
                                                    onError={(e) => { e.target.src = fallbackIcon(item.ticker); }}
                                                />
                                                <div>
                                                    <span className="asset-name">{item.asset}</span>{' '}
                                                    <span className="asset-ticker">{item.ticker}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{formatMarketPrice(safePrice, item.category)}</td>
                                        <td className={safeChange >= 0 ? 'positive' : 'negative'}>
                                            {safeChange.toFixed(2)}%
                                        </td>
                                        <td style={{ paddingTop: '6px', paddingBottom: '6px' }}>
                                            <Sparkline data={item.sparkline} />
                                        </td>
                                        <td>${holdingValue.toFixed(2)}</td>
                                        <td>{item.balance} {item.ticker}</td>
                                        <td className="text-center">
                                            <i
                                                className={`favorite-star ${isFav ? 'fas fa-star favorited' : 'far fa-star'}`}
                                                onClick={() => handleFavorite(item.id)}
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {!isMobile && pageCount > 1 && (() => {
                const PAGES_PER_RANGE = 10;
                const currentRange = Math.floor((safePage - 1) / PAGES_PER_RANGE);
                const rangeStart = currentRange * PAGES_PER_RANGE + 1;
                const rangeEnd = Math.min(rangeStart + PAGES_PER_RANGE - 1, pageCount);
                const pageButtons = [...Array(rangeEnd - rangeStart + 1).keys()].map(i => rangeStart + i);
                
                return (
                    <div className="pagination-controls">
                        <button
                            className="pagination-button"
                            disabled={safePage === 1}
                            onClick={() => setCurrentPage(safePage - 1)}
                        >
                            Previous
                        </button>
                        {currentRange > 0 && (
                            <>
                                <button
                                    className="pagination-button"
                                    onClick={() => setCurrentPage(1)}
                                    title="Go to page 1"
                                >
                                    1
                                </button>
                                <span className="pagination-ellipsis" style={{ padding: '0 4px', color: '#848E9C' }}>
                                    ...
                                </span>
                            </>
                        )}
                        {pageButtons.map(pageNum => (
                            <button
                                key={pageNum}
                                className={`pagination-button ${pageNum === safePage ? 'active' : ''}`}
                                onClick={() => setCurrentPage(pageNum)}
                            >
                                {pageNum}
                            </button>
                        ))}
                        {rangeEnd < pageCount && (
                            <>
                                <span className="pagination-ellipsis" style={{ padding: '0 4px', color: '#848E9C' }}>
                                    ...
                                </span>
                                <button
                                    className="pagination-button"
                                    onClick={() => setCurrentPage(pageCount)}
                                    title={`Go to page ${pageCount}`}
                                >
                                    {pageCount}
                                </button>
                            </>
                        )}
                        <button
                            className="pagination-button"
                            disabled={safePage === pageCount}
                            onClick={() => setCurrentPage(safePage + 1)}
                        >
                            Next
                        </button>
                    </div>
                );
            })()}
        </div>
    );
};

// TransactionTable renders the full data array passed by the parent (Transactions.js
// already handles server-side pagination). No internal pagination here.
export const TransactionTable = ({ data }) => {
    const isMobile = useIsMobile();
    const items = data;

    return (
        <div className="table-container">
            <div className="scrollable-table-wrapper">
                {isMobile ? (
                    <div className="table-card-list">
                        {items.map(item => (
                            <div className="table-card" key={item.id}>
                                <div className="table-card-row">
                                    <span className="label">ID</span>
                                    <span className="value" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                            {truncId(item.id)}
                                        </span>
                                        <CopyIdButton id={item.id} />
                                    </span>
                                </div>
                                <div className="table-card-row">
                                    <span className="label">Date</span>
                                    <span className="value">{formatTxDate(item.date)}</span>
                                </div>
                                <div className="table-card-row">
                                    <span className="label">Asset</span>
                                    <span className="value" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        <AssetIcon assetCode={item.assetCode} icon={item.icon} asset={item.asset} />
                                        {item.asset}
                                    </span>
                                </div>
                                <div className="table-card-row">
                                    <span className="label">Type</span>
                                    <span className="value"><TxTypeBadge type={item.type} /></span>
                                </div>
                                <div className="table-card-row">
                                    <span className="label">Amount</span>
                                    <span className="value">{item.amount}</span>
                                </div>
                                <div className="table-card-row">
                                    <span className="label">Fee</span>
                                    <span className="value">{item.fee}</span>
                                </div>
                                <div className="table-card-row">
                                    <span className="label">Status</span>
                                    <span className="value"><TxStatusBadge status={item.status} /></span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <table className="transaction-table">
                        <colgroup>
                            <col style={{ width: '7rem' }} />
                            <col style={{ width: '11rem' }} />
                            <col style={{ width: '9rem' }} />
                            <col style={{ width: '8rem' }} />
                            <col style={{ width: '9rem' }} />
                            <col style={{ width: '7rem' }} />
                            <col style={{ width: '8rem' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Date</th>
                                <th>Asset</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Fee</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody className="transaction-table-body">
                            {items.map(item => (
                                <tr key={item.id}>
                                    <td>
                                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                                            <span
                                                style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                                                title={String(item.id)}
                                            >
                                                {truncId(item.id)}
                                            </span>
                                            <CopyIdButton id={item.id} />
                                        </span>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                                        {formatTxDate(item.date)}
                                    </td>
                                    <td>
                                        <div className="asset">
                                            <AssetIcon assetCode={item.assetCode} icon={item.icon} asset={item.asset} />
                                            <span>{item.asset}</span>
                                        </div>
                                    </td>
                                    <td><TxTypeBadge type={item.type} /></td>
                                    <td>{item.amount}</td>
                                    <td>{item.fee}</td>
                                    <td><TxStatusBadge status={item.status} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};
