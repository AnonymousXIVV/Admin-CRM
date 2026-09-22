import React, { useRef, useEffect, useState, useCallback, useContext, useMemo } from 'react';
import './Trades.css';
import { DataContext } from '../contexts/DataContext';
import { submitTrade, fetchMarketOrderBook, fetchMarketRecentTrades } from '../../api';
import { usePlatformSettings } from '../../platformDefaults';
import { isKycApproved } from '../kycUtils';

const readThemeVar = (name, fallback) => {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

const hexToRgba = (hex, alpha = 1) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
};

// Backend Pricing.php only knows how to settle USD ↔ BTC ↔ ETH ↔ USDT (these
// are the columns on the `balances` table). Any pair where either side is
// outside this set has no tradable settlement asset and the Buy/Sell buttons
// must show an explanatory disabled state instead of submitting.
const TRADABLE_ASSETS = ['USD', 'BTC', 'ETH', 'USDT'];

// Minor-unit scale per asset, matching Pricing.php DECIMALS. The trades
// endpoint takes integer minor units, so we multiply the user's display-unit
// amount by these scales (and Math.round) before posting.
const ASSET_SCALE = { USD: 100, USDT: 100, BTC: 1e8, ETH: 1e9 };

// Read the user's available balance (display units) for a given asset code.
const balanceFor = (balances, asset) => {
  if (!balances) return 0;
  const key = String(asset || '').toLowerCase();
  return Number(balances[key]) || 0;
};

