import React, { useState, useEffect, useCallback, useContext, useMemo } from 'react';
import { TransactionTable } from '../components/Tables';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { DataContext } from '../contexts/DataContext';
import { getTransactionsPage, getClientDepositRequests, getAdminPreviewTransactions, readClientToken } from '../../api';

const ASSET_INFO_LOCAL = {
    BTC:  { name: 'Bitcoin',      icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/btc.png' },
    ETH:  { name: 'Ethereum',     icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/eth.png' },
    USDT: { name: 'Tether',       icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/usdt.png' },
    USDC: { name: 'USD Coin',     icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/usdc.png' },
    BNB:  { name: 'Binance Coin', icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/bnb.png' },
    SOL:  { name: 'Solana',       icon: 'https://raw.githubusercontent.com/atomiclabs/cryptocurrency-icons/master/128/color/sol.png' },
    USD:  { name: 'US Dollar',    icon: '' },
};

const DR_STATUS_MAP = { Pending: 'pending', Approved: 'completed', Rejected: 'failed', Cancelled: 'cancelled' };

function normalizeDepositRequest(r) {
    const assetCode = (r.asset || '').toUpperCase();
    const info = ASSET_INFO_LOCAL[assetCode] || { name: assetCode, icon: '' };
    const amt = parseFloat(r.amount_display || 0);
    const formatted = amt % 1 === 0 ? String(amt) : String(+amt.toPrecision(8));
    const status = DR_STATUS_MAP[r.status] || 'pending';
    const rejectionNote = (r.rejection_reason || '').trim();
    return {
        id: `dr_${r.id}`,
        depositRequestId: r.id,
        type: 'Deposit',
        asset: info.name,
        assetCode,
        icon: info.icon,
        amount: `+${formatted} ${assetCode}`,
        amountMinor: 0,
        fee: '-',
        description: rejectionNote
            ? rejectionNote
            : (r.network ? `Network: ${r.network}` : 'Deposit request'),
        status,
        date: new Date(r.created_at),
        createdAt: r.created_at,
    };
}

const ASSET_NAME_TO_CODE = {
    'Bitcoin':      'BTC',
    'Ethereum':     'ETH',
    'Tether':       'USDT',
    'USD Coin':     'USDC',
    'Binance Coin': 'BNB',
    'Solana':       'SOL',
    'US Dollar':    'USD',
    'Card':         'CARD',
};

const PAGE_SIZE = 15;

const Transactions = () => {
    const { cryptoDataState, userSettingsState, currentUser } = useContext(DataContext);

    const [type, setType] = useState('all');
    const [asset, setAsset] = useState('all');
    const [dateRange, setDateRange] = useState([null, null]);

    const [appliedType,  setAppliedType]  = useState('all');
    const [appliedAsset, setAppliedAsset] = useState('all');
    const [appliedRange, setAppliedRange] = useState([null, null]);

    const [page, setPage]       = useState(0);
    const [rows, setRows]       = useState([]);
    const [total, setTotal]     = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');

    const [depositRequests, setDepositRequests] = useState([]);

    const userId         = currentUser?.id;
    const isImpersonated = !!currentUser?.impersonated;

    // Deposit requests are shown whenever the filter is "all" or "Deposit"
    const showDepositRequests = appliedType === 'all' || appliedType === 'Deposit';

    const apiType = useMemo(() => {
        if (appliedType === 'all') return '';
        return appliedType; // backend now handles both 'Withdrawal' and 'Withdraw' variants
    }, [appliedType]);

    const fetchPage = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [from, to] = appliedRange;
            const assetCode = appliedAsset === 'all'
                ? ''
                : (ASSET_NAME_TO_CODE[appliedAsset] || appliedAsset.toUpperCase());
            let result;
            if (isImpersonated && userId) {
                const preview = await getAdminPreviewTransactions(userId, {
                    limit: 500,
                    offset: 0,
                    type: apiType,
                    asset: assetCode,
                });
                let txs = preview.transactions || [];
                if (from && to) {
                    txs = txs.filter((t) => t.date >= from && t.date <= to);
                }
                const start = page * PAGE_SIZE;
                result = {
                    transactions: txs.slice(start, start + PAGE_SIZE),
                    total: txs.length,
                    hasMore: start + PAGE_SIZE < txs.length,
                };
            } else {
                result = await getTransactionsPage({
                    limit:  PAGE_SIZE,
                    offset: page * PAGE_SIZE,
                    type:   apiType,
                    asset:  assetCode,
                    from:   from ? from.toISOString().slice(0, 10) : '',
                    to:     to   ? to.toISOString().slice(0, 10)   : '',
                });
            }
            setRows(result.transactions);
            setTotal(result.total);
            setHasMore(result.hasMore);
        } catch (err) {
            setError(err?.message || 'Could not load transactions.');
            setRows([]);
            setTotal(0);
            setHasMore(false);
        } finally {
            setLoading(false);
        }
    }, [page, apiType, appliedAsset, appliedRange, isImpersonated, userId]);

    useEffect(() => {
        if (!userId) return;
        if (isImpersonated && !readClientToken()) {
            setError('Admin session expired - reopen the lead from the CRM to load transactions.');
            return;
        }
        let cancelled = false;
        (async () => {
            await fetchPage();
            if (cancelled) return;
        })();
        return () => { cancelled = true; };
    }, [fetchPage, userId, isImpersonated]);

    useEffect(() => {
        if (!userId || isImpersonated) {
            if (isImpersonated) setDepositRequests([]);
            return;
        }
        getClientDepositRequests()
            .then(r => setDepositRequests(r.deposit_requests || []))
            .catch(() => {});
    }, [userId, isImpersonated]);

    const normalizedDepositRows = useMemo(() => {
        let drs = depositRequests
            .filter(r => r.status === 'Pending' || r.status === 'Rejected')
            .map(normalizeDepositRequest);
        if (appliedAsset !== 'all') {
            const code = ASSET_NAME_TO_CODE[appliedAsset] || appliedAsset.toUpperCase();
            drs = drs.filter(r => r.assetCode === code);
        }
        const [from, to] = appliedRange;
        if (from && to) drs = drs.filter(r => r.date >= from && r.date <= to);
        return drs;
    }, [depositRequests, appliedAsset, appliedRange]);

    const pendingDepositCount = normalizedDepositRows.length;

    // Pending deposit requests are shown in a separate section so they
    // don't inflate page-0 row counts or skew pagination totals.
    const displayRows = rows;

    const handleApplyFilters = () => {
        setAppliedType(type);
        setAppliedAsset(asset);
        setAppliedRange(dateRange);
        setPage(0);
    };

    const ledgerTotal = total;
    const pageCount = Math.max(1, Math.ceil(ledgerTotal / PAGE_SIZE));
    const fromRow   = ledgerTotal === 0 ? 0 : page * PAGE_SIZE + 1;
    const toRow     = Math.min(ledgerTotal, page * PAGE_SIZE + displayRows.length);

    return (
        <div id="transactions-page" className="page-content active">
            <div className="table-container">
                <div className="table-controls grid grid-cols-1 md:grid-cols-4 gap-4">
                    <select id="tx-filter-type" className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                        <option value="all">All Types</option>
                        <option value="Deposit">Deposit</option>
                        <option value="Withdrawal">Withdrawal</option>
                        <option value="Transfer">Transfer</option>
                        <option value="Trade">Trade</option>
                    </select>
                    <select id="tx-filter-asset" className="form-select" value={asset} onChange={(e) => setAsset(e.target.value)}>
                        <option value="all">All Assets</option>
                        {cryptoDataState.map(c => (
                            <option key={c.id} value={c.ticker}>{c.asset} ({c.ticker})</option>
                        ))}
                        <option value="Card">Card</option>
                    </select>
                    <DatePicker
                        selectsRange={true}
                        startDate={dateRange[0]}
                        endDate={dateRange[1]}
                        onChange={(update) => setDateRange(update)}
                        isClearable={true}
                        placeholderText="Select Date Range"
                        className="form-input"
                    />
                    <button id="tx-filter-apply" className="btn-action" onClick={handleApplyFilters} disabled={loading}>
                        {loading ? 'Loading...' : 'Apply Filters'}
                    </button>
                </div>
            </div>

            {error && (
                <div 
                    className="mt-4 p-3 bg-red-900/20 border border-red-700/30 rounded-lg text-red-400 text-sm flex items-center gap-2"
                    style={{ marginBottom: '24px' }}
                >
                    <i className="fas fa-exclamation-circle"></i> {error}
                </div>
            )}

            <div id="transactions-page-table-container">
                {showDepositRequests && pendingDepositCount > 0 && (
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-300 mb-2 px-1">
                            Pending deposit requests ({pendingDepositCount})
                        </h3>
                        <TransactionTable data={normalizedDepositRows} userSettings={userSettingsState} />
                    </div>
                )}
                {!loading && displayRows.length === 0 ? (
                    pendingDepositCount === 0 ? (
                    <div className="table-container p-8 text-center text-gray-500">
                        <i className="fas fa-receipt text-3xl mb-3 block"></i>
                        <div className="text-sm">
                            {ledgerTotal === 0
                                ? 'No transactions yet - your deposits, withdrawals, and trades will appear here.'
                                : 'No transactions match the current filters on this page.'}
                        </div>
                    </div>
                    ) : null
                ) : (
                    <TransactionTable data={displayRows} userSettings={userSettingsState} />
                )}
            </div>

            <div className="flex items-center justify-between mt-4 px-2 text-sm text-gray-400">
                <span>
                    {ledgerTotal === 0
                        ? 'Showing 0 transactions'
                        : `Showing ${fromRow}-${toRow} of ${ledgerTotal}`}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        className="pagination-button"
                        disabled={loading || page === 0}
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                    >
                        Previous
                    </button>
                    <span style={{ minWidth: 80, textAlign: 'center' }}>
                        Page {page + 1} of {pageCount}
                    </span>
                    <button
                        className="pagination-button"
                        disabled={loading || !hasMore}
                        onClick={() => setPage(p => p + 1)}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Transactions;
