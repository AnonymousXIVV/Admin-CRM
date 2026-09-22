import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { DataContext, NotificationContext } from '../../App';
import {
  issueCard,
  adminFreezeCard,
  adminBlockCard,
  adminUnblockCard,
  adminRevokeCard,
  adminSetCardPin,
  adminSetCardLimits,
  adminGetCardPinInfo,
  adminUpdateCardDetails,
  adminListCardAudit,
  adminDeleteCardAuditEntries,
  adminClearCardAudit,
  searchAdminLeads,
} from '../../adminApi';
import Modal from '../Modal/Modal';
import { useConfirmDialog } from '../ConfirmModal/ConfirmModal';
import CardRequests from './CardRequests';
import { SearchAutocomplete } from '../UserChrome';

const CARD_TYPES = ['Platinum', 'Gold', 'Premium'];

const last4FromId = (id) => {
  const s = String(id || '');
  if (!s) return '????';
  const tail = s.slice(-6).replace(/[^a-zA-Z0-9]/g, '');
  return (tail || '0000').slice(-4).padStart(4, '0').toUpperCase();
};

const cardLabel = (card) => `**** ${last4FromId(card?.id)}`;

const cardStatusOf = (card) => {
  if (card?.isBlocked || card?.status === 'Blocked') return 'Blocked';
  if (card?.isFrozen  || card?.status === 'Frozen')  return 'Frozen';
  return 'Active';
};