// Format a minor-unit integer back to a human-readable display amount.
const fmtMinor = (minor, asset) => {
  const scale = ASSET_SCALE[asset] || 1;
  const v = Number(minor) / scale;
  // BTC/ETH show more decimals; fiat shows two.
  const dec = asset === 'BTC' ? 8 : asset === 'ETH' ? 6 : 2;
  return v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const ALL_MARKETS = {
  Crypto: [
    { symbol: 'BTCUSDT',  name: 'Bitcoin',       base: 'BTC',   quote: 'USDT', tv: 'BINANCE:BTCUSDT',  cgId: 'bitcoin',     icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/btc.png' },
    { symbol: 'ETHUSDT',  name: 'Ethereum',       base: 'ETH',   quote: 'USDT', tv: 'BINANCE:ETHUSDT',  cgId: 'ethereum',    icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/eth.png' },
    { symbol: 'BNBUSDT',  name: 'BNB',            base: 'BNB',   quote: 'USDT', tv: 'BINANCE:BNBUSDT',  cgId: 'binancecoin', icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/bnb.png' },
    { symbol: 'SOLUSDT',  name: 'Solana',         base: 'SOL',   quote: 'USDT', tv: 'BINANCE:SOLUSDT',  cgId: 'solana',      icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/sol.png' },
    { symbol: 'XRPUSDT',  name: 'XRP',            base: 'XRP',   quote: 'USDT', tv: 'BINANCE:XRPUSDT',  cgId: 'ripple',      icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/xrp.png' },
    { symbol: 'ADAUSDT',  name: 'Cardano',        base: 'ADA',   quote: 'USDT', tv: 'BINANCE:ADAUSDT',  cgId: 'cardano',     icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/ada.png' },
    { symbol: 'DOGEUSDT', name: 'Dogecoin',       base: 'DOGE',  quote: 'USDT', tv: 'BINANCE:DOGEUSDT', cgId: 'dogecoin',    icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/doge.png' },
    { symbol: 'AVAXUSDT', name: 'Avalanche',      base: 'AVAX',  quote: 'USDT', tv: 'BINANCE:AVAXUSDT', cgId: 'avalanche-2', icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/avax.png' },
    { symbol: 'DOTUSDT',  name: 'Polkadot',       base: 'DOT',   quote: 'USDT', tv: 'BINANCE:DOTUSDT',  cgId: 'polkadot',    icon: null },
    { symbol: 'LINKUSDT', name: 'Chainlink',      base: 'LINK',  quote: 'USDT', tv: 'BINANCE:LINKUSDT', cgId: 'chainlink',   icon: null },
    { symbol: 'UNIUSDT',  name: 'Uniswap',        base: 'UNI',   quote: 'USDT', tv: 'BINANCE:UNIUSDT',  cgId: 'uniswap',     icon: null },
  ],
  Stocks: [
    { symbol: 'AAPL',  name: 'Apple Inc.',      base: 'AAPL',  quote: 'USD', tv: 'NASDAQ:AAPL',  yf: 'AAPL',  icon: null },
    { symbol: 'MSFT',  name: 'Microsoft',       base: 'MSFT',  quote: 'USD', tv: 'NASDAQ:MSFT',  yf: 'MSFT',  icon: null },
    { symbol: 'GOOGL', name: 'Alphabet',        base: 'GOOGL', quote: 'USD', tv: 'NASDAQ:GOOGL', yf: 'GOOGL', icon: null },
    { symbol: 'AMZN',  name: 'Amazon',          base: 'AMZN',  quote: 'USD', tv: 'NASDAQ:AMZN',  yf: 'AMZN',  icon: null },
    { symbol: 'TSLA',  name: 'Tesla',           base: 'TSLA',  quote: 'USD', tv: 'NASDAQ:TSLA',  yf: 'TSLA',  icon: null },
    { symbol: 'NVDA',  name: 'NVIDIA',          base: 'NVDA',  quote: 'USD', tv: 'NASDAQ:NVDA',  yf: 'NVDA',  icon: null },
    { symbol: 'META',  name: 'Meta',            base: 'META',  quote: 'USD', tv: 'NASDAQ:META',  yf: 'META',  icon: null },
    { symbol: 'NFLX',  name: 'Netflix',         base: 'NFLX',  quote: 'USD', tv: 'NASDAQ:NFLX',  yf: 'NFLX',  icon: null },
    { symbol: 'JPM',   name: 'JPMorgan Chase',  base: 'JPM',   quote: 'USD', tv: 'NYSE:JPM',     yf: 'JPM',   icon: null },
    { symbol: 'BAC',   name: 'Bank of America', base: 'BAC',   quote: 'USD', tv: 'NYSE:BAC',     yf: 'BAC',   icon: null },
    { symbol: 'GS',    name: 'Goldman Sachs',   base: 'GS',    quote: 'USD', tv: 'NYSE:GS',      yf: 'GS',    icon: null },
    { symbol: 'BABA',  name: 'Alibaba',         base: 'BABA',  quote: 'USD', tv: 'NYSE:BABA',    yf: 'BABA',  icon: null },
  ],
  Forex: [
    { symbol: 'EURUSD', name: 'Euro / USD',           base: 'EUR', quote: 'USD', tv: 'FX:EURUSD', yf: 'EURUSD=X', icon: null },
    { symbol: 'GBPUSD', name: 'GBP / USD',            base: 'GBP', quote: 'USD', tv: 'FX:GBPUSD', yf: 'GBPUSD=X', icon: null },
    { symbol: 'USDJPY', name: 'USD / JPY',            base: 'USD', quote: 'JPY', tv: 'FX:USDJPY', yf: 'USDJPY=X', icon: null },
    { symbol: 'AUDUSD', name: 'AUD / USD',            base: 'AUD', quote: 'USD', tv: 'FX:AUDUSD', yf: 'AUDUSD=X', icon: null },
    { symbol: 'USDCHF', name: 'USD / CHF',            base: 'USD', quote: 'CHF', tv: 'FX:USDCHF', yf: 'USDCHF=X', icon: null },
    { symbol: 'USDCAD', name: 'USD / CAD',            base: 'USD', quote: 'CAD', tv: 'FX:USDCAD', yf: 'USDCAD=X', icon: null },
    { symbol: 'NZDUSD', name: 'NZD / USD',            base: 'NZD', quote: 'USD', tv: 'FX:NZDUSD', yf: 'NZDUSD=X', icon: null },
    { symbol: 'EURGBP', name: 'EUR / GBP',            base: 'EUR', quote: 'GBP', tv: 'FX:EURGBP', yf: 'EURGBP=X', icon: null },
  ],
  Commodities: [
    // Use TradingView's stable public commodity symbols for the embedded
    // chart. Exchange continuous-contract symbols can trigger TradingView's
    // "This symbol is only on TradingView" notice inside the widget.
    { symbol: 'XAUUSD', name: 'Gold',          base: 'XAU',   quote: 'USD', tv: 'TVC:GOLD',    yf: 'GC=F', icon: null },
    { symbol: 'XAGUSD', name: 'Silver',        base: 'XAG',   quote: 'USD', tv: 'TVC:SILVER',  yf: 'SI=F', icon: null },
    { symbol: 'USOIL',  name: 'Crude Oil WTI', base: 'OIL',   quote: 'USD', tv: 'TVC:USOIL',   yf: 'CL=F', icon: null },
    { symbol: 'UKOIL',  name: 'Brent Crude',   base: 'BRENT', quote: 'USD', tv: 'TVC:UKOIL',   yf: 'BZ=F', icon: null },
    { symbol: 'NATGAS', name: 'Natural Gas',   base: 'GAS',   quote: 'USD', tv: 'TVC:NATGAS',  yf: 'NG=F', icon: null },
    { symbol: 'WHEAT',  name: 'Wheat',         base: 'WHEAT', quote: 'USD', tv: 'TVC:WHEAT',   yf: 'ZW=F', icon: null },
    { symbol: 'CORN',   name: 'Corn',          base: 'CORN',  quote: 'USD', tv: 'TVC:CORN',    yf: 'ZC=F', icon: null },
    { symbol: 'COFFEE', name: 'Coffee',        base: 'COFFEE',quote: 'USD', tv: 'TVC:COFFEE',  yf: 'KC=F', icon: null },
  ],
};

// Keep the trading terminal's market icons in sync with the asset table. The
// terminal has a smaller curated list, but the asset table owns the canonical
// icon URLs for both crypto and traditional markets.
const MarketIcon = ({ market, size = 'row' }) => {
  const [imgFailed, setImgFailed] = useState(false);
  const fallback = String(market?.base || market?.symbol || '?').slice(0, 2);

  useEffect(() => {
    setImgFailed(false);
  }, [market?.icon]);

  if (market?.icon && !imgFailed) {
    return (
      <img
        src={market.icon}
        alt=""
        className={size === 'pair' ? 'bn-pair-icon' : 'bn-pr-icon'}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      className={size === 'pair' ? 'bn-pair-cat-dot' : 'bn-pr-placeholder'}
      aria-hidden="true"
    >
      {fallback}
    </span>
  );
};

const getDecimals = (p) => !p ? 2 : p >= 100 ? 2 : p >= 1 ? 4 : 6;

const fmtP = (p, d) => {
  if (!p && p !== 0) return '-';
  const dec = d ?? getDecimals(p);
  return p.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const fmtVol = (v) => {
  if (!v) return '-';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
  return String(v);
};

export default function Trades() {
  /* ── Auth / balances (live, server-backed) ── */
  const {
    currentUser,
    refreshSession,
    cryptoDataState = [],
    tradfiAssetsState = [],
  } = useContext(DataContext) || {};
  const balances = currentUser?.balances || {};
  const kycApproved = isKycApproved(currentUser);

  /* ── Market state ── */
  const [activeCategory, setActiveCategory] = useState('Crypto');
  const [selectedMarket, setSelectedMarket] = useState({ ...ALL_MARKETS.Crypto[0], category: 'Crypto' });
  const [pairSearch, setPairSearch] = useState('');
  const [marketListPrices, setMarketListPrices] = useState({});
  const [activeTradesTab, setActiveTradesTab] = useState('Market Trades');

  const marketGroups = useMemo(() => {
    const iconsByTicker = new Map();
    [...cryptoDataState, ...tradfiAssetsState].forEach(asset => {
      if (!asset?.icon) return;
      [asset.ticker, asset.symbol, asset.id]
        .filter(Boolean)
        .forEach(key => iconsByTicker.set(String(key).toUpperCase(), asset.icon));
    });

    return Object.fromEntries(
      Object.entries(ALL_MARKETS).map(([category, markets]) => [
        category,
        markets.map(market => ({
          ...market,
          icon: iconsByTicker.get(String(market.yf || market.base || market.symbol).toUpperCase()) || market.icon,
        })),
      ])
    );
  }, [cryptoDataState, tradfiAssetsState]);

  // Preserve the selected pair's live icon when the shared asset data arrives
  // after the terminal has already rendered.
  useEffect(() => {
    const updated = Object.values(marketGroups)
      .flat()
      .find(market => market.symbol === selectedMarket.symbol);
    if (updated) {
      setSelectedMarket(previous => ({ ...previous, ...updated }));
    }
  }, [marketGroups, selectedMarket.symbol]);

  /* ── Ticker ── */
  const [ticker, setTicker] = useState({ price: 0, change: 0, high: 0, low: 0, volume: 0, prevClose: 0 });
  const [priceFlash, setPriceFlash] = useState(null);
  const lastPriceRef = useRef(0);

  /* ── Order form ── */
  const [orderType, setOrderType] = useState('Limit');
  const [buyPrice, setBuyPrice] = useState('');
  const [buySize, setBuySize] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellSize, setSellSize] = useState('');
  const [buySlider, setBuySlider] = useState(0);
  const [sellSlider, setSellSlider] = useState(0);
  const [tpsl, setTpsl] = useState(false);

  /* ── Order book / trades ── */
  const [asks, setAsks] = useState([]);
  const [bids, setBids] = useState([]);
  const [mktTrades, setMktTrades] = useState([]);

  /* ── Trade execution ── */
  // `submitting` blocks both Buy and Sell while a request is in flight so a
  // double-click can't double-spend. `tradeNotice` drives the inline banner
  // shown above the order form (success in green, error in red, auto-clears).
  const [submitting, setSubmitting] = useState(false);
  const [tradeNotice, setTradeNotice] = useState(null); // { kind: 'ok'|'err', text }

  /* ── Chart ── */
  const [chartTab, setChartTab] = useState('Chart');
  const [activeBottomTab, setActiveBottomTab] = useState('Positions');
  const tvRef = useRef(null);
  const tvLoadedRef = useRef(false);
  const fetchIvRef = useRef(null);
  const wsRef = useRef(null);
  const priceFlashTimeoutRef = useRef(null);

  const flashPriceChange = useCallback((price, prev) => {
    if (prev > 0 && price !== prev) {
      setPriceFlash(price > prev ? 'up' : 'down');
      if (priceFlashTimeoutRef.current) clearTimeout(priceFlashTimeoutRef.current);
      priceFlashTimeoutRef.current = setTimeout(() => setPriceFlash(null), 700);
    }
  }, []);

  const currentPrice = ticker.price;
  const dec = getDecimals(currentPrice);
  const changePositive = ticker.change >= 0;
  const changeColor = changePositive ? '#0ECB81' : '#F6465D';
  const priceColor = priceFlash === 'up' ? '#0ECB81' : priceFlash === 'down' ? '#F6465D' : changeColor;

  /* ── Trade eligibility ──
     A pair is settleable iff both sides are in TRADABLE_ASSETS - that maps
     1:1 to the columns Pricing.php and the trades_create endpoint know how
     to debit/credit. Stocks / forex / commodities are display-only for now
     because there's no asset column to settle them into. */
  const baseTradable  = TRADABLE_ASSETS.includes(selectedMarket.base);
  const quoteTradable = TRADABLE_ASSETS.includes(selectedMarket.quote);
  const pairTradable  = baseTradable && quoteTradable;
  const tradeBlockedReason =
      !currentUser           ? 'Sign in to trade.'
    : !pairTradable          ? `Trading is only enabled for ${TRADABLE_ASSETS.filter(a=>a!=='USD').join(', ')} pairs right now.`
    : !kycApproved           ? 'Complete KYC to enable trading.'
    : null;

  // Effective price used to convert a BUY's BASE-Amount field into the
  // QUOTE-minor amount we send to the server. We prefer whatever the user
  // typed in Limit/Stop modes, but fall back to the live price for Market
  // (and any time the field is empty/non-numeric).
  const effBuyPrice  = (orderType !== 'Market' && parseFloat(buyPrice))  ? parseFloat(buyPrice)  : currentPrice;
  const effSellPrice = (orderType !== 'Market' && parseFloat(sellPrice)) ? parseFloat(sellPrice) : currentPrice;

  // Estimated source-asset spend for each side, in display units. Used both
  // for the "≈ ... USDT" hint and for the pre-flight balance check so the
  // user gets a friendly error instead of a server-side `insufficient_funds`.
  const buyCostQuote  = (parseFloat(buySize)  || 0) * (effBuyPrice  || 0);
  const sellSizeBase  =  parseFloat(sellSize) || 0;

  // Wrapper around submitTrade that handles spinner, success/error banner,
  // and pulls fresh balances back from the server. Both Buy and Sell go
  // through here - they only differ in which side is `from` vs `to`.
  const executeTrade = useCallback(async ({ side, fromAsset, toAsset, fromAmountMinor }) => {
    if (submitting) return;
    if (tradeBlockedReason) {
      setTradeNotice({ kind: 'err', text: tradeBlockedReason });
      return;
    }
    if (!Number.isFinite(fromAmountMinor) || fromAmountMinor <= 0) {
      setTradeNotice({ kind: 'err', text: 'Enter an amount greater than zero.' });
      return;
    }
    // Client-side balance pre-flight (server enforces the real check too,
    // but this avoids a round-trip and gives a clearer message).
    const haveMinor = Math.floor(balanceFor(balances, fromAsset) * (ASSET_SCALE[fromAsset] || 1));
    if (haveMinor < fromAmountMinor) {
      setTradeNotice({
        kind: 'err',
        text: `Not enough ${fromAsset}. Available: ${fmtMinor(haveMinor, fromAsset)} ${fromAsset}.`,
      });
      return;
    }

    setSubmitting(true);
    setTradeNotice(null);
    try {
      const res = await submitTrade({ fromAsset, toAsset, fromAmountMinor });
      const trade = res?.trade || {};
      const got = fmtMinor(trade.to_amount_minor, toAsset);
      const paid = fmtMinor(trade.from_amount_minor, fromAsset);
      setTradeNotice({
        kind: 'ok',
        text: `${side === 'buy' ? 'Bought' : 'Sold'} ${got} ${toAsset} for ${paid} ${fromAsset}.`,
      });
      // Reset the side that just executed so the user doesn't accidentally
      // re-submit by hitting Enter.
      if (side === 'buy')  { setBuySize('');  setBuySlider(0);  }
      if (side === 'sell') { setSellSize(''); setSellSlider(0); }
      // Pull /api/client/me again so the new balances flow into the UI.
      if (typeof refreshSession === 'function') await refreshSession();
    } catch (err) {
      const code = err?.body?.error;
      let msg = err?.body?.message || err?.message || 'Trade failed. Please try again.';
      if (code === 'insufficient_funds') msg = err.body.message || 'Insufficient balance for this trade.';
      else if (code === 'kyc_required')  msg = 'Trading requires Approved KYC.';
      else if (code === 'unprocessable') msg = err.body.message || 'Amount is too small to convert.';
      setTradeNotice({ kind: 'err', text: msg });
    } finally {
      setSubmitting(false);
    }
  }, [submitting, tradeBlockedReason, balances, refreshSession]);

  // Auto-clear the notice after a few seconds so it doesn't stay forever.
  useEffect(() => {
    if (!tradeNotice) return undefined;
    const t = setTimeout(() => setTradeNotice(null), 6000);
    return () => clearTimeout(t);
  }, [tradeNotice]);

  const handleBuy = () => {
    // Buy = swap QUOTE → BASE (e.g. USDT → BTC on BTCUSDT).
    const fromAmountMinor = Math.round(buyCostQuote * (ASSET_SCALE[selectedMarket.quote] || 1));
    executeTrade({
      side: 'buy',
      fromAsset: selectedMarket.quote,
      toAsset:   selectedMarket.base,
      fromAmountMinor,
    });
  };

  const handleSell = () => {
    // Sell = swap BASE → QUOTE (e.g. BTC → USDT on BTCUSDT).
    const fromAmountMinor = Math.round(sellSizeBase * (ASSET_SCALE[selectedMarket.base] || 1));
    executeTrade({
      side: 'sell',
      fromAsset: selectedMarket.base,
      toAsset:   selectedMarket.quote,
      fromAmountMinor,
    });
  };

  /* ── Live ticker fetch ──
     Crypto goes straight to CoinGecko (24-hour high/low/volume come back in
     the same call). Stocks, forex and commodities go through our backend
     quote proxy, which talks to Yahoo Finance server-side and caches the
     result for 30s - that avoids CORS and stays under upstream rate limits. */
  const fetchTicker = useCallback(async (mkt) => {
    try {
      let d;
      if (mkt.cgId) {
        const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${mkt.cgId}&order=market_cap_desc&per_page=1&page=1&sparkline=false`);
        if (!r.ok) return;
        const [coin] = await r.json();
        if (!coin) return;
        d = { price: coin.current_price, change: coin.price_change_percentage_24h, high: coin.high_24h, low: coin.low_24h, volume: coin.total_volume, prevClose: coin.current_price - (coin.price_change_24h || 0) };
      } else if (mkt.yf) {
        const r = await fetch(`/api/market/quote?symbol=${encodeURIComponent(mkt.yf)}`);
        if (!r.ok) return;
        const q = await r.json();
        if (!q || !Number.isFinite(q.price)) return;
        d = {
          price:     q.price,
          change:    Number.isFinite(q.change) ? q.change : 0,
          high:      Number.isFinite(q.high)   ? q.high   : q.price,
          low:       Number.isFinite(q.low)    ? q.low    : q.price,
          volume:    Number.isFinite(q.volume) ? q.volume : 0,
          prevClose: Number.isFinite(q.prev_close) ? q.prev_close : q.price,
        };
      }
      if (d) {
        const prev = lastPriceRef.current;
        flashPriceChange(d.price, prev);
        lastPriceRef.current = d.price;
        setTicker(d);
      }
    } catch (_) {}
  }, [flashPriceChange]);

  useEffect(() => {
    lastPriceRef.current = 0;
    setTicker({ price: 0, change: 0, high: 0, low: 0, volume: 0, prevClose: 0 });

    // Tear down any previous connection
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    clearInterval(fetchIvRef.current);
    if (priceFlashTimeoutRef.current) clearTimeout(priceFlashTimeoutRef.current);

    if (selectedMarket.cgId) {
      // ── Crypto: Binance WebSocket - true real-time, no rate limits ──
      const symbol = selectedMarket.symbol.toUpperCase();

      // Fetch a price snapshot immediately so the order book isn't blank
      // while the WebSocket handshake is in progress.
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          const price     = parseFloat(data.lastPrice);
          const change    = parseFloat(data.priceChangePercent);
          const high      = parseFloat(data.highPrice);
          const low       = parseFloat(data.lowPrice);
          const volume    = parseFloat(data.quoteVolume);
          const prevClose = parseFloat(data.prevClosePrice);
          if (!Number.isFinite(price)) return;
          lastPriceRef.current = price;
          setTicker({ price, change, high, low, volume, prevClose });
        })
        .catch(() => {});

      const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data);
          const price     = parseFloat(d.c); // last price
          const change    = parseFloat(d.P); // 24h % change
          const high      = parseFloat(d.h);
          const low       = parseFloat(d.l);
          const volume    = parseFloat(d.q); // 24h quote asset volume (USD-equivalent)
          const prevClose = parseFloat(d.x);
          if (!Number.isFinite(price)) return;
          const prev = lastPriceRef.current;
          flashPriceChange(price, prev);
          lastPriceRef.current = price;
          setTicker({ price, change, high, low, volume, prevClose });
        } catch (_) {}
      };

      ws.onerror = () => {};
      ws.onclose = () => {};
    } else if (selectedMarket.yf) {
      // ── Stocks / Forex / Commodities: poll the backend proxy ──
      fetchTicker(selectedMarket);
      fetchIvRef.current = setInterval(() => fetchTicker(selectedMarket), 5000);
    }

    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      clearInterval(fetchIvRef.current);
      if (priceFlashTimeoutRef.current) clearTimeout(priceFlashTimeoutRef.current);
    };
  }, [selectedMarket, fetchTicker, flashPriceChange]);

  /* ── Order book + market trades (live API) ── */
  useEffect(() => {
    let cancelled = false;
    const loadBook = async () => {
      try {
        const params = selectedMarket.cgId
          ? { symbol: selectedMarket.symbol }
          : selectedMarket.yf
            ? { yf: selectedMarket.yf }
            : null;
        if (!params) return;
        const [book, tradesRes] = await Promise.all([
          fetchMarketOrderBook(params),
          selectedMarket.cgId
            ? fetchMarketRecentTrades(selectedMarket.symbol)
            : Promise.resolve({ trades: [] }),
        ]);
        if (cancelled) return;
        const askRows = Array.isArray(book.asks) ? [...book.asks].sort((a, b) => a.price - b.price).slice(0, 14) : [];
        const bidRows = Array.isArray(book.bids) ? [...book.bids].sort((a, b) => b.price - a.price).slice(0, 14) : [];
        setAsks(askRows);
        setBids(bidRows);
        if (tradesRes?.trades?.length) {
          setMktTrades(tradesRes.trades);
        }
      } catch (_) {
        if (!cancelled) {
          setAsks([]);
          setBids([]);
        }
      }
    };
    loadBook();
    const iv = setInterval(loadBook, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [selectedMarket.symbol, selectedMarket.cgId, selectedMarket.yf]);

  /* ── Category list prices ──
     Crypto rows come from CoinGecko's `simple/price` (one round-trip, every
     symbol). Non-crypto rows (stocks/forex/commodities) each go through our
     backend quote proxy in parallel - that endpoint caches each symbol for
     30 seconds so flipping between categories is essentially free. */
  useEffect(() => {
    let cancelled = false;
    const mkts = marketGroups[activeCategory] || [];

    const cryptoMkts = mkts.filter(m => m.cgId);
    if (cryptoMkts.length) {
      // Binance REST - one batched call, no API key, no rate limits
      const symbols = JSON.stringify(cryptoMkts.map(m => m.symbol.toUpperCase()));
      fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data || cancelled) return;
          setMarketListPrices(prev => {
            const next = { ...prev };
            data.forEach(t => {
              const price = parseFloat(t.lastPrice);
              const change = parseFloat(t.priceChangePercent);
              if (!Number.isFinite(price)) return;
              next[t.symbol] = {
                price,
                change: Number.isFinite(change) ? change : 0,
              };
            });
            return next;
          });
        })
        .catch(() => {});
    }

    const yfMkts = mkts.filter(m => !m.cgId && m.yf);
    if (yfMkts.length) {
      Promise.allSettled(yfMkts.map(m =>
        fetch(`/api/market/quote?symbol=${encodeURIComponent(m.yf)}`)
          .then(r => r.ok ? r.json() : null)
          .then(q => ({ m, q }))
      )).then(results => {
        if (cancelled) return;
        setMarketListPrices(prev => {
          const next = { ...prev };
          results.forEach(res => {
            if (res.status !== 'fulfilled' || !res.value?.q) return;
            const { m, q } = res.value;
            const price = Number(q.price);
            if (Number.isFinite(price)) {
              const change = Number(q.change);
              next[m.symbol] = { price, change: Number.isFinite(change) ? change : 0 };
            }
          });
          return next;
        });
      });
    }

    return () => { cancelled = true; };
  }, [activeCategory, marketGroups]);

  const platformSettings = usePlatformSettings();
  const chartThemeKey = [
    platformSettings.backgroundColor,
    platformSettings.secondaryColor,
    platformSettings.textColor,
  ].join('|');

  /* ── TradingView widget (follows admin light/dark theme) ── */
  useEffect(() => {
    const build = () => {
      if (!tvRef.current) return;
      tvRef.current.innerHTML = '';
      const id = 'tv_' + Date.now();
      const el = document.createElement('div');
      el.id = id; el.style.cssText = 'width:100%;height:100%;';
      tvRef.current.appendChild(el);
      const isLight = document.documentElement.dataset.themeMode === 'light';
      const chartBg = readThemeVar('--ui-chart-bg', '#0B0E11');
      const chartGrid = readThemeVar('--ui-chart-grid', 'rgba(43,49,57,0.6)');
      const chartToolbar = readThemeVar('--ui-chart-toolbar', '#161A1E');
      try {
        new window.TradingView.widget({
          autosize: true, symbol: selectedMarket.tv, interval: '15', theme: isLight ? 'light' : 'dark',
          style: '1', locale: 'en', container_id: id,
          hide_side_toolbar: false, allow_symbol_change: false,
          backgroundColor: hexToRgba(chartBg, 1) || chartBg,
          gridColor: chartGrid,
          toolbar_bg: chartToolbar, save_image: false,
        });
      } catch (_) {}
    };
    const onTheme = () => build();
    window.addEventListener('platform-theme-updated', onTheme);
    if (window.TradingView) { build(); return () => window.removeEventListener('platform-theme-updated', onTheme); }
    if (!tvLoadedRef.current) {
      tvLoadedRef.current = true;
      const s = document.createElement('script');
      s.src = 'https://s3.tradingview.com/tv.js';
      s.async = true; s.onload = build;
      document.body.appendChild(s);
      return () => window.removeEventListener('platform-theme-updated', onTheme);
    }
    const chk = setInterval(() => { if (window.TradingView) { clearInterval(chk); build(); } }, 200);
    return () => {
      clearInterval(chk);
      window.removeEventListener('platform-theme-updated', onTheme);
    };
  }, [selectedMarket.tv, chartThemeKey]);

  const handleMarketSelect = (mkt, cat) => {
    setSelectedMarket({ ...mkt, category: cat });
  };

  const filteredPairs = (marketGroups[activeCategory] || []).filter(m => {
    const q = pairSearch.toLowerCase();
    return !q || m.symbol.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  });

  const maxAsk = asks.length ? Math.max(...asks.map(a => a.size)) : 1;
  const maxBid = bids.length ? Math.max(...bids.map(b => b.size)) : 1;

  const SliderBar = ({ value, onChange }) => (
    <div className="bn-slider-wrap">
      <input type="range" min="0" max="100" value={value} onChange={e => onChange(+e.target.value)} className="bn-slider" />
      <div className="bn-slider-dots">
        {[0, 25, 50, 75, 100].map(p => (
          <button key={p} type="button" className={`bn-sdot ${value >= p ? 'active' : ''}`} onClick={() => onChange(p)}>
            <span className="bn-spct">{p}%</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="bn-trades-page">

      {/*  TOP BAR  */}
      <div className="bn-topbar">
        {/* Pair info */}
        <div className="bn-pair-block">
          <MarketIcon market={selectedMarket} size="pair" />
          <div>
            <div className="bn-pair-name">{selectedMarket.symbol}</div>
            <div className="bn-pair-cat">{selectedMarket.category || 'Crypto'}</div>
          </div>
        </div>

        {/* Price */}
        <div className="bn-price-block">
          <span className="bn-price-main" style={{ color: priceColor }}>{currentPrice ? fmtP(currentPrice, dec) : '-'}</span>
          <span className="bn-price-sub" style={{ color: changeColor }}>
            {ticker.change != null ? `${changePositive ? '+' : ''}${ticker.change.toFixed(2)}%` : '-'}
          </span>
        </div>

        {/* Stats */}
        <div className="bn-stats-bar">
          <div className="bn-stat"><span className="bn-sl">24h Chg</span><span className="bn-sv" style={{ color: changeColor }}>{ticker.change != null ? `${changePositive ? '+' : ''}${ticker.change.toFixed(2)}%` : '-'}</span></div>
          <div className="bn-stat"><span className="bn-sl">24h High</span><span className="bn-sv">{ticker.high ? fmtP(ticker.high, dec) : '-'}</span></div>
          <div className="bn-stat"><span className="bn-sl">24h Low</span><span className="bn-sv">{ticker.low ? fmtP(ticker.low, dec) : '-'}</span></div>
          <div className="bn-stat"><span className="bn-sl">24h Vol({selectedMarket.base})</span><span className="bn-sv">{fmtVol(ticker.volume)}</span></div>
          {selectedMarket.cgId && <>
            <div className="bn-stat"><span className="bn-sl">Funding</span><span className="bn-sv" style={{ color: '#0ECB81' }}>0.00010%</span></div>
          </>}
          {selectedMarket.yf && <>
            <div className="bn-stat"><span className="bn-sl">Prev Close</span><span className="bn-sv">{ticker.prevClose ? fmtP(ticker.prevClose, dec) : '-'}</span></div>
          </>}
          <div className="bn-stat bn-live-stat"><span className="bn-live-dot" /><span className="bn-sl">Live</span></div>
        </div>
      </div>

      {/*  MAIN 3-COLUMN BODY  */}
      <div className="bn-main-body">

        {/* ── LEFT: Order Book ── */}
        <div className="bn-left-panel">
          <div className="bn-ob-tabs">
            <span className="bn-ob-tab-title">Order Book</span>
          </div>
          <div className="bn-ob-header-row">
            <span>Price({selectedMarket.quote})</span>
            <span>Qty</span>
            <span>Total</span>
          </div>
          <div className="bn-ob-asks-wrap">
            {[...asks].reverse().map((r, i) => {
              const pct = (r.size / maxAsk) * 100;
              return (
                <div key={i} className="bn-ob-row ask-row" style={{ '--d': `${pct}%` }}
                  onClick={() => { setBuyPrice(r.price.toFixed(dec)); setSellPrice(r.price.toFixed(dec)); }}>
                  <span style={{ color: '#F6465D' }}>{fmtP(r.price, dec)}</span>
                  <span>{r.size.toFixed(4)}</span>
                  <span>{(r.price * r.size).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
          <div className="bn-ob-mid-row">
            <span style={{ color: priceColor, fontWeight: 700, fontSize: 14 }}>{currentPrice ? fmtP(currentPrice, dec) : '-'}</span>
            <span style={{ color: '#848E9C', fontSize: 11 }}>{selectedMarket.base}/{selectedMarket.quote}</span>
          </div>
          <div className="bn-ob-bids-wrap">
            {bids.map((r, i) => {
              const pct = (r.size / maxBid) * 100;
              return (
                <div key={i} className="bn-ob-row bid-row" style={{ '--d': `${pct}%` }}
                  onClick={() => { setBuyPrice(r.price.toFixed(dec)); setSellPrice(r.price.toFixed(dec)); }}>
                  <span style={{ color: '#0ECB81' }}>{fmtP(r.price, dec)}</span>
                  <span>{r.size.toFixed(4)}</span>
                  <span>{(r.price * r.size).toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── CENTER: Chart + Order Form ── */}
        <div className="bn-center-panel">

          {/* Chart section */}
          <div className="bn-chart-section">
            <div className="bn-chart-tabs-bar">
              <div className="bn-chart-tabs-primary">
                {[
                  { id: 'Chart', label: 'Chart' },
                  { id: 'Info', label: 'Info' },
                  { id: 'Trading Data', label: 'Trading Data', short: 'Data' },
                  { id: 'Square', label: 'Square' },
                ].map(({ id, label, short }) => (
                  <button
                    key={id}
                    type="button"
                    className={`bn-chart-tab ${chartTab === id ? 'active' : ''}`}
                    data-short={short || undefined}
                    onClick={() => setChartTab(id)}
                  >
                    <span className="bn-chart-tab-label">{label}</span>
                    {short ? <span className="bn-chart-tab-label--short">{short}</span> : null}
                  </button>
                ))}
              </div>
              <div className="bn-chart-tabs-tf">
                {['1s', '1m', '5m', '15m', '1H', '4H', '1D', '1W'].map(tf => (
                  <button key={tf} type="button" className="bn-tf-btn">{tf}</button>
                ))}
              </div>
            </div>
            <div ref={tvRef} className="bn-chart-container" />
          </div>

          {/* Order form - BELOW chart (Binance layout) */}
          <div className="bn-orderform-section">
            <div className="bn-of-header">
              <div className="bn-of-type-tabs">
                {['Limit', 'Market', 'Stop Limit'].map(t => (
                  <button key={t} type="button" className={`bn-of-tab ${orderType === t ? 'active' : ''}`} onClick={() => setOrderType(t)}>{t}</button>
                ))}
              </div>
              <label className="bn-checkbox-label" style={{ marginLeft: 'auto' }}>
                <input type="checkbox" checked={tpsl} onChange={e => setTpsl(e.target.checked)} className="bn-checkbox" />
                <span>TP/SL</span>
              </label>
            </div>

            {tradeNotice && (
              <div
                role="status"
                style={{
                  margin: '0 12px 8px',
                  padding: '8px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: tradeNotice.kind === 'ok' ? '#0ECB81' : '#F6465D',
                  background: tradeNotice.kind === 'ok' ? 'rgba(14,203,129,0.10)' : 'rgba(246,70,93,0.10)',
                  border: `1px solid ${tradeNotice.kind === 'ok' ? 'rgba(14,203,129,0.35)' : 'rgba(246,70,93,0.35)'}`,
                }}
              >
                {tradeNotice.text}
              </div>
            )}
            {!tradeNotice && tradeBlockedReason && (
              <div style={{ margin: '0 12px 8px', fontSize: 11, color: '#848E9C' }}>
                {tradeBlockedReason}
              </div>
            )}

            <div className="bn-of-columns">
              {/* BUY column */}
              <div className="bn-of-col">
                <div className="bn-avail-row">
                  <span className="bn-muted">Avbl</span>
                  <span className="bn-muted">
                    {currentUser
                      ? `${balanceFor(balances, selectedMarket.quote).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${selectedMarket.quote}`
                      : `- ${selectedMarket.quote}`}
                  </span>
                </div>
                {orderType !== 'Market' ? (
                  <div className="bn-input-wrap">
                    <span className="bn-input-label">Price</span>
                    <input type="number" className="bn-input" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder={currentPrice ? fmtP(currentPrice, dec) : '0.00'} />
                    <span className="bn-input-suffix">{selectedMarket.quote}</span>
                    <button type="button" className="bn-bbo-btn" onClick={() => setBuyPrice(currentPrice.toFixed(dec))}>BBO</button>
                  </div>
                ) : (
                  <div className="bn-input-wrap" style={{ opacity: 0.6 }}>
                    <span className="bn-input-label">Price</span>
                    <input type="text" className="bn-input" value="Market" readOnly />
                    <span className="bn-input-suffix">{selectedMarket.quote}</span>
                  </div>
                )}
                <div className="bn-input-wrap">
                  <span className="bn-input-label">Amount</span>
                  <input type="number" className="bn-input" value={buySize} onChange={e => setBuySize(e.target.value)} placeholder="0.0000" />
                  <span className="bn-input-suffix">{selectedMarket.base}</span>
                </div>
                <SliderBar value={buySlider} onChange={setBuySlider} />
                {buySize && (
                  <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>
                    ≈ {buyCostQuote.toFixed(2)} {selectedMarket.quote}
                  </div>
                )}
                <button
                  type="button"
                  className="bn-buy-btn"
                  onClick={handleBuy}
                  disabled={submitting || !!tradeBlockedReason || !buySize}
                  title={tradeBlockedReason || ''}
                  style={(submitting || tradeBlockedReason || !buySize) ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                >
                  {submitting ? 'Placing...' : `Buy / Long ${selectedMarket.base}`}
                </button>
              </div>

              {/* SELL column */}
              <div className="bn-of-col">
                <div className="bn-avail-row">
                  <span className="bn-muted">Avbl</span>
                  <span className="bn-muted">
                    {currentUser
                      ? `${balanceFor(balances, selectedMarket.base).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${selectedMarket.base}`
                      : `- ${selectedMarket.base}`}
                  </span>
                </div>
                {orderType !== 'Market' ? (
                  <div className="bn-input-wrap">
                    <span className="bn-input-label">Price</span>
                    <input type="number" className="bn-input" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder={currentPrice ? fmtP(currentPrice, dec) : '0.00'} />
                    <span className="bn-input-suffix">{selectedMarket.quote}</span>
                    <button type="button" className="bn-bbo-btn" onClick={() => setSellPrice(currentPrice.toFixed(dec))}>BBO</button>
                  </div>
                ) : (
                  <div className="bn-input-wrap" style={{ opacity: 0.6 }}>
                    <span className="bn-input-label">Price</span>
                    <input type="text" className="bn-input" value="Market" readOnly />
                    <span className="bn-input-suffix">{selectedMarket.quote}</span>
                  </div>
                )}
                <div className="bn-input-wrap">
                  <span className="bn-input-label">Amount</span>
                  <input type="number" className="bn-input" value={sellSize} onChange={e => setSellSize(e.target.value)} placeholder="0.0000" />
                  <span className="bn-input-suffix">{selectedMarket.base}</span>
                </div>
                <SliderBar value={sellSlider} onChange={setSellSlider} />
                {sellSize && (
                  <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>
                    ≈ {(sellSizeBase * (effSellPrice || 0)).toFixed(2)} {selectedMarket.quote}
                  </div>
                )}
                <button
                  type="button"
                  className="bn-sell-btn"
                  onClick={handleSell}
                  disabled={submitting || !!tradeBlockedReason || !sellSize}
                  title={tradeBlockedReason || ''}
                  style={(submitting || tradeBlockedReason || !sellSize) ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
                >
                  {submitting ? 'Placing...' : `Sell / Short ${selectedMarket.base}`}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Pairs List + Market Trades ── */}
        <div className="bn-right-panel">

          {/* Pairs section */}
          <div className="bn-pairs-section">
            <div className="bn-pairs-search-row">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="5.5" cy="5.5" r="4" stroke="#848E9C" strokeWidth="1.2"/><path d="M9 9L12 12" stroke="#848E9C" strokeWidth="1.2" strokeLinecap="round"/></svg>
              <input className="bn-pairs-search" placeholder="Search..." value={pairSearch} onChange={e => setPairSearch(e.target.value)} />
            </div>
            <div className="bn-cat-tabs">
              {Object.keys(marketGroups).map(cat => (
                <button key={cat} type="button" className={`bn-cat-tab ${activeCategory === cat ? 'active' : ''}`} onClick={() => { setActiveCategory(cat); setPairSearch(''); }}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="bn-pairs-header">
              <span>Pair</span>
              <span>Price</span>
              <span>24h Chg</span>
            </div>
            <div className="bn-pairs-list">
              {filteredPairs.map(m => {
                const rawLp = marketListPrices[m.symbol];
                const lp = rawLp && Number.isFinite(Number(rawLp.price))
                  ? {
                      price: Number(rawLp.price),
                      change: Number.isFinite(Number(rawLp.change)) ? Number(rawLp.change) : 0,
                    }
                  : null;
                const isSelected = selectedMarket.symbol === m.symbol;
                return (
                  <button key={m.symbol} type="button" className={`bn-pair-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleMarketSelect(m, activeCategory)}>
                    <div className="bn-pr-name">
                      <MarketIcon market={m} />
                      <div>
                        <div className="bn-pr-sym">{m.symbol}</div>
                        <div className="bn-pr-base">{m.name}</div>
                      </div>
                    </div>
                    <div className="bn-pr-price">{lp ? fmtP(lp.price) : (isSelected && currentPrice ? fmtP(currentPrice, dec) : '-')}</div>
                    <div className={`bn-pr-chg ${lp ? (lp.change >= 0 ? 'pos' : 'neg') : (isSelected && ticker.change != null ? (ticker.change >= 0 ? 'pos' : 'neg') : '')}`}>
                      {lp ? `${lp.change >= 0 ? '+' : ''}${lp.change.toFixed(2)}%` : (isSelected && ticker.change != null ? `${changePositive ? '+' : ''}${ticker.change.toFixed(2)}%` : '-')}
                    </div>
                  </button>
                );
              })}
              {filteredPairs.length === 0 && <div className="bn-pairs-empty">No results</div>}
            </div>
          </div>

          {/* Market Trades / My Trades */}
          <div className="bn-mkt-trades-section">
            <div className="bn-mt-tabs">
              {['Market Trades', 'My Trades'].map(t => (
                <button key={t} type="button" className={`bn-mt-tab ${activeTradesTab === t ? 'active' : ''}`} onClick={() => setActiveTradesTab(t)}>{t}</button>
              ))}
            </div>
            <div className="bn-mt-header">
              <span>Price({selectedMarket.quote})</span>
              <span>Qty({selectedMarket.base})</span>
              <span>Time</span>
            </div>
            <div className="bn-mt-list">
              {activeTradesTab === 'Market Trades'
                ? mktTrades.map((t, i) => (
                    <div key={i} className="bn-mt-row">
                      <span style={{ color: t.isBuy ? '#0ECB81' : '#F6465D' }}>{fmtP(t.price, dec)}</span>
                      <span>{t.size.toFixed(4)}</span>
                      <span style={{ color: '#848E9C' }}>{t.time}</span>
                    </div>
                  ))
                : <div className="bn-mt-empty">Log in to see your trades</div>
              }
            </div>
          </div>
        </div>
      </div>

      {/*  BOTTOM BAR (full width)  */}
      <div className="bn-bottom-bar">
        <div className="bn-bottom-tabs">
          {['Positions', 'Open Orders', 'Order History', 'Trade History', 'Transaction History', 'Assets'].map(t => (
            <button key={t} type="button" className={`bn-bottom-tab ${activeBottomTab === t ? 'active' : ''}`} onClick={() => setActiveBottomTab(t)}>
              {t}{(t === 'Positions' || t === 'Open Orders') && <span style={{ color: '#848E9C' }}>(0)</span>}
            </button>
          ))}
        </div>
        <div className="bn-bottom-empty">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ opacity: 0.25, flexShrink: 0 }}>
            <rect x="4" y="8" width="28" height="20" rx="2" stroke="#848E9C" strokeWidth="1.5"/>
            <path d="M4 14h28M10 20h6M22 20h4" stroke="#848E9C" strokeWidth="1.5"/>
          </svg>
          <span className="bn-muted">No {activeBottomTab.toLowerCase()} to display</span>
        </div>
      </div>

    </div>
  );
}
