import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ROLE, LEAD_STATUSES, normalizeStage, NotificationContext, DataContext,
  getOfficeName, getTeamName, getUserName, getCountryFlag, statusClass,
  EditLeadModal, KycReviewModal, BulkTradesActions, TradesStatusBadge,
  BulkCardsActions, CardsStatusBadge, makeLoginLink,
  EditOfficeModal, EditTeamModal, EditAgentModal,
} from '../shared';
import { useConfirmDialog } from '../components/ConfirmModal/ConfirmModal';
import Dashboard from '../components/Dashboard/Dashboard.jsx';
import Balances from '../components/Balances/Balances.jsx';
import Transactions from '../components/Transactions/Transactions.jsx';
import CardManagement from '../components/CardManagement/CardManagement.jsx';
import CryptoAddresses from '../components/CryptoAddresses/CryptoAddresses.jsx';
import Settings from '../components/Settings/Settings.jsx';
import AuditLog from '../components/AuditLog/AuditLog.jsx';
import KycReview from '../components/KycReview/KycReview.jsx';
import Notifications from '../components/Notifications/Notifications.jsx';
import NotificationToast from '../components/NotificationToast/NotificationToast.jsx';
import DepositRequests from '../components/DepositRequests/DepositRequests.jsx';
import SignupRequests from '../components/SignupRequests/SignupRequests.jsx';
import SecurityRequests from '../components/SecurityRequests/SecurityRequests.jsx';
import WithdrawalQueue from '../components/WithdrawalQueue/WithdrawalQueue.jsx';
import Sessions from '../components/Sessions/Sessions.jsx';
import AgentAccess from '../components/AgentAccess.jsx';
import HealthIndicator from '../components/HealthIndicator/HealthIndicator.jsx';
import { SearchAutocomplete } from '../components/UserChrome.jsx';
import { CountrySelect, PhoneInput, buildStoredPhone } from '../components/CountryPhoneInput/CountryPhoneInput';
import { COUNTRY_LIST } from '../countryData';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell, faBuilding, faCog, faHistory, faIdCard, faTachometerAlt, faTrash, faUser, faUserPlus, faUsers,
  faArrowDown, faArrowUp, faKey,
} from '@fortawesome/free-solid-svg-icons';
import {
  adminGetAllCards, listCryptoAddresses, getAdminToken, getUserProfileHistoryApi,
  bulkAssignLeadsApi, deleteOffice, deleteTeam, deleteStaffApi, updateOffice, updateTeam,
  updateStaffApi, resetLeadStatusApi, clearLeadCommentsApi,
  updateLeadApi, deleteLeadApi, restoreLeadApi, listAllTransactions,
  getLeadNotificationsAsAdmin, getAdminPendingCounts,
  restoreOfficeApi, restoreTeamApi, deleteOfficePermanent, deleteTeamPermanent,
  blockStaffApi, unblockStaffApi,
  listRecentAuditLog,
  deleteProfileHistoryEntryApi, clearProfileHistoryApi,
  importLeadsApi, bulkUpdateLeadStatusApi, cleanupBinApi, purgeBinLeads,
  sendHeartbeat,
  searchAdminLeads,
} from '../adminApi';
import { fetchAdminSettings } from '../../platformDefaults';
import { getCryptoData } from '../../api';
import { getLeadProfilePath } from '../leadProfileRouting';
import {
  createLogAdminAction,
  createLogActivity,
} from '../data/data';