const CardManagement = () => {
  const { users, cardData, setCardData, logAdminAction } = useContext(DataContext);
  const showNotification = useContext(NotificationContext);
  const [confirmDialog, confirm] = useConfirmDialog();

  const [assignSearch, setAssignSearch] = useState('');
  const [remoteAssignUsers, setRemoteAssignUsers] = useState([]);
  const [selectedAssignUser, setSelectedAssignUser] = useState(null);
  const [cardType, setCardType] = useState('Platinum');
  const [cardPin, setCardPin] = useState('');
  const [issuing, setIssuing] = useState(false);

  const [manageSearch, setManageSearch] = useState('');
  const [manageTypeFilter, setManageTypeFilter] = useState('all');
  const [manageStatusFilter, setManageStatusFilter] = useState('all');
  const [manageClientFilter, setManageClientFilter] = useState('all');

  const [isSetPinModalOpen, setIsSetPinModalOpen] = useState(false);
  const [isSetCardLimitsModalOpen, setIsSetCardLimitsModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedCardForModal, setSelectedCardForModal] = useState(null);
  const [selectedCardForBlock, setSelectedCardForBlock] = useState(null);
  const [selectedCardForRevoke, setSelectedCardForRevoke] = useState(null);
  const [selectedCardForDetails, setSelectedCardForDetails] = useState(null);

  const [cardTab, setCardTab] = useState('requests');

  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState('all');
  const [auditOpen, setAuditOpen] = useState(true);

  const [selectedCardIds, setSelectedCardIds] = useState(() => new Set());
  const [selectedAuditIds, setSelectedAuditIds] = useState(() => new Set());
  const [bulkRevoking, setBulkRevoking] = useState(false);
  const [bulkDeletingCards, setBulkDeletingCards] = useState(false);
  const [bulkDeletingAudit, setBulkDeletingAudit] = useState(false);

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError('');
    try {
      const res = await adminListCardAudit({
        userId: auditUserFilter === 'all' ? '' : auditUserFilter,
        limit:  200,
      });
      setAuditEntries(Array.isArray(res?.entries) ? res.entries : []);
    } catch (err) {
      setAuditError(err?.message || 'Could not load activity log.');
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  }, [auditUserFilter]);

  useEffect(() => { if (auditOpen) loadAudit(); }, [auditOpen, loadAudit]);

  useEffect(() => { setSelectedCardIds(new Set()); }, [manageSearch, manageTypeFilter, manageStatusFilter, manageClientFilter]);
  useEffect(() => { setSelectedAuditIds(new Set()); }, [auditUserFilter]);

  const searchUsers = useCallback((query) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.id?.toLowerCase().includes(q) ||
      u.phone?.toLowerCase().includes(q)
    );
  }, [users]);

  const assignSearchResults = searchUsers(assignSearch);
  useEffect(() => {
    const query = assignSearch.trim();
    if (query.length < 1) {
      setRemoteAssignUsers([]);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(() => {
      searchAdminLeads(query, { limit: 20 })
        .then(suggestions => {
          if (!active) return;
          setRemoteAssignUsers(suggestions.map(s => s.lead).filter(Boolean));
        })
        .catch(() => { if (active) setRemoteAssignUsers([]); });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [assignSearch]);
  const mergedAssignSearchResults = useMemo(() => {
    const merged = [...remoteAssignUsers, ...assignSearchResults];
    return merged.filter((user, index, rows) =>
      rows.findIndex(item => item.id === user.id) === index
    ).slice(0, 20);
  }, [remoteAssignUsers, assignSearchResults]);
  const manageSearchSuggestions = useCallback((query) => (
    searchUsers(query).map(user => ({
      key: user.id,
      value: user.name || user.email || user.id,
      label: user.name || user.email || user.id,
      meta: user.email || user.phone || '',
    }))
  ), [searchUsers]);
  const showAssignResults = assignSearch.trim().length > 0
    && (!selectedAssignUser || assignSearch !== selectedAssignUser.name);

  const selectedUserHasCard = selectedAssignUser
    ? cardData.some(c => c.userId === selectedAssignUser.id)
    : false;

  const handleAssignUserSelect = (user) => {
    setSelectedAssignUser(user);
    setAssignSearch(user.name);
  };

  const surfaceErr = (err, fallback) => {
    showNotification(err?.message || fallback, 'error');
  };

  const applyServerStatusToLocal = (cardId, serverStatus) => {
    setCardData(prev => prev.map(c => c.id === cardId
      ? {
          ...c,
          status:    serverStatus,
          isFrozen:  serverStatus === 'Frozen',
          isBlocked: serverStatus === 'Blocked',
        }
      : c));
  };

  const handleIssueCard = async (e) => {
    e.preventDefault();
    if (!selectedAssignUser) {
      showNotification('Please select a client first.', 'error');
      return;
    }
    if (selectedUserHasCard) {
      showNotification('This client already has a card. Revoke it before issuing a new one.', 'error');
      return;
    }
    if (!/^\d{4,6}$/.test(cardPin)) {
      showNotification('PIN must be 4 to 6 digits.', 'error');
      return;
    }

    setIssuing(true);
    try {
      const result = await issueCard(selectedAssignUser.id, { type: cardType, pin: cardPin });
      const issued = result?.card;
      if (issued) {
        const newCard = {
          id:             issued.id,
          userId:         selectedAssignUser.id,
          cardholderName: selectedAssignUser.name,
          type:           (issued.type || cardType).toLowerCase(),
          status:         issued.status || 'Active',
          isBlocked:      false,
          isFrozen:       false,
          balance:        0,
          expiry:         '**/**',
          expiryMonth:    null,
          expiryYear:     null,
          cardNumber:     '****************',
          cvv:            '***',
          panSet:         false,
          cvvSet:         false,
          expirySet:      false,
          limits:         issued.limits || null,
          has_pin:        true,
          issuedAt:       issued.issued_at,
        };
        setCardData(prev => [...prev, newCard]);
        logAdminAction('Admin', 'Issue Card', `Issued ${cardType} card to ${selectedAssignUser.name}`);
        showNotification(`${cardType} card issued to ${selectedAssignUser.name}.`, 'success');
        setSelectedAssignUser(null);
        setAssignSearch('');
        setCardType('Platinum');
        setCardPin('');
      }
    } catch (err) {
      surfaceErr(err, 'Card could not be issued.');
    } finally {
      setIssuing(false);
    }
  };

  const filteredManagedCards = cardData.filter(card => {
    const user = users.find(u => u.id === card.userId);
    const haystack = `${user?.name || ''} ${user?.email || ''} ${user?.id || ''} ${user?.phone || ''} ${last4FromId(card.id)}`.toLowerCase();
    if (manageSearch && !haystack.includes(manageSearch.toLowerCase())) return false;
    if (manageTypeFilter !== 'all' && card.type !== manageTypeFilter) return false;
    if (manageClientFilter !== 'all' && card.userId !== manageClientFilter) return false;
    if (manageStatusFilter !== 'all' && cardStatusOf(card).toLowerCase() !== manageStatusFilter) return false;
    return true;
  });

  const clientsWithCards = Array.from(new Set(cardData.map(c => c.userId)))
    .map(uid => users.find(u => u.id === uid))
    .filter(Boolean)
    .map(u => ({ id: u.id, name: u.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const cardTypeSummary = cardData.reduce((acc, card) => {
    if (!card.type) return acc;
    if (!acc[card.type]) acc[card.type] = { count: 0, clients: new Set() };
    acc[card.type].count++;
    if (card.userId) acc[card.type].clients.add(card.userId);
    return acc;
  }, {});
  const cardTypeSummaryArray = Object.entries(cardTypeSummary).map(([type, d]) => ({
    type, count: d.count, uniqueClients: d.clients.size,
  }));

  const handleManageCardAction = async (cardId, action) => {
    const card = cardData.find(c => c.id === cardId);
    if (!card) return;
    setSelectedCardForModal(card);

    switch (action) {
      case 'set-pin':
        setIsSetPinModalOpen(true);
        return;

      case 'limits':
        setIsSetCardLimitsModalOpen(true);
        return;

      case 'freeze':
      case 'unfreeze': {
        if (!card.userId) { surfaceErr(null, 'Card has no owner - cannot freeze.'); return; }
        try {
          const res = await adminFreezeCard(card.userId);
          applyServerStatusToLocal(cardId, res.status);
          logAdminAction('Admin', res.status === 'Frozen' ? 'Freeze Card' : 'Unfreeze Card', `Card ${cardLabel(card)}`);
          showNotification(`Card ${res.status.toLowerCase()}.`, 'success');
        } catch (err) {
          surfaceErr(err, 'Could not change freeze state.');
        }
        return;
      }

      case 'block': {
        if (!card.userId) { surfaceErr(null, 'Card has no owner - cannot block.'); return; }
        setSelectedCardForBlock(card);
        setIsBlockModalOpen(true);
        return;
      }

      case 'unblock': {
        if (!card.userId) { surfaceErr(null, 'Card has no owner - cannot unblock.'); return; }
        try {
          await adminUnblockCard(card.userId);
          applyServerStatusToLocal(cardId, 'Active');
          logAdminAction('Admin', 'Unblock Card', `Card ${cardLabel(card)}`);
          showNotification('Card unblocked.', 'success');
        } catch (err) {
          surfaceErr(err, 'Could not unblock card.');
        }
        return;
      }

      case 'revoke': {
        if (!card.userId) { surfaceErr(null, 'Card has no owner - cannot revoke.'); return; }
        const ownerName = card.cardholderName || 'this client';
        const ok = await confirm({
          title: 'Revoke this card?',
          message: `Are you sure you want to revoke the ${card.type || ''} card ${cardLabel(card)} belonging to ${ownerName}? This will permanently delete the card and the client will lose access immediately. This action cannot be undone.`,
          confirmLabel: 'Yes, continue',
          cancelLabel: 'Cancel',
          tone: 'danger',
        });
        if (!ok) return;
        setSelectedCardForRevoke(card);
        setIsRevokeModalOpen(true);
        return;
      }

      case 'pin-info': {
        if (!card.userId) { surfaceErr(null, 'Card has no owner.'); return; }
        try {
          const info = await adminGetCardPinInfo(card.userId);
          setCardData(prev => prev.map(c => c.id === cardId ? { ...c, has_pin: !!info?.has_pin } : c));
          const msg = info?.has_pin
            ? `A PIN is set for ${cardLabel(card)}. PINs are stored hashed and cannot be revealed - use "Set PIN" to reset it.`
            : `No PIN is set for ${cardLabel(card)}. Use "Set PIN" to create one.`;
          showNotification(msg, 'info');
        } catch (err) {
          surfaceErr(err, 'Could not check PIN status.');
        }
        return;
      }

      case 'details': {
        setSelectedCardForDetails(card);
        setIsDetailsModalOpen(true);
        return;
      }

      default:
        return;
    }
  };

  const handleSetPinSubmit = async (cardId, newPin) => {
    const card = cardData.find(c => c.id === cardId);
    if (!card?.userId) { surfaceErr(null, 'Card has no owner.'); return; }
    try {
      await adminSetCardPin(card.userId, newPin);
      setCardData(prev => prev.map(c => c.id === cardId ? { ...c, has_pin: true } : c));
      logAdminAction('Admin', 'Set Card PIN', `Set PIN for card ${cardLabel(card)}`);
      showNotification('Card PIN updated.', 'success');
      setIsSetPinModalOpen(false);
    } catch (err) {
      surfaceErr(err, 'Could not update PIN.');
    }
  };

  const handleSetCardLimitsSubmit = async (cardId, limits) => {
    const card = cardData.find(c => c.id === cardId);
    if (!card?.userId) { surfaceErr(null, 'Card has no owner.'); return; }
    try {
      const res = await adminSetCardLimits(card.userId, limits);
      const mergedLimits = (res && typeof res === 'object' && res.limits && typeof res.limits === 'object')
        ? res.limits
        : limits;
      setCardData(prev => prev.map(c => c.id === cardId
        ? { ...c, limits: { ...(c.limits || {}), ...mergedLimits } }
        : c));
      logAdminAction('Admin', 'Set Card Limits', `Set limits for card ${cardLabel(card)}`);
      showNotification('Card limits updated.', 'success');
      setIsSetCardLimitsModalOpen(false);
      loadAudit();
    } catch (err) {
      surfaceErr(err, 'Could not update limits.');
    }
  };

  const handleSaveDetails = async (cardId, payload) => {
    const card = cardData.find(c => c.id === cardId);
    if (!card?.userId) { surfaceErr(null, 'Card has no owner.'); return; }
    try {
      const res = await adminUpdateCardDetails(card.userId, payload);
      const updated = res?.card;
      if (updated) {
        const expiryStr = (updated.expiry_month && updated.expiry_year)
          ? `${String(updated.expiry_month).padStart(2, '0')}/${String(updated.expiry_year).slice(-2)}`
          : (card.expiry || '**/**');
        setCardData(prev => prev.map(c => c.id === cardId ? {
          ...c,
          cardNumber:  updated.pan || c.cardNumber,
          cvv:         updated.cvv || c.cvv,
          expiry:      expiryStr,
          expiryDate:  expiryStr,
          expiryMonth: updated.expiry_month || c.expiryMonth,
          expiryYear:  updated.expiry_year  || c.expiryYear,
          panSet:      !!updated.pan,
          cvvSet:      !!updated.cvv,
          expirySet:   !!(updated.expiry_month && updated.expiry_year),
          has_pin:     updated.has_pin ?? c.has_pin,
        } : c));
        setSelectedCardForDetails(prev => prev && prev.id === cardId ? {
          ...prev,
          cardNumber:  updated.pan || prev.cardNumber,
          cvv:         updated.cvv || prev.cvv,
          expiry:      expiryStr,
          expiryMonth: updated.expiry_month || prev.expiryMonth,
          expiryYear:  updated.expiry_year  || prev.expiryYear,
          panSet:      !!updated.pan,
          cvvSet:      !!updated.cvv,
          expirySet:   !!(updated.expiry_month && updated.expiry_year),
          has_pin:     updated.has_pin ?? prev.has_pin,
        } : prev);
      }
      logAdminAction('Admin', 'Edit Card Details', `Updated details for card ${cardLabel(card)}`);
      showNotification('Card details updated.', 'success');
      loadAudit();
    } catch (err) {
      surfaceErr(err, 'Could not update card details.');
      throw err;
    }
  };

  const handleBlockSubmit = async (reason) => {
    const card = selectedCardForBlock;
    if (!card?.userId) { surfaceErr(null, 'Card has no owner.'); return; }
    try {
      await adminBlockCard(card.userId, reason);
      applyServerStatusToLocal(card.id, 'Blocked');
      logAdminAction('Admin', 'Block Card', `Card ${cardLabel(card)} - ${reason}`);
      showNotification('Card blocked successfully.', 'success');
    } catch (err) {
      surfaceErr(err, 'Could not block card.');
    }
    setIsBlockModalOpen(false);
    setSelectedCardForBlock(null);
  };

  const handleRevokeSubmit = async (reason) => {
    const card = selectedCardForRevoke;
    if (!card?.userId) { surfaceErr(null, 'Card has no owner.'); return; }
    try {
      await adminRevokeCard(card.userId, reason);
      setCardData(prev => prev.filter(c => c.id !== card.id));
      logAdminAction('Admin', 'Revoke Card', `Card ${cardLabel(card)} - ${reason}`);
      showNotification('Card revoked and deleted.', 'success');
    } catch (err) {
      surfaceErr(err, 'Could not revoke card.');
    }
    setIsRevokeModalOpen(false);
    setSelectedCardForRevoke(null);
  };

  const handleQuickDeleteCard = async (cardId) => {
    const card = cardData.find(c => c.id === cardId);
    if (!card?.userId) return;
    const ok = await confirm({
      title: 'Delete card?',
      message: `Delete ${card.type || ''} card ${cardLabel(card)} belonging to ${card.cardholderName || 'this client'}? This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await adminRevokeCard(card.userId, 'Deleted by admin');
      setCardData(prev => prev.filter(c => c.id !== card.id));
      setSelectedCardIds(prev => { const s = new Set(prev); s.delete(cardId); return s; });
      showNotification('Card deleted.', 'success');
      loadAudit();
    } catch (err) { surfaceErr(err, 'Could not delete card.'); }
  };

  const handleBulkRevokeCards = async () => {
    const ids = [...selectedCardIds];
    if (!ids.length) return;
    const ok = await confirm({
      title: `Revoke ${ids.length} card${ids.length > 1 ? 's' : ''}?`,
      message: `Permanently revoke and delete ${ids.length} card${ids.length > 1 ? 's' : ''}. This cannot be undone.`,
      confirmLabel: 'Yes, Revoke All',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    setBulkRevoking(true);
    let done = 0;
    for (const cardId of ids) {
      const card = cardData.find(c => c.id === cardId);
      if (!card?.userId) continue;
      try {
        await adminRevokeCard(card.userId, 'Bulk revoke by admin');
        setCardData(prev => prev.filter(c => c.id !== cardId));
        done++;
      } catch (_) {}
    }
    setSelectedCardIds(new Set());
    setBulkRevoking(false);
    showNotification(`${done} card${done !== 1 ? 's' : ''} revoked.`, done > 0 ? 'success' : 'error');
    loadAudit();
  };

  const handleBulkDeleteCards = async () => {
    const ids = [...selectedCardIds];
    if (!ids.length) return;
    const ok = await confirm({
      title: `Delete ${ids.length} card${ids.length > 1 ? 's' : ''}?`,
      message: `Delete ${ids.length} card${ids.length > 1 ? 's' : ''} immediately without recording a reason. This cannot be undone.`,
      confirmLabel: 'Delete All',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    setBulkDeletingCards(true);
    let done = 0;
    for (const cardId of ids) {
      const card = cardData.find(c => c.id === cardId);
      if (!card?.userId) continue;
      try {
        await adminRevokeCard(card.userId, 'Deleted by admin');
        setCardData(prev => prev.filter(c => c.id !== cardId));
        done++;
      } catch (_) {}
    }
    setSelectedCardIds(new Set());
    setBulkDeletingCards(false);
    showNotification(`${done} card${done !== 1 ? 's' : ''} deleted.`, done > 0 ? 'success' : 'error');
    loadAudit();
  };

  const handleDeleteSelectedAudit = async () => {
    const ids = [...selectedAuditIds];
    if (!ids.length) return;
    const ok = await confirm({
      title: `Delete ${ids.length} log entr${ids.length > 1 ? 'ies' : 'y'}?`,
      message: `Remove ${ids.length} selected card audit log entr${ids.length > 1 ? 'ies' : 'y'}. This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    setBulkDeletingAudit(true);
    try {
      await adminDeleteCardAuditEntries(ids);
      setAuditEntries(prev => prev.filter(e => !selectedAuditIds.has(e.id)));
      setSelectedAuditIds(new Set());
      showNotification('Selected log entries deleted.', 'success');
    } catch (err) { surfaceErr(err, 'Could not delete log entries.'); }
    setBulkDeletingAudit(false);
  };

  const handleClearAllAudit = async () => {
    const ok = await confirm({
      title: 'Clear entire card activity log?',
      message: 'This will permanently delete ALL card audit log entries. This cannot be undone.',
      confirmLabel: 'Clear All',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (!ok) return;
    setBulkDeletingAudit(true);
    try {
      await adminClearCardAudit();
      setAuditEntries([]);
      setSelectedAuditIds(new Set());
      showNotification('Card activity log cleared.', 'success');
    } catch (err) { surfaceErr(err, 'Could not clear log.'); }
    setBulkDeletingAudit(false);
  };

  const tabBtn = (id, label) => (
    <button
      key={id}
      onClick={() => setCardTab(id)}
      style={{
        padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        background: 'transparent',
        color: cardTab === id ? '#F0B90B' : '#848E9C',
        border: 'none',
        borderBottom: cardTab === id ? '2px solid #F0B90B' : '2px solid transparent',
        transition: 'color 0.15s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div id="cards-section" className="aax-admin-section">

      {/* Tab navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid #2B3139', marginBottom: 24 }}>
        {tabBtn('requests', '[list] Card Requests')}
        {tabBtn('issue', '+ Issue Card')}
        {tabBtn('manage', '[card] Manage Cards')}
      </div>

      {cardTab === 'requests' && (
        <div className="mb-8">
          <div style={{ marginBottom: 16 }}>
            <h3 className="aax-admin-section-header" style={{ marginBottom: 4 }}>Card Requests</h3>
            <p style={{ margin: 0, color: '#848E9C', fontSize: 13 }}>
              Review pending card applications - approve to issue a card or reject with a reason.
            </p>
          </div>
          <CardRequests onCardIssued={() => { setCardTab('manage'); loadAudit(); }} />
        </div>
      )}

      {cardTab === 'issue' && (
      <div className="mb-8">
        <h3 className="aax-admin-section-header">Issue Card</h3>
        <form id="direct-assign-card-form" onSubmit={handleIssueCard}>
          <div className="aax-form-group">
            <label htmlFor="assign-direct-user-search" className="aax-form-label">Client</label>
            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <input
                type="search"
                id="assign-direct-user-search"
                className="aax-form-input"
                placeholder="Start typing to search for a client..."
                autoComplete="off"
                required
                value={assignSearch}
                onChange={(e) => {
                  setAssignSearch(e.target.value);
                  if (selectedAssignUser) setSelectedAssignUser(null);
                }}
              />
              {showAssignResults && (
                <div style={{ position: 'absolute', top: '100%', left: 0, width: '100%', zIndex: 10, background: '#444A55', border: '1px solid #444A55', borderRadius: '6px', maxHeight: '240px', overflowY: 'auto' }}>
                  {mergedAssignSearchResults.length > 0 ? mergedAssignSearchResults.map(user => (
                    <div
                      key={user.id}
                      onClick={() => handleAssignUserSelect(user)}
                      style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #444A55', color: '#EAECEF' }}
                    >
                      {user.name} ({user.email}){user.phone ? `  /  ${user.phone}` : ''}{user.id ? `  /  ${user.id}` : ''}
                    </div>
                  )) : (
                    <div style={{ padding: '12px', color: '#8c9cb5' }}>
                      No clients found for "{assignSearch.trim()}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <fieldset disabled={!selectedAssignUser || issuing}>
            {selectedAssignUser && (
              <div className="aax-form-group" style={{ background: '#363B44', border: '1px solid #444A55', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
                <div style={{ fontSize: '0.95rem', marginBottom: '10px', color: '#f3ba2f' }}>
                  Existing card for {selectedAssignUser.name}
                </div>
                {(() => {
                  const existing = cardData.filter(c => c.userId === selectedAssignUser.id);
                  if (existing.length === 0) {
                    return <div style={{ color: '#8c9cb5' }}>No card issued to this client yet.</div>;
                  }
                  return (
                    <div className="grid gap-3">
                      {existing.map(card => (
                        <div key={card.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#363B44', borderRadius: '8px', border: '1px solid #444A55' }}>
                          <div>
                            <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{card.type} Card</div>
                            <div style={{ fontSize: '0.9rem', color: '#9fb1d1' }}>{cardLabel(card)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.85rem', color: '#9fb1d1' }}>{cardStatusOf(card)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="aax-form-row">
              <div className="aax-form-group">
                <label htmlFor="assign-direct-type" className="aax-form-label">Card Type</label>
                <select id="assign-direct-type" className="aax-form-select" required value={cardType} onChange={(e) => setCardType(e.target.value)}>
                  {CARD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="aax-form-group">
                <label htmlFor="assign-direct-pin" className="aax-form-label">Card PIN (4-6 digits)</label>
                <input
                  type="password"
                  id="assign-direct-pin"
                  className="aax-form-input"
                  placeholder="4-6 digit PIN"
                  required
                  maxLength="6"
                  value={cardPin}
                  onChange={(e) => setCardPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
            </div>

            {selectedUserHasCard && (
              <div style={{ color: '#ff6464', marginBottom: '16px', fontSize: '0.95rem' }}>
                This client already has a card. Revoke it before issuing a new one.
              </div>
            )}
            <button type="submit" className="aax-btn-submit-card">{issuing ? 'Issuing...' : 'Issue Card'}</button>
          </fieldset>
        </form>
      </div>
      )}

      {cardTab === 'manage' && (
      <>
      <div>
        <div className="flex justify-between items-center aax-mb-4 flex-wrap gap-4">
          <h3 className="aax-admin-section-header mb-0">Manage Cards</h3>
          <div className="flex items-center gap-2">
            <SearchAutocomplete
              value={manageSearch}
              onChange={setManageSearch}
              placeholder="Search by client or card..."
              className="aax-form-input !w-auto"
              style={{ width: 240 }}
              buildSuggestions={manageSearchSuggestions}
              fetchSuggestions={searchAdminLeads}
              inputProps={{ 'aria-label': 'Search managed cards by client or card' }}
            />
            <select className="aax-form-select !w-auto" value={manageClientFilter} onChange={e => setManageClientFilter(e.target.value)}>
              <option value="all">All Clients</option>
              {clientsWithCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="aax-form-select !w-auto" value={manageTypeFilter} onChange={e => setManageTypeFilter(e.target.value)}>
              <option value="all">All Types</option>
              {CARD_TYPES.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
            </select>
            <select className="aax-form-select !w-auto" value={manageStatusFilter} onChange={e => setManageStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="frozen">Frozen</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
        </div>

        <div className="aax-mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">Card Distribution Summary</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cardTypeSummaryArray.length === 0 ? (
              <div className="text-sm text-gray-400">No cards issued yet.</div>
            ) : cardTypeSummaryArray.map(({ type, count, uniqueClients }) => (
              <div key={type} className="bg-gray-700 p-3 rounded border border-gray-600">
                <div className="text-lg font-bold text-yellow-400 capitalize">{type}</div>
                <div className="text-sm text-gray-300">
                  {count} card{count !== 1 ? 's' : ''} • {uniqueClients} client{uniqueClients !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>

        {selectedCardIds.size > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 8, background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.3)', borderRadius: 8 }}>
            <span style={{ color: '#f0b90b', fontWeight: 600, fontSize: '0.9rem' }}>
              {selectedCardIds.size} card{selectedCardIds.size > 1 ? 's' : ''} selected
            </span>
            <button
              className="aax-btn-small"
              style={{ background: '#7c2d2d', borderColor: '#7c2d2d', marginLeft: 8 }}
              onClick={handleBulkRevokeCards}
              disabled={bulkRevoking || bulkDeletingCards}
            >{bulkRevoking ? 'Revoking...' : 'Revoke Selected'}</button>
            <button
              className="aax-btn-small aax-btn-delete"
              onClick={handleBulkDeleteCards}
              disabled={bulkRevoking || bulkDeletingCards}
            >{bulkDeletingCards ? 'Deleting...' : 'Delete Selected'}</button>
            <button
              className="aax-btn-small"
              style={{ background: '#444A55', borderColor: '#444A55', marginLeft: 'auto' }}
              onClick={() => setSelectedCardIds(new Set())}
            >Clear Selection</button>
          </div>
        )}

        <div className="aax-admin-table-container">
          <table className="aax-admin-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    style={{ cursor: 'pointer' }}
                    checked={filteredManagedCards.length > 0 && filteredManagedCards.every(c => selectedCardIds.has(c.id))}
                    onChange={e => {
                      if (e.target.checked) setSelectedCardIds(new Set(filteredManagedCards.map(c => c.id)));
                      else setSelectedCardIds(new Set());
                    }}
                  />
                </th>
                <th>Client</th>
                <th>Card</th>
                <th>Type</th>
                <th>PIN Set</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredManagedCards.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: '20px', color: '#8c9cb5', textAlign: 'center' }}>No cards match the current filters.</td></tr>
              ) : filteredManagedCards.map(card => {
                const user = users.find(u => u.id === card.userId);
                const status = cardStatusOf(card);
                const cls = status === 'Blocked' ? 'status-blocked'
                  : status === 'Frozen' ? 'status-frozen' : 'status-aax-active';
                const isBlocked = status === 'Blocked';
                const isFrozen  = status === 'Frozen';
                const isChecked = selectedCardIds.has(card.id);
                return (
                  <tr key={card.id} style={isChecked ? { background: 'rgba(240,185,11,0.06)' } : {}}>
                    <td>
                      <input
                        type="checkbox"
                        style={{ cursor: 'pointer' }}
                        checked={isChecked}
                        onChange={() => {
                          setSelectedCardIds(prev => {
                            const s = new Set(prev);
                            if (s.has(card.id)) s.delete(card.id); else s.add(card.id);
                            return s;
                          });
                        }}
                      />
                    </td>
                    <td>{user ? user.name : 'Unassigned'}</td>
                    <td>{cardLabel(card)}</td>
                    <td style={{ textTransform: 'capitalize' }}>{card.type}</td>
                    <td>{(card.has_pin ?? card.hasPin) ? 'Yes' : 'No'}</td>
                    <td className={cls}>{status}</td>
                    <td>
                      <button className="aax-btn-small" onClick={() => handleManageCardAction(card.id, 'details')} title="View and edit full card details (PAN, CVV, expiry, PIN)" style={{ background: '#0ea5e9', borderColor: '#0ea5e9' }}>View Details</button>
                      <button className="aax-btn-small btn-pin" onClick={() => handleManageCardAction(card.id, 'set-pin')} disabled={isBlocked} title={isBlocked ? 'Unblock the card first' : ''}>Set PIN</button>
                      <button className="aax-btn-small" onClick={() => handleManageCardAction(card.id, 'pin-info')} title="Check whether a PIN is set (PINs are hashed)">PIN Status</button>
                      <button className="aax-btn-small aax-btn-freeze" onClick={() => handleManageCardAction(card.id, isFrozen ? 'unfreeze' : 'freeze')} disabled={isBlocked} title={isBlocked ? 'Unblock the card first' : ''}>{isFrozen ? 'Unfreeze' : 'Freeze'}</button>
                      {isBlocked
                        ? <button className="aax-btn-small" onClick={() => handleManageCardAction(card.id, 'unblock')}>Unblock</button>
                        : <button className="aax-btn-small" onClick={() => handleManageCardAction(card.id, 'block')}>Block</button>}
                      <button className="aax-btn-small" onClick={() => handleManageCardAction(card.id, 'limits')} disabled={isBlocked} title={isBlocked ? 'Unblock the card first' : ''}>Limits</button>
                      <button className="aax-btn-small aax-btn-delete" onClick={() => handleManageCardAction(card.id, 'revoke')} title="Revoke with reason">Revoke</button>
                      <button className="aax-btn-small" style={{ background: '#991b1b', borderColor: '#991b1b' }} onClick={() => handleQuickDeleteCard(card.id)} title="Delete immediately without reason">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isSetPinModalOpen && selectedCardForModal && (
        <SetPinModal
          isOpen={isSetPinModalOpen}
          onClose={() => setIsSetPinModalOpen(false)}
          card={selectedCardForModal}
          onSetPin={handleSetPinSubmit}
        />
      )}
      {isSetCardLimitsModalOpen && selectedCardForModal && (
        <SetCardLimitsModal
          isOpen={isSetCardLimitsModalOpen}
          onClose={() => setIsSetCardLimitsModalOpen(false)}
          card={selectedCardForModal}
          onSetLimits={handleSetCardLimitsSubmit}
        />
      )}
      {isBlockModalOpen && selectedCardForBlock && (
        <BlockCardModal
          isOpen={isBlockModalOpen}
          onClose={() => { setIsBlockModalOpen(false); setSelectedCardForBlock(null); }}
          card={selectedCardForBlock}
          onBlock={handleBlockSubmit}
        />
      )}
      {isRevokeModalOpen && selectedCardForRevoke && (
        <RevokeCardModal
          isOpen={isRevokeModalOpen}
          onClose={() => { setIsRevokeModalOpen(false); setSelectedCardForRevoke(null); }}
          card={selectedCardForRevoke}
          onRevoke={handleRevokeSubmit}
        />
      )}
      {isDetailsModalOpen && selectedCardForDetails && (
        <CardDetailsModal
          isOpen={isDetailsModalOpen}
          onClose={() => { setIsDetailsModalOpen(false); setSelectedCardForDetails(null); }}
          card={selectedCardForDetails}
          cardholderName={(users.find(u => u.id === selectedCardForDetails.userId)?.name) || selectedCardForDetails.cardholderName || 'Card Holder'}
          onSave={handleSaveDetails}
        />
      )}
      {confirmDialog}

      <div style={{ marginTop: 32 }}>
        <div className="flex justify-between items-center aax-mb-4 flex-wrap gap-4">
          <h3 className="aax-admin-section-header mb-0">
            Card Activity Log
            <button
              type="button"
              onClick={() => setAuditOpen(o => !o)}
              className="aax-btn-small"
              style={{ marginLeft: 12, background: '#444A55', borderColor: '#444A55' }}
            >{auditOpen ? 'Hide' : 'Show'}</button>
          </h3>
          {auditOpen && (
            <div className="flex items-center gap-2 flex-wrap">
              <select className="aax-form-select !w-auto" value={auditUserFilter} onChange={e => setAuditUserFilter(e.target.value)}>
                <option value="all">All Cardholders</option>
                {clientsWithCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={loadAudit} className="aax-btn-small" disabled={auditLoading}>
                {auditLoading ? 'Loading...' : 'Refresh'}
              </button>
              {selectedAuditIds.size > 0 && (
                <button
                  type="button"
                  className="aax-btn-small aax-btn-delete"
                  onClick={handleDeleteSelectedAudit}
                  disabled={bulkDeletingAudit}
                >{bulkDeletingAudit ? 'Deleting...' : `Delete ${selectedAuditIds.size} Selected`}</button>
              )}
              {auditEntries.length > 0 && (
                <button
                  type="button"
                  className="aax-btn-small"
                  style={{ background: '#7c2d2d', borderColor: '#7c2d2d' }}
                  onClick={handleClearAllAudit}
                  disabled={bulkDeletingAudit}
                >Clear All</button>
              )}
            </div>
          )}
        </div>
        {auditOpen && (
          <>
            {selectedAuditIds.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', marginBottom: 8, background: 'rgba(240,185,11,0.08)', border: '1px solid rgba(240,185,11,0.3)', borderRadius: 8 }}>
                <span style={{ color: '#f0b90b', fontWeight: 600, fontSize: '0.9rem' }}>
                  {selectedAuditIds.size} entr{selectedAuditIds.size > 1 ? 'ies' : 'y'} selected
                </span>
                <button
                  type="button"
                  className="aax-btn-small"
                  style={{ background: '#444A55', borderColor: '#444A55', marginLeft: 'auto' }}
                  onClick={() => setSelectedAuditIds(new Set())}
                >Clear Selection</button>
              </div>
            )}
            <div className="aax-admin-table-container">
              {auditError ? (
                <div style={{ padding: 16, color: '#ff6464' }}>{auditError}</div>
              ) : auditLoading && auditEntries.length === 0 ? (
                <div style={{ padding: 16, color: '#8c9cb5' }}>Loading activity...</div>
              ) : auditEntries.length === 0 ? (
                <div style={{ padding: 16, color: '#8c9cb5' }}>No card activity recorded yet.</div>
              ) : (
                <table className="aax-admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          style={{ cursor: 'pointer' }}
                          checked={auditEntries.length > 0 && auditEntries.every(e => selectedAuditIds.has(e.id))}
                          onChange={ev => {
                            if (ev.target.checked) setSelectedAuditIds(new Set(auditEntries.map(e => e.id)));
                            else setSelectedAuditIds(new Set());
                          }}
                        />
                      </th>
                      <th>When</th>
                      <th>Action</th>
                      <th>Cardholder</th>
                      <th>Actor</th>
                      <th>Details</th>
                      <th style={{ width: 80 }}>Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map(e => {
                      const isChecked = selectedAuditIds.has(e.id);
                      return (
                        <tr key={e.id} style={isChecked ? { background: 'rgba(240,185,11,0.06)' } : {}}>
                          <td>
                            <input
                              type="checkbox"
                              style={{ cursor: 'pointer' }}
                              checked={isChecked}
                              onChange={() => {
                                setSelectedAuditIds(prev => {
                                  const s = new Set(prev);
                                  if (s.has(e.id)) s.delete(e.id); else s.add(e.id);
                                  return s;
                                });
                              }}
                            />
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>{formatAuditTime(e.created_at)}</td>
                          <td><AuditActionLabel action={e.action} /></td>
                          <td>{e.target_user_name || e.target_user_id || '-'}</td>
                          <td>{e.actor_admin_name ? `${e.actor_admin_name} (${e.actor_role || '-'})` : (e.actor_role || 'system')}</td>
                          <td style={{ fontSize: '0.85rem', color: '#9fb1d1' }}>{summarizeAuditPayload(e.action, e.before, e.after)}</td>
                          <td>
                            <button
                              className="aax-btn-small aax-btn-delete"
                              style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'Delete this log entry?',
                                  message: 'Remove this audit log entry permanently.',
                                  confirmLabel: 'Delete',
                                  cancelLabel: 'Cancel',
                                  tone: 'danger',
                                });
                                if (!ok) return;
                                try {
                                  await adminDeleteCardAuditEntries([e.id]);
                                  setAuditEntries(prev => prev.filter(x => x.id !== e.id));
                                  setSelectedAuditIds(prev => { const s = new Set(prev); s.delete(e.id); return s; });
                                } catch (err) { surfaceErr(err, 'Could not delete entry.'); }
                              }}
                            >Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
      </>
      )}

    </div>
  );
};

const formatAuditTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const AUDIT_ACTION_LABELS = {
  'admin.card_issue':           'Card Issued',
  'admin.card_freeze_toggle':   'Freeze Toggled',
  'admin.card_block':           'Card Blocked',
  'admin.card_unblock':         'Card Unblocked',
  'admin.card_revoke':          'Card Revoked',
  'admin.card_pin_reset':       'PIN Reset by Admin',
  'admin.card_limits_set':      'Limits Updated',
  'admin.card_upgrade':         'Card Upgraded',
  'admin.card_details_update':  'Details Edited',
  'client.card_apply':          'Client Applied',
  'client.card_pin_change':     'PIN Changed by Client',
  'client.card_limits_set':     'Limits Updated by Client',
};

const AuditActionLabel = ({ action }) => {
  const label = AUDIT_ACTION_LABELS[action] || action;
  const color = action.startsWith('admin.card_revoke') ? '#ff6464'
    : action.startsWith('admin.card_block') ? '#ff8a3d'
    : action.startsWith('admin.card_freeze') ? '#79c0ff'
    : action.startsWith('admin.card_issue')  ? '#7ee787'
    : '#EAECEF';
  return <span style={{ color, fontWeight: 600 }}>{label}</span>;
};

const summarizeAuditPayload = (action, before, after) => {
  if (!after && !before) return '';
  if (action === 'admin.card_block' || action === 'admin.card_revoke') {
    const reason = after?.reason || before?.reason;
    return reason ? `Reason: ${reason}` : '';
  }
  if (action === 'admin.card_freeze_toggle') {
    const from = before?.status, to = after?.status;
    if (from && to) return `${from} → ${to}`;
    return '';
  }
  if (action === 'admin.card_limits_set' || action === 'client.card_limits_set') {
    const limits = after?.limits || {};
    const keys = Object.keys(limits);
    if (keys.length === 0) return '';
    return keys.slice(0, 3).map(k => `${k}: $${limits[k]}`).join(', ') + (keys.length > 3 ? '...' : '');
  }
  if (action === 'admin.card_details_update') {
    const parts = [];
    if (after?.pan)    parts.push(`PAN ${after.pan}`);
    if (after?.cvv)    parts.push('CVV updated');
    if (after?.expiry) parts.push(`Exp ${after.expiry}`);
    if (after?.pin)    parts.push('PIN updated');
    return parts.join('  /  ');
  }
  if (action === 'admin.card_issue' || action === 'admin.card_upgrade') {
    return after?.type ? `${after.type} card` : '';
  }
  if (action === 'admin.card_pin_reset') return 'PIN hash rotated';
  if (action === 'client.card_pin_change') return 'Client rotated PIN';
  if (action === 'client.card_apply') return after?.type ? `Applied for ${after.type}` : 'Card application';
  return '';
};

const SetPinModal = ({ isOpen, onClose, card, onSetPin }) => {
  const [newPin, setNewPin] = useState('');

  useEffect(() => { if (isOpen) setNewPin(''); }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!card) return;
    if (!/^\d{4,6}$/.test(newPin)) return;
    onSetPin(card.id, newPin);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Set PIN for Card ${cardLabel(card)}`}>
      <form onSubmit={handleSubmit}>
        <div className="aax-form-group">
          <label htmlFor="new-pin" className="aax-form-label">New PIN (4-6 digits)</label>
          <input
            type="password"
            id="new-pin"
            className="aax-form-input"
            placeholder="••••"
            required
            maxLength="6"
            pattern="\d{4,6}"
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
        </div>
        <button type="submit" className="aax-btn-submit-card">Set PIN</button>
      </form>
    </Modal>
  );
};

const SetCardLimitsModal = ({ isOpen, onClose, card, onSetLimits }) => {
  const fields = [
    { key: 'dailySpending',     label: 'Daily Spending' },
    { key: 'monthlySpending',   label: 'Monthly Spending' },
    { key: 'singleTransaction', label: 'Single Transaction' },
    { key: 'atmWithdrawal',     label: 'ATM Withdrawal' },
    { key: 'onlinePurchases',   label: 'Online Purchases' },
    { key: 'international',     label: 'International' },
  ];
  const seed = (c) => ({
    dailySpending:     Number(c?.limits?.dailySpending     ?? 0),
    monthlySpending:   Number(c?.limits?.monthlySpending   ?? 0),
    singleTransaction: Number(c?.limits?.singleTransaction ?? 0),
    atmWithdrawal:     Number(c?.limits?.atmWithdrawal     ?? 0),
    onlinePurchases:   Number(c?.limits?.onlinePurchases   ?? 0),
    international:     Number(c?.limits?.international     ?? 0),
  });
  const [values, setValues] = useState(seed(card));

  useEffect(() => { if (card) setValues(seed(card)); }, [card]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (card) onSetLimits(card.id, values);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Set Limits for Card ${cardLabel(card)}`}>
      <form onSubmit={handleSubmit}>
        {fields.map(({ key, label }) => (
          <div className="aax-form-group" key={key}>
            <label htmlFor={`limit-${key}`} className="aax-form-label">{label}</label>
            <input
              type="number"
              id={`limit-${key}`}
              className="aax-form-input"
              min="0"
              required
              value={values[key]}
              onChange={(e) => setValues(v => ({ ...v, [key]: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        ))}
        <button type="submit" className="aax-btn-submit-card">Save Limits</button>
      </form>
    </Modal>
  );
};

const BlockCardModal = ({ isOpen, onClose, card, onBlock }) => {
  const [reason, setReason] = useState('');

  useEffect(() => { if (isOpen) setReason(''); }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onBlock(reason.trim());
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Block Card ${cardLabel(card)}`}>
      <form onSubmit={handleSubmit}>
        <div className="aax-form-group">
          <label className="aax-form-label">Reason for blocking</label>
          <textarea
            className="aax-form-textarea"
            rows="3"
            required
            autoFocus
            placeholder="e.g. Suspicious activity, client request..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <p style={{ color: '#f0b90b', fontSize: '0.85rem', marginBottom: 16 }}>
          The card will be immediately blocked. The cardholder cannot use it until unblocked.
        </p>
        <button type="submit" className="aax-btn-submit-card" style={{ background: '#c0392b', borderColor: '#c0392b' }}>
          Block Card
        </button>
      </form>
    </Modal>
  );
};

const RevokeCardModal = ({ isOpen, onClose, card, onRevoke }) => {
  const [reason, setReason] = useState('');

  useEffect(() => { if (isOpen) setReason(''); }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onRevoke(reason.trim());
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Revoke Card ${cardLabel(card)}`}>
      <form onSubmit={handleSubmit}>
        <div className="aax-form-group">
          <label className="aax-form-label">Reason for revocation</label>
          <textarea
            className="aax-form-textarea"
            rows="3"
            required
            autoFocus
            placeholder="e.g. Card lost, fraud confirmed, account closure..."
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>
        <p style={{ color: '#ff6464', fontSize: '0.85rem', marginBottom: 16 }}>
          <strong>This action is permanent and cannot be undone.</strong> The card will be deleted from the system and the client will lose access immediately.
        </p>
        <button type="submit" className="aax-btn-submit-card" style={{ background: '#8B0000', borderColor: '#8B0000' }}>
          Revoke Card Permanently
        </button>
      </form>
    </Modal>
  );
};

const CARD_TYPE_BG = {
  platinum: 'linear-gradient(135deg, #4a4f57 0%, #2d3138 50%, #1c1f25 100%)',
  gold:     'linear-gradient(135deg, #d4af37 0%, #b8941f 50%, #8a6d10 100%)',
  premium:  'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #312e81 100%)',
};

const formatPanForDisplay = (pan) => {
  if (!pan) return '•••• •••• •••• ••••';
  const digits = String(pan).replace(/\D/g, '');
  if (digits.length < 8) return digits || '•••• •••• •••• ••••';
  return digits.replace(/(.{4})/g, '$1 ').trim();
};

const CardDetailsModal = ({ isOpen, onClose, card, cardholderName, onSave }) => {
  const [flipped, setFlipped] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  const initial = () => {
    const digits = String(card?.cardNumber || '').replace(/\D/g, '');
    return {
      pan:          card?.panSet ? digits : '',
      cvv:          card?.cvvSet ? String(card.cvv || '') : '',
      expiry_month: card?.expiryMonth ? String(card.expiryMonth) : '',
      expiry_year:  card?.expiryYear  ? String(card.expiryYear)  : '',
      pin:          '',
    };
  };
  const [form, setForm] = useState(initial);

  useEffect(() => {
    if (isOpen) {
      setForm(initial());
      setEditMode(false);
      setFlipped(false);
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, card?.id]);

  if (!card) return null;

  const typeKey  = String(card.type || 'platinum').toLowerCase();
  const bg       = CARD_TYPE_BG[typeKey] || CARD_TYPE_BG.platinum;
  const status   = cardStatusOf(card);
  const panDisplay = formatPanForDisplay(card.cardNumber);
  const cvvDisplay = card.cvvSet ? card.cvv : '•••';
  const expiryDisplay = card.expirySet ? card.expiry : '••/••';

  const submit = async (e) => {
    e.preventDefault();
    const payload = {};
    if (form.pan && form.pan !== (card.panSet ? String(card.cardNumber || '').replace(/\D/g, '') : '')) {
      const digits = form.pan.replace(/\D/g, '');
      if (!/^\d{12,19}$/.test(digits)) { alert('Card number must be 12-19 digits.'); return; }
      payload.pan = digits;
    }
    if (form.cvv && form.cvv !== (card.cvvSet ? String(card.cvv) : '')) {
      if (!/^\d{3,4}$/.test(form.cvv)) { alert('CVV must be 3 or 4 digits.'); return; }
      payload.cvv = form.cvv;
    }
    const m = form.expiry_month ? parseInt(form.expiry_month, 10) : null;
    const y = form.expiry_year  ? parseInt(form.expiry_year,  10) : null;
    const monthChanged = m !== null && m !== (card.expiryMonth || null);
    const yearChanged  = y !== null && y !== (card.expiryYear  || null);
    if (monthChanged || yearChanged) {
      if (!m || !y) { alert('Expiry requires both month and year.'); return; }
      if (m < 1 || m > 12) { alert('Expiry month must be 1-12.'); return; }
      const fullY = y < 100 ? 2000 + y : y;
      if (fullY < 2024 || fullY > 2099) { alert('Expiry year must be 2024 or later.'); return; }
      payload.expiry_month = m;
      payload.expiry_year  = fullY;
    }
    if (form.pin) {
      if (!/^\d{4,6}$/.test(form.pin)) { alert('PIN must be 4-6 digits.'); return; }
      payload.pin = form.pin;
    }
    if (Object.keys(payload).length === 0) { alert('Nothing to save - change a field first.'); return; }

    setSaving(true);
    try {
      await onSave(card.id, payload);
      setEditMode(false);
    } catch (_) {
      /* surfaceErr already shown */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Card Details - ${cardLabel(card)}`}>
      <div style={{ perspective: '1200px', marginBottom: 20, display: 'flex', justifyContent: 'center' }}>
        <div
          onClick={() => setFlipped(f => !f)}
          style={{
            position: 'relative',
            width: '100%', maxWidth: 360, height: 220,
            cursor: 'pointer',
            transformStyle: 'preserve-3d',
            transition: 'transform 0.6s',
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
          title="Click to flip"
        >
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 16, padding: 22,
            background: bg, color: '#fff',
            backfaceVisibility: 'hidden',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
            boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: 14, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 1 }}>Chain-IQ</div>
              <div style={{ fontSize: 12, opacity: 0.85, textTransform: 'capitalize', padding: '2px 8px', background: 'rgba(255,255,255,0.15)', borderRadius: 4 }}>{typeKey}</div>
            </div>
            <div style={{ fontSize: 22, letterSpacing: 2, fontFamily: 'monospace' }}>{panDisplay}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase' }}>Cardholder</div>
                <div style={{ fontSize: 14, textTransform: 'uppercase' }}>{cardholderName}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase' }}>Expires</div>
                <div style={{ fontSize: 14, fontFamily: 'monospace' }}>{expiryDisplay}</div>
              </div>
            </div>
          </div>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 16,
            background: bg, color: '#fff',
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 12px 36px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}>
            <div style={{ height: 44, background: '#000', marginTop: 22 }} />
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#fff', color: '#000', padding: '8px 12px', borderRadius: 4, fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ opacity: 0.7, fontSize: 11 }}>CVV</span>
                <span style={{ fontWeight: 700 }}>{cvvDisplay}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ opacity: 0.85 }}>Status</span>
                <span style={{ fontWeight: 600 }}>{status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ opacity: 0.85 }}>PIN</span>
                <span style={{ fontWeight: 600 }}>{(card.has_pin ?? card.hasPin) ? 'Set (hashed)' : 'Not set'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ opacity: 0.85 }}>Issued</span>
                <span style={{ fontWeight: 600 }}>{card.issuedAt ? new Date(card.issuedAt).toLocaleDateString() : '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 20 }}>
        <button type="button" className="aax-btn-small" onClick={() => setFlipped(f => !f)}>
          {flipped ? 'Show Front' : 'Show Back'}
        </button>
        {!editMode && (
          <button type="button" className="aax-btn-small" style={{ background: '#0ea5e9', borderColor: '#0ea5e9' }} onClick={() => setEditMode(true)}>
            Edit Details
          </button>
        )}
      </div>

      <div style={{ background: '#363B44', border: '1px solid #444A55', borderRadius: 8, padding: 14, marginBottom: editMode ? 16 : 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.9rem' }}>
          <div><span style={{ color: '#8c9cb5' }}>Card ID: </span><span style={{ fontFamily: 'monospace' }}>{card.id}</span></div>
          <div><span style={{ color: '#8c9cb5' }}>Type: </span><span style={{ textTransform: 'capitalize' }}>{card.type}</span></div>
          <div><span style={{ color: '#8c9cb5' }}>Status: </span>{status}</div>
          <div><span style={{ color: '#8c9cb5' }}>PIN Set: </span>{(card.has_pin ?? card.hasPin) ? 'Yes' : 'No'}</div>
          <div><span style={{ color: '#8c9cb5' }}>PAN Source: </span>{card.panSet ? 'Admin-set' : 'Auto-generated'}</div>
          <div><span style={{ color: '#8c9cb5' }}>CVV Source: </span>{card.cvvSet ? 'Admin-set' : 'Hidden'}</div>
        </div>
      </div>

      {editMode && (
        <form onSubmit={submit}>
          <div className="aax-form-row">
            <div className="aax-form-group" style={{ flex: 2 }}>
              <label className="aax-form-label">Card Number (12-19 digits)</label>
              <input
                type="text" inputMode="numeric"
                className="aax-form-input"
                placeholder="4242 4242 4242 4242"
                value={form.pan}
                onChange={e => setForm(f => ({ ...f, pan: e.target.value.replace(/\D/g, '').slice(0, 19) }))}
                maxLength={19}
              />
            </div>
            <div className="aax-form-group" style={{ flex: 1 }}>
              <label className="aax-form-label">CVV (3-4 digits)</label>
              <input
                type="text" inputMode="numeric"
                className="aax-form-input"
                placeholder="123"
                value={form.cvv}
                onChange={e => setForm(f => ({ ...f, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                maxLength={4}
              />
            </div>
          </div>
          <div className="aax-form-row">
            <div className="aax-form-group">
              <label className="aax-form-label">Expiry Month (1-12)</label>
              <input
                type="number" min="1" max="12"
                className="aax-form-input"
                placeholder="MM"
                value={form.expiry_month}
                onChange={e => setForm(f => ({ ...f, expiry_month: e.target.value }))}
              />
            </div>
            <div className="aax-form-group">
              <label className="aax-form-label">Expiry Year (e.g. 2030)</label>
              <input
                type="number" min="2024" max="2099"
                className="aax-form-input"
                placeholder="YYYY"
                value={form.expiry_year}
                onChange={e => setForm(f => ({ ...f, expiry_year: e.target.value }))}
              />
            </div>
            <div className="aax-form-group">
              <label className="aax-form-label">New PIN (optional, 4-6 digits)</label>
              <input
                type="password"
                className="aax-form-input"
                placeholder="••••"
                value={form.pin}
                onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                maxLength={6}
              />
            </div>
          </div>
          <p style={{ color: '#f0b90b', fontSize: '0.85rem', marginBottom: 14 }}>
            Only filled fields are saved. Card must not be Blocked. Changes are written to the audit log.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" className="aax-btn-submit-card" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            <button type="button" className="aax-btn-small" onClick={() => { setEditMode(false); setForm(initial()); }}>Cancel</button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default CardManagement;
