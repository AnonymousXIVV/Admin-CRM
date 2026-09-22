import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { DataContext, NotificationContext } from '../../App';
import { injectBalance, getLeadBalanceHistory, deleteBalanceHistoryEntryApi, clearBalanceHistoryApi, resetAllBalancesApi, searchAdminLeads } from '../../adminApi';
import { SearchAutocomplete } from '../UserChrome';

// Maps the frontend crypto ticker to the backend asset code + minor-unit multiplier.
// Only assets supported by the balance injection endpoint are listed.
const TICKER_TO_BACKEND = {
  BTC:  { asset: 'BTC',  multiplier: 1e8,  balanceKey: 'btc_sat'    },
  ETH:  { asset: 'ETH',  multiplier: 1e9,  balanceKey: 'eth_wei_e9' },
  USDT: { asset: 'USDT', multiplier: 1e2,  balanceKey: 'usdt_minor' },
  USD:  { asset: 'USD',  multiplier: 1e2,  balanceKey: 'fiat_minor' },
};

// Fiat is intentionally not part of the market asset catalog, but it belongs
// in this balance-management view alongside the crypto assets.
const FIAT_ASSET = {
  id: 'asset-usd',
  asset: 'US Dollar',
  ticker: 'USD',
  price: 1,
  category: 'fiat',
};

