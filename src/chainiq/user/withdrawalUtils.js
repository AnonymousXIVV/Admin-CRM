/**
 * Withdrawal limit display - mirrors api/src/Lib/WithdrawalPolicy.php caps (USD monthly).
 */

export const FIAT_WITHDRAWAL_MONTHLY_LIMIT_USD = 50_000;

const WITHDRAWAL_TYPES = new Set(['withdraw', 'withdrawal']);

const COUNTABLE_STATUSES = new Set(['approved', 'pending', 'completed']);

export function sumMonthlyFiatWithdrawalsUsd(transactions, referenceDate = new Date()) {
  if (!Array.isArray(transactions) || transactions.length === 0) return 0;

  const month = referenceDate.getUTCMonth();
  const year = referenceDate.getUTCFullYear();

  return transactions.reduce((sum, tx) => {
    const type = (tx.type || '').toLowerCase().trim();
    if (!WITHDRAWAL_TYPES.has(type)) return sum;

    const status = (tx.status || '').toLowerCase().trim();
    if (!COUNTABLE_STATUSES.has(status)) return sum;

    const code = (tx.assetCode || tx.asset || '').toUpperCase();
    // USD and CARD share the same fiat monthly cap (see WithdrawalPolicy.php).
    if (code !== 'USD' && code !== 'CARD') return sum;

    const d = tx.date instanceof Date ? tx.date : new Date(tx.createdAt || tx.date);
    if (Number.isNaN(d.getTime())) return sum;
    if (d.getUTCMonth() !== month || d.getUTCFullYear() !== year) return sum;

    const minor = Math.abs(Number(tx.amountMinor) || 0);
    return sum + minor / 100;
  }, 0);
}
