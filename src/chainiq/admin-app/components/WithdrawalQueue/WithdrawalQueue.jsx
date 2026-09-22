import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { listAdminWithdrawals, approveWithdrawal, holdWithdrawal, rejectWithdrawal, deleteWithdrawalApi, bulkDeleteWithdrawalsApi, searchAdminLeads } from '../../adminApi';
import { DataContext } from '../../shared';
import { SearchAutocomplete } from '../UserChrome';
import { assetDivisor } from '../../../shared/assetDivisors';
import '../DepositRequests/deposit-modal.css';

const REJECTION_REASONS = {
  'Regional / Geographic': [
    { code: 'REGION_RESTRICTED',  label: 'Geographic restriction',
      message: 'Your region is currently restricted from this withdrawal service. Please contact our support team for more information.' },
    { code: 'COUNTRY_NOT_SUPPORTED', label: 'Country not supported',
      message: 'Withdrawals to your country of registration are not currently available through this method.' },
    { code: 'CURRENCY_RESTRICTION', label: 'Currency restriction',
      message: 'Your local currency is not supported for this withdrawal corridor at this time.' },
    { code: 'CROSS_BORDER_LIMIT',  label: 'Cross-border limit exceeded',
      message: 'This withdrawal exceeds the permitted cross-border transfer limit for your region.' },
    { code: 'SANCTIONS_MATCH',    label: 'Sanctions screening hold',
      message: 'This transaction has been flagged during our sanctions screening process. Our compliance team will contact you with next steps.' },
  ],
  'Bank / Card Type': [
    { code: 'BANK_NOT_SUPPORTED',  label: 'Bank not in our network',
      message: 'Your bank is not currently part of our supported payment network. Please use an alternative bank account.' },
    { code: 'CARD_TYPE_REJECTED',  label: 'Card type not supported',
      message: 'This card type cannot receive transfers at this time. Please use a debit or credit card from a major network (Visa, Mastercard).' },
    { code: 'ISSUER_DECLINED',     label: 'Card issuer declined',
      message: 'Your card issuer has declined this transfer. Please contact your bank or try a different card.' },
    { code: 'PREPAID_NOT_ALLOWED', label: 'Prepaid / gift card restriction',
      message: 'Prepaid and gift cards are not eligible for withdrawals. Please use a bank-issued card or account.' },
    { code: 'VIRTUAL_CARD_REJECTED', label: 'Virtual card not eligible',
      message: 'Virtual cards cannot receive fiat withdrawals. Please use a physical card or bank account.' },
    { code: 'ROUTING_INVALID',     label: 'Invalid bank details',
      message: 'The provided bank routing number or account details could not be validated. Please check your details and resubmit.' },
    { code: 'IBAN_INVALID',        label: 'IBAN verification failed',
      message: 'The provided IBAN could not be verified by our payment processor. Please check your IBAN and try again.' },
    { code: 'SWIFT_UNSUPPORTED',   label: 'SWIFT not available',
      message: 'SWIFT transfers are not available for your account type at this time. Please use an alternative method.' },
  ],
  'Regulatory / Compliance': [
    { code: 'AML_HOLD',            label: 'AML review hold',
      message: 'Your transaction requires additional anti-money laundering review. Our compliance team will contact you within 1-2 business days.' },
    { code: 'KYC_INSUFFICIENT',    label: 'Additional KYC required',
      message: 'Additional identity verification is required for this withdrawal amount. Please upgrade your verification level in your account settings.' },
    { code: 'COMPLIANCE_REVIEW',   label: 'Account compliance review',
      message: 'Your account is currently under a compliance review. Withdrawals are temporarily suspended pending completion.' },
    { code: 'SOURCE_OF_FUNDS',     label: 'Source of funds required',
      message: 'We require documentation confirming the source of these funds before processing. Please contact our compliance team.' },
    { code: 'TAX_REPORTING',       label: 'Tax documentation required',
      message: 'This transaction requires supporting tax documentation before it can be processed. Please contact support.' },
    { code: 'PEP_SCREENING',       label: 'Enhanced due diligence',
      message: 'This transaction requires enhanced due diligence screening. Our team will contact you with the required steps.' },
  ],
  'Security': [
    { code: 'SUSPICIOUS_ACTIVITY', label: 'Suspicious activity detected',
      message: 'A security hold has been placed on this transaction due to unusual activity patterns. Please contact support to verify your identity.' },
    { code: 'FRAUD_FLAG',          label: 'Fraud prevention hold',
      message: 'This transaction was flagged by our fraud prevention system. For your protection, please contact our security team to complete verification.' },
    { code: 'VELOCITY_LIMIT',      label: 'Transaction velocity limit',
      message: 'Too many withdrawal attempts have been made in a short period. Please wait 24 hours before attempting another withdrawal.' },
    { code: 'DEVICE_MISMATCH',     label: 'Unrecognized device / session',
      message: 'This withdrawal was initiated from an unrecognized device. Please verify your identity through our security process before retrying.' },
    { code: 'IP_MISMATCH',         label: 'Unusual login location',
      message: 'This transaction originated from an unusual location. For your security, please verify your identity with our team.' },
    { code: 'ACCOUNT_REVIEW',      label: 'Account security review',
      message: 'Your account is temporarily under a security review. All withdrawals are suspended pending completion of the review.' },
  ],
  'Technical': [
    { code: 'BANK_TIMEOUT',        label: 'Bank network timeout',
      message: 'The connection to your bank timed out. This is a temporary issue - please retry your withdrawal.' },
    { code: 'NETWORK_ERROR',       label: 'Payment network error',
      message: 'A temporary error occurred with our payment network. Please retry in a few minutes. If the issue persists, contact support.' },
    { code: 'MAINTENANCE',         label: 'Banking partner maintenance',
      message: 'Our banking partner is currently undergoing scheduled maintenance. Please retry in a few hours.' },
    { code: 'PROCESSING_LIMIT',    label: 'Daily processing limit reached',
      message: 'Daily processing limits on our banking partner side have been reached. Please retry tomorrow or contact support.' },
    { code: 'DUPLICATE_DETECTED',  label: 'Duplicate transaction',
      message: 'A similar transaction was recently submitted. Please wait before submitting another withdrawal to prevent duplicates.' },
  ],
  'Amount / Limits': [
    { code: 'MINIMUM_NOT_MET',     label: 'Below minimum threshold',
      message: 'Your withdrawal amount is below the minimum required for this method. Please increase the amount and resubmit.' },
    { code: 'MAXIMUM_EXCEEDED',    label: 'Exceeds account limit',
      message: 'This amount exceeds the maximum withdrawal limit for your account verification tier. Please request a smaller amount or upgrade your account.' },
    { code: 'DAILY_LIMIT_REACHED', label: 'Daily limit reached',
      message: 'You have reached your daily withdrawal limit. Please try again after midnight UTC, or contact support to increase your limit.' },
    { code: 'INSUFFICIENT_LIQUIDITY', label: 'Temporary liquidity constraint',
      message: 'Insufficient liquidity is available at this time for this amount. Please try a smaller amount or contact support.' },
  ],
};

