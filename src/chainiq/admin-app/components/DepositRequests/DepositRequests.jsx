import React, { useState, useEffect, useCallback, useMemo, useContext } from 'react';
import { listDepositRequests, approveDepositRequest, rejectDepositRequest, deleteDepositRequestApi, bulkDeleteDepositRequestsApi, searchAdminLeads } from '../../adminApi';
import { DataContext } from '../../shared';
import { SearchAutocomplete } from '../UserChrome';
import MessageReasonPicker from '../MessageReasonPicker/MessageReasonPicker';
import {
  DEPOSIT_REJECTION_REASONS,
  DEPOSIT_APPROVAL_MESSAGES,
} from '../../data/messageCatalogs';
import './deposit-modal.css';

const REJECTION_REASONS = DEPOSIT_REJECTION_REASONS;
const APPROVAL_MESSAGES = DEPOSIT_APPROVAL_MESSAGES;
const REJECTION_CATEGORIES  = Object.keys(REJECTION_REASONS);
const APPROVAL_CATEGORIES   = Object.keys(APPROVAL_MESSAGES);

const STATUS_COLORS = {
  Pending:  { bg: 'rgba(240,185,11,0.12)',  color: '#F0B90B',  border: 'rgba(240,185,11,0.3)'  },
  Approved: { bg: 'rgba(14,203,129,0.1)',   color: '#0ECB81',  border: 'rgba(14,203,129,0.3)'  },
  Rejected: { bg: 'rgba(246,70,93,0.1)',    color: '#F6465D',  border: 'rgba(246,70,93,0.3)'   },
  Cancelled:{ bg: 'rgba(132,142,156,0.12)', color: '#848E9C',  border: 'rgba(132,142,156,0.3)' },
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

function fmtAmt(n, asset) {
  const v = parseFloat(n || 0);
  const decimals = asset === 'BTC' ? 8 : asset === 'ETH' ? 6 : 2;
  return v.toFixed(decimals).replace(/\.?0+$/, '') + ' ' + (asset || '');
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

export default function DepositRequests() {
  const { users = [] } = useContext(DataContext);
  const [activeTab,     setActiveTab]     = useState('queue');
  const [items,         setItems]         = useState([]);
  const [total,         setTotal]         = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [historyFilter, setHistoryFilter] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [offset,        setOffset]        = useState(0);
  const limit = 20;

  const [actionItem,        setActionItem]        = useState(null);
  const [actionNote,        setActionNote]        = useState('');
  const [selectedReason,    setSelectedReason]    = useState(null);
  const [useCustomReason,   setUseCustomReason]   = useState(false);
  const [actionBusy,        setActionBusy]        = useState(false);
  const [actionError,       setActionError]       = useState('');
  const [toast,             setToast]             = useState('');
  const [selectedHist,      setSelectedHist]      = useState([]);

  const statusFilter = activeTab === 'queue' ? 'Pending' : historyFilter;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: rows, total: t } = await listDepositRequests({
        status: statusFilter,
        search: activeTab === 'history' ? historySearch.trim() : '',
        limit,
        offset,
      });
      setItems(rows);
      setTotal(t);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, offset, activeTab, historySearch]);

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
    if (actionItem.mode === 'reject' && !actionNote.trim()) {
      setActionError('Please select or enter a rejection reason.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      if (actionItem.mode === 'approve') {
        await approveDepositRequest(actionItem.item.id, actionNote);
        showToast(`OK Deposit approved - ${fmtAmt(actionItem.item.amountDisplay, actionItem.item.asset)} credited to ${actionItem.item.userName}`);
      } else {
        await rejectDepositRequest(actionItem.item.id, {
          reason: actionNote,
          code: selectedReason?.code || '',
        });
        showToast(`Error Deposit rejected - client notified`);
      }
      setActionItem(null);
      load();
    } catch (e) {
      setActionError(e.message || 'Action failed');
    } finally {
      setActionBusy(false);
    }
  };

  const isApprove = actionItem?.mode === 'approve';

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
      await bulkDeleteDepositRequestsApi(selectedHist);
      setItems(prev => prev.filter(it => !selectedHist.includes(it.id)));
      setSelectedHist([]);
      showToast(`🗑 ${count} deposit request${count > 1 ? 's' : ''} deleted.`);
    } catch (err) {
      showToast(`Delete failed: ${err?.message || 'server error'}`);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: '#1E2329', border: '1px solid #2B3139',
          borderRadius: 10, padding: '12px 20px', color: '#EAECEF', fontSize: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}

      {/* Action Modal */}
      {actionItem && (
        <div className="dr-modal-overlay" onClick={() => !actionBusy && setActionItem(null)}>
          <div className="dr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="dr-modal__header">
              <h3 className="dr-modal__title">
                {isApprove ? 'Approve deposit' : 'Reject deposit'}
              </h3>
              <p className="dr-modal__subtitle">
                {fmtAmt(actionItem.item.amountDisplay, actionItem.item.asset)} - {actionItem.item.userName}
              </p>
            </div>

            <div className="dr-modal__body">
              <div className="dr-modal-summary">
                {[
                  ['Client', `${actionItem.item.userName}  /  ${actionItem.item.userEmail}`, ''],
                  ['Amount', fmtAmt(actionItem.item.amountDisplay, actionItem.item.asset), 'amount'],
                  ['Address', actionItem.item.address || '-', 'mono'],
                  actionItem.item.network ? ['Network', actionItem.item.network, ''] : null,
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
                {isApprove ? 'Select approval message' : 'Select rejection reason'}
              </p>

              {!useCustomReason && (
                <div className="dr-modal-picker-wrap">
                  <MessageReasonPicker
                    catalog={isApprove ? APPROVAL_MESSAGES : REJECTION_REASONS}
                    categories={isApprove ? APPROVAL_CATEGORIES : REJECTION_CATEGORIES}
                    onSelect={handleSelectReason}
                    selectedCode={selectedReason?.code}
                  />
                </div>
              )}

              <label className="dr-modal-check">
                <input
                  type="checkbox"
                  checked={useCustomReason}
                  onChange={(e) => {
                    setUseCustomReason(e.target.checked);
                    if (e.target.checked) { setSelectedReason(null); setActionNote(''); }
                    else setActionNote(selectedReason?.message || '');
                  }}
                />
                <span>Write a custom message instead</span>
              </label>

              {selectedReason && !useCustomReason && (
                <div className={`dr-modal-preview ${isApprove ? 'dr-modal-preview--approve' : 'dr-modal-preview--reject'}`}>
                  <div className={`dr-modal-preview__title${isApprove ? ' dr-modal-preview__title--approve' : ''}`}>
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
                    : isApprove ? 'Internal note (optional)' : 'Message (sent to client)'}
              </label>
              <textarea
                className="dr-modal__textarea"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder={isApprove
                  ? 'Select an approval message above, or write a custom note...'
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
                  className={`dr-modal__btn ${isApprove ? 'dr-modal__btn--approve' : 'dr-modal__btn--reject'}`}
                  onClick={handleAction}
                  disabled={actionBusy || (!isApprove && !actionNote.trim())}
                >
                  {actionBusy ? 'Processing...' : isApprove ? 'Confirm & credit balance' : 'Reject & notify client'}
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
            <h2 style={{ margin: 0, color: '#EAECEF', fontSize: 20 }}>[deposit] Deposit Requests</h2>
            <p style={{ margin: '4px 0 0', color: '#848E9C', fontSize: 13 }}>
              {activeTab === 'queue'
                ? 'Review pending deposits and credit balances upon verification.'
                : 'Past deposit decisions - approved and rejected requests.'}
            </p>
          </div>
          <button onClick={load}
            style={{ padding: '6px 12px', borderRadius: 8, background: 'transparent',
              border: '1px solid #2B3139', color: '#848E9C', cursor: 'pointer', fontSize: 13 }}>
            <i className="fas fa-sync-alt" style={{ marginRight: 4 }} />Refresh
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #2B3139', marginBottom: 0 }}>
          {tabBtn('queue',   'Queue',   '[list]')}
          {tabBtn('history', 'History', '🕓')}
        </div>
      </div>

      {/* History sub-filters + search */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {[['', 'All'], ['Approved', 'Approved'], ['Rejected', 'Rejected']].map(([val, label]) => (
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
            inputProps={{ 'aria-label': 'Search deposit history by client' }}
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
              {activeTab === 'queue' ? 'No pending deposits' : historySearch ? 'No results' : 'No history yet'}
            </div>
            <div style={{ fontSize: 13 }}>
              {activeTab === 'queue'
                ? 'No pending deposit requests at the moment.'
                : historySearch
                  ? `No records matching "${historySearch}".`
                  : historyFilter ? `No ${historyFilter.toLowerCase()} deposit requests found.` : 'No processed deposits yet.'}
            </div>
          </div>
        ) : activeTab === 'queue' ? (
          /* ── Queue table ── */
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2B3139' }}>
                {['Client', 'Asset / Amount', 'Address', 'Network', 'Submitted', 'Actions'].map(h => (
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
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#EAECEF' }}>{item.userName}</div>
                    <div style={{ fontSize: 11, color: '#848E9C' }}>{item.userEmail}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 700, color: '#F0B90B', fontSize: 15 }}>
                      {fmtAmt(item.amountDisplay, item.asset)}
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#848E9C',
                      background: '#0B0E11', padding: '2px 6px', borderRadius: 4 }}>
                      {item.address?.slice(0, 16)}...
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#848E9C' }}>
                    {item.network || <span style={{ opacity: 0.4 }}>-</span>}
                  </td>
                  <td style={{ padding: '12px 16px', color: '#848E9C', whiteSpace: 'nowrap' }}>
                    {timeAgo(item.createdAt)}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openAction(item, 'approve')}
                        style={{ padding: '5px 12px', background: 'rgba(14,203,129,0.12)',
                          border: '1px solid rgba(14,203,129,0.3)', borderRadius: 6,
                          color: '#0ECB81', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                        Approve
                      </button>
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
                {['Client', 'Asset / Amount', 'Address', 'Status', 'Submitted', 'Decided', 'Decided by', 'Message sent', ''].map(h => (
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
                      {fmtAmt(item.amountDisplay, item.asset)}
                    </div>
                    {item.network && <div style={{ fontSize: 11, color: '#848E9C', marginTop: 2 }}>{item.network}</div>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#848E9C',
                      background: '#0B0E11', padding: '2px 6px', borderRadius: 4 }}>
                      {item.address?.slice(0, 16)}...
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
                    {item.adminNote || item.note ? (
                      <span style={{ fontSize: 11, color: '#848E9C', lineHeight: 1.4,
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.adminNote || item.note}
                      </span>
                    ) : (
                      <span style={{ color: '#848E9C', opacity: 0.4, fontSize: 12 }}>-</span>
                    )}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <button
                      onClick={() => {
                        setItems(prev => prev.filter(it => it.id !== item.id));
                        deleteDepositRequestApi(item.id).catch(() => showToast('Delete failed.'));
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
