import React, { useState, useEffect, useRef, useCallback } from 'react';
import ConfirmModal from '../ConfirmModal';
import {
  sendClientNotificationApi,
  searchClientUsersForNotify,
  getNotificationSentLog,
  recallNotificationApi,
  clearNotificationsSentLogApi,
  clearUserNotificationsApi,
  getUserNotificationsForAdminApi,
  deleteClientNotificationsApi,
} from '../../adminApi';

const KIND_OPTIONS = [
  { value: 'info',        label: '💬 Info',                color: '#848E9C' },
  { value: 'system',      label: '⚙ System',              color: '#F0B90B' },
  { value: 'transaction', label: '💸 Transaction',          color: '#0ECB81' },
  { value: 'security',    label: '🔒 Security',             color: '#F6465D' },
  { value: 'warning',     label: 'Warning Warning',             color: '#FF9F0A' },
  { value: 'blocked',     label: '🚫 Blocked Transaction',  color: '#F6465D' },
  { value: 'failed',      label: 'Error Failed Transaction',   color: '#CF304A' },
];

const KIND_MAP = {
  info:        { icon: '💬', color: '#848E9C', label: 'Info' },
  system:      { icon: '⚙',  color: '#F0B90B', label: 'System' },
  transaction: { icon: '💸', color: '#0ECB81', label: 'Transaction' },
  security:    { icon: '🔒', color: '#F6465D', label: 'Security' },
  warning:     { icon: 'Warning', color: '#FF9F0A', label: 'Warning' },
  blocked:     { icon: '🚫', color: '#F6465D', label: 'Blocked Transaction' },
  failed:      { icon: 'Error', color: '#CF304A', label: 'Failed Transaction' },
};

