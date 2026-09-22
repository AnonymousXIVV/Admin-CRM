import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Sessions.css';
import {
  listSessions, listVisitors, getAdminStatus,
  trackSession, untrackSession, getTrackedSessions,
  getSessionDetail, deleteSession, bulkDeleteSessions, forceLogoutSession,
} from '../../adminApi';

const ROLE_LABEL = {
  'Super Admin':    'Super Admin',
  'Office Manager': 'Office Manager',
  'Team Leader':    'Team Leader',
  'Agent':          'Agent',
  'client':         'Client',
};
const ROLE_CLASS = {
  'Super Admin':    'sess-role-sa',
  'Office Manager': 'sess-role-om',
  'Team Leader':    'sess-role-tl',
  'Agent':          'sess-role-ag',
  'client':         'sess-role-cl',
};

function fmtDuration(seconds) {
  if (!seconds || seconds <= 0) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
function fmtTime(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtDateTime(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseUA(ua) {
  if (!ua) return '-';
  let browser = 'Browser', os = '';
  if (/Chrome\//.test(ua) && !/Chromium|Edg\/|OPR\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua))  browser = 'Firefox';
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Edg\//.test(ua))      browser = 'Edge';
  else if (/OPR\//.test(ua))      browser = 'Opera';
  if (/Windows/.test(ua))         os = 'Windows';
  else if (/Mac OS X/.test(ua))   os = 'macOS';
  else if (/Linux/.test(ua))      os = 'Linux';
  else if (/Android/.test(ua))    os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  return os ? `${browser} / ${os}` : browser;
}

function playAlertTone() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1100].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  } catch (_) {}
}

function FlagCell({ code, country, city }) {
  if (!code) return <span className="sess-city">{country || '-'}</span>;
  const cc = code.toLowerCase();
  return (
    <span className="sess-flag-wrap">
      <img className="sess-flag" src={`https://flagcdn.com/24x18/${cc}.png`} alt={country}
        title={country} onError={e => { e.currentTarget.style.display = 'none'; }} />
      <span className="sess-city">{city || country || code}</span>
    </span>
  );
}

function LiveDuration({ loginAt, logoutAt }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    if (logoutAt) return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, [logoutAt]);
  const end = logoutAt || now;
  return <span className="sess-duration">{fmtDuration(end - loginAt)}</span>;
}

function MiniBarChart({ data, labelKey, valueKey, color = '#F0B90B' }) {
  if (!data || data.length === 0) return <div className="sess-chart-empty">No data yet</div>;
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div className="sess-bar-chart">
      {data.map((d, i) => {
        const pct = Math.max(4, Math.round(((Number(d[valueKey]) || 0) / max) * 100));
        const label = (d[labelKey] || '-').replace(/^\/admin\//, '/').replace(/^\/client\//, '/c/');
        return (
          <div key={i} className="sess-bar-row">
            <div className="sess-bar-label" title={d[labelKey]}>{label}</div>
            <div className="sess-bar-track">
              <div className="sess-bar-fill" style={{ width: `${pct}%`, background: color }} />
            </div>
            <div className="sess-bar-val">{d[valueKey]}</div>
          </div>
        );
      })}
    </div>
  );
}

function SessionDetailModal({ sessionId, token, tracked, onTrackToggle, onForceLogout, onClose }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState('overview');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    setLoading(true);
    getSessionDetail(token, sessionId)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId, token]);

  const sess = data?.session;
  const stats = data?.stats || {};
  const topPages = data?.top_pages || [];
  const pageVisits = data?.page_visits || [];
  const allSessions = data?.all_sessions || [];

  const ut  = sess?.user_type;
  const uid = ut === 'admin' ? sess?.admin_id : sess?.user_id;
  const isTracking = !!tracked[`${ut}:${uid}`];
  const initials = (sess?.display_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const handleForceLogout = async () => {
    if (!window.confirm(`Force-logout ${sess?.display_name}? All their active sessions will end immediately.`)) return;
    setActing(true);
    try { await forceLogoutSession(token, sessionId); onForceLogout(); onClose(); }
    catch (_) { setActing(false); }
  };

  return (
    <div className="sess-modal-overlay" onClick={onClose}>
      <div className="sess-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sess-detail-header">
          <div className="sess-detail-identity">
            <div className="sess-detail-avatar">{initials}</div>
            <div>
              <div className="sess-detail-name">{sess?.display_name || '-'}</div>
              <div className="sess-detail-email">{sess?.display_email || ''}</div>
            </div>
            {sess && (
              <span className={`sess-role-badge ${ROLE_CLASS[sess.role] || 'sess-role-ag'}`} style={{ marginLeft: 8 }}>
                {ROLE_LABEL[sess.role] || sess.role}
              </span>
            )}
            <span className={`sess-online-pill ${sess?.is_online ? 'online' : ''}`}>
              <span className={`sess-online-dot ${sess?.is_online ? 'online' : ''}`} />
              {sess?.is_online ? 'Online' : 'Offline'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className={`sess-detail-action-btn ${isTracking ? 'tracking' : ''}`}
              onClick={() => { onTrackToggle(sess); }}
              title={isTracking ? 'Stop tracking' : 'Track when online'}
            >{isTracking ? '🔔 Tracking' : '🔕 Track'}</button>
            <button
              className="sess-detail-action-btn danger"
              onClick={handleForceLogout}
              disabled={acting || !sess?.is_online}
              title={!sess?.is_online ? 'User is already offline' : 'Force-logout all sessions for this user'}
            >? Force Logout</button>
            <button className="sess-modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="sess-detail-tabs">
          {['overview', 'pages', 'history'].map(t => (
            <button key={t} className={`sess-detail-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' ? '[chart] Overview' : t === 'pages' ? '📄 Pages' : '[list] Sessions'}
            </button>
          ))}
        </div>

        <div className="sess-detail-body">
          {loading && <div className="sess-empty">Loading...</div>}

          {!loading && tab === 'overview' && (
            <div className="sess-detail-overview">
              {/* Stat cards */}
              <div className="sess-detail-stats-row">
                <div className="sess-detail-stat">
                  <div className="sess-detail-stat-num">{stats.total_sessions ?? '-'}</div>
                  <div className="sess-detail-stat-lbl">Total Sessions</div>
                </div>
                <div className="sess-detail-stat">
                  <div className="sess-detail-stat-num">{fmtDuration(stats.avg_duration_sec)}</div>
                  <div className="sess-detail-stat-lbl">Avg Session</div>
                </div>
                <div className="sess-detail-stat">
                  <div className="sess-detail-stat-num">{fmtDuration(stats.total_time_sec)}</div>
                  <div className="sess-detail-stat-lbl">Total Online</div>
                </div>
                <div className="sess-detail-stat">
                  <div className="sess-detail-stat-num">{fmtDate(stats.first_seen)}</div>
                  <div className="sess-detail-stat-lbl">First Seen</div>
                </div>
              </div>
              {/* Current session info */}
              <div className="sess-detail-info-grid">
                <div className="sess-info-row"><span className="sess-info-lbl">IP Address</span><span className="sess-info-val">{sess?.ip || '-'}</span></div>
                <div className="sess-info-row"><span className="sess-info-lbl">Location</span><span className="sess-info-val">{[sess?.city, sess?.region, sess?.country].filter(Boolean).join(', ') || '-'}</span></div>
                <div className="sess-info-row"><span className="sess-info-lbl">Device</span><span className="sess-info-val">{parseUA(sess?.user_agent)}</span></div>
                <div className="sess-info-row"><span className="sess-info-lbl">Current Page</span><span className="sess-info-val" style={{ fontFamily: 'monospace', fontSize: 11 }}>{sess?.current_page || '-'}</span></div>
                <div className="sess-info-row"><span className="sess-info-lbl">Logged In</span><span className="sess-info-val">{fmtDateTime(sess?.logged_in_at)}</span></div>
                <div className="sess-info-row"><span className="sess-info-lbl">Last Seen</span><span className="sess-info-val">{fmtDateTime(sess?.last_seen_at)}</span></div>
                <div className="sess-info-row"><span className="sess-info-lbl">Logged Out</span><span className="sess-info-val">{sess?.logged_out_at ? fmtDateTime(sess.logged_out_at) : (sess?.is_online ? '-' : 'Session expired')}</span></div>
                <div className="sess-info-row"><span className="sess-info-lbl">Tracking</span><span className="sess-info-val">{isTracking ? <span style={{ color: '#F0B90B' }}>🔔 Active</span> : <span style={{ color: '#6C7384' }}>Off</span>}</span></div>
              </div>
            </div>
          )}

          {!loading && tab === 'pages' && (
            <div>
              <div className="sess-detail-section-title">Top Pages (All Sessions)</div>
              {topPages.length === 0
                ? <div className="sess-empty" style={{ padding: '24px 0' }}>No page tracking data yet.<br/><span style={{ fontSize: 11, color: '#6C7384' }}>Data appears once the user navigates after this session update.</span></div>
                : <MiniBarChart data={topPages} labelKey="page" valueKey="visits" />
              }
              {topPages.length > 0 && (
                <>
                  <div className="sess-detail-section-title" style={{ marginTop: 24 }}>Time per Page (seconds avg)</div>
                  <MiniBarChart data={topPages.map(p => ({ ...p, avg_dur: Math.round(p.avg_dur || 0) }))} labelKey="page" valueKey="avg_dur" color="#3498db" />
                </>
              )}
              {pageVisits.length > 0 && (
                <>
                  <div className="sess-detail-section-title" style={{ marginTop: 24 }}>This Session - Page Log</div>
                  <div className="sess-pv-list">
                    {pageVisits.map((pv, i) => (
                      <div key={i} className="sess-pv-row">
                        <span className="sess-pv-page" title={pv.page}>{pv.page}</span>
                        <span className="sess-pv-time">{fmtTime(pv.entered_at)}</span>
                        <span className="sess-pv-dur">{fmtDuration(pv.duration_sec)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {!loading && tab === 'history' && (
            <div>
              <div className="sess-detail-section-title">{allSessions.length} sessions on record</div>
              <div className="sess-table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
                <table className="sess-table">
                  <thead>
                    <tr>
                      <th>Login</th>
                      <th>Logout / Last Seen</th>
                      <th>Duration</th>
                      <th>IP</th>
                      <th>Location</th>
                      <th>Device</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allSessions.length === 0 && <tr><td colSpan={6} className="sess-empty">No sessions</td></tr>}
                    {allSessions.map(s => (
                      <tr key={s.id}>
                        <td><span className="sess-time">{fmtDateTime(s.logged_in_at)}</span></td>
                        <td><span className="sess-time">{s.logged_out_at ? fmtDateTime(s.logged_out_at) : fmtDateTime(s.last_seen_at)}</span></td>
                        <td><span className="sess-duration">{fmtDuration((s.logged_out_at || s.last_seen_at) - s.logged_in_at)}</span></td>
                        <td><span className="sess-city">{s.ip || '-'}</span></td>
                        <td><FlagCell code={s.country_code} country={s.country} city={s.city} /></td>
                        <td><span className="sess-ua" title={s.user_agent}>{parseUA(s.user_agent)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TrackModal({ session, isTracking, onConfirm, onClose }) {
  const name = session?.display_name || 'this user';
  return (
    <div className="sess-modal-overlay" onClick={onClose}>
      <div className="sess-modal" onClick={e => e.stopPropagation()}>
        <div className="sess-modal-header">
          <span className="sess-modal-title">{isTracking ? '🔕 Stop Tracking' : '🔔 Track Online Status'}</span>
          <button className="sess-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="sess-modal-body">
          {isTracking
            ? <>You will <strong>no longer receive</strong> alerts when <strong>{name}</strong> comes online.</>
            : <>You will receive an alert tone each time <strong>{name}</strong> comes online. You can turn this off at any time.</>
          }
        </div>
        <div className="sess-modal-footer">
          <button className="sess-modal-btn sess-modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="sess-modal-btn sess-modal-btn-primary" onClick={onConfirm}>
            {isTracking ? 'Stop Tracking' : 'Start Tracking'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sessions({ token }) {
  const [tab, setTab]               = useState('staff');
  const [staffRole, setStaffRole]   = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [sessions, setSessions]     = useState([]);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [visitors, setVisitors]     = useState([]);
  const [visitorTotal, setVisitorTotal]     = useState(0);
  const [visitorPage, setVisitorPage]       = useState(1);
  const [visitorTotalPages, setVisitorTotalPages] = useState(1);

  // History tab state
  const [histSessions, setHistSessions]     = useState([]);
  const [histTotal, setHistTotal]           = useState(0);
  const [histPage, setHistPage]             = useState(1);
  const [histTotalPages, setHistTotalPages] = useState(1);
  const [histSearch, setHistSearch]         = useState('');
  const [histSelectedIds, setHistSelectedIds] = useState(new Set());

  const [status, setStatus]         = useState(null);
  const [loading, setLoading]       = useState(false);
  const [tracked, setTracked]       = useState({});
  const [trackModal, setTrackModal] = useState(null);
  const [detailId, setDetailId]     = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);
  const [toast, setToast]           = useState(null);

  const prevOnlineRef  = useRef({});
  const trackedRef     = useRef({});
  const refreshRef     = useRef(null);
  const toastTimerRef  = useRef(null);

  const showToast = (msg, type = 'info') => {
    clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  };

  const loadStatus = useCallback(async () => {
    try { const s = await getAdminStatus(token); setStatus(s); } catch (_) {}
  }, [token]);

  const loadTracked = useCallback(async () => {
    try {
      const data = await getTrackedSessions(token);
      const map  = {};
      (data.tracked || []).forEach(t => { map[`${t.user_type}:${t.tracked_user_id}`] = t.id; });
      trackedRef.current = map;
      setTracked(map);
    } catch (_) {}
  }, [token]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        type: tab === 'staff' ? 'admin' : 'client',
        ...(staffRole ? { role: staffRole } : {}),
        ...(onlineOnly ? { online: '1' } : {}),
        page,
      };
      const data = await listSessions(token, params);
      const newRows = data.sessions || [];

      // Detect tracked-user came-online events → play tone.
      const prev = prevOnlineRef.current;
      newRows.forEach(s => {
        const uid = s.user_type === 'admin' ? s.admin_id : s.user_id;
        const key = `${s.user_type}:${uid}`;
        if (trackedRef.current[key] && s.is_online && prev[key] === false) {
          playAlertTone();
          showToast(`🟢 ${s.display_name || 'User'} came online`, 'online');
        }
        prev[key] = !!s.is_online;
      });
      prevOnlineRef.current = prev;

      setSessions(newRows);
      setTotal(data.total || 0);
      setTotalPages(data.total_pages || 1);
    } catch (_) {}
    setLoading(false);
  }, [tab, staffRole, onlineOnly, page, token]);

  const loadVisitors = useCallback(async () => {
    try {
      const data = await listVisitors(token, { page: visitorPage });
      setVisitors(data.visitors || []);
      setVisitorTotal(data.total || 0);
      setVisitorTotalPages(data.total_pages || 1);
    } catch (_) {}
  }, [token, visitorPage]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await listSessions(token, { page: histPage, per_page: 50 });
      setHistSessions(data.sessions || []);
      setHistTotal(data.total || 0);
      setHistTotalPages(data.total_pages || 1);
    } catch (_) {}
  }, [token, histPage]);

  useEffect(() => {
    loadStatus();
    loadTracked();
    const id = setInterval(() => { loadStatus(); loadTracked(); }, 15000);
    return () => clearInterval(id);
  }, [loadStatus, loadTracked]);

  useEffect(() => { setPage(1); setSelectedIds(new Set()); }, [tab, staffRole, onlineOnly]);

  useEffect(() => {
    if (tab !== 'visitors' && tab !== 'history') {
      loadSessions();
      refreshRef.current = setInterval(loadSessions, 20000);
    } else if (tab === 'visitors') {
      loadVisitors();
    } else if (tab === 'history') {
      loadHistory();
    }
    return () => clearInterval(refreshRef.current);
  }, [tab, loadSessions, loadVisitors, loadHistory]);

  useEffect(() => { if (tab !== 'visitors' && tab !== 'history') loadSessions(); }, [page]);
  useEffect(() => { if (tab === 'visitors') loadVisitors(); }, [visitorPage]);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [histPage]);

  // Track toggle
  const handleTrackToggle = (sess) => setTrackModal(sess);
  const confirmTrack = async () => {
    if (!trackModal) return;
    const ut  = trackModal.user_type;
    const uid = ut === 'admin' ? trackModal.admin_id : trackModal.user_id;
    const key = `${ut}:${uid}`;
    if (tracked[key]) await untrackSession(token, tracked[key]);
    else               await trackSession(token, ut, uid);
    setTrackModal(null);
    loadTracked();
  };

  // Single delete
  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this session record?')) return;
    try {
      await deleteSession(token, id);
      setSessions(prev => prev.filter(s => s.id !== id));
      showToast('Session deleted', 'success');
    } catch (_) { showToast('Delete failed', 'error'); }
  };

  const handleHistDelete = async (id) => {
    if (!window.confirm('Delete this session record?')) return;
    try {
      await deleteSession(token, id);
      setHistSessions(prev => prev.filter(s => s.id !== id));
      showToast('Session deleted', 'success');
    } catch (_) { showToast('Delete failed', 'error'); }
  };

  // Bulk operations on main table
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredSessions.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredSessions.map(s => s.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} session(s)?`)) return;
    setBulkWorking(true);
    try {
      await bulkDeleteSessions(token, [...selectedIds]);
      setSessions(prev => prev.filter(s => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
      showToast(`Deleted ${selectedIds.size} sessions`, 'success');
    } catch (_) { showToast('Bulk delete failed', 'error'); }
    setBulkWorking(false);
  };

  const handleBulkTrack = async () => {
    if (selectedIds.size === 0) return;
    setBulkWorking(true);
    const toTrack = filteredSessions.filter(s => selectedIds.has(s.id));
    let done = 0;
    for (const s of toTrack) {
      const ut  = s.user_type;
      const uid = ut === 'admin' ? s.admin_id : s.user_id;
      const key = `${ut}:${uid}`;
      if (!tracked[key]) {
        try { await trackSession(token, ut, uid); done++; } catch (_) {}
      }
    }
    await loadTracked();
    setSelectedIds(new Set());
    showToast(`Now tracking ${done} user(s)`, 'success');
    setBulkWorking(false);
  };

  // History bulk operations
  const toggleHistSelect = (id) => {
    setHistSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleHistSelectAll = () => {
    const visible = filteredHistory.map(s => s.id);
    if (histSelectedIds.size === visible.length) setHistSelectedIds(new Set());
    else setHistSelectedIds(new Set(visible));
  };
  const handleHistBulkDelete = async () => {
    if (histSelectedIds.size === 0) return;
    if (!window.confirm(`Delete ${histSelectedIds.size} session(s)?`)) return;
    setBulkWorking(true);
    try {
      await bulkDeleteSessions(token, [...histSelectedIds]);
      setHistSessions(prev => prev.filter(s => !histSelectedIds.has(s.id)));
      setHistSelectedIds(new Set());
      showToast(`Deleted ${histSelectedIds.size} sessions`, 'success');
    } catch (_) { showToast('Bulk delete failed', 'error'); }
    setBulkWorking(false);
  };

  // Local filter
  const filteredSessions = sessions.filter(s => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.display_name || '').toLowerCase().includes(q)
        || (s.display_email || '').toLowerCase().includes(q)
        || (s.country || '').toLowerCase().includes(q)
        || (s.city || '').toLowerCase().includes(q)
        || (s.ip || '').includes(q);
  });

  const filteredVisitors = visitors.filter(v => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (v.ip || '').includes(q)
        || (v.country || '').toLowerCase().includes(q)
        || (v.city || '').toLowerCase().includes(q)
        || (v.path || '').toLowerCase().includes(q);
  });

  const filteredHistory = histSessions.filter(s => {
    if (!histSearch) return true;
    const q = histSearch.toLowerCase();
    return (s.display_name || '').toLowerCase().includes(q)
        || (s.display_email || '').toLowerCase().includes(q)
        || (s.ip || '').includes(q);
  });

  const allFilteredSelected = filteredSessions.length > 0 && selectedIds.size === filteredSessions.length;

  return (
    <div className="sess-page">
      {/* Toast */}
      {toast && (
        <div className={`sess-toast sess-toast-${toast.type}`}>{toast.msg}</div>
      )}

      {/* Stats row */}
      <div className="sess-stats">
        <div className="sess-stat-card green">
          <div className="sess-stat-num">{status?.online_total ?? '-'}</div>
          <div className="sess-stat-lbl">Total Online</div>
        </div>
        <div className="sess-stat-card">
          <div className="sess-stat-num">{status?.online_staff ?? '-'}</div>
          <div className="sess-stat-lbl">Staff Online</div>
        </div>
        <div className="sess-stat-card blue">
          <div className="sess-stat-num">{status?.online_clients ?? '-'}</div>
          <div className="sess-stat-lbl">Clients Online</div>
        </div>
        <div className="sess-stat-card">
          <div className="sess-stat-num">{status?.visitor_today ?? '-'}</div>
          <div className="sess-stat-lbl">Visitors Today</div>
        </div>
        <div className="sess-stat-card">
          <div className="sess-stat-num" style={{ color: status?.db_ms < 50 ? '#2ecc71' : status?.db_ms < 200 ? '#F0B90B' : '#e74c3c' }}>
            {status ? `${status.db_ms}ms` : '-'}
          </div>
          <div className="sess-stat-lbl">DB Response</div>
        </div>
      </div>

      {/* Main tabs */}
      <div className="sess-tabs">
        <button className={`sess-tab ${tab === 'staff' ? 'active' : ''}`}    onClick={() => setTab('staff')}>👔 Staff</button>
        <button className={`sess-tab ${tab === 'clients' ? 'active' : ''}`}  onClick={() => setTab('clients')}>[users] Clients</button>
        <button className={`sess-tab ${tab === 'visitors' ? 'active' : ''}`} onClick={() => setTab('visitors')}> Visitors</button>
        <button className={`sess-tab ${tab === 'history' ? 'active' : ''}`}  onClick={() => setTab('history')}>[list] Logs</button>
      </div>

      {/* ── STAFF / CLIENTS TABS ── */}
      {(tab === 'staff' || tab === 'clients') && (
        <>
          <div className="sess-sub-filters">
            {tab === 'staff' && (
              <>
                <span style={{ fontSize: 11, color: '#848E9C', marginRight: 2 }}>Role:</span>
                {['', 'Office Manager', 'Team Leader', 'Agent'].map(r => (
                  <button key={r}
                    className={`sess-filter-btn ${staffRole === r ? 'active' : ''}`}
                    onClick={() => { setStaffRole(r); setPage(1); }}
                  >{r === '' ? 'All Staff' : r}</button>
                ))}
              </>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#848E9C', cursor: 'pointer' }}>
                <input type="checkbox" checked={onlineOnly}
                  onChange={e => { setOnlineOnly(e.target.checked); setPage(1); }}
                  style={{ accentColor: '#2ecc71' }} />
                Online only
              </label>
            </div>
          </div>

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="sess-bulk-bar">
              <span className="sess-bulk-count">{selectedIds.size} selected</span>
              <button className="sess-bulk-btn track" onClick={handleBulkTrack} disabled={bulkWorking}>🔔 Track Selected</button>
              <button className="sess-bulk-btn delete" onClick={handleBulkDelete} disabled={bulkWorking}>🗑 Delete Selected</button>
              <button className="sess-bulk-btn cancel" onClick={() => setSelectedIds(new Set())}>✕ Clear</button>
            </div>
          )}

          <div className="sess-search">
            <input className="sess-search-input" type="text"
              placeholder="[search]  Search by name, email, country, IP..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="sess-table-wrap">
            <table className="sess-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={allFilteredSelected}
                      onChange={toggleSelectAll} style={{ accentColor: '#F0B90B', cursor: 'pointer' }} />
                  </th>
                  <th>Status</th>
                  <th>Name</th>
                  {tab === 'staff' && <th>Role</th>}
                  <th>Location</th>
                  <th>IP</th>
                  <th>Login Time</th>
                  <th>Duration</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.length === 0 && (
                  <tr><td colSpan={tab === 'staff' ? 10 : 9} className="sess-empty">
                    {loading ? 'Loading...' : 'No sessions found'}
                  </td></tr>
                )}
                {filteredSessions.map(s => {
                  const ut  = s.user_type;
                  const uid = ut === 'admin' ? s.admin_id : s.user_id;
                  const key = `${ut}:${uid}`;
                  const isTracking = !!tracked[key];
                  const initials = (s.display_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  const selected = selectedIds.has(s.id);
                  return (
                    <tr key={s.id}
                      className={`sess-row ${selected ? 'selected' : ''}`}
                      onClick={() => setDetailId(s.id)}
                      style={{ cursor: 'pointer' }}>
                      <td onClick={e => { e.stopPropagation(); toggleSelect(s.id); }}>
                        <input type="checkbox" checked={selected} onChange={() => toggleSelect(s.id)}
                          style={{ accentColor: '#F0B90B', cursor: 'pointer' }} />
                      </td>
                      <td>
                        <span className={`sess-online-dot ${s.is_online ? 'online' : ''}`} title={s.is_online ? 'Online' : 'Offline'} />
                        <span style={{ fontSize: 11, color: s.is_online ? '#2ecc71' : '#848E9C' }}>
                          {s.is_online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>
                        <div className="sess-name-cell">
                          <div className="sess-avatar">{initials}</div>
                          <div>
                            <div className="sess-name">{s.display_name || '-'}</div>
                            <div className="sess-email">{s.display_email || ''}</div>
                          </div>
                        </div>
                      </td>
                      {tab === 'staff' && (
                        <td>
                          <span className={`sess-role-badge ${ROLE_CLASS[s.role] || 'sess-role-ag'}`}>
                            {ROLE_LABEL[s.role] || s.role}
                          </span>
                        </td>
                      )}
                      <td><FlagCell code={s.country_code} country={s.country} city={s.city} /></td>
                      <td><span className="sess-city">{s.ip || '-'}</span></td>
                      <td><span className="sess-time">{fmtDateTime(s.logged_in_at)}</span></td>
                      <td><LiveDuration loginAt={s.logged_in_at} logoutAt={s.logged_out_at} /></td>
                      <td><span className="sess-time">{fmtTime(s.last_seen_at)}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="sess-action-cell">
                          <button className={`sess-track-btn ${isTracking ? 'tracking' : ''}`}
                            onClick={() => handleTrackToggle(s)}
                            title={isTracking ? 'Stop tracking' : 'Track when online'}>
                            {isTracking ? '🔔' : '🔕'}
                          </button>
                          <button className="sess-track-btn danger"
                            onClick={() => { setDetailId(s.id); }}
                            title="View details">⋯</button>
                          <button className="sess-track-btn delete-btn"
                            onClick={(e) => handleDelete(s.id, e)}
                            title="Delete session">🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="sess-pagination">
              <span>{total} sessions</span>
              <button className="sess-page-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
              <button className="sess-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
              <span>Page {page} / {totalPages}</span>
              <button className="sess-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>›</button>
              <button className="sess-page-btn" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          )}
        </>
      )}

      {/* ── VISITORS TAB ── */}
      {tab === 'visitors' && (
        <>
          <div className="sess-search">
            <input className="sess-search-input" type="text"
              placeholder="[search]  Search by IP, country, path..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="sess-table-wrap">
            <table className="sess-table">
              <thead>
                <tr>
                  <th>Time</th><th>Location</th><th>IP</th><th>Page</th><th>Referrer</th><th>Browser / OS</th>
                </tr>
              </thead>
              <tbody>
                {filteredVisitors.length === 0 && (
                  <tr><td colSpan={6} className="sess-empty">No visitors recorded yet</td></tr>
                )}
                {filteredVisitors.map(v => (
                  <tr key={v.id}>
                    <td><span className="sess-time">{fmtDateTime(v.visited_at)}</span></td>
                    <td><FlagCell code={v.country_code} country={v.country} city={v.city} /></td>
                    <td><span className="sess-city">{v.ip || '-'}</span></td>
                    <td><span className="sess-path" title={v.path}>{v.path || '/'}</span></td>
                    <td><span className="sess-ref" title={v.referrer}>{v.referrer || '-'}</span></td>
                    <td><span className="sess-ua" title={v.user_agent}>{parseUA(v.user_agent)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visitorTotalPages > 1 && (
            <div className="sess-pagination">
              <span>{visitorTotal} visitors</span>
              <button className="sess-page-btn" disabled={visitorPage === 1} onClick={() => setVisitorPage(1)}>«</button>
              <button className="sess-page-btn" disabled={visitorPage === 1} onClick={() => setVisitorPage(p => p - 1)}>‹</button>
              <span>Page {visitorPage} / {visitorTotalPages}</span>
              <button className="sess-page-btn" disabled={visitorPage >= visitorTotalPages} onClick={() => setVisitorPage(p => p + 1)}>›</button>
              <button className="sess-page-btn" disabled={visitorPage >= visitorTotalPages} onClick={() => setVisitorPage(visitorTotalPages)}>»</button>
            </div>
          )}
        </>
      )}

      {/* ── HISTORY / LOGS TAB ── */}
      {tab === 'history' && (
        <>
          {histSelectedIds.size > 0 && (
            <div className="sess-bulk-bar">
              <span className="sess-bulk-count">{histSelectedIds.size} selected</span>
              <button className="sess-bulk-btn delete" onClick={handleHistBulkDelete} disabled={bulkWorking}>🗑 Delete Selected</button>
              <button className="sess-bulk-btn cancel" onClick={() => setHistSelectedIds(new Set())}>✕ Clear</button>
            </div>
          )}
          <div className="sess-search">
            <input className="sess-search-input" type="text"
              placeholder="[search]  Search name, email, IP..."
              value={histSearch} onChange={e => setHistSearch(e.target.value)} />
          </div>
          <div className="sess-table-wrap">
            <table className="sess-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox"
                      checked={filteredHistory.length > 0 && histSelectedIds.size === filteredHistory.length}
                      onChange={toggleHistSelectAll}
                      style={{ accentColor: '#F0B90B', cursor: 'pointer' }} />
                  </th>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Login</th>
                  <th>Duration</th>
                  <th>Location</th>
                  <th>IP</th>
                  <th>Device</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.length === 0 && (
                  <tr><td colSpan={11} className="sess-empty">No session logs</td></tr>
                )}
                {filteredHistory.map(s => {
                  const initials = (s.display_name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                  const dur = (s.logged_out_at || s.last_seen_at) - s.logged_in_at;
                  const isOnline = !s.logged_out_at && (Date.now() / 1000 - s.last_seen_at) < 90;
                  return (
                    <tr key={s.id} className={`sess-row ${histSelectedIds.has(s.id) ? 'selected' : ''}`}
                      onClick={() => setDetailId(s.id)} style={{ cursor: 'pointer' }}>
                      <td onClick={e => { e.stopPropagation(); toggleHistSelect(s.id); }}>
                        <input type="checkbox" checked={histSelectedIds.has(s.id)}
                          onChange={() => toggleHistSelect(s.id)} style={{ accentColor: '#F0B90B', cursor: 'pointer' }} />
                      </td>
                      <td>
                        <span className={`sess-type-pill ${s.user_type}`}>{s.user_type === 'admin' ? '👔' : '[user]'}</span>
                      </td>
                      <td>
                        <div className="sess-name-cell">
                          <div className="sess-avatar" style={{ fontSize: 9 }}>{initials}</div>
                          <div>
                            <div className="sess-name">{s.display_name || '-'}</div>
                            <div className="sess-email">{s.display_email || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`sess-role-badge ${ROLE_CLASS[s.role] || 'sess-role-ag'}`}>
                          {ROLE_LABEL[s.role] || s.role}
                        </span>
                      </td>
                      <td><span className="sess-time">{fmtDateTime(s.logged_in_at)}</span></td>
                      <td><span className="sess-duration">{fmtDuration(dur)}</span></td>
                      <td><FlagCell code={s.country_code} country={s.country} city={s.city} /></td>
                      <td><span className="sess-city">{s.ip || '-'}</span></td>
                      <td><span className="sess-ua" title={s.user_agent}>{parseUA(s.user_agent)}</span></td>
                      <td>
                        <span className={`sess-online-dot ${isOnline ? 'online' : ''}`} />
                        <span style={{ fontSize: 11, color: isOnline ? '#2ecc71' : '#848E9C' }}>
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="sess-track-btn delete-btn"
                          onClick={() => handleHistDelete(s.id)} title="Delete">🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {histTotalPages > 1 && (
            <div className="sess-pagination">
              <span>{histTotal} total logs</span>
              <button className="sess-page-btn" disabled={histPage === 1} onClick={() => setHistPage(1)}>«</button>
              <button className="sess-page-btn" disabled={histPage === 1} onClick={() => setHistPage(p => p - 1)}>‹</button>
              <span>Page {histPage} / {histTotalPages}</span>
              <button className="sess-page-btn" disabled={histPage >= histTotalPages} onClick={() => setHistPage(p => p + 1)}>›</button>
              <button className="sess-page-btn" disabled={histPage >= histTotalPages} onClick={() => setHistPage(histTotalPages)}>»</button>
            </div>
          )}
        </>
      )}

      {/* Track confirmation modal */}
      {trackModal && (
        <TrackModal
          session={trackModal}
          isTracking={!!tracked[`${trackModal.user_type}:${trackModal.user_type === 'admin' ? trackModal.admin_id : trackModal.user_id}`]}
          onConfirm={confirmTrack}
          onClose={() => setTrackModal(null)}
        />
      )}

      {/* Session detail modal */}
      {detailId && (
        <SessionDetailModal
          sessionId={detailId}
          token={token}
          tracked={tracked}
          onTrackToggle={(s) => { setDetailId(null); handleTrackToggle(s); }}
          onForceLogout={() => { loadSessions(); loadHistory(); }}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