const Balances = () => {
  const { leads, setLeads, cryptoData, cardData, setCardData, logAdminAction } = useContext(DataContext);
  const showNotification = useContext(NotificationContext);
  const balanceAssets = useMemo(
    () => [FIAT_ASSET, ...cryptoData.filter(asset => asset.ticker !== 'USD')],
    [cryptoData]
  );

  const [selectedCryptoLead, setSelectedCryptoLead] = useState(null);
  const [cryptoLeadSearch, setCryptoLeadSearch] = useState('');
  const [cryptoAsset, setCryptoAsset] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoUnit, setCryptoUnit] = useState('crypto');

  const [selectedCardLead, setSelectedCardLead] = useState(null);
  const [cardLeadSearch, setCardLeadSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState('');
  const [cardBalanceAmount, setCardBalanceAmount] = useState('');

  // Live balance + audit-log timeline for the currently selected crypto lead.
  // Loaded from /api/admin/users/{id}/balance-history every time the operator
  // picks a lead and after every successful injection. Keeping this in local
  // state (rather than relying on the leads-list cache) is what guarantees the
  // panel always shows the same numbers the user portal sees.
  const [leadBalanceHistory, setLeadBalanceHistory] = useState([]);
  const [leadBalanceFresh, setLeadBalanceFresh]     = useState(null); // { fiat_minor, btc_sat, ... }
  const [leadBalanceDisplay, setLeadBalanceDisplay] = useState({});   // { usd, btc, eth, usdt, cardUsd }
  const [historyLoading, setHistoryLoading]         = useState(false);
  const [historyError, setHistoryError]             = useState(null);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
  const [deletingHistory, setDeletingHistory]       = useState(false);
  const [resettingAll, setResettingAll]             = useState(false);

  const baseLead = selectedCryptoLead ? leads.find(lead => lead.id === selectedCryptoLead.id) || selectedCryptoLead : null;
  // Merge the freshly-fetched balance over whatever the leads list happened to
  // cache, so the rest of the component reads from one consistent object.
  const currentSelectedCryptoLead = baseLead ? {
    ...baseLead,
    balance:        leadBalanceFresh   || baseLead.balance   || null,
    balances:       Object.keys(leadBalanceDisplay).length > 0 ? leadBalanceDisplay : (baseLead.balances || {}),
    balanceHistory: leadBalanceHistory,
  } : null;
  const currentFiatBalance = currentSelectedCryptoLead
    ? (Number.isFinite(Number(currentSelectedCryptoLead.balance?.fiat_minor))
      ? Number(currentSelectedCryptoLead.balance.fiat_minor) / 100
      : Number(currentSelectedCryptoLead.balances?.usd || 0))
    : 0;
  const currentFiatCurrency = currentSelectedCryptoLead?.balances?.fiatCurrency
    || currentSelectedCryptoLead?.balance?.fiat_currency
    || 'USD';
  const selectedCardLeadCards = useMemo(
    () => selectedCardLead ? cardData.filter(card => card.userId === selectedCardLead.id) : [],
    [selectedCardLead, cardData]
  );

  useEffect(() => {
    if (selectedCardLead) {
      if (selectedCardLeadCards.length > 0) {
        setSelectedCard(selectedCardLeadCards[0].id);
      } else {
        setSelectedCard('');
      }
    } else {
      setSelectedCard('');
    }
  }, [selectedCardLead, selectedCardLeadCards]);

  // Pull the authoritative balance + audit-log history for the given user.
  // Also writes the fresh balance back into the global leads list so any
  // other panel reading from `leads` reflects the same numbers.
  const refreshBalanceHistory = useCallback(async (leadId) => {
    if (!leadId) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await getLeadBalanceHistory(leadId);
      setLeadBalanceFresh(data.balance || null);
      setLeadBalanceDisplay(data.balances || {});
      setLeadBalanceHistory(data.history || []);
      setLeads(prevLeads => prevLeads.map(lead =>
        lead.id === leadId
          ? { ...lead, balance: data.balance || lead.balance, balances: data.balances || lead.balances }
          : lead
      ));
    } catch (error) {
      console.error('[Balances] failed to load balance history:', error);
      setHistoryError(error?.message || 'Could not load balance history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [setLeads]);

  const handleCryptoLeadSelect = (lead) => {
    setSelectedCryptoLead(lead);
    setCryptoLeadSearch(lead.name || lead.email || lead.phone || lead.id || '');
    // Reset stale state from the previously-selected lead before the network
    // call returns, so the UI never briefly shows another user's history.
    setLeadBalanceFresh(null);
    setLeadBalanceDisplay({});
    setLeadBalanceHistory([]);
    setHistoryError(null);
    refreshBalanceHistory(lead.id);
  };

  // Re-fetch when the selection changes through other means (e.g. the parent
  // updates leads). Cleared selection wipes the panel.
  useEffect(() => {
    if (!selectedCryptoLead && !selectedCardLead) {
      setLeadBalanceFresh(null);
      setLeadBalanceDisplay({});
      setLeadBalanceHistory([]);
      setHistoryError(null);
    }
  }, [selectedCryptoLead, selectedCardLead]);

  // Filter the lead's audit-log history down to card-balance entries only,
  // for use in the "Manage Card Balances" section.
  const cardBalanceHistory = (leadBalanceHistory || []).filter(
    h => h.balanceKey === 'card_minor' || h.asset === 'CARD'
  );

  const handleCardLeadSelect = (lead) => {
    setSelectedCardLead(lead);
    setCardLeadSearch(lead.name || lead.email || lead.phone || lead.id || '');
    // Pull the same audit-log history used for the crypto panel - we'll
    // filter it down to card-balance entries when rendering.
    setLeadBalanceFresh(null);
    setLeadBalanceDisplay({});
    setLeadBalanceHistory([]);
    setHistoryError(null);
    refreshBalanceHistory(lead.id);
  };

  const handleSetCryptoBalance = async (e) => {
    e.preventDefault();
    if (!currentSelectedCryptoLead || !cryptoAsset || !cryptoAmount) {
      showNotification('Please fill all crypto balance fields.', 'error');
      return;
    }

    const assetInfo = balanceAssets.find(asset => asset.id === cryptoAsset);
    if (!assetInfo) {
      showNotification('Invalid crypto asset selected.', 'error');
      return;
    }

    const backendInfo = TICKER_TO_BACKEND[assetInfo.ticker];
    if (!backendInfo) {
      showNotification(`${assetInfo.ticker} is not supported for balance injection. Use BTC, ETH, or USDT.`, 'error');
      return;
    }

    const amount = parseFloat(cryptoAmount);
    if (isNaN(amount) || amount < 0) {
      showNotification('Invalid amount.', 'error');
      return;
    }

    // Convert the entered amount to full crypto units, then to minor units.
    // This form credits the entered amount; it does not replace the current balance.
    const cryptoValue = cryptoUnit === 'usd' ? amount / assetInfo.price : amount;
    const amountMinor = Math.round(cryptoValue * backendInfo.multiplier);
    const currentMinor = Number(currentSelectedCryptoLead.balance?.[backendInfo.balanceKey] ?? 0);

    if (amountMinor <= 0) {
      showNotification('Enter an amount greater than zero.', 'error');
      return;
    }

    try {
      const result = await injectBalance(currentSelectedCryptoLead.id, {
        asset:       backendInfo.asset,
        amount_minor: amountMinor,
        type:        'Adjustment',
        description: `Admin added ${cryptoValue} ${assetInfo.ticker} to the ${assetInfo.asset} balance`,
      });

      // Update the lead's balance in local state from the authoritative backend response.
      const freshBalances = result?.balances ?? {};
      setLeads(prevLeads => prevLeads.map(lead =>
        lead.id === currentSelectedCryptoLead.id
          ? { ...lead, balance: { ...(lead.balance || {}), ...freshBalances } }
          : lead
      ));
      // Pull a fresh history (which also re-fetches the balance row) so the
      // operator immediately sees the new ledger entry above the form.
      refreshBalanceHistory(currentSelectedCryptoLead.id);

      const equivalenceText = cryptoUnit === 'crypto'
        ? ` (~$${(cryptoValue * assetInfo.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
        : ` (~${cryptoValue.toFixed(6)} ${assetInfo.ticker})`;

       const previousCrypto = currentMinor / backendInfo.multiplier;
       const newCrypto = (currentMinor + amountMinor) / backendInfo.multiplier;
       logAdminAction('Admin', 'Add Crypto Balance', `Added ${cryptoValue} ${assetInfo.ticker} to ${assetInfo.asset} balance for ${currentSelectedCryptoLead.name} (${previousCrypto} → ${newCrypto} ${assetInfo.ticker})`);
       showNotification(`Added ${cryptoValue} ${assetInfo.ticker} to ${currentSelectedCryptoLead.name}'s balance.${equivalenceText}`, 'success');
      setCryptoAmount('');
    } catch (error) {
      console.error('[Balances] balance injection failed:', error);
      const msg = error?.message || 'Balance could not be saved to backend.';
      showNotification(msg, 'error');
    }
  };

  const handleSetCardBalance = async (e) => {
    e.preventDefault();
    if (!selectedCardLead || !selectedCard || !cardBalanceAmount) {
      showNotification('Please fill all card balance fields.', 'error');
      return;
    }

    const amount = parseFloat(cardBalanceAmount);
    if (isNaN(amount) || amount < 0) {
      showNotification('Invalid amount.', 'error');
      return;
    }

    const cardInfo = cardData.find(card => card.id === selectedCard);
    if (!cardInfo) {
      showNotification('Selected card not found.', 'error');
      return;
    }

    // Card balance is stored in balances.card_minor (cents) per user, not per card.
    const amountMinor = Math.round(amount * 100);
    const currentMinor = Number(leadBalanceFresh?.card_minor ?? selectedCardLead.balance?.card_minor ?? 0);

    if (amountMinor <= 0) {
      showNotification('Enter an amount greater than zero.', 'error');
      return;
    }

    try {
      const result = await injectBalance(selectedCardLead.id, {
        asset:        'CARD',
        amount_minor: amountMinor,
        type:         'Card Top-Up',
        description:  `Admin added $${amount.toFixed(2)} to card balance (card **** ${cardInfo.cardNumber?.slice(-4) ?? '????'})`,
      });

      // Reflect the fresh balance in the leads list and the card local state.
      const freshBalances = result?.balances ?? {};
      setLeads(prevLeads => prevLeads.map(lead =>
        lead.id === selectedCardLead.id
          ? { ...lead, balance: { ...(lead.balance || {}), ...freshBalances } }
          : lead
      ));
      setSelectedCardLead(prevLead => prevLead
        ? { ...prevLead, balance: { ...(prevLead.balance || {}), ...freshBalances } }
        : prevLead
      );
      setCardData(prevCardData => prevCardData.map(card =>
         card.id === selectedCard ? { ...card, balance: (Number(card.balance) || 0) + amount } : card
      ));
      // Refresh the audit-log history so the new card top-up entry shows
      // up immediately under the card balances section.
      refreshBalanceHistory(selectedCardLead.id);

       const previousCardBalance = currentMinor / 100;
       const newCardBalance = (currentMinor + amountMinor) / 100;
       logAdminAction('Admin', 'Add Card Balance', `Added $${amount.toFixed(2)} to card **** ${cardInfo.cardNumber?.slice(-4) ?? '????'} (user: ${selectedCardLead.name}; ${previousCardBalance.toFixed(2)} → ${newCardBalance.toFixed(2)})`);
       showNotification(`Added $${amount.toFixed(2)} to ${selectedCardLead.name}'s card balance.`, 'success');
      setCardBalanceAmount('');
    } catch (error) {
      console.error('[Balances] card balance injection failed:', error);
      const msg = error?.message || 'Card balance could not be saved to backend.';
      showNotification(msg, 'error');
    }
  };

  const handleDeleteHistoryEntry = useCallback(async (leadId, entryId) => {
    try {
      await deleteBalanceHistoryEntryApi(leadId, entryId);
      setSelectedHistoryIds(prev => { const next = new Set(prev); next.delete(entryId); return next; });
      refreshBalanceHistory(leadId);
      showNotification('History entry deleted.', 'success');
    } catch (err) {
      showNotification(err?.message || 'Failed to delete entry.', 'error');
    }
  }, [refreshBalanceHistory, showNotification]);

  const handleBulkDeleteHistory = useCallback(async (leadId) => {
    if (!selectedHistoryIds.size) return;
    setDeletingHistory(true);
    const count = selectedHistoryIds.size;
    try {
      await Promise.all([...selectedHistoryIds].map(id => deleteBalanceHistoryEntryApi(leadId, id)));
      setSelectedHistoryIds(new Set());
      refreshBalanceHistory(leadId);
      showNotification(`${count} entr${count === 1 ? 'y' : 'ies'} deleted.`, 'success');
    } catch (err) {
      showNotification(err?.message || 'Failed to delete entries.', 'error');
    } finally {
      setDeletingHistory(false);
    }
  }, [selectedHistoryIds, refreshBalanceHistory, showNotification]);

  const handleClearAllHistory = useCallback(async (leadId) => {
    if (!window.confirm('Delete ALL balance history for this lead? This cannot be undone.')) return;
    setDeletingHistory(true);
    try {
      await clearBalanceHistoryApi(leadId);
      setSelectedHistoryIds(new Set());
      refreshBalanceHistory(leadId);
      showNotification('All balance history cleared.', 'success');
    } catch (err) {
      showNotification(err?.message || 'Failed to clear history.', 'error');
    } finally {
      setDeletingHistory(false);
    }
  }, [refreshBalanceHistory, showNotification]);

  const handleResetAllBalances = useCallback(async (leadId, leadName) => {
    if (!window.confirm(`Reset ALL crypto balances to zero for ${leadName}? This cannot be undone.`)) return;
    setResettingAll(true);
    try {
      await resetAllBalancesApi(leadId);
      showNotification(`All balances reset to zero for ${leadName}.`, 'success');
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, balances: {} } : l));
      refreshBalanceHistory(leadId);
    } catch (err) {
      showNotification(err?.message || 'Failed to reset balances.', 'error');
    } finally {
      setResettingAll(false);
    }
  }, [refreshBalanceHistory, setLeads, showNotification]);

  const balanceFieldStyle = {
    width: '100%',
    margin: 0,
    padding: '12px 14px',
    minHeight: '44px',
    boxSizing: 'border-box',
    border: '1px solid #444A55',
    borderRadius: '6px',
    background: '#2B3038',
    color: '#EAECEF',
    fontSize: '14px',
    lineHeight: '1.4',
  };
  const balanceSelectStyle = {
    ...balanceFieldStyle,
    paddingRight: '38px',
    backgroundImage: "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"6\" fill=\"%23848E9C\" viewBox=\"0 0 10 6\"><path d=\"M0 0l5 6 5-6z\"/></svg>')",
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    appearance: 'none',
    WebkitAppearance: 'none',
  };
  const balanceFormGroupStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: 0,
    width: '100%',
  };
  const balanceLabelStyle = {
    display: 'block',
    margin: '0 0 8px',
    color: '#848E9C',
    fontSize: '12px',
    fontWeight: 600,
    letterSpacing: '0.02em',
    lineHeight: '1.4',
  };
  const balanceActionsStyle = {
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: '12px',
    paddingTop: '4px',
  };
  const balanceActionButtonStyle = {
    margin: 0,
    padding: '10px 16px',
    minHeight: '38px',
    borderRadius: '6px',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    lineHeight: 1.2,
    border: '1px solid rgba(240, 185, 11, 0.45)',
    boxSizing: 'border-box',
    background: '#F0B90B',
    color: '#1A1E2A',
    boxShadow: '0 1px 2px rgba(240, 185, 11, 0.18)',
  };
  const selectedAssetInfo = balanceAssets.find(asset => asset.id === cryptoAsset);
  const calculatedSafeAmount = parseFloat(cryptoAmount);
  const cryptoEquivalent = selectedAssetInfo && !isNaN(calculatedSafeAmount) ?
    (cryptoUnit === 'crypto'
      ? (calculatedSafeAmount * selectedAssetInfo.price)
      : (calculatedSafeAmount / selectedAssetInfo.price))
    : null;
  const equivalentLabel = selectedAssetInfo ?
    (cryptoUnit === 'crypto'
      ? `Equivalent USD value: $${cryptoEquivalent?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `Equivalent ${selectedAssetInfo.ticker}: ${cryptoEquivalent?.toFixed(6)} ${selectedAssetInfo.ticker}`)
    : 'Select an asset to preview equivalence.';
  const selectedAssetCurrentBalance = currentSelectedCryptoLead && selectedAssetInfo
    ? (selectedAssetInfo.ticker === 'USD'
      ? currentFiatBalance
      : Number(currentSelectedCryptoLead.balances?.[selectedAssetInfo.ticker.toLowerCase()] || 0))
    : 0;
  const selectedAssetPreviewBalance = selectedAssetInfo && cryptoAmount.trim() && !isNaN(calculatedSafeAmount)
    ? selectedAssetCurrentBalance + (cryptoUnit === 'usd' ? calculatedSafeAmount / selectedAssetInfo.price : calculatedSafeAmount)
    : null;
  const selectedBalanceHistory = currentSelectedCryptoLead?.balanceHistory || [];

  return (
    <div id="balances-section" className="aax-admin-section aax-balances-page">
      <h2>[money] Balances Management</h2>
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '16px', color: '#848E9C' }}>[card] Manage Account Balances</h3>
         <SearchAutocomplete
           value={cryptoLeadSearch}
           onChange={(value) => {
             setCryptoLeadSearch(value);
             if (selectedCryptoLead && value !== (selectedCryptoLead.name || selectedCryptoLead.email || selectedCryptoLead.phone || selectedCryptoLead.id)) {
               setSelectedCryptoLead(null);
             }
           }}
           onSelect={(suggestion) => handleCryptoLeadSelect(suggestion?.lead || suggestion)}
           placeholder="Search name, email, phone or ID..."
           className="admin-input"
           style={{ width: '100%', marginBottom: 16 }}
           fetchSuggestions={searchAdminLeads}
           buildSuggestions={(query) => {
             const q = query.trim().toLowerCase();
             return (leads || [])
               .filter(lead => [lead.name, lead.firstName, lead.lastName, lead.email, lead.phone, lead.id]
                 .some(value => String(value || '').toLowerCase().includes(q)))
               .map(lead => ({
                 key: lead.id,
                 value: lead.name || lead.email || lead.phone || lead.id,
                 label: lead.name || '(no name)',
                 meta: [lead.email, lead.phone, lead.id].filter(Boolean).join(' · '),
                 lead,
               }));
           }}
           maxSuggestions={15}
           inputProps={{
             id: 'crypto-lead-search',
             'aria-label': 'Select lead for account balance management',
           }}
         />
        {currentSelectedCryptoLead && (
          <div className="aax-fiat-balance-summary" aria-label={`${currentFiatCurrency} fiat balance`}>
            <div>
              <span className="aax-fiat-balance-label">{currentFiatCurrency} Fiat Balance</span>
              <span className="aax-fiat-balance-subtitle">{currentSelectedCryptoLead.name}</span>
            </div>
            <strong>{currentFiatBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currentFiatCurrency}</strong>
          </div>
        )}
        {currentSelectedCryptoLead && (
          <div style={{ marginBottom: '16px', padding: '16px', background: '#363B44', border: '1px solid #444A55', borderRadius: '10px' }}>
            <div style={{ fontWeight: 700, marginBottom: '12px', color: '#f3ba2f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>Current balances for {currentSelectedCryptoLead.name}</span>
              <button
                onClick={() => handleResetAllBalances(currentSelectedCryptoLead.id, currentSelectedCryptoLead.name)}
                disabled={resettingAll}
                style={{ fontSize: '0.78rem', padding: '4px 12px', background: 'rgba(246,70,93,0.12)', border: '1px solid rgba(246,70,93,0.4)', borderRadius: 6, color: '#F6465D', cursor: resettingAll ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                title="Reset all cryptocurrency balances to zero"
              >
                {resettingAll ? '...resetting' : '⚠ Reset All to Zero'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
              {balanceAssets.map(asset => (
                <div key={asset.id} style={{ padding: '10px 12px', background: '#363B44', border: '1px solid #444A55', borderRadius: '8px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#9fb1d1' }}>{asset.ticker === 'USD' ? `${currentFiatCurrency} Fiat` : asset.asset}</div>
                  <div style={{ fontWeight: 700, color: '#e8eefc' }}>
                    {asset.ticker === 'USD'
                      ? currentFiatBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ` ${currentFiatCurrency}`
                      : Number(currentSelectedCryptoLead.balances?.[asset.ticker.toLowerCase()] || 0).toLocaleString(undefined, { maximumFractionDigits: 8 }) + ` ${asset.ticker}`}
                  </div>
                </div>
              ))}
            </div>
            {selectedAssetInfo && (
              <div style={{ padding: '10px 12px', background: '#363B44', border: '1px solid #334562', borderRadius: '8px', marginBottom: '14px', color: '#848E9C' }}>
                <strong>{selectedAssetInfo.asset}</strong>: current balance is <strong>{selectedAssetCurrentBalance.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedAssetInfo.ticker}</strong>
                {selectedAssetPreviewBalance !== null && (
                  <> → balance after addition will be <strong style={{ color: '#f3ba2f' }}>{selectedAssetPreviewBalance.toLocaleString(undefined, { maximumFractionDigits: 8 })} {selectedAssetInfo.ticker}</strong></>
                )}
              </div>
            )}
            <div style={{ fontWeight: 700, marginBottom: '8px', color: '#848E9C', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span>Balance update history ({selectedBalanceHistory.length})</span>
              {historyLoading && <span style={{ fontSize: '0.8rem', color: '#9fb1d1' }}> /  refreshing...</span>}
              {historyError && <span style={{ fontSize: '0.8rem', color: '#F6465D' }}> /  {historyError}</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
                {selectedHistoryIds.size > 0 && (
                  <button onClick={() => handleBulkDeleteHistory(currentSelectedCryptoLead.id)} disabled={deletingHistory}
                    style={{ fontSize: '0.75rem', padding: '3px 10px', background: 'rgba(246,70,93,0.15)', border: '1px solid rgba(246,70,93,0.4)', borderRadius: 6, color: '#F6465D', cursor: 'pointer', fontWeight: 600 }}>
                    Delete {selectedHistoryIds.size} selected
                  </button>
                )}
                {selectedBalanceHistory.length > 0 && (
                  <button onClick={() => handleClearAllHistory(currentSelectedCryptoLead.id)} disabled={deletingHistory}
                    style={{ fontSize: '0.75rem', padding: '3px 10px', background: 'rgba(246,70,93,0.08)', border: '1px solid #444A55', borderRadius: 6, color: '#9fb1d1', cursor: 'pointer' }}>
                    Clear all
                  </button>
                )}
              </div>
            </div>
            {selectedBalanceHistory.length > 0 ? (
              <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #444A55', borderRadius: '8px' }}>
                {selectedBalanceHistory.map(entry => {
                  const deltaPositive = (entry.delta || 0) >= 0;
                  const entryId = entry.id || `${entry.date}-${entry.asset}`;
                  const isChecked = selectedHistoryIds.has(entryId);
                  return (
                    <div key={entryId} style={{ display: 'grid', gridTemplateColumns: '24px 1.3fr 1fr 1fr 1fr 28px', gap: '8px', padding: '10px 10px', borderBottom: '1px solid #444A55', color: '#848E9C', alignItems: 'center' }}>
                      <input
                        type="checkbox" checked={isChecked}
                        onChange={e => setSelectedHistoryIds(prev => { const next = new Set(prev); e.target.checked ? next.add(entryId) : next.delete(entryId); return next; })}
                        style={{ cursor: 'pointer', accentColor: '#F0B90B' }}
                      />
                      <div>
                        <div style={{ fontWeight: 700 }}>{entry.assetName || entry.asset} <span style={{ fontSize: '0.78rem', color: '#9fb1d1', fontWeight: 400 }}>({entry.txType || 'Adjustment'})</span></div>
                        <div style={{ fontSize: '0.78rem', color: '#9fb1d1' }}>{entry.date ? new Date(entry.date).toLocaleString() : '-'}</div>
                        <div style={{ fontSize: '0.78rem', color: '#9fb1d1' }}>by {entry.actorName || entry.actorRole || entry.actorAdminId || 'admin'}</div>
                      </div>
                      <div style={{ fontSize: '0.9rem' }}>Before: <strong>{Number(entry.previousBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })} {entry.ticker || ''}</strong></div>
                      <div style={{ fontSize: '0.9rem' }}>After: <strong style={{ color: '#f3ba2f' }}>{Number(entry.newBalance || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })} {entry.ticker || ''}</strong></div>
                      <div style={{ fontSize: '0.9rem', color: deltaPositive ? '#0ECB81' : '#F6465D' }}>
                        {deltaPositive ? '+' : ''}{Number(entry.delta || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })} {entry.ticker || ''}
                      </div>
                      <button onClick={() => handleDeleteHistoryEntry(currentSelectedCryptoLead.id, entryId)}
                        title="Delete entry"
                        style={{ background: 'transparent', border: 'none', color: 'rgba(246,70,93,0.6)', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: '0.85rem', lineHeight: 1 }}>
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#8c9cb5' }}>{historyLoading ? 'Loading balance history...' : 'No balance updates recorded yet.'}</div>
            )}
          </div>
        )}
        <fieldset id="crypto-balance-fieldset" disabled={!selectedCryptoLead} style={{ opacity: !selectedCryptoLead ? 0.5 : 1, border: 'none', padding: 0, margin: 0 }}>
          <form id="crypto-balance-form" onSubmit={handleSetCryptoBalance} style={{ background: '#363B44', border: '1px solid #444A55', borderRadius: '10px', padding: 0 }}>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <div className="admin-form-group" style={balanceFormGroupStyle}>
                <label htmlFor="crypto-asset-select" className="admin-form-label" style={balanceLabelStyle}>🪙 Asset</label>
                <select
                  id="crypto-asset-select"
                  className="admin-input"
                  value={cryptoAsset}
                  style={balanceSelectStyle}
                  onChange={(e) => setCryptoAsset(e.target.value)}
                >
                  <option value="">Select Asset</option>
                  {balanceAssets.map(asset => (
                    <option key={asset.id} value={asset.id}>{asset.asset} ({asset.ticker})</option>
                  ))}
                </select>
              </div>
              <div className="admin-form-group" style={balanceFormGroupStyle}>
                <label htmlFor="crypto-balance-amount" className="admin-form-label" style={balanceLabelStyle}>💵 Amount</label>
                <input
                  type="number"
                  step="any"
                  id="crypto-balance-amount"
                  className="admin-input"
                  placeholder="e.g., 0.5"
                  required
                  value={cryptoAmount}
                  style={balanceFieldStyle}
                  onChange={(e) => setCryptoAmount(e.target.value)}
                />
              </div>
              <div className="admin-form-group" style={balanceFormGroupStyle}>
                <label htmlFor="crypto-balance-unit" className="admin-form-label" style={balanceLabelStyle}>[chart] Unit</label>
                <select
                  id="crypto-balance-unit"
                  className="admin-input"
                  value={cryptoUnit}
                  style={balanceSelectStyle}
                  onChange={(e) => setCryptoUnit(e.target.value)}
                >
                  <option value="crypto">Crypto</option>
                  <option value="usd">USD</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 0, fontSize: '0.95rem', color: '#b0c1d7' }}>
              {cryptoAmount.trim() && selectedAssetInfo ? equivalentLabel : 'Enter an amount and asset to see the equivalent value.'}
            </div>
            <div style={balanceActionsStyle}>
              <button type="submit" className="aax-btn-primary" style={balanceActionButtonStyle}>Add Balance</button>
            </div>
            </div>
          </form>
        </fieldset>
      </div>
      <div>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '16px', color: '#848E9C' }}>[card] Manage Card Balances</h3>
         <SearchAutocomplete
           value={cardLeadSearch}
           onChange={(value) => {
             setCardLeadSearch(value);
             if (selectedCardLead && value !== (selectedCardLead.name || selectedCardLead.email || selectedCardLead.phone || selectedCardLead.id)) {
               setSelectedCardLead(null);
             }
           }}
           onSelect={(suggestion) => handleCardLeadSelect(suggestion?.lead || suggestion)}
           placeholder="Search name, email, phone or ID..."
           className="admin-input"
           style={{ width: '100%', marginBottom: 16 }}
           fetchSuggestions={searchAdminLeads}
           buildSuggestions={(query) => {
             const q = query.trim().toLowerCase();
             return (leads || [])
               .filter(lead => [lead.name, lead.firstName, lead.lastName, lead.email, lead.phone, lead.id]
                 .some(value => String(value || '').toLowerCase().includes(q)))
               .map(lead => ({
                 key: lead.id,
                 value: lead.name || lead.email || lead.phone || lead.id,
                 label: lead.name || '(no name)',
                 meta: [lead.email, lead.phone, lead.id].filter(Boolean).join(' · '),
                 lead,
               }));
           }}
           maxSuggestions={15}
           inputProps={{
             id: 'card-balance-lead-search',
             'aria-label': 'Select lead for card balance management',
           }}
         />
        {selectedCardLead && (
          <div style={{ marginBottom: '16px', padding: '16px', background: '#363B44', border: '1px solid #444A55', borderRadius: '10px' }}>
            <div style={{ fontWeight: 600, marginBottom: '10px', color: '#f3ba2f' }}>Issued cards for {selectedCardLead.name}</div>
            {selectedCardLeadCards.length > 0 ? (
              <div style={{ display: 'grid', gap: '10px' }}>
                {selectedCardLeadCards.map(card => (
                  <div key={card.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#363B44', border: '1px solid #444A55', borderRadius: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{card.type} Card</div>
                      <div style={{ fontSize: '0.9rem', color: '#9fb1d1' }}>**** **** **** {card.cardNumber?.slice(-4) ?? '????'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 600 }}>${card.balance.toFixed(2)}</div>
                      <div style={{ fontSize: '0.85rem', color: '#9fb1d1' }}>{card.isFrozen ? 'Frozen' : 'Active'}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#8c9cb5' }}>No cards are currently issued to this lead. Issue a card from Card Management first.</div>
            )}
            <div style={{ marginTop: '16px', fontWeight: 700, marginBottom: '8px', color: '#848E9C', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>Card balance history ({cardBalanceHistory.length})</span>
              {historyLoading && <span style={{ fontSize: '0.8rem', color: '#9fb1d1' }}> /  refreshing...</span>}
              {historyError && <span style={{ fontSize: '0.8rem', color: '#F6465D' }}> /  {historyError}</span>}
            </div>
            {cardBalanceHistory.length > 0 ? (
              <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid #444A55', borderRadius: '8px' }}>
                {cardBalanceHistory.map(entry => {
                  const deltaPositive = (entry.delta || 0) >= 0;
                  return (
                    <div key={entry.id || `${entry.date}-card`} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: '10px', padding: '10px 12px', borderBottom: '1px solid #444A55', color: '#848E9C' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>Card balance <span style={{ fontSize: '0.78rem', color: '#9fb1d1', fontWeight: 400 }}>({entry.txType || 'Card Top-Up'})</span></div>
                        <div style={{ fontSize: '0.78rem', color: '#9fb1d1' }}>{entry.date ? new Date(entry.date).toLocaleString() : '-'}</div>
                        <div style={{ fontSize: '0.78rem', color: '#9fb1d1' }}>by {entry.actorName || entry.actorRole || entry.actorAdminId || 'admin'}</div>
                      </div>
                      <div style={{ fontSize: '0.9rem' }}>Before: <strong>${Number(entry.previousBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                      <div style={{ fontSize: '0.9rem' }}>After: <strong style={{ color: '#f3ba2f' }}>${Number(entry.newBalance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                      <div style={{ fontSize: '0.9rem', color: deltaPositive ? '#0ECB81' : '#F6465D' }}>
                        {deltaPositive ? '+' : ''}${Number(entry.delta || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: '#8c9cb5' }}>{historyLoading ? 'Loading card balance history...' : 'No card balance updates recorded yet for this lead.'}</div>
            )}
          </div>
        )}
        <fieldset id="card-balance-fieldset" disabled={!selectedCardLead} style={{ opacity: !selectedCardLead ? 0.5 : 1, border: 'none', padding: 0, margin: 0 }}>
          <form id="card-balance-form" onSubmit={handleSetCardBalance} style={{ background: '#363B44', border: '1px solid #444A55', borderRadius: '10px', padding: 0 }}>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
              <div className="admin-form-group" style={balanceFormGroupStyle}>
                <label htmlFor="card-select" className="admin-form-label" style={balanceLabelStyle}>🎫 Card</label>
                <select
                  id="card-select"
                  className="admin-input"
                  value={selectedCard}
                  style={balanceSelectStyle}
                  onChange={(e) => setSelectedCard(e.target.value)}
                  disabled={!selectedCardLead || cardData.filter(card => card.userId === selectedCardLead.id).length === 0}
                >
                  {selectedCardLead && cardData.filter(card => card.userId === selectedCardLead.id).map(card => (
                    <option key={card.id} value={card.id}>{card.cardholderName} - **** {card.cardNumber?.slice(-4) ?? '????'}</option>
                  ))}
                  {selectedCardLead && cardData.filter(card => card.userId === selectedCardLead.id).length === 0 && (
                    <option value="">No cards for this lead</option>
                  )}
                </select>
              </div>
              <div className="admin-form-group" style={balanceFormGroupStyle}>
                <label htmlFor="card-balance-amount" className="admin-form-label" style={balanceLabelStyle}>💵 Amount to add (USD)</label>
                <input
                  type="number"
                  step="any"
                  id="card-balance-amount"
                  className="admin-input"
                  placeholder="e.g., 1000.00"
                  required
                  value={cardBalanceAmount}
                  style={balanceFieldStyle}
                  onChange={(e) => setCardBalanceAmount(e.target.value)}
                />
              </div>
            </div>
            <div style={balanceActionsStyle}>
              <button type="submit" className="aax-btn-primary" style={balanceActionButtonStyle}>Add Card Balance</button>
            </div>
            </div>
          </form>
        </fieldset>
      </div>
    </div>
  );
};

export default Balances;