const s = {
  wrap:        { width: '100%' },
  section:     { background: '#2B3139', border: '1px solid #444A55', borderRadius: 10, padding: '20px 22px', marginBottom: 20 },
  sectionHead: { fontSize: 15, fontWeight: 700, color: '#EAECEF', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 },
  label:       { display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 5, fontWeight: 600 },
  input:       { width: '100%', background: '#363B44', border: '1px solid #444A55', borderRadius: 6, padding: '8px 12px', color: '#EAECEF', fontSize: 13, outline: 'none', boxSizing: 'border-box' },
  textarea:    { width: '100%', background: '#363B44', border: '1px solid #444A55', borderRadius: 6, padding: '8px 12px', color: '#EAECEF', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 90, boxSizing: 'border-box', fontFamily: 'inherit' },
  sendBtn: (disabled) => ({
    marginTop: 14, padding: '10px 22px',
    background: disabled ? '#363B44' : '#F0B90B',
    color: disabled ? '#555' : '#1A1D23',
    border: 'none', borderRadius: 7, fontWeight: 700,
    fontSize: 13, cursor: disabled ? 'not-allowed' : 'pointer', width: '100%',
  }),
  pill:   { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#363B44', border: '1px solid #444A55', borderRadius: 20, padding: '4px 10px', fontSize: 12, color: '#EAECEF' },
  pillX:  { background: 'none', border: 'none', color: '#848E9C', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' },
  ddWrap: { position: 'relative' },
  ddList: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#2B3139', border: '1px solid #444A55', borderRadius: 7, zIndex: 99, maxHeight: 200, overflowY: 'auto', marginTop: 2 },
  ddItem: { padding: '9px 12px', cursor: 'pointer', fontSize: 13, color: '#EAECEF', borderBottom: '1px solid #363B44' },
};

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function fmt(ts) {
  if (!ts) return '-';
  try { return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return ts; }
}

// ---------------------------------------------------------------------------
// Compose panel
// ---------------------------------------------------------------------------
const Compose = ({ onSent }) => {
  const [recipientMode, setRecipientMode] = useState('all');
  const [search, setSearch]               = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUser, setSelectedUser]   = useState(null);
  const [showDD, setShowDD]               = useState(false);
  const [kind, setKind]                   = useState('info');
  const [message, setMessage]             = useState('');
  const [busy, setBusy]                   = useState(false);
  const [result, setResult]               = useState(null);
  const ddRef = useRef(null);
  const debouncedSearch = useDebounce(search, 280);

  useEffect(() => {
    if (recipientMode !== 'specific' || debouncedSearch.length < 1) { setSearchResults([]); return; }
    searchClientUsersForNotify(debouncedSearch).then(setSearchResults);
  }, [debouncedSearch, recipientMode]);

  useEffect(() => {
    const h = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setShowDD(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selectUser = (u) => { setSelectedUser(u); setSearch(''); setSearchResults([]); setShowDD(false); };
  const clearUser  = ()  => { setSelectedUser(null); setSearch(''); };

  const handleSend = async () => {
    if (!message.trim()) return;
    if (recipientMode === 'specific' && !selectedUser) return;
    setBusy(true); setResult(null);
    try {
      const res = await sendClientNotificationApi({
        userId:  recipientMode === 'specific' ? selectedUser.id : null,
        message: message.trim(),
        kind,
      });
      setResult({ ok: true, sent: res.sent });
      setMessage('');
      if (recipientMode === 'specific') clearUser();
      if (onSent) onSent();
    } catch (err) {
      setResult({ error: err.message || 'Failed to send notification.' });
    } finally {
      setBusy(false);
    }
  };

  const canSend = !busy && message.trim().length > 0 && (recipientMode === 'all' || selectedUser);

  return (
    <div style={s.section}>
      <div style={s.sectionHead}><span>[upload]</span> Send Notification to Client</div>

      <div style={{ marginBottom: 14 }}>
        <label style={s.label}>Recipient</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['all', 'specific'].map(mode => (
            <button key={mode}
              onClick={() => { setRecipientMode(mode); clearUser(); setResult(null); }}
              style={{
                padding: '7px 18px', borderRadius: 6, border: '1.5px solid',
                borderColor: recipientMode === mode ? '#F0B90B' : '#444A55',
                background:  recipientMode === mode ? '#F0B90B22' : '#363B44',
                color:       recipientMode === mode ? '#F0B90B' : '#848E9C',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              {mode === 'all' ? '📢 All Clients' : '[user] Specific Client'}
            </button>
          ))}
        </div>
      </div>

      {recipientMode === 'specific' && (
        <div style={{ marginBottom: 14 }}>
          <label style={s.label}>Search Client</label>
          {selectedUser ? (
            <div style={s.pill}>
              <span style={{ fontWeight: 600 }}>{selectedUser.name || selectedUser.email}</span>
              <span style={{ color: '#848E9C', fontSize: 11 }}>{selectedUser.email}</span>
              <button style={s.pillX} onClick={clearUser} title="Remove">✕</button>
            </div>
          ) : (
            <div style={s.ddWrap} ref={ddRef}>
              <input style={s.input} placeholder="Type name or email..." value={search}
                onChange={e => { setSearch(e.target.value); setShowDD(true); }}
                onFocus={() => setShowDD(true)} />
              {showDD && searchResults.length > 0 && (
                <div style={s.ddList}>
                  {searchResults.map(u => (
                    <div key={u.id} style={s.ddItem}
                      onMouseDown={() => selectUser(u)}
                      onMouseEnter={e => e.currentTarget.style.background = '#363B44'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontWeight: 600 }}>{u.name || '(no name)'}</span>
                      <span style={{ color: '#848E9C', marginLeft: 8, fontSize: 12 }}>{u.email}</span>
                    </div>
                  ))}
                </div>
              )}
              {showDD && search.length > 0 && searchResults.length === 0 && (
                <div style={s.ddList}>
                  <div style={{ ...s.ddItem, color: '#848E9C' }}>No clients found.</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <label style={s.label}>Notification Type</label>
        <select
          value={kind}
          onChange={e => setKind(e.target.value)}
          style={{
            width: '100%', background: '#363B44', border: '1px solid #444A55',
            borderRadius: 6, padding: '8px 12px', color: '#EAECEF',
            fontSize: 13, outline: 'none', cursor: 'pointer',
            appearance: 'none', WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path fill='%23848E9C' d='M5 7L1 3h8z'/></svg>")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
            paddingRight: 30,
          }}
        >
          {KIND_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 4 }}>
        <label style={s.label}>
          Message
          <span style={{ float: 'right', fontWeight: 400 }}>{message.length}/1000</span>
        </label>
        <textarea style={s.textarea} placeholder="Write your notification message here..."
          value={message} onChange={e => setMessage(e.target.value.slice(0, 1000))} />
      </div>

      {result && (
        <div style={{
          marginTop: 8, padding: '9px 12px', borderRadius: 7, fontSize: 13,
          background: result.ok ? '#0ECB8122' : '#F6465D22',
          border: `1px solid ${result.ok ? '#0ECB8144' : '#F6465D44'}`,
          color: result.ok ? '#0ECB81' : '#F6465D',
        }}>
          {result.ok
            ? `✓ Notification sent to ${result.sent} client${result.sent !== 1 ? 's' : ''}.`
            : `✗ ${result.error}`}
        </div>
      )}

      <button style={s.sendBtn(!canSend)} onClick={handleSend} disabled={!canSend}>
        {busy ? 'Sending...' : 'Send Notification'}
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Recall button - per-row inline confirm + feedback
// ---------------------------------------------------------------------------
const RecallButton = ({ row, onRecalled }) => {
  const [phase, setPhase]   = useState('idle'); // 'idle' | 'confirm' | 'busy' | 'done' | 'error'
  const [info, setInfo]     = useState(null);   // { recalled, already_read } | error string
  const isRecalled = row.recalled_at !== null && row.recalled_at !== undefined;

  if (isRecalled) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 12,
        background: '#84848C22', border: '1px solid #84848C44',
        color: '#848E9C', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      }}>
        Recalled
        {row.recalled_count != null && (
          <span style={{ color: '#666' }}>({row.recalled_count})</span>
        )}
      </span>
    );
  }

  if (phase === 'done') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 9px', borderRadius: 12,
        background: '#F0B90B22', border: '1px solid #F0B90B44',
        color: '#F0B90B', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
      }} title={info ? `${info.already_read} already read` : ''}>
        Recalled {info?.recalled != null ? `(${info.recalled})` : ''}
      </span>
    );
  }

  if (phase === 'error') {
    return (
      <span style={{ color: '#F6465D', fontSize: 11, whiteSpace: 'nowrap' }}
        title={typeof info === 'string' ? info : ''}>
        ✗ Failed
        <button onClick={() => setPhase('idle')}
          style={{ marginLeft: 5, background: 'none', border: 'none', color: '#848E9C', cursor: 'pointer', fontSize: 11 }}>
          retry
        </button>
      </span>
    );
  }

  if (phase === 'busy') {
    return <span style={{ color: '#848E9C', fontSize: 11 }}>Recalling...</span>;
  }

  if (phase === 'confirm') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
        <button
          onClick={async (e) => {
            e.stopPropagation();
            setPhase('busy');
            try {
              const res = await recallNotificationApi(row.id);
              setInfo({ recalled: res.recalled, already_read: res.already_read });
              setPhase('done');
              if (onRecalled) onRecalled(row.id, res);
            } catch (err) {
              setInfo(err.message || 'Failed.');
              setPhase('error');
            }
          }}
          style={{ padding: '2px 8px', background: '#F6465D', color: '#fff', border: 'none', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
        >
          Confirm
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setPhase('idle'); }}
          style={{ padding: '2px 7px', background: '#363B44', color: '#848E9C', border: '1px solid #444A55', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}
        >
          ✕
        </button>
      </span>
    );
  }

  // idle
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setPhase('confirm'); }}
      title="Remove this notification from all unread client inboxes"
      style={{
        padding: '3px 10px', background: 'transparent',
        border: '1px solid #F6465D55', borderRadius: 6,
        color: '#F6465D', fontSize: 11, fontWeight: 600,
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'all .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#F6465D22'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      Recall
    </button>
  );
};

// ---------------------------------------------------------------------------
// Sent History panel
// ---------------------------------------------------------------------------
const PAGE_SIZE = 20;

const SentHistory = ({ refreshKey }) => {
  const [log, setLog]           = useState([]);
  const [total, setTotal]       = useState(0);
  const [offset, setOffset]     = useState(0);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [confirm,  setConfirm]  = useState(null);

  const load = useCallback(async (off = 0) => {
    setLoading(true); setError('');
    try {
      const res = await getNotificationSentLog({ limit: PAGE_SIZE, offset: off });
      setLog(res.log);
      setTotal(res.total);
      setOffset(off);
    } catch (e) {
      setError(e.message || 'Failed to load history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(0); }, [load, refreshKey]);

  const handleClearAll = () => {
    setConfirm({
      message: 'Clear the entire notifications sent history? This cannot be undone.',
      onConfirm: async () => {
        setConfirm(null);
        setClearing(true);
        try {
          await clearNotificationsSentLogApi();
          setLog([]);
          setTotal(0);
        } catch (err) {
          setError(err.message || 'Failed to clear history.');
        } finally {
          setClearing(false);
        }
      },
    });
  };

  // After a recall completes, update the row in local state without a full reload.
  const handleRecalled = useCallback((rowId, res) => {
    const now = new Date().toISOString();
    setLog(prev => prev.map(r =>
      r.id === rowId
        ? { ...r, recalled_at: now, recalled_count: res.recalled }
        : r
    ));
  }, []);

  const totalPages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  // Column layout: type | message | recipient | sent-by | timestamp | reached | recall
  const cols = '108px 1fr 140px 90px 110px 50px 110px';

  return (
    <div style={s.section}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={s.sectionHead}>
          <span>[list]</span> Sent Notifications History
          {total > 0 && (
            <span style={{ fontSize: 12, fontWeight: 400, color: '#848E9C', marginLeft: 4 }}>
              ({total} total)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {total > 0 && (
            <button onClick={handleClearAll} disabled={clearing || loading}
              style={{ padding: '5px 13px', background: 'rgba(246,70,93,0.12)', color: '#F6465D', border: '1px solid #F6465D55', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: clearing ? 'not-allowed' : 'pointer' }}>
              {clearing ? 'Clearing...' : '🗑 Clear All'}
            </button>
          )}
          <button onClick={() => load(offset)} disabled={loading}
            style={{ padding: '5px 13px', background: '#363B44', color: '#848E9C', border: '1px solid #444A55', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            {loading ? '...' : '↺ Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 12px', background: '#F6465D22', border: '1px solid #F6465D44', borderRadius: 7, color: '#F6465D', fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!loading && log.length === 0 && !error && (
        <div style={{ textAlign: 'center', color: '#848E9C', padding: '30px 0' }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
          <div style={{ fontSize: 13 }}>No notifications have been sent yet.</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Use the composer above to send your first one.</div>
        </div>
      )}

      {loading && log.length === 0 && (
        <div style={{ textAlign: 'center', color: '#848E9C', padding: '24px 0', fontSize: 13 }}>Loading...</div>
      )}

      {log.length > 0 && (
        <>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: cols,
            gap: 8, padding: '6px 10px',
            borderBottom: '1px solid #444A55',
            fontSize: 11, color: '#848E9C', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <div>Type</div>
            <div>Message</div>
            <div>Recipient</div>
            <div>Sent by</div>
            <div>Timestamp</div>
            <div style={{ textAlign: 'center' }}>Sent</div>
            <div style={{ textAlign: 'right' }}>Action</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {log.map((row) => {
              const k = KIND_MAP[row.kind] || KIND_MAP.info;
              const isExpanded = expanded === row.id;
              const isRecalled = row.recalled_at !== null && row.recalled_at !== undefined;
              const preview = row.message.length > 55 ? row.message.slice(0, 55) + '...' : row.message;
              const recipientLabel = row.is_broadcast === 1 || row.is_broadcast === '1'
                ? '📢 All Clients'
                : (row.user_name || row.user_email || row.user_id || '-');

              return (
                <div key={row.id} style={{ opacity: isRecalled ? 0.65 : 1, transition: 'opacity .2s' }}>
                  <div
                    onClick={() => setExpanded(isExpanded ? null : row.id)}
                    style={{
                      display: 'grid', gridTemplateColumns: cols,
                      gap: 8, padding: '10px 10px',
                      borderBottom: '1px solid #363B44',
                      cursor: 'pointer',
                      background: isExpanded ? '#363B44' : 'transparent',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = '#2f3540'; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Kind badge */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 12,
                        background: `${k.color}22`, color: k.color,
                        fontSize: 11, fontWeight: 600, border: `1px solid ${k.color}44`,
                        whiteSpace: 'nowrap',
                      }}>
                        {k.icon} {k.label}
                      </span>
                    </div>

                    {/* Message preview */}
                    <div style={{ color: '#EAECEF', fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {preview}
                      </span>
                      {row.message.length > 55 && (
                        <span style={{ color: '#848E9C', fontSize: 11, flexShrink: 0 }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      )}
                    </div>

                    {/* Recipient */}
                    <div style={{
                      fontSize: 12,
                      color: row.is_broadcast === 1 || row.is_broadcast === '1' ? '#F0B90B' : '#EAECEF',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      display: 'flex', alignItems: 'center',
                    }}>
                      {recipientLabel}
                    </div>

                    {/* Admin */}
                    <div style={{ fontSize: 12, color: '#848E9C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                      {row.admin_name || '-'}
                    </div>

                    {/* Timestamp */}
                    <div style={{ fontSize: 11, color: '#848E9C', display: 'flex', alignItems: 'center' }}>
                      {fmt(row.created_at)}
                    </div>

                    {/* Recipient count */}
                    <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#0ECB81', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {row.recipient_count}
                    </div>

                    {/* Recall action - stops row expand click */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}
                      onClick={e => e.stopPropagation()}>
                      <RecallButton row={row} onRecalled={handleRecalled} />
                    </div>
                  </div>

                  {/* Expanded detail panel */}
                  {isExpanded && (
                    <div style={{
                      padding: '12px 14px 14px',
                      background: '#363B44',
                      borderBottom: '1px solid #444A55',
                      borderLeft: `3px solid ${k.color}`,
                    }}>
                      <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Full Message
                      </div>
                      <div style={{ color: '#EAECEF', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {row.message}
                      </div>

                      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                        {(row.is_broadcast !== 1 && row.is_broadcast !== '1') && row.user_email && (
                          <div style={{ fontSize: 12, color: '#848E9C' }}>
                            Sent to: <span style={{ color: '#EAECEF' }}>
                              {row.user_name ? `${row.user_name} (${row.user_email})` : row.user_email}
                            </span>
                          </div>
                        )}
                        {isRecalled && (
                          <div style={{ fontSize: 12, color: '#848E9C' }}>
                            Recalled at: <span style={{ color: '#EAECEF' }}>{fmt(row.recalled_at)}</span>
                            {row.recalled_count != null && (
                              <span style={{ marginLeft: 6 }}>
                                - removed from <span style={{ color: '#F0B90B' }}>{row.recalled_count}</span> unread inbox{row.recalled_count !== 1 ? 'es' : ''}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Recall action inside expanded panel too */}
                      {!isRecalled && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #444A55', display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 12, color: '#848E9C' }}>Recall this notification from all unread inboxes:</span>
                          <RecallButton row={row} onRecalled={handleRecalled} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, paddingTop: 12, borderTop: '1px solid #363B44' }}>
              <button
                onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0 || loading}
                style={{ padding: '6px 16px', background: '#363B44', color: offset === 0 ? '#555' : '#EAECEF', border: '1px solid #444A55', borderRadius: 6, fontSize: 12, cursor: offset === 0 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <span style={{ fontSize: 12, color: '#848E9C' }}>
                Page {currentPage} of {totalPages} &nbsp; / &nbsp; {total} entries
              </span>
              <button
                onClick={() => load(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || loading}
                style={{ padding: '6px 16px', background: '#363B44', color: offset + PAGE_SIZE >= total ? '#555' : '#EAECEF', border: '1px solid #444A55', borderRadius: 6, fontSize: 12, cursor: offset + PAGE_SIZE >= total ? 'not-allowed' : 'pointer' }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          confirmLabel="Clear All"
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// WipeUserNotifications - Super Admin section to clear a user's full inbox
// ---------------------------------------------------------------------------
const WipeUserNotifications = () => {
  const [search, setSearch]             = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDD, setShowDD]             = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [busy, setBusy]                 = useState(false);
  const [result, setResult]             = useState(null);
  const ddRef = useRef(null);
  const debouncedSearch = useDebounce(search, 280);

  useEffect(() => {
    if (debouncedSearch.length < 1) { setSearchResults([]); return; }
    searchClientUsersForNotify(debouncedSearch).then(setSearchResults);
  }, [debouncedSearch]);

  useEffect(() => {
    const h = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setShowDD(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selectUser = (u) => { setSelectedUser(u); setSearch(''); setSearchResults([]); setShowDD(false); setResult(null); };
  const clearUser  = ()  => { setSelectedUser(null); setSearch(''); setResult(null); };

  const handleWipe = async () => {
    if (!selectedUser || busy) return;
    const confirmed = window.confirm(
      `Permanently delete ALL notifications for ${selectedUser.name || selectedUser.email}? This cannot be undone.`
    );
    if (!confirmed) return;
    setBusy(true); setResult(null);
    try {
      const res = await clearUserNotificationsApi(selectedUser.id);
      setResult({ ok: true, deleted: res.deleted ?? 0, userName: selectedUser.name || selectedUser.email });
      clearUser();
    } catch (err) {
      setResult({ error: err.message || 'Failed to clear notifications.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...s.section, borderColor: '#F6465D44' }}>
      <div style={s.sectionHead}><span>🗑</span> Wipe User Notifications</div>
      <p style={{ fontSize: 12, color: '#848E9C', margin: '0 0 14px' }}>
        Permanently deletes every notification from a specific user's inbox, leaving it completely empty.
      </p>

      <div style={{ marginBottom: 14 }}>
        <label style={s.label}>Select Client</label>
        {selectedUser ? (
          <div style={s.pill}>
            <span style={{ fontWeight: 600 }}>{selectedUser.name || selectedUser.email}</span>
            <span style={{ color: '#848E9C', fontSize: 11 }}>{selectedUser.email}</span>
            <button style={s.pillX} onClick={clearUser} title="Remove">✕</button>
          </div>
        ) : (
          <div style={s.ddWrap} ref={ddRef}>
            <input
              style={s.input}
              placeholder="Type name or email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDD(true); }}
              onFocus={() => setShowDD(true)}
            />
            {showDD && searchResults.length > 0 && (
              <div style={s.ddList}>
                {searchResults.map(u => (
                  <div key={u.id} style={s.ddItem}
                    onMouseDown={() => selectUser(u)}
                    onMouseEnter={e => e.currentTarget.style.background = '#363B44'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 600 }}>{u.name || '(no name)'}</span>
                    <span style={{ color: '#848E9C', marginLeft: 8, fontSize: 12 }}>{u.email}</span>
                  </div>
                ))}
              </div>
            )}
            {showDD && search.length > 0 && searchResults.length === 0 && (
              <div style={s.ddList}>
                <div style={{ ...s.ddItem, color: '#848E9C' }}>No clients found.</div>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleWipe}
        disabled={!selectedUser || busy}
        style={{
          padding: '10px 22px',
          background: (!selectedUser || busy) ? '#363B44' : 'rgba(246,70,93,0.15)',
          color: (!selectedUser || busy) ? '#555' : '#F6465D',
          border: '1px solid',
          borderColor: (!selectedUser || busy) ? '#444A55' : '#F6465D88',
          borderRadius: 7, fontWeight: 700, fontSize: 13,
          cursor: (!selectedUser || busy) ? 'not-allowed' : 'pointer',
          width: '100%',
        }}
      >
        {busy ? 'Clearing...' : '🗑 Wipe All Notifications'}
      </button>

      {result?.ok && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: '#0ECB8122', border: '1px solid #0ECB8144', borderRadius: 7, color: '#0ECB81', fontSize: 13 }}>
          OK Cleared <strong>{result.deleted}</strong> notification{result.deleted !== 1 ? 's' : ''} from {result.userName}'s inbox.
        </div>
      )}
      {result?.error && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: '#F6465D22', border: '1px solid #F6465D44', borderRadius: 7, color: '#F6465D', fontSize: 13 }}>
          ⚠ {result.error}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// BrowseDeleteNotifications - browse a client's inbox and delete selectively
// ---------------------------------------------------------------------------
const BrowseDeleteNotifications = () => {
  const [search, setSearch]             = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDD, setShowDD]             = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [loadError, setLoadError]       = useState('');
  const [selected, setSelected]         = useState(new Set());
  const [expanded, setExpanded]         = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [result, setResult]             = useState(null);
  const [confirm, setConfirm]           = useState(null);
  const ddRef = useRef(null);
  const debouncedSearch = useDebounce(search, 280);

  useEffect(() => {
    if (debouncedSearch.length < 1) { setSearchResults([]); return; }
    searchClientUsersForNotify(debouncedSearch).then(setSearchResults);
  }, [debouncedSearch]);

  useEffect(() => {
    const h = (e) => { if (ddRef.current && !ddRef.current.contains(e.target)) setShowDD(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const loadNotifications = useCallback(async (user) => {
    if (!user) return;
    setLoading(true); setLoadError(''); setResult(null); setSelected(new Set()); setExpanded(null);
    try {
      const res = await getUserNotificationsForAdminApi(user.id);
      setNotifications(res.notifications || []);
    } catch (e) {
      setLoadError(e.message || 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  const selectUser = (u) => {
    setSelectedUser(u); setSearch(''); setSearchResults([]); setShowDD(false);
    setNotifications([]); setSelected(new Set()); setResult(null);
    loadNotifications(u);
  };
  const clearUser = () => {
    setSelectedUser(null); setSearch(''); setNotifications([]);
    setSelected(new Set()); setExpanded(null); setResult(null); setLoadError('');
  };

  const allIds      = notifications.map(n => n.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (!selectedUser || selected.size === 0 || deleting) return;
    const ids = [...selected];
    const label = ids.length === 1 ? '1 notification' : `${ids.length} notifications`;
    setConfirm({
      message: `Permanently delete ${label} from ${selectedUser.name || selectedUser.email}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null);
        setDeleting(true); setResult(null);
        try {
          const res = await deleteClientNotificationsApi(selectedUser.id, ids);
          setNotifications(prev => prev.filter(n => !selected.has(n.id)));
          setSelected(new Set());
          setResult({ ok: true, deleted: res.deleted });
        } catch (err) {
          setResult({ error: err.message || 'Failed to delete.' });
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  const handleDeleteAll = () => {
    if (!selectedUser || notifications.length === 0 || deleting) return;
    const count = notifications.length;
    setConfirm({
      message: `Permanently delete ALL ${count} notification${count !== 1 ? 's' : ''} from ${selectedUser.name || selectedUser.email}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirm(null);
        setDeleting(true); setResult(null);
        try {
          const ids = notifications.map(n => n.id);
          const res = await deleteClientNotificationsApi(selectedUser.id, ids);
          setNotifications([]);
          setSelected(new Set());
          setResult({ ok: true, deleted: res.deleted });
        } catch (err) {
          setResult({ error: err.message || 'Failed to delete.' });
        } finally {
          setDeleting(false);
        }
      },
    });
  };

  return (
    <div style={{ ...s.section, borderColor: '#363B44' }}>
      <div style={s.sectionHead}><span>[search]</span> Browse &amp; Delete Client Notifications</div>
      <p style={{ fontSize: 12, color: '#848E9C', margin: '0 0 14px' }}>
        View a client's notification inbox and delete individual, selected, or all notifications.
      </p>

      {/* User picker */}
      <div style={{ marginBottom: 14 }}>
        <label style={s.label}>Select Client</label>
        {selectedUser ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={s.pill}>
              <span style={{ fontWeight: 600 }}>{selectedUser.name || selectedUser.email}</span>
              <span style={{ color: '#848E9C', fontSize: 11 }}>{selectedUser.email}</span>
              <button style={s.pillX} onClick={clearUser} title="Remove">✕</button>
            </div>
            <button
              onClick={() => loadNotifications(selectedUser)}
              disabled={loading}
              style={{ padding: '4px 12px', background: '#363B44', color: '#848E9C', border: '1px solid #444A55', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
            >
              {loading ? '...' : '↺ Refresh'}
            </button>
          </div>
        ) : (
          <div style={s.ddWrap} ref={ddRef}>
            <input
              style={s.input}
              placeholder="Type name or email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setShowDD(true); }}
              onFocus={() => setShowDD(true)}
            />
            {showDD && searchResults.length > 0 && (
              <div style={s.ddList}>
                {searchResults.map(u => (
                  <div key={u.id} style={s.ddItem}
                    onMouseDown={() => selectUser(u)}
                    onMouseEnter={e => e.currentTarget.style.background = '#363B44'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontWeight: 600 }}>{u.name || '(no name)'}</span>
                    <span style={{ color: '#848E9C', marginLeft: 8, fontSize: 12 }}>{u.email}</span>
                  </div>
                ))}
              </div>
            )}
            {showDD && search.length > 0 && searchResults.length === 0 && (
              <div style={s.ddList}>
                <div style={{ ...s.ddItem, color: '#848E9C' }}>No clients found.</div>
              </div>
            )}
          </div>
        )}
      </div>

      {loadError && (
        <div style={{ padding: '10px 12px', background: '#F6465D22', border: '1px solid #F6465D44', borderRadius: 7, color: '#F6465D', fontSize: 13, marginBottom: 10 }}>
          {loadError}
        </div>
      )}

      {result?.ok && (
        <div style={{ padding: '10px 14px', background: '#0ECB8122', border: '1px solid #0ECB8144', borderRadius: 7, color: '#0ECB81', fontSize: 13, marginBottom: 10 }}>
          OK Deleted <strong>{result.deleted}</strong> notification{result.deleted !== 1 ? 's' : ''}.
        </div>
      )}
      {result?.error && (
        <div style={{ padding: '10px 14px', background: '#F6465D22', border: '1px solid #F6465D44', borderRadius: 7, color: '#F6465D', fontSize: 13, marginBottom: 10 }}>
          ⚠ {result.error}
        </div>
      )}

      {selectedUser && !loading && notifications.length === 0 && !loadError && (
        <div style={{ textAlign: 'center', color: '#848E9C', padding: '24px 0' }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>📭</div>
          <div style={{ fontSize: 13 }}>This client has no notifications.</div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', color: '#848E9C', padding: '20px 0', fontSize: 13 }}>Loading...</div>
      )}

      {!loading && notifications.length > 0 && (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#EAECEF', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#F0B90B' }}
                />
                {allSelected ? 'Deselect All' : `Select All (${notifications.length})`}
              </label>
              {someSelected && (
                <span style={{ fontSize: 11, color: '#848E9C' }}>
                  {selected.size} selected
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDeleteSelected}
                disabled={!someSelected || deleting}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: '1px solid',
                  borderColor: someSelected && !deleting ? '#F6465D88' : '#444A55',
                  background: someSelected && !deleting ? 'rgba(246,70,93,0.12)' : '#363B44',
                  color: someSelected && !deleting ? '#F6465D' : '#555',
                  fontSize: 12, fontWeight: 600,
                  cursor: someSelected && !deleting ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                }}
              >
                🗑 Delete Selected{someSelected ? ` (${selected.size})` : ''}
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={deleting}
                style={{
                  padding: '6px 14px', borderRadius: 6, border: '1px solid #F6465D44',
                  background: 'rgba(246,70,93,0.08)', color: '#F6465D',
                  fontSize: 12, fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                🗑 Delete All ({notifications.length})
              </button>
            </div>
          </div>

          {/* Header row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '32px 100px 1fr 90px 120px 32px',
            gap: 8, padding: '6px 10px',
            borderBottom: '1px solid #444A55',
            fontSize: 11, color: '#848E9C', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            <div></div>
            <div>Type</div>
            <div>Message</div>
            <div>Status</div>
            <div>Date</div>
            <div></div>
          </div>

          {/* Rows */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {notifications.map(n => {
              const k = KIND_MAP[n.kind] || KIND_MAP.info;
              const isRead = n.read_at !== null && n.read_at !== undefined;
              const isChecked = selected.has(n.id);
              const isExpanded = expanded === n.id;
              const preview = n.message.length > 70 ? n.message.slice(0, 70) + '...' : n.message;
              return (
                <div key={n.id} style={{ borderBottom: '1px solid #2B3139' }}>
                  {/* Row */}
                  <div
                    onClick={() => setExpanded(isExpanded ? null : n.id)}
                    style={{
                      display: 'grid', gridTemplateColumns: '32px 100px 1fr 90px 120px 32px',
                      gap: 8, padding: '9px 10px',
                      cursor: 'pointer',
                      background: isExpanded ? '#363B44' : isChecked ? '#F0B90B0D' : 'transparent',
                      transition: 'background .1s',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => { if (!isExpanded && !isChecked) e.currentTarget.style.background = '#2f3540'; }}
                    onMouseLeave={e => { if (!isExpanded && !isChecked) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {/* Checkbox */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(n.id)}
                        style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#F0B90B' }}
                      />
                    </div>

                    {/* Kind badge */}
                    <div>
                      <span style={{
                        display: 'inline-block', padding: '2px 7px', borderRadius: 12,
                        background: `${k.color}22`, color: k.color,
                        fontSize: 11, fontWeight: 600, border: `1px solid ${k.color}44`,
                        whiteSpace: 'nowrap',
                      }}>
                        {k.icon} {k.label}
                      </span>
                    </div>

                    {/* Message preview + chevron */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                      <span style={{ color: '#EAECEF', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {preview}
                      </span>
                      <span style={{ color: '#848E9C', fontSize: 10, flexShrink: 0 }}>
                        {isExpanded ? '▲' : '▼'}
                      </span>
                    </div>

                    {/* Read/Unread */}
                    <div>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 12,
                        background: isRead ? '#84848C22' : '#F0B90B22',
                        color: isRead ? '#848E9C' : '#F0B90B',
                        border: `1px solid ${isRead ? '#84848C44' : '#F0B90B44'}`,
                        fontSize: 11, fontWeight: 600,
                      }}>
                        {isRead ? '✓ Read' : ' Unread'}
                      </span>
                    </div>

                    {/* Date */}
                    <div style={{ fontSize: 11, color: '#848E9C' }}>
                      {fmt(n.created_at)}
                    </div>

                    {/* Delete single */}
                    <div onClick={e => e.stopPropagation()}>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (deleting) return;
                          setDeleting(true); setResult(null);
                          try {
                            await deleteClientNotificationsApi(selectedUser.id, [n.id]);
                            setNotifications(prev => prev.filter(x => x.id !== n.id));
                            setSelected(prev => { const next = new Set(prev); next.delete(n.id); return next; });
                            if (expanded === n.id) setExpanded(null);
                            setResult({ ok: true, deleted: 1 });
                          } catch (err) {
                            setResult({ error: err.message || 'Failed.' });
                          } finally {
                            setDeleting(false);
                          }
                        }}
                        title="Delete this notification"
                        style={{
                          background: 'none', border: 'none', color: '#555',
                          cursor: 'pointer', fontSize: 14, padding: '2px 4px',
                          borderRadius: 4, lineHeight: 1,
                          transition: 'color .15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#F6465D'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#555'; }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Preview panel */}
                  {isExpanded && (
                    <div style={{
                      padding: '14px 16px 16px',
                      background: '#363B44',
                      borderLeft: `3px solid ${k.color}`,
                    }}>
                      <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                        Full Message
                      </div>
                      <div style={{ color: '#EAECEF', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {n.message}
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #444A55', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                          <span style={{ fontSize: 12, color: '#848E9C' }}>
                            Type: <span style={{ color: k.color, fontWeight: 600 }}>{k.icon} {k.label}</span>
                          </span>
                          <span style={{ fontSize: 12, color: '#848E9C' }}>
                            Status: <span style={{ color: isRead ? '#848E9C' : '#F0B90B', fontWeight: 600 }}>{isRead ? '✓ Read' : ' Unread'}</span>
                          </span>
                          {isRead && n.read_at && (
                            <span style={{ fontSize: 12, color: '#848E9C' }}>
                              Read at: <span style={{ color: '#EAECEF' }}>{fmt(n.read_at)}</span>
                            </span>
                          )}
                          <span style={{ fontSize: 12, color: '#848E9C' }}>
                            Sent: <span style={{ color: '#EAECEF' }}>{fmt(n.created_at)}</span>
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (deleting) return;
                            setConfirm({
                              message: 'Permanently delete this notification? This cannot be undone.',
                              onConfirm: async () => {
                                setConfirm(null);
                                setDeleting(true); setResult(null);
                                try {
                                  await deleteClientNotificationsApi(selectedUser.id, [n.id]);
                                  setNotifications(prev => prev.filter(x => x.id !== n.id));
                                  setSelected(prev => { const next = new Set(prev); next.delete(n.id); return next; });
                                  setExpanded(null);
                                  setResult({ ok: true, deleted: 1 });
                                } catch (err) {
                                  setResult({ error: err.message || 'Failed.' });
                                } finally {
                                  setDeleting(false);
                                }
                              },
                            });
                          }}
                          style={{
                            padding: '6px 16px', borderRadius: 6,
                            background: 'rgba(246,70,93,0.12)', color: '#F6465D',
                            border: '1px solid #F6465D55',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          🗑 Delete this notification
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
          confirmLabel="Delete"
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Root export
// ---------------------------------------------------------------------------
const Notifications = ({ onSent } = {}) => {
  const [historyKey, setHistoryKey] = useState(0);
  const refreshHistory = useCallback(() => setHistoryKey(k => k + 1), []);

  return (
    <div id="notifications-section" style={s.wrap}>
      <Compose onSent={refreshHistory} />
      <BrowseDeleteNotifications />
      <WipeUserNotifications />
      <SentHistory refreshKey={historyKey} />
    </div>
  );
};

export default Notifications;
