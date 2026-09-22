/** Shared fiat converter currencies and formatting (dashboard + withdrawals). */

export const CONV_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

export function fmtConv(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function convertFxAmount(amount, from, to, fxRates) {
  const n = parseFloat(amount);
  if (amount === '' || amount == null || Number.isNaN(n) || n < 0) return null;
  if (n === 0) return 0;
  const fromRate = fxRates?.[from] ?? 1;
  const toRate = fxRates?.[to] ?? 1;
  return n * (toRate / fromRate);
}
