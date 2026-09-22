import React, { useState, useEffect, useCallback } from 'react';
import {
  Routes,
  Route,
  Link,
  Navigate,
  useParams,
  useNavigate,
} from 'react-router-dom';
import './admin.css';
import { usePlatformSettings } from '../platformDefaults';
import StaffLogin from './components/Login/StaffLogin.jsx';
import RoleLogin from './components/Login/RoleLogin.jsx';
import {
  getAdminToken,
  getStoredAdminProfile,
  mapAdminToUser,
  fetchAdminMe,
  createOffice,
  createTeam,
  createAgentApi,
  assignOfficeManagerApi,
  blockStaffApi,
  unblockStaffApi,
  listOffices,
  listTeams,
  fetchAllLeads,
  listStaff,
  updateLeadApi,
  assignLeadApi,
  createLeadApi,
} from './adminApi';

import {
  ROLE,
  ErrorBoundary,
  makeLoginLink,
  initialData,
  getOfficeName,
  getTeamName,
  getUserName,
  getTeamAgentCount,
  normalizeLeadAssignment,
} from './shared';

import SuperAdminPanel from './panels/SuperAdminPanel.jsx';
import OfficeManagerPanel from './panels/OfficeManagerPanel.jsx';
import TeamLeaderPanel from './panels/TeamLeaderPanel.jsx';
import AgentPanel, { LeadProfilePage } from './panels/AgentPanel.jsx';
import { UserChrome } from './components/UserChrome.jsx';
import ReactCapabilityWorkspace from './components/ReactCapabilityWorkspace.jsx';

const CRM_ICON_TOKENS = {
  office: '🏢',
  users: '👥',
  agents: '👥',
  agent: '👤',
  user: '👤',
  money: '💰',
  card: '💳',
  list: '☷',
  search: '⌕',
  upload: '↥',
  file: '▤',
  chart: '▥',
  status: '●',
  trend: '↗',
  top: '★',
  pending: '◷',
  deposit: '💰',
  security: '🔒',
  reload: '↻',
  close: '×',
  unknown: '?',
};

const WINDOWS_1252_BYTES = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a,
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c,
  'ž': 0x9e, 'Ÿ': 0x9f,
};

function repairLegacyUtf8(value) {
  if (!/[ðâÃ]/.test(value)) return value;
  const bytes = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 0xff) bytes.push(codePoint);
    else if (WINDOWS_1252_BYTES[character] !== undefined) bytes.push(WINDOWS_1252_BYTES[character]);
    else return value;
  }
  try {
    const repaired = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    return repaired.includes('�') ? value : repaired;
  } catch (_) {
    return value;
  }
}

function normalizeCrmText(value) {
  const repaired = repairLegacyUtf8(value).replace(/\[([a-z][a-z -]{1,40})\]/gi, (token, name) => (
    CRM_ICON_TOKENS[name.toLowerCase()] || token
  ));
  return repaired.replace(/ðŸ¢/g, '🏢');
}

function useCrmTextNormalization() {
  useEffect(() => {
    let scheduled = false;
    let observer;

    const normalize = () => {
      const root = document.querySelector('.aax-admin-app');
      if (!root) return;

      observer?.disconnect();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      let node = walker.nextNode();
      while (node) {
        if (!node.parentElement?.closest('script, style')) textNodes.push(node);
        node = walker.nextNode();
      }
      textNodes.forEach((textNode) => {
        const nextValue = normalizeCrmText(textNode.nodeValue || '');
        if (nextValue !== textNode.nodeValue) textNode.nodeValue = nextValue;
      });

      root.querySelectorAll('[placeholder], [title], [aria-label], optgroup[label]').forEach((element) => {
        ['placeholder', 'title', 'aria-label', 'label'].forEach((attribute) => {
          if (!element.hasAttribute(attribute)) return;
          const currentValue = element.getAttribute(attribute);
          const nextValue = normalizeCrmText(currentValue || '');
          if (nextValue !== currentValue) element.setAttribute(attribute, nextValue);
        });
      });

      observer?.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['placeholder', 'title', 'aria-label', 'label'],
      });
    };

    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        normalize();
      });
    });
    normalize();
    return () => observer.disconnect();
  }, []);
}

// Re-export shared symbols that admin sub-components still import from `../../App`.
// Keeping this barrel export prevents a sweeping import-path rewrite across
// every component file just to support the panel split.
export { DataContext, NotificationContext, LEAD_STATUSES } from './shared';

// Live-updating brand mark: reads platformAbbreviation from the backend-driven
// module singleton. Re-renders instantly whenever settings are saved via the
// admin Settings page - no localStorage involved.
function useBrandIdentity() {
  const s = usePlatformSettings();
  return { abbreviation: s.platformAbbreviation, name: s.platformName };
}

