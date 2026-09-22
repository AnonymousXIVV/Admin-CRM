import React, { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { DataContext, NotificationContext } from '../../App';
import {
  createTransactionApi, mapBackendBalances,
  deleteTransactionApi, clearUserTransactionsApi,
  updateTransactionStatusApi, updateTransactionFullApi,
  reorderTransactionsApi, bulkDeleteTransactionsApi, searchAdminLeads,
} from '../../adminApi';
import { SearchAutocomplete } from '../UserChrome';
import { useConfirmDialog } from '../ConfirmModal/ConfirmModal';

// ── Types ─────────────────────────────────────────────────────────────────────
const TXN_TYPES = [
  { value: 'Deposit',     label: '[deposit] Deposit' },
  { value: 'Withdrawal',  label: '[upload] Withdrawal' },
  { value: 'Transfer',    label: '→ Transfer' },
  { value: 'Refund',      label: 'Refund' },
  { value: 'Trade',       label: '🔄 Trade' },
  { value: 'Card Top-Up', label: '[card] Card Top-Up' },
  { value: 'Adjustment',  label: '⚙ Adjustment' },
  { value: '__custom__',  label: ' Custom...' },
];
const TXN_STATUS_OPTIONS = ['Completed', 'Pending', 'Failed', 'Reversed'];
const INJECTABLE_ASSETS  = new Set(['USD', 'BTC', 'ETH', 'USDT', 'CARD']);
const CURRENCIES         = ['USD', 'BTC', 'ETH', 'USDT', 'TRX', 'BNB', 'USDC', 'SOL', 'XRP', 'ADA', 'DOGE', 'MATIC', 'DOT', 'AVAX', 'LINK', 'UNI', 'LTC', 'BCH', 'XLM', 'FIL', 'NEAR', 'CARD'];

// ── Badge helpers ─────────────────────────────────────────────────────────────
const TYPE_BADGE_STYLE = (type) => {
  const k = (type || '').toLowerCase();
  if (k === 'deposit')     return { background: 'rgba(14,203,129,.15)',  color: '#0ECB81' };
  if (k === 'withdrawal')  return { background: 'rgba(246,70,93,.15)',   color: '#F6465D' };
  if (k === 'trade')       return { background: 'rgba(153,102,255,.15)', color: '#9966ff' };
  if (k === 'transfer')    return { background: 'rgba(24,144,255,.15)',  color: '#1890ff' };
  if (k === 'refund')      return { background: 'rgba(0,210,210,.15)',   color: '#00d2d2' };
  if (k === 'card top-up') return { background: 'rgba(202,138,4,.18)',   color: '#f0b90b' };
  if (k === 'adjustment')  return { background: 'rgba(132,142,156,.15)', color: '#848E9C' };
  return { background: 'rgba(132,142,156,.12)', color: '#9fa8b4' };
};
const STATUS_BADGE_STYLE = (status) => {
  const k = (status || '').toLowerCase();
  if (k === 'completed') return { background: 'rgba(14,203,129,.15)',  color: '#0ECB81' };
  if (k === 'pending')   return { background: 'rgba(240,185,11,.15)',  color: '#F0B90B' };
  if (k === 'failed')    return { background: 'rgba(246,70,93,.15)',   color: '#F6465D' };
  if (k === 'reversed')  return { background: 'rgba(246,70,93,.12)',   color: '#e05d72' };
  return { background: 'rgba(132,142,156,.12)', color: '#848E9C' };
};
const badge = (text, style) => (
  <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:9999, fontSize:'0.72rem', fontWeight:600, whiteSpace:'nowrap', ...style }}>{text}</span>
);
const renderTxIdCell = (id, showNotification) => {
  if (!id) return <span style={{ color:'#848E9C' }}>-</span>;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, maxWidth:260 }}>
      <code
        title={id}
        style={{
          display:'inline-block',
          maxWidth:'100%',
          whiteSpace:'normal',
          wordBreak:'break-all',
          fontSize:'0.74rem',
          lineHeight:1.4,
          color:'#EAECEF',
          background:'rgba(255,255,255,0.04)',
          border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:4,
          padding:'2px 6px',
          fontFamily:'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace'
        }}
      >{id}</code>
      <button
        type="button"
        className="aax-copy-icon"
        aria-label={`Copy transaction ID ${id}`}
        title="Copy transaction ID"
        onClick={() => {
          if (!navigator.clipboard) {
            showNotification?.('Clipboard not available', 'error');
            return;
          }
          navigator.clipboard.writeText(id)
            .then(() => showNotification?.('Transaction ID copied', 'success'))
            .catch(() => showNotification?.('Could not copy transaction ID', 'error'));
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/>
        </svg>
      </button>
    </div>
  );
};

