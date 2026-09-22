/**
 * KycReview.jsx - Admin "Pending KYC" review queue.
 *
 * What this is:
 *   A focused queue panel for Super Admins (and Office Managers, scoped to
 *   their office silo via the backend) showing every real client user with
 *   kyc_status = 'Under Review'. Selecting a row opens a modal that lists
 *   each uploaded document and provides Approve / Reject buttons that hit
 *   the real backend (POST /api/admin/users/{id}/kyc/approve|reject).
 *
 * CRM lead modal (KycReviewModal in shared.jsx) opens from Lead Management
 * for a single lead; this queue lists all users pending review from the API.
 *
 * Backend endpoints used:
 *   GET  /api/admin/users?kyc_status=...           → queue list
 *   GET  /api/admin/users/{id}/kyc                 → doc index for a user
 *   GET  /api/admin/users/{id}/kyc/{docId}/file    → binary doc (Bearer auth)
 *   POST /api/admin/users/{id}/kyc/approve         → flip user to Approved
 *   POST /api/admin/users/{id}/kyc/reject          → flip user to Failed
 */

import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  listClientUsers,
  getUserKyc,
  approveUserKyc,
  rejectUserKyc,
  revokeUserKyc,
  deleteUserKyc,
  fetchKycFileObjectUrl,
  downloadKycDocFile,
  listKycAuditLog,
  searchAdminLeads,
} from '../../adminApi';
import { NotificationContext } from '../../shared';
import { SearchAutocomplete } from '../UserChrome';

const STATUS_FILTERS = [
  { value: 'Under Review', label: '[pending] Under Review' },
  { value: 'Approved',     label: 'OK Approved' },
  { value: 'Failed',       label: 'Error Rejected' },
  { value: '',             label: 'All statuses' },
];

const STATUS_BADGE = {
  'Under Review': { bg: '#FF9F0A33', fg: '#FF9F0A' },
  'Approved':     { bg: '#0ECB8133', fg: '#0ECB81' },
  'Failed':       { bg: '#f6465d33', fg: '#f6465d' },
  'Not Submitted':{ bg: '#444A55',   fg: '#848E9C' },
};

function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function StatusBadge({ status }) {
  const c = STATUS_BADGE[status] || STATUS_BADGE['Not Submitted'];
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg,
    }}>{status || '-'}</span>
  );
}

