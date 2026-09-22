// Lightweight per-asset deposit address validators.
// Each validator returns:
//   { ok: true,  reason: null,   detected: 'friendly network name' }
//   { ok: false, reason: 'human-readable reason', detected: null }

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
const HEX40_RE  = /^0x[a-fA-F0-9]{40}$/;

function ok(detected)   { return { ok: true,  reason: null, detected: detected || null }; }
function bad(reason)    { return { ok: false, reason, detected: null }; }

function isEvm(a)  { return HEX40_RE.test(a); }
function isTrx(a)  { return /^T[a-zA-Z0-9]{33}$/.test(a); }
function isSol(a)  { return a.length >= 32 && a.length <= 44 && BASE58_RE.test(a); }
function isXlm(a)  { return /^G[A-Z2-7]{55}$/.test(a); }
function isXrp(a)  { return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a); }
function isBtc(a)  { return /^(bc1[a-z0-9]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a); }
function isLtc(a)  { return /^(ltc1[a-z0-9]{8,87}|[LM3][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(a); }
function isDoge(a) { return /^D[5-9A-HJ-NP-U][1-9A-HJ-NP-Za-km-z]{32}$/.test(a); }
function isAda(a)  { return /^addr1[a-z0-9]{50,98}$/.test(a) || /^DdzFF[a-zA-Z0-9]{50,}$/.test(a); }
function isBch(a)  { return /^(bitcoincash:)?[qp][a-z0-9]{41}$/.test(a) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a); }
function isLn(a)   { return /^ln(bc|tb|bcrt)[0-9a-z]+$/.test(a.toLowerCase()); }

// For multi-chain tokens, try every possible network format and return the
// first match with a human-readable "detected" label.
function tryMultiChain(a, formats) {
  for (const { test, label } of formats) {
    if (test(a)) return ok(label);
  }
  return null;
}

const MULTI_CHAIN_FORMATS = {
  USDT: [
    { test: isEvm, label: 'ERC-20 / BEP-20 / Polygon' },
    { test: isTrx, label: 'TRC-20 (Tron)' },
    { test: isSol, label: 'SPL (Solana)' },
  ],
  USDC: [
    { test: isEvm, label: 'ERC-20 / BEP-20 / Polygon / Avalanche' },
    { test: isSol, label: 'SPL (Solana)' },
  ],
  BNB: [
    { test: isEvm,                                label: 'BEP-20 (BSC)' },
    { test: (a) => /^bnb1[a-z0-9]{38}$/.test(a), label: 'BEP-2' },
  ],
  LINK: [
    { test: isEvm, label: 'ERC-20 / BEP-20' },
  ],
  MATIC: [
    { test: isEvm, label: 'Polygon / ERC-20' },
  ],
  AVAX: [
    { test: isEvm,                                        label: 'C-Chain (EVM)' },
    { test: (a) => /^X-avax1[a-z0-9]{38,}$/.test(a),    label: 'X-Chain' },
  ],
  FIL: [
    { test: (a) => /^f[0-4][a-zA-Z0-9]+$/.test(a), label: 'Filecoin native' },
    { test: isEvm,                                   label: 'FEVM (ERC-20)' },
  ],
};

const RULES = {
  BTC: (a) => {
    if (/^bc1[a-z0-9]{8,87}$/.test(a))               return ok('Bech32 (SegWit)');
    if (/^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(a)) return ok('Legacy / P2SH');
    return bad('Not a valid BTC address (expect bc1..., 1..., or 3...).');
  },
  ETH:  (a) => isEvm(a) ? ok('Ethereum') : bad('Not a valid ETH address (expect 0x + 40 hex chars).'),
  SOL:  (a) => isSol(a) ? ok('Solana')   : bad('Not a valid SOL address (32-44 base58 chars).'),
  TRX:  (a) => isTrx(a) ? ok('Tron')     : bad('Not a valid TRX address (expect T + 33 chars).'),
  XLM:  (a) => isXlm(a) ? ok('Stellar')  : bad('Not a valid XLM address (expect G + 55 base32 chars).'),
  UNI:  (a) => isEvm(a) ? ok('ERC-20')   : bad('UNI address must be 0x + 40 hex chars (ERC-20).'),
  SHIB: (a) => isEvm(a) ? ok('ERC-20')   : bad('SHIB address must be 0x + 40 hex chars (ERC-20).'),

  XRP: (a) => isXrp(a)
    ? ok('XRP Ledger')
    : bad('Not a valid XRP address (expect r...).'),

  ADA: (a) => isAda(a)
    ? ok('Cardano')
    : bad('Not a valid ADA address (expect addr1... or DdzFF...).'),

  DOGE: (a) => isDoge(a)
    ? ok('Dogecoin')
    : bad('Not a valid DOGE address (expect D...).'),

  LTC: (a) => isLtc(a)
    ? ok('Litecoin')
    : bad('Not a valid LTC address (expect ltc1..., L..., or M...).'),

  BCH: (a) => isBch(a)
    ? ok('Bitcoin Cash')
    : bad('Not a valid BCH address (cashaddr or legacy).'),

  DOT: (a) => (a.length >= 46 && a.length <= 48 && BASE58_RE.test(a))
    ? ok('Polkadot')
    : bad('Not a valid DOT address (~47 base58 chars).'),

  NEAR: (a) => (/^[a-z0-9_-]{2,64}\.near$/.test(a) || /^[a-f0-9]{64}$/.test(a))
    ? ok('NEAR Protocol')
    : bad('Not a valid NEAR address (expect name.near or 64-char hex).'),
};

/**
 * Network-label → strict format check.
 * Each entry has:
 *   keywords: lowercase substrings to match against the network label
 *   test:     address format predicate
 *   hint:     human-readable expected format shown on failure
 */
const NETWORK_FORMAT_VALIDATORS = [
  {
    keywords: ['trc-20', 'tron'],
    test: isTrx,
    hint: 'T + 33 alphanumeric chars (Tron/TRC-20)',
  },
  {
    keywords: ['erc-20', 'ethereum (erc', 'bep-20', 'bnb smart', 'polygon', 'avalanche c-chain', 'arbitrum', 'optimism'],
    test: isEvm,
    hint: '0x + 40 hex chars (EVM-compatible)',
  },
  {
    keywords: ['solana', 'spl'],
    test: isSol,
    hint: '32-44 base58 chars (Solana)',
  },
  {
    keywords: ['stellar', 'xlm'],
    test: isXlm,
    hint: 'G + 55 uppercase base32 chars (Stellar)',
  },
  {
    keywords: ['ripple', 'xrp ledger'],
    test: isXrp,
    hint: 'r + 24-34 chars (XRP Ledger)',
  },
  {
    keywords: ['bitcoin (btc)', 'bitcoin cash', 'bch'],
    test: (a) => isBtc(a) || isBch(a),
    hint: 'bc1..., 1..., 3..., or CashAddr (Bitcoin/BCH)',
    specific: {
      'bitcoin cash': { test: isBch, hint: 'CashAddr (bitcoincash:q...) or legacy 1... / 3...' },
      'bch':          { test: isBch, hint: 'CashAddr (bitcoincash:q...) or legacy 1... / 3...' },
      'bitcoin (btc)':{ test: isBtc, hint: 'bc1... (SegWit) or 1... / 3... (Legacy)' },
    },
  },
  {
    keywords: ['lightning'],
    test: isLn,
    hint: 'lnbc... Lightning invoice or LNURL',
  },
  {
    keywords: ['litecoin'],
    test: isLtc,
    hint: 'ltc1... (Bech32) or L... / M... (Legacy)',
  },
  {
    keywords: ['dogecoin'],
    test: isDoge,
    hint: 'D + 34 chars (Dogecoin)',
  },
  {
    keywords: ['cardano'],
    test: isAda,
    hint: 'addr1... or DdzFF... (Cardano)',
  },
  {
    keywords: ['polkadot'],
    test: (a) => a.length >= 46 && a.length <= 48 && BASE58_RE.test(a),
    hint: '~47 base58 chars (Polkadot)',
  },
  {
    keywords: ['near protocol', 'near'],
    test: (a) => /^[a-z0-9_-]{2,64}\.near$/.test(a) || /^[a-f0-9]{64}$/.test(a),
    hint: 'name.near or 64-char hex (NEAR)',
  },
];

/**
 * Validate an address for a given asset ticker.
 * The `network` parameter is intentionally ignored for field-level validation -
 * each of the 3 address slots may belong to any supported network for that asset.
 * The network label on the row is purely for display to the client.
 *
 * Returns { ok: boolean, reason: string|null, detected: string|null }
 *   detected = friendly network name when ok, e.g. "TRC-20 (Tron)"
 */
export function validateAddress(ticker, address) {
  const trimmed = (address || '').trim();
  if (trimmed === '') return ok();

  const t = (ticker || '').toUpperCase();

  const formats = MULTI_CHAIN_FORMATS[t];
  if (formats) {
    const match = tryMultiChain(trimmed, formats);
    if (match) return match;
    const names = formats.map(f => f.label).join(', ');
    return bad(`Not a recognised ${t} address format. Valid formats: ${names}.`);
  }

  const rule = RULES[t];
  if (rule) return rule(trimmed);

  return trimmed.length >= 20
    ? ok()
    : bad('Address looks too short to be valid.');
}

/**
 * Validate an address against a specific network label (e.g. "Tron (TRC-20)").
 * When the network maps to a known format, only that format is accepted.
 * For unknown / custom networks the call falls back to ticker-level validation.
 *
 * Returns { ok: boolean, reason: string|null, detected: string|null }
 */
export function validateAddressForNetwork(ticker, network, address) {
  const trimmed = (address || '').trim();
  if (trimmed === '') return ok();
  if (!network) return validateAddress(ticker, address);

  const netLower = network.toLowerCase();

  for (const nfv of NETWORK_FORMAT_VALIDATORS) {
    const matched = nfv.keywords.some(kw => netLower.includes(kw));
    if (!matched) continue;

    // Some entries have per-keyword overrides (e.g. BTC vs BCH share "bitcoin")
    if (nfv.specific) {
      for (const [kw, spec] of Object.entries(nfv.specific)) {
        if (netLower.includes(kw)) {
          return spec.test(trimmed)
            ? ok(network)
            : bad(`Not a valid ${network} address. Expected: ${spec.hint}.`);
        }
      }
    }

    return nfv.test(trimmed)
      ? ok(network)
      : bad(`Not a valid ${network} address. Expected: ${nfv.hint}.`);
  }

  return validateAddress(ticker, address);
}

export function isAddressValid(ticker, address) {
  return validateAddress(ticker, address).ok;
}