// ── Misc helpers ──────────────────────────────────────────────────────────────
const formatLeadName = (lead) => {
  if (!lead) return '';
  if (lead.firstName || lead.lastName) return `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
  return lead.name || lead.email || lead.id;
};
const labelStyle = { display:'block', fontSize:11, color:'#a3adc0', marginBottom:4, fontWeight:600 };

// ── Tab pill ──────────────────────────────────────────────────────────────────
const TabBtn = ({ active, onClick, children }) => (
  <button onClick={onClick} style={{
    padding: '9px 22px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
    borderBottom: active ? '2px solid #f3ba2f' : '2px solid transparent',
    background: 'transparent', color: active ? '#f3ba2f' : '#848E9C',
    transition: 'all .15s',
  }}>{children}</button>
);

// 
const Transactions = () => {
  const { transactionData, setTransactionData, leads, setLeads, userFees, clientSpecificFees, logAdminAction } = useContext(DataContext);
  const showNotification = useContext(NotificationContext);
  const [confirmDialog, confirm] = useConfirmDialog();

  // ── Active tab ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' | 'editor'

  //  LEDGER TAB STATE 
  const [searchQuery,  setSearchQuery]  = useState('');
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage,  setCurrentPage]  = useState(1);
  const rowsPerPage = 10;
  const [selectedTxns, setSelectedTxns] = useState([]);

  const [showCreate,       setShowCreate]      = useState(false);
  const [leadSearch,       setLeadSearch]      = useState('');
  const [createLeadId,     setCreateLeadId]    = useState('');
  const [createType,       setCreateType]      = useState('Deposit');
  const [createCustomType, setCreateCustomType]= useState('');
  const [createDirection,  setCreateDirection] = useState('credit');
  const [createAmount,     setCreateAmount]    = useState('');
  const [createFee,        setCreateFee]       = useState('');
  const [createCurrency,   setCreateCurrency]  = useState('USD');
  const [createDate,       setCreateDate]      = useState(() => new Date().toISOString().slice(0, 16));
  const [createNote,       setCreateNote]      = useState('');
  const [createStatus,     setCreateStatus]    = useState('Completed');
  const [createAffectBal,  setCreateAffectBal] = useState(true);
  const [submitting,       setSubmitting]      = useState(false);
  const [remoteCreateLeads, setRemoteCreateLeads] = useState([]);

  //  EDITOR TAB STATE 
  const [editorSearch,   setEditorSearch]   = useState('');
  const [editorClientId, setEditorClientId] = useState('');
  const [editingTxId,    setEditingTxId]    = useState(null);
  const [editForm,       setEditForm]       = useState({});
  const [editAffectBal,  setEditAffectBal]  = useState(true);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [remoteEditorLeads, setRemoteEditorLeads] = useState([]);
  // reorder
  const [txOrderIds,    setTxOrderIds]   = useState(null); // null = use natural order
  const [orderDirty,    setOrderDirty]   = useState(false);
  const [orderSaving,   setOrderSaving]  = useState(false);
  const [dragTxId,      setDragTxId]     = useState(null);  // id of the row being dragged
  const [dragOverIdx,   setDragOverIdx]  = useState(null);  // target position index
  const [savedOrderIds, setSavedOrderIds] = useState(null); // last committed order (null = natural)

  useEffect(() => {
    const query = leadSearch.trim();
    if (!query) {
      setRemoteCreateLeads([]);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      searchAdminLeads(query, { limit: 15 })
        .then(suggestions => {
          if (active) setRemoteCreateLeads(suggestions.map(s => s.lead).filter(Boolean));
        })
        .catch(() => { if (active) setRemoteCreateLeads([]); });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [leadSearch]);

  useEffect(() => {
    const query = editorSearch.trim();
    if (!query) {
      setRemoteEditorLeads([]);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      searchAdminLeads(query, { limit: 15 })
        .then(suggestions => {
          if (active) setRemoteEditorLeads(suggestions.map(s => s.lead).filter(Boolean));
        })
        .catch(() => { if (active) setRemoteEditorLeads([]); });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [editorSearch]);

  // ── Ledger computed ───────────────────────────────────────────────────────
  const matchingLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    const list = [...remoteCreateLeads, ...(leads || [])].filter((lead, index, rows) =>
      rows.findIndex(item => item.id === lead.id) === index
    );
    if (!q) return list.slice(0, 12);
    return list.filter(l =>
      (l.firstName || '').toLowerCase().includes(q) ||
      (l.lastName  || '').toLowerCase().includes(q) ||
      (l.name      || '').toLowerCase().includes(q) ||
      (l.email     || '').toLowerCase().includes(q) ||
      (l.phone     || '').toLowerCase().includes(q) ||
      (l.id        || '').toLowerCase().includes(q)
    ).slice(0, 12);
  }, [leads, leadSearch, remoteCreateLeads]);

  const selectedLead = useMemo(
    () => [...remoteCreateLeads, ...(leads || [])].find(l => l.id === createLeadId) || null,
    [leads, createLeadId, remoteCreateLeads]
  );
  const selectedLeadTxns = useMemo(() => {
    if (!createLeadId) return [];
    return (transactionData || []).filter(t => t.userId === createLeadId).sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactionData, createLeadId]);
  const effectiveType = createType === '__custom__' ? createCustomType.trim() : createType;

  // ── Editor computed ───────────────────────────────────────────────────────
  const editorMatchingLeads = useMemo(() => {
    const q = editorSearch.trim().toLowerCase();
    const list = [...remoteEditorLeads, ...(leads || [])].filter((lead, index, rows) =>
      rows.findIndex(item => item.id === lead.id) === index
    );
    if (!q) return list.slice(0, 15);
    return list.filter(l =>
      (l.firstName || '').toLowerCase().includes(q) ||
      (l.lastName  || '').toLowerCase().includes(q) ||
      (l.name      || '').toLowerCase().includes(q) ||
      (l.email     || '').toLowerCase().includes(q) ||
      (l.phone     || '').toLowerCase().includes(q) ||
      (l.id        || '').toLowerCase().includes(q)
    ).slice(0, 15);
  }, [leads, editorSearch, remoteEditorLeads]);

  const editorSelectedLead = useMemo(
    () => [...remoteEditorLeads, ...(leads || [])].find(l => l.id === editorClientId) || null,
    [leads, editorClientId, remoteEditorLeads]
  );

  const transactionClientSuggestions = useCallback((query) => {
    const q = query.trim().toLowerCase();
    return (leads || [])
      .filter(lead => [formatLeadName(lead), lead.email, lead.phone, lead.id]
        .some(value => String(value || '').toLowerCase().includes(q)))
      .map(lead => ({
        key: lead.id,
        value: formatLeadName(lead),
        label: formatLeadName(lead),
        meta: lead.email || lead.phone || '',
      }));
  }, [leads]);

  const editorClientTxns = useMemo(() => {
    if (!editorClientId) return [];
    return (transactionData || [])
      .filter(t => t.userId === editorClientId)
      .sort((a, b) => {
        const aOrd = a.displayOrder ?? 999999;
        const bOrd = b.displayOrder ?? 999999;
        if (aOrd !== bOrd) return aOrd - bOrd;
        return new Date(b.date) - new Date(a.date);
      });
  }, [transactionData, editorClientId]);

  // Ordered list respecting local reorder before save
  const orderedTxns = useMemo(() => {
    if (!txOrderIds) return editorClientTxns;
    const map = Object.fromEntries(editorClientTxns.map(t => [t.id, t]));
    return txOrderIds.map(id => map[id]).filter(Boolean);
  }, [editorClientTxns, txOrderIds]);

  // Live preview while dragging: splices the dragged row into the hover position
  const previewOrderedTxns = useMemo(() => {
    if (!dragTxId || dragOverIdx === null) return orderedTxns;
    const items = [...orderedTxns];
    const fromIdx = items.findIndex(t => t.id === dragTxId);
    if (fromIdx === -1 || fromIdx === dragOverIdx) return orderedTxns;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(dragOverIdx, 0, moved);
    return items;
  }, [orderedTxns, dragTxId, dragOverIdx]);

  // Pre-compute what each row's date will become after the reorder is saved
  const previewDates = useMemo(() => {
    const sortedDates = previewOrderedTxns
      .map(t => t?.date).filter(Boolean)
      .map(d => new Date(d)).sort((a, b) => b - a);
    return previewOrderedTxns.map((_, pos) => sortedDates[pos] || null);
  }, [previewOrderedTxns]);

  // ── Fee helper ────────────────────────────────────────────────────────────
  const getEffectiveFee = (tx) => {
    const leadFees = clientSpecificFees?.[tx.userId];
    const feeKey = tx.type === 'deposit' ? 'depositFee' : 'withdrawalFee';
    if (leadFees && leadFees[feeKey] !== undefined) return leadFees[feeKey];
    return userFees?.[feeKey] ?? 0;
  };

  // ── Approve / Reject ──────────────────────────────────────────────────────
  const applyStatusChange = async (transactionId, nextStatus, action, label) => {
    const txn = transactionData.find(t => t.id === transactionId);
    if (!txn) return;
    const prevStatus = txn.status;
    setTransactionData(prev => prev.map(t => t.id === transactionId ? { ...t, status: nextStatus } : t));
    try {
      const updated = await updateTransactionStatusApi(transactionId, nextStatus);
      if (updated?.id) setTransactionData(prev => prev.map(t => t.id === transactionId ? { ...t, ...updated } : t));
      logAdminAction('Admin', action, `${label} transaction ${transactionId}`);
      showNotification(`Transaction ${label.toLowerCase()}.`, 'success');
    } catch (err) {
      setTransactionData(prev => prev.map(t => t.id === transactionId ? { ...t, status: prevStatus } : t));
      showNotification(`Could not ${label.toLowerCase()}: ${err?.message || 'server error'}`, 'error');
    }
  };
  const handleApprove = (id) => applyStatusChange(id, 'completed', 'Approve Transaction', 'Approved');
  const handleReject  = async (id) => {
    const ok = await confirm({ title: 'Reject transaction?', message: 'This cannot be undone.', confirmLabel: 'Reject', tone: 'danger' });
    if (!ok) return;
    applyStatusChange(id, 'failed', 'Reject Transaction', 'Rejected');
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (tx) => {
    const canReverse = INJECTABLE_ASSETS.has(tx.currency) && tx.status === 'completed';
    const ok = await confirm({
      title: 'Delete transaction',
      message: `Permanently remove this ${tx.type} of ${Math.abs(tx.amount || 0).toFixed(2)} ${tx.currency || ''}?`,
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    let reverseBalance = false;
    if (canReverse) {
      reverseBalance = await confirm({
        title: 'Reverse balance impact?',
        message: `The client's ${tx.currency} balance was changed by this transaction. Reverse that change?`,
        confirmLabel: 'Yes, reverse balance', cancelLabel: 'No, keep balance', tone: 'primary',
      });
    }
    try {
      await deleteTransactionApi(tx.id, reverseBalance);
      setTransactionData(prev => prev.filter(t => t.id !== tx.id));
      if (txOrderIds) setTxOrderIds(prev => prev ? prev.filter(id => id !== tx.id) : null);
      logAdminAction('Admin', 'Delete Transaction', `Deleted ${tx.type} ${tx.id}${reverseBalance ? ' (balance reversed)' : ''}`);
      showNotification('Transaction deleted.', 'success');
    } catch (err) {
      showNotification(`Could not delete: ${err?.message || 'server error'}`, 'error');
    }
  };

  // ── Clear all ─────────────────────────────────────────────────────────────
  const handleClearAll = async () => {
    if (!createLeadId) return;
    const leadName = selectedLead ? formatLeadName(selectedLead) : createLeadId;
    const ok = await confirm({
      title: 'Clear transaction history',
      message: `Permanently delete ALL ${selectedLeadTxns.length} transaction(s) for ${leadName}? Balances are NOT reversed.`,
      confirmLabel: 'Clear All', tone: 'danger',
    });
    if (!ok) return;
    try {
      await clearUserTransactionsApi(createLeadId);
      setTransactionData(prev => prev.filter(t => t.userId !== createLeadId));
      logAdminAction('Admin', 'Clear Transactions', `Cleared all transactions for ${leadName}`);
      showNotification(`Transaction history cleared for ${leadName}.`, 'success');
    } catch (err) {
      showNotification(`Could not clear: ${err?.message || 'server error'}`, 'error');
    }
  };

  // ── Bulk delete (ledger) ──────────────────────────────────────────────────
  const handleBulkDeleteTxns = async () => {
    if (selectedTxns.length === 0) return;
    const count = selectedTxns.length;
    const ok = await confirm({
      title: `Delete ${count} transaction${count > 1 ? 's' : ''}?`,
      message: `Permanently remove ${count} transaction record${count > 1 ? 's' : ''}? This cannot be undone.`,
      confirmLabel: 'Delete All',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const result = await bulkDeleteTransactionsApi(selectedTxns);
      setTransactionData(prev => prev.filter(t => !selectedTxns.includes(t.id)));
      setSelectedTxns([]);
      showNotification(`${result?.deleted ?? count} transaction${count > 1 ? 's' : ''} deleted.`, 'success');
      logAdminAction('Admin', 'Bulk Delete Transactions', `Deleted ${count} transactions`);
    } catch (err) {
      showNotification(`Bulk delete failed: ${err?.message || 'server error'}`, 'error');
    }
  };

  // ── Create transaction ────────────────────────────────────────────────────
  const handleCreateTransaction = async () => {
    if (!createLeadId) { showNotification('Choose a client first.', 'error'); return; }
    const amt = parseFloat(createAmount);
    if (!amt || amt <= 0) { showNotification('Enter a valid amount > 0.', 'error'); return; }
    if (createType === '__custom__' && !createCustomType.trim()) { showNotification('Enter a custom type.', 'error'); return; }
    const signedAmount = createDirection === 'debit' ? -Math.abs(amt) : Math.abs(amt);
    const feeAmt = parseFloat(createFee) || 0;
    setSubmitting(true);
    try {
      const result = await createTransactionApi({
        userId: createLeadId, type: effectiveType, amount: signedAmount,
        currency: createCurrency, feeAmount: feeAmt > 0 ? feeAmt : undefined,
        status: createStatus, date: new Date(createDate).toISOString(),
        note: createNote || undefined, affectBalance: createAffectBal,
      });
      const savedTxn = result?.transaction;
      if (!savedTxn) { showNotification('Server returned no transaction.', 'error'); return; }
      setTransactionData(prev => [savedTxn, ...prev]);
      if (createAffectBal && result?.balances && typeof setLeads === 'function') {
        const freshDisplay = mapBackendBalances(result.balances);
        setLeads(prev => prev.map(l => l.id === createLeadId ? { ...l, balance: result.balances, balances: freshDisplay } : l));
      }
      logAdminAction('Admin', 'Create Transaction',
        `${effectiveType} ${Math.abs(signedAmount)} ${createCurrency} for ${formatLeadName(selectedLead)} (${createAffectBal ? 'balance affected' : 'record only'})`);
      showNotification(`Transaction added${createAffectBal ? ' (balance updated)' : ' (record only)'}.`, 'success');
      setCreateAmount(''); setCreateFee(''); setCreateNote('');
    } catch (err) {
      showNotification(`Could not save: ${err?.message || 'server error'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Editor: select client ─────────────────────────────────────────────────
  const selectEditorClient = (l) => {
    setEditorClientId(l.id);
    setEditorSearch(formatLeadName(l));
    setEditingTxId(null);
    setTxOrderIds(null);
    setOrderDirty(false);
  };

  // ── Editor: open edit form ────────────────────────────────────────────────
  const openEditForm = useCallback((tx) => {
    const isCredit  = (tx.amount || 0) >= 0;
    const rawType   = tx.type || '';
    const known = TXN_TYPES.find(t => t.value !== '__custom__' && t.value.toLowerCase() === rawType.toLowerCase());
    setEditForm({
      type:        known ? known.value : '__custom__',
      customType:  known ? '' : rawType,
      direction:   isCredit ? 'credit' : 'debit',
      amount:      String(Math.abs(parseFloat(tx.amount) || 0)),
      currency:    (tx.currency || 'USD').toUpperCase(),
      fee:         tx.feeAmount > 0 ? String(tx.feeAmount) : '',
      description: tx.description || '',
      status: tx.status
        ? (tx.status.charAt(0).toUpperCase() + tx.status.slice(1).toLowerCase())
        : 'Completed',
      date: tx.date ? new Date(tx.date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    });
    setEditAffectBal(true);
    setEditingTxId(tx.id);
  }, []);

  // ── Editor: save edit ─────────────────────────────────────────────────────
  const handleEditSave = async (tx) => {
    const amt = parseFloat(editForm.amount);
    if (!amt || amt <= 0) { showNotification('Enter a valid amount > 0.', 'error'); return; }
    const effectiveEditType = editForm.type === '__custom__' ? (editForm.customType || '').trim() : editForm.type;
    if (!effectiveEditType) { showNotification('Type is required.', 'error'); return; }

    const newSignedAmt = editForm.direction === 'debit' ? -Math.abs(amt) : Math.abs(amt);
    const oldSignedAmt = parseFloat(tx.amount) || 0;
    const newCurrency  = editForm.currency;

    const fields = {
      type: effectiveEditType, currency: newCurrency, amount: newSignedAmt,
      fee: parseFloat(editForm.fee) || 0,
      description: editForm.description || null, status: editForm.status,
      date: new Date(editForm.date).toISOString(),
    };
    if (editAffectBal && INJECTABLE_ASSETS.has(newCurrency)) {
      const isSameCurrency = newCurrency === (tx.currency || '').toUpperCase();
      const delta = isSameCurrency ? newSignedAmt - oldSignedAmt : newSignedAmt;
      if (delta !== 0) { fields.affectBalanceDelta = delta; fields.affectBalanceCurrency = newCurrency; }
    }

    setEditSubmitting(true);
    try {
      const result = await updateTransactionFullApi(tx.id, fields);
      const saved  = result?.transaction;
      if (saved) setTransactionData(prev => prev.map(t => t.id === tx.id ? { ...t, ...saved } : t));
      if (editAffectBal && result?.balances && typeof setLeads === 'function') {
        const freshDisplay = mapBackendBalances(result.balances);
        setLeads(prev => prev.map(l => l.id === tx.userId ? { ...l, balance: result.balances, balances: freshDisplay } : l));
      }
      logAdminAction('Admin', 'Edit Transaction',
        `Edited ${effectiveEditType} ${Math.abs(newSignedAmt)} ${newCurrency} for user ${tx.userId}`);
      showNotification(`Transaction updated${fields.affectBalanceDelta ? ' (balance adjusted)' : ''}.`, 'success');
      setEditingTxId(null);
    } catch (err) {
      showNotification(`Could not save: ${err?.message || 'server error'}`, 'error');
    } finally {
      setEditSubmitting(false);
    }
  };

  // ── Editor: toggle hidden ─────────────────────────────────────────────────
  const handleToggleHidden = async (tx) => {
    const newHidden = !tx.hidden;
    setTransactionData(prev => prev.map(t => t.id === tx.id ? { ...t, hidden: newHidden } : t));
    try {
      await updateTransactionFullApi(tx.id, { hidden: newHidden });
      logAdminAction('Admin', newHidden ? 'Hide Transaction' : 'Unhide Transaction', `${tx.id}`);
      showNotification(newHidden ? 'Transaction hidden from client.' : 'Transaction visible to client.', 'success');
    } catch (err) {
      setTransactionData(prev => prev.map(t => t.id === tx.id ? { ...t, hidden: !newHidden } : t));
      showNotification(`Could not update visibility: ${err?.message || 'server error'}`, 'error');
    }
  };

  // ── Editor: drag-to-reorder ───────────────────────────────────────────────
  const getOrderedIds = () => txOrderIds || orderedTxns.map(t => t.id);

  const handleDragStart = (e, txId) => {
    setDragTxId(txId);
    // Build a solid opaque ghost that matches the row
    const row = e.currentTarget;
    const table = document.createElement('table');
    table.style.cssText = 'position:fixed;top:-9999px;left:-9999px;border-collapse:collapse;background:#2A2E36;border-radius:4px;border:1px solid #f3ba2f;opacity:1;';
    const tbody = document.createElement('tbody');
    const clone = row.cloneNode(true);
    clone.style.cssText = 'opacity:1;background:#2A2E36;';
    tbody.appendChild(clone);
    table.appendChild(tbody);
    document.body.appendChild(table);
    const rect = row.getBoundingClientRect();
    e.dataTransfer.setDragImage(table, e.clientX - rect.left, e.clientY - rect.top);
    setTimeout(() => document.body.removeChild(table), 0);
  };
  const handleDragOver  = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDragEnd   = () => { setDragTxId(null); setDragOverIdx(null); };
  const handleDrop      = () => {
    if (!dragTxId || dragOverIdx === null) { setDragTxId(null); setDragOverIdx(null); return; }
    setTxOrderIds(previewOrderedTxns.map(t => t.id));
    setOrderDirty(true);
    setDragTxId(null);
    setDragOverIdx(null);
  };
  const handleUndoOrder = () => {
    setTxOrderIds(savedOrderIds);
    setOrderDirty(false);
  };

  // ── Editor: save order + redistribute timestamps ──────────────────────────
  const handleSaveOrder = async () => {
    if (!editorClientId || !txOrderIds) return;
    setOrderSaving(true);
    try {
      // Collect existing dates from the transactions in their current order,
      // sort descending so the top row always gets the newest timestamp.
      const sortedDates = txOrderIds
        .map(id => transactionData.find(t => t.id === id)?.date)
        .filter(Boolean)
        .map(d => new Date(d))
        .sort((a, b) => b - a);

      // Save the display_order on the backend
      await reorderTransactionsApi(editorClientId, txOrderIds);

      // Redistribute timestamps: position 0 (top) = newest, last = oldest
      const dateUpdates = txOrderIds.map((id, pos) => {
        const newDate = sortedDates[pos] || sortedDates[sortedDates.length - 1] || new Date();
        return { id, date: newDate.toISOString() };
      });

      // Patch each transaction's date on the backend (fire all in parallel)
      await Promise.all(dateUpdates.map(({ id, date }) =>
        updateTransactionFullApi(id, { date }).catch(() => {})
      ));

      // Commit to local state: displayOrder + redistributed dates
      setTransactionData(prev => prev.map(t => {
        const pos = txOrderIds.indexOf(t.id);
        if (pos === -1) return t;
        const update = dateUpdates.find(u => u.id === t.id);
        return { ...t, displayOrder: pos, date: update?.date || t.date };
      }));

      setSavedOrderIds([...txOrderIds]); // snapshot for undo
      setOrderDirty(false);
      logAdminAction('Admin', 'Reorder Transactions', `Reordered ${txOrderIds.length} transactions for user ${editorClientId}`);
      showNotification('Order saved - timestamps redistributed.', 'success');
    } catch (err) {
      showNotification(`Could not save order: ${err?.message || 'server error'}`, 'error');
    } finally {
      setOrderSaving(false);
    }
  };

  // ── Ledger table filtering + pagination ───────────────────────────────────
  const filteredTransactions = (transactionData || []).filter(tx => {
    const lead     = leads.find(l => l.id === tx.userId);
    const leadName = lead ? formatLeadName(lead) : '';
    const q        = searchQuery.toLowerCase();
    const searchOk = !q
      || (tx.id || '').toLowerCase().includes(q)
      || leadName.toLowerCase().includes(q)
      || (tx.type || '').toLowerCase().includes(q)
      || (tx.status || '').toLowerCase().includes(q)
      || (tx.currency || '').toLowerCase().includes(q);
    const typeOk   = typeFilter   === 'all' || (tx.type   || '').toLowerCase() === typeFilter.toLowerCase();
    const statusOk = statusFilter === 'all' || (tx.status || '').toLowerCase() === statusFilter.toLowerCase();
    return searchOk && typeOk && statusOk;
  });
  const totalPages       = Math.max(1, Math.ceil(filteredTransactions.length / rowsPerPage));
  const safeCurrentPage  = Math.min(currentPage, totalPages);
  const startIndex       = (safeCurrentPage - 1) * rowsPerPage;
  const paginated        = filteredTransactions.slice(startIndex, startIndex + rowsPerPage);

  // 
  return (
    <div id="transactions-section" className="aax-admin-section">
      {confirmDialog}

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'2px solid #363B44', marginBottom:20 }}>
        <div style={{ display:'flex' }}>
          <TabBtn active={activeTab === 'ledger'}  onClick={() => setActiveTab('ledger')}>[list] All Transactions</TabBtn>
          <TabBtn active={activeTab === 'editor'}  onClick={() => setActiveTab('editor')}> Client Transaction Editor</TabBtn>
        </div>
        {activeTab === 'editor' && (
          <button
            className="aax-btn-small"
            onClick={() => setShowCreate(v => !v)}
            style={{ background: showCreate ? '#444A55' : '#f3ba2f', color: showCreate ? '#848E9C' : '#363B44', fontWeight:700, padding:'8px 14px', border:'none', borderRadius:6, cursor:'pointer', marginBottom:2 }}
          >
            {showCreate ? '✕ Close' : '+ Add Transaction'}
          </button>
        )}
      </div>

      {/*  LEDGER TAB  */}
      {activeTab === 'ledger' && (
        <>
          {/* ── Ledger filters ───────────────────────────────────────────── */}
          <div className="search-container">
            <SearchAutocomplete
              value={searchQuery}
              onChange={(value) => { setSearchQuery(value); setCurrentPage(1); }}
              placeholder="[search]  Search by ID, client, type, currency..."
              className="aax-search-input"
              style={{ flex: 1, minWidth: 220 }}
              buildSuggestions={transactionClientSuggestions}
              fetchSuggestions={searchAdminLeads}
              inputProps={{ 'aria-label': 'Search transactions by client or transaction details' }}
            />
            <select className="search-dropdown" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1); }}>
              <option value="all">All Types</option>
              {['Deposit','Withdrawal','Transfer','Refund','Trade','Card Top-Up','Adjustment'].map(t =>
                <option key={t} value={t.toLowerCase()}>{t}</option>)}
            </select>
            <select className="search-dropdown" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}>
              <option value="all">All Statuses</option>
              {TXN_STATUS_OPTIONS.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
            </select>
          </div>

          {/* ── Bulk toolbar ─────────────────────────────────────────────── */}
          {selectedTxns.length > 0 && (
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, padding:'8px 12px', background:'#363B44', borderRadius:6, border:'1px solid #F6465D80' }}>
              <span style={{ color:'#F6465D', fontSize:12, fontWeight:600 }}>{selectedTxns.length} transaction{selectedTxns.length > 1 ? 's' : ''} selected</span>
              <button
                onClick={handleBulkDeleteTxns}
                style={{ padding:'5px 14px', borderRadius:6, background:'rgba(246,70,93,0.15)', border:'1px solid #F6465D60', color:'#F6465D', cursor:'pointer', fontWeight:600, fontSize:12 }}
              >🗑 Delete Selected</button>
              <button
                onClick={() => setSelectedTxns([])}
                style={{ marginLeft:'auto', padding:'4px 10px', borderRadius:4, background:'transparent', border:'1px solid #444A55', color:'#848E9C', cursor:'pointer', fontSize:11 }}
              >Clear</button>
            </div>
          )}

          {/* ── Ledger table ─────────────────────────────────────────────── */}
          <div className="aax-admin-table-container">
            <table className="aax-admin-table">
              <thead>
                <tr>
                  <th style={{ width:36, padding:'12px 8px', textAlign:'center' }}>
                    <input type="checkbox"
                      checked={paginated.length > 0 && paginated.every(t => selectedTxns.includes(t.id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedTxns(prev => [...new Set([...prev, ...paginated.map(t => t.id)])]);
                        else setSelectedTxns(prev => prev.filter(id => !paginated.find(t => t.id === id)));
                      }}
                    />
                  </th>
                  <th>ID</th><th>Client</th><th>Type</th><th>Amount</th>
                  <th>Fee</th><th>Asset</th><th>Status</th><th>Date</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan="10" style={{ textAlign:'center', padding:'32px', color:'#a3adc0' }}>No transactions found.</td></tr>
                ) : paginated.map(tx => {
                  const lead    = leads.find(l => l.id === tx.userId);
                  const feeRate = getEffectiveFee(tx);
                  const dispFee = tx.feeAmount != null && tx.feeAmount > 0
                    ? tx.feeAmount
                    : feeRate > 0 ? (Math.abs(parseFloat(tx.amount) || 0) * feeRate / 100) : 0;
                  const txSelected = selectedTxns.includes(tx.id);
                  return (
                    <tr key={tx.id} style={{ opacity: tx.hidden ? 0.5 : 1, background: txSelected ? 'rgba(246,70,93,0.04)' : undefined }}>
                      <td style={{ textAlign:'center', padding:'8px' }}>
                        <input type="checkbox" checked={txSelected}
                          onChange={e => setSelectedTxns(prev => e.target.checked ? [...prev, tx.id] : prev.filter(id => id !== tx.id))}
                        />
                      </td>
                      <td>{renderTxIdCell(tx.id, showNotification)}</td>
                      <td><strong>{lead ? formatLeadName(lead) : (tx.userName || 'N/A')}</strong></td>
                      <td>{badge(tx.type || '-', TYPE_BADGE_STYLE(tx.type))}</td>
                      <td><span style={{ color:(tx.amount||0)>=0 ? '#0ECB81' : '#F6465D', fontWeight:600 }}>
                        {(tx.amount||0)>=0?'+':''}{(parseFloat(tx.amount)||0).toFixed(2)}
                      </span></td>
                      <td style={{ fontSize:'0.85rem', color:'#a3adc0' }}>{dispFee > 0 ? `-${dispFee.toFixed(2)}` : '-'}</td>
                      <td style={{ fontSize:'0.85rem' }}>{tx.currency}</td>
                      <td>{badge(tx.status || '-', STATUS_BADGE_STYLE(tx.status))}</td>
                      <td style={{ fontSize:'0.82rem' }}>{tx.date ? new Date(tx.date).toLocaleString() : '-'}</td>
                      <td>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignItems:'center' }}>
                          {tx.status === 'pending' && <>
                            <button className="aax-btn-small btn-success" onClick={() => handleApprove(tx.id)} title="Approve">OK</button>
                            <button className="aax-btn-small btn-danger"  onClick={() => handleReject(tx.id)}  title="Reject">Error</button>
                          </>}
                          <button type="button" onClick={() => handleToggleHidden(tx)}
                            title={tx.hidden ? 'Hidden from client - click to show' : 'Visible to client - click to hide'}
                            style={{ padding:'3px 9px', borderRadius:4, fontSize:11, cursor:'pointer', fontWeight:600, border:'none',
                              background: tx.hidden ? 'rgba(246,70,93,.15)' : 'rgba(14,203,129,.12)',
                              color:      tx.hidden ? '#F6465D' : '#0ECB81' }}>
                            {tx.hidden ? '🚫' : '👁'}
                          </button>
                          <button className="aax-btn-small btn-danger" onClick={() => handleDelete(tx)} title="Delete"
                            style={{ background:'rgba(246,70,93,.1)', color:'#F6465D', border:'1px solid rgba(246,70,93,.25)', padding:'3px 8px' }}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ───────────────────────────────────────────────── */}
          <div className="aax-pagination">
            <div style={{ color:'#a3adc0', fontSize:'0.85rem' }}>
              {filteredTransactions.length > 0
                ? `Showing ${startIndex+1}-${Math.min(startIndex+rowsPerPage, filteredTransactions.length)} of ${filteredTransactions.length}`
                : 'No results'}
            </div>
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              <button className="aax-btn-small aax-pagination-btn-gold" onClick={() => setCurrentPage(p => Math.max(1,p-1))} disabled={safeCurrentPage===1}>Prev</button>
              {Array.from({ length: Math.min(totalPages,10) },(_,i)=>i+1).map(i=>(
                <button key={i} className="aax-btn-small" onClick={() => setCurrentPage(i)}
                  style={{ background:i===safeCurrentPage?'#f3ba2f':'#2A2E36', color:i===safeCurrentPage?'#1A1D23':'#848E9C', fontWeight:i===safeCurrentPage?700:500, border:i===safeCurrentPage?'1px solid #f3ba2f':'1px solid #3A3F4A' }}>{i}</button>
              ))}
              <button className="aax-btn-small aax-pagination-btn-gold" onClick={() => setCurrentPage(p => Math.min(totalPages,p+1))} disabled={safeCurrentPage>=totalPages}>Next →</button>
            </div>
          </div>
        </>
      )}

      {/*  CLIENT EDITOR TAB  */}
      {activeTab === 'editor' && (
        <div>
          {/* ── Create form ─────────────────────────────────────────────── */}
          {showCreate && (
            <div style={{ background:'#2A2E36', border:'1px solid #444A55', borderRadius:10, padding:20, marginBottom:20 }}>
              <h3 style={{ marginTop:0, marginBottom:16, color:'#f3ba2f', fontSize:'1rem' }}>Add Transaction to Client Account</h3>

              {/* Client picker */}
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>1. Choose a client</label>
                <input type="search" className="aax-search-input" placeholder="Search by name, email..."
                  value={leadSearch} onChange={e => setLeadSearch(e.target.value)}
                  style={{ width:'100%', maxWidth:460, marginBottom:8 }}
                />
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, maxHeight:110, overflowY:'auto', background:'#363B44', border:'1px solid #444A55', borderRadius:6, padding:8 }}>
                  {matchingLeads.length === 0
                    ? <span style={{ color:'#A8AEB8', fontSize:12 }}>No matching clients.</span>
                    : matchingLeads.map(l => (
                      <button key={l.id} type="button"
                        onClick={() => { setCreateLeadId(l.id); setLeadSearch(formatLeadName(l)); }}
                        style={{ padding:'4px 10px', borderRadius:4, fontSize:12, cursor:'pointer', border:'none', fontWeight: createLeadId === l.id ? 700 : 400, background: createLeadId === l.id ? '#f3ba2f' : '#444A55', color: createLeadId === l.id ? '#363B44' : '#848E9C' }}
                      >{formatLeadName(l)}{l.email ? `  /  ${l.email}` : ''}</button>
                    ))
                  }
                </div>
              </div>

              {selectedLead && (
                <>
                  {/* Client summary */}
                  <div style={{ background:'#363B44', border:'1px solid #444A55', borderRadius:8, padding:12, marginBottom:16, display:'flex', gap:24, flexWrap:'wrap', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:11, color:'#a3adc0', fontWeight:600, textTransform:'uppercase', marginBottom:4 }}>Client</div>
                      <div style={{ fontWeight:700, color:'#f3ba2f' }}>{formatLeadName(selectedLead)}</div>
                      <div style={{ fontSize:11, color:'#848E9C' }}>{selectedLead.email}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:'#a3adc0', fontWeight:600, textTransform:'uppercase', marginBottom:4 }}>Balances</div>
                      <div style={{ fontSize:12, color:'#e8eefc' }}>
                        {Object.entries(selectedLead.balances || {}).length === 0
                          ? <span style={{ color:'#848E9C' }}>none</span>
                          : Object.entries(selectedLead.balances).map(([k, v]) =>
                              <span key={k} style={{ marginRight:10 }}><strong>{k.toUpperCase()}</strong> {Number(v).toLocaleString(undefined,{maximumFractionDigits:6})}</span>
                            )
                        }
                      </div>
                    </div>
                    {selectedLeadTxns.length > 0 && (
                      <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
                        <span style={{ fontSize:12, color:'#848E9C' }}>{selectedLeadTxns.length} tx</span>
                        <button type="button" onClick={handleClearAll}
                          style={{ padding:'4px 10px', borderRadius:4, fontSize:12, cursor:'pointer', background:'rgba(246,70,93,.15)', color:'#F6465D', border:'1px solid rgba(246,70,93,.3)', fontWeight:600 }}>
                          🗑 Clear All
                        </button>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom:14 }}><label style={labelStyle}>2. Transaction details</label></div>

                  {/* Direction + Affect Balance */}
                  <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
                    <div style={{ display:'flex', gap:8 }}>
                      {[{ val:'credit', label:'+ Credit', color:'#0ECB81' }, { val:'debit', label:'− Debit', color:'#F6465D' }].map(opt => (
                        <button key={opt.val} type="button" onClick={() => setCreateDirection(opt.val)}
                          style={{ padding:'6px 16px', borderRadius:6, fontSize:13, fontWeight:700, cursor:'pointer',
                            border: createDirection === opt.val ? `2px solid ${opt.color}` : '2px solid #444A55',
                            background: createDirection === opt.val ? `rgba(${opt.color === '#0ECB81' ? '14,203,129' : '246,70,93'},.15)` : '#363B44',
                            color: createDirection === opt.val ? opt.color : '#848E9C' }}
                        >{opt.label}</button>
                      ))}
                    </div>
                    <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginLeft:'auto' }}>
                      <div onClick={() => setCreateAffectBal(v => !v)}
                        style={{ width:42, height:24, borderRadius:12, cursor:'pointer', transition:'background .2s', background: createAffectBal ? '#f3ba2f' : '#444A55', position:'relative' }}>
                        <span style={{ position:'absolute', top:3, left: createAffectBal ? 21 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', display:'block' }} />
                      </div>
                      <span style={{ fontSize:12, fontWeight:600, color: createAffectBal ? '#f3ba2f' : '#848E9C' }}>
                        {createAffectBal ? '⚡ Affects balance' : ' Record only'}
                      </span>
                    </label>
                  </div>

                  {createAffectBal && !INJECTABLE_ASSETS.has(createCurrency) && (
                    <div style={{ background:'rgba(246,70,93,.1)', border:'1px solid rgba(246,70,93,.3)', borderRadius:6, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#F6465D' }}>
                      Warning <strong>{createCurrency}</strong> has no balance column - switch to USD/BTC/ETH/USDT/CARD to affect the balance.
                    </div>
                  )}

                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:10, marginBottom:12 }}>
                    <div><label style={labelStyle}>Type</label>
                      <select className="search-dropdown" value={createType} onChange={e => setCreateType(e.target.value)} style={{ width:'100%' }}>
                        {TXN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    {createType === '__custom__' && (
                      <div><label style={labelStyle}>Custom type</label>
                        <input type="text" className="aax-search-input" placeholder="e.g. Bonus..." value={createCustomType} onChange={e => setCreateCustomType(e.target.value)} style={{ width:'100%' }} maxLength={64} />
                      </div>
                    )}
                    <div><label style={labelStyle}>Amount</label>
                      <input type="number" min="0" step="0.0001" className="aax-search-input" placeholder="0.00" value={createAmount} onChange={e => setCreateAmount(e.target.value)} style={{ width:'100%' }} />
                    </div>
                    <div><label style={labelStyle}>Fee (optional)</label>
                      <input type="number" min="0" step="0.0001" className="aax-search-input" placeholder="0.00" value={createFee} onChange={e => setCreateFee(e.target.value)} style={{ width:'100%' }} />
                    </div>
                    <div><label style={labelStyle}>Asset</label>
                      <select className="search-dropdown" value={createCurrency} onChange={e => setCreateCurrency(e.target.value)} style={{ width:'100%' }}>
                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Status</label>
                      <select className="search-dropdown" value={createStatus} onChange={e => setCreateStatus(e.target.value)} style={{ width:'100%' }}>
                        {TXN_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div><label style={labelStyle}>Date &amp; Time</label>
                      <input type="datetime-local" className="aax-search-input" value={createDate} onChange={e => setCreateDate(e.target.value)} style={{ width:'100%' }} />
                    </div>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <label style={labelStyle}>Note / Description (optional)</label>
                    <input type="text" className="aax-search-input" placeholder="Reference or memo..." value={createNote} onChange={e => setCreateNote(e.target.value)} style={{ width:'100%' }} maxLength={500} />
                  </div>
                  {createAmount && parseFloat(createAmount) > 0 && (
                    <div style={{ background:'#363B44', border:'1px solid #444A55', borderRadius:6, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#a3adc0' }}>
                      Preview: {badge(effectiveType || '-', TYPE_BADGE_STYLE(effectiveType))}
                      {' '}<strong style={{ color: createDirection === 'credit' ? '#0ECB81' : '#F6465D' }}>
                        {createDirection === 'credit' ? '+' : '−'}{parseFloat(createAmount).toFixed(4)} {createCurrency}
                      </strong>
                      {parseFloat(createFee) > 0 && <> (fee: {parseFloat(createFee).toFixed(4)} {createCurrency})</>}
                      {' '}→ {badge(createStatus, STATUS_BADGE_STYLE(createStatus))}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
                    <button type="button" onClick={() => { setCreateLeadId(''); setLeadSearch(''); setCreateAmount(''); setCreateFee(''); setCreateNote(''); setCreateCustomType(''); }}
                      style={{ background:'#444A55', color:'#848E9C', border:'none', padding:'8px 14px', borderRadius:4, cursor:'pointer' }}>Reset</button>
                    <button type="button" className="aax-btn-small btn-success" onClick={handleCreateTransaction} disabled={submitting || !createLeadId}
                      style={{ fontWeight:700, padding:'8px 20px', opacity: submitting ? 0.7 : 1 }}>
                      {submitting ? '[pending] Saving...' : 'OK Add Transaction'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Client search ────────────────────────────────────────────── */}
          <div style={{ background:'#2A2E36', border:'1px solid #444A55', borderRadius:10, padding:20, marginBottom: editorClientId ? 16 : 0 }}>
            <h3 style={{ marginTop:0, marginBottom:14, fontSize:'0.95rem', color:'#eaecef' }}>
              Select a client to view and edit their transaction history
            </h3>
            <input type="search" className="aax-search-input"
              placeholder="[search]  Search by name, email, phone..."
              value={editorSearch}
              onChange={e => { setEditorSearch(e.target.value); setEditorClientId(''); setEditingTxId(null); setTxOrderIds(null); }}
              style={{ width:'100%', maxWidth:500, marginBottom:10 }}
            />
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {editorMatchingLeads.length === 0
                ? <span style={{ color:'#848E9C', fontSize:12 }}>No matching clients found.</span>
                : editorMatchingLeads.map(l => (
                  <button key={l.id} type="button" onClick={() => selectEditorClient(l)}
                    style={{ padding:'6px 14px', borderRadius:6, fontSize:13, cursor:'pointer', border:'none', fontWeight: editorClientId === l.id ? 700 : 500,
                      background: editorClientId === l.id ? '#f3ba2f' : '#363B44',
                      color:      editorClientId === l.id ? '#1A1D23' : '#848E9C',
                      display:'flex', flexDirection:'column', alignItems:'flex-start', gap:1, minWidth:120 }}>
                    <span>{formatLeadName(l)}</span>
                    {l.email && <span style={{ fontSize:10, opacity:0.7 }}>{l.email}</span>}
                  </button>
                ))
              }
            </div>
          </div>

          {/* ── Per-client editor ────────────────────────────────────────── */}
          {editorSelectedLead && (
            <>
              {/* Client info bar */}
              <div style={{ background:'#363B44', border:'1px solid #444A55', borderRadius:8, padding:'12px 18px', marginBottom:14, display:'flex', flexWrap:'wrap', gap:24, alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:11, color:'#a3adc0', fontWeight:600, textTransform:'uppercase', marginBottom:3 }}>Editing transactions for</div>
                  <div style={{ fontWeight:700, fontSize:'1.05rem', color:'#f3ba2f' }}>{formatLeadName(editorSelectedLead)}</div>
                  <div style={{ fontSize:12, color:'#848E9C' }}>{editorSelectedLead.email}</div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'#a3adc0', fontWeight:600, textTransform:'uppercase', marginBottom:3 }}>Live Balances</div>
                  <div style={{ fontSize:12, color:'#eaecef', display:'flex', flexWrap:'wrap', gap:12 }}>
                    {Object.entries(editorSelectedLead.balances || {}).length === 0
                      ? <span style={{ color:'#848E9C' }}>none</span>
                      : Object.entries(editorSelectedLead.balances).map(([k,v]) =>
                          <span key={k}><strong style={{ color:'#a3adc0' }}>{k.toUpperCase()}</strong> {Number(v).toLocaleString(undefined,{maximumFractionDigits:6})}</span>
                        )
                    }
                  </div>
                </div>
                <div style={{ marginLeft:'auto', display:'flex', gap:10, alignItems:'center' }}>
                  <span style={{ fontSize:12, color:'#848E9C' }}>{orderedTxns.length} transaction(s)</span>
                  {orderDirty && (
                    <>
                      <button type="button" onClick={handleUndoOrder} disabled={orderSaving}
                        style={{ padding:'6px 14px', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', background:'#363B44', color:'#a3adc0', border:'1px solid #444A55', opacity: orderSaving ? 0.5 : 1 }}>
                        Undo
                      </button>
                      <button type="button" onClick={handleSaveOrder} disabled={orderSaving}
                        style={{ padding:'6px 14px', borderRadius:5, fontSize:12, fontWeight:700, cursor:'pointer', background:'#f3ba2f', color:'#1A1D23', border:'none', opacity: orderSaving ? 0.7 : 1 }}>
                        {orderSaving ? '[pending] Saving...' : '💾 Save Order'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Legend */}
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:10, fontSize:11, color:'#848E9C' }}>
                <span>⠿ Drag rows to reorder - timestamps update automatically on save</span>
                <span> = visible to client</span>
                <span style={{ color:'#F6465D' }}>🚫 = hidden from client</span>
                <span style={{ color:'#F0B90B' }}> = inline edit</span>
              </div>

              {orderedTxns.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:'#848E9C', fontSize:14, background:'#2A2E36', borderRadius:8 }}>
                  No transactions found for this client.
                </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:'#2A2E36', borderBottom:'2px solid #444A55' }}>
                        {['Order','ID','Type','Direction','Amount','Fee','Asset','Status','Date','Visibility','Actions'].map(h => (
                          <th key={h} style={{ padding:'9px 10px', textAlign:'left', fontSize:11, color:'#848E9C', fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewOrderedTxns.map((tx, idx) => {
                        const isEditing  = editingTxId === tx.id;
                        const isCredit   = (tx.amount || 0) >= 0;
                        const isDragging = tx.id === dragTxId;
                        const isDragActive = dragTxId !== null;
                        const rowBg = isDragging
                          ? 'rgba(243,186,47,.12)'
                          : isEditing ? 'rgba(243,186,47,.05)'
                          : tx.hidden ? 'rgba(246,70,93,.04)' : 'transparent';
                        const previewDate = isDragActive ? previewDates[idx] : null;
                        return (
                          <React.Fragment key={tx.id}>
                            {/* ── Transaction row ─────────────────────────── */}
                            <tr
                              draggable
                              onDragStart={e => handleDragStart(e, tx.id)}
                              onDragOver={e => handleDragOver(e, idx)}
                              onDrop={handleDrop}
                              onDragEnd={handleDragEnd}
                              style={{
                                background: rowBg,
                                borderBottom: isDragging ? '2px solid #f3ba2f' : '1px solid #363B44',
                                outline: isDragging ? '2px solid #f3ba2f' : 'none',
                                outlineOffset: '-2px',
                                opacity: tx.hidden && !isDragging ? 0.65 : 1,
                                cursor: 'grab',
                                transition: 'background 0.1s',
                              }}
                            >
                              {/* Drag handle + position */}
                              <td style={{ padding:'6px 8px', whiteSpace:'nowrap', userSelect:'none' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                                  <span style={{ fontSize:15, color: isDragging ? '#f3ba2f' : '#5e6673', lineHeight:1, cursor:'grab' }}>⠿</span>
                                  <span style={{ fontSize:11, color: isDragging ? '#f3ba2f' : '#5e6673', minWidth:18, textAlign:'center', fontFamily:'monospace', fontWeight: isDragging ? 700 : 400 }}>#{idx+1}</span>
                                </div>
                              </td>

                              <td style={{ padding:'8px 10px' }}>
                                {renderTxIdCell(tx.id, showNotification)}
                              </td>
                              <td style={{ padding:'8px 10px' }}>
                                {badge(tx.type || '-', TYPE_BADGE_STYLE(tx.type))}
                              </td>
                              <td style={{ padding:'8px 10px' }}>
                                <span style={{ fontSize:11, fontWeight:700, color: isCredit ? '#0ECB81' : '#F6465D' }}>
                                  {isCredit ? '▲ Credit' : '▼ Debit'}
                                </span>
                              </td>
                              <td style={{ padding:'8px 10px' }}>
                                <span style={{ fontWeight:700, color: isCredit ? '#0ECB81' : '#F6465D', fontSize:13 }}>
                                  {isCredit ? '+' : ''}{(parseFloat(tx.amount)||0).toFixed(4)}
                                </span>
                              </td>
                              <td style={{ padding:'8px 10px', color:'#848E9C', fontSize:12 }}>
                                {tx.feeAmount > 0 ? `-${parseFloat(tx.feeAmount).toFixed(4)}` : '-'}
                              </td>
                              <td style={{ padding:'8px 10px', fontWeight:600, color:'#a3adc0', fontSize:13 }}>{tx.currency || '-'}</td>
                              <td style={{ padding:'8px 10px' }}>
                                {badge(tx.status || '-', STATUS_BADGE_STYLE(tx.status))}
                              </td>
                              <td style={{ padding:'8px 10px', fontSize:11, whiteSpace:'nowrap',
                                color: previewDate ? '#f3ba2f' : '#848E9C' }}>
                                {previewDate
                                  ? previewDate.toLocaleString()
                                  : (tx.date ? new Date(tx.date).toLocaleString() : '-')}
                              </td>

                              {/* Visibility toggle */}
                              <td style={{ padding:'8px 10px' }}>
                                <button type="button" onClick={() => handleToggleHidden(tx)}
                                  title={tx.hidden ? 'Hidden from client - click to show' : 'Visible to client - click to hide'}
                                  style={{ padding:'3px 10px', borderRadius:4, fontSize:12, cursor:'pointer', fontWeight:600, border:'none',
                                    background: tx.hidden ? 'rgba(246,70,93,.15)' : 'rgba(14,203,129,.12)',
                                    color:      tx.hidden ? '#F6465D' : '#0ECB81' }}>
                                  {tx.hidden ? '🚫 Hidden' : ' Visible'}
                                </button>
                              </td>

                              {/* Actions */}
                              <td style={{ padding:'8px 10px' }}>
                                <div style={{ display:'flex', gap:5 }}>
                                  <button type="button" onClick={() => isEditing ? setEditingTxId(null) : openEditForm(tx)}
                                    style={{ padding:'4px 10px', borderRadius:4, fontSize:12, cursor:'pointer', fontWeight:600, border:'none',
                                      background: isEditing ? '#444A55' : 'rgba(243,186,47,.15)',
                                      color:      isEditing ? '#848E9C' : '#f3ba2f' }}>
                                    {isEditing ? '✕ Close' : ' Edit'}
                                  </button>
                                  <button type="button" onClick={() => handleDelete(tx)}
                                    style={{ padding:'4px 9px', borderRadius:4, fontSize:12, cursor:'pointer', fontWeight:600, border:'1px solid rgba(246,70,93,.25)', background:'rgba(246,70,93,.1)', color:'#F6465D' }}>
                                    🗑
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {/* ── Inline edit form ────────────────────────── */}
                            {isEditing && (
                              <tr>
                                <td colSpan={11} style={{ padding:0, background:'#22262E', borderBottom:'2px solid #f3ba2f' }}>
                                  <div style={{ padding:'18px 20px' }}>
                                    <div style={{ fontWeight:700, color:'#f3ba2f', fontSize:13, marginBottom:14, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                                       <span>Editing transaction</span>
                                       {renderTxIdCell(tx.id, showNotification)}
                                    </div>

                                    {/* Direction + balance toggle */}
                                    <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
                                      <div style={{ display:'flex', gap:8 }}>
                                        {[{ val:'credit', label:'+ Credit', color:'#0ECB81' }, { val:'debit', label:'− Debit', color:'#F6465D' }].map(opt => (
                                          <button key={opt.val} type="button" onClick={() => setEditForm(f=>({...f, direction:opt.val}))}
                                            style={{ padding:'5px 14px', borderRadius:6, fontSize:12, fontWeight:700, cursor:'pointer',
                                              border: editForm.direction===opt.val ? `2px solid ${opt.color}` : '2px solid #444A55',
                                              background: editForm.direction===opt.val ? `rgba(${opt.color==='#0ECB81'?'14,203,129':'246,70,93'},.12)` : '#2A2E36',
                                              color: editForm.direction===opt.val ? opt.color : '#848E9C' }}>{opt.label}</button>
                                        ))}
                                      </div>
                                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginLeft:'auto' }}>
                                        <div onClick={() => setEditAffectBal(v=>!v)}
                                          style={{ width:40, height:22, borderRadius:11, cursor:'pointer', transition:'background .2s', background: editAffectBal ? '#f3ba2f' : '#444A55', position:'relative' }}>
                                          <span style={{ position:'absolute', top:2, left: editAffectBal ? 19 : 2, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', display:'block' }} />
                                        </div>
                                        <span style={{ fontSize:12, fontWeight:600, color: editAffectBal ? '#f3ba2f' : '#848E9C' }}>
                                          {editAffectBal ? '⚡ Linked to balance' : ' Record only'}
                                        </span>
                                      </label>
                                    </div>

                                    {editAffectBal && !INJECTABLE_ASSETS.has(editForm.currency) && (
                                      <div style={{ background:'rgba(246,70,93,.08)', border:'1px solid rgba(246,70,93,.25)', borderRadius:6, padding:'7px 11px', marginBottom:10, fontSize:11, color:'#F6465D' }}>
                                        Warning <strong>{editForm.currency}</strong> has no balance column - switch to USD/BTC/ETH/USDT/CARD.
                                      </div>
                                    )}

                                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(145px, 1fr))', gap:10, marginBottom:10 }}>
                                      <div><label style={labelStyle}>Type</label>
                                        <select className="search-dropdown" value={editForm.type} onChange={e => setEditForm(f=>({...f, type:e.target.value}))} style={{ width:'100%' }}>
                                          {TXN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                      </div>
                                      {editForm.type === '__custom__' && (
                                        <div><label style={labelStyle}>Custom type</label>
                                          <input type="text" className="aax-search-input" placeholder="e.g. Bonus..." value={editForm.customType||''} onChange={e => setEditForm(f=>({...f, customType:e.target.value}))} style={{ width:'100%' }} maxLength={64} />
                                        </div>
                                      )}
                                      <div><label style={labelStyle}>Amount</label>
                                        <input type="number" min="0" step="0.0001" className="aax-search-input" value={editForm.amount||''} onChange={e => setEditForm(f=>({...f, amount:e.target.value}))} style={{ width:'100%' }} />
                                      </div>
                                      <div><label style={labelStyle}>Fee (optional)</label>
                                        <input type="number" min="0" step="0.0001" className="aax-search-input" placeholder="0.00" value={editForm.fee||''} onChange={e => setEditForm(f=>({...f, fee:e.target.value}))} style={{ width:'100%' }} />
                                      </div>
                                      <div><label style={labelStyle}>Asset</label>
                                        <select className="search-dropdown" value={editForm.currency||'USD'} onChange={e => setEditForm(f=>({...f, currency:e.target.value}))} style={{ width:'100%' }}>
                                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                      </div>
                                      <div><label style={labelStyle}>Status</label>
                                        <select className="search-dropdown" value={editForm.status||'Completed'} onChange={e => setEditForm(f=>({...f, status:e.target.value}))} style={{ width:'100%' }}>
                                          {TXN_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                      </div>
                                      <div><label style={labelStyle}>Date &amp; Time</label>
                                        <input type="datetime-local" className="aax-search-input" value={editForm.date||''} onChange={e => setEditForm(f=>({...f, date:e.target.value}))} style={{ width:'100%' }} />
                                      </div>
                                    </div>

                                    <div style={{ marginBottom:12 }}>
                                      <label style={labelStyle}>Note / Description (optional)</label>
                                      <input type="text" className="aax-search-input" placeholder="Reference, memo..." value={editForm.description||''} onChange={e => setEditForm(f=>({...f, description:e.target.value}))} style={{ width:'100%' }} maxLength={500} />
                                    </div>

                                    {/* Balance impact preview */}
                                    {editAffectBal && INJECTABLE_ASSETS.has(editForm.currency) && parseFloat(editForm.amount) > 0 && (() => {
                                      const ns = editForm.direction==='debit' ? -Math.abs(parseFloat(editForm.amount)) : Math.abs(parseFloat(editForm.amount));
                                      const os = parseFloat(tx.amount) || 0;
                                      const delta = editForm.currency===(tx.currency||'').toUpperCase() ? ns-os : ns;
                                      if (delta===0) return null;
                                      return (
                                        <div style={{ background:'rgba(243,186,47,.07)', border:'1px solid rgba(243,186,47,.25)', borderRadius:6, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#a3adc0' }}>
                                          ⚡ Balance will be adjusted by{' '}
                                          <strong style={{ color: delta>0 ? '#0ECB81' : '#F6465D' }}>
                                            {delta>0?'+':''}{delta.toFixed(4)} {editForm.currency}
                                          </strong>
                                        </div>
                                      );
                                    })()}

                                    <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                                      <button type="button" onClick={() => setEditingTxId(null)}
                                        style={{ padding:'7px 16px', borderRadius:5, fontSize:12, cursor:'pointer', background:'#444A55', color:'#848E9C', border:'none', fontWeight:600 }}>Cancel</button>
                                      <button type="button" onClick={() => handleEditSave(tx)} disabled={editSubmitting}
                                        style={{ padding:'7px 20px', borderRadius:5, fontSize:12, cursor: editSubmitting?'default':'pointer', fontWeight:700, background:'#f3ba2f', color:'#1A1D23', border:'none', opacity: editSubmitting?0.7:1 }}>
                                        {editSubmitting ? '[pending] Saving...' : '💾 Save Changes'}
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Unsaved order banner */}
              {orderDirty && (
                <div style={{ marginTop:12, background:'rgba(243,186,47,.1)', border:'1px solid rgba(243,186,47,.35)', borderRadius:7, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                  <span style={{ fontSize:13, color:'#f3ba2f' }}>Warning Order has been changed - click <strong>Save Order</strong> to persist it to the database.</span>
                  <div style={{ display:'flex', gap:8 }}>
                    <button type="button" onClick={() => { setTxOrderIds(null); setOrderDirty(false); }}
                      style={{ padding:'5px 12px', borderRadius:4, fontSize:12, cursor:'pointer', background:'#444A55', color:'#848E9C', border:'none' }}>Discard</button>
                    <button type="button" onClick={handleSaveOrder} disabled={orderSaving}
                      style={{ padding:'5px 14px', borderRadius:4, fontSize:12, cursor:'pointer', fontWeight:700, background:'#f3ba2f', color:'#1A1D23', border:'none', opacity: orderSaving?0.7:1 }}>
                      {orderSaving ? '[pending] Saving...' : '💾 Save Order'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!editorClientId && (
            <div style={{ textAlign:'center', padding:'48px 20px', color:'#5e6673', fontSize:14 }}>
              Search and select a client above to edit their transactions
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Transactions;