function AdminBrand() {
  const { abbreviation, name } = useBrandIdentity();
  const [first, ...rest] = (name || 'Chain-IQ').split(/[- / \s]+/);
  const second = rest.join(' ') || 'IQ';
  return (
    <div className="aax-brand">
      <span className="aax-brand-mark">{abbreviation || 'CIQ'}</span>
      <span className="aax-brand-text">{first}<span className="aax-brand-dot"> / </span>{second}<span className="aax-brand-tag">CRM</span></span>
    </div>
  );
}

function RolePage({ data, dataLoading, role, setLeadAssignment, assignOfficeManager, createOfficeWithManager, assignTeamLeader, createTeamLeader, createAgent, assignAgent, toggleStaffBlocked, setData, setUserLoginState, updateLead, createLead, showNotification }) {
  const { userId } = useParams();
  const user = data.users.find((u) => u.id === userId);
  const [canCreateAgent, setCanCreateAgent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (role !== ROLE.TEAM_LEADER || !user?.id) {
      setCanCreateAgent(false);
      return () => { cancelled = true; };
    }

    const loadCapability = async () => {
      const target = `/api/admin/staff/${encodeURIComponent(user.id)}/capabilities`;
      const response = await fetch(target, { headers: { Accept: 'application/json' } });
      const payload = response.ok
        ? await response.json()
        : await fetch('/api/admin/me', { headers: { Accept: 'application/json' } }).then((fallback) => fallback.json());
      if (!cancelled) setCanCreateAgent(payload.capabilities?.create_agent === true);
    };

    loadCapability().catch(() => {
      if (!cancelled) setCanCreateAgent(false);
    });
    return () => { cancelled = true; };
  }, [role, user?.id]);

  if (!user) {
    if (dataLoading) {
      return (
        <div style={{ minHeight: '100vh', background: '#2A2E36', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#848E9C', fontSize: 14 }}>
          Loading...
        </div>
      );
    }
    return <Navigate to="/admin" replace />;
  }
  if (user.role !== role) {
    return (
      <div className="aax-app-shell">
        <header className="aax-topbar">
          <AdminBrand />
          <div className="aax-top-actions">Role mismatch</div>
        </header>
        <div className="aax-body-grid">
          <aside className="aax-sidebar">
            <h2>Dashboard</h2>
            <Link className="aax-nav-link" to="">Home</Link>
          </aside>
          <main className="aax-main-content">
            <div className="aax-card"><h3>Access Denied</h3><p>Client role mismatch for this route.</p><Link className="aax-link-item" to="">Back Home</Link></div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="aax-app-shell">
      <header className="aax-topbar">
        <AdminBrand />
        <div className="aax-top-actions">
          <UserChrome user={user} data={data} setData={setData} />
        </div>
      </header>

      <div className={`aax-body-grid ${user.role === ROLE.AGENT ? 'aax-agent-view' : ''} ${user.role === ROLE.TEAM_LEADER ? 'aax-no-sidebar' : ''} ${user.role === ROLE.OFFICE_MANAGER ? 'aax-no-sidebar' : ''} ${user.role === ROLE.SUPER_ADMIN ? 'aax-no-sidebar' : ''}`}>
        {user.role === ROLE.SUPER_ADMIN && (
          <aside className="aax-sidebar">
            <h2>Menu</h2>
            <Link className="aax-nav-link" to="/admin">Home</Link>
            <Link className="aax-nav-link" to={`/admin/super-admin/${user.id}`}>Workspace</Link>

            <div className="aax-sidebar-subhead">Office Managers</div>
            {data.users.filter((u) => u.role === ROLE.OFFICE_MANAGER).map((mgr) => (
              <Link key={mgr.id} className="aax-nav-link" to={`/admin/office-manager/${mgr.id}`}>{mgr.name}</Link>
            ))}

            <div className="aax-sidebar-note">
              <strong>Current</strong>
              <div>{user.name}</div>
              <div>Office: {getOfficeName(user.officeId, data.offices)}</div>
              <div>Team: {getTeamName(user.teamId, data.teams)}</div>
            </div>
          </aside>
        )}

        <main className="aax-main-content">
          <Routes>
            <Route
              path="lead/:leadId"
              element={<LeadProfilePage role={role} viewingUser={user} data={data} updateLead={updateLead} showNotification={showNotification} />}
            />
            <Route
              path=""
              element={(
                <>
                  {role === ROLE.SUPER_ADMIN && <SuperAdminPanel data={data} currentUser={user} setData={setData} assignOfficeManager={assignOfficeManager} createOfficeWithManager={createOfficeWithManager} createTeamLeader={createTeamLeader} createAgent={createAgent} toggleStaffBlocked={toggleStaffBlocked} setLeadAssignment={setLeadAssignment} setUserLoginState={setUserLoginState} createLead={createLead} showNotification={showNotification} />}
                  {role === ROLE.OFFICE_MANAGER && <OfficeManagerPanel data={data} currentUser={user} assignTeamLeader={assignTeamLeader} createTeamLeader={createTeamLeader} createAgent={createAgent} setLeadAssignment={setLeadAssignment} updateLead={updateLead} createLead={createLead} setUserLoginState={setUserLoginState} showNotification={showNotification} />}
                  {role === ROLE.TEAM_LEADER && <TeamLeaderPanel data={data} setData={setData} currentUser={user} createAgent={createAgent} canCreateAgent={canCreateAgent} setLeadAssignment={setLeadAssignment} updateLead={updateLead} createLead={createLead} setUserLoginState={setUserLoginState} showNotification={showNotification} />}
                  {role === ROLE.AGENT && <AgentPanel data={data} currentUser={user} setData={setData} setUserLoginState={setUserLoginState} createLead={createLead} showNotification={showNotification} />}
                </>
              )}
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function BackofficeLanding() {
  const navigate = useNavigate();
  const { abbreviation, name } = useBrandIdentity();
  const [first, ...rest] = (name || 'Chain-IQ').split(/[- / \s]+/);
  const second = rest.join(' ') || 'IQ';
  const initial = (abbreviation || 'C').charAt(0).toUpperCase();

  const portals = [
    { to: '/admin/login/super-admin',    icon: '👑', title: 'Super Admin',    desc: 'Full system control - offices, teams, agents, leads', accent: '#F0B90B' },
    { to: '/admin/login/office-manager', icon: '[office]', title: 'Office Manager', desc: 'Manage your office, its teams, agents and leads',     accent: '#0A84FF' },
    { to: '/admin/login/team-leader',    icon: '[users]', title: 'Team Leader',    desc: 'Manage your team - agents and assigned leads',        accent: '#64D2FF' },
    { to: '/admin/login/agent',          icon: '[agent]', title: 'Agent',          desc: 'Work the leads assigned to you',                       accent: '#30D158' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#2A2E36', color: '#EAECEF', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: '#F0B90B', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(240,185,11,0.35)' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#2A2E36', letterSpacing: '-0.02em' }}>{initial}</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#EAECEF', letterSpacing: '-0.02em' }}>
            {first}<span style={{ color: '#F0B90B' }}> / </span>{second}
          </div>
        </div>
        <div style={{ fontSize: 14, color: '#A8AEB8', fontWeight: 500 }}>Backoffice Administration</div>
        <div style={{ fontSize: 12, color: '#7B8392', marginTop: 4 }}>Choose your role to continue.</div>
      </div>

      <div style={{
        width: '100%', maxWidth: 920, marginBottom: 16, background: '#363B44',
        borderRadius: 12, padding: '12px 16px', fontSize: 12, color: '#A8AEB8',
        lineHeight: 1.55, textAlign: 'left',
      }}>
        <div style={{ color: '#F0B90B', fontWeight: 700, marginBottom: 6 }}>Preview demo logins</div>
        <div>Super Admin — sarah.b@example.net / admin123</div>
        <div>Office Manager — kevin.m@example.com / manager123</div>
        <div>Team Leader — xena.w@example.org / leader123</div>
        <div>Agent — hannah.h@example.com / agent123</div>
        <div>Client portal — client@chain-iq.com / client123</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, width: '100%', maxWidth: 920 }}>
        {portals.map((p) => (
          <div
            key={p.to}
            onClick={() => navigate(p.to)}
            style={{ background: '#363B44', borderRadius: 14, padding: '18px 14px', cursor: 'pointer', transition: 'transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease', textAlign: 'center', boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.18)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#3F4550'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 22px rgba(0,0,0,0.30), 0 0 0 1px ${p.accent}40`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#363B44'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.18)'; }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: `${p.accent}1A`, color: p.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 10 }}>
              {p.icon}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 3, color: '#EAECEF', letterSpacing: '-0.01em' }}>{p.title}</div>
            <div style={{ color: '#8B94A3', fontSize: 11.5, lineHeight: 1.45 }}>{p.desc}</div>
          </div>
        ))}
      </div>

      <div
        onClick={() => { window.location.href = '/login'; }}
        style={{ marginTop: 20, background: '#363B44', borderRadius: 12, padding: '12px 18px', cursor: 'pointer', transition: 'transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease', display: 'inline-flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 12px rgba(0,0,0,0.18)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#3F4550'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#363B44'; e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(10,132,255,0.15)', color: '#0A84FF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}></div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#EAECEF' }}>Client Portal</div>
          <div style={{ color: '#8B94A3', fontSize: 11.5 }}>Trading platform for clients</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Injects a real admin user (from the backend) into a user list,
 * replacing any existing entry with the same id so there are no duplicates.
 */
function injectAdminUser(users, adminUser) {
  const filtered = users.filter((u) => u.id !== adminUser.id);
  return [...filtered, adminUser];
}

// The admin app is fully backend-driven: offices, teams, leads, staff users
// and transactions all hydrate from SQLite via `loadBackendAdminData()` and
// the per-panel APIs. Two earlier localStorage snapshots used to cache the
// entire `data` object client-side; both are removed on mount because they
// caused balance edits and lead history to look "saved" in the same browser
// while silently being lost across browsers and admins. Only the admin's
// own profile is rehydrated synchronously (via `getStoredAdminProfile`) so
// panel routes can find the user in `data.users` before the network returns.
const LEGACY_ADMIN_CACHE_KEYS = ['chainiq_admin_data', 'chainiq_admin_data_v2'];

function App() {
  useCrmTextNormalization();

  const [data, setData] = useState(() => {
    try {
      // Best-effort: nuke the legacy data caches so stale balances / leads
      // never resurface from a previous session.
      LEGACY_ADMIN_CACHE_KEYS.forEach((k) => {
        try { localStorage.removeItem(k); } catch (_) {}
      });

      // Synchronously restore the real admin profile so panel routes can find
      // the user in data.users immediately on mount (before any async effect).
      const storedProfile = getStoredAdminProfile();
      if (storedProfile) {
        return {
          ...initialData,
          users: injectAdminUser(initialData.users, mapAdminToUser(storedProfile)),
        };
      }
    } catch (_) {}
    return initialData;
  });
  const [notification, setNotification] = useState('');
  const [appLoaded, setAppLoaded] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  const loadBackendAdminData = useCallback(async () => {
    try {
      const [offices, teams, liveResult, deletedResult, staffRows, deletedOffices, deletedTeams] = await Promise.all([
        listOffices(),
        listTeams(),
        fetchAllLeads(),
        fetchAllLeads({ includeDeleted: 'only' }).catch(() => ({ leads: [] })),
        listStaff(),
        listOffices({ includeDeleted: 'only' }).catch(() => []),
        listTeams({ includeDeleted: 'only' }).catch(() => []),
      ]);

      const recycleBin = [
        ...(deletedOffices || []).map((o) => ({
          id: o.id,
          type: 'office',
          item: o,
          deletedAt: o.deletedAt || new Date().toISOString(),
        })),
        ...(deletedTeams || []).map((t) => ({
          id: t.id,
          type: 'team',
          item: t,
          deletedAt: t.deletedAt || new Date().toISOString(),
        })),
      ];

      setData((prev) => {
        const storedProfile = getStoredAdminProfile();
        const sessionAdmin = storedProfile
          ? prev.users.find((u) => u.id === storedProfile.id)
          : null;

        let mergedUsers = staffRows;
        if (sessionAdmin && !mergedUsers.some((u) => u.id === sessionAdmin.id)) {
          mergedUsers = [...mergedUsers, sessionAdmin];
        }

        const normalizedLeads = (liveResult.leads || []).map((lead) =>
          normalizeLeadAssignment(lead, mergedUsers, teams)
        );

        const deletedLeads = (deletedResult.leads || []).map((lead) =>
          normalizeLeadAssignment(lead, mergedUsers, teams)
        );

        return {
          ...prev,
          offices,
          teams,
          leads: normalizedLeads,
          deletedLeads,
          recycleBin,
          users: mergedUsers,
        };
      });
    } catch (error) {
      console.error('[App] failed to load admin backend data', error);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    setAppLoaded(true);

    window.onerror = (message, source, lineno, colno, error) => {
      console.error('[App] Error:', message, source, lineno, colno, error);
      return true;
    };

    const validateAdminSession = async () => {
      try {
        const freshAdmin = await fetchAdminMe();
        const adminUser  = mapAdminToUser(freshAdmin);
        setData((prev) => ({
          ...prev,
          users: injectAdminUser(prev.users, adminUser),
        }));
      } catch (_) {
        // Token missing or invalid - no action needed. The user will be
        // prompted to log in when they navigate to a protected route.
      }
    };
    validateAdminSession();
    if (getAdminToken()) {
      loadBackendAdminData();
    } else {
      setDataLoading(false);
    }

    // Keep all role panels fresh while they are open. Search typeahead is
    // server-backed for immediate results; this interval keeps the tables and
    // local selectors in sync too, including leads created by another user.
    const leadRefreshId = setInterval(async () => {
      if (!getAdminToken()) return;
      try {
        const liveResult = await fetchAllLeads();
        setData((prev) => {
          const storedProfile = getStoredAdminProfile();
          const sessionAdmin = storedProfile
            ? prev.users.find((u) => u.id === storedProfile.id)
            : null;
          const normalizedLeads = (liveResult.leads || []).map((lead) =>
            normalizeLeadAssignment(lead, prev.users, prev.teams)
          );
          return {
            ...prev,
            leads: normalizedLeads,
            users: sessionAdmin && !prev.users.some((u) => u.id === sessionAdmin.id)
              ? [...prev.users, sessionAdmin]
              : prev.users,
          };
        });
      } catch (error) {
        console.warn('[App] background lead refresh failed', error);
      }
    }, 15000);

    window.onunhandledrejection = (event) => {
      console.error('[App] Unhandled promise rejection:', event.reason);
      return true;
    };
    return () => clearInterval(leadRefreshId);
  }, []);

  if (!appLoaded) {
    return (
      <div className="aax-admin-app" style={{ padding: 30, minHeight: '100vh' }}>
        <h1>Loading application...</h1>
      </div>
    );
  }

  const showNotification = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(''), 3000);
  };

  /**
   * Called by a login component after a successful real-backend auth.
   * Injects (or replaces) the admin's record in data.users so the panel
   * route can find it via data.users.find(u => u.id === userId).
   */
  const addAdminToData = (adminUser) => {
    setData((prev) => ({
      ...prev,
      users: injectAdminUser(prev.users, adminUser),
    }));
    loadBackendAdminData();
  };

  const setLeadAssignment = ({ leadId, officeId, teamId, agentId }) => {
    const lead = data.leads.find((item) => item.id === leadId);
    if (!lead) {
      showNotification(`Lead ${leadId} not found`);
      return;
    }

    const agent = agentId ? data.users.find((u) => u.id === agentId) : null;
    if (agentId && !agent) {
      showNotification(`Agent ${agentId} not found`);
      return;
    }

    // When an agent is explicitly specified, derive office/team from the agent record
    // to maintain hierarchy integrity. Otherwise use the explicit values provided.
    // Use explicit null to clear a level; use undefined to keep existing value.
    let targetAgent = agent ? agent.id : (agentId !== undefined ? (agentId || null) : lead.assignedToAgent);
    let targetTeam = agent ? agent.teamId : (teamId !== undefined ? (teamId || null) : lead.assignedToTeam);
    let targetOffice = agent ? agent.officeId : (officeId !== undefined ? (officeId || null) : lead.assignedToOffice);

    // If team changed but agent not explicitly changed, clear agent
    if (!agent && teamId !== undefined && teamId !== lead.assignedToTeam && agentId === undefined) {
      targetAgent = null;
    }
    // If office changed but team not explicitly changed, clear team and agent
    if (!agent && officeId !== undefined && officeId !== lead.assignedToOffice && teamId === undefined) {
      targetTeam = null;
      targetAgent = null;
    }
    // Derive office from team when team is explicitly set but office is not
    if (targetTeam && !targetOffice) {
      const teamObj = data.teams.find(t => t.id === targetTeam);
      if (teamObj) targetOffice = teamObj.officeId;
    }

    const payload = {
      ...lead,
      assignedToOffice: targetOffice,
      assignedToTeam: targetTeam,
      assignedToAgent: targetAgent,
    };

    // Optimistic update keeps the panel snappy; the canonical row from the
    // server replaces it once the assign call returns (so updated_at,
    // assigned_by and any derived names match what the backend stored).
    setData((prev) => ({
      ...prev,
      leads: prev.leads.map((item) =>
        item.id === leadId
          ? {
              ...item,
              assignedToOffice: payload.assignedToOffice,
              assignedToTeam: payload.assignedToTeam,
              assignedToAgent: payload.assignedToAgent,
            }
          : item
      ),
    }));

    assignLeadApi(leadId, {
      officeId: payload.assignedToOffice,
      teamId:   payload.assignedToTeam,
      agentId:  payload.assignedToAgent,
    }).then((serverLead) => {
      if (!serverLead || !serverLead.id) return;
      setData((prev) => ({
        ...prev,
        leads: prev.leads.map((item) => (item.id === leadId ? { ...item, ...serverLead } : item)),
      }));
    }).catch((error) => {
      console.error('[App] failed to persist lead assignment', error);
      showNotification('Could not persist lead assignment to backend.');
    });
  };

  /**
   * Create an Office + (optional) Office Manager in a single backend call.
   *
   * The backend assigns canonical ULIDs and is the source of truth - we do
   * NOT fabricate IDs locally any more, otherwise subsequent updates would
   * target rows that don't exist on the server.
   */
  const createOfficeWithManager = async (newOfficeName, newManagerName, newManagerPassword) => {
    try {
      const { office, manager } = await createOffice({
        name:            newOfficeName,
        managerName:     newManagerName || undefined,
        managerPassword: newManagerPassword || undefined,
      });

      const newManager = manager
        ? {
            id:          manager.id,
            name:        manager.name,
            email:       manager.email,
            role:        ROLE.OFFICE_MANAGER,
            officeId:    manager.officeId,
            password:    newManagerPassword || null,
            loginLink:   makeLoginLink(manager.id, ROLE.OFFICE_MANAGER),
            isLoggedIn:  false,
            lastLoginAt: null,
          }
        : null;

      setData((prev) => ({
        ...prev,
        offices: [
          ...prev.offices,
          { id: office.id, name: office.name, managerId: manager ? manager.id : null },
        ],
        users: newManager ? [...prev.users, newManager] : prev.users,
      }));

      return newManager;
    } catch (error) {
      console.error('[App] createOfficeWithManager failed', error);
      showNotification(error.message || 'Could not create office.');
      return null;
    }
  };

  const assignOfficeManager = async (officeId, managerId) => {
    // Optimistic UI update first - keeps the panel snappy. On error we'll
    // surface a notification and reload-on-next-mount will reconcile.
    setData((prev) => ({
      ...prev,
      offices: prev.offices.map((office) =>
        office.id === officeId ? { ...office, managerId } : office
      ),
      users: prev.users.map((u) => (u.id === managerId ? { ...u, officeId } : u)),
    }));
    try {
      await assignOfficeManagerApi(officeId, managerId);
    } catch (error) {
      console.error('[App] assignOfficeManager failed', error);
      showNotification(error.message || 'Could not assign office manager.');
    }
  };

  const assignTeamLeader = (teamId, leaderId) => {
    setData((prev) => ({
      ...prev,
      teams: prev.teams.map((team) => (team.id === teamId ? { ...team, leaderId } : team)),
      users: prev.users.map((u) =>
        u.id === leaderId
          ? { ...u, teamId, officeId: prev.teams.find((t) => t.id === teamId)?.officeId || u.officeId }
          : u
      ),
    }));
  };

  /**
   * Create a Team + (optional) Team Leader. Server assigns IDs.
   */
  const createTeamLeader = async (officeId, teamName, leaderName, leaderPassword, teamSize) => {
    try {
      const { team, leader } = await createTeam({
        officeId,
        name:           teamName,
        maxSize:        Number(teamSize) || 8,
        leaderName:     leaderName || undefined,
        leaderPassword: leaderPassword || undefined,
      });

      const newLeader = leader
        ? {
            id:          leader.id,
            name:        leader.name,
            email:       leader.email,
            role:        ROLE.TEAM_LEADER,
            officeId:    leader.officeId,
            teamId:      leader.teamId,
            password:    leaderPassword || null,
            loginLink:   makeLoginLink(leader.id, ROLE.TEAM_LEADER),
            isLoggedIn:  false,
            lastLoginAt: null,
          }
        : null;

      setData((prev) => ({
        ...prev,
        teams: [
          ...prev.teams,
          {
            id:       team.id,
            name:     team.name,
            officeId: team.officeId,
            leaderId: leader ? leader.id : null,
            maxSize:  team.maxSize,
          },
        ],
        users: newLeader ? [...prev.users, newLeader] : prev.users,
      }));

      return newLeader;
    } catch (error) {
      console.error('[App] createTeamLeader failed', error);
      showNotification(error.message || 'Could not create team.');
      return null;
    }
  };

  /**
   * Create an Agent inside a team. Server enforces team capacity (409 if
   * full); we mirror that check client-side for instant feedback but the
   * backend is the source of truth.
   */
  const createAgent = async (teamId, agentName, agentPassword) => {
    const team = data.teams.find((t) => t.id === teamId);
    if (!team) return null;
    const currentCount = getTeamAgentCount(teamId, data.users);
    if (currentCount >= (team.maxSize || 0)) {
      showNotification(`Team ${team.name} is at capacity.`);
      return null;
    }

    try {
      const created = await createAgentApi({
        teamId,
        name:     agentName,
        password: agentPassword,
      });

      const newAgent = {
        id:          created.id,
        name:        created.name,
        email:       created.email,
        role:        ROLE.AGENT,
        officeId:    created.officeId,
        teamId:      created.teamId,
        password:    agentPassword || null,
        loginLink:   makeLoginLink(created.id, ROLE.AGENT),
        isLoggedIn:  false,
        lastLoginAt: null,
      };

      setData((prev) => ({
        ...prev,
        users: [...prev.users, newAgent],
      }));

      return newAgent;
    } catch (error) {
      console.error('[App] createAgent failed', error);
      showNotification(error.message || 'Could not create agent.');
      return null;
    }
  };

  /**
   * Toggle a staff account's Suspended/Active status. Used by the staff
   * tables in SuperAdminPanel + role panels. The argument shape is
   * (staffId, isCurrentlyBlocked) so the panels don't need to know about
   * the API verb.
   */
  const toggleStaffBlocked = async (staffId, currentlyBlocked) => {
    try {
      const fn = currentlyBlocked ? unblockStaffApi : blockStaffApi;
      const updated = await fn(staffId);
      setData((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.id === staffId ? { ...u, status: updated.status } : u
        ),
      }));
      return updated;
    } catch (error) {
      console.error('[App] toggleStaffBlocked failed', error);
      showNotification(error.message || 'Could not update staff status.');
      return null;
    }
  };

  const assignAgent = (agentId, teamId) => {
    setData((prev) => ({
      ...prev,
      users: prev.users.map((u) =>
        u.id === agentId
          ? { ...u, teamId, officeId: prev.teams.find((t) => t.id === teamId)?.officeId || u.officeId }
          : u
      ),
    }));
  };

  const setUserLoginState = (userId, isLoggedIn) => {
    const now = new Date().toISOString();
    setData((prev) => {
      const targetUser = prev.users.find(u => u.id === userId);
      const lastLoginAt = isLoggedIn ? now : (targetUser?.lastLoginAt || null);
      const updatedUsers = prev.users.map((u) => {
        if (u.id !== userId) return u;
        const sessions = Array.isArray(u.loginSessions) ? [...u.loginSessions] : [];
        if (isLoggedIn) {
          sessions.push({ loginAt: now, logoutAt: null, durationMs: 0 });
        } else {
          for (let i = sessions.length - 1; i >= 0; i -= 1) {
            if (!sessions[i].logoutAt) {
              const loginAt = new Date(sessions[i].loginAt).getTime();
              const logoutAt = new Date(now).getTime();
              sessions[i] = { ...sessions[i], logoutAt: now, durationMs: Math.max(0, logoutAt - loginAt) };
              break;
            }
          }
        }
        return { ...u, isLoggedIn, lastLoginAt, loginSessions: sessions.slice(-50) };
      });

      return { ...prev, users: updatedUsers };
    });

  };

  /**
   * Create a brand-new lead via the live backend.
   *
   * The backend assigns a canonical ULID, auto-defaults office/team to the
   * caller's scope when omitted (so OM/TL can't accidentally create leads
   * outside their silo), seeds an initial status_history row for the
   * starting stage, and writes an audit_log entry - all in one transaction.
   *
   * Returns the canonical server lead (already shape-mapped to camelCase)
   * or null on failure. Surfaces errors via showNotification rather than
   * throwing, so callers can branch on `if (created) ...` cleanly.
   */
  const createLead = async (payload) => {
    try {
      const serverLead = await createLeadApi(payload);
      if (!serverLead || !serverLead.id) {
        showNotification('Lead creation returned no row.');
        return null;
      }
      setData((prev) => {
        const normalized = normalizeLeadAssignment(serverLead, prev.users, prev.teams);
        return { ...prev, leads: [normalized, ...prev.leads] };
      });
      const display = serverLead.name || `${serverLead.firstName || ''} ${serverLead.lastName || ''}`.trim();
      showNotification(`Lead "${display || serverLead.id}" created.`);
      return serverLead;
    } catch (error) {
      console.error('[App] createLead failed', error);
      showNotification(error.message || 'Could not create lead.');
      return null;
    }
  };

  const updateLead = (leadId, updates) => {
    const { _actorName, _actorId, ...rest } = updates;
    setData((prev) => ({
      ...prev,
      leads: prev.leads.map((lead) => {
        if (lead.id !== leadId) return lead;
        const actorName = _actorName
          || getUserName(_actorId || lead.assignedToAgent, prev.users)
          || 'Unknown';
        // Append comment to history when comment text supplied (not commentHistory directly)
        const nextHistory = Array.isArray(rest.commentHistory)
          ? rest.commentHistory
          : (lead.commentHistory || []).slice();
        if (rest.comment && !Array.isArray(rest.commentHistory)) {
          nextHistory.push({
            text: rest.comment,
            by: actorName,
            date: rest.lastCommentDate || new Date().toISOString().slice(0, 10),
          });
        }
        // Track status changes in statusHistory
        const prevStatusHistory = Array.isArray(lead.statusHistory) ? lead.statusHistory : [];
        let nextStatusHistory = prevStatusHistory;
        if (rest.stage && rest.stage !== lead.stage) {
          nextStatusHistory = [...prevStatusHistory, {
            from: lead.stage || 'New',
            to: rest.stage,
            by: _actorId || lead.assignedToAgent || null,
            byName: actorName,
            at: new Date().toISOString(),
          }].slice(-100);
        }
        return { ...lead, ...rest, commentHistory: nextHistory, statusHistory: nextStatusHistory };
      }),
    }));

    updateLeadApi(leadId, rest).then((serverLead) => {
      // Replace optimistic row with the canonical server row so the
      // commentHistory / statusHistory UI always reflects the source of truth.
      if (!serverLead || !serverLead.id) return;
      setData((prev) => ({
        ...prev,
        leads: prev.leads.map((item) => (item.id === leadId ? { ...item, ...serverLead } : item)),
      }));
    }).catch((error) => {
      console.error('[App] updateLead failed', error);
      showNotification('Failed to save lead update to backend.');
    });
  };

  return (
    <div className="aax-admin-app">
      {notification && (
        <div className="aax-toast-notification">
          {notification}
        </div>
      )}
      <ErrorBoundary>
        <Routes>
          <Route path="" element={<BackofficeLanding />} />

          {/* Dedicated, separate login routes per role (button-only login) */}
          <Route path="login" element={<Navigate to="/admin" replace />} />
          <Route path="login/super-admin"    element={<RoleLogin role={ROLE.SUPER_ADMIN}    onAdminLogin={addAdminToData} />} />
          <Route path="login/office-manager" element={<RoleLogin role={ROLE.OFFICE_MANAGER} onAdminLogin={addAdminToData} />} />
          <Route path="login/team-leader"    element={<RoleLogin role={ROLE.TEAM_LEADER}    onAdminLogin={addAdminToData} />} />
          <Route path="login/agent"          element={<RoleLogin role={ROLE.AGENT}          onAdminLogin={addAdminToData} />} />

          {/* Bare role paths redirect to that role's dedicated login */}
          <Route path="super-admin"    element={<Navigate to="/admin/login/super-admin" replace />} />
          <Route path="office-manager" element={<Navigate to="/admin/login/office-manager" replace />} />
          <Route path="team-leader"    element={<Navigate to="/admin/login/team-leader" replace />} />
          <Route path="agent"          element={<Navigate to="/admin/login/agent" replace />} />

          {/* Legacy combined staff login retained for backward compatibility */}
          <Route path="staff-login" element={<StaffLogin onAdminLogin={addAdminToData} />} />

          <Route path="super-admin/:userId/*" element={<RolePage role={ROLE.SUPER_ADMIN} data={data} dataLoading={dataLoading} setData={setData} setLeadAssignment={setLeadAssignment} assignOfficeManager={assignOfficeManager} createOfficeWithManager={createOfficeWithManager} createTeamLeader={createTeamLeader} createAgent={createAgent} toggleStaffBlocked={toggleStaffBlocked} setUserLoginState={setUserLoginState} updateLead={updateLead} createLead={createLead} showNotification={showNotification} />} />
          <Route path="office-manager/:userId/*" element={<RolePage role={ROLE.OFFICE_MANAGER} data={data} dataLoading={dataLoading} setData={setData} setLeadAssignment={setLeadAssignment} assignTeamLeader={assignTeamLeader} createTeamLeader={createTeamLeader} createAgent={createAgent} updateLead={updateLead} createLead={createLead} setUserLoginState={setUserLoginState} showNotification={showNotification} />} />
          <Route path="team-leader/:userId/*" element={<RolePage role={ROLE.TEAM_LEADER} data={data} dataLoading={dataLoading} setData={setData} setLeadAssignment={setLeadAssignment} assignAgent={assignAgent} updateLead={updateLead} createLead={createLead} setUserLoginState={setUserLoginState} showNotification={showNotification} />} />
          <Route path="agent/:userId/*" element={<RolePage role={ROLE.AGENT} data={data} dataLoading={dataLoading} setData={setData} setUserLoginState={setUserLoginState} updateLead={updateLead} createLead={createLead} showNotification={showNotification} />} />

          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </ErrorBoundary>
    </div>
  );
}

export default App;
