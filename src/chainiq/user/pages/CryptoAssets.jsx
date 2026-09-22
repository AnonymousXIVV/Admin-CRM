import React, { useContext, useState, useEffect, useMemo } from 'react';
import { CryptoTable, TransactionTable } from '../components/Tables';
import { formatCurrency } from '../utils';
import { DataContext } from '../contexts/DataContext';
import { DepositModal, WithdrawModal, ConvertAssetsModal } from '../components/Modals';

const CryptoAssets = () => {
  const { cryptoDataState, transactionDataState, currentUser, formatBalance, tradfiAssetsState, cryptoSparklinesState, tradesEnabled } = useContext(DataContext);

  const tableData = useMemo(() => {
    const crypto = cryptoDataState.map((a) => ({
      ...a,
      category: a.category || 'crypto',
      sparkline: (cryptoSparklinesState || {})[a.ticker] || a.sparkline || [],
    }));
    if (!tradesEnabled) return crypto;
    const tradfi = (tradfiAssetsState || []).map((a) => ({
      ...a,
      category: a.category || 'stocks',
      sparkline: a.sparkline || [],
    }));
    return [...crypto, ...tradfi];
  }, [cryptoDataState, tradfiAssetsState, cryptoSparklinesState, tradesEnabled]);
  const [activeModal, setActiveModal] = useState(null);

  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [convertFrom, setConvertFrom] = useState('');
  const [convertTo, setConvertTo] = useState('');
  const [convertAmount, setConvertAmount] = useState('');
  const [convertResult, setConvertResult] = useState(null);
  const [convertError, setConvertError] = useState('');

  const cryptoOnly = useMemo(
    () => tableData.filter((a) => (a.category || 'crypto') === 'crypto'),
    [tableData]
  );

  useEffect(() => {
    if (cryptoOnly.length > 0) {
      if (!selectedAssetId || !cryptoOnly.find((a) => a.id === selectedAssetId)) {
        setSelectedAssetId(cryptoOnly[0].id);
      }
      if (!convertFrom || !cryptoOnly.find((a) => a.id === convertFrom)) setConvertFrom(cryptoOnly[0].id);
      if (!convertTo || !cryptoOnly.find((a) => a.id === convertTo)) {
        setConvertTo(cryptoOnly.length > 1 ? cryptoOnly[1].id : cryptoOnly[0].id);
      }
    }
  }, [cryptoOnly, selectedAssetId, convertFrom, convertTo]);

  useEffect(() => {
    if (!convertAmount || !convertFrom || !convertTo || !cryptoDataState.length) {
      setConvertResult(null);
      return;
    }
    const amount = parseFloat(convertAmount);
    if (isNaN(amount) || amount <= 0) { setConvertError('Enter a valid amount'); setConvertResult(null); return; }
    const fromAsset = cryptoDataState.find(a => a.id === convertFrom);
    const toAsset = cryptoDataState.find(a => a.id === convertTo);
    if (!fromAsset || !toAsset) return;
    if (!fromAsset.price || !toAsset.price) { setConvertError('Price data not available'); return; }
    setConvertError('');
    const usdValue = amount * fromAsset.price;
    const toAmount = usdValue / toAsset.price;
    setConvertResult({ toAmount, toAsset, fromAsset, usdValue, amount });
  }, [convertAmount, convertFrom, convertTo, cryptoDataState]);

  const totalCryptoBalance = cryptoDataState.reduce((acc, asset) => acc + (asset.balance * asset.price), 0);
  const totalFiatBalance = Number(currentUser?.balances?.usd) || 0;

  const handleSwapAssets = () => {
    const tmp = convertFrom;
    setConvertFrom(convertTo);
    setConvertTo(tmp);
  };

  return (
    <div id="crypto-assets-page" className="page-content active">
        <div className="crypto-actions-grid">
            <div className="table-container p-6">
                <h3 className="text-xl font-bold mb-4">Wallet Actions</h3>
                <div className="balance-breakdown mb-4">
                    <div className="balance-breakdown-item">
                        <div className="breakdown-label"><i className="fas fa-coins text-accent-yellow"></i><span>Crypto Assets</span></div>
                        <div className="breakdown-value text-accent-yellow">{formatBalance(totalCryptoBalance)}</div>
                    </div>
                    <div className="balance-breakdown-item">
                        <div className="breakdown-label"><i className="fas fa-dollar-sign text-accent-green"></i><span>Fiat Balance</span></div>
                        <div className="breakdown-value text-accent-green">{formatBalance(totalFiatBalance)}</div>
                    </div>
                </div>
                <div className="form-group">
                    <label htmlFor="crypto-page-asset-select" className="form-label">Select Asset for Details</label>
                    <select id="crypto-page-asset-select" className="form-select" value={selectedAssetId} onChange={e => setSelectedAssetId(e.target.value)}>
                        {tableData.map(asset => (
                            <option key={asset.id} value={asset.id}>
                                {asset.asset} ({asset.ticker}) - {formatCurrency(asset.price, 'USD')}
                            </option>
                        ))}
                    </select>
                </div>
                {selectedAssetId && (() => {
                    const a = tableData.find(x => x.id === selectedAssetId);
                    if (!a) return null;
                    return (
                        <div className="asset-detail-row" style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                            <div><span>Price: </span><strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(a.price, 'USD')}</strong></div>
                            <div><span>24h: </span><strong style={{ color: a.change >= 0 ? '#0ECB81' : '#F6465D' }}>{a.change >= 0 ? '+' : ''}{(a.change || 0).toFixed(2)}%</strong></div>
                            <div><span>Balance: </span><strong style={{ color: 'var(--text-primary)' }}>{a.balance} {a.ticker}</strong></div>
                        </div>
                    );
                })()}
                <div className="flex gap-4">
                    <button className="btn-action btn-deposit" onClick={() => setActiveModal('deposit-modal')}><i className="fas fa-arrow-down text-sm mr-2"></i>Deposit</button>
                    <button className="btn-action btn-withdraw" onClick={() => setActiveModal('withdraw-modal')}><i className="fas fa-arrow-up text-sm mr-2"></i>Withdraw</button>
                </div>
            </div>

            <div className="table-container p-6">
                <h3 className="text-xl font-bold mb-4">Convert Assets</h3>
                <div className="convert-form-grid" style={{ display: 'grid', gap: 12, alignItems: 'end', marginBottom: 16 }}>
                    <div className="form-group mb-0">
                        <label className="form-label">From</label>
                        <select className="form-select" value={convertFrom} onChange={e => setConvertFrom(e.target.value)}>
                            {cryptoOnly.map(asset => (
                                <option key={asset.id} value={asset.id}>{asset.ticker} - {asset.asset}</option>
                            ))}
                        </select>
                    </div>
                    <button type="button" onClick={handleSwapAssets} style={{ background: 'var(--surface-2,#2B3139)', border: '1px solid var(--border,#363C45)', borderRadius: 6, color: '#F0B90B', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-end', marginBottom: 0 }}>
                        ⇆
                    </button>
                    <div className="form-group mb-0">
                        <label className="form-label">To</label>
                        <select className="form-select" value={convertTo} onChange={e => setConvertTo(e.target.value)}>
                            {cryptoOnly.map(asset => (
                                <option key={asset.id} value={asset.id}>{asset.ticker} - {asset.asset}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Amount to Convert</label>
                    <input
                        type="number"
                        className="form-input"
                        placeholder="0.00"
                        value={convertAmount}
                        onChange={e => setConvertAmount(e.target.value)}
                        min="0"
                    />
                </div>

                {convertError && (
                    <div style={{ color: '#F6465D', fontSize: 13, marginBottom: 10 }}>{convertError}</div>
                )}

                {convertResult && !convertError && (
                    <div style={{ background: 'var(--surface-2,rgba(240,185,11,0.08))', border: '1px solid var(--accent-yellow,#F0B90B)', borderRadius: 8, padding: '12px 16px', marginBottom: 14 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
                            {convertResult.amount} {convertResult.fromAsset.ticker} ≈ <strong style={{ fontSize: 16, color: 'var(--text-primary)' }}>{convertResult.toAmount.toFixed(6)} {convertResult.toAsset.ticker}</strong>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            ≈ {formatCurrency(convertResult.usdValue, 'USD')} at live prices
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', gap: 12 }}>
                            <span>1 {convertResult.fromAsset.ticker} = {formatCurrency(convertResult.fromAsset.price, 'USD')}</span>
                            <span>1 {convertResult.toAsset.ticker} = {formatCurrency(convertResult.toAsset.price, 'USD')}</span>
                        </div>
                    </div>
                )}

                <button
                    className="btn-action btn-convert w-full"
                    disabled={!convertResult || !!convertError}
                    style={{ opacity: (!convertResult || !!convertError) ? 0.5 : 1 }}
                    onClick={() => { if (convertResult && !convertError) setActiveModal('convert-assets-modal'); }}
                >
                    Convert {convertAmount && convertFrom && convertTo ? `${convertAmount} ${cryptoDataState.find(a=>a.id===convertFrom)?.ticker || ''} → ${convertResult ? convertResult.toAmount.toFixed(6) : '...'} ${cryptoDataState.find(a=>a.id===convertTo)?.ticker || ''}` : 'Assets'}
                </button>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, textAlign: 'center' }}>Prices refresh every few seconds from live market data</p>
            </div>
        </div>

        <div id="crypto-assets-page-table-container">
            <CryptoTable data={tableData} tradesEnabled={tradesEnabled} extendedMarketFilters={tradesEnabled} />
        </div>
        <div id="crypto-assets-page-tx-table-container">
            <TransactionTable data={transactionDataState} />
        </div>

        <DepositModal activeModal={activeModal} setActiveModal={setActiveModal} cryptoData={cryptoDataState} currentUser={currentUser} />
        <WithdrawModal activeModal={activeModal} setActiveModal={setActiveModal} cryptoData={cryptoDataState} currentUser={currentUser} />
        <ConvertAssetsModal
            activeModal={activeModal}
            setActiveModal={setActiveModal}
            fromAssetData={convertResult?.fromAsset ?? cryptoDataState.find(a => a.id === convertFrom)}
            toAssetData={convertResult?.toAsset ?? cryptoDataState.find(a => a.id === convertTo)}
            fromAmount={convertAmount}
            toAmount={convertResult?.toAmount ?? 0}
            usdValue={convertResult?.usdValue ?? 0}
        />
    </div>
  );
};

export default CryptoAssets;
