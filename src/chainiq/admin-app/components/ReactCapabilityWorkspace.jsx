import React, { useEffect, useState } from 'react';
import Transactions from './Transactions/Transactions.jsx';
import Balances from './Balances/Balances.jsx';
import CardManagement from './CardManagement/CardManagement.jsx';
import CryptoAddresses from './CryptoAddresses/CryptoAddresses.jsx';
import SignupRequests from './SignupRequests/SignupRequests.jsx';
import Notifications from './Notifications/Notifications.jsx';
import SecurityRequests from './SecurityRequests/SecurityRequests.jsx';
import DepositRequests from './DepositRequests/DepositRequests.jsx';
import WithdrawalQueue from './WithdrawalQueue/WithdrawalQueue.jsx';
import KycReview from './KycReview/KycReview.jsx';
import { DataContext, NotificationContext } from '../shared';
import { getCryptoData } from '../../api';
import { adminGetAllCards, listAllTransactions } from '../adminApi';

const TOOLS = [
  ['transactions', 'Transactions', Transactions],
  ['balances', 'Balances', Balances],
  ['card_management', 'Card Management', CardManagement],
  ['crypto_addresses', 'Crypto Addresses', CryptoAddresses],
  ['registrations', 'Registrations', SignupRequests],
  ['notifications', 'Notifications', Notifications],
  ['security', 'Security', SecurityRequests],
  ['deposits', 'Deposits', DepositRequests],
  ['withdrawals', 'Withdrawals', WithdrawalQueue],
  ['kyc_review', 'KYC Review', KycReview],
];

export default function ReactCapabilityWorkspace({
  data,
  currentUser,
  showNotification,
  activeTab,
  onActiveChange,
  nativeTabKeys = [],
  fallbackTab,
  excludeTools = [],
  showPanel = true,
}) {
  const [capabilities, setCapabilities] = useState({});
  const [internalActive, setInternalActive] = useState('');
  const [capabilitiesLoaded, setCapabilitiesLoaded] = useState(false);
  const [cryptoData, setCryptoData] = useState([]);
  const [cardData, setCardData] = useState([]);
  const [transactionData, setTransactionData] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setCapabilitiesLoaded(false);
    const target = currentUser?.id ? `/api/admin/staff/${encodeURIComponent(currentUser.id)}/capabilities` : '/api/admin/me';
    fetch(target, { headers: { Accept: 'application/json' } })
      .then((response) => response.ok ? response.json() : fetch('/api/admin/me', { headers: { Accept: 'application/json' } }).then((fallback) => fallback.json()))
      .then((payload) => {
        if (cancelled) return;
        const next = payload.capabilities || {};
        setCapabilities(next);
        const first = TOOLS.find(([key]) => next[key]);
        setInternalActive(first?.[0] || '');
        setCapabilitiesLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setCapabilitiesLoaded(true);
      });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCryptoData().catch(() => []), adminGetAllCards().catch(() => ({ cards: [] })), listAllTransactions({ limit: 500 }).catch(() => ({ transactions: [] }))]).then(([assets, cards, transactions]) => {
      if (cancelled) return;
      setCryptoData(Array.isArray(assets) ? assets : []);
      setCardData(Array.isArray(cards?.cards) ? cards.cards : []);
      setTransactionData(Array.isArray(transactions?.transactions) ? transactions.transactions : []);
    });
    return () => { cancelled = true; };
  }, []);

  const visibleTools = TOOLS.filter(([key]) => capabilities[key] && !excludeTools.includes(key));
  const selectedKey = activeTab === undefined ? internalActive : activeTab;
  const current = visibleTools.find(([key]) => key === selectedKey);

  useEffect(() => {
    if (!capabilitiesLoaded || activeTab === undefined || nativeTabKeys.includes(activeTab)) return;
    if (!visibleTools.some(([key]) => key === activeTab) && fallbackTab) {
      onActiveChange?.(fallbackTab);
    }
  }, [activeTab, capabilitiesLoaded, fallbackTab, nativeTabKeys, onActiveChange, visibleTools]);

  if (!visibleTools.length) return null;
  const Component = current?.[2];
  const props = current?.[0] === 'registrations' ? { data, showNotification } : current?.[0] === 'security' ? { showNotification } : {};

  // `data.users` is the staff directory. Capability tools that search for
  // clients must use the already role-scoped CRM lead list instead. Keeping
  // this as a separate alias makes the distinction explicit while preserving
  // the existing DataContext API used by the tool components.
  const scopedClients = data.leads || [];
  const contextValue = {
    currentUser,
    clientUsers: scopedClients,
    leads: scopedClients, setLeads: () => {},
    users: scopedClients, setUsers: () => {},
    transactionData, setTransactionData, activityLog: [], setActivityLog: () => {},
    cardData, setCardData, withdrawalData: [], setWithdrawalData: () => {}, userFees: {}, clientSpecificFees: {},
    cryptoData, setCryptoData, globalAddressData: [], setGlobalAddressData: () => {}, clientAddressData: [], setClientAddressData: () => {},
    logAdminAction: () => {}, logActivity: () => {},
  };

  return (
    <DataContext.Provider value={contextValue}>
      <NotificationContext.Provider value={showNotification || (() => {})}>
        <section className="aax-react-capability-workspace">
          <div className="aax-super-admin-header aax-role-panel-header aax-react-capability-header">
            <nav className="aax-super-admin-tabs aax-react-capability-tabs" aria-label="Granted tools">
              {visibleTools.map(([key, label]) => (
                <button key={key} type="button" className={`aax-super-admin-tab-btn ${selectedKey === key ? 'aax-active' : ''}`} onClick={() => { setInternalActive(key); onActiveChange?.(key); }}>
                  {label}
                </button>
              ))}
            </nav>
          </div>
          {showPanel && current && <div className="aax-react-capability-panel"><Component {...props} /></div>}
        </section>
      </NotificationContext.Provider>
    </DataContext.Provider>
  );
}