function AllLeadsTable({ data, currentUser, setData, setLeadAssignment, showNotification }) {
  const navigate = useNavigate();
  const [confirmDialog, confirm] = useConfirmDialog();
  const [search, setSearch] = useState('');
  const [filterOffice, setFilterOffice] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTrades, setFilterTrades] = useState(''); // '' | 'on' | 'off'
  const [filterCards,  setFilterCards]  = useState(''); // '' | 'on' | 'off'
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [binPage, setBinPage] = useState(1);
  const pageSize = 20;
  const [view, setView] = useState('active'); // 'active' | 'bin'

  // Bulk selection & assignment state
  const [selected, setSelected] = useState([]);
  const [binSelected, setBinSelected] = useState([]);
  const [bulkMode, setBulkMode] = useState(null); // null | 'assign' | 'shuffle'
  const [bulkOfficeId, setBulkOfficeId] = useState('');
  const [bulkTeamId, setBulkTeamId] = useState('');
  const [bulkAgentId, setBulkAgentId] = useState('');
  const [shuffleScope, setShuffleScope] = useState('agents'); // 'offices' | 'teams' | 'agents'
  const [shuffleTargets, setShuffleTargets] = useState([]); // array of ids
  const [shuffleStatus, setShuffleStatus] = useState(''); // optional pre-filter

  // Lead profile modal state
  const [profileLead, setProfileLead] = useState(null);
  const [profileStage, setProfileStage] = useState('');
  const [profileComment, setProfileComment] = useState('');
  const [reassignOfficeId, setReassignOfficeId] = useState('');
  const [reassignTeamId, setReassignTeamId] = useState('');
  const [reassignAgentId, setReassignAgentId] = useState('');

  // Profile change history (fetched when lead profile modal opens)
  const [profileHistory, setProfileHistory] = useState([]);
  const [profileHistoryLoading, setProfileHistoryLoading] = useState(false);
  const [profileHistoryError, setProfileHistoryError] = useState('');

  // Edit + KYC review modal state for inline row buttons
  const [editingLead, setEditingLead] = useState(null);
  const [kycReviewLead, setKycReviewLead] = useState(null);

  // Quick per-row assign popover
  const [quickAssignLeadId, setQuickAssignLeadId] = useState(null);
  const [quickAssignAgentId, setQuickAssignAgentId] = useState('');

  // Client ID lookup
  const [idLookupQuery, setIdLookupQuery] = useState('');

  const handleQuickAssign = (lead) => {
    const agentId = quickAssignAgentId || null;
    let officeId = null;
    let teamId = null;
    if (agentId) {
      const agent = data.users.find(u => u.id === agentId);
      if (agent) { officeId = agent.officeId || null; teamId = agent.teamId || null; }
    }
    setLeadAssignment({ leadId: lead.id, officeId, teamId, agentId });
    showNotification(`${lead.firstName} ${lead.lastName} assigned.`);
    setQuickAssignLeadId(null);
    setQuickAssignAgentId('');
  };

  // Enter lead's own account (admin impersonation - no password required)
  const enterLeadAccount = async (lead) => {
    try {
      if (!lead || !lead.id) {
        showNotification('Invalid lead.');
        return;
      }
      // Pre-fetch client's real notifications so they appear in the impersonated view.
      // This runs in the background - a failure here should never block impersonation.
      try {
        const notifications = await getLeadNotificationsAsAdmin(lead.id);
        sessionStorage.setItem('chainiq_impersonate_notifications', JSON.stringify(notifications));
      } catch (_) { /* non-fatal */ }
      try {
        sessionStorage.setItem('chainiq_impersonate_lead', JSON.stringify(lead));
      } catch (storageErr) {
        console.warn('Could not stash lead for impersonation:', storageErr);
      }
      window.location.href = `${window.location.origin}/login?impersonateLeadId=${encodeURIComponent(lead.id)}`;
    } catch (err) {
      console.error('Failed to enter lead account:', err);
      showNotification('Could not enter lead account.');
    }
  };

  // Bulk assign all selected leads to one specific office/team/agent
  const handleBulkAssign = async () => {
    if (selected.length === 0) { showNotification('Select at least one lead first.'); return; }
    if (!bulkOfficeId && !bulkTeamId && !bulkAgentId) {
      showNotification('Pick a destination (office, team, or agent).');
      return;
    }
    let officeId = bulkOfficeId || null;
    let teamId = bulkTeamId || null;
    let agentId = bulkAgentId || null;
    if (agentId) {
      const agent = data.users.find(u => u.id === agentId);
      if (agent) { teamId = teamId || agent.teamId; officeId = officeId || agent.officeId; }
    }
    if (teamId) {
      const team = data.teams.find(t => t.id === teamId);
      if (team) { officeId = officeId || team.officeId; }
    }
    // Optimistic update - all leads in one setData call
    setData(prev => ({
      ...prev,
      leads: prev.leads.map(l => selected.includes(l.id)
        ? { ...l, assignedToOffice: officeId, assignedToTeam: teamId, assignedToAgent: agentId }
        : l
      ),
    }));
    setSelected([]);
    setBulkOfficeId(''); setBulkTeamId(''); setBulkAgentId('');
    setBulkMode(null);
    try {
      await bulkAssignLeadsApi(selected, { officeId, teamId, agentId });
      showNotification(`${selected.length} lead(s) reassigned.`);
    } catch (err) {
      showNotification('Bulk assign failed - please try again.');
    }
  };

  // Bulk soft-delete selected leads → deletedLeads bin
  const handleBulkDelete = async () => {
    if (selected.length === 0) { showNotification('Select at least one lead first.'); return; }
    const count = selected.length;
    const ok = await confirm({
      title: `Move ${count} lead${count > 1 ? 's' : ''} to bin?`,
      message: `Move ${count} selected lead${count > 1 ? 's' : ''} to the recycle bin? You can restore them later.`,
      confirmLabel: 'Move to bin',
      tone: 'warning',
    });
    if (!ok) return;
    const now = new Date().toISOString();
    const toDelete = data.leads.filter(l => selected.includes(l.id));
    setData(prev => ({
      ...prev,
      leads: prev.leads.filter(l => !selected.includes(l.id)),
      deletedLeads: [...(prev.deletedLeads || []), ...toDelete.map(l => ({ ...l, deletedAt: now }))],
    }));
    showNotification(`${count} lead${count > 1 ? 's' : ''} moved to bin.`);
    setSelected([]);
    setBulkMode(null);
    Promise.allSettled(toDelete.map(l => deleteLeadApi(l.id))).then(results => {
      const failedResults = results.filter(r => r.status === 'rejected');
      if (failedResults.length > 0) {
        showNotification(`${failedResults.length} lead(s) could not be moved to the bin - reverting.`);
        const failedIds = new Set(
          toDelete
            .filter((_, i) => results[i].status === 'rejected')
            .map(l => l.id)
        );
        setData(prev => ({
          ...prev,
          leads: [
            ...prev.leads,
            ...toDelete.filter(l => failedIds.has(l.id)),
          ],
          deletedLeads: (prev.deletedLeads || []).filter(l => !failedIds.has(l.id)),
        }));
      }
    });
  };

  // Bulk permanent-delete directly from the active list (force=1 bypasses soft-delete requirement)
  const handleBulkPermanentDelete = async () => {
    if (selected.length === 0) { showNotification('Select at least one lead first.'); return; }
    const count = selected.length;
    const ok = await confirm({
      title: `Permanently delete ${count} lead${count > 1 ? 's' : ''}?`,
      message: `Permanently delete ${count} selected lead${count > 1 ? 's' : ''}? This cannot be undone - all account data will be erased.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
    });
    if (!ok) return;
    const toDelete = data.leads.filter(l => selected.includes(l.id));
    setData(prev => ({
      ...prev,
      leads: prev.leads.filter(l => !selected.includes(l.id)),
    }));
    showNotification(`${count} lead${count > 1 ? 's' : ''} permanently deleted.`);
    setSelected([]);
    setBulkMode(null);
    Promise.allSettled(toDelete.map(l => deleteLeadApi(l.id, { permanent: true, force: true }))).then(results => {
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) showNotification(`${failed.length} lead(s) could not be permanently deleted.`);
    });
  };

  // Bulk restore from bin
  const handleBinBulkRestore = () => {
    if (binSelected.length === 0) return;
    const ids = new Set(binSelected);
    const toRestore = (data.deletedLeads || []).filter(l => ids.has(l.id));
    const count = toRestore.length;
    setData(prev => {
      const restored = (prev.deletedLeads || [])
        .filter(l => ids.has(l.id))
        .map(({ deletedAt: _d, ...r }) => r);
      return {
        ...prev,
        deletedLeads: (prev.deletedLeads || []).filter(l => !ids.has(l.id)),
        leads: [...prev.leads, ...restored],
      };
    });
    showNotification(`${count} lead${count > 1 ? 's' : ''} restored.`);
    setBinSelected([]);
    Promise.allSettled(toRestore.map(l => restoreLeadApi(l.id))).then(results => {
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) showNotification(`${failed.length} lead(s) could not be restored on the server.`);
    });
  };

  // Bulk permanent-delete from bin
  const handleBinBulkPermanentDelete = async () => {
    if (binSelected.length === 0) return;
    const count = binSelected.length;
    const ok = await confirm({
      title: `Permanently delete ${count} lead${count > 1 ? 's' : ''}?`,
      message: `Permanently delete ${count} selected lead${count > 1 ? 's' : ''}? This cannot be undone.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
    });
    if (!ok) return;
    const ids = new Set(binSelected);
    const toDelete = (data.deletedLeads || []).filter(l => ids.has(l.id));
    setData(prev => ({
      ...prev,
      deletedLeads: (prev.deletedLeads || []).filter(l => !ids.has(l.id)),
    }));
    showNotification(`${count} lead${count > 1 ? 's' : ''} permanently deleted.`);
    setBinSelected([]);
    Promise.allSettled(toDelete.map(l => deleteLeadApi(l.id, { permanent: true, force: true }))).then(results => {
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) showNotification(`${failed.length} lead(s) could not be permanently deleted.`);
    });
  };

  // Bulk suspend leads
  const handleBulkSuspend = async () => {
    if (selected.length === 0) return;
    const count = selected.length;
    const ok = await confirm({
      title: `Suspend ${count} lead${count > 1 ? 's' : ''}?`,
      message: `This will lock their accounts. They can be re-activated at any time.`,
      confirmLabel: 'Suspend',
      tone: 'danger',
    });
    if (!ok) return;
    setData(prev => ({
      ...prev,
      leads: prev.leads.map(l => selected.includes(l.id) ? { ...l, status: 'Suspended' } : l),
    }));
    showNotification(`${count} lead${count > 1 ? 's' : ''} suspended.`);
    setSelected([]);
    bulkUpdateLeadStatusApi(selected, 'Suspended').catch(() => {
      showNotification('Server error - some leads may not have been suspended.');
    });
  };

  // Bulk re-activate leads
  const handleBulkActivate = async () => {
    if (selected.length === 0) return;
    const count = selected.length;
    setData(prev => ({
      ...prev,
      leads: prev.leads.map(l => selected.includes(l.id) ? { ...l, status: 'Active' } : l),
    }));
    showNotification(`${count} lead${count > 1 ? 's' : ''} re-activated.`);
    setSelected([]);
    bulkUpdateLeadStatusApi(selected, 'Active').catch(() => {
      showNotification('Server error - some leads may not have been re-activated.');
    });
  };

  // CSV import state
  const [csvImportOpen,    setCsvImportOpen]    = useState(false);
  const [csvRawText,       setCsvRawText]       = useState('');
  const [csvFile,          setCsvFile]          = useState(null);
  const [csvParsed,        setCsvParsed]        = useState([]);
  const [csvParseError,    setCsvParseError]    = useState('');
  const [csvImporting,     setCsvImporting]     = useState(false);

  const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const handleExportAllLeadsCsv = () => {
    const headers = [
      'Lead ID', 'Name', 'First Name', 'Last Name', 'Email', 'Phone',
      'Country', 'Status', 'KYC Status', 'Stage', 'Funnel',
      'Office', 'Team', 'Agent', 'Trades Enabled', 'Cards Enabled',
      'Registered Date', 'Created At', 'Updated At',
    ];
    const rows = (data.leads || []).map(lead => {
      const office = (data.offices || []).find(item => item.id === lead.assignedToOffice);
      const team = (data.teams || []).find(item => item.id === lead.assignedToTeam);
      const agent = (data.users || []).find(item => item.id === lead.assignedToAgent);
      const name = lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
      return [
        lead.id, name, lead.firstName, lead.lastName, lead.email, lead.phone,
        lead.country, lead.status, lead.kycStatus, lead.stage, lead.funnel,
        office?.name, team?.name, agent?.name,
        lead.tradesEnabled === false ? 'OFF' : 'ON',
        lead.cardsEnabled === false ? 'OFF' : 'ON',
        lead.registeredDate, lead.createdAt, lead.updatedAt,
      ].map(csvCell).join(',');
    });
    const csv = `\uFEFF${[headers.map(csvCell).join(','), ...rows].join('\r\n')}\r\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `all-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showNotification(`Downloaded ${data.leads.length} lead${data.leads.length === 1 ? '' : 's'} as CSV.`);
  };

  const parseCsvLeads = (text) => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return { rows: [], error: 'CSV must have a header row and at least one data row.' };
    const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
    const required = ['first_name', 'last_name', 'email'];
    const missing = required.filter(r => !header.includes(r));
    if (missing.length) return { rows: [], error: `Missing required columns: ${missing.join(', ')}` };
    const rows = [];
    const errors = [];
    lines.slice(1).forEach((line, i) => {
      const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
      const obj = {};
      header.forEach((h, idx) => { obj[h] = cols[idx] || ''; });
      if (!obj.email || !obj.email.includes('@')) {
        errors.push(`Row ${i + 2}: invalid email`);
      } else {
        rows.push(obj);
      }
    });
    if (errors.length > 0) return { rows, error: errors.slice(0, 5).join('\n') };
    return { rows, error: '' };
  };

  const handleCsvFilePick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = ev => setCsvRawText(ev.target.result || '');
    reader.readAsText(file);
  };

  const handleCsvParse = () => {
    setCsvParseError('');
    setCsvParsed([]);
    const { rows, error } = parseCsvLeads(csvRawText);
    if (error && rows.length === 0) { setCsvParseError(error); return; }
    if (error) setCsvParseError(error);
    setCsvParsed(rows);
  };

  const handleCsvImport = async () => {
    if (csvParsed.length === 0) return;
    setCsvImporting(true);
    try {
      const result = await importLeadsApi(csvParsed);
      const imported = result?.imported ?? csvParsed.length;
      const newLeads = result?.leads || [];
      if (newLeads.length > 0) {
        setData(prev => ({ ...prev, leads: [...newLeads, ...prev.leads] }));
      }
      setCsvImportOpen(false);
      setCsvRawText(''); setCsvFile(null); setCsvParsed([]); setCsvParseError('');
      showNotification(`${imported} lead${imported !== 1 ? 's' : ''} imported successfully.`);
    } catch (err) {
      setCsvParseError(err?.message || 'Import failed.');
    } finally {
      setCsvImporting(false);
    }
  };

  // Bin auto-cleanup state
  const [binCleanupDays, setBinCleanupDays] = useState(30);
  const [binCleanupBusy, setBinCleanupBusy] = useState(false);

  const handleBinCleanup = async () => {
    const ok = await confirm({
      title: `Auto-clean bin?`,
      message: `Permanently delete all bin entries older than ${binCleanupDays} day${binCleanupDays !== 1 ? 's' : ''}? This cannot be undone.`,
      confirmLabel: 'Clean up',
      tone: 'danger',
    });
    if (!ok) return;
    setBinCleanupBusy(true);
    try {
      const { deleted } = await cleanupBinApi(binCleanupDays);
      const cutoff = Date.now() - (binCleanupDays * 86400 * 1000);
      setData(prev => ({
        ...prev,
        deletedLeads: (prev.deletedLeads || []).filter(l =>
          !l.deletedAt || new Date(l.deletedAt).getTime() > cutoff
        ),
      }));
      showNotification(`${deleted} lead${deleted !== 1 ? 's' : ''} permanently removed from bin.`);
    } catch (err) {
      showNotification(`Cleanup failed: ${err?.message || 'server error'}`);
    } finally {
      setBinCleanupBusy(false);
    }
  };

  // Shuffle (round-robin) selected leads among chosen targets
  const handleShuffle = async () => {
    if (shuffleTargets.length === 0) { showNotification('Pick at least one target to shuffle into.'); return; }
    let pool = selected.length > 0 ? data.leads.filter(l => selected.includes(l.id)) : data.leads.filter(l => !l.assignedToAgent);
    if (shuffleStatus) pool = pool.filter(l => normalizeStage(l.stage) === shuffleStatus);
    if (pool.length === 0) { showNotification('No leads match the shuffle pool.'); return; }

    // Build per-target groups (round-robin) - one bulk call per group instead of one call per lead
    const groups = new Map(); // targetId → { leadIds, officeId, teamId, agentId }
    pool.forEach((lead, idx) => {
      const targetId = shuffleTargets[idx % shuffleTargets.length];
      if (!groups.has(targetId)) {
        let officeId = null, teamId = null, agentId = null;
        if (shuffleScope === 'offices') {
          officeId = targetId;
        } else if (shuffleScope === 'teams') {
          const team = data.teams.find(t => t.id === targetId);
          teamId = targetId;
          officeId = team ? team.officeId : null;
        } else if (shuffleScope === 'agents') {
          const agent = data.users.find(u => u.id === targetId);
          agentId = targetId;
          teamId = agent ? agent.teamId : null;
          officeId = agent ? agent.officeId : null;
        }
        groups.set(targetId, { leadIds: [], officeId, teamId, agentId });
      }
      groups.get(targetId).leadIds.push(lead.id);
    });

    // Capture current lead state for rollback if the API calls fail
    const prevLeads = data.leads.slice();

    // Optimistic update - single setData call covering all affected leads
    setData(prev => {
      const assignMap = new Map();
      groups.forEach(({ leadIds, officeId, teamId, agentId }) => {
        leadIds.forEach(id => assignMap.set(id, { officeId, teamId, agentId }));
      });
      return {
        ...prev,
        leads: prev.leads.map(l => {
          const a = assignMap.get(l.id);
          return a ? { ...l, assignedToOffice: a.officeId, assignedToTeam: a.teamId, assignedToAgent: a.agentId } : l;
        }),
      };
    });

    setSelected([]);
    setShuffleTargets([]);
    setShuffleStatus('');
    setBulkMode(null);

    // One bulk API call per target group, all fired in parallel
    try {
      await Promise.all([...groups.values()].map(({ leadIds, officeId, teamId, agentId }) =>
        bulkAssignLeadsApi(leadIds, { officeId, teamId, agentId })
      ));
      showNotification(`Shuffled ${pool.length} lead(s) across ${shuffleTargets.length} ${shuffleScope}.`);
    } catch (err) {
      // Roll back the optimistic update so the UI reflects actual server state
      setData(prev => ({ ...prev, leads: prevLeads }));
      showNotification('Shuffle failed - changes reverted. Please try again.');
    }
  };

  const toggleShuffleTarget = (id) => {
    setShuffleTargets(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const openProfile = (lead) => {
    setProfileLead(lead);
    setProfileStage(lead.stage || '');
    setProfileComment(lead.comment || '');
    setReassignOfficeId(lead.assignedToOffice || '');
    setReassignTeamId(lead.assignedToTeam || '');
    setReassignAgentId(lead.assignedToAgent || '');
    // Fetch profile change history for this lead
    setProfileHistory([]);
    setProfileHistoryError('');
    setProfileHistoryLoading(true);
    getUserProfileHistoryApi(lead.id)
      .then(({ entries }) => { setProfileHistory(entries); })
      .catch((err) => { setProfileHistoryError(err?.message || 'Failed to load change history.'); })
      .finally(() => { setProfileHistoryLoading(false); });
  };

  const closeProfile = () => {
    setProfileLead(null);
    setProfileHistory([]);
    setProfileHistoryError('');
  };

  const saveProfile = async () => {
    if (!profileLead) return;
    // Assignment changes go through setLeadAssignment which calls the assign API.
    setLeadAssignment({ leadId: profileLead.id, officeId: reassignOfficeId || null, teamId: reassignTeamId || null, agentId: reassignAgentId || null });

    // Stage and comment must be sent to the backend separately via updateLeadApi.
    const apiUpdates = {};
    if (profileStage !== profileLead.stage) apiUpdates.stage = profileStage;
    if (profileComment.trim()) apiUpdates.comment = profileComment.trim();

    if (Object.keys(apiUpdates).length > 0) {
      // Optimistic local update so the list reflects changes immediately.
      const now = new Date().toISOString();
      const optimisticHistory = [...(profileLead.commentHistory || [])];
      if (apiUpdates.comment) {
        optimisticHistory.push({ text: apiUpdates.comment, by: 'You', date: now.slice(0, 10), createdAt: now });
      }
      setData(prev => ({
        ...prev,
        leads: prev.leads.map(l => l.id === profileLead.id
          ? { ...l, stage: profileStage, commentHistory: optimisticHistory }
          : l
        ),
      }));
      updateLeadApi(profileLead.id, apiUpdates).then((serverLead) => {
        if (!serverLead || !serverLead.id) return;
        setData(prev => ({
          ...prev,
          leads: prev.leads.map(l => l.id === serverLead.id ? { ...l, ...serverLead } : l),
        }));
      }).catch((err) => {
        console.error('[saveProfile] updateLeadApi failed', err);
        showNotification('Could not save stage/comment to the server.');
      });
    }

    showNotification(`${profileLead.firstName} ${profileLead.lastName} updated.`);
    closeProfile();
  };

  const unassignLead = () => {
    if (!profileLead) return;
    setLeadAssignment({ leadId: profileLead.id, officeId: null, teamId: null, agentId: null });
    showNotification(`${profileLead.firstName} ${profileLead.lastName} returned to pool.`);
    closeProfile();
  };

  const resetLeadStatus = async () => {
    if (!profileLead) return;
    const ok = await confirm({
      title: 'Reset Status Workflow?',
      message: `This will reset "${profileLead.firstName} ${profileLead.lastName}" back to New and permanently erase the entire status history. This cannot be undone.`,
      confirmLabel: 'Reset & Erase',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const updated = await resetLeadStatusApi(profileLead.id);
      setProfileLead(updated);
      setProfileStage('New');
      setData(prev => ({ ...prev, leads: prev.leads.map(l => l.id === updated.id ? updated : l) }));
      showNotification(`Status reset to New for ${updated.firstName} ${updated.lastName}.`);
    } catch (err) {
      console.error('[SuperAdminPanel] resetLeadStatus failed', err);
      showNotification('Could not reset status - please try again.');
    }
  };

  const clearLeadComments = async () => {
    if (!profileLead) return;
    const ok = await confirm({
      title: 'Delete All Comments?',
      message: `This will permanently delete every comment on "${profileLead.firstName} ${profileLead.lastName}"'s profile. This cannot be undone.`,
      confirmLabel: 'Delete All Comments',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const updated = await clearLeadCommentsApi(profileLead.id);
      setProfileLead(updated);
      setData(prev => ({ ...prev, leads: prev.leads.map(l => l.id === updated.id ? updated : l) }));
      showNotification(`All comments deleted for ${updated.firstName} ${updated.lastName}.`);
    } catch (err) {
      console.error('[SuperAdminPanel] clearLeadComments failed', err);
      showNotification('Could not delete comments - please try again.');
    }
  };

  // Soft-delete: move from leads → deletedLeads optimistically, then call
  // the backend. On failure we roll back so the bin doesn't show ghosts.
  const deleteLead = async (lead) => {
    const ok = await confirm({
      title: 'Move lead to bin?',
      message: `Move "${lead.firstName} ${lead.lastName}" to the recycle bin? You can restore it later from the bin.`,
      confirmLabel: 'Move to bin',
      tone: 'warning',
    });
    if (!ok) return;
    const now = new Date().toISOString();
    setData(prev => ({
      ...prev,
      leads: prev.leads.filter(l => l.id !== lead.id),
      deletedLeads: [...(prev.deletedLeads || []), { ...lead, deletedAt: now }],
    }));
    showNotification(`${lead.firstName} ${lead.lastName} moved to bin.`);
    if (profileLead?.id === lead.id) closeProfile();
    deleteLeadApi(lead.id).catch((error) => {
      console.error('[SuperAdminPanel] deleteLead failed', error);
      showNotification('Could not delete lead on the server.');
      setData(prev => ({
        ...prev,
        leads: [...prev.leads, lead],
        deletedLeads: (prev.deletedLeads || []).filter(l => l.id !== lead.id),
      }));
    });
  };

  const restoreLead = (lead) => {
    const { deletedAt: _drop, ...restoredLead } = lead;
    setData(prev => ({
      ...prev,
      deletedLeads: (prev.deletedLeads || []).filter(l => l.id !== lead.id),
      leads: [...prev.leads, restoredLead],
    }));
    showNotification(`${lead.firstName} ${lead.lastName} restored.`);
    restoreLeadApi(lead.id).catch((error) => {
      console.error('[SuperAdminPanel] restoreLead failed', error);
      showNotification('Could not restore lead on the server.');
      // Roll back: put it back in the bin and remove from live.
      setData(prev => ({
        ...prev,
        leads: prev.leads.filter(l => l.id !== lead.id),
        deletedLeads: [...(prev.deletedLeads || []), lead],
      }));
    });
  };

  const permanentDelete = async (lead) => {
    const ok = await confirm({
      title: 'Permanently delete lead?',
      message: `Permanently delete "${lead.firstName} ${lead.lastName}"? This cannot be undone.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
    });
    if (!ok) return;
    setData(prev => ({ ...prev, deletedLeads: (prev.deletedLeads || []).filter(l => l.id !== lead.id) }));
    showNotification(`${lead.firstName} ${lead.lastName} permanently deleted.`);
    deleteLeadApi(lead.id, { permanent: true, force: true }).catch((error) => {
      console.error('[SuperAdminPanel] permanentDelete failed', error);
      showNotification('Could not permanently delete lead on the server.');
      setData(prev => ({ ...prev, deletedLeads: [...(prev.deletedLeads || []), lead] }));
    });
  };

  const idLookupResults = useMemo(() => {
    const q = idLookupQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const allLeads = [...data.leads, ...(data.deletedLeads || [])];
    return allLeads.filter(l => l.id && String(l.id).toLowerCase().includes(q)).slice(0, 10);
  }, [idLookupQuery, data.leads, data.deletedLeads]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return data.leads.filter(lead => {
      if (showUnassignedOnly && lead.assignedToAgent) return false;
      if (filterOffice && lead.assignedToOffice !== filterOffice) return false;
      if (filterTeam && lead.assignedToTeam !== filterTeam) return false;
      if (filterAgent && lead.assignedToAgent !== filterAgent) return false;
      if (filterStatus && normalizeStage(lead.stage) !== filterStatus) return false;
      if (filterTrades) {
        const on = lead.tradesEnabled !== false;
        if (filterTrades === 'on' && !on) return false;
        if (filterTrades === 'off' && on) return false;
      }
      if (filterCards) {
        const on = lead.cardsEnabled !== false;
        if (filterCards === 'on' && !on) return false;
        if (filterCards === 'off' && on) return false;
      }
      if (q && !(
        (lead.firstName || '').toLowerCase().includes(q) ||
        (lead.lastName || '').toLowerCase().includes(q) ||
        (lead.email || '').toLowerCase().includes(q) ||
        (lead.phone || '').toLowerCase().includes(q) ||
        (lead.country || '').toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [data.leads, search, filterOffice, filterTeam, filterAgent, filterStatus, filterTrades, filterCards, showUnassignedOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const deletedLeads = data.deletedLeads || [];
  const binTotalPages = Math.max(1, Math.ceil(deletedLeads.length / pageSize));
  const pagedBin = deletedLeads.slice((binPage - 1) * pageSize, binPage * pageSize);
  const allBinPageSelected = pagedBin.length > 0 && pagedBin.every(l => binSelected.includes(l.id));

  const teamsForFilter = filterOffice ? data.teams.filter(t => t.officeId === filterOffice) : data.teams;
  const agentsForFilter = filterTeam ? data.users.filter(u => u.role === ROLE.AGENT && u.teamId === filterTeam) : data.users.filter(u => u.role === ROLE.AGENT);

  const unassignedCount = data.leads.filter(l => !l.assignedToOffice).length;
  const poolCount = data.leads.filter(l => l.assignedToOffice && !l.assignedToTeam).length;
  const pendingAgentCount = data.leads.filter(l => l.assignedToTeam && !l.assignedToAgent).length;
  const assignedCount = data.leads.filter(l => l.assignedToAgent).length;

  const profileOffice = profileLead ? data.offices.find(o => o.id === profileLead.assignedToOffice) : null;
  const profileTeam = profileLead ? data.teams.find(t => t.id === profileLead.assignedToTeam) : null;
  const profileAgent = profileLead ? data.users.find(u => u.id === profileLead.assignedToAgent) : null;

  return (
    <>
    {confirmDialog}

    {/* CSV Import Modal */}
    {csvImportOpen && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onClick={() => !csvImporting && setCsvImportOpen(false)}>
        <div style={{ background: '#1E2329', border: '1px solid #2B3139', borderRadius: 12, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}
          onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: '#EAECEF' }}>[upload] Import Leads from CSV</h3>
            <button onClick={() => setCsvImportOpen(false)} style={{ background: 'none', border: 'none', color: '#848E9C', fontSize: 18, cursor: 'pointer', padding: '2px 6px' }}>✕</button>
          </div>
          <div style={{ background: '#363B44', borderRadius: 8, padding: 10, marginBottom: 14, fontSize: 12, color: '#848E9C' }}>
            Required columns: <code style={{ color: '#F0B90B' }}>first_name</code>, <code style={{ color: '#F0B90B' }}>last_name</code>, <code style={{ color: '#F0B90B' }}>email</code>. Optional: <code>phone</code>, <code>country</code>, <code>password</code>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 6, border: '1px solid #444A55', background: '#2A2E36', cursor: 'pointer', fontSize: 12, color: '#EAECEF' }}>
              [file] Upload .csv file
              <input type="file" accept=".csv,text/plain" onChange={handleCsvFilePick} style={{ display: 'none' }} />
            </label>
            {csvFile && <span style={{ fontSize: 11, color: '#0ECB81', alignSelf: 'center' }}>OK {csvFile.name}</span>}
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 4 }}>Or paste CSV text</label>
            <textarea
              rows={6}
              value={csvRawText}
              onChange={e => setCsvRawText(e.target.value)}
              placeholder="first_name,last_name,email,phone,country&#10;John,Smith,john@example.com,+1234567890,US"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 6, border: '1px solid #444A55', background: '#0B0E11', color: '#EAECEF', fontSize: 12, fontFamily: 'monospace', resize: 'vertical' }}
            />
          </div>
          <button
            type="button"
            onClick={handleCsvParse}
            disabled={!csvRawText.trim()}
            style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid #F0B90B', background: 'rgba(240,185,11,0.1)', color: '#F0B90B', cursor: 'pointer', fontWeight: 600, fontSize: 13, marginBottom: 12 }}
          >[search] Parse &amp; Preview</button>
          {csvParseError && (
            <div style={{ background: 'rgba(246,70,93,0.1)', border: '1px solid #F6465D50', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#F6465D', whiteSpace: 'pre-line' }}>
              {csvParseError}
            </div>
          )}
          {csvParsed.length > 0 && (
            <>
              <div style={{ background: 'rgba(14,203,129,0.08)', border: '1px solid #0ECB8140', borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#0ECB81' }}>
                OK {csvParsed.length} lead{csvParsed.length !== 1 ? 's' : ''} ready to import
              </div>
              <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 12, border: '1px solid #2B3139', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#0B0E11' }}>
                      {['First', 'Last', 'Email', 'Phone', 'Country'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#848E9C', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvParsed.slice(0, 20).map((row, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #2B3139' }}>
                        <td style={{ padding: '5px 10px', color: '#EAECEF' }}>{row.first_name}</td>
                        <td style={{ padding: '5px 10px', color: '#EAECEF' }}>{row.last_name}</td>
                        <td style={{ padding: '5px 10px', color: '#848E9C' }}>{row.email}</td>
                        <td style={{ padding: '5px 10px', color: '#848E9C' }}>{row.phone || '-'}</td>
                        <td style={{ padding: '5px 10px', color: '#848E9C' }}>{row.country || '-'}</td>
                      </tr>
                    ))}
                    {csvParsed.length > 20 && (
                      <tr><td colSpan={5} style={{ padding: '5px 10px', color: '#848E9C', textAlign: 'center' }}>...and {csvParsed.length - 20} more</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={handleCsvImport}
                disabled={csvImporting}
                style={{ width: '100%', padding: '10px 16px', borderRadius: 8, border: 'none', background: csvImporting ? '#444A55' : '#F0B90B', color: csvImporting ? '#848E9C' : '#1A1D23', fontWeight: 700, fontSize: 14, cursor: csvImporting ? 'not-allowed' : 'pointer' }}
              >
                {csvImporting ? 'Importing...' : `⬆ Import ${csvParsed.length} Lead${csvParsed.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </div>
    )}

    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          className="aax-super-admin-btn"
          onClick={handleExportAllLeadsCsv}
          disabled={data.leads.length === 0}
          title="Download every active lead, not just the current page"
        >
          Export All Leads CSV
        </button>
      </div>

      {/* View toggle: Active | Bin */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          className={`aax-super-admin-btn aax-super-admin-btn-small${view === 'aax-active' ? '' : ' aax-super-admin-btn-secondary'}`}
          onClick={() => setView('active')}
        >
          [list] Active Leads ({data.leads.length})
        </button>
        <button
          className={`aax-super-admin-btn aax-super-admin-btn-small${view === 'bin' ? '' : ' aax-super-admin-btn-secondary'}`}
          onClick={() => setView('bin')}
        >
          🗑 Bin ({deletedLeads.length})
        </button>
      </div>

      {/* ── Client ID Lookup Bar ── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#363B44', border: '1px solid ' + (idLookupQuery.trim().length >= 3 ? '#F0B90B' : '#444A55'), borderRadius: 8, padding: '8px 14px', transition: 'border-color 0.2s' }}>
          <i className="fas fa-fingerprint" style={{ color: idLookupQuery.trim().length >= 3 ? '#F0B90B' : '#848E9C', fontSize: 15, flexShrink: 0, transition: 'color 0.2s' }} />
          <input
            className="aax-super-admin-input"
            style={{ flex: 1, background: 'transparent', border: 'none', padding: 0, fontFamily: 'monospace', fontSize: 13, outline: 'none', color: '#EAECEF' }}
            placeholder="Find client by ID - paste or type any part of the ID..."
            value={idLookupQuery}
            onChange={e => setIdLookupQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {idLookupQuery && (
            <button
              onClick={() => setIdLookupQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#848E9C', fontSize: 14, padding: '2px 4px', lineHeight: 1, borderRadius: 3, flexShrink: 0 }}
              onMouseEnter={e => e.currentTarget.style.color = '#EAECEF'}
              onMouseLeave={e => e.currentTarget.style.color = '#848E9C'}
              title="Clear"
            >✕</button>
          )}
          <span style={{ fontSize: 11, color: '#848E9C', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {idLookupQuery.trim().length >= 2
              ? idLookupResults.length > 0 ? `${idLookupResults.length} match${idLookupResults.length !== 1 ? 'es' : ''}` : 'No matches'
              : 'type 2+ chars'}
          </span>
        </div>

        {idLookupQuery.trim().length >= 2 && idLookupResults.length > 0 && (
          <div style={{ marginTop: 4, background: '#2A2E36', border: '1px solid #F0B90B40', borderRadius: 8, overflow: 'hidden' }}>
            {idLookupResults.map((lead, idx) => {
              const isDeleted = !!(lead.deletedAt);
              const office = data.offices.find(o => o.id === lead.assignedToOffice);
              const team = data.teams.find(t => t.id === lead.assignedToTeam);
              const agent = data.users.find(u => u.id === lead.assignedToAgent);
              const q = idLookupQuery.trim();
              const idStr = lead.id || '';
              const matchStart = idStr.toLowerCase().indexOf(q.toLowerCase());
              const highlightedId = matchStart >= 0
                ? <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
                    {idStr.slice(0, matchStart)}
                    <mark style={{ background: '#F0B90B', color: '#2A2E36', borderRadius: 2, padding: '0 1px' }}>{idStr.slice(matchStart, matchStart + q.length)}</mark>
                    {idStr.slice(matchStart + q.length)}
                  </span>
                : <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{idStr}</span>;
              return (
                <div
                  key={lead.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: idx > 0 ? '1px solid #363B44' : 'none', background: idx % 2 === 0 ? '#2A2E36' : '#272B32' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, color: '#EAECEF', fontSize: 13 }}>{lead.firstName} {lead.lastName}</span>
                      {isDeleted && <span style={{ fontSize: 10, background: '#c0392b20', color: '#ff6464', border: '1px solid #ff646440', borderRadius: 3, padding: '1px 5px', fontWeight: 600 }}>DELETED</span>}
                      <span style={{ fontSize: 11, background: '#F0B90B18', color: '#F0B90B', border: '1px solid #F0B90B30', borderRadius: 3, padding: '1px 6px' }}>{normalizeStage(lead.stage) || '-'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ color: '#848E9C', fontSize: 11 }}>{highlightedId}</span>
                      {lead.email && <span style={{ color: '#848E9C', fontSize: 11 }}>{lead.email}</span>}
                      {office && <span style={{ color: '#848E9C', fontSize: 11 }}>[office] {office.name}</span>}
                      {team && <span style={{ color: '#848E9C', fontSize: 11 }}>[users] {team.name}</span>}
                      {agent && <span style={{ color: '#0ECB81', fontSize: 11 }}>[user] {agent.name}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="aax-super-admin-btn aax-super-admin-btn-small"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => { openProfile(lead); setIdLookupQuery(''); }}
                    >Quick View</button>
                    {!isDeleted && (
                      <button
                        className="aax-super-admin-btn aax-super-admin-btn-small"
                        style={{ fontSize: 11, padding: '4px 10px', background: '#3a7bd5', color: '#fff' }}
                        onClick={() => navigate(getLeadProfilePath(ROLE.SUPER_ADMIN, currentUser.id, lead.id))}
                      >Open Profile</button>
                    )}
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#848E9C', padding: '4px 6px', lineHeight: 1, borderRadius: 3, fontSize: 12 }}
                      title="Copy full ID"
                      onClick={() => { navigator.clipboard.writeText(lead.id); showNotification('Client ID copied!'); }}
                      onMouseEnter={e => e.currentTarget.style.color = '#F0B90B'}
                      onMouseLeave={e => e.currentTarget.style.color = '#848E9C'}
                    ><i className="fas fa-copy"></i></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {view === 'bin' ? (
        /* ── BIN VIEW ── */
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: '#848E9C' }}>Deleted leads can be restored or permanently removed.</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: 12, color: '#848E9C' }}>Auto-clean entries older than</span>
              <select
                value={binCleanupDays}
                onChange={e => setBinCleanupDays(Number(e.target.value))}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #444A55', background: '#2A2E36', color: '#EAECEF', fontSize: 12 }}
              >
                {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
              <button
                className="aax-super-admin-btn aax-super-admin-btn-small"
                style={{ background: 'rgba(246,70,93,0.15)', color: '#F6465D', border: '1px solid #F6465D40' }}
                onClick={handleBinCleanup}
                disabled={binCleanupBusy}
              >
                {binCleanupBusy ? 'Cleaning...' : '🧹 Clean Up Bin'}
              </button>
            </div>
          </div>
          {binSelected.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, padding: '8px 12px', background: '#363B44', borderRadius: 6, border: '1px solid #F0B90B', flexWrap: 'wrap' }}>
              <span style={{ color: '#F0B90B', fontSize: 12, fontWeight: 600 }}>{binSelected.length} selected</span>
              <button className="aax-super-admin-btn aax-super-admin-btn-small" onClick={handleBinBulkRestore}>Restore Selected</button>
              <button className="aax-super-admin-btn aax-super-admin-btn-small" style={{ background: '#c0392b', color: '#fff' }} onClick={handleBinBulkPermanentDelete}>✕ Delete Selected Forever</button>
              <button onClick={() => setBinSelected([])} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #444A55', color: '#848E9C', fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}>Clear</button>
            </div>
          )}
          {pagedBin.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#848E9C' }}>The bin is empty.</div>
          ) : (
            <div className="aax-admin-table-container">
              <table className="aax-admin-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>
                      <input type="checkbox"
                        checked={allBinPageSelected}
                        onChange={e => {
                          if (e.target.checked) setBinSelected(prev => [...new Set([...prev, ...pagedBin.map(l => l.id)])]);
                          else setBinSelected(prev => prev.filter(id => !pagedBin.find(l => l.id === id)));
                        }}
                      />
                    </th>
                    <th>Client ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Country</th>
                    <th>Last Assignment</th>
                    <th>Deleted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBin.map(lead => (
                    <tr key={lead.id} style={{ background: binSelected.includes(lead.id) ? '#363B44' : undefined }}>
                      <td>
                        <input type="checkbox"
                          checked={binSelected.includes(lead.id)}
                          onChange={e => setBinSelected(e.target.checked ? [...binSelected, lead.id] : binSelected.filter(id => id !== lead.id))}
                        />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#EAECEF' }}>
                            {lead.id ? lead.id.slice(0, 6) : '-'}
                          </span>
                          {lead.id && (
                            <button
                              title={lead.id}
                              onClick={() => navigator.clipboard.writeText(lead.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#848E9C', padding: '2px 4px', lineHeight: 1, borderRadius: 3 }}
                              onMouseEnter={e => e.currentTarget.style.color = '#F0B90B'}
                              onMouseLeave={e => e.currentTarget.style.color = '#848E9C'}
                            >
                              <i className="fas fa-copy" style={{ fontSize: 11 }}></i>
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{lead.firstName} {lead.lastName}</td>
                      <td style={{ fontSize: 12, color: '#848E9C' }}>{lead.email}</td>
                      <td>{getCountryFlag(lead.countryCode, lead.country)} {lead.country}</td>
                      <td style={{ fontSize: 12, color: '#848E9C' }}>
                        {lead.assignedToAgent ? getUserName(lead.assignedToAgent, data.users) :
                          lead.assignedToTeam ? getTeamName(lead.assignedToTeam, data.teams) :
                          lead.assignedToOffice ? getOfficeName(lead.assignedToOffice, data.offices) : 'Pool'}
                      </td>
                      <td style={{ fontSize: 11, color: '#848E9C' }}>{lead.deletedAt ? new Date(lead.deletedAt).toLocaleDateString() : '-'}</td>
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="aax-super-admin-btn aax-super-admin-btn-small" onClick={() => restoreLead(lead)}>Restore</button>
                        <button className="aax-super-admin-btn aax-super-admin-btn-small" style={{ background: '#c0392b', color: '#fff' }} onClick={() => permanentDelete(lead)}>✕ Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {binTotalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button className="aax-super-admin-btn aax-super-admin-btn-small aax-pagination-btn-gold" disabled={binPage === 1} onClick={() => setBinPage(1)}>«</button>
              <button className="aax-super-admin-btn aax-super-admin-btn-small aax-pagination-btn-gold" disabled={binPage === 1} onClick={() => setBinPage(p => p - 1)}>‹ Prev</button>
              <span style={{ color: '#848E9C', fontSize: 12 }}>Page {binPage} of {binTotalPages}</span>
              <button className="aax-super-admin-btn aax-super-admin-btn-small aax-pagination-btn-gold" disabled={binPage >= binTotalPages} onClick={() => setBinPage(p => p + 1)}>Next ›</button>
              <button className="aax-super-admin-btn aax-super-admin-btn-small aax-pagination-btn-gold" disabled={binPage >= binTotalPages} onClick={() => setBinPage(binTotalPages)}>»</button>
            </div>
          )}
        </div>
      ) : (
        /* ── ACTIVE LEADS VIEW ── */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Unassigned Pool', value: unassignedCount, color: '#F0B90B' },
              { label: 'Pending Team', value: poolCount, color: '#848E9C' },
              { label: 'Pending Agent', value: pendingAgentCount, color: '#0A84FF' },
              { label: 'With Agents', value: assignedCount, color: '#0ECB81' },
              {
                label: 'Forex Leads',
                value: `${data.leads.filter(l => l.tradesEnabled !== false).length} / ${data.leads.length}`,
                color: '#0ECB81',
                title: 'Forex leads - Trades feature ON. Click to filter.',
                onClick: () => { setFilterTrades('on'); setPage(1); },
              },
              {
                label: 'Recovery Leads',
                value: `${data.leads.filter(l => l.tradesEnabled === false).length} / ${data.leads.length}`,
                color: '#F59E0B',
                title: 'Recovery leads - Trades feature OFF. Click to filter.',
                onClick: () => { setFilterTrades('off'); setPage(1); },
              },
              {
                label: 'Both ON',
                value: data.leads.filter(l => l.tradesEnabled !== false && l.cardsEnabled !== false).length,
                color: '#3B82F6',
                title: 'Leads with both Trades and Cards enabled. Click to filter.',
                onClick: () => { setFilterTrades('on'); setFilterCards('on'); setPage(1); },
              },
              {
                label: 'Both OFF',
                value: data.leads.filter(l => l.tradesEnabled === false && l.cardsEnabled === false).length,
                color: '#848E9C',
                title: 'Leads with both Trades and Cards disabled. Click to filter.',
                onClick: () => { setFilterTrades('off'); setFilterCards('off'); setPage(1); },
              },
              {
                label: 'Cards OFF',
                value: `${data.leads.filter(l => l.cardsEnabled === false).length} / ${data.leads.length}`,
                color: '#9B6DFF',
                title: 'Clients with the Cards section currently disabled. Click to filter.',
                onClick: () => { setFilterCards('off'); setPage(1); },
              },
              { label: 'Total', value: data.leads.length, color: '#EAECEF' },
            ].map(s => (
              <div
                key={s.label}
                title={s.title}
                onClick={s.onClick}
                style={{
                  background: '#363B44',
                  border: '1px solid #444A55',
                  borderRadius: 6,
                  padding: '10px 14px',
                  cursor: s.onClick ? 'pointer' : 'default',
                }}
              >
                <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <SearchAutocomplete
              className="aax-super-admin-input"
              placeholder="Search name, email, phone, country..."
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              fetchSuggestions={searchAdminLeads}
              style={{ flex: 2, minWidth: 180 }}
              buildSuggestions={(q) => {
                const ql = q.toLowerCase();
                return data.leads
                  .filter(l => {
                    const full = `${l.firstName || ''} ${l.lastName || ''}`.toLowerCase();
                    return (
                      full.includes(ql) ||
                      (l.email || '').toLowerCase().includes(ql) ||
                      (l.phone || '').toLowerCase().includes(ql) ||
                      (l.country || '').toLowerCase().includes(ql)
                    );
                  })
                  .slice(0, 8)
                  .map(l => ({
                    key: l.id,
                    value: `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.email || l.phone || '',
                    label: `${l.firstName || ''} ${l.lastName || ''}`.trim() || '(no name)',
                    meta: [l.email, l.country].filter(Boolean).join('  /  '),
                  }));
              }}
            />
            <select className="aax-super-admin-select" value={filterOffice} onChange={e => { setFilterOffice(e.target.value); setFilterTeam(''); setFilterAgent(''); setPage(1); }} style={{ flex: 1, minWidth: 120 }}>
              <option value="">All Offices</option>
              {data.offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <select className="aax-super-admin-select" value={filterTeam} onChange={e => { setFilterTeam(e.target.value); setFilterAgent(''); setPage(1); }} style={{ flex: 1, minWidth: 120 }}>
              <option value="">All Teams</option>
              {teamsForFilter.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select className="aax-super-admin-select" value={filterAgent} onChange={e => { setFilterAgent(e.target.value); setPage(1); }} style={{ flex: 1, minWidth: 120 }}>
              <option value="">All Agents</option>
              {agentsForFilter.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select className="aax-super-admin-select" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={{ flex: 1, minWidth: 120 }}>
              <option value="">All Statuses</option>
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="aax-super-admin-select" value={filterTrades} onChange={e => { setFilterTrades(e.target.value); setPage(1); }} style={{ flex: 1, minWidth: 160 }} title="Filter by lead category">
              <option value="">All Categories</option>
              <option value="on">Forex Leads (Trades ON)</option>
              <option value="off">Recovery Leads (Trades OFF)</option>
            </select>
            <select className="aax-super-admin-select" value={filterCards} onChange={e => { setFilterCards(e.target.value); setPage(1); }} style={{ flex: 1, minWidth: 150 }} title="Filter by Cards Feature access">
              <option value="">All Cards Feature</option>
              <option value="on">Cards Feature ON</option>
              <option value="off">Cards Feature OFF</option>
            </select>
            {(search || filterOffice || filterTeam || filterAgent || filterStatus || filterTrades || filterCards) && (
              <button className="aax-super-admin-btn aax-super-admin-btn-small" onClick={() => { setSearch(''); setFilterOffice(''); setFilterTeam(''); setFilterAgent(''); setFilterStatus(''); setFilterTrades(''); setFilterCards(''); setPage(1); }}>Clear</button>
            )}
          </div>

          {/* Quick action toolbar: Unassigned filter + bulk / shuffle entry */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
            <button
              className={`aax-super-admin-btn aax-super-admin-btn-small${showUnassignedOnly ? '' : ' aax-super-admin-btn-secondary'}`}
              onClick={() => { setShowUnassignedOnly(v => !v); setPage(1); }}
              style={showUnassignedOnly ? { background: '#F0B90B', color: '#2A2E36' } : {}}
            >
              {showUnassignedOnly ? '✓ Showing Unassigned' : '[user] Show Unassigned Only'}
            </button>
            <button
              className={`aax-super-admin-btn aax-super-admin-btn-small${bulkMode === 'assign' ? '' : ' aax-super-admin-btn-secondary'}`}
              onClick={() => setBulkMode(bulkMode === 'assign' ? null : 'assign')}
            >
              📌 Bulk Assign / Reassign
            </button>
            <button
              className={`aax-super-admin-btn aax-super-admin-btn-small${bulkMode === 'shuffle' ? '' : ' aax-super-admin-btn-secondary'}`}
              onClick={() => setBulkMode(bulkMode === 'shuffle' ? null : 'shuffle')}
            >
              🔀 Shuffle / Distribute
            </button>
            <button
              className="aax-super-admin-btn aax-super-admin-btn-small aax-super-admin-btn-secondary"
              onClick={() => { setCsvImportOpen(true); setCsvRawText(''); setCsvFile(null); setCsvParsed([]); setCsvParseError(''); }}
            >
              [upload] Import CSV
            </button>
            {selected.length > 0 && (
              <>
                <span style={{ color: '#F0B90B', fontSize: 12, fontWeight: 600 }}>
                  {selected.length} selected
                  <button onClick={() => setSelected([])} style={{ marginLeft: 8, background: 'transparent', border: '1px solid #444A55', color: '#848E9C', fontSize: 11, padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}>clear</button>
                </span>
                <span style={{ width: 1, height: 22, background: '#444A55' }} />
                <BulkTradesActions
                  selectedIds={selected}
                  updateLead={(id, updates) => {
                    // SuperAdminPanel keeps its own optimistic state via setData
                    // (it doesn't go through App.jsx's updateLead helper), so we
                    // mirror the change locally and then PATCH the backend.
                    const { _actorName, _actorId, ...payload } = updates;
                    setData(prev => ({
                      ...prev,
                      leads: (prev.leads || []).map(l => (l.id === id ? { ...l, ...payload } : l)),
                    }));
                    updateLeadApi(id, payload).then((server) => {
                      if (!server || !server.id) return;
                      setData(prev => ({
                        ...prev,
                        leads: (prev.leads || []).map(l => (l.id === id ? { ...l, ...server } : l)),
                      }));
                    }).catch(() => {
                      showNotification(`Failed to update one or more leads.`);
                    });
                  }}
                  showNotification={showNotification}
                  onDone={() => setSelected([])}
                />
                <span style={{ width: 1, height: 22, background: '#444A55' }} />
                <BulkCardsActions
                  selectedIds={selected}
                  updateLead={(id, updates) => {
                    const { _actorName, _actorId, ...payload } = updates;
                    setData(prev => ({
                      ...prev,
                      leads: (prev.leads || []).map(l => (l.id === id ? { ...l, ...payload } : l)),
                    }));
                    updateLeadApi(id, payload).then((server) => {
                      if (!server || !server.id) return;
                      setData(prev => ({
                        ...prev,
                        leads: (prev.leads || []).map(l => (l.id === id ? { ...l, ...server } : l)),
                      }));
                    }).catch(() => {
                      showNotification(`Failed to update one or more leads.`);
                    });
                  }}
                  showNotification={showNotification}
                  onDone={() => setSelected([])}
                />
                <span style={{ width: 1, height: 22, background: '#444A55' }} />
                <button
                  className="aax-super-admin-btn aax-super-admin-btn-small"
                  style={{ background: 'rgba(246,70,93,0.15)', color: '#F6465D', border: '1px solid #F6465D40' }}
                  onClick={handleBulkDelete}
                  title={`Move ${selected.length} lead(s) to bin`}
                >
                  🗑 Move to Bin
                </button>
                <button
                  className="aax-super-admin-btn aax-super-admin-btn-small"
                  style={{ background: '#c0392b', color: '#fff' }}
                  onClick={handleBulkPermanentDelete}
                  title={`Permanently delete ${selected.length} lead(s) - cannot be undone`}
                >
                  ✕ Delete Forever
                </button>
                <span style={{ width: 1, height: 22, background: '#444A55' }} />
                <button
                  className="aax-super-admin-btn aax-super-admin-btn-small"
                  style={{ background: 'rgba(246,70,93,0.15)', color: '#F6465D', border: '1px solid #F6465D40' }}
                  onClick={handleBulkSuspend}
                  title={`Suspend ${selected.length} lead(s)`}
                >
                  🔒 Suspend
                </button>
                <button
                  className="aax-super-admin-btn aax-super-admin-btn-small"
                  style={{ background: 'rgba(14,203,129,0.12)', color: '#0ECB81', border: '1px solid #0ECB8140' }}
                  onClick={handleBulkActivate}
                  title={`Re-activate ${selected.length} lead(s)`}
                >
                  OK Activate
                </button>
              </>
            )}
          </div>

          {/* Bulk Assign / Reassign panel */}
          {bulkMode === 'assign' && (
            <div style={{ background: '#363B44', border: '1px solid #F0B90B', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#F0B90B', fontWeight: 600, marginBottom: 10 }}>
                Bulk Assign / Reassign - {selected.length} lead(s) selected
              </div>

              {/* Quick agent pick */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>Quick assign to Agent (auto-fills office & team)</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <select
                    className="aax-super-admin-select"
                    style={{ flex: 1 }}
                    value={bulkAgentId}
                    onChange={e => {
                      const agId = e.target.value;
                      setBulkAgentId(agId);
                      if (agId) {
                        const agent = data.users.find(u => u.id === agId);
                        if (agent) { setBulkOfficeId(agent.officeId || ''); setBulkTeamId(agent.teamId || ''); }
                      } else {
                        setBulkAgentId('');
                      }
                    }}
                  >
                    <option value="">- No agent -</option>
                    {data.offices.map(office => {
                      const officeAgents = data.users.filter(u => u.role === ROLE.AGENT && u.officeId === office.id);
                      if (!officeAgents.length) return null;
                      return (
                        <optgroup key={office.id} label={`[office] ${office.name}`}>
                          {officeAgents.map(agent => {
                            const team = data.teams.find(t => t.id === agent.teamId);
                            return <option key={agent.id} value={agent.id}>{agent.name}{team ? ` (${team.name})` : ''}</option>;
                          })}
                        </optgroup>
                      );
                    })}
                    {data.users.filter(u => u.role === ROLE.AGENT && !u.officeId).map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.name} (unassigned)</option>
                    ))}
                  </select>
                  <button className="aax-super-admin-btn" onClick={handleBulkAssign} disabled={selected.length === 0}>Apply</button>
                </div>
              </div>

              {/* Or office/team only */}
              <div style={{ borderTop: '1px solid #444A55', paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 8 }}>Or assign to Office / Team only</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>Office</div>
                    <select className="aax-super-admin-select" style={{ width: '100%' }} value={bulkOfficeId} onChange={e => { setBulkOfficeId(e.target.value); setBulkTeamId(''); setBulkAgentId(''); }}>
                      <option value="">- None (Pool) -</option>
                      {data.offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>Team</div>
                    <select className="aax-super-admin-select" style={{ width: '100%' }} value={bulkTeamId} onChange={e => { setBulkTeamId(e.target.value); setBulkAgentId(''); }} disabled={!bulkOfficeId}>
                      <option value="">- None -</option>
                      {data.teams.filter(t => t.officeId === bulkOfficeId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <button className="aax-super-admin-btn" onClick={handleBulkAssign} disabled={selected.length === 0}>Apply</button>
                </div>
              </div>
            </div>
          )}

          {/* Shuffle / Distribute panel */}
          {bulkMode === 'shuffle' && (
            <div style={{ background: '#363B44', border: '1px solid #0A84FF', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#0A84FF', fontWeight: 600, marginBottom: 10 }}>
                Shuffle / Distribute - {selected.length > 0 ? `${selected.length} selected lead(s)` : 'all leads with no agent'}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>Distribute among</div>
                  <select className="aax-super-admin-select" value={shuffleScope} onChange={e => { setShuffleScope(e.target.value); setShuffleTargets([]); }}>
                    <option value="offices">Offices</option>
                    <option value="teams">Teams</option>
                    <option value="agents">Agents</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>Filter by status (optional)</div>
                  <select className="aax-super-admin-select" value={shuffleStatus} onChange={e => setShuffleStatus(e.target.value)}>
                    <option value="">All statuses</option>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 6 }}>
                Pick targets ({shuffleTargets.length} selected):
              </div>
              <div style={{ maxHeight: 140, overflowY: 'auto', background: '#2A2E36', border: '1px solid #444A55', borderRadius: 6, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {(shuffleScope === 'offices' ? data.offices.map(o => ({ id: o.id, label: o.name })) :
                  shuffleScope === 'teams' ? data.teams.map(t => ({ id: t.id, label: `${t.name} (${getOfficeName(t.officeId, data.offices)})` })) :
                  data.users.filter(u => u.role === ROLE.AGENT).map(u => ({ id: u.id, label: `${u.name}  /  ${getTeamName(u.teamId, data.teams)}` }))
                ).map(t => (
                  <button
                    key={t.id}
                    onClick={() => toggleShuffleTarget(t.id)}
                    style={{
                      padding: '4px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                      background: shuffleTargets.includes(t.id) ? '#0A84FF' : '#363B44',
                      color: shuffleTargets.includes(t.id) ? '#2A2E36' : '#EAECEF',
                      border: '1px solid #444A55', fontWeight: shuffleTargets.includes(t.id) ? 600 : 400,
                    }}
                  >{t.label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="aax-super-admin-btn" style={{ background: '#0A84FF', color: '#2A2E36' }} onClick={handleShuffle} disabled={shuffleTargets.length === 0}>🔀 Shuffle Now</button>
                <button className="aax-super-admin-btn aax-super-admin-btn-small aax-super-admin-btn-secondary" onClick={() => setShuffleTargets([])}>Clear targets</button>
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: '#848E9C', marginBottom: 8 }}>
            Click any row to open the lead profile. Showing {paged.length} of {filtered.length} leads (page {page}/{totalPages})
          </div>

          <div className="aax-admin-table-container">
            <table className="aax-admin-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}>
                    <input
                      type="checkbox"
                      checked={paged.length > 0 && paged.every(l => selected.includes(l.id))}
                      onChange={e => {
                        if (e.target.checked) setSelected([...new Set([...selected, ...paged.map(l => l.id)])]);
                        else setSelected(selected.filter(id => !paged.find(l => l.id === id)));
                      }}
                    />
                  </th>
                  <th>Client ID</th>
                  <th>Name</th>
                  <th>Country</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Trades Feature</th>
                  <th style={{ textAlign: 'center' }}>Cards Feature</th>
                  <th>Office</th>
                  <th>Team</th>
                  <th>Agent</th>
                  <th>Registered</th>
                  <th>Last Activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.length === 0 ? (
                  <tr><td colSpan={13} style={{ textAlign: 'center', padding: 20, color: '#848E9C' }}>No leads match your filters.</td></tr>
                ) : paged.map(lead => (
                  <React.Fragment key={lead.id}>
                  <tr style={{ cursor: 'pointer', background: selected.includes(lead.id) ? '#363B44' : undefined }} onClick={() => openProfile(lead)}>
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(lead.id)}
                        onChange={e => setSelected(e.target.checked ? [...selected, lead.id] : selected.filter(id => id !== lead.id))}
                      />
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#EAECEF' }}>
                          {lead.id ? lead.id.slice(0, 6) : '-'}
                        </span>
                        {lead.id && (
                          <button
                            title={lead.id}
                            onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(lead.id); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#848E9C', padding: '2px 4px', lineHeight: 1, borderRadius: 3 }}
                            onMouseEnter={e => e.currentTarget.style.color = '#F0B90B'}
                            onMouseLeave={e => e.currentTarget.style.color = '#848E9C'}
                          >
                            <i className="fas fa-copy" style={{ fontSize: 11 }}></i>
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{lead.firstName} {lead.lastName}</div>
                      <div style={{ fontSize: 11, color: '#848E9C' }}>{lead.email}</div>
                    </td>
                    <td>{getCountryFlag(lead.countryCode, lead.country)} {lead.country}</td>
                    <td><span className={`aax-status-badge ${statusClass(lead.stage)}`}>{normalizeStage(lead.stage)}</span></td>
                    <td style={{ textAlign: 'center' }}><TradesStatusBadge enabled={lead.tradesEnabled !== false} /></td>
                    <td style={{ textAlign: 'center' }}><CardsStatusBadge enabled={lead.cardsEnabled !== false} /></td>
                    <td style={{ color: lead.assignedToOffice ? '#EAECEF' : '#F0B90B', fontSize: 12 }}>
                      {lead.assignedToOffice ? getOfficeName(lead.assignedToOffice, data.offices) : 'Pool'}
                    </td>
                    <td style={{ color: lead.assignedToTeam ? '#EAECEF' : '#848E9C', fontSize: 12 }}>
                      {lead.assignedToTeam ? getTeamName(lead.assignedToTeam, data.teams) : '-'}
                    </td>
                    <td style={{ color: lead.assignedToAgent ? '#0ECB81' : '#848E9C', fontSize: 12 }}>
                      {lead.assignedToAgent ? getUserName(lead.assignedToAgent, data.users) : '-'}
                    </td>
                    <td style={{ fontSize: 11, color: '#848E9C' }}>{lead.registeredDate || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {(() => {
                        const raw = lead.lastCommentDate;
                        if (!raw) return <span style={{ color: '#555', fontSize: 11 }}>Never</span>;
                        const diffMs = Date.now() - new Date(raw).getTime();
                        const days = Math.floor(diffMs / 86400000);
                        const label = days === 0 ? 'Today' : days === 1 ? '1d ago' : `${days}d ago`;
                        const color = days === 0 ? '#0ECB81' : days <= 3 ? '#0ECB81' : days <= 7 ? '#F0B90B' : days <= 30 ? '#FF9F0A' : '#F6465D';
                        return (
                          <span style={{
                            display: 'inline-block', padding: '2px 7px', borderRadius: 10,
                            background: `${color}18`, color, fontSize: 11, fontWeight: 600,
                            border: `1px solid ${color}33`,
                          }}>
                            {label}
                          </span>
                        );
                      })()}
                    </td>
                    <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                      <button
                        className="aax-super-admin-btn aax-super-admin-btn-small"
                        style={{ fontSize: 11, padding: '4px 10px', background: '#3a7bd5', color: '#fff', fontWeight: 600 }}
                        onClick={() => { setEditingLead(lead); }}
                        title="Edit lead profile fields"
                      > Edit</button>
                      <button className="aax-super-admin-btn aax-super-admin-btn-small" style={{ fontSize: 11, padding: '4px 10px', marginLeft: 4, background: '#c0392b', color: '#fff' }} onClick={() => deleteLead(lead)} title="Move to Recycle Bin">🗑 Bin</button>
                    </td>
                  </tr>
                  {quickAssignLeadId === lead.id && (
                    <tr style={{ background: '#2A2E36' }}>
                      <td colSpan={11} style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: '#F0B90B', fontWeight: 600, whiteSpace: 'nowrap' }}>Assign "{lead.firstName} {lead.lastName}" to:</span>
                          <select
                            className="aax-super-admin-select"
                            style={{ flex: '1 1 220px', minWidth: 180 }}
                            value={quickAssignAgentId}
                            onChange={e => setQuickAssignAgentId(e.target.value)}
                            autoFocus
                          >
                            <option value="">- Unassign (return to pool) -</option>
                            {data.offices.map(office => {
                              const officeAgents = data.users.filter(u => u.role === ROLE.AGENT && u.officeId === office.id);
                              if (!officeAgents.length) return null;
                              return (
                                <optgroup key={office.id} label={`[office] ${office.name}`}>
                                  {officeAgents.map(agent => {
                                    const team = data.teams.find(t => t.id === agent.teamId);
                                    return (
                                      <option key={agent.id} value={agent.id}>
                                        {agent.name}{team ? `  /  ${team.name}` : ''}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              );
                            })}
                            {data.users.filter(u => u.role === ROLE.AGENT && !u.officeId).map(agent => (
                              <option key={agent.id} value={agent.id}>{agent.name} (no office)</option>
                            ))}
                          </select>
                          <button
                            className="aax-super-admin-btn aax-super-admin-btn-small"
                            style={{ background: '#0ECB81', color: '#2A2E36', fontWeight: 700, whiteSpace: 'nowrap' }}
                            onClick={() => handleQuickAssign(lead)}
                          >✓ Apply</button>
                          <button
                            className="aax-super-admin-btn aax-super-admin-btn-small"
                            style={{ background: '#444A55', color: '#EAECEF' }}
                            onClick={() => { setQuickAssignLeadId(null); setQuickAssignAgentId(''); }}
                          >✕ Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button className="aax-super-admin-btn aax-super-admin-btn-small aax-pagination-btn-gold" disabled={page === 1} onClick={() => setPage(1)}>«</button>
              <button className="aax-super-admin-btn aax-super-admin-btn-small aax-pagination-btn-gold" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
              <span style={{ color: '#848E9C', fontSize: 12 }}>Page {page} of {totalPages}</span>
              <button className="aax-super-admin-btn aax-super-admin-btn-small aax-pagination-btn-gold" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next ›</button>
              <button className="aax-super-admin-btn aax-super-admin-btn-small aax-pagination-btn-gold" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          )}
        </div>
      )}

      {/* ── LEAD PROFILE MODAL ── */}
      {profileLead && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px' }} onClick={closeProfile}>
          <div style={{ background: '#363B44', border: '1px solid #444A55', borderRadius: 12, width: '100%', maxWidth: 860, padding: 28, position: 'relative' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: profileLead.isOnline ? '#0ECB81' : '#848E9C', display: 'inline-block' }} />
                  <span style={{ color: profileLead.isOnline ? '#0ECB81' : '#848E9C', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {profileLead.isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <h2 style={{ margin: '0 0 4px', color: '#EAECEF', fontSize: 20, fontWeight: 700 }}>{profileLead.firstName} {profileLead.lastName}</h2>
                <div style={{ fontSize: 12, color: '#848E9C' }}>{profileLead.email}  /  {profileLead.phone}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto', marginLeft: 'auto', flexWrap: 'nowrap' }}>
                <button
                  style={{ background: '#F0B90B', color: '#1A1D23', fontWeight: 600, padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', minWidth: 120 }}
                  onClick={() => navigate(getLeadProfilePath(ROLE.SUPER_ADMIN, currentUser.id, profileLead.id))}
                  title="Open the full lead profile page"
                >
                  Open Profile
                </button>
                <button
                  style={{ background: '#0ECB81', color: '#1A1D23', fontWeight: 600, padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', minWidth: 120 }}
                  onClick={() => enterLeadAccount(profileLead)}
                  title="Log in to this lead's own account"
                >
                  Enter Account
                </button>
                <button
                  style={{ background: '#5B4FBE', color: '#fff', fontWeight: 600, padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', minWidth: 120 }}
                  onClick={() => {
                    closeProfile();
                    const el = document.getElementById('bulk-assign-section');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  title="Reassign this lead to an agent"
                >
                  ⇄ Reassign
                </button>
                <button
                  onClick={closeProfile}
                  style={{ background: 'none', border: '1px solid #444A55', color: '#848E9C', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                  aria-label="Close"
                >✕</button>
              </div>
            </div>

            {/* Lead Info Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div style={{ background: '#363B44', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 600, textTransform: 'uppercase', marginBottom: 12 }}>Lead Details</div>
                {[
                  ['Country', profileLead.country || '-'],
                  ['Funnel', profileLead.funnel || '-'],
                  ['Affiliate', profileLead.affiliate || '-'],
                  ['Registered', profileLead.registeredDate || '-'],
                  ['Last Comment', profileLead.lastCommentDate || '-'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: '#848E9C' }}>{label}</span>
                    <span style={{ color: '#EAECEF' }}>
                      {label === 'Country' && getCountryFlag(profileLead.countryCode, profileLead.country)}
                      {val}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ background: '#363B44', borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 600, textTransform: 'uppercase', marginBottom: 12 }}>Assignment Chain</div>
                {[
                  ['Office', profileOffice?.name || 'Unassigned (Pool)', !!profileLead.assignedToOffice],
                  ['Team', profileTeam?.name || '-', !!profileLead.assignedToTeam],
                  ['Agent', profileAgent?.name || '-', !!profileLead.assignedToAgent],
                  ['Assigned By', profileLead.assignedBy || '-', false],
                ].map(([label, val, active]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                    <span style={{ color: '#848E9C' }}>{label}</span>
                    <span style={{ color: active ? '#F0B90B' : '#EAECEF' }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stage & Comment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 11, color: '#848E9C', display: 'block', marginBottom: 6 }}>Select Status</label>
                <select className="aax-super-admin-select" style={{ width: '100%' }} value={profileStage} onChange={e => setProfileStage(e.target.value)}>
                  {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#848E9C', display: 'block', marginBottom: 6 }}>Comment</label>
                <textarea
                  value={profileComment}
                  onChange={e => setProfileComment(e.target.value)}
                  rows={3}
                  style={{ width: '100%', background: '#363B44', border: '1px solid #444A55', borderRadius: 6, color: '#EAECEF', padding: '8px 10px', resize: 'vertical', fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* KYC Review */}
            <div style={{ marginBottom: 12 }}>
              <button
                style={{ background: '#FF9F0A', color: '#fff', fontWeight: 600, padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}
                onClick={() => { setKycReviewLead(profileLead); closeProfile(); }}
                title="Review KYC documents for this lead"
              >
                Review KYC Documents
              </button>
            </div>

            {/* Reassign Controls */}
            <div style={{ background: '#363B44', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Reassign</div>
              <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 12 }}>
                Pick an agent directly - office and team are filled automatically. Or assign to just an office or team.
              </div>

              {/* Quick assign: agent picker (all agents, grouped by team/office) */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: '#F0B90B', fontWeight: 600, marginBottom: 4 }}>Quick Assign to Agent</div>
                <select
                  className="aax-super-admin-select"
                  style={{ width: '100%' }}
                  value={reassignAgentId}
                  onChange={e => {
                    const agentId = e.target.value;
                    setReassignAgentId(agentId);
                    if (agentId) {
                      const agent = data.users.find(u => u.id === agentId);
                      if (agent) {
                        setReassignTeamId(agent.teamId || '');
                        setReassignOfficeId(agent.officeId || '');
                      }
                    } else {
                      setReassignAgentId('');
                    }
                  }}
                >
                  <option value="">- No agent (assign to office/team only) -</option>
                  {data.offices.map(office => {
                    const officeAgents = data.users.filter(u => u.role === ROLE.AGENT && u.officeId === office.id);
                    if (officeAgents.length === 0) return null;
                    return (
                      <optgroup key={office.id} label={`[office] ${office.name}`}>
                        {officeAgents.map(agent => {
                          const team = data.teams.find(t => t.id === agent.teamId);
                          return (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}{team ? ` (${team.name})` : ''}
                            </option>
                          );
                        })}
                      </optgroup>
                    );
                  })}
                  {data.users.filter(u => u.role === ROLE.AGENT && !u.officeId).map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name} (unassigned office)</option>
                  ))}
                </select>
              </div>

              {/* Manual office/team override */}
              <div style={{ borderTop: '1px solid #444A55', paddingTop: 12 }}>
                <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 600, marginBottom: 8 }}>Or assign to Office / Team only</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>Office</div>
                    <select className="aax-super-admin-select" style={{ width: '100%' }} value={reassignOfficeId} onChange={e => { setReassignOfficeId(e.target.value); setReassignTeamId(''); setReassignAgentId(''); }}>
                      <option value="">None (Pool)</option>
                      {data.offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 160px' }}>
                    <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>Team</div>
                    <select className="aax-super-admin-select" style={{ width: '100%' }} value={reassignTeamId} onChange={e => { setReassignTeamId(e.target.value); setReassignAgentId(''); }} disabled={!reassignOfficeId}>
                      <option value="">None</option>
                      {data.teams.filter(t => t.officeId === reassignOfficeId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* ── SA-Only: Lead Category & Feature Toggles ── */}
            {(() => {
              const tradOn = profileLead.tradesEnabled !== false;
              const cardOn = profileLead.cardsEnabled !== false;

              const handleProfileToggleTrades = async (enable) => {
                const prev = { ...profileLead };
                const updated = { ...profileLead, tradesEnabled: enable };
                setProfileLead(updated);
                setData(d => ({ ...d, leads: d.leads.map(l => l.id === profileLead.id ? { ...l, tradesEnabled: enable } : l) }));
                try {
                  await updateLeadApi(profileLead.id, { tradesEnabled: enable });
                  showNotification(enable ? `Forex mode enabled for ${profileLead.firstName} ${profileLead.lastName}.` : `${profileLead.firstName} ${profileLead.lastName} moved to Recovery.`);
                } catch (err) {
                  setProfileLead(prev);
                  setData(d => ({ ...d, leads: d.leads.map(l => l.id === profileLead.id ? { ...l, tradesEnabled: prev.tradesEnabled } : l) }));
                  showNotification('Failed to update lead category.');
                }
              };

              const handleProfileToggleCards = async (enable) => {
                const prev = { ...profileLead };
                const updated = { ...profileLead, cardsEnabled: enable };
                setProfileLead(updated);
                setData(d => ({ ...d, leads: d.leads.map(l => l.id === profileLead.id ? { ...l, cardsEnabled: enable } : l) }));
                try {
                  await updateLeadApi(profileLead.id, { cardsEnabled: enable });
                  showNotification(enable ? `Cards enabled for ${profileLead.firstName} ${profileLead.lastName}.` : `Cards disabled for ${profileLead.firstName} ${profileLead.lastName}.`);
                } catch (err) {
                  setProfileLead(prev);
                  setData(d => ({ ...d, leads: d.leads.map(l => l.id === profileLead.id ? { ...l, cardsEnabled: prev.cardsEnabled } : l) }));
                  showNotification('Failed to update cards feature.');
                }
              };

              return (
                <div style={{ background: '#2A2E36', border: '1px solid #444A55', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ background: '#F0B90B20', color: '#F0B90B', border: '1px solid #F0B90B40', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 800 }}>SA ONLY</span>
                    Lead Category &amp; Feature Access
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

                    {/* Trades / Category toggle */}
                    <div style={{
                      flex: '1 1 240px',
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: tradOn
                        ? 'linear-gradient(135deg, rgba(14,203,129,0.12) 0%, rgba(14,203,129,0.04) 100%)'
                        : 'linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(245,158,11,0.03) 100%)',
                      border: `1px solid ${tradOn ? 'rgba(14,203,129,0.4)' : 'rgba(245,158,11,0.4)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                            <span style={{
                              padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                              background: tradOn ? 'rgba(14,203,129,0.18)' : 'rgba(245,158,11,0.16)',
                              color: tradOn ? '#0ECB81' : '#F59E0B',
                              border: `1px solid ${tradOn ? 'rgba(14,203,129,0.5)' : 'rgba(245,158,11,0.45)'}`,
                            }}>
                              {tradOn ? '[trend] Forex Lead' : '🔄 Recovery Lead'}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#848E9C', lineHeight: 1.4 }}>
                            {tradOn ? 'Trades section visible - client can place trades.' : 'Recovery mode - Trades section hidden from client.'}
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={tradOn}
                          onClick={() => handleProfileToggleTrades(!tradOn)}
                          title={tradOn ? 'Switch to Recovery (disable trades)' : 'Switch to Forex (enable trades)'}
                          style={{
                            position: 'relative', width: 48, height: 26, minWidth: 48, borderRadius: 999,
                            border: 'none', outline: 'none', cursor: 'pointer', padding: 0, flex: '0 0 auto',
                            background: tradOn ? '#0ECB81' : '#3a3f48',
                            boxShadow: tradOn ? '0 0 0 3px rgba(14,203,129,0.15)' : 'none',
                            transition: 'background 0.2s',
                          }}
                        >
                          <span style={{
                            position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%',
                            background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                            transform: tradOn ? 'translateX(22px)' : 'translateX(0)',
                            transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)',
                          }} />
                        </button>
                      </div>
                    </div>

                    {/* Cards toggle */}
                    <div style={{
                      flex: '1 1 240px',
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: cardOn
                        ? 'linear-gradient(135deg, rgba(155,109,255,0.12) 0%, rgba(155,109,255,0.04) 100%)'
                        : 'linear-gradient(135deg, rgba(132,142,156,0.08) 0%, rgba(132,142,156,0.02) 100%)',
                      border: `1px solid ${cardOn ? 'rgba(155,109,255,0.4)' : 'rgba(132,142,156,0.25)'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                            <span style={{
                              padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                              background: cardOn ? 'rgba(155,109,255,0.18)' : 'rgba(132,142,156,0.14)',
                              color: cardOn ? '#9B6DFF' : '#848E9C',
                              border: `1px solid ${cardOn ? 'rgba(155,109,255,0.5)' : 'rgba(132,142,156,0.3)'}`,
                            }}>
                              [card] Cards Feature
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: cardOn ? '#9B6DFF' : '#848E9C' }}>
                              {cardOn ? 'ON' : 'OFF'}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#848E9C', lineHeight: 1.4 }}>
                            {cardOn ? 'Cards page visible - client can view and manage cards.' : 'Cards page hidden from client.'}
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={cardOn}
                          onClick={() => handleProfileToggleCards(!cardOn)}
                          title={cardOn ? 'Disable Cards feature' : 'Enable Cards feature'}
                          style={{
                            position: 'relative', width: 48, height: 26, minWidth: 48, borderRadius: 999,
                            border: 'none', outline: 'none', cursor: 'pointer', padding: 0, flex: '0 0 auto',
                            background: cardOn ? '#9B6DFF' : '#3a3f48',
                            boxShadow: cardOn ? '0 0 0 3px rgba(155,109,255,0.15)' : 'none',
                            transition: 'background 0.2s',
                          }}
                        >
                          <span style={{
                            position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%',
                            background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                            transform: cardOn ? 'translateX(22px)' : 'translateX(0)',
                            transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)',
                          }} />
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              );
            })()}

            {/* Comment History */}
            {profileLead.commentHistory && profileLead.commentHistory.length > 0 && (
              <div style={{ background: '#363B44', borderRadius: 8, padding: 16, marginBottom: 20, maxHeight: 180, overflowY: 'auto' }}>
                <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Comment History</div>
                {[...profileLead.commentHistory].reverse().map((entry, i) => (
                  <div key={i} style={{ borderBottom: '1px solid #444A55', paddingBottom: 8, marginBottom: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ color: '#F0B90B', fontWeight: 600 }}>{entry.by}</span>
                      <span style={{ color: '#848E9C' }}>{entry.date}</span>
                    </div>
                    <div style={{ color: '#EAECEF' }}>{entry.text}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Profile Change History */}
            <div style={{ background: '#363B44', borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>Profile Change History</span>
                  {profileHistoryLoading && (
                    <span style={{ fontSize: 10, color: '#F0B90B', fontWeight: 400 }}>Loading...</span>
                  )}
                </div>
                {profileHistory.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!window.confirm('Clear all profile history for this user?')) return;
                      try {
                        await clearProfileHistoryApi(profileLead.id);
                        setProfileHistory([]);
                      } catch (err) {
                        showNotification('Could not clear profile history: ' + (err.message || 'error'));
                      }
                    }}
                    style={{ background: 'rgba(246,70,93,0.12)', border: '1px solid #F6465D55', color: '#F6465D', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 600, cursor: 'pointer', textTransform: 'none' }}
                  >
                    🗑 Clear All
                  </button>
                )}
              </div>
              {profileHistoryError && (
                <div style={{ color: '#F6465D', fontSize: 12 }}>{profileHistoryError}</div>
              )}
              {!profileHistoryLoading && !profileHistoryError && profileHistory.length === 0 && (
                <div style={{ color: '#848E9C', fontSize: 12 }}>No profile changes recorded yet.</div>
              )}
              {profileHistory.length > 0 && (
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {profileHistory.map((entry) => {
                    const isClientAction = !entry.actorAdminId;
                    const changedFields = entry.after ? Object.keys(entry.after) : [];
                    const date = entry.createdAt
                      ? new Date(entry.createdAt.endsWith('Z') ? entry.createdAt : entry.createdAt + 'Z').toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
                      : '-';
                    return (
                      <div key={entry.id} style={{ borderBottom: '1px solid #444A55', paddingBottom: 10, marginBottom: 10, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              background: isClientAction ? '#1E3A5F' : '#2D3B22',
                              color: isClientAction ? '#3B82F6' : '#0ECB81',
                              borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, flexShrink: 0,
                            }}>
                              {isClientAction ? 'SELF' : 'ADMIN'}
                            </span>
                            <span style={{ color: '#EAECEF', fontWeight: 600 }}>{entry.actionLabel}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ color: '#848E9C', whiteSpace: 'nowrap' }}>{date}</span>
                            <button
                              title="Delete this entry"
                              onClick={async () => {
                                try {
                                  await deleteProfileHistoryEntryApi(profileLead.id, entry.id);
                                  setProfileHistory(prev => prev.filter(e => e.id !== entry.id));
                                } catch (err) {
                                  showNotification('Could not delete entry: ' + (err.message || 'error'));
                                }
                              }}
                              style={{ background: 'none', border: '1px solid #F6465D44', color: '#F6465D', borderRadius: 3, padding: '1px 5px', fontSize: 10, cursor: 'pointer' }}
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                        <div style={{ color: '#848E9C', marginBottom: 4 }}>
                          By: <span style={{ color: isClientAction ? '#EAECEF' : '#F0B90B' }}>{entry.actorName}</span>
                          {entry.ip && <span style={{ color: '#848E9C', marginLeft: 8 }}> /  IP: {entry.ip}</span>}
                        </div>
                        {changedFields.length > 0 && changedFields.filter(k => k !== 'avatar_url').map((field) => {
                          const before = entry.before?.[field];
                          const after  = entry.after?.[field];
                          const fieldLabel = {
                            name: 'Name', email: 'Email', phone: 'Phone',
                            kyc_status: 'KYC Status', status: 'Status',
                          }[field] || field;
                          if (field === 'password') return (
                            <div key={field} style={{ color: '#848E9C', fontStyle: 'italic' }}>Password changed</div>
                          );
                          if (before === undefined && after !== undefined) return (
                            <div key={field} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              <span style={{ color: '#848E9C' }}>{fieldLabel}:</span>
                              <span style={{ color: '#0ECB81' }}>{String(after)}</span>
                            </div>
                          );
                          return (
                            <div key={field} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ color: '#848E9C' }}>{fieldLabel}:</span>
                              <span style={{ color: '#F6465D', textDecoration: 'line-through' }}>{before !== undefined && before !== null ? String(before) : '-'}</span>
                              <span style={{ color: '#848E9C' }}>→</span>
                              <span style={{ color: '#0ECB81' }}>{after !== undefined && after !== null ? String(after) : '-'}</span>
                            </div>
                          );
                        })}
                        {changedFields.includes('avatar_url') && (
                          <div style={{ color: '#848E9C', fontStyle: 'italic' }}>Profile photo updated</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="aax-super-admin-btn aax-super-admin-btn-small" onClick={saveProfile}>💾 Save Changes</button>
                <button className="aax-super-admin-btn aax-super-admin-btn-small aax-super-admin-btn-secondary" onClick={unassignLead}>Return to Pool</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="aax-super-admin-btn aax-super-admin-btn-small"
                  style={{ background: '#7B2FBE', color: '#fff' }}
                  onClick={resetLeadStatus}
                  title="Reset stage to New and erase all status history"
                >
                  🔄 Reset Status
                </button>
                <button
                  className="aax-super-admin-btn aax-super-admin-btn-small"
                  style={{ background: '#8B3A1E', color: '#fff' }}
                  onClick={clearLeadComments}
                  title="Permanently delete all comments on this lead"
                >
                  🗨 Clear Comments
                </button>
                <button className="aax-super-admin-btn aax-super-admin-btn-small" style={{ background: '#c0392b', color: '#fff' }} onClick={() => deleteLead(profileLead)}>🗑 Move to Bin</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          onSave={(updates) => {
            const targetId = editingLead.id;
            setData(prev => ({
              ...prev,
              leads: prev.leads.map(l => l.id === targetId ? { ...l, ...updates } : l),
            }));
            setProfileLead(prev => prev?.id === targetId ? { ...prev, ...updates } : prev);
            showNotification(`Profile updated for ${updates.firstName} ${updates.lastName}.`);
            setEditingLead(null);
            updateLeadApi(targetId, updates).catch((err) => {
              console.error('[SuperAdminPanel] EditLeadModal save failed', err);
              showNotification('Could not save profile changes to the server.');
            });
          }}
        />
      )}

      {kycReviewLead && (
        <KycReviewModal
          lead={kycReviewLead}
          onClose={() => setKycReviewLead(null)}
          onUpdate={(updates) => {
            setData(prev => ({
              ...prev,
              leads: prev.leads.map(l => l.id === kycReviewLead.id ? { ...l, ...updates } : l),
            }));
            setKycReviewLead(prev => prev ? { ...prev, ...updates } : prev);
          }}
          showNotification={showNotification}
        />
      )}
    </div>
    </>
  );
}

function RecycleBin({ data, setData, showNotification }) {
  const [confirmDialog, confirm] = useConfirmDialog();
  const deletedLeads = data.deletedLeads || [];
  const recycleBin = data.recycleBin || [];

  // RecycleBin tab - same backend wiring as the AllLeadsTable bin actions.
  const restoreLead = (lead) => {
    setData(prev => ({
      ...prev,
      leads: [...(prev.leads || []), lead],
      deletedLeads: (prev.deletedLeads || []).filter(l => l.id !== lead.id),
    }));
    showNotification(`Restored lead "${lead.firstName} ${lead.lastName}".`);
    restoreLeadApi(lead.id).catch((error) => {
      console.error('[RecycleBin] restoreLead failed', error);
      showNotification('Could not restore lead on the server.');
      setData(prev => ({
        ...prev,
        leads: (prev.leads || []).filter(l => l.id !== lead.id),
        deletedLeads: [...(prev.deletedLeads || []), lead],
      }));
    });
  };
  const purgeLead = async (lead) => {
    const ok = await confirm({
      title: 'Permanently delete lead?',
      message: `Permanently delete "${lead.firstName} ${lead.lastName}"? This cannot be undone.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
    });
    if (!ok) return;
    setData(prev => ({ ...prev, deletedLeads: (prev.deletedLeads || []).filter(l => l.id !== lead.id) }));
    showNotification('Lead permanently removed.');
    deleteLeadApi(lead.id, { permanent: true, force: true }).catch((error) => {
      console.error('[RecycleBin] purgeLead failed', error);
      showNotification('Could not permanently delete lead on the server.');
      setData(prev => ({ ...prev, deletedLeads: [...(prev.deletedLeads || []), lead] }));
    });
  };
  const restoreItem = async (entry) => {
    const snapshot = data;
    setData(prev => {
      const next = { ...prev, recycleBin: (prev.recycleBin || []).filter(e => e.id !== entry.id) };
      if (entry.type === 'office') next.offices = [...(prev.offices || []), entry.item];
      else if (entry.type === 'team') next.teams = [...(prev.teams || []), entry.item];
      else if (entry.type === 'agent' || entry.type === 'user') {
        next.users = [...(prev.users || []), { ...entry.item, status: 'Active' }];
      }
      return next;
    });
    showNotification(`Restored ${entry.type}.`);
    try {
      if (entry.type === 'office') await restoreOfficeApi(entry.id);
      else if (entry.type === 'team') await restoreTeamApi(entry.id);
      else if (entry.type === 'agent' || entry.type === 'user') await unblockStaffApi(entry.id);
    } catch (err) {
      console.error('[RecycleBin] restoreItem failed', err);
      showNotification(`Could not restore ${entry.type} on the server.`);
      setData(snapshot);
    }
  };
  const purgeItem = async (entry) => {
    const ok = await confirm({
      title: `Permanently delete ${entry.type}?`,
      message: `Permanently delete this ${entry.type}? This cannot be undone.`,
      confirmLabel: 'Delete forever',
      tone: 'danger',
    });
    if (!ok) return;
    setData(prev => ({ ...prev, recycleBin: (prev.recycleBin || []).filter(e => e.id !== entry.id) }));
    showNotification(`${entry.type} permanently removed.`);
    const apiCall =
      entry.type === 'office' ? deleteOfficePermanent(entry.id) :
      entry.type === 'team'   ? deleteTeamPermanent(entry.id) :
      (entry.type === 'agent' || entry.type === 'user') ? deleteStaffApi(entry.id) : null;
    if (apiCall) {
      apiCall.catch(err => {
        console.error('[RecycleBin] purgeItem backend failed', err);
        showNotification(`Could not permanently delete ${entry.type} on the server.`);
        setData(prev => ({ ...prev, recycleBin: [...(prev.recycleBin || []), entry] }));
      });
    }
  };
  const emptyAll = async () => {
    const ok = await confirm({
      title: 'Empty the recycle bin?',
      message: 'Permanently delete ALL items in the bin? This cannot be undone.',
      confirmLabel: 'Empty bin',
      tone: 'danger',
    });
    if (!ok) return;
    // Snapshot before optimistic clear so we can roll back on partial failure.
    const toPurgeLeads = (data.deletedLeads || []).map((l) => l.id);
    const toPurgeBin   = [...(data.recycleBin  || [])];
    setData(prev => ({ ...prev, deletedLeads: [], recycleBin: [] }));
    showNotification('Recycle bin emptied.');
    // Single bulk-purge call for all leads (replaces N individual deletes).
    // purgeBinLeads accepts an ids array and hard-deletes them in one SQL tx.
    const leadPurge = toPurgeLeads.length > 0
      ? purgeBinLeads(toPurgeLeads)
      : Promise.resolve();
    // Offices, teams, and agents still go through their individual endpoints
    // (they live in separate tables with their own cascade rules).
    const binDeletes = toPurgeBin.map((entry) => {
      if (entry.type === 'office') return deleteOfficePermanent(entry.id);
      if (entry.type === 'team')   return deleteTeamPermanent(entry.id);
      if (entry.type === 'agent' || entry.type === 'user') return deleteStaffApi(entry.id);
      return Promise.resolve();
    });
    Promise.allSettled([leadPurge, ...binDeletes]).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected');
      if (failed.length > 0) {
        console.error('[RecycleBin] emptyAll: some items failed to purge', failed);
        showNotification(`Failed to purge ${failed.length} item${failed.length > 1 ? 's' : ''} on the server.`);
      }
    });
  };
  const totalCount = deletedLeads.length + recycleBin.length;

  return (
    <>
    {confirmDialog}
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#EAECEF' }}>🗑 Recycle Bin</h2>
          <div style={{ fontSize: 12, color: '#848E9C', marginTop: 4 }}>{totalCount} item{totalCount !== 1 ? 's' : ''} pending permanent deletion.</div>
        </div>
        {totalCount > 0 && (
          <button className="aax-super-admin-btn" style={{ background: '#c0392b', color: '#fff' }} onClick={emptyAll}>Empty Bin</button>
        )}
      </div>

      <div className="aax-super-admin-card" style={{ marginBottom: 20 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 13, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Deleted Leads ({deletedLeads.length})</h3>
        {deletedLeads.length === 0 ? (
          <div style={{ color: '#848E9C', fontSize: 13, padding: 12, textAlign: 'center' }}>No deleted leads.</div>
        ) : (
          <div className="aax-super-admin-table-wrapper">
            <table className="aax-super-admin-table">
              <thead><tr><th>Name</th><th>Email</th><th>Country</th><th>Status</th><th>Deleted</th><th>Actions</th></tr></thead>
              <tbody>
                {deletedLeads.map(lead => (
                  <tr key={lead.id}>
                    <td style={{ fontWeight: 600 }}>{lead.firstName} {lead.lastName}</td>
                    <td style={{ fontSize: 12, color: '#848E9C' }}>{lead.email}</td>
                    <td>{lead.country}</td>
                    <td><span className={`aax-status-badge ${statusClass(lead.stage)}`}>{normalizeStage(lead.stage)}</span></td>
                    <td style={{ fontSize: 11, color: '#848E9C' }}>{lead.deletedAt ? new Date(lead.deletedAt).toLocaleString() : '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="aax-super-admin-btn aax-super-admin-btn-small" style={{ background: '#0ECB81', color: '#2A2E36' }} onClick={() => restoreLead(lead)}>↻ Restore</button>
                      <button className="aax-super-admin-btn aax-super-admin-btn-small" style={{ marginLeft: 4, background: '#c0392b', color: '#fff' }} onClick={() => purgeLead(lead)}>✕ Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="aax-super-admin-card">
        <h3 style={{ margin: '0 0 12px 0', fontSize: 13, color: '#848E9C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Deleted Offices  /  Teams  /  Agents ({recycleBin.length})</h3>
        {recycleBin.length === 0 ? (
          <div style={{ color: '#848E9C', fontSize: 13, padding: 12, textAlign: 'center' }}>No deleted offices, teams, or agents.</div>
        ) : (
          <div className="aax-super-admin-table-wrapper">
            <table className="aax-super-admin-table">
              <thead><tr><th>Type</th><th>Name</th><th>Deleted</th><th>Actions</th></tr></thead>
              <tbody>
                {recycleBin.map(entry => (
                  <tr key={entry.id}>
                    <td><span style={{ padding: '2px 8px', borderRadius: 4, background: '#363B44', color: '#F0B90B', fontSize: 11, textTransform: 'uppercase' }}>{entry.type}</span></td>
                    <td style={{ fontWeight: 600 }}>{entry.item?.name || entry.item?.firstName || entry.id}</td>
                    <td style={{ fontSize: 11, color: '#848E9C' }}>{entry.deletedAt ? new Date(entry.deletedAt).toLocaleString() : '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="aax-super-admin-btn aax-super-admin-btn-small" style={{ background: '#0ECB81', color: '#2A2E36' }} onClick={() => restoreItem(entry)}>↻ Restore</button>
                      <button className="aax-super-admin-btn aax-super-admin-btn-small" style={{ marginLeft: 4, background: '#c0392b', color: '#fff' }} onClick={() => purgeItem(entry)}>✕ Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function SuperAdminPanel({ data, currentUser, setData, assignOfficeManager, createOfficeWithManager, createTeamLeader, createAgent, toggleStaffBlocked, setLeadAssignment, setUserLoginState, createLead, showNotification }) {
  const navigate = useNavigate();
  const [officeId, setOfficeId] = useState('');
  const [officeName, setOfficeName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [newManager, setNewManager] = useState(null);
  // Team Leader creation states
  const [tlOfficeId, setTlOfficeId] = useState('');
  const [tlTeamName, setTlTeamName] = useState('');
  const [tlLeaderName, setTlLeaderName] = useState('');
  const [tlLeaderPassword, setTlLeaderPassword] = useState('');
  const [tlTeamSize, setTlTeamSize] = useState('');
  const [newTeamLeader, setNewTeamLeader] = useState(null);
  // Agent creation states
  const [agTeamId, setAgTeamId] = useState('');
  const [agAgentName, setAgAgentName] = useState('');
  const [agAgentPassword, setAgAgentPassword] = useState('');
  const [newAgent, setNewAgent] = useState(null);
  // Hierarchy expansion states (used for inline create-form toggles)
  const [expandedOffices, setExpandedOffices] = useState(new Set());
  const [expandedTeams, setExpandedTeams] = useState(new Set());

  // Search state for Offices / Teams / Agents tabs
  const [officeSearch, setOfficeSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');

  // Unified staff search (Staff tab)
  const [staffSearch, setStaffSearch] = useState('');
  const [staffRoleFilter, setStaffRoleFilter] = useState(''); // '' | 'Office Manager' | 'Team Leader' | 'Agent'

  // Staff blocking
  // Derived from data.users so the badge always reflects backend truth
  // (status === 'Suspended' or 'Disabled'). The legacy local-state map has
  // been removed - block/unblock now persists through toggleStaffBlocked.
  const staffBlockedStatus = useMemo(
    () => Object.fromEntries(
      (data.users || []).map((u) => [
        u.id,
        u.status === 'Suspended' || u.status === 'Disabled',
      ])
    ),
    [data.users]
  );
  // Info modal: { type: 'office' | 'team', id }
  const [infoModal, setInfoModal] = useState(null);

  // Edit modal state for renaming staff or changing their password
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editModalType, setEditModalType] = useState('name'); // 'name' | 'password'
  const [editModalTitle, setEditModalTitle] = useState('');
  const [editingValue, setEditingValue] = useState('');
  const [staffMemberName, setStaffMemberName] = useState('');
  const [editPasswordShown, setEditPasswordShown] = useState(false);

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingStaffId(null);
    setEditingValue('');
    setStaffMemberName('');
    setEditModalTitle('');
    setEditPasswordShown(false);
  };

  const generateStrongPassword = () => {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnpqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%^&*';
    const pool = upper + lower + digits + symbols;
    const pick = (s) => s[Math.floor(Math.random() * s.length)];
    let pwd = pick(upper) + pick(lower) + pick(digits) + pick(symbols);
    for (let i = 0; i < 10; i += 1) pwd += pick(pool);
    pwd = pwd.split('').sort(() => Math.random() - 0.5).join('');
    setEditingValue(pwd);
    setEditPasswordShown(true);
  };

  const passwordStrength = (pw) => {
    if (!pw) return { level: 0, label: 'Empty' };
    let score = 0;
    if (pw.length >= 8) score += 1;
    if (pw.length >= 12) score += 1;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
    if (/\d/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;
    const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
    return { level: score, label: labels[score] };
  };

  const saveStaffEdit = async () => {
    if (!editingStaffId) return;
    const value = (editingValue || '').trim();
    if (!value) {
      showNotification(editModalType === 'password' ? 'Password cannot be empty.' : 'Name cannot be empty.');
      return;
    }
    const staff = data.users.find(u => u.id === editingStaffId);
    if (!staff) return;
    const updates = editModalType === 'password'
      ? { password: value }
      : { name: value };
    setData(prev => ({
      ...prev,
      users: prev.users.map(u => (u.id === editingStaffId ? { ...u, ...updates } : u)),
    }));
    closeEditModal();
    showNotification(
      editModalType === 'password'
        ? `Password updated for ${staffMemberName}.`
        : `Renamed to "${value}".`
    );
    try {
      const updated = await updateStaffApi(editingStaffId, updates);
      setData(prev => ({
        ...prev,
        users: prev.users.map(u => (
          u.id === editingStaffId
            ? { ...u, ...updated, password: updated.password || updates.password || u.password }
            : u
        )),
      }));
    } catch (err) {
      console.error('[SuperAdminPanel] saveStaffEdit failed', err);
      showNotification('Could not save staff changes on the server.');
      setData(prev => ({
        ...prev,
        users: prev.users.map(u => (u.id === editingStaffId ? staff : u)),
      }));
    }
  };

  /**
   * Block / unblock a staff member through the real backend. The data.users
   * array is updated by the parent App.jsx via toggleStaffBlocked, which
   * means the badge re-derives automatically on the next render.
   *
   * Falls back to a no-op + notification if the parent didn't wire the prop
   * (e.g. when the panel is mounted in a non-real-auth test harness).
   */
  const blockUnblockStaff = async (staffId) => {
    const staffMember = data.users.find(u => u.id === staffId);
    if (!staffMember) return;
    if (typeof toggleStaffBlocked !== 'function') {
      showNotification('Block/unblock is unavailable in this view.');
      return;
    }
    const currentlyBlocked = staffBlockedStatus[staffId];
    const updated = await toggleStaffBlocked(staffId, currentlyBlocked);
    if (updated) {
      const isBlocked = updated.status === 'Suspended' || updated.status === 'Disabled';
      showNotification(`${staffMember.name} has been ${isBlocked ? 'blocked' : 'unblocked'}`);
    }
  };

  // Crypto admin data uses leads as the single account source for dashboard finance views.
  // Transactions are loaded from the backend via listAllTransactions() below.
  // The server is the single source of truth.
  const [cryptoTransactionData, setCryptoTransactionData] = useState([]);
  const [cryptoActivityLog, setCryptoActivityLog] = useState([]);
  const [cryptoAuditLog, setCryptoAuditLog] = useState([]);
  const [cryptoCryptoData, setCryptoCryptoData] = useState([]);

  useEffect(() => {
    getCryptoData().then((list) => {
      if (Array.isArray(list) && list.length) setCryptoCryptoData(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    listRecentAuditLog({ limit: 30 }).then((entries) => {
      if (cancelled || !entries.length) return;
      const mapped = entries.map((e) => {
        const actor = e.actor_admin_name ? `by ${e.actor_admin_name}` : '';
        const target = e.target_user_name
          ? `on ${e.target_user_name}`
          : e.target_admin_name
          ? `on ${e.target_admin_name}`
          : '';
        const details = `${e.action.replace(/_/g, ' ')} ${actor} ${target}`.trim();
        const action = e.action || '';
        const type = action.includes('balance') ? 'deposit'
          : action.includes('login') ? 'login'
          : action.includes('password') ? 'password-change'
          : action.includes('kyc') ? 'kyc'
          : action.includes('card') ? 'card'
          : action.includes('withdrawal') ? 'withdrawal'
          : action.includes('appointment') ? 'appointment'
          : 'admin-action';
        return {
          userId: e.target_user_id || e.target_admin_id || '',
          type,
          details,
          timestamp: new Date(e.created_at),
        };
      });
      setCryptoActivityLog((prev) => (prev.length === 0 ? mapped : prev));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Live crypto prices: keep the admin's market table in lock-step with what
  // users see by polling CoinGecko every 20 seconds (3 calls/min - well within
  // the public-tier rate limit). Only mutates `price` and `change24h`; other
  // fields like `id`, `asset`, `ticker` stay intact so the rest of the app
  // (Balances, CryptoAddresses, etc.) keeps working with the same identifiers.
  useEffect(() => {
    const ids = {
      BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
      XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', AVAX: 'avalanche-2',
      DOT: 'polkadot', LINK: 'chainlink', MATIC: 'matic-network', LTC: 'litecoin',
      USDT: 'tether', USDC: 'usd-coin', UNI: 'uniswap',
      BCH: 'bitcoin-cash', XLM: 'stellar', FIL: 'filecoin', NEAR: 'near',
    };
    let cancelled = false;
    const tick = async () => {
      try {
        const coinIds = [...new Set(cryptoCryptoData.map(a => ids[a.ticker]).filter(Boolean))];
        if (coinIds.length === 0) return;
        // Prefer the backend proxy (shared 30s cache, no CORS), fall back to
        // CoinGecko direct if the proxy is unreachable.
        let markets = null;
        try {
          const res = await fetch(`/api/market/crypto?ids=${coinIds.join(',')}`);
          if (res.ok) {
            const json = await res.json();
            markets = (json.coins || []).map(c => ({
              id: c.id, current_price: c.current_price, price_change_percentage_24h: c.price_change_percentage_24h,
              total_volume: c.total_volume, market_cap: c.market_cap,
            }));
          }
        } catch {}
        if (!markets) {
          const res = await fetch(
            `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&order=market_cap_desc&per_page=50&page=1&sparkline=false`,
            { headers: { Accept: 'application/json' } }
          );
          if (!res.ok) return;
          markets = await res.json();
        }
        if (cancelled) return;
        const priceMap = {};
        markets.forEach(m => { priceMap[m.id] = m; });
        setCryptoCryptoData(prev => prev.map(asset => {
          const live = priceMap[ids[asset.ticker]];
          if (!live) return asset;
          return {
            ...asset,
            price:      Number.isFinite(live.current_price)               ? live.current_price               : asset.price,
            change24h:  Number.isFinite(live.price_change_percentage_24h) ? live.price_change_percentage_24h : asset.change24h,
            volume24h:  Number.isFinite(live.total_volume)                ? live.total_volume                : asset.volume24h,
            marketCap:  Number.isFinite(live.market_cap)                  ? live.market_cap                  : asset.marketCap,
          };
        }));
      } catch (_) { /* swallow - retry on next tick */ }
    };
    tick();
    const interval = setInterval(tick, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [cryptoCryptoData]);

  const [cryptoCardData, setCryptoCardData] = useState([]);
  const [cryptoWithdrawalData, setCryptoWithdrawalData] = useState([]);
  const [cryptoUserFees, setCryptoUserFees] = useState({});
  const [cryptoClientSpecificFees, setCryptoClientSpecificFees] = useState({});
  // Platform settings (brand, colors, hero copy, etc.) are no longer mirrored
  // into the admin React context. Components that need them call
  // usePlatformSettings() directly - single source of truth, single subscriber.
  // Crypto address book - loaded from /api/admin/crypto/addresses below.
  // The two arrays here are kept in sync with the DB by the address-book
  // mutation handlers in CryptoAddresses.jsx (which call the backend and
  // then push the returned row through these setters).
  const [cryptoGlobalAddressData, setCryptoGlobalAddressData] = useState([]);
  const [cryptoClientAddressData, setCryptoClientAddressData] = useState([]);

  const notificationRef = useRef(null);
  const showCryptoNotification = (message, type) => {
    notificationRef.current.show(message, type);
  };
  const logAdminAction = createLogAdminAction(setCryptoAuditLog);
  const logActivity = createLogActivity(setCryptoActivityLog);
  const leadAccounts = data.leads.map(lead => ({
    ...lead,
    name: lead.name || `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
    officeId: lead.assignedToOffice,
    teamId: lead.assignedToTeam,
    agentId: lead.assignedToAgent,
    leadStatus: lead.stage,
    password: lead.clientPassword || '',
    balances: lead.balances || {},
    balanceHistory: lead.balanceHistory || [],
    accountStatus: lead.accountStatus || 'active',
    kycStatus: lead.kycStatus || 'not submitted',
  }));

  const setLeadAccounts = (updater) => {
    setData(prev => {
      const mapped = prev.leads.map(l => ({
        ...l,
        name: l.name || `${l.firstName || ''} ${l.lastName || ''}`.trim() || 'Unknown',
        officeId: l.assignedToOffice,
        teamId: l.assignedToTeam,
        agentId: l.assignedToAgent,
        leadStatus: l.stage,
        password: l.clientPassword || '',
        balances: l.balances || {},
        balanceHistory: l.balanceHistory || [],
        accountStatus: l.accountStatus || 'active',
        kycStatus: l.kycStatus || 'not submitted',
      }));
      const updated = typeof updater === 'function' ? updater(mapped) : updater;
      const changedLeadUpdates = [];
      const updatedById = Object.fromEntries(updated.map(u => [u.id, u]));
      const nextState = {
        ...prev,
        leads: prev.leads.map(l => {
          const u = updatedById[l.id];
          if (!u) return l;
          const nextLead = {
            ...l,
            name: u.name ?? l.name,
            email: u.email ?? l.email,
            phone: u.phone ?? l.phone,
            country: u.country ?? l.country,
            funnel: u.funnel ?? l.funnel,
            affiliate: u.affiliate ?? l.affiliate,
            registeredDate: u.registeredDate ?? l.registeredDate,
            lastCommentDate: u.lastContactedAt ?? u.lastCommentDate ?? l.lastCommentDate,
            assignedToOffice: u.assignedToOffice ?? u.officeId ?? null,
            assignedToTeam: u.assignedToTeam ?? u.teamId ?? null,
            assignedToAgent: u.assignedToAgent ?? u.agentId ?? null,
            stage: u.stage ?? u.leadStatus ?? l.stage,
            status: u.status ?? l.status,
            kycStatus: u.kycStatus || 'not submitted',
            kycNotes: u.kycNotes ?? l.kycNotes,
            clientPassword: u.clientPassword ?? u.password ?? l.clientPassword,
            balances: u.balances || {},
            balanceHistory: u.balanceHistory || [],
            accountStatus: u.accountStatus || 'active',
          };
          // Only diff & ship the scalar fields the PATCH /api/admin/leads/{id}
          // endpoint actually persists (see lead_update.php $scalarMap and
          // adminApi.leadWritePayload). Balances, balance history, account
          // status, KYC status and KYC notes have their own dedicated
          // endpoints (balance_inject, KYC approve/reject, etc.) and were
          // previously sent here only to be silently dropped server-side -
          // which left them living only in the chainiq_admin_data_v2 cache.
          if (
            l.name !== nextLead.name ||
            l.email !== nextLead.email ||
            l.phone !== nextLead.phone ||
            l.country !== nextLead.country ||
            l.funnel !== nextLead.funnel ||
            l.affiliate !== nextLead.affiliate ||
            l.stage !== nextLead.stage ||
            l.clientPassword !== nextLead.clientPassword
          ) {
            changedLeadUpdates.push({
              id: l.id,
              updates: {
                name: nextLead.name,
                email: nextLead.email,
                phone: nextLead.phone,
                country: nextLead.country,
                funnel: nextLead.funnel,
                affiliate: nextLead.affiliate,
                stage: nextLead.stage,
                clientPassword: nextLead.clientPassword,
              },
            });
          }
          return nextLead;
        }),
      };
      changedLeadUpdates.forEach(({ id, updates }) => {
        updateLeadApi(id, updates).catch((error) => {
          console.error('[SuperAdminPanel] failed to persist lead account fields', error);
          showNotification('Could not persist lead account update.');
        });
      });
      return nextState;
    });
  };

  useEffect(() => {
    let cancelled = false;
    const loadFinancialData = async () => {
      try {
        const [cardResult, txResult] = await Promise.all([
          adminGetAllCards().catch(() => null),
          listAllTransactions({ limit: 500 }).catch(() => ({ transactions: [] })),
        ]);
        const transactions = txResult.transactions || [];
        if (!cancelled) {
          if (cardResult && Array.isArray(cardResult.cards)) {
            const mapped = cardResult.cards.map(c => {
              const expiryStr = (c.expiry_month && c.expiry_year)
                ? `${String(c.expiry_month).padStart(2, '0')}/${String(c.expiry_year).slice(-2)}`
                : '**/**';
              return {
                id:                 c.id,
                userId:             c.user_id,
                cardholderName:     c.user_name || '',
                type:               (c.type || '').toLowerCase(),
                status:             c.status,
                isFrozen:           c.status === 'Frozen',
                isBlocked:          c.status === 'Blocked',
                balance:            0,
                expiry:             expiryStr,
                expiryMonth:        c.expiry_month || null,
                expiryYear:         c.expiry_year  || null,
                cardNumber:         c.pan || '****************',
                cvv:                c.cvv || '***',
                panSet:             !!c.pan,
                cvvSet:             !!c.cvv,
                expirySet:          !!(c.expiry_month && c.expiry_year),
                physicalCardStatus: 'active',
                limits:             c.limits || { daily: 5000, monthly: 25000, contactless: 200 },
                has_pin:            c.has_pin,
                issuedAt:           c.issued_at,
              };
            });
            setCryptoCardData(prev => {
              // Merge: backend is authoritative for any card it knows about.
              // Cards that only exist locally (optimistic inserts) are kept.
              const backendIds = new Set(mapped.map(c => c.id));
              const localOnly = prev.filter(c => !backendIds.has(c.id));
              return [...mapped, ...localOnly];
            });
          }
          setCryptoTransactionData(Array.isArray(transactions) ? transactions : []);
        }
      } catch (error) {
        console.error('[SuperAdminPanel] failed to load financial data', error);
      }
    };
    loadFinancialData();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate the crypto address book from the server. The two arrays are
  // then mutated in-place by the handlers in CryptoAddresses.jsx, which
  // call the backend and patch the returned row through these setters.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { global, client } = await listCryptoAddresses();
        if (cancelled) return;
        setCryptoGlobalAddressData(global);
        setCryptoClientAddressData(client);
      } catch (err) {
        console.error('[SuperAdminPanel] failed to load crypto address book', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load fees from the backend on mount so they reflect the last admin save,
  // not a stale static default. Settings.jsx is the write path.
  useEffect(() => {
    (async () => {
      const s = await fetchAdminSettings(getAdminToken());
      if (!s) return;
      if (s.userFees && typeof s.userFees === 'object') {
        setCryptoUserFees((prev) => ({ ...prev, ...s.userFees }));
      }
      if (s.clientFees && typeof s.clientFees === 'object') {
        setCryptoClientSpecificFees(s.clientFees);
      }
    })();
  }, []);

  // Transactions are persisted by the new admin endpoints
  // (POST/PATCH /api/admin/transactions) - the per-mutation handlers in
  // Transactions.jsx are responsible for keeping the server in sync, so
  // there's no global "save the whole array on every change" effect anymore.

  // No localStorage snapshot of `data`. The admin app is fully backend-driven:
  // every list (offices, teams, leads, staff users, transactions) hydrates
  // from SQLite via App.jsx → loadBackendAdminData(), and per-mutation
  // handlers persist their own changes through the typed admin endpoints
  // (lead_update, balance_inject, kyc/approve, etc.). Caching `data` to
  // localStorage caused balance edits and lead-history changes to appear to
  // survive in the same browser while being silently lost across browsers and
  // admins - see App.jsx for the legacy-cache cleanup.

  const dataContextValue = {
    leads: leadAccounts, setLeads: setLeadAccounts,
    users: leadAccounts, setUsers: setLeadAccounts,
    transactionData: cryptoTransactionData, setTransactionData: setCryptoTransactionData,
    activityLog: cryptoActivityLog, setActivityLog: setCryptoActivityLog,
    auditLog: cryptoAuditLog, setAuditLog: setCryptoAuditLog,
    cryptoData: cryptoCryptoData, setCryptoData: setCryptoCryptoData,
    cardData: cryptoCardData, setCardData: setCryptoCardData,
    withdrawalData: cryptoWithdrawalData, setWithdrawalData: setCryptoWithdrawalData,
    userFees: cryptoUserFees, setUserFees: setCryptoUserFees,
    clientSpecificFees: cryptoClientSpecificFees, setClientSpecificFees: setCryptoClientSpecificFees,
    globalAddressData: cryptoGlobalAddressData, setGlobalAddressData: setCryptoGlobalAddressData,
    clientAddressData: cryptoClientAddressData, setClientAddressData: setCryptoClientAddressData,
    logAdminAction,
    logActivity,
  };
  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('sa_activeTab') || 'Dashboard');
  const [activeSubTab, setActiveSubTab] = useState(() => sessionStorage.getItem('sa_activeSubTab') || 'Lead Management');
  const tabsScrollRef = useRef(null);
  const scrollTabs = (dir) => {
    const el = tabsScrollRef.current;
    if (el) el.scrollBy({ left: dir * 200, behavior: 'smooth' });
  };
  useEffect(() => { sessionStorage.setItem('sa_activeTab', activeTab); }, [activeTab]);
  useEffect(() => { sessionStorage.setItem('sa_activeSubTab', activeSubTab); }, [activeSubTab]);
  useEffect(() => {
    const handler = (e) => setActiveTab(e.detail.tab);
    window.addEventListener('admin:goto-tab', handler);
    return () => window.removeEventListener('admin:goto-tab', handler);
  }, []);

  const [pendingCounts, setPendingCounts] = useState({ withdrawals: 0, deposits: 0, card_requests: 0, password_resets: 0 });
  useEffect(() => {
    let alive = true;
    const fetch = async () => {
      try {
        const counts = await getAdminPendingCounts();
        if (alive) setPendingCounts(counts);
      } catch (_) {}
    };
    fetch();
    const id = setInterval(fetch, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  // Heartbeat - keeps this admin's session marked as "online".
  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    sendHeartbeat(token);
    const id = setInterval(() => sendHeartbeat(token), 30000);
    return () => clearInterval(id);
  }, []);

  const tabs = [
    { name: 'Dashboard', icon: faTachometerAlt },
    { name: 'Leads', icon: faUsers },
    { name: 'Offices', icon: faBuilding },
    { name: 'Teams', icon: faUsers },
    { name: 'Agents', icon: faUser },
    { name: 'Staff', icon: faUsers },
    { name: 'Sessions', icon: faUsers },
    { name: 'Recycle Bin', icon: faTrash },
    { name: 'Settings', icon: faCog },
    { name: 'Audit Log', icon: faHistory },
    { name: 'Agent Access', icon: faKey },
  ];

  const [uploadOfficeId, setUploadOfficeId] = useState('');
  const [uploadTeamId, setUploadTeamId] = useState('');
  const [uploadAgentId, setUploadAgentId] = useState('');
  const [manualLead, setManualLead] = useState({ firstName: '', lastName: '', email: '', funnel: '', affiliate: '' });
  const [manualCountry, setManualCountry] = useState(null);
  const [manualPhoneCountryCode, setManualPhoneCountryCode] = useState('');
  const [manualPhoneNumber, setManualPhoneNumber] = useState('');
  const [csvPreview, setCsvPreview] = useState([]);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [importResults, setImportResults] = useState(null);

  const [saConfirmDialog, saConfirm] = useConfirmDialog();

  // Edit modals for Office / Team / Agent
  const [editingOffice, setEditingOffice] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingAgent, setEditingAgent] = useState(null);

  const saveOfficeEdit = async ({ officeName, managerName, managerEmail, managerPassword }) => {
    const office = editingOffice;
    const mgr = office._mgr || null;
    setEditingOffice(null);

    // Optimistic update
    setData(prev => ({
      ...prev,
      offices: prev.offices.map(o => o.id === office.id ? { ...o, name: officeName } : o),
      users: mgr
        ? prev.users.map(u => {
            if (u.id !== mgr.id) return u;
            return { ...u, ...(managerName ? { name: managerName } : {}), ...(managerEmail ? { email: managerEmail } : {}) };
          })
        : prev.users,
    }));
    showNotification(`Office "${officeName}" updated.`);

    // Backend: office name
    updateOffice(office.id, { name: officeName }).catch(err => {
      console.error('[SuperAdminPanel] saveOfficeEdit (office) failed', err);
      showNotification('Could not save office name on the server.');
      setData(prev => ({ ...prev, offices: prev.offices.map(o => o.id === office.id ? { id: office.id, name: office.name, managerId: office.managerId } : o) }));
    });

    // Backend: manager name / email / password
    if (mgr && (managerName || managerEmail || managerPassword)) {
      const mgrUpdates = {};
      if (managerName) mgrUpdates.name = managerName;
      if (managerEmail) mgrUpdates.email = managerEmail;
      if (managerPassword) mgrUpdates.password = managerPassword;
      updateStaffApi(mgr.id, mgrUpdates)
        .then(updated => {
          setData(prev => ({
            ...prev,
            users: prev.users.map(u => u.id === mgr.id ? { ...u, ...updated, password: updated.password || managerPassword } : u),
          }));
        })
        .catch(err => {
          console.error('[SuperAdminPanel] saveOfficeEdit (manager) failed', err);
          showNotification('Could not save manager details on the server.');
          setData(prev => ({ ...prev, users: prev.users.map(u => u.id === mgr.id ? mgr : u) }));
        });
    }
  };

  const saveTeamEdit = async ({ leaderName, leaderEmail, leaderPassword, ...teamUpdates }) => {
    const team = editingTeam;
    const leader = team._ldr || null;
    setEditingTeam(null);

    setData(prev => ({
      ...prev,
      teams: prev.teams.map(t => t.id === team.id ? { ...t, ...teamUpdates } : t),
      users: leader
        ? prev.users.map(u => {
            if (u.id !== leader.id) return u;
            return { ...u, ...(leaderName ? { name: leaderName } : {}), ...(leaderEmail ? { email: leaderEmail } : {}) };
          })
        : prev.users,
    }));
    showNotification(`Team "${teamUpdates.name}" updated.`);

    updateTeam(team.id, teamUpdates).catch(err => {
      console.error('[SuperAdminPanel] saveTeamEdit failed', err);
      showNotification('Could not save team changes on the server.');
      setData(prev => ({ ...prev, teams: prev.teams.map(t => t.id === team.id ? { id: team.id, name: team.name, officeId: team.officeId, leaderId: team.leaderId, maxSize: team.maxSize } : t) }));
    });

    if (leader && (leaderName || leaderEmail || leaderPassword)) {
      const ldrUpdates = {};
      if (leaderName) ldrUpdates.name = leaderName;
      if (leaderEmail) ldrUpdates.email = leaderEmail;
      if (leaderPassword) ldrUpdates.password = leaderPassword;
      updateStaffApi(leader.id, ldrUpdates)
        .then(updated => {
          setData(prev => ({
            ...prev,
            users: prev.users.map(u => u.id === leader.id ? { ...u, ...updated, password: updated.password || leaderPassword } : u),
          }));
        })
        .catch(err => {
          console.error('[SuperAdminPanel] saveTeamEdit (leader) failed', err);
          showNotification('Could not save leader details on the server.');
          setData(prev => ({ ...prev, users: prev.users.map(u => u.id === leader.id ? leader : u) }));
        });
    }
  };

  const saveAgentEdit = async (updates) => {
    const agent = editingAgent;
    setEditingAgent(null);
    setData(prev => ({
      ...prev,
      users: prev.users.map(u => u.id === agent.id ? { ...u, ...updates } : u),
    }));
    showNotification(`Agent "${updates.name}" updated.`);
    updateStaffApi(agent.id, updates).catch(err => {
      console.error('[SuperAdminPanel] saveAgentEdit failed', err);
      showNotification('Could not save agent changes on the server.');
      setData(prev => ({ ...prev, users: prev.users.map(u => u.id === agent.id ? agent : u) }));
    });
  };

  const softDeleteOffice = async (office) => {
    const ok = await saConfirm({
      title: 'Delete office permanently?',
      message: `Delete "${office.name}"? All staff in this office and their teams will be permanently deleted. Their leads will return to the unassigned pool.`,
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    });
    if (!ok) return;
    // Collect all staff in this office so we can cascade UI removal.
    const officeStaffIds = data.users
      .filter(u => u.officeId === office.id)
      .map(u => u.id);
    const officeTeamIds = data.teams
      .filter(t => t.officeId === office.id)
      .map(t => t.id);
    setData(prev => ({
      ...prev,
      offices: prev.offices.filter(o => o.id !== office.id),
      teams:   prev.teams.filter(t => t.officeId !== office.id),
      users:   prev.users.filter(u => u.officeId !== office.id),
      leads:   prev.leads.map(l =>
        officeStaffIds.includes(l.assignedToAgent) || officeTeamIds.includes(l.assignedToTeam) || l.assignedToOffice === office.id
          ? {
              ...l,
              assignedToAgent: null,
              assignedToTeam: null,
              assignedToOffice: null,
              assignedAgentName: null,
              assignedTeamName: null,
              assignedOfficeName: null,
            }
          : l
      ),
    }));
    showNotification(`Office "${office.name}" and all its staff deleted.`);
    deleteOffice(office.id).catch(err => {
      console.error('[SuperAdminPanel] softDeleteOffice failed', err);
      showNotification(err.message || 'Could not delete office on the server.');
    });
  };

  const softDeleteTeam = async (team) => {
    const ok = await saConfirm({
      title: 'Delete team permanently?',
      message: `Delete "${team.name}"? All staff in this team will be permanently deleted. Their leads will return to the unassigned pool.`,
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    });
    if (!ok) return;
    const teamStaffIds = data.users
      .filter(u => u.teamId === team.id)
      .map(u => u.id);
    setData(prev => ({
      ...prev,
      teams: prev.teams.filter(t => t.id !== team.id),
      users: prev.users.filter(u => u.teamId !== team.id),
      leads: prev.leads.map(l =>
        teamStaffIds.includes(l.assignedToAgent) || l.assignedToTeam === team.id
          ? {
              ...l,
              assignedToAgent: null,
              assignedToTeam: null,
              assignedToOffice: null,
              assignedAgentName: null,
              assignedTeamName: null,
              assignedOfficeName: null,
            }
          : l
      ),
    }));
    showNotification(`Team "${team.name}" and all its staff deleted.`);
    deleteTeam(team.id).catch(err => {
      console.error('[SuperAdminPanel] softDeleteTeam failed', err);
      showNotification(err.message || 'Could not delete team on the server.');
    });
  };

  const softDeleteAgent = async (agent) => {
    const ok = await saConfirm({
      title: 'Delete staff member permanently?',
      message: `Delete "${agent.name}"? Their account will be permanently removed. Any leads assigned to them will return to the unassigned pool.`,
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    });
    if (!ok) return;
    setData(prev => ({
      ...prev,
      users: prev.users.filter(u => u.id !== agent.id),
      leads: prev.leads.map(l =>
        l.assignedToAgent === agent.id
          ? {
              ...l,
              assignedToAgent: null,
              assignedToTeam: null,
              assignedToOffice: null,
              assignedAgentName: null,
              assignedTeamName: null,
              assignedOfficeName: null,
            }
          : l
      ),
    }));
    showNotification(`${agent.name} deleted. Their leads returned to the pool.`);
    deleteStaffApi(agent.id).catch(err => {
      console.error('[SuperAdminPanel] softDeleteAgent failed', err);
      showNotification(err.message || 'Could not delete staff on the server.');
    });
  };

  const copyToClipboard = async (link) => {
    try {
      await navigator.clipboard.writeText(link);
      showNotification('Login link copied to clipboard');
    } catch {
      showNotification('Copy failed, please copy manually');
    }
  };

  // Staff tab - computed before JSX return so they're available in the ternary
  const staffRows = data.users.filter(u => {
    const isStaff = u.role === ROLE.OFFICE_MANAGER || u.role === ROLE.TEAM_LEADER || u.role === ROLE.AGENT;
    if (!isStaff) return false;
    if (u.status === 'Disabled') return false;
    if (staffRoleFilter && u.role !== staffRoleFilter) return false;
    if (!staffSearch.trim()) return true;
    const q = staffSearch.toLowerCase();
    const office = data.offices.find(o => o.id === u.officeId);
    const team = data.teams.find(t => t.id === u.teamId);
    return (
      u.name.toLowerCase().includes(q) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      u.role.toLowerCase().includes(q) ||
      (office && office.name.toLowerCase().includes(q)) ||
      (team && team.name.toLowerCase().includes(q))
    );
  });
  const staffRoleLabel = { [ROLE.OFFICE_MANAGER]: 'Office Manager', [ROLE.TEAM_LEADER]: 'Team Leader', [ROLE.AGENT]: 'Agent' };
  const staffRoleBadgeStyle = {
    [ROLE.OFFICE_MANAGER]: { background: 'rgba(240,185,11,0.15)', color: '#F0B90B', border: '1px solid #F0B90B40' },
    [ROLE.TEAM_LEADER]:    { background: 'rgba(69,210,160,0.15)', color: '#45d2a0', border: '1px solid #45d2a040' },
    [ROLE.AGENT]:          { background: 'rgba(52,152,219,0.15)', color: '#3498db', border: '1px solid #3498db40' },
  };

  return (
    <NotificationContext.Provider value={showCryptoNotification}>
      <DataContext.Provider value={dataContextValue}>
        <div className="aax-super-admin-container">
          {saConfirmDialog}
          {editingOffice && (() => {
            const _mgr = editingOffice._mgr || null;
            return <EditOfficeModal office={editingOffice} officeManager={_mgr} isManagerBlocked={_mgr ? !!staffBlockedStatus[_mgr.id] : false} onBlock={_mgr ? () => blockUnblockStaff(_mgr.id, ROLE.OFFICE_MANAGER) : undefined} onClose={() => setEditingOffice(null)} onSave={saveOfficeEdit} />;
          })()}
          {editingTeam && (() => {
            const _ldr = editingTeam._ldr || null;
            return <EditTeamModal team={editingTeam} offices={data.offices} teamLeader={_ldr} isLeaderBlocked={_ldr ? !!staffBlockedStatus[_ldr.id] : false} onBlock={_ldr ? () => blockUnblockStaff(_ldr.id, ROLE.TEAM_LEADER) : undefined} onClose={() => setEditingTeam(null)} onSave={saveTeamEdit} />;
          })()}
          {editingAgent && <EditAgentModal agent={editingAgent} teams={data.teams} isBlocked={!!staffBlockedStatus[editingAgent.id]} onBlock={() => blockUnblockStaff(editingAgent.id, ROLE.AGENT)} onClose={() => setEditingAgent(null)} onSave={saveAgentEdit} />}
          <div className="aax-super-admin-header aax-role-panel-header">
            <div className="aax-super-admin-header-top">
              <h3 className="aax-super-admin-title">⚙ Super Admin Panel</h3>
              <HealthIndicator token={getAdminToken()} />
            </div>
            <div
              ref={tabsScrollRef}
              className="aax-super-admin-tabs"
            >
              {tabs.map(tab => {
                const badge =
                  tab.name === 'Withdrawals' ? pendingCounts.withdrawals :
                  tab.name === 'Deposits'    ? pendingCounts.deposits    : 0;
                return (
                  <button
                    key={tab.name}
                    onClick={() => setActiveTab(tab.name)}
                    className={`aax-super-admin-tab-btn ${activeTab === tab.name ? 'aax-active' : ''}`}
                  >
                    <FontAwesomeIcon icon={tab.icon} />
                    {tab.name}
                    {badge > 0 && (
                      <span className="aax-tab-pending-badge" aria-label={`${badge} pending`}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="aax-super-admin-content">
            {activeTab === 'Sessions' ? (
              <div className="aax-super-admin-card">
                <h2 style={{ marginBottom: 6 }}>🟢 Live Sessions</h2>
                <p style={{ color: '#848E9C', fontSize: 13, marginBottom: 20 }}>
                  Real-time view of who is online across all offices, teams, and the client portal. Track individuals to get notified when they come online.
                </p>
                <Sessions token={getAdminToken()} />
              </div>
            ) : activeTab === 'Leads' ? (
              <div className="leads-content">
                <div className="aax-tab-row">
                  <button className={"aax-tab-btn " + (activeSubTab === 'Lead Management' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Lead Management')}>
                    Lead Management
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Lead Upload' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Lead Upload')}>
                    Lead Upload
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Balances' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Balances')}>
                    Balances
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Transactions' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Transactions')}>
                    Transactions
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Card Management' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Card Management')}>
                    Card Management
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Crypto Addresses' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Crypto Addresses')}>
                    Crypto Addresses
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Registrations' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Registrations')}>
                    Registrations
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Notifications' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Notifications')}>
                    Notifications
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Security' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Security')} style={{ position: 'relative' }}>
                    Security
                    {pendingCounts.password_resets > 0 && <span className="aax-tab-pending-badge" aria-label={`${pendingCounts.password_resets} pending`}>{pendingCounts.password_resets > 99 ? '99+' : pendingCounts.password_resets}</span>}
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Deposits' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Deposits')} style={{ position: 'relative' }}>
                    Deposits
                    {pendingCounts.deposits > 0 && <span className="aax-tab-pending-badge" aria-label={`${pendingCounts.deposits} pending`}>{pendingCounts.deposits > 99 ? '99+' : pendingCounts.deposits}</span>}
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'Withdrawals' ? 'aax-active' : '')} onClick={() => setActiveSubTab('Withdrawals')} style={{ position: 'relative' }}>
                    Withdrawals
                    {pendingCounts.withdrawals > 0 && <span className="aax-tab-pending-badge" aria-label={`${pendingCounts.withdrawals} pending`}>{pendingCounts.withdrawals > 99 ? '99+' : pendingCounts.withdrawals}</span>}
                  </button>
                  <button className={"aax-tab-btn " + (activeSubTab === 'KYC Review' ? 'aax-active' : '')} onClick={() => setActiveSubTab('KYC Review')}>
                    KYC Review
                  </button>
                </div>
                {activeSubTab === 'Lead Management' ? (
                  <div>
                    <div className="aax-super-admin-card">
                      <h2 style={{ marginBottom: 6 }}>[users] Lead Management</h2>
                      <p style={{ color: '#848E9C', fontSize: 13, marginBottom: 20 }}>
                        Leads are the single account source visible to agents, teams, and offices - filtered by their scope. Here you see every record system-wide.
                      </p>
                      <AllLeadsTable data={data} currentUser={currentUser} setData={setData} setLeadAssignment={setLeadAssignment} showNotification={showNotification} />
                    </div>
                  </div>
                ) : activeSubTab === 'Lead Upload' ? (
                  <div style={{ padding: 24 }}>
                    <div className="aax-super-admin-card" style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <div>
                          <h2 style={{ margin: '0 0 4px 0' }}>[upload] Lead Import</h2>
                          <p style={{ margin: 0, color: '#848E9C', fontSize: 13 }}>Import leads via CSV or add them one at a time. Optionally assign to an office, team, or agent on import.</p>
                        </div>
                        <a href="data:text/csv;charset=utf-8,firstName,lastName,email,phone,country,funnel,affiliate" download="leads-template.csv" style={{ padding: '8px 16px', background: '#444A55', color: '#EAECEF', borderRadius: 8, fontSize: 13, textDecoration: 'none', border: '1px solid #3C4754', whiteSpace: 'nowrap' }}>⬇ Template</a>
                      </div>
                      <div className="aax-super-admin-form-row" style={{ marginBottom: 0 }}>
                        <div className="aax-super-admin-form-group">
                          <label>Assign to Office</label>
                          <select className="aax-super-admin-select" value={uploadOfficeId} onChange={e => { setUploadOfficeId(e.target.value); setUploadTeamId(''); setUploadAgentId(''); }}>
                            <option value="">- Any Office -</option>
                            {data.offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                        </div>
                        <div className="aax-super-admin-form-group">
                          <label>Assign to Team</label>
                          <select className="aax-super-admin-select" value={uploadTeamId} onChange={e => { setUploadTeamId(e.target.value); setUploadAgentId(''); }}>
                            <option value="">- Any Team -</option>
                            {data.teams.filter(t => !uploadOfficeId || t.officeId === uploadOfficeId).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </div>
                        <div className="aax-super-admin-form-group">
                          <label>Assign to Agent</label>
                          <select className="aax-super-admin-select" value={uploadAgentId} onChange={e => setUploadAgentId(e.target.value)}>
                            <option value="">- Any Agent -</option>
                            {data.users.filter(u => u.role === ROLE.AGENT && (!uploadTeamId || u.teamId === uploadTeamId)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                      <div className="aax-super-admin-card">
                        <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600 }}>CSV File Import</h3>
                        <div
                          onDragOver={e => { e.preventDefault(); setUploadDragOver(true); }}
                          onDragLeave={() => setUploadDragOver(false)}
                          onDrop={e => {
                            e.preventDefault(); setUploadDragOver(false);
                            const file = e.dataTransfer.files[0];
                            if (file && file.name.endsWith('.csv')) {
                              const reader = new FileReader();
                              reader.onload = ev => {
                                const rows = ev.target.result.split('\n').filter(l => l.trim());
                                const headers = rows[0].split(',').map(h => h.trim());
                                setCsvPreview(rows.slice(1).map(line => { const v = line.split(','); return headers.reduce((o,h,i) => { o[h] = (v[i]||'').trim(); return o; }, {}); }));
                                setImportResults(null);
                              };
                              reader.readAsText(file);
                            } else { showNotification('Please drop a valid .csv file'); }
                          }}
                          onClick={() => document.getElementById('csvUploadInput').click()}
                          style={{ border: '2px dashed ' + (uploadDragOver ? '#F0B90B' : '#444A55'), borderRadius: 10, padding: '28px 20px', textAlign: 'center', marginBottom: 16, cursor: 'pointer', transition: 'all 0.2s', background: uploadDragOver ? 'rgba(240,185,11,0.04)' : 'transparent' }}
                        >
                          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
                          <div style={{ color: '#EAECEF', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Drag &amp; drop a CSV file</div>
                          <div style={{ color: '#848E9C', fontSize: 12 }}>or click to browse &nbsp;&middot;&nbsp; columns: firstName, lastName, email, phone, country, funnel, affiliate</div>
                          <input id="csvUploadInput" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => {
                            const file = e.target.files[0]; if (!file) return;
                            const reader = new FileReader();
                            reader.onload = ev => {
                              const rows = ev.target.result.split('\n').filter(l => l.trim());
                              const headers = rows[0].split(',').map(h => h.trim());
                              setCsvPreview(rows.slice(1).map(line => { const v = line.split(','); return headers.reduce((o,h,i) => { o[h] = (v[i]||'').trim(); return o; }, {}); }));
                              setImportResults(null);
                            };
                            reader.readAsText(file); e.target.value = '';
                          }} />
                        </div>
                        {csvPreview.length > 0 && (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                              <span style={{ color: '#848E9C', fontSize: 13 }}>{csvPreview.length} rows detected</span>
                              <button onClick={() => { setCsvPreview([]); setImportResults(null); }} style={{ padding: '3px 10px', background: 'transparent', border: '1px solid #3C4754', borderRadius: 6, color: '#848E9C', fontSize: 12, cursor: 'pointer' }}>✕ Clear</button>
                            </div>
                            <div className="aax-super-admin-table-wrapper" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
                              <table className="aax-super-admin-table">
                                <thead><tr>{csvPreview[0] && Object.keys(csvPreview[0]).map(h => <th key={h}>{h}</th>)}</tr></thead>
                                <tbody>{csvPreview.slice(0,10).map((row,i) => <tr key={i}>{Object.values(row).map((v,j) => <td key={j}>{v||'-'}</td>)}</tr>)}</tbody>
                              </table>
                            </div>
                            {csvPreview.length > 10 && <p style={{ color: '#848E9C', fontSize: 11, marginBottom: 10, margin: '0 0 10px 0' }}>Showing first 10 of {csvPreview.length} rows</p>}
                            <button className="aax-super-admin-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={async () => {
                              let successCount = 0;
                              let failCount = 0;
                              for (const row of csvPreview) {
                                const result = await createLead({
                                  firstName: row.firstName || row.first_name || '',
                                  lastName: row.lastName || row.last_name || '',
                                  email: row.email || '',
                                  phone: row.phone || '',
                                  country: row.country || '',
                                  funnel: row.funnel || '',
                                  affiliate: row.affiliate || '',
                                  assignedToOffice: uploadOfficeId || null,
                                  assignedToTeam: uploadTeamId || null,
                                  assignedToAgent: uploadAgentId || null,
                                });
                                if (result) successCount++; else failCount++;
                              }
                              setImportResults({ count: successCount, failed: failCount });
                              setCsvPreview([]);
                              showNotification(`${successCount} leads imported${failCount ? `, ${failCount} failed` : ''}`);
                            }}>✓ Import {csvPreview.length} Leads</button>
                          </>
                        )}
                        {importResults && (
                          <div style={{ background: 'rgba(69,210,160,0.08)', border: '1px solid #45d2a030', borderRadius: 8, padding: 14, marginTop: 12, textAlign: 'center' }}>
                            <div style={{ color: '#45d2a0', fontWeight: 700 }}>OK {importResults.count} leads imported</div>
                            <div style={{ color: '#848E9C', fontSize: 12, marginTop: 4 }}>They now appear in Lead Management</div>
                          </div>
                        )}
                      </div>
                      <div className="aax-super-admin-card">
                        <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600 }}>Manual Entry</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><div style={{ fontSize: 12, color: '#848E9C', marginBottom: 4 }}>First Name *</div><input className="aax-super-admin-input" placeholder="First name..." value={manualLead.firstName} onChange={e => setManualLead(p => ({ ...p, firstName: e.target.value }))} autoComplete="off" /></div>
                            <div><div style={{ fontSize: 12, color: '#848E9C', marginBottom: 4 }}>Last Name</div><input className="aax-super-admin-input" placeholder="Last name..." value={manualLead.lastName} onChange={e => setManualLead(p => ({ ...p, lastName: e.target.value }))} autoComplete="off" /></div>
                          </div>
                          <div><div style={{ fontSize: 12, color: '#848E9C', marginBottom: 4 }}>Email *</div><input className="aax-super-admin-input" placeholder="email@example.com" type="email" value={manualLead.email} onChange={e => setManualLead(p => ({ ...p, email: e.target.value }))} autoComplete="off" /></div>
                          <div>
                            <div style={{ fontSize: 12, color: '#848E9C', marginBottom: 4 }}>Country</div>
                            <CountrySelect
                              value={manualCountry?.code || ''}
                              onChange={(c) => {
                                setManualCountry(c);
                                if (c && !manualPhoneCountryCode) setManualPhoneCountryCode(c.code);
                              }}
                            />
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: '#848E9C', marginBottom: 4 }}>Phone</div>
                            <PhoneInput
                              countryCode={manualPhoneCountryCode}
                              onCountryCodeChange={(code) => {
                                setManualPhoneCountryCode(code);
                                if (!manualCountry) {
                                  const found = COUNTRY_LIST.find(x => x.code === code);
                                  if (found) setManualCountry(found);
                                }
                              }}
                              number={manualPhoneNumber}
                              onNumberChange={setManualPhoneNumber}
                            />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div><div style={{ fontSize: 12, color: '#848E9C', marginBottom: 4 }}>Funnel</div><input className="aax-super-admin-input" placeholder="Funnel name..." value={manualLead.funnel} onChange={e => setManualLead(p => ({ ...p, funnel: e.target.value }))} autoComplete="off" /></div>
                            <div><div style={{ fontSize: 12, color: '#848E9C', marginBottom: 4 }}>Affiliate</div><input className="aax-super-admin-input" placeholder="Affiliate code..." value={manualLead.affiliate} onChange={e => setManualLead(p => ({ ...p, affiliate: e.target.value }))} autoComplete="off" /></div>
                          </div>
                          <button className="aax-super-admin-btn" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} disabled={!manualLead.firstName || !manualLead.email} onClick={async () => {
                            const emailVal = (manualLead.email || '').trim();
                            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailVal)) {
                              alert('Please enter a valid email address.');
                              return;
                            }
                            const fullPhone = buildStoredPhone(manualPhoneCountryCode, manualPhoneNumber);
                            const result = await createLead({
                              ...manualLead,
                              phone: fullPhone,
                              country: manualCountry?.name || '',
                              countryCode: manualCountry?.code || '',
                              assignedToOffice: uploadOfficeId || null,
                              assignedToTeam: uploadTeamId || null,
                              assignedToAgent: uploadAgentId || null,
                            });
                            if (result) {
                              setManualLead({ firstName: '', lastName: '', email: '', funnel: '', affiliate: '' });
                              setManualCountry(null);
                              setManualPhoneCountryCode('');
                              setManualPhoneNumber('');
                            }
                          }}>✓ Add Lead</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeSubTab === 'Balances' ? (
                  <Balances />
                ) : activeSubTab === 'Transactions' ? (
                  <Transactions />
                ) : activeSubTab === 'Card Management' ? (
                  <CardManagement />
                ) : activeSubTab === 'Crypto Addresses' ? (
                  <CryptoAddresses />
                ) : activeSubTab === 'Registrations' ? (
                  <SignupRequests
                    data={data}
                    showNotification={showNotification}
                    onLeadCreated={(lead) => {
                      if (lead?.id) {
                        setData((prev) => ({
                          ...prev,
                          leads: prev.leads.some((l) => l.id === lead.id)
                            ? prev.leads.map((l) => (l.id === lead.id ? lead : l))
                            : [...prev.leads, lead],
                        }));
                      }
                    }}
                  />
                ) : activeSubTab === 'Notifications' ? (
                  <Notifications data={data} setData={setData} currentUserId={data.users.find(u => u.role === ROLE.SUPER_ADMIN)?.id} />
                ) : activeSubTab === 'Security' ? (
                  <SecurityRequests showNotification={showNotification} />
                ) : activeSubTab === 'Deposits' ? (
                  <DepositRequests />
                ) : activeSubTab === 'Withdrawals' ? (
                  <WithdrawalQueue />
                ) : activeSubTab === 'KYC Review' ? (
                  <KycReview />
                ) : null}
              </div>
            ) : activeTab === 'Offices' ? (
              <div style={{ padding: 24 }}>
                <div className="aax-super-admin-card" style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ margin: '0 0 4px 0' }}>[office] Offices</h2>
                      <p style={{ margin: 0, color: '#848E9C', fontSize: 13 }}>{data.offices.length} offices &mdash; manage offices and their managers</p>
                    </div>
                    <button className="aax-super-admin-btn" onClick={() => setExpandedOffices(prev => { const s = new Set(prev); s.has('__create') ? s.delete('__create') : s.add('__create'); return s; })}>
                      {expandedOffices.has('__create') ? '✕ Cancel' : '+ New Office'}
                    </button>
                  </div>
                </div>
                {expandedOffices.has('__create') && (
                  <div className="aax-super-admin-card" style={{ marginBottom: 20, background: 'rgba(243,186,47,0.04)', borderColor: '#F0B90B30' }}>
                    <h3 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 600 }}>New Office &amp; Manager</h3>
                    <div className="aax-super-admin-form-row">
                      <div className="aax-super-admin-form-group">
                        <label>Office Name</label>
                        <input className="aax-super-admin-input" autoComplete="off" placeholder="Office name..." value={officeName} onChange={e => setOfficeName(e.target.value)} />
                      </div>
                      <div className="aax-super-admin-form-group">
                        <label>Manager Name</label>
                        <input className="aax-super-admin-input" autoComplete="off" placeholder="Manager name..." value={managerName} onChange={e => setManagerName(e.target.value)} />
                      </div>
                      <div className="aax-super-admin-form-group">
                        <label>Password</label>
                        <input className="aax-super-admin-input" autoComplete="new-password" placeholder="Password..." type="password" value={managerPassword} onChange={e => setManagerPassword(e.target.value)} />
                      </div>
                      <div className="aax-super-admin-form-group" style={{ justifyContent: 'flex-end' }}>
                        <label style={{ visibility: 'hidden' }}>_</label>
                        <button className="aax-super-admin-btn" disabled={!officeName || !managerName || !managerPassword} onClick={async () => {
                          const newMgr = await createOfficeWithManager(officeName, managerName, managerPassword);
                          if (newMgr) setNewManager(newMgr);
                          setOfficeName(''); setManagerName(''); setManagerPassword('');
                          setExpandedOffices(prev => { const s = new Set(prev); s.delete('__create'); return s; });
                        }}>✓ Create</button>
                      </div>
                    </div>
                    {newManager && (
                      <div className="aax-credentials-output-container" style={{ marginTop: 14 }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: 13 }}>Created: {newManager.name}</h4>
                        <div className="aax-credential-item"><span>Login Link</span><code>{newManager.loginLink}</code><button className="aax-link-copy-btn" onClick={() => copyToClipboard(newManager.loginLink)}>[list] Copy</button></div>
                        <div className="aax-credential-item"><span>Password</span><code>{newManager.password}</code><button className="aax-link-copy-btn" onClick={() => copyToClipboard(newManager.password)}>[list] Copy</button></div>
                      </div>
                    )}
                  </div>
                )}
                <div className="aax-super-admin-card">
                  <div style={{ marginBottom: 12 }}>
                    <input
                      className="aax-super-admin-input"
                      style={{ width: '100%', maxWidth: 340 }}
                      placeholder="[search]  Search offices or managers..."
                      value={officeSearch}
                      onChange={e => setOfficeSearch(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="aax-super-admin-table-wrapper">
                    <table className="aax-super-admin-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Office</th>
                          <th>Manager</th>
                          <th style={{ textAlign: 'center' }}>Teams</th>
                          <th style={{ textAlign: 'center' }}>Agents</th>
                          <th style={{ textAlign: 'center' }}>Leads</th>
                          <th style={{ textAlign: 'center' }}>Deposits</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.offices.filter(office => {
                          if (!officeSearch.trim()) return true;
                          const q = officeSearch.toLowerCase();
                          const manager = data.users.find(u => u.role === ROLE.OFFICE_MANAGER && u.officeId === office.id);
                          return office.name.toLowerCase().includes(q) || (manager && manager.name.toLowerCase().includes(q));
                        }).map(office => {
                          const officeManager = data.users.find(u => u.role === ROLE.OFFICE_MANAGER && u.officeId === office.id);
                          const officeTeams = data.teams.filter(t => t.officeId === office.id);
                          const officeLeads = data.leads.filter(l => l.assignedToOffice === office.id);
                          const officeAgents = data.users.filter(u => u.role === ROLE.AGENT && u.officeId === office.id);
                          const officeDeposits = officeLeads.filter(l => l.stage === 'Deposit').length;
                          return (
                            <tr key={office.id} style={{ cursor: 'pointer' }} onClick={() => setInfoModal({ type: 'office', id: office.id })}>
                              <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#848E9C' }}>{office.id ? office.id.slice(0, 6) : '-'}</span>
                                  {office.id && <button title={office.id} onClick={() => navigator.clipboard.writeText(office.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#848E9C', padding: '2px 4px', lineHeight: 1, borderRadius: 3 }} onMouseEnter={e => e.currentTarget.style.color = '#F0B90B'} onMouseLeave={e => e.currentTarget.style.color = '#848E9C'}><i className="fas fa-copy" style={{ fontSize: 10 }}></i></button>}
                                </div>
                              </td>
                              <td style={{ fontWeight: 600 }}>{office.name}</td>
                              <td>
                                {officeManager ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className={'status-indicator ' + (officeManager.isLoggedIn ? 'aax-online' : 'aax-offline')}></span>
                                    {officeManager.name}
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <select className="aax-super-admin-select" style={{ fontSize: 12, padding: '3px 6px', flex: 1 }} value={officeId} onChange={e => setOfficeId(e.target.value)}>
                                      <option value="">Assign manager...</option>
                                      {data.users.filter(u => u.role === ROLE.OFFICE_MANAGER && !u.officeId).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                    <button className="aax-super-admin-btn aax-super-admin-btn-small" disabled={!officeId} onClick={() => { assignOfficeManager(office.id, officeId); showNotification('Manager assigned!'); setOfficeId(''); }}>✓</button>
                                  </div>
                                )}
                              </td>
                              <td style={{ textAlign: 'center' }}>{officeTeams.length}</td>
                              <td style={{ textAlign: 'center' }}>{officeAgents.length}</td>
                              <td style={{ textAlign: 'center' }}>{officeLeads.length}</td>
                              <td style={{ textAlign: 'center', color: '#45d2a0', fontWeight: 600 }}>{officeDeposits}</td>
                              <td>
                                {officeManager ? (
                                  <span className={'aax-badge ' + (staffBlockedStatus[officeManager.id] ? 'aax-badge-danger' : 'aax-badge-success')}>{staffBlockedStatus[officeManager.id] ? 'Blocked' : 'Active'}</span>
                                ) : <span className="aax-badge aax-badge-warning">No Manager</span>}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                                  {officeManager && (
                                    <button className="aax-staff-action-btn btn-impersonate" onClick={() => navigate('/admin/office-manager/' + officeManager.id)} title="View panel">View View Panel</button>
                                  )}
                                  <button className="aax-staff-action-btn btn-edit-name" onClick={() => setEditingOffice({ ...office, _mgr: officeManager })} title="Edit office"> Edit</button>
                                  <button className="aax-staff-action-btn" style={{ background: 'rgba(246,70,93,0.15)', color: '#F6465D', border: '1px solid #F6465D40' }} onClick={() => softDeleteOffice(office)} title="Move office to bin">🗑 Delete</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : activeTab === 'Teams' ? (
              <div style={{ padding: 24 }}>
                <div className="aax-super-admin-card" style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h2 style={{ margin: '0 0 4px 0' }}>[users] Teams</h2>
                      <p style={{ margin: 0, color: '#848E9C', fontSize: 13 }}>{data.teams.length} teams &mdash; manage teams and their leaders</p>
                    </div>
                    <button className="aax-super-admin-btn" onClick={() => setExpandedTeams(prev => { const s = new Set(prev); s.has('__create') ? s.delete('__create') : s.add('__create'); return s; })}>
                      {expandedTeams.has('__create') ? '✕ Cancel' : '+ New Team'}
                    </button>
                  </div>
                </div>
                {expandedTeams.has('__create') && (
                  <div className="aax-super-admin-card" style={{ marginBottom: 20, background: 'rgba(69,210,160,0.04)', borderColor: '#45d2a030' }}>
                    <h3 style={{ margin: '0 0 14px 0', fontSize: 14, fontWeight: 600 }}>New Team &amp; Leader</h3>
                    <div className="aax-super-admin-form-row">
                      <div className="aax-super-admin-form-group">
                        <label>Office</label>
                        <select className="aax-super-admin-select" value={tlOfficeId} onChange={e => setTlOfficeId(e.target.value)}>
                          <option value="">Choose office...</option>
                          {data.offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                      </div>
                      <div className="aax-super-admin-form-group">
                        <label>Team Name</label>
                        <input className="aax-super-admin-input" autoComplete="off" placeholder="Team name..." value={tlTeamName} onChange={e => setTlTeamName(e.target.value)} />
                      </div>
                      <div className="aax-super-admin-form-group">
                        <label>Max Size</label>
                        <input className="aax-super-admin-input" autoComplete="off" placeholder="e.g. 10" type="number" value={tlTeamSize} onChange={e => setTlTeamSize(e.target.value)} />
                      </div>
                      <div className="aax-super-admin-form-group">
                        <label>Leader Name</label>
                        <input className="aax-super-admin-input" autoComplete="off" placeholder="Leader name..." value={tlLeaderName} onChange={e => setTlLeaderName(e.target.value)} />
                      </div>
                      <div className="aax-super-admin-form-group">
                        <label>Password</label>
                        <input className="aax-super-admin-input" autoComplete="new-password" placeholder="Password..." type="password" value={tlLeaderPassword} onChange={e => setTlLeaderPassword(e.target.value)} />
                      </div>
                      <div className="aax-super-admin-form-group" style={{ justifyContent: 'flex-end' }}>
                        <label style={{ visibility: 'hidden' }}>_</label>
                        <button className="aax-super-admin-btn" disabled={!tlOfficeId || !tlTeamName || !tlLeaderName || !tlLeaderPassword || !tlTeamSize} onClick={async () => {
                          const newTl = await createTeamLeader(tlOfficeId, tlTeamName, tlLeaderName, tlLeaderPassword, tlTeamSize);
                          if (newTl) setNewTeamLeader(newTl);
                          setTlOfficeId(''); setTlTeamName(''); setTlLeaderName(''); setTlLeaderPassword(''); setTlTeamSize('');
                          setExpandedTeams(prev => { const s = new Set(prev); s.delete('__create'); return s; });
                        }}>✓ Create</button>
                      </div>
                    </div>
                    {newTeamLeader && (
                      <div className="aax-credentials-output-container" style={{ marginTop: 14 }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: 13 }}>Created: {newTeamLeader.name}</h4>
                        <div className="aax-credential-item"><span>Login Link</span><code>{newTeamLeader.loginLink}</code><button className="aax-link-copy-btn" onClick={() => copyToClipboard(newTeamLeader.loginLink)}>[list] Copy</button></div>
                        <div className="aax-credential-item"><span>Password</span><code>{newTeamLeader.password}</code><button className="aax-link-copy-btn" onClick={() => copyToClipboard(newTeamLeader.password)}>[list] Copy</button></div>
                      </div>
                    )}
                  </div>
                )}
                <div className="aax-super-admin-card">
                  <div style={{ marginBottom: 12 }}>
                    <input
                      className="aax-super-admin-input"
                      style={{ width: '100%', maxWidth: 340 }}
                      placeholder="[search]  Search teams, offices, or leaders..."
                      value={teamSearch}
                      onChange={e => setTeamSearch(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="aax-super-admin-table-wrapper">
                    <table className="aax-super-admin-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Team</th>
                          <th>Office</th>
                          <th>Leader</th>
                          <th style={{ textAlign: 'center' }}>Agents</th>
                          <th style={{ textAlign: 'center' }}>Leads</th>
                          <th style={{ textAlign: 'center' }}>Deposits</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.teams.filter(team => {
                          if (!teamSearch.trim()) return true;
                          const q = teamSearch.toLowerCase();
                          const leader = data.users.find(u => u.role === ROLE.TEAM_LEADER && u.teamId === team.id);
                          const office = data.offices.find(o => o.id === team.officeId);
                          return (
                            team.name.toLowerCase().includes(q) ||
                            (leader && leader.name.toLowerCase().includes(q)) ||
                            (office && office.name.toLowerCase().includes(q))
                          );
                        }).map(team => {
                          const teamLeader = data.users.find(u => u.role === ROLE.TEAM_LEADER && u.teamId === team.id);
                          const teamAgents = data.users.filter(u => u.role === ROLE.AGENT && u.teamId === team.id);
                          const teamLeads = data.leads.filter(l => l.assignedToTeam === team.id);
                          const teamDeposits = teamLeads.filter(l => l.stage === 'Deposit').length;
                          const office = data.offices.find(o => o.id === team.officeId);
                          return (
                            <tr key={team.id} style={{ cursor: 'pointer' }} onClick={() => setInfoModal({ type: 'team', id: team.id })}>
                              <td style={{ whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#848E9C' }}>{team.id ? team.id.slice(0, 6) : '-'}</span>
                                  {team.id && <button title={team.id} onClick={() => navigator.clipboard.writeText(team.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#848E9C', padding: '2px 4px', lineHeight: 1, borderRadius: 3 }} onMouseEnter={e => e.currentTarget.style.color = '#F0B90B'} onMouseLeave={e => e.currentTarget.style.color = '#848E9C'}><i className="fas fa-copy" style={{ fontSize: 10 }}></i></button>}
                                </div>
                              </td>
                              <td style={{ fontWeight: 600 }}>{team.name}</td>
                              <td style={{ color: '#848E9C' }}>{office ? office.name : '-'}</td>
                              <td>
                                {teamLeader ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className={'status-indicator ' + (teamLeader.isLoggedIn ? 'aax-online' : 'aax-offline')}></span>
                                    {teamLeader.name}
                                  </div>
                                ) : <span style={{ color: '#848E9C', fontSize: 12 }}>Unassigned</span>}
                              </td>
                              <td style={{ textAlign: 'center' }}>{teamAgents.length}</td>
                              <td style={{ textAlign: 'center' }}>{teamLeads.length}</td>
                              <td style={{ textAlign: 'center', color: '#45d2a0', fontWeight: 600 }}>{teamDeposits}</td>
                              <td>
                                {teamLeader ? (
                                  <span className={'aax-badge ' + (staffBlockedStatus[teamLeader.id] ? 'aax-badge-danger' : 'aax-badge-success')}>{staffBlockedStatus[teamLeader.id] ? 'Blocked' : 'Active'}</span>
                                ) : <span className="aax-badge aax-badge-warning">No Leader</span>}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                                  {teamLeader && (
                                    <button className="aax-staff-action-btn btn-impersonate" onClick={() => navigate('/admin/team-leader/' + teamLeader.id)} title="View panel">View View Panel</button>
                                  )}
                                  <button className="aax-staff-action-btn btn-edit-name" onClick={() => setEditingTeam({ ...team, _ldr: teamLeader })} title="Edit team"> Edit</button>
                                  <button className="aax-staff-action-btn" style={{ background: 'rgba(246,70,93,0.15)', color: '#F6465D', border: '1px solid #F6465D40' }} onClick={() => softDeleteTeam(team)} title="Move team to bin">🗑 Delete</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : activeTab === 'Agents' ? (
              <div style={{ padding: 24 }}>
                <div className="aax-super-admin-card">
                  <h2>[user] Agents Management</h2>
                  <p style={{ color: '#848E9C', fontSize: 13, marginBottom: 20 }}>
                    Manage agents, assign to teams, and oversee agent performance.
                  </p>
                  
                  {/* Create Agent Form */}
                  <div className="aax-super-admin-card" style={{ marginBottom: 24, background: 'rgba(52,152,219,0.1)' }}>
                    <h3>[user] Create Agent</h3>
                    <div className="aax-super-admin-form-row">
                      <div className="aax-super-admin-form-group">
                        <label>Select Team</label>
                        <select 
                          className="aax-super-admin-select" 
                          value={agTeamId} 
                          onChange={(e) => setAgTeamId(e.target.value)}
                        >
                          <option value="">Choose a team...</option>
                          {data.teams.map((team) => <option key={team.id} value={team.id}>{team.name} ({getOfficeName(team.officeId, data.offices)})</option>)}
                        </select>
                      </div>
                      <div className="aax-super-admin-form-group">
                        <label>Agent Name</label>
                        <input 
                          className="aax-super-admin-input" 
                          autoComplete="off" 
                          placeholder="Enter agent name..." 
                          value={agAgentName} 
                          onChange={(e) => setAgAgentName(e.target.value)} 
                        />
                      </div>
                      <div className="aax-super-admin-form-group">
                        <label>Agent Password</label>
                        <input 
                          className="aax-super-admin-input"
                          autoComplete="new-password" 
                          placeholder="Enter password..." 
                          value={agAgentPassword} 
                          onChange={(e) => setAgAgentPassword(e.target.value)} 
                          type="password" 
                        />
                      </div>
                      <div className="aax-super-admin-form-group">
                        <button 
                          className="aax-super-admin-btn aax-super-admin-btn-small" 
                          disabled={!agTeamId || !agAgentName || !agAgentPassword} 
                          onClick={async () => {
                            const newAg = await createAgent(agTeamId, agAgentName, agAgentPassword);
                            if (newAg) setNewAgent(newAg);
                            setAgTeamId(''); setAgAgentName(''); setAgAgentPassword('');
                          }}
                        >
                          ✓ Create
                        </button>
                      </div>
                    </div>
                    {newAgent && (
                      <div className="aax-credentials-output-container">
                        <h4>New Agent Created</h4>
                        <div className="aax-credential-item">
                          <span>Name:</span>
                          <code>{newAgent.name}</code>
                        </div>
                        <div className="aax-credential-item">
                          <span>Login Link:</span>
                          <code>{newAgent.loginLink}</code>
                          <button 
                            className="aax-link-copy-btn" 
                            onClick={() => copyToClipboard(newAgent.loginLink)} 
                            title="Copy login link"
                          >
                            [list] Copy Link
                          </button>
                        </div>
                        <div className="aax-credential-item">
                          <span>Password:</span>
                          <code>{newAgent.password}</code>
                          <button 
                            className="aax-link-copy-btn" 
                            onClick={() => copyToClipboard(newAgent.password)} 
                            title="Copy password"
                          >
                            [list] Copy Password
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Agents Table */}
                  <div style={{ marginBottom: 12 }}>
                    <input
                      className="aax-super-admin-input"
                      style={{ width: '100%', maxWidth: 340 }}
                      placeholder="[search]  Search agents, teams, or offices..."
                      value={agentSearch}
                      onChange={e => setAgentSearch(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="aax-super-admin-table-wrapper">
                    <table className="aax-super-admin-table">
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Agent Name</th>
                          <th>Team</th>
                          <th>Office</th>
                          <th>Leads</th>
                          <th>Deposits</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.users.filter(u => {
                          if (u.role !== ROLE.AGENT) return false;
                          if (!agentSearch.trim()) return true;
                          const q = agentSearch.toLowerCase();
                          const team = data.teams.find(t => t.id === u.teamId);
                          const office = data.offices.find(o => o.id === u.officeId);
                          return (
                            u.name.toLowerCase().includes(q) ||
                            (team && team.name.toLowerCase().includes(q)) ||
                            (office && office.name.toLowerCase().includes(q))
                          );
                        }).map((agent) => {
                          const agentTeam = data.teams.find(t => t.id === agent.teamId);
                          const agentOffice = data.offices.find(o => o.id === agent.officeId);
                          const agentLeads = data.leads.filter(l => l.assignedToAgent === agent.id);
                          const agentDeposits = agentLeads.filter(l => l.stage === 'Deposit').length;
                          
                          return (
                            <tr key={agent.id}>
                              <td style={{ whiteSpace: 'nowrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#848E9C' }}>{agent.id ? agent.id.slice(0, 6) : '-'}</span>
                                  {agent.id && <button title={agent.id} onClick={() => navigator.clipboard.writeText(agent.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#848E9C', padding: '2px 4px', lineHeight: 1, borderRadius: 3 }} onMouseEnter={e => e.currentTarget.style.color = '#F0B90B'} onMouseLeave={e => e.currentTarget.style.color = '#848E9C'}><i className="fas fa-copy" style={{ fontSize: 10 }}></i></button>}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span className={`status-indicator ${agent.isLoggedIn ? 'aax-online' : 'aax-offline'}`}></span>
                                  {agent.name}
                                </div>
                              </td>
                              <td>{agentTeam?.name || 'Unassigned'}</td>
                              <td>{agentOffice?.name || 'Unknown'}</td>
                              <td>{agentLeads.length}</td>
                              <td>{agentDeposits}</td>
                              <td>
                                <span className={`aax-badge ${staffBlockedStatus[agent.id] ? 'aax-badge-danger' : 'aax-badge-success'}`}>
                                  {staffBlockedStatus[agent.id] ? 'Blocked' : 'Active'}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  <button
                                    className="aax-staff-action-btn btn-impersonate"
                                    onClick={() => navigate(`/admin/agent/${agent.id}`)}
                                    title="View agent panel"
                                  >View View</button>
                                  <button
                                    className="aax-staff-action-btn btn-edit-name"
                                    onClick={() => setEditingAgent(agent)}
                                    title="Edit agent"
                                  > Edit</button>
                                  <button
                                    className="aax-staff-action-btn"
                                    style={{ background: 'rgba(246,70,93,0.15)', color: '#F6465D', border: '1px solid #F6465D40' }}
                                    onClick={() => softDeleteAgent(agent)}
                                    title="Move agent to bin"
                                  >🗑 Delete</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : activeTab === 'Staff' ? (
                <div style={{ padding: 24 }}>
                  <div className="aax-super-admin-card" style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <h2 style={{ margin: '0 0 4px 0' }}>[users] All Staff</h2>
                        <p style={{ margin: 0, color: '#848E9C', fontSize: 13 }}>
                          {staffRows.length} staff member{staffRows.length !== 1 ? 's' : ''} - managers, team leaders, and agents across all offices
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="aax-super-admin-card">
                    {/* Search + Role filter bar */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input
                        className="aax-super-admin-input"
                        style={{ flex: '1 1 260px', minWidth: 200 }}
                        placeholder="[search]  Search by name, email, office, or team..."
                        value={staffSearch}
                        onChange={e => setStaffSearch(e.target.value)}
                        autoComplete="off"
                      />
                      <select
                        className="aax-super-admin-select"
                        style={{ flex: '0 0 180px' }}
                        value={staffRoleFilter}
                        onChange={e => setStaffRoleFilter(e.target.value)}
                      >
                        <option value="">All roles</option>
                        <option value={ROLE.OFFICE_MANAGER}>Office Managers</option>
                        <option value={ROLE.TEAM_LEADER}>Team Leaders</option>
                        <option value={ROLE.AGENT}>Agents</option>
                      </select>
                      {(staffSearch || staffRoleFilter) && (
                        <button
                          className="aax-super-admin-btn aax-super-admin-btn-small"
                          style={{ background: '#444A55', color: '#EAECEF' }}
                          onClick={() => { setStaffSearch(''); setStaffRoleFilter(''); }}
                        >✕ Clear</button>
                      )}
                    </div>

                    <div className="aax-super-admin-table-wrapper">
                      <table className="aax-super-admin-table">
                        <thead>
                          <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Role</th>
                            <th>Office</th>
                            <th>Team</th>
                            <th>Leads</th>
                            <th>Status</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {staffRows.length === 0 ? (
                            <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#848E9C' }}>No staff members match your search.</td></tr>
                          ) : staffRows.map(u => {
                            const office = data.offices.find(o => o.id === u.officeId);
                            const team = data.teams.find(t => t.id === u.teamId);
                            const leads = u.role === ROLE.AGENT ? data.leads.filter(l => l.assignedToAgent === u.id).length : '-';
                            const isBlocked = staffBlockedStatus[u.id];
                            const navPath =
                              u.role === ROLE.OFFICE_MANAGER ? `/admin/office-manager/${u.id}` :
                              u.role === ROLE.TEAM_LEADER    ? `/admin/team-leader/${u.id}` :
                              `/admin/agent/${u.id}`;
                            return (
                              <tr key={u.id}>
                                <td style={{ whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#848E9C' }}>{u.id ? u.id.slice(0, 6) : '-'}</span>
                                    {u.id && <button title={u.id} onClick={() => navigator.clipboard.writeText(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#848E9C', padding: '2px 4px', lineHeight: 1, borderRadius: 3 }} onMouseEnter={e => e.currentTarget.style.color = '#F0B90B'} onMouseLeave={e => e.currentTarget.style.color = '#848E9C'}><i className="fas fa-copy" style={{ fontSize: 10 }}></i></button>}
                                  </div>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className={`status-indicator ${u.isLoggedIn ? 'aax-online' : 'aax-offline'}`} />
                                    <span style={{ fontWeight: 600 }}>{u.name}</span>
                                  </div>
                                  {u.email && <div style={{ fontSize: 11, color: '#848E9C', marginTop: 2 }}>{u.email}</div>}
                                </td>
                                <td>
                                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 4, ...staffRoleBadgeStyle[u.role] }}>
                                    {staffRoleLabel[u.role] || u.role}
                                  </span>
                                </td>
                                <td style={{ color: office ? '#EAECEF' : '#848E9C', fontSize: 12 }}>{office ? office.name : '-'}</td>
                                <td style={{ color: team ? '#EAECEF' : '#848E9C', fontSize: 12 }}>{team ? team.name : '-'}</td>
                                <td style={{ textAlign: 'center', color: '#848E9C' }}>{leads}</td>
                                <td>
                                  <span className={`aax-badge ${isBlocked ? 'aax-badge-danger' : 'aax-badge-success'}`}>
                                    {isBlocked ? 'Blocked' : 'Active'}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    <button
                                      className="aax-staff-action-btn"
                                      style={{ background: 'rgba(240,185,11,0.15)', color: '#F0B90B', border: '1px solid #F0B90B40' }}
                                      onClick={() => {
                                        const link = u.loginLink || makeLoginLink(u.id, u.role);
                                        copyToClipboard(link);
                                      }}
                                      title="Copy login link to clipboard"
                                    >[refresh] Copy Link</button>
                                    <button
                                      className={`aax-staff-action-btn ${isBlocked ? 'btn-unblock' : 'btn-block'}`}
                                      onClick={() => blockUnblockStaff(u.id)}
                                      title={isBlocked ? 'Unblock' : 'Block'}
                                    >{isBlocked ? '🔓 Unblock' : '🔒 Block'}</button>
                                    <button
                                      className="aax-staff-action-btn btn-edit-name"
                                      onClick={() => { setEditingStaffId(u.id); setEditModalType('name'); setEditingValue(u.name); setStaffMemberName(u.name); setEditModalTitle(`Edit Name - ${u.name}`); setIsEditModalOpen(true); }}
                                      title="Edit name"
                                    > Rename</button>
                                    <button
                                      className="aax-staff-action-btn btn-edit-password"
                                      onClick={() => { setEditingStaffId(u.id); setEditModalType('password'); setEditingValue(''); setStaffMemberName(u.name); setEditModalTitle(`Change Password - ${u.name}`); setIsEditModalOpen(true); }}
                                      title="Change password"
                                    >[security] Password</button>
                                    <button
                                      className="aax-staff-action-btn btn-impersonate"
                                      onClick={() => navigate(navPath)}
                                      title="View panel"
                                    >View View</button>
                                    <button
                                      className="aax-staff-action-btn"
                                      style={{ background: 'rgba(246,70,93,0.15)', color: '#F6465D', border: '1px solid #F6465D40' }}
                                      onClick={() => softDeleteAgent(u)}
                                      title="Delete staff member"
                                    >🗑 Delete</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
            ) : activeTab === 'Dashboard' ? (
              <Dashboard offices={data.offices} teams={data.teams} staffUsers={data.users} />
            ) : activeTab === 'Settings' ? (
              <Settings />
            ) : activeTab === 'Audit Log' ? (
              <AuditLog />
            ) : activeTab === 'Recycle Bin' ? (
              <RecycleBin data={data} setData={setData} showNotification={showNotification} />
            ) : activeTab === 'Agent Access' ? (
              <AgentAccess showNotification={showNotification} />
            ) : null}
            <NotificationToast ref={notificationRef} />
          </div>
        </div>

        {/* Office / Team info modal */}
        {infoModal && (() => {
          const isOffice = infoModal.type === 'office';
          const office = isOffice ? data.offices.find(o => o.id === infoModal.id) : null;
          const team = !isOffice ? data.teams.find(t => t.id === infoModal.id) : null;
          if (!office && !team) return null;
          const officeForTeam = team ? data.offices.find(o => o.id === team.officeId) : null;
          const manager = isOffice ? data.users.find(u => u.role === ROLE.OFFICE_MANAGER && u.officeId === office.id) : null;
          const leader = team ? data.users.find(u => u.role === ROLE.TEAM_LEADER && u.teamId === team.id) : null;
          const teamsList = isOffice ? data.teams.filter(t => t.officeId === office.id) : [];
          const agentsList = isOffice
            ? data.users.filter(u => u.role === ROLE.AGENT && u.officeId === office.id)
            : data.users.filter(u => u.role === ROLE.AGENT && u.teamId === team.id);
          const leadsList = isOffice
            ? data.leads.filter(l => l.assignedToOffice === office.id)
            : data.leads.filter(l => l.assignedToTeam === team.id);
          const deposits = leadsList.filter(l => l.stage === 'Deposit').length;
          const title = isOffice ? `[office] ${office.name}` : `[users] ${team.name}`;
          const head = isOffice ? 'Office Details' : `Team Details - ${officeForTeam?.name || ''}`;
          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2000, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px' }} onClick={() => setInfoModal(null)}>
              <div style={{ background: '#363B44', border: '1px solid #444A55', borderRadius: 12, width: '100%', maxWidth: 760, padding: 24 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: 0, color: '#EAECEF', fontSize: 20 }}>{title}</h2>
                    <div style={{ fontSize: 12, color: '#848E9C', marginTop: 4 }}>{head}</div>
                  </div>
                  <button onClick={() => setInfoModal(null)} style={{ background: 'none', border: '1px solid #444A55', color: '#848E9C', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 18 }}>
                  {[
                    isOffice && { label: 'Teams', value: teamsList.length, color: '#0A84FF' },
                    { label: 'Agents', value: agentsList.length, color: '#F0B90B' },
                    { label: 'Leads', value: leadsList.length, color: '#EAECEF' },
                    { label: 'Deposits', value: deposits, color: '#0ECB81' },
                  ].filter(Boolean).map(s => (
                    <div key={s.label} style={{ background: '#363B44', border: '1px solid #444A55', borderRadius: 6, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#848E9C', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background: '#363B44', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>{isOffice ? 'Office Manager' : 'Team Leader'}</div>
                  {(manager || leader) ? (
                    <div style={{ fontSize: 13, color: '#EAECEF', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div><strong>Name:</strong> {(manager || leader).name}</div>
                      <div><strong>Status:</strong> {staffBlockedStatus[(manager || leader).id] ? 'Blocked' : 'Active'}  /  {(manager || leader).isLoggedIn ? 'Online' : 'Offline'}</div>
                      <div style={{ fontSize: 12, color: '#848E9C' }}><strong>ID:</strong> {(manager || leader).id}</div>
                    </div>
                  ) : <div style={{ color: '#848E9C', fontSize: 13 }}>No {isOffice ? 'manager' : 'leader'} assigned.</div>}
                </div>

                {isOffice && teamsList.length > 0 && (
                  <div style={{ background: '#363B44', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Teams ({teamsList.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                      {teamsList.map(t => {
                        const tl = data.users.find(u => u.role === ROLE.TEAM_LEADER && u.teamId === t.id);
                        const tAgents = data.users.filter(u => u.role === ROLE.AGENT && u.teamId === t.id).length;
                        const tLeads = data.leads.filter(l => l.assignedToTeam === t.id).length;
                        return (
                          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#EAECEF', padding: '6px 8px', background: '#2A2E36', borderRadius: 4 }}>
                            <span>{t.name} {tl && <span style={{ color: '#848E9C' }}> /  {tl.name}</span>}</span>
                            <span style={{ color: '#848E9C' }}>{tAgents} agents  /  {tLeads} leads</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {agentsList.length > 0 && (
                  <div style={{ background: '#363B44', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: '#848E9C', fontWeight: 600, textTransform: 'uppercase', marginBottom: 10 }}>Agents ({agentsList.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                      {agentsList.map(a => {
                        const aLeads = data.leads.filter(l => l.assignedToAgent === a.id).length;
                        return (
                          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#EAECEF', padding: '6px 8px', background: '#2A2E36', borderRadius: 4 }}>
                            <span>{a.name} <span style={{ color: '#848E9C' }}> /  {getTeamName(a.teamId, data.teams)}</span></span>
                            <span style={{ color: a.isLoggedIn ? '#0ECB81' : '#848E9C' }}>{a.isLoggedIn ? 'Online' : 'Offline'}  /  {aLeads} leads</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  {isOffice && manager && (
                    <button className="aax-super-admin-btn aax-super-admin-btn-small" onClick={() => { navigate('/admin/office-manager/' + manager.id); setInfoModal(null); }}>View Open Manager Panel</button>
                  )}
                  {!isOffice && leader && (
                    <button className="aax-super-admin-btn aax-super-admin-btn-small" onClick={() => { navigate('/admin/team-leader/' + leader.id); setInfoModal(null); }}>View Open Team Leader Panel</button>
                  )}
                  <button className="aax-super-admin-btn aax-super-admin-btn-small aax-super-admin-btn-secondary" onClick={() => setInfoModal(null)}>Close</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Edit staff name / password modal */}
        {isEditModalOpen && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 2100, overflowY: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px' }}
            onClick={closeEditModal}
          >
            <div
              style={{ background: '#363B44', border: '1px solid #444A55', borderRadius: 12, width: '100%', maxWidth: 440, padding: 24 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ margin: 0, color: '#EAECEF', fontSize: 18 }}>{editModalTitle}</h2>
                <button
                  onClick={closeEditModal}
                  style={{ background: 'none', border: '1px solid #444A55', color: '#848E9C', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                >✕</button>
              </div>
              {editModalType === 'password' ? (
                <div className="aax-pw-field">
                  <div className="aax-pw-field-head">
                    <label className="aax-pw-field-label" htmlFor="aax-pw-edit-input">
                      Account password
                    </label>
                    <button
                      type="button"
                      className="aax-pw-generate"
                      onClick={generateStrongPassword}
                      title="Generate a strong password"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="23 4 23 10 17 10" />
                        <polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                      Generate
                    </button>
                  </div>
                  <div className="aax-pw-input-wrap">
                    <input
                      id="aax-pw-edit-input"
                      className="aax-pw-input"
                      autoFocus
                      type={editPasswordShown ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Enter a strong password"
                      value={editingValue}
                      onChange={e => setEditingValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveStaffEdit(); if (e.key === 'Escape') closeEditModal(); }}
                    />
                    <button
                      type="button"
                      className="aax-pw-toggle"
                      onClick={() => setEditPasswordShown(v => !v)}
                      title={editPasswordShown ? 'Hide password' : 'Show password'}
                      aria-label={editPasswordShown ? 'Hide password' : 'Show password'}
                    >
                      {editPasswordShown ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.77 19.77 0 0 1 4.22-5.22" />
                          <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a19.86 19.86 0 0 1-3.17 4.19" />
                          <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="aax-pw-meta">
                    <div className="aax-pw-strength" data-level={passwordStrength(editingValue).level}>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <span
                          key={i}
                          className={'aax-pw-bar' + (i < passwordStrength(editingValue).level ? ' is-on' : '')}
                        />
                      ))}
                    </div>
                    <span className="aax-pw-hint">
                      {editingValue
                        ? `${passwordStrength(editingValue).label}  /  ${editingValue.length} chars`
                        : 'Use 12+ chars with letters, numbers, and a symbol'}
                    </span>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 6 }}>
                    New Name
                  </label>
                  <input
                    className="aax-super-admin-input"
                    autoFocus
                    type="text"
                    autoComplete="off"
                    placeholder="Enter new name..."
                    value={editingValue}
                    onChange={e => setEditingValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveStaffEdit(); if (e.key === 'Escape') closeEditModal(); }}
                    style={{ width: '100%' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  className="aax-super-admin-btn aax-super-admin-btn-small aax-super-admin-btn-secondary"
                  onClick={closeEditModal}
                >Cancel</button>
                <button
                  className="aax-super-admin-btn aax-super-admin-btn-small"
                  disabled={!editingValue.trim()}
                  onClick={saveStaffEdit}
                >✓ Save</button>
              </div>
            </div>
          </div>
        )}
      </DataContext.Provider>
    </NotificationContext.Provider>
  );
}

export default SuperAdminPanel;
