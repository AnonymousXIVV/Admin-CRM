import React, { useState, useEffect, useCallback } from 'react';
import { listCardRequests, approveCardRequest, rejectCardRequest } from '../../adminApi';
import MessageReasonPicker from '../MessageReasonPicker/MessageReasonPicker';
import { CARD_REJECTION_REASONS } from '../../data/messageCatalogs';
import '../DepositRequests/deposit-modal.css';

const CARD_TYPES = ['Platinum', 'Gold', 'Premium'];
const REJECTION_CATEGORIES = Object.keys(CARD_REJECTION_REASONS);

function timeAgo(iso) {
  if (!iso) return '-';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const EyeIcon = ({ open }) => open ? (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.77 19.77 0 0 1 4.22-5.22" />
    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a19.86 19.86 0 0 1-3.17 4.19" />
    <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
) : (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function CardRequests({ onCardIssued }) {
  const [items, setItems]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [actionItem, setActionItem]   = useState(null);
  const [actionMode, setActionMode]   = useState('');
  const [toast, setToast]             = useState('');
  const [actionError, setActionError] = useState('');
  const [actionBusy, setActionBusy]   = useState(false);

  const [selectedReason, setSelectedReason]   = useState(null);
  const [useCustomReason, setUseCustomReason] = useState(false);
  const [actionNote, setActionNote]           = useState('');

  const [approveType, setApproveType] = useState('Platinum');
  const [approvePin, setApprovePin]   = useState('');
  const [showPin, setShowPin]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: rows } = await listCardRequests();
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const openApprove = (item) => {
    setActionItem(item);
    setActionMode('approve');
    setApproveType(item.requested_type || 'Platinum');
    setApprovePin('');
    setShowPin(false);
    setActionNote('');
    setSelectedReason(null);
    setUseCustomReason(false);
    setActionError('');
  };

  const openReject = (item) => {
    setActionItem(item);
    setActionMode('reject');
    setActionNote('');
    setSelectedReason(null);
    setUseCustomReason(false);
    setActionError('');
  };

  const closeModal = () => {
    if (actionBusy) return;
    setActionItem(null);
    setActionMode('');
  };

  const handleSelectReason = (r) => {
    setSelectedReason(r);
    setActionNote(r.message);
    setUseCustomReason(false);
  };

  const handleConfirmApprove = async () => {
    if (!/^\d{4,6}$/.test(approvePin)) {
      setActionError('PIN must be 4 to 6 digits.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await approveCardRequest(actionItem.id, { type: approveType, pin: approvePin, note: actionNote });
      showToast(`OK ${approveType} card issued to ${actionItem.user_name}`);
      setItems(prev => prev.filter(i => i.id !== actionItem.id));
      setActionItem(null);
      onCardIssued?.();
    } catch (e) {
      setActionError(e?.message || 'Could not issue card.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!actionNote.trim()) {
      setActionError('Please select or enter a rejection reason.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      await rejectCardRequest(actionItem.id, { reason: actionNote, code: selectedReason?.code || '' });
      showToast(`Error Application rejected - ${actionItem.user_name} notified`);
      setItems(prev => prev.filter(i => i.id !== actionItem.id));
      setActionItem(null);
    } catch (e) {
      setActionError(e?.message || 'Could not reject application.');
    } finally {
      setActionBusy(false);
    }
  };

  const isApprove = actionMode === 'approve';

  return (
    <div style={{ padding: '4px 0' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: '#1E2329', border: '1px solid #2B3139', borderRadius: 10,
          padding: '12px 20px', color: '#EAECEF', fontSize: 14,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}

      {actionItem && (
        <div
          className="dr-modal-overlay"
          style={{ zIndex: 8000 }}
          onClick={closeModal}
        >
          <div
            className="dr-modal"
            style={{ maxWidth: 520 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="dr-modal__header">
              <h3 className="dr-modal__title">
                {isApprove ? 'OK Approve card application' : 'Error Reject card application'}
              </h3>
              <p className="dr-modal__subtitle">
                {actionItem.user_name}  /  {actionItem.user_email}
              </p>
            </div>

            <div className="dr-modal__body">
              <div className="dr-modal-summary" style={{ marginBottom: 16 }}>
                {[
                  ['Requested type', actionItem.requested_type || '-'],
                  ['KYC status', actionItem.kyc_status || '-'],
                  ['Applied', timeAgo(actionItem.created_at)],
                  actionItem.note ? ['Client note', actionItem.note] : null,
                ].filter(Boolean).map(([k, v]) => (
                  <div key={k} className="dr-modal-summary__row">
                    <span className="dr-modal-summary__key">{k}</span>
                    <span className="dr-modal-summary__val">{v}</span>
                  </div>
                ))}
              </div>

              {isApprove ? (
                <>
                  <label className="dr-modal__label" style={{ marginBottom: 8 }}>Card type to issue</label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    {CARD_TYPES.map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setApproveType(t)}
                        style={{
                          flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 13,
                          fontWeight: approveType === t ? 700 : 500, cursor: 'pointer',
                          background: approveType === t ? 'rgba(90,98,112,0.25)' : '#0B0E11',
                          border: approveType === t ? '1.5px solid #5a6270' : '1px solid #2B3139',
                          color: approveType === t ? '#EAECEF' : '#848E9C',
                          transition: 'all 0.15s',
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  <label className="dr-modal__label">Set card PIN (4-6 digits)</label>
                  <div style={{ position: 'relative', marginBottom: 16 }}>
                    <input
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      maxLength={6}
                      value={approvePin}
                      onChange={e => setApprovePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter 4-6 digit PIN"
                      className="dr-modal__input"
                      style={{ paddingRight: 40, marginBottom: 0 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(s => !s)}
                      style={{
                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', color: '#848E9C', cursor: 'pointer',
                        padding: 2, display: 'flex', alignItems: 'center',
                      }}
                    >
                      <EyeIcon open={showPin} />
                    </button>
                  </div>

                  <label className="dr-modal__label">Approval note (optional - sent to client)</label>
                  <textarea
                    value={actionNote}
                    onChange={e => setActionNote(e.target.value)}
                    placeholder="Optional message to include in the client notification..."
                    rows={3}
                    className="dr-modal__textarea"
                  />
                </>
              ) : (
                <>
                  <p className="dr-modal-section-label">Select rejection reason</p>
                  {!useCustomReason && (
                    <div className="dr-modal-picker-wrap">
                      <MessageReasonPicker
                        catalog={CARD_REJECTION_REASONS}
                        categories={REJECTION_CATEGORIES}
                        onSelect={handleSelectReason}
                        selectedCode={selectedReason?.code}
                      />
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
                    <div className="dr-modal-preview dr-modal-preview--reject" style={{ marginBottom: 12 }}>
                      <div className="dr-modal-preview__title">
                        {selectedReason.label}
                        <span style={{ color: '#848E9C', fontWeight: 400 }}> ({selectedReason.code})</span>
                      </div>
                      <div className="dr-modal-preview__body">{selectedReason.message}</div>
                    </div>
                  )}

                  <label className="dr-modal__label">
                    {useCustomReason ? 'Custom message' : 'Message (sent to client)'}
                  </label>
                  <textarea
                    value={actionNote}
                    onChange={e => setActionNote(e.target.value)}
                    placeholder="Select a reason above, or write a custom message..."
                    rows={4}
                    readOnly={!useCustomReason && !!selectedReason}
                    className="dr-modal__textarea"
                  />
                </>
              )}

              {actionError && <div className="dr-modal__error" style={{ marginTop: 12 }}>{actionError}</div>}
            </div>

            <div className="dr-modal__footer">
              <div className="dr-modal__actions">
                <button
                  type="button"
                  className="dr-modal__btn dr-modal__btn--ghost"
                  disabled={actionBusy}
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`dr-modal__btn ${isApprove ? 'dr-modal__btn--approve' : 'dr-modal__btn--reject'}`}
                  disabled={actionBusy || (!isApprove && !actionNote.trim())}
                  onClick={isApprove ? handleConfirmApprove : handleConfirmReject}
                >
                  {actionBusy
                    ? 'Processing...'
                    : isApprove
                      ? `Issue ${approveType} card`
                      : 'Reject & notify client'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#848E9C', fontSize: 14 }}>
          Loading card requests...
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>[card]</div>
          <p style={{ color: '#848E9C', fontSize: 14, margin: 0 }}>No pending card applications</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <div
              key={item.id}
              style={{ background: '#1A1F26', border: '1px solid #2B3139', borderRadius: 12,
                padding: '16px 20px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', gap: 16 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#EAECEF' }}>{item.user_name}</span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12,
                    background: 'rgba(90,98,112,0.2)', color: '#C8CDD5',
                    border: '1px solid rgba(90,98,112,0.4)', fontWeight: 700 }}>
                    {item.requested_type || 'Platinum'}
                  </span>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12,
                    background: item.kyc_status === 'Approved'
                      ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)',
                    color: item.kyc_status === 'Approved' ? '#0ECB81' : '#F6465D',
                    border: `1px solid ${item.kyc_status === 'Approved'
                      ? 'rgba(14,203,129,0.3)' : 'rgba(246,70,93,0.3)'}` }}>
                    KYC: {item.kyc_status}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#848E9C' }}>
                  {item.user_email}  /  Applied {timeAgo(item.created_at)}
                </div>
                {item.note && (
                  <div style={{ fontSize: 12, color: '#A8B0BC', marginTop: 4,
                    fontStyle: 'italic', maxWidth: 480, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    "{item.note}"
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => openApprove(item)}
                  style={{ padding: '7px 16px', borderRadius: 8, border: 'none',
                    background: 'rgba(14,203,129,0.15)', color: '#0ECB81',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => openReject(item)}
                  style={{ padding: '7px 16px', borderRadius: 8, border: 'none',
                    background: 'rgba(246,70,93,0.12)', color: '#F6465D',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
