import React, { useContext, useState, useEffect, useMemo } from 'react';
import { CryptoTable, TransactionTable } from '../components/Tables';
import { BalanceCardSkeleton, CardStackSkeleton, CryptoTableSkeleton, TransactionTableSkeleton } from '../components/Skeletons';
import { DataContext } from '../contexts/DataContext';
import { isKycApproved, isKycFailed } from '../kycUtils';
import { CONV_CURRENCIES, fmtConv, convertFxAmount } from '../fxUtils';
import { RequestCardModal, NotificationModal, DepositModal, WithdrawModal, SetPinModal, BankWithdrawalModal, CardWithdrawalModal, CryptoWithdrawalModal, KycModal, CardDetailsModal, LockReasonModal, CardLimitsModal, ChangeNameModal, ChangeEmailModal } from '../components/Modals';
import CardStack from '../components/CardStack';
import { usePlatformSettings } from '../../platformDefaults';
const DashboardPage = () => {
  const { cryptoDataState, transactionDataState, cardDataState, userSettingsState, isLoading, reorderCardToTop, currentUser, topCardId, setTopCardId, isBannerDismissed, dismissBanner, formatBalance, fxRates, cryptoSparklinesState, tradfiAssetsState, tradesEnabled } = useContext(DataContext);
  const platformSettingsState = usePlatformSettings();
  const [activeModal, setActiveModal] = useState(null);
  const [convAmount, setConvAmount] = useState('');
  const [convFrom, setConvFrom] = useState('USD');
  const [convTo, setConvTo] = useState('EUR');
  const [selectedCard, setSelectedCard] = useState(cardDataState.length > 0 ? cardDataState[0] : null);
  const [requestedTier, setRequestedTier] = useState(null);

  const handleShowcaseSelect = (tierId) => {
    setRequestedTier(tierId);
    setActiveModal('request-card-modal');
  };

  useEffect(() => {
    setSelectedCard(cardDataState.length > 0 ? cardDataState[0] : null);
  }, [cardDataState]);

  const handleCardClick = (cardId) => {
    const card = cardDataState.find(c => c.id === cardId);
    if (!card) return;
    setSelectedCard(card);
    setTopCardId(cardId);
    reorderCardToTop(cardId);
  };

  const tableData = useMemo(() => {
    const crypto = cryptoDataState.map(a => ({
      ...a,
      category: a.category || 'crypto',
      sparkline: (cryptoSparklinesState || {})[a.ticker] || a.sparkline || [],
    }));
    if (!tradesEnabled) return crypto;
    const tradfi = (tradfiAssetsState || []).map(a => ({
      ...a,
      category: a.category || 'stocks',
      sparkline: a.sparkline || [],
    }));
    return [...crypto, ...tradfi];
  }, [cryptoDataState, tradfiAssetsState, cryptoSparklinesState, tradesEnabled]);

  if (isLoading) {
    return (
      <div id="dashboard-page" className="page-content active">
        <div className="content-grid">
          <BalanceCardSkeleton />
          <CardStackSkeleton />
        </div>
        <div id="dashboard-crypto-table-container"><CryptoTableSkeleton /></div>
        <div id="dashboard-transaction-table-container"><TransactionTableSkeleton /></div>
      </div>
    );
  }

  const totalCryptoBalance = cryptoDataState.reduce((acc, asset) => acc + (asset.balance * asset.price), 0);
  const totalFiatBalance = Number(currentUser?.balances?.usd) || 0;
  const totalCardBalance = cardDataState.reduce((acc, card) => acc + (Number(card.balance) || 0), 0);
  const totalBalance = totalCryptoBalance + totalFiatBalance + totalCardBalance;

  const cardsEnabled = currentUser?.cardsEnabled !== false;

  const balanceCard = (
    <div className="balance-card-new">
      <div className="balance-card-header">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide balance-label">Total Account Balance</span>
          <div className="balance-card-value" id="total-balance-value" data-usd-value={totalBalance}>
            {formatBalance(totalBalance)}
          </div>
        </div>
        <div className="balance-card-change positive">
          <i className="fas fa-arrow-up text-sm"></i>
          <span>+2.34% (24h)</span>
        </div>
      </div>
      <div className="balance-breakdown">
        <div className="balance-breakdown-item">
          <div className="breakdown-label"><i className="fas fa-coins text-accent-yellow"></i><span>Crypto Assets</span></div>
          <div className="breakdown-value text-accent-yellow" id="crypto-balance-value" data-usd-value={totalCryptoBalance}>
            {formatBalance(totalCryptoBalance)}
          </div>
        </div>
        <div className="balance-breakdown-item">
          <div className="breakdown-label"><i className="fas fa-dollar-sign text-accent-green"></i><span>Fiat Balance</span></div>
          <div className="breakdown-value text-accent-green" id="fiat-balance-value" data-usd-value={totalFiatBalance}>
            {formatBalance(totalFiatBalance)}
          </div>
        </div>
      </div>
      <div className="balance-actions-new">
        <button className="btn-action btn-deposit" id="deposit-btn" onClick={() => setActiveModal('deposit-modal')}>
          <i className="fas fa-arrow-down text-sm mr-2"></i>Deposit
        </button>
        <button className="btn-action btn-withdraw" id="withdraw-btn" onClick={() => setActiveModal('withdraw-modal')}>
          <i className="fas fa-arrow-up text-sm mr-2"></i>Withdraw
        </button>
      </div>
    </div>
  );

  // Onboarding banner: nudge unverified users to complete KYC. Dismissal
  // is persisted via the preferences store so it stays gone across
  // devices. Auto-hides forever once kyc_status === 'Approved'.
  // Excludes 'Failed' - that case gets its own urgent rejection banner below.
  const kycIsFailed = isKycFailed(currentUser?.kycStatus);
  const showVerifyBanner =
    currentUser &&
    !currentUser.impersonated &&
    !isKycApproved(currentUser) &&
    !kycIsFailed &&
    !isBannerDismissed('verify-kyc');

  // Rejection banner: shown when a previous submission was rejected. Uses its
  // own dismiss key so it's independent of the generic "Verify now" banner.
  // Not permanently dismissible - it resets when the user logs back in so
  // they're always made aware of the rejection on their next session.
  const showRejectedBanner =
    currentUser &&
    !currentUser.impersonated &&
    kycIsFailed &&
    !isBannerDismissed('kyc-rejected');

  return (
    <div id="dashboard-page" className="page-content active">
      {showRejectedBanner && (
        <div className="onboarding-banner banner-rejected" role="alert">
          <div className="onboarding-banner-icon banner-rejected-icon">
            <i className="fas fa-triangle-exclamation"></i>
          </div>
          <div className="onboarding-banner-body">
            <div className="onboarding-banner-title">Your KYC verification was not approved</div>
            <div className="onboarding-banner-text">
              One or more documents were rejected. Please review the feedback and resubmit corrected documents to restore full access.
            </div>
          </div>
          <div className="onboarding-banner-actions">
            <button
              type="button"
              className="onboarding-banner-cta banner-rejected-cta"
              onClick={() => setActiveModal('kyc-modal')}
            >
              Resubmit documents
            </button>
            <button
              type="button"
              className="onboarding-banner-dismiss"
              aria-label="Dismiss"
              onClick={() => dismissBanner('kyc-rejected')}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}
      {showVerifyBanner && (
        <div className="onboarding-banner" role="status">
          <div className="onboarding-banner-icon">
            <i className="fas fa-shield-halved"></i>
          </div>
          <div className="onboarding-banner-body">
            <div className="onboarding-banner-title">Verify your identity to unlock everything</div>
            <div className="onboarding-banner-text">
              Confirm your details to enable card issuance, withdrawals, and higher limits. It only takes a minute.
            </div>
          </div>
          <div className="onboarding-banner-actions">
            <button
              type="button"
              className="onboarding-banner-cta"
              onClick={() => setActiveModal('kyc-modal')}
            >
              Verify now
            </button>
            <button
              type="button"
              className="onboarding-banner-dismiss"
              aria-label="Dismiss"
              onClick={() => dismissBanner('verify-kyc')}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>
      )}
      {cardsEnabled ? (
        <>
          <div className="content-grid">
            {balanceCard}
            <div className="cards-section">
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
              <button className="btn-request-card w-full" id="card-actions-btn" onClick={() => setActiveModal('request-card-modal')}>
                <i className={`fas ${cardDataState.length === 0 ? 'fa-plus' : 'fa-credit-card'} mr-2`}></i>
                {cardDataState.length === 0 ? 'Request Card' : 'Card Actions'}
              </button>
            </div>
          </div>

          <div id="dashboard-crypto-table-container">
            <CryptoTable data={tableData} tradesEnabled={tradesEnabled} extendedMarketFilters={tradesEnabled} />
          </div>
          <div id="dashboard-transaction-table-container">
            <TransactionTable data={transactionDataState.slice(0, 5)} />
          </div>
        </>
      ) : (
        // When cards are off, show a currency converter in the right column.
        <div className="dashboard-news-layout">
          <div className="dashboard-news-balance">{balanceCard}</div>
          <div className="dashboard-news-widget">
            {(() => {
              const n = parseFloat(convAmount);
              const convResult = convertFxAmount(convAmount, convFrom, convTo, fxRates);
              return (
                <div className="currency-converter-widget table-container p-6 flex flex-col">
                  <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                    <i className="fas fa-exchange-alt text-accent-yellow"></i>
                    Currency Converter
                  </h3>
                  <p className="text-sm text-gray-400 mb-5">Live rates - convert between supported currencies.</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Amount</label>
                      <input
                        type="number"
                        className="form-input w-full"
                        placeholder="0.00"
                        min="0"
                        value={convAmount}
                        onChange={e => setConvAmount(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">From</label>
                        <select className="form-select w-full" value={convFrom} onChange={e => setConvFrom(e.target.value)}>
                          {CONV_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">To</label>
                        <select className="form-select w-full" value={convTo} onChange={e => setConvTo(e.target.value)}>
                          {CONV_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  {convResult !== null ? (
                    <div className="mt-5 p-4 rounded-lg bg-gray-800 border border-yellow-700/40">
                      <div className="text-xl font-bold text-white">
                        <span className="text-gray-400">{fmtConv(n, convFrom)}</span>
                        <span className="text-accent-yellow mx-2">=</span>
                        <span>{fmtConv(convResult, convTo)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                        <i className="fas fa-circle text-green-400" style={{ fontSize: 7 }}></i>
                        Live rate  /  1 {convFrom} = {((fxRates?.[convTo] ?? 1) / (fxRates?.[convFrom] ?? 1)).toFixed(4)} {convTo}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 text-sm text-gray-500">
                      <i className="fas fa-info-circle mr-1"></i>
                      Enter an amount above to see the conversion.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <div id="dashboard-crypto-table-container" className="dashboard-news-crypto">
            <CryptoTable data={tableData} tradesEnabled={tradesEnabled} extendedMarketFilters={tradesEnabled} />
          </div>
          <div id="dashboard-transaction-table-container" className="dashboard-news-tx">
            <TransactionTable data={transactionDataState.slice(0, 5)} />
          </div>
        </div>
      )}

      <RequestCardModal activeModal={activeModal} setActiveModal={setActiveModal} userProfile={currentUser} presetTier={requestedTier} />
      <NotificationModal activeModal={activeModal} setActiveModal={setActiveModal} />
      <DepositModal activeModal={activeModal} setActiveModal={setActiveModal} cryptoData={cryptoDataState} currentUser={currentUser} />
      <WithdrawModal activeModal={activeModal} setActiveModal={setActiveModal} cryptoData={cryptoDataState} currentUser={currentUser} />
      <SetPinModal activeModal={activeModal} setActiveModal={setActiveModal} />
      <BankWithdrawalModal activeModal={activeModal} setActiveModal={setActiveModal} />
      <CardWithdrawalModal activeModal={activeModal} setActiveModal={setActiveModal} cardData={cardDataState} />
      <CryptoWithdrawalModal activeModal={activeModal} setActiveModal={setActiveModal} cryptoData={cryptoDataState} />
      <KycModal activeModal={activeModal} setActiveModal={setActiveModal} />
      <CardDetailsModal activeModal={activeModal} setActiveModal={setActiveModal} />
      <LockReasonModal activeModal={activeModal} setActiveModal={setActiveModal} />
      <CardLimitsModal activeModal={activeModal} setActiveModal={setActiveModal} />
      <ChangeNameModal activeModal={activeModal} setActiveModal={setActiveModal} />
      <ChangeEmailModal activeModal={activeModal} setActiveModal={setActiveModal} />
    </div>
  );
};

export default DashboardPage;