const APPROVAL_MESSAGES = {
  'Standard Release': [
    { code: 'STD_PROCESSED',          label: 'Withdrawal processed successfully',
      message: 'Your withdrawal has been processed and the funds have been dispatched to your specified address. Please allow 1-3 business days for the transfer to reflect.' },
    { code: 'STD_SENT',               label: 'Funds sent to destination',
      message: 'Your withdrawal has been approved and the funds have been sent to your designated destination. A confirmation will be provided once the transfer settles.' },
    { code: 'STD_RELEASED',           label: 'Funds released from account',
      message: 'Your withdrawal request has been reviewed and approved. The requested funds have been released and are en route to your destination address.' },
    { code: 'STD_QUEUED_SETTLEMENT',  label: 'Queued for next settlement batch',
      message: 'Your withdrawal has been approved and queued for the next settlement batch. Funds will be dispatched within 1 business day.' },
  ],
  'Expedited / Priority': [
    { code: 'EXP_PRIORITY',           label: 'Priority-processed withdrawal',
      message: 'Your withdrawal has been priority-processed and the funds are being dispatched immediately to your specified address.' },
    { code: 'EXP_SAME_DAY',           label: 'Same-day processing confirmed',
      message: 'Your withdrawal has been approved for same-day processing. The funds will be dispatched before the close of the current business day.' },
    { code: 'EXP_MANUAL_OVERRIDE',    label: 'Manually expedited by operations team',
      message: 'Your withdrawal has been manually reviewed and expedited by our operations team. The funds are being released as a priority transfer.' },
    { code: 'EXP_VIP',                label: 'VIP client - express dispatch',
      message: 'As a valued client, your withdrawal has been given express handling. Funds have been dispatched and should arrive ahead of standard timelines.' },
  ],
  'Compliance Cleared': [
    { code: 'COMP_AML_CLEARED',       label: 'AML review completed - released',
      message: 'Your withdrawal has completed our anti-money laundering review process. The funds have been cleared and dispatched to your destination.' },
    { code: 'COMP_KYC_CLEARED',       label: 'KYC verification cleared - released',
      message: 'Your identity verification has been confirmed. Your pending withdrawal has been released and the funds are now in transit.' },
    { code: 'COMP_ENHANCED_CLEARED',  label: 'Enhanced due diligence cleared',
      message: 'Your account has successfully passed our enhanced due diligence review. Your withdrawal has been approved and funds dispatched accordingly.' },
    { code: 'COMP_SOURCE_CLEARED',    label: 'Source of funds verified - released',
      message: 'The source of funds documentation has been reviewed and verified. Your withdrawal has been approved and is being processed immediately.' },
  ],
  'Partial / Adjusted': [
    { code: 'PART_FEE_DEDUCTED',      label: 'Approved - network fee deducted',
      message: 'Your withdrawal has been approved. Please note that applicable network fees have been deducted from the sent amount. The net transfer has been dispatched.' },
    { code: 'PART_REDUCED_LIMIT',     label: 'Partial approval - tier limit applied',
      message: 'A partial withdrawal has been approved up to your current account tier limit. The approved amount has been dispatched. Please contact support to upgrade your withdrawal limit.' },
    { code: 'PART_HOLDING',           label: 'Approved with brief holding period',
      message: 'Your withdrawal has been approved. In accordance with our standard policy, a brief holding period applies before the funds are fully dispatched to your destination.' },
  ],
};

