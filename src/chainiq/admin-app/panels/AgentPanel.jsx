import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ROLE, LEAD_STATUSES, normalizeStage,
  getOfficeName, getTeamName, getUserName, getCountryFlag, statusClass,
  formatLeadId, EditLeadModal, CreateLeadModal, KycReviewModal, stageColor,
} from '../shared';
import { useConfirmDialog } from '../components/ConfirmModal/ConfirmModal';
import { SearchAutocomplete } from '../components/UserChrome.jsx';
import { searchAdminLeads } from '../adminApi';
import { getAdminMessages, sendAdminMessage, markAdminMessagesRead, getAdminUnreadMessageCounts, deleteAdminMessage, clearAdminChat, adminSetClientPassword, deleteLeadCommentApi, deleteLeadStatusEntryApi, getLeadNotificationsAsAdmin, listAdminWithdrawals, listUserTransactions, fetchLeadById, postAdminPresence, getAdminMessageAttachmentUrl, getStaffCapabilities, fetchAdminMe } from '../adminApi';
import AdminNotificationsInbox from '../components/AdminNotificationsInbox/AdminNotificationsInbox.jsx';
import ReactCapabilityWorkspace from '../components/ReactCapabilityWorkspace.jsx';
import { getLeadProfilePath, getRoleScopedLeads, getRoleWorkspacePath } from '../leadProfileRouting';

