/** Format spot price for crypto, stocks, commodities, and forex rows. */
export function formatMarketPrice(price, category) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return '-';

  if (category === 'forex') {
    if (p >= 100) return p.toFixed(2);
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(5);
  }

  if (p >= 1000) {
    return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (p >= 1) return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}