const HOLD_MESSAGES = {
  'Under Review': [
    { code: 'HOLD_COMPLIANCE',     label: 'Compliance review in progress',
      message: '[pending] Your withdrawal is currently under review by our compliance team. We will notify you once the process is complete, typically within 1-2 business days.' },
    { code: 'HOLD_MANUAL_REVIEW',  label: 'Manual review required',
      message: '[pending] Your withdrawal requires a manual review by our operations team. We appreciate your patience and will update you with the outcome shortly.' },
    { code: 'HOLD_ENHANCED_DD',    label: 'Enhanced due diligence',
      message: '[pending] Your withdrawal is subject to enhanced due diligence screening. Our compliance team is working to clear it as quickly as possible.' },
  ],
  'Processing Delays': [
    { code: 'HOLD_NETWORK_DELAY',  label: 'Network processing delay',
      message: '[pending] Your withdrawal has been received but is experiencing a brief processing delay due to network congestion. We expect it to be processed within 24 hours.' },
    { code: 'HOLD_BANKING_DELAY',  label: 'Banking partner delay',
      message: '[pending] Your withdrawal is queued for processing but our banking partner is currently experiencing delays. We expect to dispatch your funds within 1-2 business days.' },
    { code: 'HOLD_HIGH_VOLUME',    label: 'High volume processing queue',
      message: '[pending] Due to unusually high withdrawal volume, your request is in our priority processing queue. We expect to process it within the next 24-48 hours.' },
  ],
  'Additional Verification': [
    { code: 'HOLD_EXTRA_KYC',      label: 'Additional verification required',
      message: '[pending] Additional identity verification is required for this withdrawal. Please check your messages or contact our support team to complete the required steps.' },
    { code: 'HOLD_SOURCE_FUNDS',   label: 'Source of funds clarification',
      message: '[pending] We need to verify the source of funds for this withdrawal. Our team will contact you shortly with the required documentation steps.' },
    { code: 'HOLD_ACCOUNT_VERIFY', label: 'Destination account verification',
      message: '[pending] We are verifying your destination account details to ensure a safe transfer. This typically takes 1 business day.' },
  ],
  'On Hold': [
    { code: 'HOLD_TEMPORARY',      label: 'Temporary administrative hold',
      message: '[pending] Your withdrawal has been placed on a temporary administrative hold. Our team will review it and provide an update within 1 business day.' },
    { code: 'HOLD_SECURITY',       label: 'Security review hold',
      message: '[pending] For your account\'s security, this withdrawal is being reviewed by our security team. We will notify you once the review is complete.' },
    { code: 'HOLD_SCHEDULED',      label: 'Scheduled for next processing batch',
      message: '[pending] Your withdrawal has been acknowledged and scheduled for the next processing batch. You will be notified once funds are dispatched.' },
    { code: 'HOLD_ESCALATED',      label: 'Escalated to senior review',
      message: '[pending] Your withdrawal has been escalated to our senior review team. We aim to resolve it within 2 business days and will keep you updated.' },
  ],
};

const APPROVAL_CATEGORIES = Object.keys(APPROVAL_MESSAGES);
const CATEGORIES          = Object.keys(REJECTION_REASONS);
const HOLD_CATEGORIES     = Object.keys(HOLD_MESSAGES);