// ---------------------------------------------------------------------------
// Document preview pane - fetches the binary on demand and renders inline.
// ---------------------------------------------------------------------------
function DocPreview({ userId, doc }) {
  const [state, setState] = useState({ loading: true, url: null, mime: null, isImage: false, error: null });

  useEffect(() => {
    let cancelled = false;
    let revoke = null;
    setState({ loading: true, url: null, mime: null, isImage: false, error: null });
    fetchKycFileObjectUrl(userId, doc.id)
      .then(({ url, mime, isImage, revoke: r }) => {
        if (cancelled) { r(); return; }
        revoke = r;
        setState({ loading: false, url, mime, isImage, error: null });
      })
      .catch(err => {
        if (cancelled) return;
        setState({ loading: false, url: null, mime: null, isImage: false, error: err.message || 'Failed to load document.' });
      });
    return () => {
      cancelled = true;
      if (revoke) revoke();
    };
  }, [userId, doc.id]);

  const box = {
    width: '100%', minHeight: 220, background: '#2A2E36',
    border: '1px solid #444A55', borderRadius: 8, display: 'flex',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    color: '#848E9C', fontSize: 13, padding: 8,
  };

  if (state.loading) return <div style={box}>Loading preview...</div>;
  if (state.error)   return <div style={{ ...box, color: '#f6465d' }}>⚠ {state.error}</div>;

  if (state.isImage) {
    return (
      <div style={{ ...box, flexDirection: 'column', gap: 8 }}>
        <img src={state.url} alt={doc.label} style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }} />
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <a
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ flex: 1, textAlign: 'center', padding: '6px 12px', background: '#2A2E36', border: '1px solid #444A55', color: '#EAECEF', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
          >[search] Open in new tab</a>
          <a
            href={state.url}
            download={`${doc.kind}_${doc.id}`}
            style={{ flex: 1, textAlign: 'center', padding: '6px 12px', background: '#F0B90B', color: '#2A2E36', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
          >⬇ Download</a>
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...box, flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 28 }}>📄</span>
      <span>{doc.label}  /  {state.mime}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        <a
          href={state.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ flex: 1, textAlign: 'center', padding: '6px 12px', background: '#2A2E36', border: '1px solid #444A55', color: '#EAECEF', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
        >[search] Open in new tab</a>
        <a
          href={state.url}
          download={`${doc.kind}_${doc.id}`}
          style={{ flex: 1, textAlign: 'center', padding: '6px 12px', background: '#F0B90B', color: '#2A2E36', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
        >⬇ Download</a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DocCard - document card with header download button + inline preview.
// ---------------------------------------------------------------------------
function DocCard({ userId, doc }) {
  const [downloading, setDownloading] = useState(false);
  const showNotification = useContext(NotificationContext);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadKycDocFile(userId, doc.id, `${doc.kind}_${doc.id}`);
    } catch (e) {
      showNotification?.(`Download failed: ${e?.message || 'unknown error'}`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div style={{ background: '#2A2E36', border: '1px solid #444A55', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{doc.label}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {doc.decision && (
            <span style={{
              fontSize: 10, padding: '2px 8px', borderRadius: 999,
              background: doc.decision === 'Approved' ? '#0ECB8133' : '#f6465d33',
              color:      doc.decision === 'Approved' ? '#0ECB81'   : '#f6465d',
            }}>{doc.decision}</span>
          )}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            title="Download document"
            style={{
              padding: '3px 10px', borderRadius: 6, border: '1px solid #F0B90B80',
              background: 'rgba(240,185,11,0.12)', color: '#F0B90B',
              cursor: downloading ? 'wait' : 'pointer', fontSize: 11, fontWeight: 600,
              opacity: downloading ? 0.6 : 1,
            }}
          >{downloading ? '...' : '⬇ Download'}</button>
        </div>
      </div>
      <DocPreview userId={userId} doc={doc} />
      <div style={{ marginTop: 6, fontSize: 11, color: '#848E9C' }}>
        Uploaded {formatDate(doc.uploadedAt)}
        {doc.reviewedAt && <>  /  Reviewed {formatDate(doc.reviewedAt)}</>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review modal - shown when admin clicks a queue row.
// ---------------------------------------------------------------------------
function ReviewModal({ user, onClose, onDecided }) {
  const showNotification = useContext(NotificationContext);
  const [data, setData]       = useState(null);   // { user, documents } or null
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [note, setNote]             = useState('');
  const [reason, setReason]         = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [busy, setBusy]             = useState(null);   // 'approve' | 'reject' | 'revoke' | null

  const reload = useCallback(() => {
    setLoading(true); setError(null);
    getUserKyc(user.id)
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message || 'Could not load documents.'); setLoading(false); });
  }, [user.id]);

  useEffect(() => { reload(); }, [reload]);

  const handleApprove = async () => {
    setBusy('approve');
    try {
      const updatedUser = await approveUserKyc(user.id, { note: note.trim() || undefined });
      showNotification?.(`Approved KYC for ${user.name || user.email}.`);
      onDecided(updatedUser);
      onClose();
    } catch (e) {
      if (e.code === 'already_approved') {
        showNotification?.('User is already Approved.');
        onDecided({ ...user, kycStatus: 'Approved' });
        onClose();
      } else {
        setError(e.message || 'Approve failed.');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRevoke = async () => {
    setBusy('revoke');
    try {
      const updatedUser = await revokeUserKyc(user.id, { reason: revokeReason.trim() || undefined });
      showNotification?.(`KYC approval revoked for ${user.name || user.email}. They must re-verify.`);
      onDecided(updatedUser);
      onClose();
    } catch (e) {
      if (e.code === 'already_not_submitted') {
        showNotification?.('KYC is already in Not Submitted state.');
        onDecided({ ...user, kycStatus: 'Not Submitted' });
        onClose();
      } else {
        setError(e.message || 'Revoke failed.');
      }
    } finally {
      setBusy(null);
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) {
      setError('Please enter a rejection reason so the audit log captures it.');
      return;
    }
    setBusy('reject');
    try {
      const updatedUser = await rejectUserKyc(user.id, { reason: reason.trim() });
      showNotification?.(`Rejected KYC for ${user.name || user.email}.`);
      onDecided(updatedUser);
      onClose();
    } catch (e) {
      if (e.code === 'already_failed') {
        showNotification?.('User is already Rejected.');
        onDecided({ ...user, kycStatus: 'Failed' });
        onClose();
      } else {
        setError(e.message || 'Reject failed.');
      }
    } finally {
      setBusy(null);
    }
  };

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 };
  const card    = { background: '#363B44', border: '1px solid #444A55', borderRadius: 12, padding: 24, width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto', color: '#EAECEF' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>KYC Review</h2>
            <div style={{ marginTop: 4, fontSize: 13, color: '#848E9C' }}>
              {user.name || '-'}  /  {user.email}  /  <StatusBadge status={data?.user?.kyc_status || user.kycStatus} />
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#848E9C', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {loading && <div style={{ padding: 24, color: '#848E9C' }}>Loading documents...</div>}
        {error && !loading && (
          <div style={{ padding: 12, marginTop: 12, background: '#f6465d22', border: '1px solid #f6465d', borderRadius: 8, color: '#f6465d', fontSize: 13 }}>
            {error}
          </div>
        )}

        {!loading && data && (
          <>
            {/* KYC Personal Profile - always shown so admin can see submitted details */}
            <div style={{ marginTop: 14, padding: 18, background: '#2A2E36', border: '1px solid #444A55', borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#848E9C', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
                Personal Information (Step 1)
              </div>
              {!(data.user?.kyc_first_name || data.user?.kyc_last_name || data.user?.kyc_address || data.user?.phone || data.user?.kyc_dob) ? (
                <div style={{ fontSize: 13, color: '#848E9C', fontStyle: 'italic' }}>
                  User has not submitted personal information yet.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px 20px', fontSize: 13 }}>
                  <div>
                    <span style={{ color: '#848E9C' }}>First Name: </span>
                    <strong>{data.user?.kyc_first_name || <span style={{ color: '#848E9C' }}>-</span>}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#848E9C' }}>Last Name: </span>
                    <strong>{data.user?.kyc_last_name || <span style={{ color: '#848E9C' }}>-</span>}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#848E9C' }}>Phone: </span>
                    <strong>{data.user?.phone || <span style={{ color: '#848E9C' }}>-</span>}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#848E9C' }}>Date of Birth: </span>
                    <strong>{data.user?.kyc_dob || <span style={{ color: '#848E9C' }}>-</span>}</strong>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: '#848E9C' }}>Address: </span>
                    <strong>
                      {[data.user?.kyc_address, data.user?.kyc_city, data.user?.kyc_country].filter(Boolean).join(', ') || <span style={{ color: '#848E9C' }}>-</span>}
                    </strong>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: 18, marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#EAECEF', marginBottom: 12 }}>
                Submitted documents ({data.documents.length})
              </div>
              {data.documents.length === 0 ? (
                <div style={{ padding: 18, background: '#2A2E36', border: '1px dashed #444A55', borderRadius: 8, color: '#848E9C', textAlign: 'center', fontSize: 13 }}>
                  This user has no documents on file.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
                  {data.documents.map(doc => (
                    <DocCard key={doc.id} userId={user.id} doc={doc} />
                  ))}
                </div>
              )}
            </div>

            {/* Decision form - hide once user is no longer pending. */}
            {data.user?.kyc_status === 'Under Review' || data.user?.kyc_status === 'Not Submitted' || data.user?.kyc_status === 'Failed' ? (
              <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 6 }}>
                    Approval note (optional, audited)
                  </label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Why this user is approved (visible only in audit log)..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #444A55', background: '#2A2E36', color: '#EAECEF', resize: 'vertical' }}
                  />
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={busy !== null || data.documents.length === 0}
                    style={{
                      marginTop: 8, width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none',
                      background: '#0ECB81', color: '#0a1a13', fontWeight: 700,
                      cursor: (busy !== null || data.documents.length === 0) ? 'not-allowed' : 'pointer',
                      opacity: (busy !== null || data.documents.length === 0) ? 0.5 : 1,
                    }}
                  >{busy === 'approve' ? 'Approving...' : 'OK Approve KYC'}</button>
                  {data.documents.length === 0 && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#848E9C' }}>
                      Approval is disabled because the user hasn't uploaded any documents.
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 6 }}>
                    Rejection reason (required)
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="What's wrong with the documents..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #444A55', background: '#2A2E36', color: '#EAECEF', resize: 'vertical' }}
                  />
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={busy !== null || !reason.trim()}
                    style={{
                      marginTop: 8, width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #f6465d',
                      background: 'transparent', color: '#f6465d', fontWeight: 700,
                      cursor: (busy !== null || !reason.trim()) ? 'not-allowed' : 'pointer',
                      opacity: (busy !== null || !reason.trim()) ? 0.5 : 1,
                    }}
                  >{busy === 'reject' ? 'Rejecting...' : 'Error Reject KYC'}</button>
                </div>
              </div>
            ) : data.user?.kyc_status === 'Approved' ? (
              <div style={{ marginTop: 18 }}>
                <div style={{ padding: '10px 14px', background: '#0ECB8122', border: '1px solid #0ECB81', borderRadius: 8, fontSize: 13, color: '#0ECB81', marginBottom: 14 }}>
                  OK This user's KYC is <strong>Approved</strong>. They have full platform access.
                </div>
                <div style={{ padding: 14, background: '#2A2E36', border: '1px solid #F6465D44', borderRadius: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#F6465D', marginBottom: 8 }}>Warning Revoke KYC Approval</div>
                  <div style={{ fontSize: 12, color: '#848E9C', marginBottom: 10 }}>
                    Revoking resets verification to <strong>Not Submitted</strong>. The user will lose access to gated features and must re-submit their documents. Existing document records are kept for audit purposes.
                  </div>
                  <label style={{ display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 6 }}>
                    Reason (optional - stored in audit log)
                  </label>
                  <textarea
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. Documents expired, identity could not be confirmed..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #444A55', background: '#1E2228', color: '#EAECEF', resize: 'vertical', fontSize: 13, boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={busy !== null}
                    style={{
                      marginTop: 8, width: '100%', padding: '10px 14px', borderRadius: 8,
                      border: '1px solid #F6465D', background: 'transparent', color: '#F6465D',
                      fontWeight: 700, cursor: busy !== null ? 'not-allowed' : 'pointer',
                      opacity: busy !== null ? 0.5 : 1,
                    }}
                  >{busy === 'revoke' ? 'Revoking...' : '🔄 Revoke KYC Approval'}</button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 18, padding: 12, background: '#2A2E36', border: '1px solid #444A55', borderRadius: 8, fontSize: 13, color: '#848E9C', textAlign: 'center' }}>
                This user's KYC is <strong style={{ color: '#EAECEF' }}>{data.user.kyc_status}</strong> - no further action needed.
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #444A55', background: 'transparent', color: '#EAECEF', cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// KYC Audit Log - history of all approve / reject / delete / view events.
// ---------------------------------------------------------------------------
const KYC_ACTION_LABELS = {
  'admin.kyc_approve': { label: 'OK Approved',        color: '#0ECB81' },
  'admin.kyc_reject':  { label: 'Error Rejected',        color: '#F6465D' },
  'admin.kyc_revoke':  { label: '🔄 Approval Revoked', color: '#FF9F0A' },
  'admin.kyc_delete':  { label: '🗑 Deleted',         color: '#F6465D' },
  'admin.kyc_view':    { label: ' Viewed doc',      color: '#848E9C' },
  'admin.kyc_submit':  { label: '[upload] Doc uploaded',    color: '#FF9F0A' },
};

function csvEscape(val) {
  const s = val == null ? '' : String(val);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildDetailsString(entry) {
  const before = entry.before || {};
  const after  = entry.after  || {};
  const parts  = [];
  if (before.kyc_status && after.kyc_status)
    parts.push(`${before.kyc_status} → ${after.kyc_status}`);
  if (before.documents_deleted != null)
    parts.push(`${before.documents_deleted} doc${before.documents_deleted !== 1 ? 's' : ''} removed`);
  if (after.doc_id)
    parts.push(`doc: ${after.kind || after.doc_id}`);
  if (before.reason)
    parts.push(`reason: ${before.reason}`);
  return parts.join('  /  ');
}

function KycAuditLog() {
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [hasMore, setHasMore]   = useState(false);
  const [total, setTotal]       = useState(0);
  const [offset, setOffset]     = useState(0);
  const [search, setSearch]     = useState('');
  const [exporting, setExporting] = useState(false);
  const LIMIT = 50;

  const load = useCallback(async (off = 0) => {
    setLoading(true); setError(null);
    try {
      const res = await listKycAuditLog({ limit: LIMIT, offset: off });
      setEntries(prev => off === 0 ? res.entries : [...prev, ...res.entries]);
      setHasMore(res.has_more);
      setTotal(res.total);
      setOffset(off + res.entries.length);
    } catch (e) {
      setError(e?.message || 'Failed to load KYC audit log.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(0); }, [load]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      // Fetch all entries (backend max is 500 per call; page if needed)
      let all = [];
      let off = 0;
      const pageSize = 500;
      while (true) {
        const res = await listKycAuditLog({ limit: pageSize, offset: off });
        all = all.concat(res.entries);
        if (!res.has_more) break;
        off += res.entries.length;
      }

      const headers = ['Timestamp', 'Action', 'Admin', 'Role', 'Target User', 'Target User ID', 'Details', 'IP'];
      const rows = all.map(e => [
        csvEscape(e.created_at),
        csvEscape((KYC_ACTION_LABELS[e.action]?.label || e.action).replace(/^[^\w]+ ?/, '')),
        csvEscape(e.actor_admin_name || e.actor_admin_id || ''),
        csvEscape(e.actor_role || ''),
        csvEscape(e.target_user_name || ''),
        csvEscape(e.target_user_id || ''),
        csvEscape(buildDetailsString(e)),
        csvEscape(e.ip || ''),
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const ts   = new Date().toISOString().slice(0, 10);
      a.href     = url;
      a.download = `kyc-audit-log-${ts}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      alert(`Export failed: ${e?.message || 'unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const filtered = search.trim()
    ? entries.filter(e => {
        const q = search.toLowerCase();
        return (
          (e.actor_admin_name || '').toLowerCase().includes(q) ||
          (e.target_user_name || '').toLowerCase().includes(q) ||
          (e.action            || '').toLowerCase().includes(q) ||
          (e.actor_role        || '').toLowerCase().includes(q)
        );
      })
    : entries;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="[search]  Filter by admin, user, action..."
          style={{ flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 6, border: '1px solid #444A55', background: '#2A2E36', color: '#EAECEF', fontSize: 13 }}
        />
        <span style={{ fontSize: 12, color: '#848E9C' }}>
          {loading ? 'Loading...' : `${filtered.length} of ${total} entries`}
        </span>
        <button
          type="button"
          onClick={() => load(0)}
          disabled={loading}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #444A55', background: 'transparent', color: '#EAECEF', cursor: loading ? 'wait' : 'pointer', fontSize: 12 }}
        >↻ Refresh</button>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exporting || loading || total === 0}
          title={total === 0 ? 'No entries to export' : `Export all ${total} entries as CSV`}
          style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid #F0B90B80',
            background: 'rgba(240,185,11,0.12)', color: '#F0B90B',
            cursor: (exporting || loading || total === 0) ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 600,
            opacity: (exporting || loading || total === 0) ? 0.5 : 1,
          }}
        >{exporting ? '[pending] Exporting...' : '⬇ Export CSV'}</button>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 14, background: '#f6465d22', border: '1px solid #f6465d', borderRadius: 8, color: '#f6465d', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="aax-admin-table-container" style={{ overflowX: 'auto' }}>
        <table className="aax-admin-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Admin</th>
              <th>Role</th>
              <th>Target User</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: 28, color: '#848E9C' }}>
                  No KYC audit entries found.
                </td>
              </tr>
            )}
            {filtered.map(entry => {
              const meta = KYC_ACTION_LABELS[entry.action] || { label: entry.action, color: '#848E9C' };
              const before = entry.before || {};
              const after  = entry.after  || {};
              let details  = [];
              if (before.kyc_status && after.kyc_status)
                details.push(`${before.kyc_status} → ${after.kyc_status}`);
              if (before.documents_deleted != null)
                details.push(`${before.documents_deleted} doc${before.documents_deleted !== 1 ? 's' : ''} removed`);
              if (after.doc_id)
                details.push(`doc: ${after.kind || after.doc_id}`);
              if (entry.before?.reason)
                details.push(`reason: ${entry.before.reason}`);
              return (
                <tr key={entry.id}>
                  <td style={{ fontSize: 12, color: '#848E9C', whiteSpace: 'nowrap' }}>
                    {formatDate(entry.created_at)}
                  </td>
                  <td>
                    <span style={{ fontWeight: 600, fontSize: 12, color: meta.color }}>{meta.label}</span>
                  </td>
                  <td style={{ fontSize: 13 }}>{entry.actor_admin_name || entry.actor_admin_id || '-'}</td>
                  <td style={{ fontSize: 12, color: '#848E9C' }}>{entry.actor_role || '-'}</td>
                  <td style={{ fontSize: 13 }}>{entry.target_user_name || entry.target_user_id || '-'}</td>
                  <td style={{ fontSize: 12, color: '#848E9C' }}>
                    {details.length > 0 ? details.join('  /  ') : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore && !search.trim() && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button
            type="button"
            onClick={() => load(offset)}
            disabled={loading}
            style={{ padding: '8px 22px', borderRadius: 6, border: '1px solid #444A55', background: 'transparent', color: '#EAECEF', cursor: loading ? 'wait' : 'pointer', fontSize: 13 }}
          >{loading ? 'Loading...' : 'Load more'}</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top-level queue panel.
// ---------------------------------------------------------------------------
export default function KycReview() {
  const showNotification = useContext(NotificationContext);
  const [statusFilter, setStatusFilter] = useState('Under Review');
  const [search, setSearch]             = useState('');
  const [users, setUsers]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const [reviewUser, setReviewUser]     = useState(null);
  const [activeTab, setActiveTab]         = useState('queue');
  const [selectedKyc, setSelectedKyc]    = useState([]);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkDeleting, setBulkDeleting]   = useState(false);
  const [deletingId, setDeletingId]       = useState(null);

  const reload = useCallback(() => {
    setLoading(true); setError(null);
    listClientUsers({
      kycStatus: statusFilter || undefined,
      search:    search.trim() || undefined,
      limit:     200,
    })
      .then(({ users }) => { setUsers(users); setLoading(false); })
      .catch(e => {
        setError(e.message || 'Failed to load the KYC queue.');
        setLoading(false);
      });
  }, [statusFilter, search]);

  useEffect(() => { reload(); }, [reload]);

  // After a decision, refresh the queue so the row drops out (or its status
  // updates) and surface a confirmation toast.
  const handleDecided = (updatedUser) => {
    if (updatedUser?.kyc_status) {
      // Optimistically update the row in place - the next reload will
      // re-fetch and align with the server anyway.
      setUsers(prev => prev.map(u =>
        u.id === updatedUser.id ? { ...u, kycStatus: updatedUser.kyc_status, updatedAt: updatedUser.updated_at || u.updatedAt } : u
      ));
    }
    reload();
  };

  const pendingCount = users.filter(u => u.kycStatus === 'Under Review').length;

  const clientSuggestions = useCallback((query) => {
    const q = query.trim().toLowerCase();
    return users
      .filter(u => [u.name, u.email, u.phone, u.id].some(v => String(v || '').toLowerCase().includes(q)))
      .map(u => ({ key: u.id, value: u.name || u.email || u.id, label: u.name || u.email || u.id, meta: u.email || u.phone || '' }));
  }, [users]);

  const handleBulkRejectKyc = async () => {
    if (selectedKyc.length === 0) return;
    const count = selectedKyc.length;
    setBulkRejecting(true);
    try {
      const reason = 'KYC rejected by administrator.';
      await Promise.allSettled(selectedKyc.map(id => rejectUserKyc(id, { reason })));
      setUsers(prev => prev.map(u =>
        selectedKyc.includes(u.id) ? { ...u, kycStatus: 'Failed' } : u
      ));
      setSelectedKyc([]);
      showNotification(`${count} KYC application${count > 1 ? 's' : ''} rejected.`);
    } catch (err) {
      showNotification(`Bulk reject failed: ${err?.message || 'server error'}`);
    } finally {
      setBulkRejecting(false);
    }
  };

  const handleDeleteKyc = async (userId, userName) => {
    if (!window.confirm(`Delete all KYC records for ${userName || userId}? This will reset their status to "Not Submitted".`)) return;
    setDeletingId(userId);
    try {
      await deleteUserKyc(userId);
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, kycStatus: 'Not Submitted' } : u
      ));
      showNotification?.(`KYC records deleted for ${userName || userId}.`);
      reload();
    } catch (err) {
      showNotification?.(`Delete failed: ${err?.message || 'server error'}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleBulkDeleteKyc = async () => {
    if (selectedKyc.length === 0) return;
    const count = selectedKyc.length;
    if (!window.confirm(`Delete all KYC records for ${count} selected user${count > 1 ? 's' : ''}? This will reset their status to "Not Submitted".`)) return;
    setBulkDeleting(true);
    try {
      await Promise.allSettled(selectedKyc.map(id => deleteUserKyc(id)));
      setSelectedKyc([]);
      showNotification?.(`KYC records deleted for ${count} user${count > 1 ? 's' : ''}.`);
      reload();
    } catch (err) {
      showNotification?.(`Bulk delete failed: ${err?.message || 'server error'}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const tabBtn = (id, label) => ({
    onClick: () => setActiveTab(id),
    style: {
      minHeight: 38,
      padding: '9px 18px',
      borderRadius: 8,
      border: activeTab === id ? '1px solid #F0B90B' : '1px solid transparent',
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: 13,
      background: activeTab === id ? '#F0B90B' : 'transparent',
      color: activeTab === id ? '#2A2E36' : '#848E9C',
      boxShadow: activeTab === id ? '0 0 0 1px rgba(240,185,11,0.18)' : 'none',
      lineHeight: 1.2,
    },
  });

  return (
    <div className="aax-super-admin-card" style={{ padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>KYC Management</h2>
        {activeTab === 'queue' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#848E9C' }}>
              {loading ? 'Loading...' : `${users.length} user${users.length === 1 ? '' : 's'}`}
              {statusFilter === 'Under Review' && !loading && pendingCount > 0 && (
                <>  /  <span style={{ color: '#FF9F0A', fontWeight: 600 }}>{pendingCount} pending</span></>
              )}
            </span>
            <button
              type="button"
              onClick={reload}
              disabled={loading}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #444A55', background: 'transparent', color: '#EAECEF', cursor: loading ? 'wait' : 'pointer', fontSize: 12 }}
            >↻ Refresh</button>
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #444A55', paddingBottom: 10 }}>
        <button type="button" {...tabBtn('queue', 'Review Queue')}>
          Review Queue
        </button>
        <button type="button" {...tabBtn('history', 'KYC History')}>
          KYC History
        </button>
      </div>

      {activeTab === 'history' && <KycAuditLog />}

      {activeTab === 'queue' && <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid #444A55', background: '#2A2E36', color: '#EAECEF', fontSize: 13 }}
          >
            {STATUS_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <SearchAutocomplete
            value={search}
            onChange={setSearch}
            placeholder="[search]  Search by name, email, phone, or ID..."
            style={{ flex: 1, minWidth: 220 }}
            buildSuggestions={clientSuggestions}
            fetchSuggestions={searchAdminLeads}
            inputProps={{ 'aria-label': 'Search KYC clients' }}
          />
        </div>

        {error && (
          <div style={{ padding: 12, marginBottom: 14, background: '#f6465d22', border: '1px solid #f6465d', borderRadius: 8, color: '#f6465d', fontSize: 13 }}>
            {error}
          </div>
        )}

      {selectedKyc.length > 0 && (
        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, padding:'8px 12px', background:'#363B44', borderRadius:6, border:'1px solid #F6465D80' }}>
          <span style={{ color:'#F6465D', fontSize:12, fontWeight:600 }}>{selectedKyc.length} selected</span>
          <button
            onClick={handleBulkRejectKyc}
            disabled={bulkRejecting || bulkDeleting}
            style={{ padding:'5px 14px', borderRadius:6, background:'rgba(246,70,93,0.15)', border:'1px solid #F6465D60', color:'#F6465D', cursor:'pointer', fontWeight:600, fontSize:12, opacity: (bulkRejecting || bulkDeleting) ? 0.5 : 1 }}>
            {bulkRejecting ? 'Rejecting...' : 'Error Bulk Reject'}
          </button>
          <button
            onClick={handleBulkDeleteKyc}
            disabled={bulkDeleting || bulkRejecting}
            style={{ padding:'5px 14px', borderRadius:6, background:'rgba(246,70,93,0.08)', border:'1px solid #F6465D40', color:'#F6465D', cursor:'pointer', fontWeight:600, fontSize:12, opacity: (bulkDeleting || bulkRejecting) ? 0.5 : 1 }}>
            {bulkDeleting ? 'Deleting...' : '🗑 Bulk Delete KYC'}
          </button>
          <button onClick={() => setSelectedKyc([])}
            style={{ marginLeft:'auto', padding:'4px 10px', borderRadius:4, background:'transparent', border:'1px solid #444A55', color:'#848E9C', cursor:'pointer', fontSize:11 }}>
            Clear
          </button>
        </div>
      )}

      <div className="aax-admin-table-container" style={{ overflowX: 'auto' }}>
        <table className="aax-admin-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 36, padding: '12px 8px', textAlign: 'center' }}>
                <input type="checkbox"
                  checked={users.length > 0 && users.every(u => selectedKyc.includes(u.id))}
                  onChange={e => {
                    if (e.target.checked) setSelectedKyc(users.map(u => u.id));
                    else setSelectedKyc([]);
                  }}
                />
              </th>
              <th>User</th>
              <th>Email</th>
              <th>Country</th>
              <th>Assigned Agent</th>
              <th>KYC Status</th>
              <th>Last Updated</th>
              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: 28, color: '#848E9C' }}>
                  {statusFilter === 'Under Review'
                    ? '🎉 No KYC submissions waiting for review.'
                    : 'No users match this filter.'}
                </td>
              </tr>
            )}
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ textAlign: 'center', padding: '8px' }}>
                  <input type="checkbox" checked={selectedKyc.includes(u.id)}
                    onChange={e => setSelectedKyc(prev => e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id))}
                  />
                </td>
                <td>{u.name || '-'}</td>
                <td>{u.email}</td>
                <td>{u.country || '-'}</td>
                <td>{u.agentName || <span style={{ color: '#848E9C' }}>Unassigned</span>}</td>
                <td><StatusBadge status={u.kycStatus} /></td>
                <td style={{ fontSize: 12, color: '#848E9C' }}>{formatDate(u.updatedAt)}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => setReviewUser(u)}
                      style={{ padding: '6px 14px', borderRadius: 6, background: '#FF9F0A', color: '#2A2E36', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                    >Review</button>
                    <button
                      type="button"
                      onClick={() => handleDeleteKyc(u.id, u.name || u.email)}
                      disabled={deletingId === u.id}
                      title="Delete all KYC records for this user"
                      style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(246,70,93,0.12)', color: '#F6465D', border: '1px solid #F6465D50', fontWeight: 600, cursor: deletingId === u.id ? 'wait' : 'pointer', fontSize: 12, opacity: deletingId === u.id ? 0.5 : 1 }}
                    >{deletingId === u.id ? '...' : '🗑'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reviewUser && (
        <ReviewModal
          user={reviewUser}
          onClose={() => setReviewUser(null)}
          onDecided={handleDecided}
        />
      )}
      </>}
    </div>
  );
}
