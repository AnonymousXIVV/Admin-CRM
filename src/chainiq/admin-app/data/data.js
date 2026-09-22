import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_PLATFORM_SETTINGS } from '../../platformDefaults';

// --- Utility Functions ---
export const getAssetInfo = (assetTicker) => {
  const asset = cryptoData.find(a => a.ticker === assetTicker);
  return asset ? { name: asset.asset, logo: assetLogos[assetTicker] } : { name: assetTicker, logo: null };
};

export const formatAddress = (address) => {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

export const generatePlaceholderAddress = (prefix = '0x', length = 40) => {
  const chars = 'abcdef0123456789';
  let result = prefix;
  for (let i = 0; i < length - prefix.length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// --- Data ---
// NOTE: users/clients are now managed entirely through the CRM leads system (data.leads in App.jsx).
// This array is intentionally empty - do not add static crypto user records here.
export const users = [];

// Transactions are now created per-lead via the Transactions admin section.
export const transactionData = [];

// Activity log entries are generated from real lead actions at runtime.
export const activityLog = [];

export const auditLog = [];

export const cryptoData = [
  { id: 'crypto-1', asset: 'Bitcoin', ticker: 'BTC', price: 60000, change24h: 2.5, volume24h: 1000000000, marketCap: 1200000000000 },
  { id: 'crypto-2', asset: 'Ethereum', ticker: 'ETH', price: 2000, change24h: -1.2, volume24h: 500000000, marketCap: 240000000000 },
  { id: 'crypto-3', asset: 'USDT', ticker: 'USDT', price: 1.00, change24h: 0.0, volume24h: 70000000000, marketCap: 83000000000 },
  { id: 'crypto-4', asset: 'BNB', ticker: 'BNB', price: 550, change24h: 1.8, volume24h: 2500000000, marketCap: 90000000000 },
  { id: 'crypto-5', asset: 'USDC', ticker: 'USDC', price: 1.00, change24h: 0.0, volume24h: 2500000000, marketCap: 55000000000 },
  { id: 'crypto-6', asset: 'Solana', ticker: 'SOL', price: 100, change24h: 4.2, volume24h: 1800000000, marketCap: 42000000000 },
  { id: 'crypto-7', asset: 'Ripple', ticker: 'XRP', price: 0.55, change24h: 0.8, volume24h: 100000000, marketCap: 52000000000 },
  { id: 'crypto-8', asset: 'Cardano', ticker: 'ADA', price: 0.30, change24h: -0.5, volume24h: 80000000, marketCap: 15000000000 },
  { id: 'crypto-9', asset: 'Dogecoin', ticker: 'DOGE', price: 0.062, change24h: 2.1, volume24h: 900000000, marketCap: 8800000000 },
  { id: 'crypto-10', asset: 'Polygon', ticker: 'MATIC', price: 0.90, change24h: 1.5, volume24h: 500000000, marketCap: 9000000000 },
  { id: 'crypto-11', asset: 'Polkadot', ticker: 'DOT', price: 6.20, change24h: 2.7, volume24h: 450000000, marketCap: 7000000000 },
  { id: 'crypto-12', asset: 'Avalanche', ticker: 'AVAX', price: 20, change24h: 3.4, volume24h: 650000000, marketCap: 11000000000 },
  { id: 'crypto-14', asset: 'Chainlink', ticker: 'LINK', price: 12, change24h: -0.8, volume24h: 300000000, marketCap: 6200000000 },
  { id: 'crypto-15', asset: 'Uniswap', ticker: 'UNI', price: 7.50, change24h: 0.5, volume24h: 220000000, marketCap: 5200000000 },
  { id: 'crypto-16', asset: 'Litecoin', ticker: 'LTC', price: 150, change24h: 3.1, volume24h: 50000000, marketCap: 10000000000 },
  { id: 'crypto-17', asset: 'Bitcoin Cash', ticker: 'BCH', price: 220, change24h: 1.0, volume24h: 400000000, marketCap: 4300000000 },
  { id: 'crypto-18', asset: 'Stellar', ticker: 'XLM', price: 0.12, change24h: 0.4, volume24h: 180000000, marketCap: 3000000000 },
  { id: 'crypto-19', asset: 'Filecoin', ticker: 'FIL', price: 5.20, change24h: 0.9, volume24h: 150000000, marketCap: 2900000000 },
  { id: 'crypto-20', asset: 'NEAR Protocol', ticker: 'NEAR', price: 4.80, change24h: 2.4, volume24h: 210000000, marketCap: 2400000000 },
];

// Cards are issued per-lead through the Card Management admin section.
export const cardData = [];

// Withdrawals are logged per-lead through the Transactions admin section.
export const withdrawalData = [];

export const userFees = {
  depositFee: 0.01, // 1%
  withdrawalFee: 0.02, // 2%
  tradingFee: 0.001, // 0.1%
  cardIssuanceFee: 10.00,
  cardMaintenanceFee: 2.50,
};

// Per-lead fee overrides, keyed by lead ID. Set via the Fees admin section.
export const clientSpecificFees = {};

// Source of truth: src/platformDefaults.js. Keeping a single canonical
// defaults object means admin Settings, the user landing page, and the
// "Revert to Default Design" button all see the exact same baseline.
export const platformSettings = { ...DEFAULT_PLATFORM_SETTINGS };

export const globalAddressData = [];

// Per-lead crypto addresses, keyed by lead email. Managed via the Crypto Addresses admin section.
export const clientAddressData = [];

export const assetLogos = {
  BTC:  'https://cryptologos.cc/logos/bitcoin-btc-logo.png?v=026',
  ETH:  'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=026',
  USDT: 'https://cryptologos.cc/logos/tether-usdt-logo.png?v=026',
  BNB:  'https://cryptologos.cc/logos/bnb-bnb-logo.png?v=026',
  USDC: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=026',
  SOL:  'https://cryptologos.cc/logos/solana-sol-logo.png?v=026',
  TRX:  'https://cryptologos.cc/logos/tron-trx-logo.png?v=026',
  XRP:  'https://cryptologos.cc/logos/xrp-xrp-logo.png?v=026',
  ADA:  'https://cryptologos.cc/logos/cardano-ada-logo.png?v=026',
  DOGE: 'https://cryptologos.cc/logos/dogecoin-doge-logo.png?v=026',
  MATIC:'https://cryptologos.cc/logos/polygon-matic-logo.png?v=026',
  DOT:  'https://cryptologos.cc/logos/polkadot-new-dot-logo.png?v=026',
  AVAX: 'https://cryptologos.cc/logos/avalanche-avax-logo.png?v=026',
  LINK: 'https://cryptologos.cc/logos/chainlink-link-logo.png?v=026',
  UNI:  'https://cryptologos.cc/logos/uniswap-uni-logo.png?v=026',
  LTC:  'https://cryptologos.cc/logos/litecoin-ltc-logo.png?v=026',
  BCH:  'https://cryptologos.cc/logos/bitcoin-cash-bch-logo.png?v=026',
  XLM:  'https://cryptologos.cc/logos/stellar-xlm-logo.png?v=026',
  FIL:  'https://cryptologos.cc/logos/filecoin-fil-logo.png?v=026',
  NEAR: 'https://cryptologos.cc/logos/near-protocol-near-logo.png?v=026',
};

export const createLogAdminAction = (setAuditLog) => (admin, action, details) => {
  const newLog = { admin, action, details, timestamp: new Date() };
  setAuditLog(prevLogs => [newLog, ...prevLogs]);
};

export const getEffectiveFees = (userId, globalFees, clientSpecificFees) => {
  const clientFees = clientSpecificFees[userId] || {};
  return {
    depositFee: clientFees.depositFee !== undefined ? clientFees.depositFee : globalFees.depositFee,
    withdrawalFee: clientFees.withdrawalFee !== undefined ? clientFees.withdrawalFee : globalFees.withdrawalFee,
    tradingFee: clientFees.tradingFee !== undefined ? clientFees.tradingFee : globalFees.tradingFee,
    cardIssuanceFee: clientFees.cardIssuanceFee !== undefined ? clientFees.cardIssuanceFee : globalFees.cardIssuanceFee,
    cardMaintenanceFee: clientFees.cardMaintenanceFee !== undefined ? clientFees.cardMaintenanceFee : globalFees.cardMaintenanceFee,
  };
};

export const createLogActivity = (setActivityLog) => (userId, type, details) => {
  const newLog = { userId, type, details, timestamp: new Date() };
  setActivityLog(prevLogs => [newLog, ...prevLogs]);
};
