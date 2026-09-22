import React, { useContext, useMemo, useState } from 'react';
import { TransactionTable } from '../components/Tables';
import { DataContext } from '../contexts/DataContext';
import { BankWithdrawalModal, CardWithdrawalModal, WithdrawModal } from '../components/Modals';
import { isKycApproved } from '../kycUtils';
import { CONV_CURRENCIES, fmtConv, convertFxAmount } from '../fxUtils';
import { FIAT_WITHDRAWAL_MONTHLY_LIMIT_USD, sumMonthlyFiatWithdrawalsUsd } from '../withdrawalUtils';

const Withdrawals = () => {
    const { cryptoDataState, cardDataState, transactionDataState, currentUser, formatBalance, fxRates } = useContext(DataContext);
    const [activeModal, setActiveModal] = useState(null);
    const [convAmount, setConvAmount] = useState('');
    const [convFrom, setConvFrom] = useState('USD');
    const [convTo, setConvTo] = useState('EUR');

    const convResult = convertFxAmount(convAmount, convFrom, convTo, fxRates);

    const totalCryptoBalance = cryptoDataState.reduce((acc, asset) => acc + (asset.balance * asset.price), 0);
    const totalFiatBalance = Number(currentUser?.balances?.usd) || 0;
    const kycApproved = isKycApproved(currentUser);
    const { fiatUsed, totalLimit, usedPercentage } = useMemo(() => {
        const used = sumMonthlyFiatWithdrawalsUsd(transactionDataState);
        const limit = FIAT_WITHDRAWAL_MONTHLY_LIMIT_USD;
        return {
            fiatUsed: used,
            totalLimit: limit,
            usedPercentage: limit > 0 ? Math.min(100, (used / limit) * 100) : 0,
        };
    }, [transactionDataState]);

  return (
    <div id="withdrawals-page" className="page-content active">
        <div className="withdraw-grid">
            <div className="table-container p-6">
                <h3 className="text-xl font-bold mb-4">Withdrawal Method</h3>
                <div className="method-card-grid">
                    <div className="method-card" data-method="bank" onClick={() => setActiveModal('bank-withdrawal-modal')}><div className="flex items-center gap-3 mb-2"><i className="fas fa-university text-yellow-400 text-2xl"></i><span className="font-semibold">Bank Transfer</span></div><div className="text-sm text-gray-400 space-y-1"><div>Fee: $5.00</div><div>Time: 1-3 business days</div><div>Min: $100.00</div></div></div>
                    <div className="method-card" data-method="card" onClick={() => setActiveModal('card-withdrawal-modal')}><div className="flex items-center gap-3 mb-2"><i className="fas fa-credit-card text-yellow-400 text-2xl"></i><span className="font-semibold">Card Withdrawal</span></div><div className="text-sm text-gray-400 space-y-1"><div>Fee: 2.5%</div><div>Time: Instant</div><div>Min: $10.00</div></div></div>
                    <div className="method-card" data-method="crypto" onClick={() => setActiveModal('withdraw-modal')}><div className="flex items-center gap-3 mb-2"><i className="fab fa-bitcoin text-yellow-400 text-2xl"></i><span className="font-semibold">Crypto Address</span></div><div className="text-sm text-gray-400 space-y-1"><div>Fee: Network fee</div><div>Time: 10-30 minutes</div><div>Min: $50.00</div></div></div>
                </div>
            </div>
            <div className="table-container p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><i className="fas fa-chart-bar text-accent-yellow"></i> Withdrawal Limits</h3>
                <div className="space-y-4">
                    <div className="limit-item p-4 rounded-lg bg-gradient-to-r from-gray-800 to-gray-900 border border-gray-700">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-300 font-medium">Fiat Limit</span>
                            <span className="font-semibold text-white" id="fiat-limit">{formatBalance(totalLimit)}</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-3 mb-2 overflow-hidden">
                            <div className="bg-gradient-to-r from-accent-yellow to-accent-yellow-dark h-3 rounded-full transition-all duration-500 ease-out" id="fiat-progress-bar" style={{width: `${usedPercentage}%`}}></div>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-accent-yellow font-medium" id="fiat-used">{formatBalance(fiatUsed)} used</span>
                            <span className="text-gray-400" id="fiat-remaining">{formatBalance(totalLimit - fiatUsed)} remaining</span>
                        </div>
                    </div>
                    <div className="limit-item p-4 rounded-lg bg-gradient-to-r from-gray-800 to-gray-900 border border-gray-700">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-gray-300 font-medium">Crypto Limit</span>
                            <span className="font-semibold text-white" id="crypto-limit">100.00000000 BTC</span>
                        </div>
                        <div className="text-sm text-gray-400">
                            <i className="fas fa-infinity mr-1"></i>
                            No daily limits on crypto withdrawals
                        </div>
                    </div>
                </div>
            </div>
            <div className="table-container p-6">
               <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><i className="fas fa-shield-alt text-green-400"></i> Security Verification</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="security-card p-4 rounded-lg bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-700/30 hover:border-green-600/50 transition-colors">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                <i className="fas fa-check-circle text-green-400 text-lg"></i>
                            </div>
                            <div>
                                <div className="font-semibold text-green-400">Company Security</div>
                                <div className="text-sm text-gray-400">Protected under financial regulations</div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500">Bank-grade encryption & compliance</div>
                    </div>
                    <div className={`security-card p-4 rounded-lg bg-gradient-to-br border transition-colors ${kycApproved ? 'from-blue-900/20 to-blue-800/10 border-blue-700/30 hover:border-blue-600/50' : 'from-amber-900/20 to-amber-800/10 border-amber-700/30 hover:border-amber-600/50'}`}>
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${kycApproved ? 'bg-blue-500/20' : 'bg-amber-500/20'}`}>
                                <i className={`fas ${kycApproved ? 'fa-user-shield text-blue-400' : 'fa-id-card text-amber-400'} text-lg`}></i>
                            </div>
                            <div>
                                <div className={`font-semibold ${kycApproved ? 'text-blue-400' : 'text-amber-400'}`}>KYC Verification</div>
                                <div className="text-sm text-gray-400">
                                    {kycApproved ? 'Identity verified - withdrawals enabled' : 'Complete verification to withdraw'}
                                </div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500">
                            {kycApproved ? 'Enhanced security protocols active' : 'Required for fiat and card withdrawals'}
                        </div>
                    </div>
                </div>
                <div className="text-sm text-gray-400 mt-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50">
                    <i className="fas fa-info-circle text-accent-yellow mr-2"></i>
                    All withdrawals are secured by our compliance protocols and require KYC verification.
                </div>
            </div>
            <div className="table-container p-6">
                <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><i className="fas fa-wallet text-accent-yellow"></i> Available Balances</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="balance-card p-4 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-accent-yellow/20 flex items-center justify-center">
                                    <i className="fas fa-dollar-sign text-accent-yellow"></i>
                                </div>
                                <div>
                                    <div className="font-semibold text-accent-yellow">USD Balance</div>
                                    <div className="text-sm text-gray-400">Fiat Currency</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-bold text-xl text-white" id="display-fiat-balance" data-usd-value="0">{formatBalance(totalFiatBalance)}</div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500 bg-gray-800/50 p-2 rounded">
                            <i className="fas fa-info-circle mr-1"></i>
                            Available for withdrawal
                        </div>
                    </div>
                    <div className="balance-card p-4 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 hover:border-gray-600 transition-all duration-300 hover:shadow-lg">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                                    <i className="fab fa-bitcoin text-orange-400"></i>
                                </div>
                                <div>
                                    <div className="font-semibold text-orange-400">Crypto Assets</div>
                                    <div className="text-sm text-gray-400">Total Portfolio</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="font-bold text-xl text-white" id="display-crypto-balance" data-usd-value="0">{formatBalance(totalCryptoBalance)}</div>
                            </div>
                        </div>
                        <div className="text-xs text-gray-500 bg-gray-800/50 p-2 rounded">
                            <i className="fas fa-chart-line mr-1"></i>
                            Market value
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="table-container p-6 mt-6">
            <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                <i className="fas fa-exchange-alt text-accent-yellow"></i>
                Currency Converter
            </h3>
            <p className="text-sm text-gray-400 mb-5">Live exchange rates - convert between supported currencies instantly.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
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
                <div>
                    <label className="block text-sm text-gray-400 mb-1">From</label>
                    <select
                        className="form-select w-full"
                        value={convFrom}
                        onChange={e => setConvFrom(e.target.value)}
                    >
                        {CONV_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm text-gray-400 mb-1">To</label>
                    <select
                        className="form-select w-full"
                        value={convTo}
                        onChange={e => setConvTo(e.target.value)}
                    >
                        {CONV_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {convResult !== null ? (
                <div className="mt-5 p-4 rounded-lg bg-gray-800 border border-yellow-700/40 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="text-2xl font-bold text-white">
                        <span className="text-gray-400">{fmtConv(parseFloat(convAmount), convFrom)}</span>
                        <span className="text-accent-yellow mx-3">=</span>
                        <span>{fmtConv(convResult, convTo)}</span>
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-1">
                        <i className="fas fa-circle text-green-400" style={{ fontSize: 7 }}></i>
                        Live rate  /  1 {convFrom} = {((fxRates?.[convTo] ?? 1) / (fxRates?.[convFrom] ?? 1)).toFixed(4)} {convTo}
                    </div>
                </div>
            ) : (
                <div className="mt-4 text-sm text-gray-500">
                    <i className="fas fa-info-circle mr-1"></i>
                    Enter an amount above to see the conversion.
                </div>
            )}
        </div>

        <div id="withdrawals-page-tx-table-container" className="mt-6">
            <TransactionTable data={transactionDataState} />
        </div>
        <BankWithdrawalModal activeModal={activeModal} setActiveModal={setActiveModal} />
        <CardWithdrawalModal activeModal={activeModal} setActiveModal={setActiveModal} cardData={cardDataState} />
        <WithdrawModal activeModal={activeModal} setActiveModal={setActiveModal} cryptoData={cryptoDataState} currentUser={currentUser} />
    </div>
  );
};


export default Withdrawals;