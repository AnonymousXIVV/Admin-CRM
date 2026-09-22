/** Minor-unit divisors - keep in sync with api/src/Lib/AssetDivisors.php */
export const ASSET_DIVISORS = {
  BTC: 1e8,
  ETH: 1e9,
  USDT: 100,
  USD: 100,
  CARD: 100,
};

export function assetDivisor(asset) {
  return ASSET_DIVISORS[String(asset || '').toUpperCase()] ?? 100;
}

export function minorToDisplay(amountMinor, asset) {
  const div = assetDivisor(asset);
  const n = Number(amountMinor) / div;
  return +n.toPrecision(8);
}