// macOS-style funnel filter button + popover for column header filters.
function FilterPopover({ label, value, options, open, onToggle, onSelect, onClose, formatLabel }) {
  const popRef = useRef(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) { setSearch(''); return; }
    const handleClick = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  const display = (opt) => (formatLabel ? formatLabel(opt) : (opt ?? '-'));
  const filtered = options.filter((opt) =>
    String(display(opt)).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <button
        type="button"
        className="aax-column-filter-btn"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        aria-label={`Filter ${label}`}
        title={`Filter ${label}`}
      />
      {open && (
        <div ref={popRef} className="aax-mac-popover" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            autoFocus
            className="aax-mac-popover-search"
            placeholder={`Filter ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="aax-mac-popover-list">
            <div
              className={`aax-mac-popover-item ${value === '' ? 'aax-selected' : ''}`}
              onClick={() => onSelect('')}
            >
              <span className="aax-mac-popover-check">{value === '' ? '✓' : ''}</span>
              <span>All</span>
            </div>
            {filtered.length === 0 ? (
              <div className="aax-mac-popover-empty">No matches</div>
            ) : (
              filtered.map((opt) => (
                <div
                  key={String(opt)}
                  className={`aax-mac-popover-item ${value === opt ? 'aax-selected' : ''}`}
                  onClick={() => onSelect(opt)}
                >
                  <span className="aax-mac-popover-check">{value === opt ? '✓' : ''}</span>
                  <span>{display(opt)}</span>
                </div>
              ))
            )}
          </div>
          {value !== '' && (
            <>
              <div className="aax-mac-popover-divider" />
              <div className="aax-mac-popover-footer">
                <button type="button" onClick={() => onSelect('')}>Clear filter</button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

// Inline SVG icons for the lead-profile action buttons.
const PA_ICONS = {
  deposit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" />
    </svg>
  ),
  withdraw: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21V9" /><path d="M7 14l5-5 5 5" /><path d="M5 3h14" />
    </svg>
  ),
  activity: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </svg>
  ),
  appointment: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4" /><path d="M16 3v4" />
    </svg>
  ),
  security: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
    </svg>
  ),
  support: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 1 1-3-6.2L21 4l-1 4-3.8 0" /><path d="M8 12h.01M12 12h.01M16 12h.01" />
    </svg>
  ),
  kyc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2.2" /><path d="M14 10h5" /><path d="M14 14h3" /><path d="M5.5 17c.6-1.6 2-2.5 3.5-2.5s2.9.9 3.5 2.5" />
    </svg>
  ),
  login: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" />
    </svg>
  ),
};
const PaIcon = ({ name }) => <span className="aax-pa-icon">{PA_ICONS[name]}</span>;

function AgentPanel({ data, currentUser, setData, setUserLoginState, createLead, showNotification }) {
  const navigate = useNavigate();
  const location = useLocation();
  const myLeads = data.leads.filter((lead) => lead.assignedToAgent === currentUser.id);
  // Per-lead unread chat-message counts, keyed by user/lead id. Polled in
  // one round-trip via /api/admin/messages/unread_counts so the lead list
  // can render a small red badge on each row that has new client replies
  // without firing N parallel fetches.
  const [unreadByLead, setUnreadByLead] = useState({});
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      const { counts } = await getAdminUnreadMessageCounts();
      if (!cancelled) setUnreadByLead(counts || {});
    };
    tick();
    const id = setInterval(tick, 5000);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filterCountry, setFilterCountry] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFunnel, setFilterFunnel] = useState('');
  const [filterAffiliate, setFilterAffiliate] = useState('');
  const [filterLastComment, setFilterLastComment] = useState('');
  const [filterRegistered, setFilterRegistered] = useState('');
  const [activeFilterDropdown, setActiveFilterDropdown] = useState('');
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState('asc');
  const nativeTabs = ['leads', 'notifications', 'deposits'];
  const tabStorageKey = `agent_activeTab:${currentUser?.id || 'unknown'}`;
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem(tabStorageKey);
    return nativeTabs.includes(saved) ? saved : 'leads';
  });
  const [leadUploadEnabled, setLeadUploadEnabled] = useState(Boolean(currentUser?.capabilities?.lead_upload));
  const [leadUploadLoading, setLeadUploadLoading] = useState(true);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const nativeTabActive = ['leads', 'notifications', 'deposits'].includes(activeTab);
  useEffect(() => { sessionStorage.setItem(tabStorageKey, activeTab); }, [activeTab, tabStorageKey]);
  useEffect(() => {
    let cancelled = false;
    setLeadUploadLoading(true);
    const loadCapability = async () => {
      try {
        let result;
        try {
          result = await getStaffCapabilities(currentUser.id);
        } catch (_) {
          const profile = await fetchAdminMe();
          result = { capabilities: profile.capabilities || {} };
        }
        if (!cancelled) setLeadUploadEnabled(Boolean(result.capabilities?.lead_upload));
      } catch (_) {
        if (!cancelled) setLeadUploadEnabled(false);
      } finally {
        if (!cancelled) setLeadUploadLoading(false);
      }
    };
    if (currentUser?.id) loadCapability();
    return () => { cancelled = true; };
  }, [currentUser?.id]);
  useEffect(() => {
    const handler = (e) => setActiveTab(e.detail.tab);
    window.addEventListener('admin:goto-tab', handler);
    return () => window.removeEventListener('admin:goto-tab', handler);
  }, []);
  const returnTo = location.state?.returnTo;
  const returnLabel = location.state?.returnLabel || 'Back to Team Leader';


  const handleFilterChange = (column, value) => {
    if (column === 'country') setFilterCountry(value);
    if (column === 'status') setFilterStatus(value);
    if (column === 'funnel') setFilterFunnel(value);
    if (column === 'affiliate') setFilterAffiliate(value);
    if (column === 'lastComment') setFilterLastComment(value);
    if (column === 'registered') setFilterRegistered(value);
    setActiveFilterDropdown('');
  };

  const handleClearAll = () => {
    setFilterCountry('');
    setFilterStatus('');
    setFilterFunnel('');
    setFilterAffiliate('');
    setFilterLastComment('');
    setFilterRegistered('');
    setSortColumn('');
    setSortDirection('asc');
    setSearch('');
    setPage(1);
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const countries = Array.from(new Set(myLeads.map((lead) => lead.country || '').filter(Boolean))).sort();
  const statuses = Array.from(new Set(myLeads.map((lead) => normalizeStage(lead.stage || '')).filter(Boolean))).sort();
  const funnels = Array.from(new Set(myLeads.map((lead) => lead.funnel || '').filter(Boolean))).sort();
  const affiliates = Array.from(new Set(myLeads.map((lead) => lead.affiliate || '').filter(Boolean))).sort();
  const lastComments = Array.from(new Set(myLeads.map((lead) => lead.lastCommentDate || '').filter(Boolean))).sort();
  const registeredDates = Array.from(new Set(myLeads.map((lead) => lead.registeredDate || '').filter(Boolean))).sort();

  const filteredLeads = myLeads.filter((lead) => {
    const lower = search.toLowerCase();
    const stage = normalizeStage(lead.stage || '');

    if (filterCountry && lead.country !== filterCountry) return false;
    if (filterStatus && stage !== filterStatus) return false;
    if (filterFunnel && (lead.funnel || '') !== filterFunnel) return false;
    if (filterAffiliate && (lead.affiliate || '') !== filterAffiliate) return false;
    if (filterLastComment && (lead.lastCommentDate || '') !== filterLastComment) return false;
    if (filterRegistered && (lead.registeredDate || '') !== filterRegistered) return false;

    return (
      lead.id.toLowerCase().includes(lower) ||
      lead.firstName.toLowerCase().includes(lower) ||
      lead.lastName.toLowerCase().includes(lower) ||
      lead.phone.toLowerCase().includes(lower) ||
      lead.email.toLowerCase().includes(lower) ||
      lead.country.toLowerCase().includes(lower) ||
      (lead.funnel || '').toLowerCase().includes(lower) ||
      (lead.affiliate || '').toLowerCase().includes(lower) ||
      stage.toLowerCase().includes(lower)
    );
  });

  const sortedLeads = [...filteredLeads].sort((a, b) => {
    if (!sortColumn) return 0;
    let aVal, bVal;
    switch (sortColumn) {
      case 'firstName': aVal = a.firstName; bVal = b.firstName; break;
      case 'lastName': aVal = a.lastName; bVal = b.lastName; break;
      case 'country': aVal = a.country; bVal = b.country; break;
      case 'status': aVal = normalizeStage(a.stage); bVal = normalizeStage(b.stage); break;
      case 'funnel': aVal = a.funnel || ''; bVal = b.funnel || ''; break;
      case 'affiliate': aVal = a.affiliate || ''; bVal = b.affiliate || ''; break;
      case 'lastComment': aVal = a.lastCommentDate || ''; bVal = b.lastCommentDate || ''; break;
      case 'registered': aVal = a.registeredDate || ''; bVal = b.registeredDate || ''; break;
      default: return 0;
    }
    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const pendingAppointments = myLeads
    .flatMap((lead) => (lead.appointments || []).map((appt) => ({
      ...appt,
      leadName: `${lead.firstName} ${lead.lastName}`,
      leadId: lead.id,
    })))
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / pageSize));
  useEffect(() => {
    setPage(1);
  }, [search, pageSize, myLeads.length]);

  const pagedLeads = sortedLeads.slice((page - 1) * pageSize, page * pageSize);

  if (!currentUser) {
    return (
      <div className="aax-card">
        <h2>Agent Portfolio</h2>
        <p>No agent data found. Please select or login as an Agent.</p>
      </div>
    );
  }

  return (
    <div className="aax-card aax-agent-portfolio">
      <div className="aax-agent-hero">
        <div>
          <h2>Agent Portfolio</h2>
          <p>{currentUser.name} - {getTeamName(currentUser.teamId, data.teams)} / {getOfficeName(currentUser.officeId, data.offices)}</p>
        </div>
        <div className="aax-agent-hero-actions">
          {returnTo && (
            <button className="aax-small-btn" onClick={() => navigate(returnTo)}>
              Back: {returnLabel}
            </button>
          )}
          {!leadUploadLoading && leadUploadEnabled && createLead && (
            <button className="aax-small-btn aax-pagination-btn-gold" onClick={() => setShowCreateLead(true)}>
              + New Lead
            </button>
          )}
          <div className="aax-agent-status-chip">{currentUser.isLoggedIn ? 'Online' : 'Offline'}</div>
        </div>
      </div>

      <div className="aax-super-admin-header aax-role-panel-header" style={{ marginBottom: 14 }}>
        <div className="aax-super-admin-tabs">
          {['leads', 'notifications', 'deposits'].map((tab) => (
            <button
              key={tab}
              className={`aax-super-admin-tab-btn ${activeTab === tab ? 'aax-active' : ''}`}
              onClick={() => setActiveTab(tab)}
              aria-label={`Switch to ${tab}`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <ReactCapabilityWorkspace
        data={data}
        currentUser={currentUser}
        showNotification={showNotification}
        activeTab={activeTab}
        onActiveChange={setActiveTab}
        nativeTabKeys={nativeTabs}
        fallbackTab="leads"
        showPanel={!nativeTabActive}
      />
      {nativeTabActive && pendingAppointments.length > 0 && (
        <div className="aax-card" style={{ background: '#363B44', marginBottom: 12 }}>
          <h3>Pending Appointments</h3>
          <ul className="aax-pending-appointments-list">
            {pendingAppointments.slice(0, 8).map((appt) => (
              <li key={`${appt.id}-${appt.leadId}`}>
                <strong>{appt.date} {appt.time}</strong> - {appt.title || 'Untitled'} for {appt.leadName}
              </li>
            ))}
          </ul>
          {pendingAppointments.length > 8 && <small>{pendingAppointments.length} upcoming appointments total</small>}
        </div>
      )}

      {nativeTabActive && activeTab === 'leads' && (
        <div className="aax-agent-leads-content">
          <div className="agent-tools-row" style={{ marginBottom: 12 }}>
            <SearchAutocomplete
              className="aax-input"
              placeholder="Search leads..."
              value={search}
              onChange={(v) => setSearch(v)}
              fetchSuggestions={searchAdminLeads}
              style={{ flex: 1, minWidth: 200 }}
              buildSuggestions={(q) => {
                const ql = q.toLowerCase();
                return myLeads
                  .filter(l => {
                    const full = `${l.firstName || ''} ${l.lastName || ''}`.toLowerCase();
                    return (
                      full.includes(ql) ||
                      String(l.id || '').toLowerCase().includes(ql) ||
                      (l.email || '').toLowerCase().includes(ql) ||
                      (l.phone || '').toLowerCase().includes(ql) ||
                      (l.country || '').toLowerCase().includes(ql) ||
                      (l.funnel || '').toLowerCase().includes(ql) ||
                      (l.affiliate || '').toLowerCase().includes(ql) ||
                      (l.stage || '').toLowerCase().includes(ql)
                    );
                  })
                  .slice(0, 8)
                  .map(l => ({
                    key: l.id,
                    value: `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.email || l.phone || String(l.id || ''),
                    label: `${l.firstName || ''} ${l.lastName || ''}`.trim() || '(no name)',
                    meta: [l.country, l.stage].filter(Boolean).join('  /  '),
                  }));
              }}
            />
            <label>
              Page size:
              <select className="small-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <button className="aax-small-btn" onClick={handleClearAll}>Clear All Filters</button>
          </div>

          <div className="aax-lead-table-wrapper">
            <table className="aax-table aax-lead-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th onClick={() => handleSort('firstName')} className="aax-sortable">
                    First {sortColumn === 'firstName' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th onClick={() => handleSort('lastName')} className="aax-sortable">
                    Last {sortColumn === 'lastName' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                  </th>
                  <th>Online</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th className={`aax-filter-column ${filterCountry ? 'aax-filtered' : ''}`}>
                    Country
                    <FilterPopover
                      label="Country"
                      value={filterCountry}
                      options={countries}
                      open={activeFilterDropdown === 'country'}
                      onToggle={() => setActiveFilterDropdown(activeFilterDropdown === 'country' ? '' : 'country')}
                      onSelect={(v) => handleFilterChange('country', v)}
                      onClose={() => setActiveFilterDropdown('')}
                    />
                  </th>
                  <th className={`aax-filter-column ${filterStatus ? 'aax-filtered' : ''}`}>
                    Status
                    <FilterPopover
                      label="Status"
                      value={filterStatus}
                      options={statuses}
                      open={activeFilterDropdown === 'status'}
                      onToggle={() => setActiveFilterDropdown(activeFilterDropdown === 'status' ? '' : 'status')}
                      onSelect={(v) => handleFilterChange('status', v)}
                      onClose={() => setActiveFilterDropdown('')}
                    />
                  </th>
                  <th className={`aax-filter-column ${filterFunnel ? 'aax-filtered' : ''}`}>
                    Funnel
                    <FilterPopover
                      label="Funnel"
                      value={filterFunnel}
                      options={funnels}
                      open={activeFilterDropdown === 'funnel'}
                      onToggle={() => setActiveFilterDropdown(activeFilterDropdown === 'funnel' ? '' : 'funnel')}
                      onSelect={(v) => handleFilterChange('funnel', v)}
                      onClose={() => setActiveFilterDropdown('')}
                    />
                  </th>
                  <th className={`aax-filter-column ${filterAffiliate ? 'aax-filtered' : ''}`}>
                    Affiliate
                    <FilterPopover
                      label="Affiliate"
                      value={filterAffiliate}
                      options={affiliates}
                      open={activeFilterDropdown === 'affiliate'}
                      onToggle={() => setActiveFilterDropdown(activeFilterDropdown === 'affiliate' ? '' : 'affiliate')}
                      onSelect={(v) => handleFilterChange('affiliate', v)}
                      onClose={() => setActiveFilterDropdown('')}
                    />
                  </th>
                  <th className={`aax-filter-column ${filterLastComment ? 'aax-filtered' : ''}`}>
                    Last Comment
                    <FilterPopover
                      label="Last comment"
                      value={filterLastComment}
                      options={lastComments}
                      open={activeFilterDropdown === 'lastComment'}
                      onToggle={() => setActiveFilterDropdown(activeFilterDropdown === 'lastComment' ? '' : 'lastComment')}
                      onSelect={(v) => handleFilterChange('lastComment', v)}
                      onClose={() => setActiveFilterDropdown('')}
                    />
                  </th>
                  <th className={`aax-filter-column ${filterRegistered ? 'aax-filtered' : ''}`}>
                    Registered
                    <FilterPopover
                      label="Registered"
                      value={filterRegistered}
                      options={registeredDates}
                      open={activeFilterDropdown === 'registered'}
                      onToggle={() => setActiveFilterDropdown(activeFilterDropdown === 'registered' ? '' : 'registered')}
                      onSelect={(v) => handleFilterChange('registered', v)}
                      onClose={() => setActiveFilterDropdown('')}
                    />
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedLeads.map((lead) => {
                  const unread = unreadByLead[lead.id] || 0;
                  return (
                  <tr key={lead.id} onClick={() => navigate(getLeadProfilePath(ROLE.AGENT, currentUser.id, lead.id))}>
                    <td>
                      {formatLeadId(lead.id)}
                      {unread > 0 && (
                        <span
                          title={`${unread} unread message${unread === 1 ? '' : 's'}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginLeft: 6,
                            background: '#f6465d',
                            color: '#fff',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            minWidth: 18,
                            height: 18,
                            borderRadius: 9,
                            padding: '0 6px',
                            lineHeight: 1,
                          }}
                        >
                          <i className="fas fa-comment-dots" style={{ fontSize: '0.65rem', marginRight: 3 }} />
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </td>
                    <td>{lead.firstName}</td>
                    <td>{lead.lastName}</td>
                    <td>
                      <span className={`aax-online-dot ${lead.isOnline ? 'aax-online' : 'aax-offline'}`} title={lead.isOnline ? 'Online' : 'Offline'}></span>
                    </td>
                    <td>{lead.phone}</td>
                    <td>{lead.email}</td>
                    <td>{getCountryFlag(lead.countryCode, lead.country)}</td>
                    <td><span className={`aax-status-chip ${statusClass(normalizeStage(lead.stage))}`}>{normalizeStage(lead.stage)}</span></td>
                    <td>{lead.funnel || '-'}</td>
                    <td>{lead.affiliate || '-'}</td>
                    <td>{lead.lastCommentDate || '-'}</td>
                    <td>{lead.registeredDate || '-'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredLeads.length === 0 && <div className="aax-empty-state">No assigned leads</div>}
          </div>

          <div className="aax-table-controls" style={{ marginTop: 0 }}>
            <span>Showing {pagedLeads.length} of {sortedLeads.length} leads</span>
            <button className="aax-small-btn aax-pagination-btn-gold" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span>Page {page}/{totalPages}</span>
            <button className="aax-small-btn aax-pagination-btn-gold" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}

      {nativeTabActive && activeTab === 'notifications' && (
        <div className="aax-card">
          <h3>Notifications</h3>
          <AdminNotificationsInbox pollMs={30000} />
        </div>
      )}

      {nativeTabActive && activeTab === 'deposits' && (() => {
        const depositLeads = myLeads.filter((lead) => ['Deposit', 'Failed Deposit'].includes(lead.stage));
        return (
          <div className="aax-card">
            <h3>Deposits</h3>
            {depositLeads.length === 0 ? (
              <p>No leads have reached the Deposit or Failed Deposit stage yet.</p>
            ) : (
              <div className="deposit-list">
                <table className="aax-table">
                  <thead>
                    <tr>
                      <th>Lead</th>
                      <th>Stage</th>
                      <th>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositLeads.map((lead) => (
                      <tr key={lead.id}>
                        <td>{lead.firstName} {lead.lastName}</td>
                        <td>{lead.stage}</td>
                        <td>{lead.lastCommentDate || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {showCreateLead && createLead && (
        <CreateLeadModal
          scope={{ officeId: currentUser.officeId, teamId: currentUser.teamId, agentId: currentUser.id }}
          teamsForOffice={[]}
          agents={[]}
          onClose={() => setShowCreateLead(false)}
          onCreate={async (payload) => {
            const created = await createLead(payload);
            if (created) setShowCreateLead(false);
          }}
        />
      )}

    </div>
  );
}

function LeadProfilePage({ role, viewingUser, data, updateLead, showNotification }) {
  const { leadId } = useParams();
  const currentUser = viewingUser;
  const navigate = useNavigate();
  const [confirmDialog, confirm] = useConfirmDialog();
  const workspacePath = getRoleWorkspacePath(role, currentUser?.id);
  const visibleLeads = getRoleScopedLeads(data, role, currentUser);
  const lead = visibleLeads.find((l) => l.id === leadId);
  const [status, setStatus] = useState(normalizeStage(lead?.stage || 'New'));
  const [comment, setComment] = useState(lead?.comment || '');
  const [passwordInput, setPasswordInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState('');
  // Live messages from the backend. The thread is keyed by lead.id (which
  // is the same as users.id since the unify-people migration). Sender is
  // 'agent' for staff replies, 'client' for the lead's own messages.
  const [clientChat, setClientChat] = useState([]);
  const [attachmentUrls, setAttachmentUrls] = useState({});
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentTitle, setAppointmentTitle] = useState('');
  const [appointmentNotes, setAppointmentNotes] = useState('');
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [liveClientPassword, setLiveClientPassword] = useState(lead?.clientPassword || '');
  const [showChatModal, setShowChatModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositStatus, setDepositStatus] = useState('');
  const [prevStatus, setPrevStatus] = useState('');
  const [showClientPassword, setShowClientPassword] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawalHistory, setWithdrawalHistory] = useState([]);
  const [withdrawalHistoryLoading, setWithdrawalHistoryLoading] = useState(false);
  const [depositHistory, setDepositHistory] = useState([]);
  const [depositHistoryLoading, setDepositHistoryLoading] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showEditLeadModal, setShowEditLeadModal] = useState(false);
  const [showKycReviewModal, setShowKycReviewModal] = useState(false);
  // Default to enabled when the field has never been set, so existing leads
  // keep their trades access until the agent explicitly switches it off.
  const tradesEnabled = lead?.tradesEnabled !== false;
  const cardsEnabled  = lead?.cardsEnabled  !== false;
  const chatEndRef       = useRef(null);
  const typingTimeoutRef = useRef(null);
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [clientChat, showChatModal]);

  // Pull the chat thread from the backend and poll while the chat modal is
  // open. Once closed we stop polling so we don't burn requests on every
  // open lead detail page that nobody is looking at. We also stamp every
  // unread CLIENT message as read on the very first load - opening the
  // chat IS the act of reading it, so the row badge clears in the same
  // tick the agent looks at the conversation.
  useEffect(() => {
    if (!lead?.id || !showChatModal) return undefined;
    let cancelled = false;
    let inFlight = false;
    let firstLoad = true;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const result = await getAdminMessages(lead.id, { limit: 200 });
        if (cancelled) return;
        setClientChat(result.messages);
        if (firstLoad && result.unreadCount > 0) {
          markAdminMessagesRead(lead.id).catch(() => {});
        }
        firstLoad = false;
      } catch (err) {
        if (!cancelled) setChatError(err?.message || 'Could not load messages.');
      } finally {
        inFlight = false;
      }
    };
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [lead?.id, showChatModal]);

  useEffect(() => {
    if (!showChatModal) return undefined;
    let cancelled = false;
    const loadAttachments = async () => {
      const rows = clientChat.filter(m => m.attachment && !attachmentUrls[m.id]);
      const loaded = await Promise.all(rows.map(async m => {
        try { return [m.id, await getAdminMessageAttachmentUrl(m.id)]; } catch (_) { return null; }
      }));
      const resolved = loaded.filter(Boolean);
      if (!cancelled && resolved.length > 0) {
        setAttachmentUrls(prev => ({ ...prev, ...Object.fromEntries(resolved) }));
      }
    };
    loadAttachments();
    return () => { cancelled = true; };
  }, [clientChat, showChatModal, attachmentUrls]);

  useEffect(() => {
    if (!showChatModal) setAttachmentUrls({});
  }, [lead?.id, showChatModal]);

  // Presence heartbeat: report agent as online while the chat modal is open.
  // Expires naturally on the client side (>60s = offline) when modal is closed.
  useEffect(() => {
    if (!lead?.id || !showChatModal) return undefined;
    const beat = () => postAdminPresence(lead.id, { isTyping: false }).catch(() => {});
    beat();
    const id = setInterval(beat, 20000);
    return () => clearInterval(id);
  }, [lead?.id, showChatModal]);

  // Typing indicator: fire is_typing=true on input change, then reset after 4s idle.
  useEffect(() => {
    if (!lead?.id || !showChatModal || !chatInput.trim()) return;
    postAdminPresence(lead.id, { isTyping: true }).catch(() => {});
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      postAdminPresence(lead.id, { isTyping: false }).catch(() => {});
    }, 4000);
  }, [chatInput, lead?.id, showChatModal]);

  // Fetch real withdrawal history from the backend when the modal opens.
  useEffect(() => {
    if (!showWithdrawModal || !lead?.id) return;
    let cancelled = false;
    setWithdrawalHistoryLoading(true);
    listAdminWithdrawals({ userId: lead.id, limit: 200 })
      .then(res => { if (!cancelled) setWithdrawalHistory(res.withdrawals || []); })
      .catch(() => { if (!cancelled) setWithdrawalHistory([]); })
      .finally(() => { if (!cancelled) setWithdrawalHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [lead?.id, showWithdrawModal]);

  // Fetch real deposit/transaction history from the backend when the deposit
  // history modal opens (the standalone "Deposits" button, not the status-change flow).
  useEffect(() => {
    if (!lead?.id || depositStatus) return;
    if (!showDepositModal) return;
    let cancelled = false;
    setDepositHistoryLoading(true);
    listUserTransactions(lead.id, { limit: 200, type: 'Deposit' })
      .then(res => { if (!cancelled) setDepositHistory(res.transactions || []); })
      .catch(() => { if (!cancelled) setDepositHistory([]); })
      .finally(() => { if (!cancelled) setDepositHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [lead?.id, showDepositModal, depositStatus]);

  // Delete a single message on both sides. Optimistically removes the
  // bubble locally, then asks the backend. Rollback on failure so the
  // agent never sees a "ghost-deleted" row reappear on the next poll.
  const handleDeleteMessage = async (messageId) => {
    if (!messageId || String(messageId).startsWith('tmp-')) return;
    const ok = await confirm({
      title: 'Delete message?',
      message: 'This removes the message for both the agent and the client. There will be no trace.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    const snapshot = clientChat;
    setClientChat(prev => prev.filter(m => m.id !== messageId));
    try {
      await deleteAdminMessage(messageId);
    } catch (err) {
      setClientChat(snapshot);
      showNotification && showNotification(err?.message || 'Failed to delete message.');
    }
  };

  // Wipe the entire conversation on both sides. Same confirm-then-call
  // pattern. We close the modal afterwards because there's nothing left
  // to look at.
  const handleClearChat = async () => {
    if (!lead?.id) return;
    const ok = await confirm({
      title: 'Clear entire chat?',
      message: `This deletes every message between you and ${lead.firstName} ${lead.lastName} for both sides. There will be no trace.`,
      confirmLabel: 'Clear chat',
      tone: 'danger',
    });
    if (!ok) return;
    const snapshot = clientChat;
    setClientChat([]);
    try {
      await clearAdminChat(lead.id);
      showNotification && showNotification('Chat cleared.');
    } catch (err) {
      setClientChat(snapshot);
      showNotification && showNotification(err?.message || 'Failed to clear chat.');
    }
  };


  const handleSetLeadPassword = async () => {
    if (!lead || !passwordInput.trim()) return;
    const pwd = passwordInput.trim();
    try {
      await adminSetClientPassword(lead.id, pwd);
      updateLead(lead.id, { clientPassword: pwd, client_password: pwd });
      setLiveClientPassword(pwd);
      setPasswordInput('');
      showNotification(`Password updated for ${lead.firstName} ${lead.lastName}.`, 'success');
    } catch (err) {
      showNotification(`Failed to set password: ${err.message || 'unknown error'}`, 'error');
    }
  };

  useEffect(() => {
    if (lead) {
      setStatus(normalizeStage(lead.stage || 'New'));
      setComment(lead.comment || '');
      setPasswordInput('');
    }
  }, [lead?.id, lead?.stage]);

  useEffect(() => {
    if (!showSecurityModal || !lead?.id) return;
    let cancelled = false;
    fetchLeadById(lead.id)
      .then((fresh) => { if (!cancelled) setLiveClientPassword(fresh?.clientPassword || ''); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showSecurityModal, lead?.id]);

  const handleSendClientMessage = async () => {
    const text = chatInput.trim();
    if (!lead || !text || chatSending) return;
    setChatSending(true);
    setChatError('');
    clearTimeout(typingTimeoutRef.current);
    postAdminPresence(lead.id, { isTyping: false }).catch(() => {});
    // Optimistic insert so the agent sees their message immediately even
    // before the backend confirms. We tag it with a temp id and overwrite
    // the row when the saved message comes back.
    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      id:        tempId,
      sender:    'agent',
      text,
      body:      text,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      readAt:    null,
      pending:   true,
    };
    setClientChat(prev => [...prev, optimistic]);
    setChatInput('');
    try {
      const saved = await sendAdminMessage(lead.id, text);
      setClientChat(prev => prev.map(m => (m.id === tempId && saved ? saved : m)));
    } catch (err) {
      // Roll back the optimistic insert and put the text back so the
      // agent can retry without retyping.
      setClientChat(prev => prev.filter(m => m.id !== tempId));
      setChatInput(text);
      setChatError(err?.message || 'Failed to send message.');
      showNotification && showNotification(err?.message || 'Failed to send message.');
    } finally {
      setChatSending(false);
    }
  };

  if (!lead) {
    return (
      <div className="aax-card">
        <h2>Lead Not Found</h2>
        <p>This lead either does not exist or is not available to this admin.</p>
        <button className="aax-small-btn" onClick={() => navigate(workspacePath)}>Back to leads</button>
      </div>
    );
  }

  const currentIndex = visibleLeads.findIndex((l) => l.id === lead.id);
  const prevLead = visibleLeads[currentIndex - 1] || null;
  const nextLead = visibleLeads[currentIndex + 1] || null;

  const handleStatusChange = (newStatus) => {
    if (newStatus === status) return;
    setPrevStatus(status);
    setStatus(newStatus);
    if (newStatus === 'Deposit' || newStatus === 'Failed Deposit') {
      setDepositStatus(newStatus);
      setDepositAmount('');
      setShowDepositModal(true);
    }
  };

  const handleConfirmDeposit = () => {
    const amount = Number(depositAmount);
    if (!lead || isNaN(amount) || amount <= 0) {
      showNotification('Please enter a valid deposit amount.');
      return;
    }

    const depositEntry = {
      status: depositStatus,
      amount,
      date: new Date().toISOString().slice(0, 10),
    };

    updateLead(lead.id, {
      stage: depositStatus,
      lastCommentDate: new Date().toISOString().slice(0, 10),
    });

    setShowDepositModal(false);
    setDepositAmount('');
    setPrevStatus('');

    showNotification(`Deposit ${depositStatus === 'Deposit' ? 'confirmed' : 'marked as failed'}: ${amount}`);
  };

  const actorName = currentUser?.name || 'Unknown';
  const isSuperAdmin = currentUser?.role === ROLE.SUPER_ADMIN;

  const handleAddComment = () => {
    if (!comment.trim()) return;
    updateLead(lead.id, { comment: comment.trim(), lastCommentDate: new Date().toISOString().slice(0, 10), _actorName: actorName, _actorId: currentUser?.id });
    showNotification('Comment posted successfully.');
    setComment('');
  };

  const handleDeleteComment = async (commentId) => {
    if (!isSuperAdmin) return;
    const ok = await confirm({
      title: 'Delete comment?',
      message: 'Delete this comment from the lead history? This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const updated = await deleteLeadCommentApi(lead.id, commentId);
      if (updated && updated.id) {
        updateLead(lead.id, { commentHistory: updated.commentHistory, statusHistory: updated.statusHistory, _actorName: actorName, _actorId: currentUser?.id });
      }
      showNotification('Comment removed.');
    } catch (err) {
      console.error('[AgentPanel] deleteComment failed', err);
      showNotification('Failed to delete comment.');
    }
  };

  const handleDeleteStatusEntry = async (idx) => {
    if (!isSuperAdmin) return;
    const entry = (lead.statusHistory || [])[idx];
    if (!entry) return;
    const ok = await confirm({
      title: 'Delete status entry?',
      message: 'Delete this status-change entry from the lead history? This cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const serverLead = await deleteLeadStatusEntryApi(lead.id, entry.id);
      if (serverLead?.id) {
        updateLead(lead.id, { ...serverLead, _actorName: actorName, _actorId: currentUser?.id });
      }
      showNotification('Status entry removed.');
    } catch {
      showNotification('Failed to delete status entry - please try again.');
    }
  };

  const handleAddAppointment = () => {
    if (!appointmentDate || !appointmentTime || !appointmentTitle.trim()) {
      showNotification('Date, time, and title are required to create appointment.');
      return;
    }
    const newAppointment = {
      id: `${Date.now()}`,
      date: appointmentDate,
      time: appointmentTime,
      title: appointmentTitle.trim(),
      notes: appointmentNotes.trim() || 'No additional notes',
      createdBy: currentUser?.name || 'Agent',
    };
    const nextAppointments = [...(lead.appointments || []), newAppointment].slice(-50);
    updateLead(lead.id, { appointments: nextAppointments });
    showNotification('Appointment scheduled successfully.');
    setAppointmentDate('');
    setAppointmentTime('');
    setAppointmentTitle('');
    setAppointmentNotes('');
    setShowAppointmentModal(false);
  };

  const commentHistory = (lead.commentHistory || []).filter(
    (c) => c && c.text && !/^assigned to\b/i.test(String(c.text).trim())
  );
  const statusHistory = lead.statusHistory || [];
  const assignedByDisplay = (lead.assignedBy || '').split('→').pop().trim() || '-';

  return (
    <>
    {confirmDialog}
    <div className="aax-card aax-agent-profile-full">
      <div className="aax-panel-header">
        <div className="aax-nav-left">
          <button className="aax-small-btn" onClick={() => navigate(workspacePath)}>Back to leads</button>
        </div>
        <div className="aax-nav-right">
          <button className="aax-small-btn" onClick={() => prevLead && navigate(getLeadProfilePath(role, currentUser.id, prevLead.id))} disabled={!prevLead}>◀ Prev</button>
          <button className="aax-small-btn" onClick={() => nextLead && navigate(getLeadProfilePath(role, currentUser.id, nextLead.id))} disabled={!nextLead}>Next ▶</button>
        </div>
      </div>
      <div className="aax-section-title" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: lead.isOnline ? '#0ECB81' : '#848E9C', display: 'inline-block' }} />
            <span style={{ color: lead.isOnline ? '#0ECB81' : '#848E9C', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {lead.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <h2 style={{ margin: 0 }}>Lead Profile: {lead.firstName} {lead.lastName}</h2>
        </div>
        <div style={{ flex: '0 0 auto', marginLeft: 'auto' }}>
          <button
            className="aax-small-btn aax-action-btn aax-login-btn"
            style={{ whiteSpace: 'nowrap' }}
            onClick={async () => {
              if (!lead || !lead.id) return;
              try {
                const notifications = await getLeadNotificationsAsAdmin(lead.id);
                sessionStorage.setItem('chainiq_impersonate_notifications', JSON.stringify(notifications));
              } catch (_) { /* non-fatal */ }
              try { sessionStorage.setItem('chainiq_impersonate_lead', JSON.stringify(lead)); } catch (_) {}
              window.location.href = `${window.location.origin}/login?impersonateLeadId=${encodeURIComponent(lead.id)}`;
            }}
          >
            Enter Lead Account
          </button>
        </div>
        <div className="aax-profile-action-buttons">
          <button type="button" className="aax-action-btn aax-deposit-btn" onClick={() => setShowDepositModal(true)} title="View deposit history"><PaIcon name="deposit" />Deposits</button>
          <button type="button" className="aax-action-btn aax-withdraw-btn" onClick={() => setShowWithdrawModal(true)} title="View withdrawal history"><PaIcon name="withdraw" />Withdrawals</button>
          <button type="button" className="aax-action-btn aax-activity-btn" onClick={() => setShowActivityModal(true)} title="View client activity"><PaIcon name="activity" />Activity</button>
          <button type="button" className="aax-action-btn aax-appointment-btn" onClick={() => setShowAppointmentModal(true)} title="Schedule appointment"><PaIcon name="appointment" />Appointments</button>
          <button type="button" className="aax-action-btn aax-security-btn" onClick={() => setShowSecurityModal(true)} title="Lead security settings"><PaIcon name="security" />Lead Security</button>
          <button type="button" className="aax-action-btn aax-support-btn" onClick={() => setShowChatModal(true)} title="Open support chat"><PaIcon name="support" />Lead Support</button>
          <button type="button" className="aax-action-btn aax-kyc-btn" onClick={() => setShowKycReviewModal(true)} title="Review submitted KYC documents"><PaIcon name="kyc" />KYC Review</button>
        </div>
      </div>

      {/* Lead Category - read-only for agents; only Super Admin can change this */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: 12,
          flexWrap: 'wrap',
          padding: '14px 18px',
          margin: '14px 0',
          borderRadius: 12,
          background: tradesEnabled
            ? 'linear-gradient(135deg, rgba(14, 203, 129, 0.10) 0%, rgba(14, 203, 129, 0.03) 100%)'
            : 'linear-gradient(135deg, rgba(245, 158, 11, 0.10) 0%, rgba(245, 158, 11, 0.03) 100%)',
          border: `1px solid ${tradesEnabled ? 'rgba(14, 203, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
        }}
      >
        {/* Category badge */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, flex: '1 1 200px' }}>
          <div style={{ fontSize: 10, color: '#848E9C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Lead Category</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 14px',
                borderRadius: 999,
                background: tradesEnabled ? 'rgba(14, 203, 129, 0.18)' : 'rgba(245, 158, 11, 0.16)',
                color: tradesEnabled ? '#0ECB81' : '#F59E0B',
                border: `1px solid ${tradesEnabled ? 'rgba(14, 203, 129, 0.5)' : 'rgba(245, 158, 11, 0.45)'}`,
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: '0.06em',
              }}
            >
              {tradesEnabled ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 12h18M3 6h18M3 18h18" />
                </svg>
              )}
              {tradesEnabled ? 'Forex Lead' : 'Recovery Lead'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#848E9C', marginTop: 2, lineHeight: 1.45 }}>
            {tradesEnabled
              ? 'This client has the Trades section enabled - they can place and manage trades.'
              : 'This client is in recovery mode - the Trades section is not available to them.'}
          </div>
        </div>

        {/* Cards status */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, flex: '0 0 auto', borderLeft: '1px solid rgba(255,255,255,0.07)', paddingLeft: 16 }}>
          <div style={{ fontSize: 10, color: '#848E9C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Cards Feature</div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              borderRadius: 999,
              background: cardsEnabled ? 'rgba(155, 109, 255, 0.16)' : 'rgba(132, 142, 156, 0.12)',
              color: cardsEnabled ? '#9B6DFF' : '#848E9C',
              border: `1px solid ${cardsEnabled ? 'rgba(155, 109, 255, 0.45)' : 'rgba(132, 142, 156, 0.3)'}`,
              fontWeight: 700,
              fontSize: 12,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            {cardsEnabled ? 'Cards ON' : 'Cards OFF'}
          </span>
          <div style={{ fontSize: 10, color: '#848E9C', marginTop: 2 }}>
            {cardsEnabled ? 'Cards page visible' : 'Cards page hidden'}
          </div>
        </div>

        {/* Info note */}
        <div style={{ width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#848E9C', fontStyle: 'italic' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          Category is set by Super Admin. Contact your supervisor to change this lead's category.
        </div>
      </div>

      <div className="aax-detail-grid aax-detail-grid-three">
        <div className="aax-detail-column">
          <div className="aax-detail-row"><span className="aax-label">ID</span><span className="aax-value">{formatLeadId(lead.id)}</span></div>
          <div className="aax-detail-row"><span className="aax-label">Name</span><span className="aax-value">{lead.firstName} {lead.lastName}</span></div>
          <div className="aax-detail-row"><span className="aax-label">Phone</span><span className="aax-value">{lead.phone} <button type="button" className="aax-copy-icon" onClick={() => { navigator.clipboard.writeText(lead.phone); showNotification('Phone copied to clipboard'); }} aria-label="Copy phone"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"/></svg></button></span></div>
          <div className="aax-detail-row"><span className="aax-label">Email</span><span className="aax-value">{lead.email} <button type="button" className="aax-copy-icon" onClick={() => { navigator.clipboard.writeText(lead.email); showNotification('Email copied to clipboard'); }} aria-label="Copy email"><svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"/></svg></button></span></div>
          <div className="aax-detail-row"><span className="aax-label">Country</span><span className="aax-value aax-country-value">{getCountryFlag(lead.countryCode, lead.country)}<span className="aax-country-name">{lead.country || '-'}</span></span></div>
        </div>
        <div className="aax-detail-column">
          <div className="aax-detail-row"><span className="aax-label">Office</span><span className="aax-value">{getOfficeName(lead.assignedToOffice, data.offices)}</span></div>
          <div className="aax-detail-row"><span className="aax-label">Team</span><span className="aax-value">{getTeamName(lead.assignedToTeam, data.teams)}</span></div>
          <div className="aax-detail-row"><span className="aax-label">Assigned To</span><span className="aax-value">{getUserName(lead.assignedToAgent, data.users)}</span></div>
          <div className="aax-detail-row"><span className="aax-label">Assigned By</span><span className="aax-value" style={{ color: '#F0B90B', fontWeight: 600 }}>{assignedByDisplay}</span></div>
          <div className="aax-detail-row"><span className="aax-label">Funnel</span><span className="aax-value">{lead.funnel || '-'}</span></div>
          <div className="aax-detail-row"><span className="aax-label">Affiliate</span><span className="aax-value">{lead.affiliate || '-'}</span></div>
        </div>
        <div className="aax-detail-column">
          <div className="aax-detail-row"><span className="aax-label">Status</span><span className={`aax-status-chip ${statusClass(status)}`}>{status}</span></div>
          <div className="aax-field-group aax-status-dropdown-right">
            <label>Select Status</label>
            <select value={status} onChange={(e) => handleStatusChange(e.target.value)}>
              {LEAD_STATUSES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <button
              type="button"
              className="aax-post-comment-btn"
              style={{ marginTop: 8, alignSelf: 'flex-start' }}
              onClick={() => {
                if (status === lead.stage) {
                  showNotification('Status unchanged.');
                  return;
                }
                updateLead(lead.id, { stage: status, _actorName: actorName, _actorId: currentUser?.id });
                showNotification('Status saved to workflow.');
              }}
            >Save Status</button>
          </div>
          <div className="aax-detail-row"><span className="aax-label">Last Comment</span><span className="aax-value">{lead.lastCommentDate || '-'}</span></div>
          <div className="aax-detail-row"><span className="aax-label">Registered</span><span className="aax-value">{lead.registeredDate || '-'}</span></div>
        </div>
      </div>

      <div className="aax-profile-grid">
        <div className="aax-profile-column aax-comment-column">
          <div className="aax-comment-card">
            <h3>Comment</h3>
            <div className="aax-comment-input-area">
              <textarea rows={10} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a note about this lead..." />
              <div className="aax-comment-input-actions">
                <button className="aax-post-comment-btn" onClick={handleAddComment} disabled={!comment.trim()}>Save</button>
              </div>
            </div>
          </div>

          <div className="aax-comment-history-card">
            <h3>Comment History</h3>
            {commentHistory.length === 0 ? (
              <p>No comments yet. Please add client interaction notes.</p>
            ) : (
              <div className="aax-comment-history-container">
                <ul className="aax-comment-history-list">
                  {commentHistory.map((entry, idx) => (
                    <li key={entry.date + '-' + idx} className="aax-comment-history-item">
                      <div className="aax-comment-meta">
                        <span className="aax-comment-author">{entry.by || 'Unknown'}</span>
                        <span className="aax-comment-date">
                          {entry.date}
                          {isSuperAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(entry.id)}
                              style={{ marginLeft: 8, background: 'transparent', border: '1px solid #ff646440', color: '#ff6464', fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer' }}
                              title="Delete comment (super admin)"
                            >✕</button>
                          )}
                        </span>
                      </div>
                      <div className="aax-comment-text">{entry.text}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="aax-status-workflow-column">
          <div className="aax-status-workflow-card">
            <h3>Status Workflow</h3>
            <div className="aax-status-timeline">
              {statusHistory.length === 0 ? (
                <div className="aax-status-timeline-empty">No status changes recorded yet. Update the status to start tracking the workflow.</div>
              ) : (
                statusHistory.map((entry, idx) => {
                  const isTradesFlip =
                    (entry.from === 'Trades ON' || entry.from === 'Trades OFF') &&
                    (entry.to   === 'Trades ON' || entry.to   === 'Trades OFF');
                  const tradesNowOn = entry.to === 'Trades ON';
                  const tradesPillColor = tradesNowOn ? '#0ECB81' : '#F0B90B';
                  return (
                  <div key={idx} className="aax-status-timeline-row">
                    <div className="aax-status-timeline-arrow">
                      {isTradesFlip ? (
                        <span
                          className="aax-status-pill"
                          style={{
                            color: tradesPillColor,
                            border: `1px solid ${tradesPillColor}`,
                            background: tradesNowOn ? 'rgba(14, 203, 129, 0.10)' : 'rgba(240, 185, 11, 0.10)',
                            padding: '3px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                          title={`Trades ${tradesNowOn ? 'enabled' : 'disabled'} for this client`}
                        >
                          <span
                            aria-hidden
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: tradesPillColor,
                              boxShadow: tradesNowOn ? '0 0 6px rgba(14, 203, 129, 0.8)' : 'none',
                            }}
                          />
                          {tradesNowOn ? 'Trades enabled' : 'Trades disabled'}
                        </span>
                      ) : (
                        <>
                          <span className="aax-status-pill" style={{ color: stageColor(entry.from), border: `1px solid ${stageColor(entry.from)}`, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'transparent' }}>{entry.from}</span>
                          <span className="aax-status-pill-arrow">→</span>
                          <span className="aax-status-pill" style={{ color: stageColor(entry.to), border: `1px solid ${stageColor(entry.to)}`, padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'transparent' }}>{entry.to}</span>
                        </>
                      )}
                    </div>
                    <div className="aax-status-timeline-meta">
                      <span>By <span className="aax-by">{entry.byName || 'Unknown'}</span></span>
                      <span>{entry.at ? new Date(entry.at).toLocaleString() : ''}</span>
                    </div>
                    {isSuperAdmin && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="button" className="aax-delete-entry-btn" onClick={() => handleDeleteStatusEntry(idx)}>✕ Delete entry</button>
                      </div>
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {showAppointmentModal && (
        <div className="aax-modal-overlay" onClick={() => setShowAppointmentModal(false)}>
          <div className="aax-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="aax-modal-header">
              <h3>Schedule Appointment for {lead.firstName} {lead.lastName}</h3>
              <button className="aax-small-btn" onClick={() => setShowAppointmentModal(false)}>Close</button>
            </div>
            <div className="aax-field-group">
              <label>Title</label>
              <input className="aax-input" type="text" value={appointmentTitle} placeholder="e.g., Proposal meeting" onChange={(e) => setAppointmentTitle(e.target.value)} />
            </div>
            <div className="aax-field-group">
              <label>Date</label>
              <input className="aax-input" type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} />
            </div>
            <div className="aax-field-group">
              <label>Time</label>
              <input className="aax-input" type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} />
            </div>
            <div className="aax-field-group">
              <label>Notes</label>
              <textarea className="aax-input" rows={4} value={appointmentNotes} placeholder="Optional notes" onChange={(e) => setAppointmentNotes(e.target.value)} />
            </div>
            <div className="aax-comment-input-actions" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
              <button className="aax-post-comment-btn" onClick={handleAddAppointment} disabled={!appointmentDate || !appointmentTime || !appointmentTitle.trim()}>Save Appointment</button>
            </div>
          </div>
        </div>
      )}

      {showSecurityModal && (
        <div className="aax-modal-overlay" onClick={() => setShowSecurityModal(false)}>
          <div className="aax-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="aax-modal-header">
              <h3>Lead Security - {lead.firstName} {lead.lastName}</h3>
              <button className="aax-small-btn" onClick={() => setShowSecurityModal(false)}>Close</button>
            </div>
            <div className="aax-field-group" style={{ marginBottom: 12 }}>
              <label>Current Password</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  className="aax-input"
                  type={showClientPassword ? 'text' : 'password'}
                  value={liveClientPassword}
                  readOnly
                  placeholder="Not set"
                  style={{ flex: 1 }}
                />
                <button
                  className="aax-small-btn"
                  type="button"
                  onClick={() => setShowClientPassword((prev) => !prev)}
                >
                  {showClientPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <div className="aax-field-group" style={{ marginBottom: 12 }}>
              <label>New Password</label>
              <input className="aax-input" type="text" value={passwordInput} placeholder="Enter new password" onChange={(e) => setPasswordInput(e.target.value)} autoComplete="off" />
            </div>
            <div className="aax-row" style={{ gap: 8, marginBottom: 12 }}>
              <button className="aax-small-btn" onClick={handleSetLeadPassword} disabled={!passwordInput.trim()}>Save Password</button>
            </div>
          </div>
        </div>
      )}

      {showChatModal && (
        <div className="aax-modal-overlay" onClick={() => setShowChatModal(false)}>
          <div className="aax-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="aax-modal-header">
              <h3>Support Chat with {lead.firstName}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="aax-small-btn"
                  onClick={handleClearChat}
                  disabled={clientChat.length === 0}
                  style={{
                    background: '#f6465d',
                    color: '#fff',
                    borderColor: '#f6465d',
                    opacity: clientChat.length === 0 ? 0.5 : 1,
                  }}
                  title="Delete every message in this conversation, on both sides"
                >
                  <i className="fas fa-trash" style={{ marginRight: 4 }} /> Clear chat
                </button>
                <button className="aax-small-btn" onClick={() => setShowChatModal(false)}>Close</button>
              </div>
            </div>
            <div className="aax-chat-window">
              <div className="aax-chat-header">
                <span>{lead.firstName} {lead.lastName}</span>
                <span className={`aax-online-dot ${lead.isOnline ? 'aax-online' : 'aax-offline'}`} />
              </div>
              <div className="aax-chat-box">
                {clientChat.length === 0 && <div className="aax-chat-empty">No messages yet. Start the chat below.</div>}
                {clientChat.map((msg) => {
                  const canDelete = !msg.pending && !String(msg.id).startsWith('tmp-');
                  return (
                  <div key={msg.id} className={`aax-chat-message ${msg.sender === 'agent' ? 'aax-chat-agent' : 'aax-chat-client'}`}>
                    {canDelete && msg.sender === 'agent' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(msg.id)}
                        title="Delete message for both sides"
                        aria-label="Delete message"
                        className="aax-chat-delete-btn"
                      >
                        <i className="fas fa-trash-alt" />
                      </button>
                    )}
                    <div className="aax-chat-msg-col">
                      <div className="aax-chat-sender-label">
                        {msg.sender === 'agent'
                          ? (msg.name || currentUser?.name || 'Agent')
                          : `${lead.firstName} ${lead.lastName}`}
                      </div>
                      <div className="aax-chat-bubble">
                        <span>{msg.text}{msg.pending ? '  /  sending...' : ''}</span>
                        {msg.attachment && (attachmentUrls[msg.id]
                          ? (
                            <div className="aax-chat-attachment">
                              <img src={attachmentUrls[msg.id]} alt={msg.attachment.name || 'Client attached photo'} />
                              <a
                                href={attachmentUrls[msg.id]}
                                download={msg.attachment.name || 'client-photo'}
                                className="aax-chat-attachment-download"
                              >
                                <i className="fas fa-download" /> Download photo
                              </a>
                            </div>
                          )
                          : <small>Loading attached photo...</small>)}
                        <small>{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</small>
                      </div>
                    </div>
                    {canDelete && msg.sender !== 'agent' && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(msg.id)}
                        title="Delete message for both sides"
                        aria-label="Delete message"
                        className="aax-chat-delete-btn"
                      >
                        <i className="fas fa-trash-alt" />
                      </button>
                    )}
                  </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              {chatError && (
                <div className="aax-chat-empty" role="alert" style={{ color: 'var(--danger, #c0392b)' }}>{chatError}</div>
              )}
              <div className="aax-chat-input-row">
                <input
                  type="text"
                  className="aax-input"
                  placeholder="Type a message (Enter to send)"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendClientMessage();
                    }
                  }}
                  disabled={chatSending}
                  autoComplete="off"
                />
                <button className="aax-small-btn" onClick={handleSendClientMessage} disabled={chatSending || !chatInput.trim()}>
                  {chatSending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDepositModal && (
        <div className="aax-modal-overlay" onClick={() => { setShowDepositModal(false); setStatus(prevStatus || status); }}>
          <div className="aax-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="aax-modal-header">
              <h3>{depositStatus === 'Failed Deposit' ? 'Failed Deposit Amount' : 'Deposit Amount'} for {lead.firstName} {lead.lastName}</h3>
              <button className="aax-small-btn" onClick={() => { setShowDepositModal(false); setStatus(prevStatus || status); }}>Close</button>
            </div>
            <div className="aax-field-group">
              <label>Amount</label>
              <input
                className="aax-input"
                type="number"
                min="0"
                step="0.01"
                value={depositAmount}
                placeholder="e.g. 1200.00"
                onChange={(e) => setDepositAmount(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button className="aax-small-btn" onClick={() => { setShowDepositModal(false); setStatus(prevStatus || status); }}>Cancel</button>
              <button className="aax-small-btn" onClick={handleConfirmDeposit} disabled={!depositAmount || Number(depositAmount) <= 0}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Deposit History Modal */}
      {showDepositModal && !depositStatus && (
        <div className="aax-modal-overlay" onClick={() => setShowDepositModal(false)}>
          <div className="aax-modal-content aax-large-modal" onClick={e => e.stopPropagation()}>
            <div className="aax-modal-header">
              <h3>[money] Deposit History - {lead.firstName} {lead.lastName}</h3>
              <button className="aax-close-btn" onClick={() => setShowDepositModal(false)}>×</button>
            </div>
            <div className="aax-modal-body">
              <div className="aax-history-container">
                {depositHistoryLoading ? (
                  <div className="aax-empty-state" style={{ padding: '40px 0' }}>
                    <div className="aax-empty-state-icon" style={{ fontSize: 28 }}>[pending]</div>
                    <div className="aax-empty-state-title">Loading...</div>
                  </div>
                ) : (
                  <>
                    <div className="aax-history-header">
                      <div className="aax-history-stats">
                        <div className="aax-history-stat-card">
                          <div className="aax-history-stat-value">{depositHistory.length}</div>
                          <div className="aax-history-stat-label">Total Deposits</div>
                        </div>
                        <div className="aax-history-stat-card">
                          <div className="aax-history-stat-value">
                            ${depositHistory.filter(t => t.amountMinor > 0).reduce((s, t) => s + t.amount, 0).toFixed(2)}
                          </div>
                          <div className="aax-history-stat-label">Total Credited</div>
                        </div>
                        <div className="aax-history-stat-card">
                          <div className="aax-history-stat-value">
                            {depositHistory.filter(t => t.status === 'Completed').length}
                          </div>
                          <div className="aax-history-stat-label">Completed</div>
                        </div>
                      </div>
                      <div className="aax-export-section">
                        <button className="aax-export-btn" onClick={() => {
                          const csv = 'Date,Asset,Amount,Type,Status,Description\n' +
                            depositHistory.map(t =>
                              `${t.createdAt},${t.asset},${t.amount},${t.type},${t.status},"${t.description}"`
                            ).join('\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `deposits-${lead.firstName}-${lead.lastName}.csv`;
                          a.click();
                          showNotification('Deposit history exported successfully');
                        }}>
                          [chart] Export CSV
                        </button>
                      </div>
                    </div>

                    {depositHistory.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                        {depositHistory.map(t => {
                          const statusColor = t.status === 'Completed' ? '#0ECB81'
                            : t.status === 'Reversed' ? '#F6465D'
                            : '#F0B90B';
                          return (
                            <div key={t.id} className="aax-history-item">
                              <div className="aax-history-item-header">
                                <div>
                                  <div className="aax-history-amount aax-positive">
                                    +{t.amount.toFixed(t.asset === 'BTC' || t.asset === 'ETH' ? 6 : 2)} {t.asset}
                                  </div>
                                  <div className="aax-history-date">
                                    {new Date(t.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                  </div>
                                  <div className="aax-history-status" style={{ color: statusColor, fontWeight: 600 }}>{t.status}</div>
                                </div>
                              </div>
                              {t.description && (
                                <div className="aax-history-details">
                                  <div className="aax-history-detail">
                                    <div className="aax-history-detail-label">Description</div>
                                    <div className="aax-history-detail-value">{t.description}</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="aax-empty-state">
                        <div className="aax-empty-state-icon">[money]</div>
                        <div className="aax-empty-state-title">No Deposit History</div>
                        <div className="aax-empty-state-description">This client hasn't made any deposits yet. Deposits will appear here once completed.</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal History Modal */}
      {showWithdrawModal && (
        <div className="aax-modal-overlay" onClick={() => setShowWithdrawModal(false)}>
          <div className="aax-modal-content aax-large-modal" onClick={e => e.stopPropagation()}>
            <div className="aax-modal-header">
              <h3>💸 Withdrawal History - {lead.firstName} {lead.lastName}</h3>
              <button className="aax-close-btn" onClick={() => setShowWithdrawModal(false)}>×</button>
            </div>
            <div className="aax-modal-body">
              <div className="aax-history-container">
                {withdrawalHistoryLoading ? (
                  <div className="aax-empty-state" style={{ padding: '40px 0' }}>
                    <div className="aax-empty-state-icon" style={{ fontSize: 28 }}>[pending]</div>
                    <div className="aax-empty-state-title">Loading...</div>
                  </div>
                ) : (
                  <>
                    <div className="aax-history-header">
                      <div className="aax-history-stats">
                        <div className="aax-history-stat-card">
                          <div className="aax-history-stat-value">{withdrawalHistory.length}</div>
                          <div className="aax-history-stat-label">Total Withdrawals</div>
                        </div>
                        <div className="aax-history-stat-card">
                          <div className="aax-history-stat-value">
                            ${withdrawalHistory.reduce((sum, w) => sum + (w.asset === 'USD' ? w.amount : 0), 0).toFixed(2)}
                          </div>
                          <div className="aax-history-stat-label">Total USD</div>
                        </div>
                        <div className="aax-history-stat-card">
                          <div className="aax-history-stat-value">
                            {withdrawalHistory.filter(w => w.status === 'Pending').length}
                          </div>
                          <div className="aax-history-stat-label">Pending</div>
                        </div>
                      </div>
                      <div className="aax-export-section">
                        <button className="aax-export-btn" onClick={() => {
                          const csv = 'Date,Asset,Amount,Status,Destination\n' +
                            withdrawalHistory.map(w =>
                              `${w.createdAt},${w.asset},${w.amount},${w.status},"${w.destination}"`
                            ).join('\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `withdrawals-${lead.firstName}-${lead.lastName}.csv`;
                          a.click();
                          showNotification('Withdrawal history exported successfully');
                        }}>
                          [chart] Export CSV
                        </button>
                      </div>
                    </div>

                    {withdrawalHistory.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                        {withdrawalHistory.map(w => {
                          const statusColor = w.status === 'Approved' ? '#0ECB81'
                            : w.status === 'Rejected' ? '#F6465D'
                            : w.status === 'Cancelled' ? '#848E9C'
                            : '#F0B90B';
                          return (
                            <div key={w.id} className="aax-history-item">
                              <div className="aax-history-item-header">
                                <div>
                                  <div className="aax-history-amount aax-negative">
                                    -{w.amount.toFixed(w.asset === 'BTC' || w.asset === 'ETH' ? 6 : 2)} {w.asset}
                                  </div>
                                  <div className="aax-history-date">
                                    {new Date(w.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                                  </div>
                                  <div className="aax-history-status" style={{ color: statusColor, fontWeight: 600 }}>
                                    {w.status}
                                  </div>
                                </div>
                              </div>
                              <div className="aax-history-details">
                                <div className="aax-history-detail">
                                  <div className="aax-history-detail-label">Destination</div>
                                  <div className="aax-history-detail-value" style={{ wordBreak: 'break-all' }}>{w.destination || '-'}</div>
                                </div>
                                {w.network && (
                                  <div className="aax-history-detail">
                                    <div className="aax-history-detail-label">Network</div>
                                    <div className="aax-history-detail-value">{w.network}</div>
                                  </div>
                                )}
                                {w.decisionNote && (
                                  <div className="aax-history-detail">
                                    <div className="aax-history-detail-label">Decision Note</div>
                                    <div className="aax-history-detail-value">{w.decisionNote}</div>
                                  </div>
                                )}
                                {w.decidedByName && (
                                  <div className="aax-history-detail">
                                    <div className="aax-history-detail-label">Decided By</div>
                                    <div className="aax-history-detail-value">{w.decidedByName}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="aax-empty-state">
                        <div className="aax-empty-state-icon">💸</div>
                        <div className="aax-empty-state-title">No Withdrawal History</div>
                        <div className="aax-empty-state-description">This client hasn't made any withdrawals yet. Withdrawal requests will appear here once processed.</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activity Modal */}
      {showActivityModal && (
        <div className="aax-modal-overlay" onClick={() => setShowActivityModal(false)}>
          <div className="aax-modal-content aax-extra-large-modal">
            <div className="aax-modal-header">
              <h3>[chart] Lead Activity - {lead.firstName} {lead.lastName}</h3>
              <button className="aax-close-btn" onClick={() => setShowActivityModal(false)}>×</button>
            </div>
            <div className="aax-modal-body">
              <div className="aax-activity-container">
                <div className="aax-activity-overview">
                  <div className="aax-activity-card">
                    <div className="aax-activity-icon">View</div>
                    <div className="aax-activity-value">{lead.activityRecord?.pageViews || 0}</div>
                    <div className="aax-activity-label">Page Views</div>
                  </div>
                  <div className="aax-activity-card">
                    <div className="aax-activity-icon">🔄</div>
                    <div className="aax-activity-value">{lead.activityRecord?.sessions || 0}</div>
                    <div className="aax-activity-label">Sessions</div>
                  </div>
                  <div className="aax-activity-card">
                    <div className="aax-activity-icon">📅</div>
                    <div className="aax-activity-value">
                      {lead.activityRecord?.lastLogin ?
                        Math.floor((new Date() - new Date(lead.activityRecord.lastLogin)) / (1000 * 60 * 60 * 24)) : 0
                      }
                    </div>
                    <div className="aax-activity-label">Days Since Login</div>
                  </div>
                  <div className="aax-activity-card">
                    <div className="aax-activity-icon">⚡</div>
                    <div className="aax-activity-value">
                      {lead.activityRecord?.pageViews && lead.activityRecord?.sessions ?
                        Math.round(lead.activityRecord.pageViews / lead.activityRecord.sessions) : 0
                      }
                    </div>
                    <div className="aax-activity-label">Avg Pages/Session</div>
                  </div>
                </div>

                <div className="aax-activity-chart">
                  <h4>Activity Timeline</h4>
                  <div className="aax-activity-timeline">
                    {lead.activityRecord ? (
                      <>
                        <div className="aax-timeline-item">
                          <div className="aax-timeline-icon">🔑</div>
                          <div className="aax-timeline-content">
                            <div className="aax-timeline-title">Last Login</div>
                            <div className="aax-timeline-description">Lead last accessed their account</div>
                            <div className="aax-timeline-time">{new Date(lead.activityRecord.lastLogin).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</div>
                          </div>
                        </div>
                        <div className="aax-timeline-item">
                          <div className="aax-timeline-icon">[chart]</div>
                          <div className="aax-timeline-content">
                            <div className="aax-timeline-title">Session Activity</div>
                            <div className="aax-timeline-description">{lead.activityRecord.sessions} sessions recorded</div>
                            <div className="aax-timeline-time">Total page views: {lead.activityRecord.pageViews}</div>
                          </div>
                        </div>
                        <div className="aax-timeline-item">
                          <div className="aax-timeline-icon">[agent]</div>
                          <div className="aax-timeline-content">
                            <div className="aax-timeline-title">Engagement Metrics</div>
                            <div className="aax-timeline-description">Lead engagement and platform usage</div>
                            <div className="aax-timeline-time">Average {Math.round(lead.activityRecord.pageViews / lead.activityRecord.sessions) || 0} pages per session</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="aax-timeline-item">
                        <div className="aax-timeline-icon"></div>
                        <div className="aax-timeline-content">
                          <div className="aax-timeline-title">No Activity Recorded</div>
                          <div className="aax-timeline-description">Activity data will appear here once the client starts using the platform</div>
                          <div className="aax-timeline-time">Monitoring started: {new Date().toLocaleDateString()}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="aax-export-section">
                  <button className="aax-export-btn" onClick={() => {
                    const data = lead.activityRecord ? [{
                      lastLogin: lead.activityRecord.lastLogin,
                      pageViews: lead.activityRecord.pageViews,
                      sessions: lead.activityRecord.sessions
                    }] : [];
                    const csv = 'Last Login,Page Views,Sessions\n' + data.map(d => `${d.lastLogin},${d.pageViews},${d.sessions}`).join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `activity-report-${lead.firstName}-${lead.lastName}.csv`;
                    a.click();
                    showNotification('Activity report exported successfully');
                  }}>
                    [chart] Export Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditLeadModal && (
        <EditLeadModal
          lead={lead}
          onClose={() => setShowEditLeadModal(false)}
          onSave={(updates) => {
            updateLead(lead.id, { ...updates, _actorName: actorName, _actorId: currentUser?.id });
            setShowEditLeadModal(false);
            showNotification(`Profile updated for ${updates.firstName || lead.firstName} ${updates.lastName || lead.lastName}`);
          }}
        />
      )}

      {showKycReviewModal && (
        <KycReviewModal
          lead={lead}
          onClose={() => setShowKycReviewModal(false)}
          onUpdate={(updates) => {
            updateLead(lead.id, { ...updates, _actorName: actorName, _actorId: currentUser?.id });
          }}
          showNotification={showNotification}
        />
      )}

    </div>
    </>
  );
}

export { LeadProfilePage };
export default AgentPanel;
