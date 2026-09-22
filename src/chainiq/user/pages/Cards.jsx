import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { DataContext } from '../contexts/DataContext';
import { RequestCardModal, WithdrawModal, CardDetailsModal, LockReasonModal, SetPinModal, CardLimitsModal, CryptoToCardModal, KycModal, ConfirmModal, NoCardModal, PromoCardDetailsModal } from '../components/Modals';
import CardStack from '../components/CardStack';
import Toast from '../components/Toast';
import { usePlatformSettings } from '../../platformDefaults';
import { getTransactionsPage } from '../../api';

const CARD_TX_PAGE_SIZE = 5;

const CardTransactionsSection = () => {
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError('');
        getTransactionsPage({ limit: CARD_TX_PAGE_SIZE, offset: page * CARD_TX_PAGE_SIZE, asset: 'CARD' })
            .then(result => {
                if (cancelled) return;
                setRows(result.transactions);
                setTotal(result.total);
                setHasMore(result.hasMore);
            })
            .catch(err => {
                if (cancelled) return;
                setError(err?.message || 'Could not load card transactions.');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [page]);

    const pageCount = Math.max(1, Math.ceil(total / CARD_TX_PAGE_SIZE));
    const fromRow = total === 0 ? 0 : page * CARD_TX_PAGE_SIZE + 1;
    const toRow = Math.min(total, page * CARD_TX_PAGE_SIZE + rows.length);

    const statusClass = (s) => {
        const m = { completed: 'text-green-400', pending: 'text-yellow-400', failed: 'text-red-400', cancelled: 'text-gray-400' };
        return m[(s || '').toLowerCase()] || 'text-gray-300';
    };

    return (
        <div className="dashboard-card p-5 mt-6">
            <div className="flex items-center gap-2 mb-4">
                <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '28px', height: '28px', backgroundColor: 'var(--ui-primary)',
                    borderRadius: '50%', flexShrink: 0,
                }}>
                    <i className="fas fa-credit-card" style={{ fontSize: '12px', color: '#fff' }}></i>
                </span>
                <h2 className="text-base font-semibold">Card Transactions <span className="text-text-secondary">({total})</span></h2>
            </div>

            {error && (
                <div className="p-3 mb-3 bg-red-900/20 border border-red-700/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                    <i className="fas fa-exclamation-circle"></i> {error}
                </div>
            )}

            {loading ? (
                <div className="text-center py-6 text-text-secondary text-sm">
                    <i className="fas fa-spinner fa-spin mr-2"></i>Loading...
                </div>
            ) : rows.length === 0 ? (
                <div className="text-center py-6 text-text-secondary text-sm">
                    <i className="fas fa-receipt text-2xl mb-2 block"></i>
                    No card transactions yet.
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    {['Date', 'Type', 'Amount', 'Status'].map(h => (
                                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-secondary, #888)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(item => (
                                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <td style={{ padding: '8px 10px', color: 'var(--text-secondary, #aaa)', whiteSpace: 'nowrap' }}>
                                            {item.date.toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' })}
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>{item.type}</td>
                                        <td style={{ padding: '8px 10px', fontVariantNumeric: 'tabular-nums' }}>
                                            <span style={{ color: item.amountMinor >= 0 ? '#4ade80' : '#f87171' }}>
                                                {item.amount}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <span className={statusClass(item.status)} style={{ textTransform: 'capitalize' }}>
                                                {item.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between mt-3 text-sm text-gray-400">
                        <span>{total === 0 ? 'No transactions' : `${fromRow}-${toRow} of ${total}`}</span>
                        <div className="flex items-center gap-2">
                            <button className="pagination-button" disabled={loading || page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</button>
                            <span style={{ minWidth: 70, textAlign: 'center' }}>Page {page + 1} of {pageCount}</span>
                            <button className="pagination-button" disabled={loading || !hasMore} onClick={() => setPage(p => p + 1)}>Next</button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

const Cards = () => {
    const { cardDataState, userSettingsState, reorderCardToTop, freezeCard, blockCard, cryptoDataState, topCardId, setTopCardId, formatBalance } = useContext(DataContext);
    const platformSettingsState = usePlatformSettings();
    const [activeModal, setActiveModal] = useState(null);
    const [selectedCard, setSelectedCard] = useState(cardDataState.length > 0 ? cardDataState[0] : null);
    // Tracks an in-flight freeze/block request so we can disable both buttons
    // and avoid double-submits while the round-trip is pending.
    const [pendingAction, setPendingAction] = useState(null); // 'freeze' | 'block' | null
    const [requestedTier, setRequestedTier] = useState(null);
    // Transient toast notification - replaces native alert() for success/error
    // feedback. `id` ensures repeat toasts (e.g. two errors in a row) re-show.
    const [toast, setToast] = useState(null);
    const toastIdRef = useRef(0);
    // Block confirmation modal - replaces window.confirm() for the destructive
    // direction of the block toggle.
    const [showBlockConfirm, setShowBlockConfirm] = useState(false);

    const showToast = useCallback((type, message) => {
        toastIdRef.current += 1;
        setToast({ id: toastIdRef.current, type, message });
    }, []);
    const dismissToast = useCallback(() => setToast(null), []);

    const handleShowcaseSelect = (tierId) => {
        setRequestedTier(tierId);
        setActiveModal('request-card-modal');
    };

    useEffect(() => {
        if (!selectedCard) {
            setSelectedCard(cardDataState.length > 0 ? cardDataState[0] : null);
            return;
        }
        const updatedSelectedCard = cardDataState.find(c => c.id === selectedCard.id);
        setSelectedCard(updatedSelectedCard || (cardDataState.length > 0 ? cardDataState[0] : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardDataState]);

    const handleCardClick = (cardId) => {
        const clickedCard = cardDataState.find(c => c.id === cardId);
        if (!clickedCard) return;
        setSelectedCard(clickedCard);
        setTopCardId(cardId);
        reorderCardToTop(cardId);
    };

    // Toggle Active ↔ Frozen on the server. The 409 path ("card is blocked;
    // unblock first") is the user-actionable error we explicitly surface - any
    // other failure falls through to a generic message so we don't swallow
    // backend issues silently.
    const handleFreezeCard = async () => {
        if (cardDataState.length === 0) { setActiveModal('no-card-modal'); return; }
        if (!selectedCard) { showToast('warning', 'Please select a card first.'); return; }
        if (pendingAction) return;
        setPendingAction('freeze');
        try {
            const next = await freezeCard(selectedCard.id);
            showToast('success', `Card ${next === 'Frozen' ? 'frozen' : 'unfrozen'} successfully.`);
        } catch (err) {
            if (err?.status === 409) {
                showToast('warning', 'This card is blocked. Unblock it before freezing.');
            } else if (err?.status !== 401 && err?.status !== 403) {
                showToast('error', err?.message || 'Could not update card. Please try again.');
            }
        } finally {
            setPendingAction(null);
        }
    };

    // Toggle { Active | Frozen } ↔ Blocked. We confirm before blocking (it's
    // the destructive direction); unblocking is a single click, matching the
    // freeze toggle's UX.
    const performBlockCard = async () => {
        setPendingAction('block');
        try {
            const next = await blockCard(selectedCard.id);
            showToast('success', `Card ${next === 'Blocked' ? 'blocked' : 'unblocked'} successfully.`);
        } catch (err) {
            if (err?.status !== 401 && err?.status !== 403) {
                showToast('error', err?.message || 'Could not update card. Please try again.');
            }
        } finally {
            setPendingAction(null);
        }
    };

    const handleBlockCard = () => {
        if (cardDataState.length === 0) { setActiveModal('no-card-modal'); return; }
        if (!selectedCard) { showToast('warning', 'Please select a card first.'); return; }
        if (pendingAction) return;
        const isUnblocking = selectedCard.status === 'blocked' || selectedCard.isBlocked;
        if (isUnblocking) {
            performBlockCard();
            return;
        }
        setShowBlockConfirm(true);
    };

    const handleConfirmBlock = async () => {
        setShowBlockConfirm(false);
        await performBlockCard();
    };

    const handleCancelBlock = () => {
        if (pendingAction === 'block') return;
        setShowBlockConfirm(false);
    };

    const handleRequestCard = () => setActiveModal('request-card-modal');
    const handleShowDetails = () => {
        if (cardDataState.length === 0) { setActiveModal('promo-details-modal'); return; }
        if (!selectedCard) { showToast('warning', 'Please select a card first.'); return; }
        setActiveModal('card-details-modal');
    };
    const handleSetPin = () => {
        if (cardDataState.length === 0) { setActiveModal('no-card-modal'); return; }
        if (!selectedCard) { showToast('warning', 'Please select a card first.'); return; }
        setActiveModal('set-pin-modal');
    };
    const handleViewLimits = () => {
        if (cardDataState.length === 0) { setActiveModal('promo-details-modal'); return; }
        if (!selectedCard) { showToast('warning', 'Please select a card first.'); return; }
        setActiveModal('card-limits-modal');
    };
    const handleWithdraw = () => {
        if (cardDataState.length === 0) { setActiveModal('no-card-modal'); return; }
        if (!selectedCard) { showToast('warning', 'Please select a card first.'); return; }
        setActiveModal('crypto-to-card-modal');
    };

    return (
        <div id="cards-page" className="page-content active">
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="dashboard-card p-4">
                    <div className="text-xs text-text-secondary uppercase tracking-wide mb-1">Total Cards</div>
                    <div className="text-2xl font-bold">{cardDataState.length}</div>
                </div>
                <div className="dashboard-card p-4">
                    <div className="text-xs text-text-secondary uppercase tracking-wide mb-1">Active</div>
                    <div className="text-2xl font-bold text-green-400">{cardDataState.filter(c => (c.status || '').toLowerCase() === 'active').length}</div>
                </div>
                <div className="dashboard-card p-4">
                    <div className="text-xs text-text-secondary uppercase tracking-wide mb-1">Frozen</div>
                    <div className="text-2xl font-bold text-yellow-400">{cardDataState.filter(c => (c.status || '').toLowerCase() === 'frozen').length}</div>
                </div>
                <div className="dashboard-card p-4">
                    <div className="text-xs text-text-secondary uppercase tracking-wide mb-1">Blocked</div>
                    <div className="text-2xl font-bold text-red-400">{cardDataState.filter(c => (c.status || '').toLowerCase() === 'blocked').length}</div>
                </div>
            </div>

            {/* Card stack + management */}
            <div className="flex flex-col lg:flex-row gap-6 mb-6">
                <div className="cards-section-panel">
                    <div className="wallet-card-host">
                        <CardStack
                            cards={cardDataState}
                            topCardId={topCardId}
                            selectedCardId={selectedCard?.id}
                            onCardClick={handleCardClick}
                            userSettingsState={userSettingsState}
                            platformSettingsState={platformSettingsState}
                            onShowcaseSelect={handleShowcaseSelect}
                        />
                    </div>
                </div>

                <div className="dashboard-card p-6 flex-1 flex flex-col justify-between">
                    <div>
                        <h2 className="text-base font-semibold mb-4 text-text-secondary uppercase tracking-wide">Card Management</h2>
                        <div className="card-mgmt-grid">
                            <button
                                type="button"
                                className="card-mgmt-btn"
                                onClick={handleFreezeCard}
                                disabled={!!pendingAction || selectedCard?.status === 'blocked'}
                                title={selectedCard?.status === 'blocked' ? 'Unblock the card before freezing' : ''}
                            >
                                <i className="fas fa-snowflake" />
                                <span>
                                    {pendingAction === 'freeze'
                                        ? '...'
                                        : selectedCard?.status === 'frozen'
                                            ? 'Unfreeze'
                                            : 'Freeze'}
                                </span>
                            </button>
                            <button
                                type="button"
                                className="card-mgmt-btn"
                                onClick={handleBlockCard}
                                disabled={!!pendingAction}
                            >
                                <i className="fas fa-ban" />
                                <span>
                                    {pendingAction === 'block'
                                        ? '...'
                                        : (selectedCard?.status === 'blocked' || selectedCard?.isBlocked)
                                            ? 'Unblock'
                                            : 'Block'}
                                </span>
                            </button>
                            <button type="button" className="card-mgmt-btn" onClick={handleShowDetails}>
                                <i className="fas fa-eye" />
                                <span>Details</span>
                            </button>
                            <button type="button" className="card-mgmt-btn" onClick={handleSetPin}>
                                <i className="fas fa-key" />
                                <span>Set PIN</span>
                            </button>
                            <button type="button" className="card-mgmt-btn card-mgmt-btn--wide" onClick={handleViewLimits}>
                                <i className="fas fa-tachometer-alt" />
                                <span>Limits</span>
                            </button>
                            <button type="button" className="card-mgmt-btn card-mgmt-btn--wide" onClick={handleWithdraw}>
                                <i className="fas fa-arrow-up" />
                                <span>Withdraw</span>
                            </button>
                        </div>
                    </div>
                    <div className="mt-6">
                        <button type="button" className="btn-request-card w-full" onClick={handleRequestCard}>
                            <i className="fas fa-plus mr-2" />
                            Request New Card
                        </button>
                    </div>
                </div>
            </div>

            {/* All cards list */}
            <div className="dashboard-card p-5">
                <h2 className="text-base font-semibold mb-4">All Cards <span className="text-text-secondary">({cardDataState.length})</span></h2>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                    {cardDataState.map(c => (
                        <div
                            key={c.id}
                            className={`card-list-item${selectedCard?.id === c.id ? ' selected' : ''}`}
                            onClick={() => handleCardClick(c.id)}
                        >
                            <div className={`card-list-thumbnail card-${c.type}`}>
                                <i className="fas fa-credit-card"></i>
                            </div>
                            <div className="card-list-info">
                                <div className="card-list-number">**** {c.cardNumber?.slice(-4)}</div>
                                <div className="card-list-holder">{c.cardholderName}</div>
                            </div>
                            <div className="card-list-meta">
                                <div className="card-list-balance">
                                    {userSettingsState.showCardBalance
                                        ? formatBalance(c.balance)
                                        : '****'}
                                </div>
                                <div className={`status-badge ${c.status}`}>
                                    {c.status === 'frozen' ? 'Frozen' : c.status === 'blocked' ? 'Blocked' : 'Active'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Card transactions */}
            <CardTransactionsSection />

            <RequestCardModal activeModal={activeModal} setActiveModal={setActiveModal} userProfile={userSettingsState} userKycStatus={userSettingsState?.kyc} presetTier={requestedTier} />
            <WithdrawModal activeModal={activeModal} setActiveModal={setActiveModal} cryptoData={cryptoDataState} />
            <CardDetailsModal activeModal={activeModal} setActiveModal={setActiveModal} selectedCard={selectedCard} />
            <LockReasonModal activeModal={activeModal} setActiveModal={setActiveModal} />
            <SetPinModal activeModal={activeModal} setActiveModal={setActiveModal} selectedCard={selectedCard} />
            <CardLimitsModal activeModal={activeModal} setActiveModal={setActiveModal} selectedCard={selectedCard} />
            <CryptoToCardModal activeModal={activeModal} setActiveModal={setActiveModal} cryptoData={cryptoDataState} selectedCard={selectedCard} />
            <KycModal activeModal={activeModal} setActiveModal={setActiveModal} />
            <NoCardModal activeModal={activeModal} setActiveModal={setActiveModal} />
            <PromoCardDetailsModal activeModal={activeModal} setActiveModal={setActiveModal} />

            <ConfirmModal
                isOpen={showBlockConfirm}
                title="Block this card?"
                message="The card will be disabled for all transactions until you unblock it."
                confirmLabel="Block card"
                cancelLabel="Cancel"
                tone="danger"
                isBusy={pendingAction === 'block'}
                onConfirm={handleConfirmBlock}
                onCancel={handleCancelBlock}
            />

            <Toast toast={toast} onDismiss={dismissToast} />
        </div>
    );
};

export default Cards;