const STATUS_COLORS = {
  Pending:    { bg: 'rgba(240,185,11,0.12)',  color: '#F0B90B',  border: 'rgba(240,185,11,0.3)'  },
  Processing: { bg: 'rgba(114,137,218,0.12)', color: '#7289DA',  border: 'rgba(114,137,218,0.3)' },
  Approved:   { bg: 'rgba(14,203,129,0.1)',   color: '#0ECB81',  border: 'rgba(14,203,129,0.3)'  },
  Rejected:   { bg: 'rgba(246,70,93,0.1)',    color: '#F6465D',  border: 'rgba(246,70,93,0.3)'   },
  Cancelled:  { bg: 'rgba(132,142,156,0.12)', color: '#848E9C',  border: 'rgba(132,142,156,0.3)' },
};

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.Cancelled;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, letterSpacing: 0.4 }}>
      {status}
    </span>
  );
}

function fmtAmt(minorAmt, asset) {
  const divisor = assetDivisor(asset);
  const decimals = asset === 'BTC' ? 8 : asset === 'ETH' ? 6 : 2;
  const v = (Number(minorAmt || 0) / divisor).toFixed(decimals);
  return v.replace(/\.?0+$/, '') + ' ' + (asset || '');
}

function timeAgo(iso) {
  if (!iso) return '-';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function MessagePicker({ catalog, categories, onSelect, selectedCode, accentColor }) {
  const [activeCategory, setActiveCategory] = useState(categories[0]);
  return (
    <div style={{ border: '1px solid #2B3139', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', background: '#0B0E11', borderBottom: '1px solid #2B3139' }}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)}
            style={{ padding: '8px 14px', background: activeCategory === cat ? '#1E2329' : 'transparent',
              border: 'none', borderBottom: activeCategory === cat ? `2px solid ${accentColor}` : '2px solid transparent',
              color: activeCategory === cat ? accentColor : '#848E9C', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: 0.3 }}>
            {cat}
          </button>
        ))}
      </div>
      <div style={{ maxHeight: 190, overflowY: 'auto', background: '#161A1E' }}>
        {catalog[activeCategory].map(r => (
          <div key={r.code} onClick={() => onSelect(r)}
            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #1E2329',
              background: selectedCode === r.code ? `rgba(${accentColor === '#0ECB81' ? '14,203,129' : accentColor === '#7289DA' ? '114,137,218' : '132,142,156'},0.12)` : 'transparent',
              borderLeft: selectedCode === r.code ? `3px solid ${accentColor}` : '3px solid transparent',
              transition: 'background 0.15s' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#EAECEF' }}>{r.label}</div>
            <div style={{ fontSize: 11, color: '#848E9C', marginTop: 2, lineHeight: 1.4 }}>
              {r.message.slice(0, 90)}...
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RejectionPicker({ onSelect, selectedCode }) {
  return <MessagePicker catalog={REJECTION_REASONS} categories={CATEGORIES} onSelect={onSelect} selectedCode={selectedCode} accentColor="#848E9C" />;
}

function ApprovalPicker({ onSelect, selectedCode }) {
  return <MessagePicker catalog={APPROVAL_MESSAGES} categories={APPROVAL_CATEGORIES} onSelect={onSelect} selectedCode={selectedCode} accentColor="#0ECB81" />;
}

function HoldPicker({ onSelect, selectedCode }) {
  return <MessagePicker catalog={HOLD_MESSAGES} categories={HOLD_CATEGORIES} onSelect={onSelect} selectedCode={selectedCode} accentColor="#7289DA" />;
}

export default function WithdrawalQueue() {
  const { users = [] } = useContext(DataContext);
  const [activeTab,     setActiveTab]     = useState('queue');
  const [items,         setItems]         = useState([]);
  const [total,         setTotal]         = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [historyFilter, setHistoryFilter] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [offset,        setOffset]        = useState(0);
  const limit = 20;

  const [actionItem,      setActionItem]      = useState(null);
  const [actionNote,      setActionNote]      = useState('');
  const [selectedReason,  setSelectedReason]  = useState(null);
  const [useCustomReason, setUseCustomReason] = useState(false);
  const [actionBusy,      setActionBusy]      = useState(false);
  const [actionError,     setActionError]     = useState('');
  const [toast,           setToast]           = useState('');
  const [selectedHist,    setSelectedHist]    = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = activeTab === 'queue'
        ? { statuses: ['Pending', 'Processing'], limit, offset }
        : { status: historyFilter, search: historySearch.trim(), limit, offset };
      const { withdrawals: rows, total: t } = await listAdminWithdrawals(params);
      setItems(rows ?? []);
      setTotal(t ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, historyFilter, historySearch, offset]);

  useEffect(() => { load(); }, [load]);

  const visibleItems = useMemo(() => {
    // History search is executed by the API so matches are not limited to the
    // current page. Do not apply a second, narrower client-side filter here.
    return items;
  }, [items]);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setOffset(0);
    setHistoryFilter('');
    setHistorySearch('');
  };

  const clientSuggestions = useCallback((query) => {
    const q = query.trim().toLowerCase();
    return users
      .filter(u => [u.name, u.email, u.phone, u.id].some(v => String(v || '').toLowerCase().includes(q)))
      .map(u => ({ key: u.id, value: u.name || u.email || u.id, label: u.name || u.email || u.id, meta: u.email || u.phone || '' }));
  }, [users]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const openAction = (item, mode) => {
    setActionItem({ item, mode });
    setActionNote('');
    setSelectedReason(null);
    setUseCustomReason(false);
    setActionError('');
  };

  const handleSelectReason = (r) => {
    setSelectedReason(r);
    setActionNote(r.message);
    setUseCustomReason(false);
  };

  const handleAction = async () => {
    if (!actionItem) return;
    if ((actionItem.mode === 'reject' || actionItem.mode === 'hold') && !actionNote.trim()) {
      setActionError(actionItem.mode === 'hold'
        ? 'Please select or write a message to send to the client.'
        : 'Please select or enter a rejection reason.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      if (actionItem.mode === 'approve') {
        await approveWithdrawal(actionItem.item.id, actionNote);
        showToast(`OK Withdrawal approved - ${fmtAmt(actionItem.item.amountMinor, actionItem.item.asset)} released to ${actionItem.item.userName}`);
      } else if (actionItem.mode === 'hold') {
        await holdWithdrawal(actionItem.item.id, actionNote);
        showToast(`[pending] Withdrawal set to Processing - client notified, balance unchanged`);
      } else {
        await rejectWithdrawal(actionItem.item.id, actionNote);
        showToast(`Error Withdrawal rejected - client notified`);
      }
      setActionItem(null);
      load();
    } catch (e) {
      setActionError(e.message || 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  const tabBtn = (id, label, icon) => (
    <button onClick={() => switchTab(id)}
      style={{ padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        background: activeTab === id ? '#1E2329' : 'transparent',
        color: activeTab === id ? '#F0B90B' : '#848E9C',
        border: 'none',
        borderBottom: activeTab === id ? '2px solid #F0B90B' : '2px solid transparent',
        transition: 'color 0.15s' }}>
      {icon} {label}
    </button>
  );

  const handleBulkDeleteHist = async () => {
    if (selectedHist.length === 0) return;
    const count = selectedHist.length;
    try {
      await bulkDeleteWithdrawalsApi(selectedHist);
      setItems(prev => prev.filter(it => !selectedHist.includes(it.id)));
      setSelectedHist([]);
      showToast(`🗑 ${count} withdrawal record${count > 1 ? 's' : ''} deleted.`);
    } catch (err) {
      showToast(`Delete failed: ${err?.message || 'server error'}`);
    }
  };

  const modalTitle = actionItem?.mode === 'approve' ? 'Approve withdrawal'
    : actionItem?.mode === 'hold' ? 'Approve as Pending (Processing)'
    : 'Reject withdrawal';

  const modalAccentColor = actionItem?.mode === 'approve' ? '#0ECB81'
    : actionItem?.mode === 'hold' ? '#7289DA'
    : '#F6465D';

  const submitBtnLabel = actionItem?.mode === 'approve' ? 'Approve & release funds'
    : actionItem?.mode === 'hold' ? 'Set to Processing & notify client'
    : 'Reject & notify client';

  const submitBtnClass = actionItem?.mode === 'approve' ? 'dr-modal__btn--approve'
    : actionItem?.mode === 'hold' ? 'dr-modal__btn--hold'
    : 'dr-modal__btn--reject';

  return (
    <div style={{ padding: 24 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: '#1E2329',
          border: '1px solid #2B3139', borderRadius: 10, padding: '12px 20px', color: '#EAECEF',
          fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}

      {/* Action Modal */}
      {actionItem && (
        <div className="dr-modal-overlay" onClick={() => !actionBusy && setActionItem(null)}>
          <div className="dr-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="dr-modal__header">
              <h3 className="dr-modal__title">{modalTitle}</h3>
              <p className="dr-modal__subtitle">
                {fmtAmt(actionItem.item.amountMinor, actionItem.item.asset)} - {actionItem.item.userName}
              </p>
              {actionItem.mode === 'hold' && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(114,137,218,0.1)',
                  border: '1px solid rgba(114,137,218,0.3)', borderRadius: 8, fontSize: 12, color: '#7289DA' }}>
                  [pending] Balance stays held  /  Transaction remains Pending for client  /  Funds not released
                </div>
              )}
            </div>

            <div className="dr-modal__body">
              <div className="dr-modal-summary">
                {[
                  ['Client', `${actionItem.item.userName}  /  ${actionItem.item.userEmail}`, ''],
                  ['Amount', fmtAmt(actionItem.item.amountMinor, actionItem.item.asset), 'amount'],
                  ['Destination', String(actionItem.item.destination || '-'), 'mono'],
                  actionItem.item.network ? ['Network', actionItem.item.network, ''] : null,
                  ['Current Status', actionItem.item.status, ''],
                ].filter(Boolean).map(([k, v, variant]) => (
                  <div key={k} className="dr-modal-summary__row">
                    <span className="dr-modal-summary__key">{k}</span>
                    <span className={`dr-modal-summary__val${variant === 'amount' ? ' dr-modal-summary__val--amount' : ''}${variant === 'mono' ? ' dr-modal-summary__val--mono' : ''}`}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>

              <p className="dr-modal-section-label">
                {actionItem.mode === 'approve' ? 'Select approval message'
                  : actionItem.mode === 'hold' ? 'Select a message to send to the client'
                  : 'Select rejection reason'}
              </p>

              {!useCustomReason && (
                <div className="dr-modal-picker-wrap">
                  {actionItem.mode === 'approve' ? (
                    <ApprovalPicker onSelect={handleSelectReason} selectedCode={selectedReason?.code} />
                  ) : actionItem.mode === 'hold' ? (
                    <HoldPicker onSelect={handleSelectReason} selectedCode={selectedReason?.code} />
                  ) : (
                    <RejectionPicker onSelect={handleSelectReason} selectedCode={selectedReason?.code} />
                  )}
                </div>
              )}

              <label className="dr-modal-check">
                <input
                  type="checkbox"
                  checked={useCustomReason}
                  onChange={e => {
                    setUseCustomReason(e.target.checked);
                    if (e.target.checked) { setSelectedReason(null); setActionNote(''); }
                    else setActionNote(selectedReason?.message || '');
                  }}
                />
                <span>Write a custom message instead</span>
              </label>

              {selectedReason && !useCustomReason && (
                <div className={`dr-modal-preview ${actionItem.mode === 'approve' ? 'dr-modal-preview--approve' : actionItem.mode === 'hold' ? 'dr-modal-preview--hold' : 'dr-modal-preview--reject'}`}>
                  <div className={`dr-modal-preview__title${actionItem.mode === 'approve' ? ' dr-modal-preview__title--approve' : actionItem.mode === 'hold' ? ' dr-modal-preview__title--hold' : ''}`}>
                    {selectedReason.label}
                    <span style={{ color: '#848e9c', fontWeight: 400 }}> ({selectedReason.code})</span>
                  </div>
                  <div className="dr-modal-preview__body">{selectedReason.message}</div>
                </div>
              )}

              <label className="dr-modal__label">
                {useCustomReason
                  ? 'Custom message (sent to client)'
                  : selectedReason
                    ? 'Message preview (sent to client)'
                    : actionItem.mode === 'approve' ? 'Internal note (optional)'
                    : actionItem.mode === 'hold' ? 'Message to client (required)'
                    : 'Message (sent to client)'}
              </label>
              <textarea
                className="dr-modal__textarea"
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                placeholder={actionItem.mode === 'approve'
                  ? 'Select an approval message above, or write a custom note...'
                  : actionItem.mode === 'hold'
                    ? 'Select a hold message above, or write a custom message to send to the client...'
                    : 'Select a rejection reason above, or write a custom message...'}
                readOnly={!useCustomReason && !!selectedReason}
              />
            </div>

            <div className="dr-modal__footer">
              {actionError && <div className="dr-modal__error">{actionError}</div>}
              <div className="dr-modal__actions">
                <button type="button" className="dr-modal__btn dr-modal__btn--ghost" onClick={() => setActionItem(null)} disabled={actionBusy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`dr-modal__btn ${submitBtnClass}`}
                  style={actionItem.mode === 'hold' ? {
                    background: 'rgba(114,137,218,0.15)',
                    border: '1px solid rgba(114,137,218,0.4)',
                    color: '#7289DA',
                  } : {}}
                  onClick={handleAction}
                  disabled={actionBusy ||
                    (actionItem.mode === 'reject' && !actionNote.trim()) ||
                    (actionItem.mode === 'hold' && !actionNote.trim())}
                >
                  {actionBusy
                    ? <><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Processing...</>
                    : submitBtnLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, color: '#EAECEF', fontSize: 20 }}>[upload] Withdrawal Queue</h2>
            <p style={{ margin: '4px 0 0', color: '#848E9C', fontSize: 13 }}>
              {activeTab === 'queue'
                ? 'Review and process pending client withdrawal requests.'
                : 'Past withdrawal decisions - approved, processing, and rejected requests.'}
            </p>
          </div>
          <button onClick={load}
            style={{ padding: '6px 12px', borderRadius: 8, background: 'transparent',
              border: '1px solid #2B3139', color: '#848E9C', cursor: 'pointer', fontSize: 13 }}>
            <i className="fas fa-sync-alt" style={{ marginRight: 4 }} />Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #2B3139' }}>
          {tabBtn('queue',   'Queue',   '[list]')}
          {tabBtn('history', 'History', '🕓')}
        </div>
      </div>

      {/* History sub-filters + search */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {[['', 'All'], ['Approved', 'Approved'], ['Processing', 'Processing'], ['Rejected', 'Rejected']].map(([val, label]) => (
            <button key={val} onClick={() => { setHistoryFilter(val); setOffset(0); }}
              style={{ padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: historyFilter === val ? '#F0B90B' : 'transparent',
                color: historyFilter === val ? '#1A1D23' : '#848E9C',
                border: `1px solid ${historyFilter === val ? '#F0B90B' : '#2B3139'}` }}>
              {label}
            </button>
          ))}
          <SearchAutocomplete
            value={historySearch}
            onChange={(value) => { setHistorySearch(value); setOffset(0); }}
            placeholder="Search by name, email, phone, or ID..."
            style={{ width: 260 }}
            buildSuggestions={clientSuggestions}
            fetchSuggestions={searchAdminLeads}
            inputProps={{ 'aria-label': 'Search withdrawal history by client' }}
          />
        </div>
      )}

      {/* Bulk delete toolbar - history only */}
      {activeTab === 'history' && selectedHist.length > 0 && (
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, padding:'8px 12px', background:'#363B44', borderRadius:6, border:'1px solid #F6465D80' }}>
          <span style={{ color:'#F6465D', fontSize:12, fontWeight:600 }}>{selectedHist.length} selected</span>
          <button onClick={handleBulkDeleteHist}
            style={{ padding:'5px 14px', borderRadius:6, background:'rgba(246,70,93,0.15)', border:'1px solid #F6465D60', color:'#F6465D', cursor:'pointer', fontWeight:600, fontSize:12 }}>
            🗑 Delete Selected
          </button>
          <button onClick={() => setSelectedHist([])}
            style={{ marginLeft:'auto', padding:'4px 10px', borderRadius:4, background:'transparent', border:'1px solid #444A55', color:'#848E9C', cursor:'pointer', fontSize:11 }}>
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#1E2329', border: '1px solid #2B3139', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#848E9C' }}>
            <i className="fas fa-spinner fa-spin" style={{ fontSize: 20, marginBottom: 10, display: 'block' }} />
            Loading...
          </div>
        ) : visibleItems.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#848E9C' }}>
            <i className={`fas ${activeTab === 'queue' ? 'fa-inbox' : 'fa-history'}`}
              style={{ fontSize: 32, marginBottom: 12, display: 'block', opacity: 0.4 }} />
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {activeTab === 'queue' ? 'No pending withdrawals' : historySearch ? 'No results' : 'No history yet'}
            </div>
            <div style={{ fontSize: 13 }}>
              {activeTab === 'queue'
                ? 'No pending withdrawal requests at the moment.'
                : historySearch
                  ? `No records matching "${historySearch}".`
                  : historyFilter ? `No ${historyFilter.toLowerCase()} withdrawals found.` : 'No processed withdrawals yet.'}
            </div>
          </div>
        ) : activeTab === 'queue' ? (
          /* ── Queue table ── */
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2B3139' }}>
                {['Client', 'Asset / Amount', 'Destination', 'Network', 'Status', 'Submitted', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#848E9C',
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, i) => (
                <tr key={item.id}
                  style={{ borderBottom: i < visibleItems.length - 1 ? '1px solid #2B3139' : 'none',
                    background: item.status === 'Processing'
                      ? 'rgba(114,137,218,0.04)'
                      : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#EAECEF' }}>{item.userName}</div>
                    <div style={{ fontSize: 11, color: '#848E9C' }}>{item.userEmail}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, color: '#F0B90B', fontSize: 15 }}>
                      {fmtAmt(item.amountMinor, item.asset)}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#848E9C',
                      background: '#0B0E11', padding: '2px 6px', borderRadius: 4 }}>
                      {String(item.destination || '-').slice(0, 20)}{item.destination?.length > 20 ? '...' : ''}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#848E9C' }}>
                    {item.network || <span style={{ opacity: 0.4 }}>-</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td style={{ padding: '12px 16px', color: '#848E9C', whiteSpace: 'nowrap' }}>
                    {timeAgo(item.createdAt)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => openAction(item, 'approve')}
                        style={{ padding: '5px 12px', background: 'rgba(14,203,129,0.12)',
                          border: '1px solid rgba(14,203,129,0.3)', borderRadius: 6,
                          color: '#0ECB81', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                        Approve
                      </button>
                      {item.status === 'Pending' && (
                        <button onClick={() => openAction(item, 'hold')}
                          style={{ padding: '5px 12px', background: 'rgba(114,137,218,0.12)',
                            border: '1px solid rgba(114,137,218,0.3)', borderRadius: 6,
                            color: '#7289DA', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                          [pending] Pending
                        </button>
                      )}
                      <button onClick={() => openAction(item, 'reject')}
                        style={{ padding: '5px 12px', background: 'rgba(246,70,93,0.1)',
                          border: '1px solid rgba(246,70,93,0.3)', borderRadius: 6,
                          color: '#F6465D', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          /* ── History table ── */
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2B3139' }}>
                <th style={{ width: 36, padding: '12px 8px', textAlign: 'center' }}>
                  <input type="checkbox"
                    checked={visibleItems.length > 0 && visibleItems.every(it => selectedHist.includes(it.id))}
                    onChange={e => {
                      if (e.target.checked) setSelectedHist(prev => [...new Set([...prev, ...visibleItems.map(it => it.id)])]);
                      else setSelectedHist(prev => prev.filter(id => !visibleItems.find(it => it.id === id)));
                    }}
                  />
                </th>
                {['Client', 'Asset / Amount', 'Destination', 'Status', 'Submitted', 'Decided', 'Decided by', 'Message sent', ''].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: '#848E9C',
                    fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item, i) => {
                const isSelected = selectedHist.includes(item.id);
                return (
                <tr key={item.id}
                  style={{ borderBottom: i < visibleItems.length - 1 ? '1px solid #2B3139' : 'none',
                    background: isSelected ? 'rgba(246,70,93,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ textAlign: 'center', padding: '8px' }}>
                    <input type="checkbox" checked={isSelected}
                      onChange={e => setSelectedHist(prev => e.target.checked ? [...prev, item.id] : prev.filter(id => id !== item.id))}
                    />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#EAECEF' }}>{item.userName}</div>
                    <div style={{ fontSize: 11, color: '#848E9C' }}>{item.userEmail}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, color: '#F0B90B', fontSize: 15 }}>
                      {fmtAmt(item.amountMinor, item.asset)}
                    </div>
                    {item.network && <div style={{ fontSize: 11, color: '#848E9C', marginTop: 2 }}>{item.network}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#848E9C',
                      background: '#0B0E11', padding: '2px 6px', borderRadius: 4 }}>
                      {String(item.destination || '-').slice(0, 20)}{item.destination?.length > 20 ? '...' : ''}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <StatusBadge status={item.status} />
                  </td>
                  <td style={{ padding: '12px 16px', color: '#848E9C', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {timeAgo(item.createdAt)}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#848E9C', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {item.decidedAt ? fmtDate(item.decidedAt) : <span style={{ opacity: 0.4 }}>-</span>}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12 }}>
                    {item.decidedByName
                      ? <span style={{ color: '#EAECEF', fontWeight: 600 }}>{item.decidedByName}</span>
                      : <span style={{ color: '#848E9C', opacity: 0.5 }}>-</span>}
                  </td>
                  <td style={{ padding: '12px 16px', maxWidth: 260 }}>
                    {item.decisionNote || item.note || item.reason ? (
                      <span style={{ fontSize: 11, color: '#848E9C', lineHeight: 1.4,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.decisionNote || item.note || item.reason}
                      </span>
                    ) : (
                      <span style={{ color: '#848E9C', opacity: 0.4, fontSize: 12 }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <button
                      onClick={() => {
                        setItems(prev => prev.filter(it => it.id !== item.id));
                        deleteWithdrawalApi(item.id).catch(() => showToast('Delete failed.'));
                      }}
                      title="Delete record"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#848E9C', fontSize: 14, padding: '4px 6px', borderRadius: 4 }}
                      onMouseEnter={e => e.currentTarget.style.color = '#F6465D'}
                      onMouseLeave={e => e.currentTarget.style.color = '#848E9C'}
                    ><i className="fas fa-trash-alt" /></button>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}
            style={{ padding: '6px 16px', background: 'transparent', border: '1px solid #2B3139',
              borderRadius: 8, color: '#848E9C', cursor: offset === 0 ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            Previous
          </button>
          <span style={{ fontSize: 13, color: '#848E9C' }}>
            {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </span>
          <button onClick={() => setOffset(offset + limit)} disabled={offset + limit >= total}
            style={{ padding: '6px 16px', background: 'transparent', border: '1px solid #2B3139',
              borderRadius: 8, color: '#848E9C', cursor: offset + limit >= total ? 'not-allowed' : 'pointer', fontSize: 13 }}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
