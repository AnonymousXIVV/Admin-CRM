import React from 'react';
import { useConfirmDialog } from './components/ConfirmModal/ConfirmModal';
import './components/DepositRequests/deposit-modal.css';
import { CountrySelect, PhoneInput, isPhoneValid, parseStoredPhone, buildStoredPhone } from './components/CountryPhoneInput/CountryPhoneInput';
import { COUNTRY_LIST, getCountryByCode, getCountryByName } from './countryData';
import { fetchLeadById } from './adminApi';

export const ROLE = {
  SUPER_ADMIN: 'Super Admin',
  OFFICE_MANAGER: 'Office Manager',
  TEAM_LEADER: 'Team Leader',
  AGENT: 'Agent',
};

export function assignableAgents(users, currentUser, { officeId = null, teamId = null } = {}) {
  return (users || []).filter((u) => {
    if (u.role !== ROLE.AGENT) return false;
    if (officeId && u.officeId !== officeId) return false;
    if (teamId && u.teamId !== teamId) return false;
    return true;
  });
}

export function assignableAgentLabel(agent) {
  return agent?.name || '-';
}

export const LEAD_STATUSES = ['New','In Line','No Answer','Deposit','Failed Deposit','Didn\'t Register','Not Interested','Low Potential','NA1','NA2','NA3','Never Answer','No Potential','Wrong Person','Wrong Number','Call Back'];

// Distinct color per lead stage so every pill in the status workflow timeline
// has its own identity instead of falling back to a generic gray. Also covers
// the 'Trades ON'/'Trades OFF' sentinel entries the backend writes to status
// history when the Trades Feature toggle is flipped.
export const STAGE_COLOR_MAP = {
  'New':              '#8ab89a',
  'In Line':          '#7a9bc4',
  'No Answer':        '#c9a86a',
  'Deposit':          '#7fb89a',
  'Failed Deposit':   '#d98a8a',
  "Didn't Register":  '#a89cc4',
  'Not Interested':   '#c89aa0',
  'Low Potential':    '#c9b56a',
  'NA1':              '#7eb5c0',
  'NA2':              '#6ea0ad',
  'NA3':              '#5e8a9a',
  'Never Answer':     '#c98a8a',
  'No Potential':     '#b07070',
  'Wrong Person':     '#c489a8',
  'Wrong Number':     '#b888c4',
  'Call Back':        '#7eb59a',
  'Trades ON':        '#7fb89a',
  'Trades OFF':       '#c9a86a',
};

// Stable fallback palette for any unknown / future stage so we never grey-out.
// We hash the stage name to pick a palette slot deterministically.
const STAGE_FALLBACK_PALETTE = [
  '#a89cc4', '#7eb5b0', '#c9a085', '#7a9bc4', '#c9b56a',
  '#a0b88a', '#c98a8a', '#7eb5c0', '#b89cc4', '#d98a8a',
];

export const stageColor = (stage) => {
  if (!stage) return STAGE_FALLBACK_PALETTE[0];
  if (STAGE_COLOR_MAP[stage]) return STAGE_COLOR_MAP[stage];
  let hash = 0;
  for (let i = 0; i < stage.length; i += 1) {
    hash = (hash * 31 + stage.charCodeAt(i)) >>> 0;
  }
  return STAGE_FALLBACK_PALETTE[hash % STAGE_FALLBACK_PALETTE.length];
};

export const normalizeStage = (stage) => {
  if (!stage || typeof stage !== 'string') return 'Unknown';
  const normalized = stage.trim();
  if (normalized.toLowerCase() === 'contacted') {
    // 'Contacted' is intentionally removed as a visible status in Agent Portfolio.
    return 'In Line';
  }
  return normalized;
};

export const NotificationContext = React.createContext(null);
export const DataContext = React.createContext(null);

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 30, color: '#fff', background: '#2A2E36', minHeight: '100vh' }}>
          <h1>Something went wrong</h1>
          <p>{this.state.error?.message || 'Unexpected error.'}</p>
          <p>Check console for details.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export const makeLoginLink = (userId, role) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (!role || role === ROLE.SUPER_ADMIN) return `${origin}/admin/login/super-admin`;
  if (role === ROLE.OFFICE_MANAGER) return `${origin}/admin/login/office-manager`;
  if (role === ROLE.TEAM_LEADER) return `${origin}/admin/login/team-leader`;
  if (role === ROLE.AGENT) return `${origin}/admin/login/agent`;
  return `${origin}/admin/staff-login`;
};

/**
 * initialData
 *
 * Empty bootstrap state. The admin app is now backend-driven: offices, teams,
 * staff (admins/agents) and leads come from the SQLite database via the admin
 * API on every mount. We intentionally do NOT seed any mock offices, teams,
 * agents, or leads here - those would otherwise drown out the real records
 * the user creates and persists through the CRM panels.
 */
export const initialData = {
  users:            [],
  offices:          [],
  teams:            [],
  leads:            [],
  deletedLeads:     [],
};

export const getOfficeName = (officeId, offices) => offices.find((o) => o.id === officeId)?.name || '-';
export const getTeamName = (teamId, teams) => teams.find((t) => t.id === teamId)?.name || '-';
export const getUserName = (userId, users) => users.find((u) => u.id === userId)?.name || '-';

export const normalizeLeadAssignment = (lead, users, teams) => {
  if (!lead) return lead;
  const normalized = { ...lead };
  const agent = normalized.assignedToAgent ? users.find((u) => u.id === normalized.assignedToAgent) : null;
  const team = normalized.assignedToTeam ? teams.find((t) => t.id === normalized.assignedToTeam) : null;

  if (agent) {
    normalized.assignedToTeam = agent.teamId || null;
    normalized.assignedToOffice = agent.officeId || null;
  } else if (team) {
    normalized.assignedToOffice = team.officeId || null;
  }

  if (normalized.assignedToTeam) {
    const teamFromLead = teams.find((t) => t.id === normalized.assignedToTeam);
    if (teamFromLead) {
      normalized.assignedToOffice = teamFromLead.officeId || normalized.assignedToOffice;
    }
  }

  return normalized;
};

export const getCountryFlag = (code, countryName) => {
  const countryCode = code || getCountryByName(countryName)?.code || '';
  if (!countryCode || typeof countryCode !== 'string') {
    return <span className="aax-flag-fallback" title={countryName || 'Unknown'}>[unknown]</span>;
  }
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return <span className="aax-flag-fallback" title={countryName || countryCode}>{countryCode}</span>;
  }
  const emoji = normalized
    .split('')
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join('');
  const url = `https://flagcdn.com/24x18/${normalized.toLowerCase()}.png`;
  return (
    <span className="aax-country-flag-wrapper" title={countryName || normalized}>
      <span className="aax-flag-emoji" aria-label={`Flag of ${countryName || normalized}`} role="img">{emoji}</span>
      <img
        className="aax-flag-image"
        src={url}
        alt={countryName || normalized}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    </span>
  );
};
export const getTeamAgentCount = (teamId, users) => users.filter((u) => u.role === ROLE.AGENT && u.teamId === teamId).length;
export const countByRole = (users, role) => users.filter((u) => u.role === role).length;
export const countOnlineByRole = (users, role) => users.filter((u) => u.role === role && u.isLoggedIn).length;

export const formatLeadId = (id) => {
  if (!id || typeof id !== 'string') return '#00000';
  const match = id.match(/(\d+)/);
  const num = match ? Number(match[1]) : NaN;
  if (Number.isNaN(num)) return '#00000';
  return `#${String(num).padStart(5, '0')}`;
};

export const statusClass = (stage) => {
  const key = stage
    ?.toLowerCase()
    ?.replace(/[^a-z0-9]+/g, '-')
    ?.replace(/^-+|-+$/g, '') || 'unknown';
  return `aax-status-${key}`;
};


// --- Edit Lead modal: lets super admin / staff edit core lead fields. ---
function leadPasswordStrength(pw) {
  if (!pw) return { level: 0, label: 'Empty' };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1;
  if (/\d/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
  return { level: score, label: labels[score] };
}

function generateLeadPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const pool = upper + lower + digits + symbols;
  const pick = (s) => s[Math.floor(Math.random() * s.length)];
  let pwd = pick(upper) + pick(lower) + pick(digits) + pick(symbols);
  for (let i = 0; i < 10; i += 1) pwd += pick(pool);
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

export function EditLeadModal({ lead, onClose, onSave }) {
  const [originalPassword, setOriginalPassword] = React.useState(lead?.clientPassword || '');
  const [firstName, setFirstName] = React.useState(lead?.firstName || '');
  const [lastName, setLastName] = React.useState(lead?.lastName || '');
  const [email, setEmail] = React.useState(lead?.email || '');
  const [clientPassword, setClientPassword] = React.useState(lead?.clientPassword || '');
  const [showPwd, setShowPwd] = React.useState(false);
  const [formError, setFormError] = React.useState('');
  const [pwFetching, setPwFetching] = React.useState(false);

  React.useEffect(() => {
    if (!lead?.id) return;
    let cancelled = false;
    setPwFetching(true);
    fetchLeadById(lead.id)
      .then((fresh) => {
        if (cancelled) return;
        const freshPwd = fresh?.clientPassword || '';
        setOriginalPassword(freshPwd);
        setClientPassword((prev) => {
          const initVal = lead?.clientPassword || '';
          return prev === initVal ? freshPwd : prev;
        });
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPwFetching(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  const initCountry = React.useMemo(
    () => getCountryByCode(lead?.countryCode) || getCountryByName(lead?.country) || null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  const [selectedCountry, setSelectedCountry] = React.useState(initCountry);

  const initPhone = React.useMemo(() => {
    const parsed = parseStoredPhone(lead?.phone || '');
    const countryCode = parsed.countryCode
      || initCountry?.code
      || '';
    return { countryCode, number: parsed.number };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [phoneCountryCode, setPhoneCountryCode] = React.useState(initPhone.countryCode);
  const [phoneNumber, setPhoneNumber] = React.useState(initPhone.number);

  if (!lead) return null;

  const pwStrength = leadPasswordStrength(clientPassword);
  const passwordChanged = clientPassword !== originalPassword;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = email.trim();
    if (!trimmedFirst || !trimmedLast || !trimmedEmail) {
      setFormError('First name, last name and email are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    setFormError('');
    const fullPhone = buildStoredPhone(phoneCountryCode, phoneNumber);
    const payload = {
      firstName: trimmedFirst,
      lastName: trimmedLast,
      name: `${trimmedFirst} ${trimmedLast}`,
      email: trimmedEmail,
      phone: fullPhone,
      country: selectedCountry?.name || '',
      countryCode: selectedCountry?.code || '',
    };
    if (passwordChanged) {
      payload.clientPassword = clientPassword;
    }
    onSave(payload);
  };

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, overflowY: 'auto', padding: '24px 16px', WebkitOverflowScrolling: 'touch' };
  const card = { background: '#363B44', border: '1px solid #444A55', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', color: '#EAECEF', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', boxSizing: 'border-box', margin: 'auto' };
  const labelStyle = { display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 6, marginTop: 12 };
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #444A55', background: '#363B44', color: '#EAECEF', fontSize: 14, boxSizing: 'border-box' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Edit Lead Profile</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#848E9C', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ margin: '0 0 8px 0', color: '#848E9C', fontSize: 13 }}>Changes here propagate everywhere this lead is shown.</p>
        {formError && (
          <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.45)', color: '#FF6B61', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>First Name</label>
              <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Last Name</label>
              <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <label style={labelStyle}>Email</label>
          <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label style={labelStyle}>Country</label>
          <CountrySelect
            value={selectedCountry?.code || ''}
            onChange={(c) => setSelectedCountry(c)}
          />
          <label style={labelStyle}>Phone</label>
          <PhoneInput
            countryCode={phoneCountryCode}
            onCountryCodeChange={(code) => {
              setPhoneCountryCode(code);
              if (!selectedCountry) {
                const c = COUNTRY_LIST.find(x => x.code === code);
                if (c) setSelectedCountry(c);
              }
            }}
            number={phoneNumber}
            onNumberChange={setPhoneNumber}
          />
          <div className="aax-pw-field" style={{ marginTop: 16 }}>
            <div className="aax-pw-field-head">
              <label className="aax-pw-field-label" htmlFor="aax-lead-pw-input">
                Account password
              </label>
              <button
                type="button"
                className="aax-pw-generate"
                onClick={() => { setClientPassword(generateLeadPassword()); setShowPwd(true); }}
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
                id="aax-lead-pw-input"
                className="aax-pw-input"
                type={showPwd ? 'text' : 'password'}
                value={clientPassword}
                onChange={(e) => setClientPassword(e.target.value)}
                placeholder="Set / change account password"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="aax-pw-toggle"
                onClick={() => setShowPwd(s => !s)}
                title={showPwd ? 'Hide password' : 'Show password'}
                aria-label={showPwd ? 'Hide password' : 'Show password'}
              >
                {showPwd ? (
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
              <div className="aax-pw-strength" data-level={pwStrength.level}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={'aax-pw-bar' + (i < pwStrength.level ? ' is-on' : '')}
                  />
                ))}
              </div>
              <span className="aax-pw-hint" style={passwordChanged ? { color: '#F0B90B' } : {}}>
                {pwFetching
                  ? 'Loading current password...'
                  : passwordChanged
                    ? `Will update  /  ${pwStrength.label}  /  ${clientPassword.length} chars`
                    : clientPassword
                      ? 'Unchanged - edit to update'
                      : 'Use 12+ chars with letters, numbers, and a symbol'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #444A55', background: 'transparent', color: '#EAECEF', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#F0B90B', color: '#2A2E36', fontWeight: 700, cursor: 'pointer' }}>Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Shared modal primitives (used by Edit*Modal below) ---
function _EyeIcon({ visible }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {visible ? (
        <><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a19.77 19.77 0 0 1 4.22-5.22"/><path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a19.86 19.86 0 0 1-3.17 4.19"/><path d="M14.12 14.12A3 3 0 1 1 9.88 9.88"/><line x1="1" y1="1" x2="23" y2="23"/></>
      ) : (
        <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></>
      )}
    </svg>
  );
}

function _CopyBtn({ link }) {
  const [copied, setCopied] = React.useState(false);
  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied!' : 'Copy link'}
      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 4, border: '1px solid #444A55', background: copied ? 'rgba(14,203,129,0.12)' : '#2A2E36', color: copied ? '#0ECB81' : '#848E9C', cursor: 'pointer', padding: 0, transition: 'color 0.15s, background 0.15s' }}
    >
      {copied
        ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      }
    </button>
  );
}

function _PwField({ value, onChange, readOnly, placeholder, autoComplete }) {
  const [show, setShow] = React.useState(false);
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid #444A55', borderRadius: 4, background: '#2A2E36', overflow: 'hidden' }}>
      <input
        style={{ flex: 1, width: 'auto', padding: '7px 10px', border: 'none', background: 'transparent', color: value ? '#EAECEF' : '#5E6673', fontSize: 13, minWidth: 0, outline: 'none', boxShadow: 'none', fontStyle: value ? 'normal' : 'italic' }}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        title={show ? 'Hide' : 'Reveal'}
        disabled={!value && readOnly}
        style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, background: 'none', border: 'none', borderLeft: '1px solid #444A55', color: (!value && readOnly) ? '#3A3F4A' : '#848E9C', cursor: (!value && readOnly) ? 'default' : 'pointer', padding: 0 }}
      >
        <_EyeIcon visible={show} />
      </button>
    </div>
  );
}

function _PwSection({ currentPassword, newPassword, onNewPasswordChange, newPasswordLabel }) {
  const hasStored = !!currentPassword;
  return (
    <>
      <div style={_fg}>
        <label style={_lbl}>Current Password</label>
        <_PwField value={currentPassword} readOnly placeholder="not recorded" />
        {!hasStored && (
          <p style={{ margin: '4px 0 0', fontSize: 11, color: '#848E9C', lineHeight: 1.4 }}>
            This account's password predates our records. Set a new one below to store it going forward.
          </p>
        )}
      </div>
      <div style={_fg}>
        <label style={_lbl}>
          {newPasswordLabel || 'New Password'}{' '}
          <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(blank = keep current)</span>
        </label>
        <_PwField value={newPassword} onChange={onNewPasswordChange} placeholder="Enter new password..." autoComplete="new-password" />
      </div>
    </>
  );
}

function _SectionDivider({ label, blockBtn }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #444A55', margin: '14px 0 10px', paddingTop: 10 }}>
      <span style={{ fontSize: 10, color: '#848E9C', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{label}</span>
      {blockBtn}
    </div>
  );
}

function _BlockBtn({ isBlocked, onBlock }) {
  return (
    <button
      type="button"
      onClick={onBlock}
      style={{ padding: '2px 8px', borderRadius: 4, border: `1px solid ${isBlocked ? 'rgba(14,203,129,0.35)' : 'rgba(246,70,93,0.35)'}`, background: isBlocked ? 'rgba(14,203,129,0.1)' : 'rgba(246,70,93,0.1)', color: isBlocked ? '#0ECB81' : '#F6465D', fontSize: 11, cursor: 'pointer', fontWeight: 600, lineHeight: 1.4 }}
    >
      {isBlocked ? 'Unblock' : 'Block'}
    </button>
  );
}

const _fg = { marginBottom: 8 };
const _lbl = { display: 'block', fontSize: 11, color: '#848E9C', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
const _lnkRow = { display: 'flex', alignItems: 'center', gap: 4 };
const _lnkInput = { flex: 1, width: 'auto', padding: '7px 10px', borderRadius: 4, border: '1px solid #444A55', background: '#2A2E36', color: '#848E9C', fontSize: 11, minWidth: 0, outline: 'none', cursor: 'default', boxShadow: 'none' };
const _errBox = { background: 'rgba(246,70,93,0.1)', border: '1px solid rgba(246,70,93,0.35)', color: '#F6465D', padding: '6px 10px', borderRadius: 4, fontSize: 12, marginBottom: 10 };

// --- Edit Office modal ---
export function EditOfficeModal({ office, officeManager, isManagerBlocked, onBlock, onClose, onSave }) {
  const [officeName, setOfficeName] = React.useState(office?.name || '');
  const [managerName, setManagerName] = React.useState(officeManager?.name || '');
  const [managerEmail, setManagerEmail] = React.useState(officeManager?.email || '');
  const [newPassword, setNewPassword] = React.useState('');
  const [error, setError] = React.useState('');

  if (!office) return null;

  const currentPassword = officeManager?.password || officeManager?.clientPassword || '';
  const loginLink = officeManager ? (officeManager.loginLink || makeLoginLink(officeManager.id, ROLE.OFFICE_MANAGER)) : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedOfficeName = officeName.trim();
    if (!trimmedOfficeName) { setError('Office name is required.'); return; }
    const trimmedEmail = managerEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Login email is not valid.'); return; }
    setError('');
    onSave({
      officeName: trimmedOfficeName,
      managerName: managerName.trim() || undefined,
      managerEmail: trimmedEmail || undefined,
      managerPassword: newPassword.trim() || undefined,
    });
  };

  return (
    <div className="aax-modal-overlay" onClick={onClose}>
      <div className="aax-modal-content" style={{ maxWidth: 390 }} onClick={e => e.stopPropagation()}>
        <div className="aax-modal-header">
          <span className="aax-modal-title">Edit Office</span>
          <button type="button" className="aax-modal-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="aax-modal-body" style={{ padding: '14px 18px' }}>
            {error && <div style={_errBox}>{error}</div>}
            <div style={_fg}>
              <label style={_lbl}>Office Name</label>
              <input value={officeName} onChange={e => setOfficeName(e.target.value)} required autoFocus />
            </div>

            {officeManager ? (
              <>
                <_SectionDivider
                  label="Office Manager"
                  blockBtn={onBlock && <_BlockBtn isBlocked={isManagerBlocked} onBlock={onBlock} />}
                />
                <div style={_fg}>
                  <label style={_lbl}>Manager Name</label>
                  <input value={managerName} onChange={e => setManagerName(e.target.value)} />
                </div>
                <div style={_fg}>
                  <label style={_lbl}>Login Email</label>
                  <input type="email" value={managerEmail} onChange={e => setManagerEmail(e.target.value)} placeholder="manager@example.com" autoComplete="off" />
                </div>
                <_PwSection
                  currentPassword={currentPassword}
                  newPassword={newPassword}
                  onNewPasswordChange={e => setNewPassword(e.target.value)}
                />
                <div style={_fg}>
                  <label style={_lbl}>Login Link</label>
                  <div style={_lnkRow}>
                    <input style={_lnkInput} value={loginLink || ''} readOnly />
                    <_CopyBtn link={loginLink} />
                  </div>
                </div>
              </>
            ) : (
              <p style={{ margin: '8px 0 0', color: '#848E9C', fontSize: 12 }}>No manager assigned yet.</p>
            )}
          </div>
          <div className="aax-modal-footer">
            <button type="button" className="aax-modal-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="aax-modal-btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Edit Team modal ---
export function EditTeamModal({ team, offices, teamLeader, isLeaderBlocked, onBlock, onClose, onSave }) {
  const [name, setName] = React.useState(team?.name || '');
  const [maxSize, setMaxSize] = React.useState(team?.maxSize != null ? String(team.maxSize) : '');
  const [officeId, setOfficeId] = React.useState(team?.officeId || '');
  const [leaderName, setLeaderName] = React.useState(teamLeader?.name || '');
  const [leaderEmail, setLeaderEmail] = React.useState(teamLeader?.email || '');
  const [newPassword, setNewPassword] = React.useState('');
  const [error, setError] = React.useState('');
  if (!team) return null;

  const currentPassword = teamLeader?.password || teamLeader?.clientPassword || '';
  const loginLink = teamLeader ? (teamLeader.loginLink || makeLoginLink(teamLeader.id, ROLE.TEAM_LEADER)) : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Team name is required.'); return; }
    const trimmedEmail = leaderEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Login email is not valid.'); return; }
    setError('');
    const payload = { name: trimmedName };
    if (maxSize !== '') payload.maxSize = Number(maxSize);
    if (officeId) payload.officeId = officeId;
    if (leaderName.trim()) payload.leaderName = leaderName.trim();
    if (trimmedEmail) payload.leaderEmail = trimmedEmail;
    if (newPassword.trim()) payload.leaderPassword = newPassword.trim();
    onSave(payload);
  };

  return (
    <div className="aax-modal-overlay" onClick={onClose}>
      <div className="aax-modal-content" style={{ maxWidth: 390 }} onClick={e => e.stopPropagation()}>
        <div className="aax-modal-header">
          <span className="aax-modal-title">Edit Team</span>
          <button type="button" className="aax-modal-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="aax-modal-body" style={{ padding: '14px 18px' }}>
            {error && <div style={_errBox}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={_lbl}>Team Name</label>
                <input value={name} onChange={e => setName(e.target.value)} required autoFocus />
              </div>
              <div>
                <label style={_lbl}>Max Agents</label>
                <input type="number" min="1" value={maxSize} onChange={e => setMaxSize(e.target.value)} placeholder="No limit" />
              </div>
            </div>
            {offices && offices.length > 0 && (
              <div style={_fg}>
                <label style={_lbl}>Office</label>
                <select value={officeId} onChange={e => setOfficeId(e.target.value)}>
                  <option value="">- Keep current -</option>
                  {offices.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}

            {teamLeader ? (
              <>
                <_SectionDivider
                  label="Team Leader"
                  blockBtn={onBlock && <_BlockBtn isBlocked={isLeaderBlocked} onBlock={onBlock} />}
                />
                <div style={_fg}>
                  <label style={_lbl}>Leader Name</label>
                  <input value={leaderName} onChange={e => setLeaderName(e.target.value)} />
                </div>
                <div style={_fg}>
                  <label style={_lbl}>Login Email</label>
                  <input type="email" value={leaderEmail} onChange={e => setLeaderEmail(e.target.value)} placeholder="leader@example.com" autoComplete="off" />
                </div>
                <_PwSection
                  currentPassword={currentPassword}
                  newPassword={newPassword}
                  onNewPasswordChange={e => setNewPassword(e.target.value)}
                />
                <div style={_fg}>
                  <label style={_lbl}>Login Link</label>
                  <div style={_lnkRow}>
                    <input style={_lnkInput} value={loginLink || ''} readOnly />
                    <_CopyBtn link={loginLink} />
                  </div>
                </div>
              </>
            ) : (
              <p style={{ margin: '8px 0 0', color: '#848E9C', fontSize: 12 }}>No leader assigned yet.</p>
            )}
          </div>
          <div className="aax-modal-footer">
            <button type="button" className="aax-modal-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="aax-modal-btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Edit Agent modal ---
export function EditAgentModal({ agent, teams, isBlocked, onBlock, onClose, onSave }) {
  const [name, setName] = React.useState(agent?.name || '');
  const [agentEmail, setAgentEmail] = React.useState(agent?.email || '');
  const [newPassword, setNewPassword] = React.useState('');
  const [teamId, setTeamId] = React.useState(agent?.teamId || '');
  const [error, setError] = React.useState('');
  if (!agent) return null;

  const currentPassword = agent?.password || agent?.clientPassword || '';
  const loginLink = agent ? (agent.loginLink || makeLoginLink(agent.id, ROLE.AGENT)) : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Agent name is required.'); return; }
    const trimmedEmail = agentEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) { setError('Login email is not valid.'); return; }
    setError('');
    const payload = { name: trimmedName };
    if (trimmedEmail) payload.email = trimmedEmail;
    if (newPassword.trim()) payload.password = newPassword.trim();
    if (teamId) payload.teamId = teamId;
    onSave(payload);
  };

  return (
    <div className="aax-modal-overlay" onClick={onClose}>
      <div className="aax-modal-content" style={{ maxWidth: 390 }} onClick={e => e.stopPropagation()}>
        <div className="aax-modal-header">
          <span className="aax-modal-title">Edit Agent</span>
          <button type="button" className="aax-modal-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="aax-modal-body" style={{ padding: '14px 18px' }}>
            {error && <div style={_errBox}>{error}</div>}
            <div style={{ ...(_fg), display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                <label style={{ ..._lbl, margin: 0 }}>Agent Name</label>
                {onBlock && <_BlockBtn isBlocked={isBlocked} onBlock={onBlock} />}
              </div>
              <input value={name} onChange={e => setName(e.target.value)} required autoFocus />
            </div>
            <div style={_fg}>
              <label style={_lbl}>Login Email</label>
              <input type="email" value={agentEmail} onChange={e => setAgentEmail(e.target.value)} placeholder="agent@example.com" autoComplete="off" />
            </div>
            <_PwSection
              currentPassword={currentPassword}
              newPassword={newPassword}
              onNewPasswordChange={e => setNewPassword(e.target.value)}
            />
            <div style={_fg}>
              <label style={_lbl}>Login Link</label>
              <div style={_lnkRow}>
                <input style={_lnkInput} value={loginLink || ''} readOnly />
                <_CopyBtn link={loginLink} />
              </div>
            </div>
            {teams && teams.length > 0 && (
              <div style={_fg}>
                <label style={_lbl}>Team</label>
                <select value={teamId} onChange={e => setTeamId(e.target.value)}>
                  <option value="">- Keep current -</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="aax-modal-footer">
            <button type="button" className="aax-modal-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="aax-modal-btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Create Agent modal for delegated Team Leader / Agent portfolios ---
export function CreateAgentModal({ team, onClose, onCreate }) {
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPassword = password.trim();
    if (!trimmedName) { setError('Agent name is required.'); return; }
    if (!trimmedPassword) { setError('Agent password is required.'); return; }
    setError('');
    setSaving(true);
    try {
      const created = await onCreate(trimmedName, trimmedPassword);
      if (created) onClose();
      else setError('Could not create the agent.');
    } catch (createError) {
      setError(createError?.message || 'Could not create the agent.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="aax-modal-overlay" onClick={onClose}>
      <div className="aax-modal-content" style={{ maxWidth: 390 }} onClick={event => event.stopPropagation()}>
        <div className="aax-modal-header">
          <span className="aax-modal-title">Add Agent</span>
          <button type="button" className="aax-modal-close-btn" onClick={onClose} title="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="aax-modal-body" style={{ padding: '14px 18px' }}>
            {error && <div style={_errBox}>{error}</div>}
            <div style={_fg}>
              <label style={_lbl}>Team</label>
              <input value={team?.name || 'Current team'} readOnly />
            </div>
            <div style={_fg}>
              <label style={_lbl}>Agent Name</label>
              <input value={name} onChange={event => setName(event.target.value)} required autoFocus autoComplete="off" />
            </div>
            <div style={_fg}>
              <label style={_lbl}>Agent Password</label>
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="new-password" />
            </div>
          </div>
          <div className="aax-modal-footer">
            <button type="button" className="aax-modal-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="aax-modal-btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create Agent'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}


// --- Create Lead modal: spawn a new lead with optional team/agent target. ---
//
// Used by OfficeManagerPanel + TeamLeaderPanel. The backend auto-defaults the
// office/team to the caller's scope when those fields are omitted, so the
// modal only surfaces selectors for the levels the actor can choose. The
// SuperAdminPanel has its own (much richer) lead-import flow and does not
// use this modal.
export function CreateLeadModal({ scope, teamsForOffice = [], agents = [], onClose, onCreate }) {
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [selectedCountry, setSelectedCountry] = React.useState(null);
  const [phoneCountryCode, setPhoneCountryCode] = React.useState('');
  const [phoneNumber, setPhoneNumber] = React.useState('');
  const [funnel, setFunnel] = React.useState('');
  const [teamId, setTeamId] = React.useState(scope?.teamId || '');
  const [agentId, setAgentId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState('');

  React.useEffect(() => {
    if (selectedCountry && !phoneCountryCode) setPhoneCountryCode(selectedCountry.code);
  }, [selectedCountry, phoneCountryCode]);

  const filteredAgents = teamId
    ? agents.filter(a => a.teamId === teamId)
    : agents;
  const phoneValid = isPhoneValid(phoneCountryCode, phoneNumber);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const f = firstName.trim();
    const l = lastName.trim();
    const em = email.trim();
    if (!f || !l || !em) {
      setFormError('First name, last name and email are required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    setFormError('');
    setSubmitting(true);
    const fullPhone = buildStoredPhone(phoneCountryCode, phoneNumber);
    try {
      await onCreate({
        firstName:   f,
        lastName:    l,
        name:        `${f} ${l}`,
        email:       em,
        phone:       fullPhone,
        country:     selectedCountry?.name || '',
        countryCode: selectedCountry?.code || '',
        stage:       'New',
        funnel:      funnel.trim() || null,
        assignedToOffice: scope?.officeId || null,
        assignedToTeam:   teamId || scope?.teamId || null,
        assignedToAgent:  agentId || scope?.agentId || null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, overflowY: 'auto', padding: '24px 16px' };
  const card = { background: '#363B44', border: '1px solid #444A55', borderRadius: 12, padding: 24, width: '100%', maxWidth: 520, maxHeight: 'calc(100vh - 48px)', overflowY: 'auto', color: '#EAECEF', boxShadow: '0 24px 64px rgba(0,0,0,0.6)', boxSizing: 'border-box', margin: 'auto' };
  const labelStyle = { display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 6, marginTop: 12 };
  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #444A55', background: '#363B44', color: '#EAECEF', fontSize: 14, boxSizing: 'border-box' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>New Lead</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#848E9C', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ margin: '0 0 8px 0', color: '#848E9C', fontSize: 13 }}>
          {scope?.teamId
            ? 'Lead will be created inside your team.'
            : scope?.officeId
              ? 'Lead will be created inside your office. Pick a team and agent if you already know who should work it.'
              : 'Lead will be created in the unassigned pool.'}
        </p>
        {formError && (
          <div style={{ background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.45)', color: '#FF6B61', padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 8 }}>
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <label style={labelStyle}>Email *</label>
          <input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label style={labelStyle}>Country</label>
          <CountrySelect
            value={selectedCountry?.code || ''}
            onChange={(c) => setSelectedCountry(c)}
          />
          <label style={labelStyle}>Phone</label>
          <PhoneInput
            countryCode={phoneCountryCode}
            onCountryCodeChange={(code) => {
              setPhoneCountryCode(code);
              if (!selectedCountry) {
                const c = COUNTRY_LIST.find(x => x.code === code);
                if (c) setSelectedCountry(c);
              }
            }}
            number={phoneNumber}
            onNumberChange={setPhoneNumber}
          />
          <label style={labelStyle}>Funnel</label>
          <input style={inputStyle} value={funnel} onChange={(e) => setFunnel(e.target.value)} placeholder="organic, paid, etc." />
          {teamsForOffice.length > 0 && !scope?.teamId && (
            <>
              <label style={labelStyle}>Team (optional)</label>
              <select style={inputStyle} value={teamId} onChange={(e) => { setTeamId(e.target.value); setAgentId(''); }}>
                <option value="">- Unassigned -</option>
                {teamsForOffice.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </>
          )}
          {filteredAgents.length > 0 && (
            <>
              <label style={labelStyle}>Agent (optional)</label>
              <select style={inputStyle} value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                <option value="">- Unassigned -</option>
                {filteredAgents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
            <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #444A55', background: 'transparent', color: '#EAECEF', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting || !phoneValid} style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#F0B90B', color: '#2A2E36', fontWeight: 700, cursor: (submitting || !phoneValid) ? 'not-allowed' : 'pointer', opacity: (submitting || !phoneValid) ? 0.5 : 1 }}>
              {submitting ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Add Comment modal: append a single comment to a lead's thread. ---
//
// Used by OfficeManagerPanel + TeamLeaderPanel + (already in) AgentPanel.
// On submit, calls onSubmit(text) which is expected to call updateLead with
// `{ comment: text }`. The backend appends a row to lead_comments and bumps
// last_comment_date - the optimistic+canonical refresh in App.updateLead
// keeps the UI in sync.
export function AddCommentModal({ leadName, onClose, onSubmit }) {
  const [text, setText] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSubmitting(true);
    try {
      await onSubmit(t);
    } finally {
      setSubmitting(false);
    }
  };

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 };
  const card = { background: '#363B44', border: '1px solid #444A55', borderRadius: 12, padding: 24, width: '100%', maxWidth: 480, color: '#EAECEF', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Add Comment</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#848E9C', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        {leadName && (
          <p style={{ margin: '0 0 12px 0', color: '#848E9C', fontSize: 13 }}>
            Lead: <span style={{ color: '#EAECEF' }}>{leadName}</span>
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Type your note..."
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #444A55', background: '#363B44', color: '#EAECEF', fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #444A55', background: 'transparent', color: '#EAECEF', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting || !text.trim()} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#F0B90B', color: '#2A2E36', fontWeight: 700, cursor: (submitting || !text.trim()) ? 'not-allowed' : 'pointer', opacity: (submitting || !text.trim()) ? 0.5 : 1 }}>
              {submitting ? 'Saving...' : 'Save Comment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function KycDocRow({ userId, doc, onRemove }) {
  const [thumb, setThumb] = React.useState({ loading: true, url: null, isImage: false });
  const [downloading, setDownloading] = React.useState(false);

  React.useEffect(() => {
    if (!userId || !doc?.id) return undefined;
    let cancelled = false;
    let revoke = null;
    (async () => {
      try {
        const { fetchKycFileObjectUrl } = await import('./adminApi');
        const { url, isImage, revoke: r } = await fetchKycFileObjectUrl(userId, doc.id);
        if (cancelled) { r(); return; }
        revoke = r;
        setThumb({ loading: false, url, isImage });
      } catch (_) {
        if (!cancelled) setThumb({ loading: false, url: null, isImage: false });
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) revoke();
    };
  }, [userId, doc?.id]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { downloadKycFile } = await import('./adminApi');
      const ext = doc.kind === 'POA' ? 'pdf' : 'jpg';
      await downloadKycFile(userId, doc.id, `${doc.name || doc.label || doc.kind}.${ext}`);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  const docRow = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#2A2E36', border: '1px solid #444A55', borderRadius: 8, marginBottom: 8 };
  return (
    <div style={docRow}>
      <div style={{ width: 56, height: 56, borderRadius: 6, background: '#1E2329', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
        {thumb.loading ? <span style={{ fontSize: 11, color: '#848E9C' }}>...</span>
          : thumb.isImage && thumb.url ? <img src={thumb.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 22 }}>📄</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.name || doc.label}</div>
        <div style={{ fontSize: 12, color: '#848E9C' }}>{doc.docType || doc.kind}  /  {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : ''}</div>
      </div>
      <button type="button" disabled={downloading} onClick={handleDownload} className="dr-modal__btn dr-modal__btn--ghost" style={{ padding: '6px 12px', fontSize: 12, flex: 'none' }}>
        {downloading ? '...' : 'Download'}
      </button>
      {onRemove && (
        <button type="button" onClick={() => onRemove(doc.id)} style={{ padding: '6px 10px', borderRadius: 6, background: 'transparent', color: '#f6465d', border: '1px solid #f6465d', cursor: 'pointer', fontSize: 12 }}>Remove</button>
      )}
    </div>
  );
}

// --- KYC Review modal: review documents the lead has uploaded, approve/reject. ---
export function KycReviewModal({ lead, onClose, onUpdate, showNotification }) {
  const [status, setStatus] = React.useState(lead?.kycStatus || 'Not Submitted');
  const [notes, setNotes] = React.useState(lead?.kycNotes || '');
  const [documents, setDocuments] = React.useState(() => (
    Array.isArray(lead?.kycDocuments) ? lead.kycDocuments : []
  ));
  const [kycUser, setKycUser] = React.useState(null);
  const [confirmDialog, confirm] = useConfirmDialog();

  React.useEffect(() => {
    setStatus(lead?.kycStatus || 'Not Submitted');
    setNotes(lead?.kycNotes || '');
  }, [lead?.id, lead?.kycStatus, lead?.kycNotes]);

  React.useEffect(() => {
    if (!lead?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { getUserKyc } = await import('./adminApi');
        const { user, documents: docs } = await getUserKyc(lead.id);
        if (cancelled) return;
        if (user?.kyc_status) setStatus(user.kyc_status);
        if (Array.isArray(docs)) setDocuments(docs);
        setKycUser(user || null);
      } catch (_) {
        if (!cancelled) {
          setDocuments(Array.isArray(lead?.kycDocuments) ? lead.kycDocuments : []);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [lead?.id]);

  if (!lead) return null;

  const handleSave = () => {
    onUpdate({ kycStatus: status, kycNotes: notes });
    showNotification(`KYC status for ${lead.firstName} ${lead.lastName} set to ${status}.`);
    onClose();
  };

  const handleRemoveDoc = async (docId) => {
    const ok = await confirm({
      title: 'Remove document?',
      message: 'Remove this document from the lead? This cannot be undone.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    const next = documents.filter(d => d.id !== docId);
    onUpdate({ kycDocuments: next });
  };

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 };
  const card = { background: '#363B44', border: '1px solid #444A55', borderRadius: 12, padding: 28, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto', color: '#EAECEF' };

  return (
    <>
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>KYC Review  /  {lead.firstName} {lead.lastName}</h2>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#848E9C', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>

        {/* Personal Information from KYC Step 1 */}
        <div style={{ marginTop: 14, padding: 14, background: '#2A2E36', border: '1px solid #444A55', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#848E9C', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>
            Personal Information (Step 1)
          </div>
          {!(kycUser?.kyc_first_name || kycUser?.kyc_last_name || kycUser?.kyc_address || kycUser?.phone || kycUser?.kyc_dob) ? (
            <div style={{ fontSize: 13, color: '#848E9C', fontStyle: 'italic' }}>
              User has not submitted personal information yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px 16px', fontSize: 13 }}>
              <div>
                <span style={{ color: '#848E9C' }}>First Name: </span>
                <strong>{kycUser?.kyc_first_name || '-'}</strong>
              </div>
              <div>
                <span style={{ color: '#848E9C' }}>Last Name: </span>
                <strong>{kycUser?.kyc_last_name || '-'}</strong>
              </div>
              <div>
                <span style={{ color: '#848E9C' }}>Phone: </span>
                <strong>{kycUser?.phone || '-'}</strong>
              </div>
              <div>
                <span style={{ color: '#848E9C' }}>Date of Birth: </span>
                <strong>{kycUser?.kyc_dob || '-'}</strong>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <span style={{ color: '#848E9C' }}>Address: </span>
                <strong>
                  {[kycUser?.kyc_address, kycUser?.kyc_city, kycUser?.kyc_country].filter(Boolean).join(', ') || '-'}
                </strong>
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: '#848E9C', marginBottom: 6 }}>Submitted documents ({documents.length})</div>
          {documents.length === 0 ? (
            <div style={{ padding: 18, background: '#2A2E36', border: '1px dashed #444A55', borderRadius: 8, color: '#848E9C', textAlign: 'center', fontSize: 13 }}>
              No documents uploaded by this lead yet.
            </div>
          ) : (
            documents.map((doc) => (
              <KycDocRow
                key={doc.id}
                userId={lead.id}
                doc={doc}
                onRemove={handleRemoveDoc}
              />
            ))
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 6 }}>KYC Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #444A55', background: '#363B44', color: '#EAECEF' }}>
            <option value="Not Submitted">Not Submitted</option>
            <option value="Under Review">Under Review</option>
            <option value="Pending">Pending Review</option>
            <option value="Verified">Verified</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', fontSize: 12, color: '#848E9C', marginBottom: 6 }}>Admin notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #444A55', background: '#363B44', color: '#EAECEF', resize: 'vertical' }} placeholder="Notes about KYC decision (optional)" />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #444A55', background: 'transparent', color: '#EAECEF', cursor: 'pointer' }}>Close</button>
          <button type="button" onClick={handleSave} style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: '#F0B90B', color: '#2A2E36', fontWeight: 700, cursor: 'pointer' }}>Save Decision</button>
        </div>
      </div>
    </div>
    {confirmDialog}
    </>
  );
}

/**
 * Bulk Trades on/off action group, shared by every panel that has a leads
 * table with row selection (Super Admin, Office Manager, Team Leader).
 *
 * Props:
 *   selectedIds       string[]                - currently selected lead ids
 *   updateLead        (id, updates) => void   - same updateLead the panel passes
 *                                                to per-row edits; handles
 *                                                optimistic UI + backend sync
 *                                                + audit-trail entry server-side
 *   showNotification  (msg) => void           - toast/notification helper
 *   onDone            () => void              - clear selection callback (optional)
 *   actorName         string                  - current admin's display name
 *   actorId           string                  - current admin's id
 *
 * Disabling Trades is a destructive-ish action (cuts the client off from the
 * Trades section) so we always confirm. Enabling is silent - it just turns
 * access back on.
 */
/**
 * Compact pill that shows whether a lead currently has Trades access.
 * Defaults to "ON" when the field is missing (legacy rows) so admins
 * don't see "OFF" for clients we never explicitly disabled.
 */
export function TradesStatusBadge({ enabled }) {
  const on = enabled !== false;
  const style = on
    ? { background: 'rgba(14,203,129,0.12)', color: '#0ECB81', border: '1px solid #0ECB8140' }
    : { background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid #F59E0B40' };
  return (
    <span
      title={on ? 'Forex Lead - Trades section enabled' : 'Recovery Lead - Trades section disabled'}
      style={{ ...style, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
    >
      {on ? 'Forex' : 'Recovery'}
    </span>
  );
}

export function BulkTradesActions({ selectedIds, updateLead, showNotification, onDone, actorName, actorId }) {
  const count = selectedIds.length;
  const disabled = count === 0;
  const [confirmDialog, confirm] = useConfirmDialog();

  const apply = async (tradesEnabled) => {
    if (disabled) {
      showNotification('Select at least one lead first.');
      return;
    }
    if (!tradesEnabled) {
      const ok = await confirm({
        title: 'Disable Trades?',
        message:
          `Switch Trades OFF for ${count} client${count === 1 ? '' : 's'}? `
          + 'They will lose access to the Trades section in their dashboard until you turn it back on.',
        confirmLabel: 'Switch OFF',
        tone: 'warning',
      });
      if (!ok) return;
    }
    selectedIds.forEach((id) => {
      try {
        updateLead(id, { tradesEnabled, _actorName: actorName, _actorId: actorId });
      } catch (_) { /* per-row failure is surfaced by updateLead */ }
    });
    showNotification(
      tradesEnabled
        ? `Trades enabled for ${count} client${count === 1 ? '' : 's'}.`
        : `Trades disabled for ${count} client${count === 1 ? '' : 's'}.`
    );
    if (onDone) onDone();
  };

  const onStyle = {
    padding: '6px 10px',
    background: disabled ? 'rgba(14, 203, 129, 0.12)' : 'rgba(14, 203, 129, 0.18)',
    color: disabled ? '#5b8a76' : '#0ECB81',
    border: '1px solid rgba(14, 203, 129, 0.45)',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
  const offStyle = {
    ...onStyle,
    background: disabled ? 'rgba(240, 185, 11, 0.10)' : 'rgba(240, 185, 11, 0.16)',
    color: disabled ? '#8a7a3a' : '#F0B90B',
    border: '1px solid rgba(240, 185, 11, 0.4)',
  };

  return (
    <>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#848E9C', marginRight: 2 }}>Trades Feature:</span>
      <button
        type="button"
        onClick={() => apply(true)}
        disabled={disabled}
        style={onStyle}
        title="Switch Trades ON for the selected clients"
      >
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: disabled ? '#5b8a76' : '#0ECB81' }} />
        ON
      </button>
      <button
        type="button"
        onClick={() => apply(false)}
        disabled={disabled}
        style={offStyle}
        title="Switch Trades OFF for the selected clients"
      >
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: disabled ? '#8a7a3a' : '#F0B90B' }} />
        OFF
      </button>
    </div>
    {confirmDialog}
    </>
  );
}

/**
 * Compact pill that shows whether a lead currently has Cards access.
 * Mirrors TradesStatusBadge with a distinct violet accent so the two
 * feature flags don't visually collide in the same row.
 */
export function CardsStatusBadge({ enabled }) {
  const on = enabled !== false;
  const style = on
    ? { background: 'rgba(155,109,255,0.14)', color: '#9B6DFF', border: '1px solid #9B6DFF40' }
    : { background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid #F59E0B40' };
  return (
    <span
      title={on ? 'Cards section is visible to this client' : 'Cards section is hidden from this client'}
      style={{ ...style, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
    >
      {on ? 'ON' : 'OFF'}
    </span>
  );
}

export function BulkCardsActions({ selectedIds, updateLead, showNotification, onDone, actorName, actorId }) {
  const count = selectedIds.length;
  const disabled = count === 0;
  const [confirmDialog, confirm] = useConfirmDialog();

  const apply = async (cardsEnabled) => {
    if (disabled) {
      showNotification('Select at least one lead first.');
      return;
    }
    if (!cardsEnabled) {
      const ok = await confirm({
        title: 'Disable Cards?',
        message:
          `Switch Cards OFF for ${count} client${count === 1 ? '' : 's'}? `
          + 'They will lose access to the Cards section in their dashboard until you turn it back on.',
        confirmLabel: 'Switch OFF',
        tone: 'warning',
      });
      if (!ok) return;
    }
    selectedIds.forEach((id) => {
      try {
        updateLead(id, { cardsEnabled, _actorName: actorName, _actorId: actorId });
      } catch (_) { /* per-row failure is surfaced by updateLead */ }
    });
    showNotification(
      cardsEnabled
        ? `Cards enabled for ${count} client${count === 1 ? '' : 's'}.`
        : `Cards disabled for ${count} client${count === 1 ? '' : 's'}.`
    );
    if (onDone) onDone();
  };

  const onStyle = {
    padding: '6px 10px',
    background: disabled ? 'rgba(155,109,255,0.10)' : 'rgba(155,109,255,0.18)',
    color: disabled ? '#6e5a99' : '#9B6DFF',
    border: '1px solid rgba(155,109,255,0.45)',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };
  const offStyle = {
    ...onStyle,
    background: disabled ? 'rgba(240, 185, 11, 0.10)' : 'rgba(240, 185, 11, 0.16)',
    color: disabled ? '#8a7a3a' : '#F0B90B',
    border: '1px solid rgba(240, 185, 11, 0.4)',
  };

  return (
    <>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: '#848E9C', marginRight: 2 }}>Cards Feature:</span>
      <button
        type="button"
        onClick={() => apply(true)}
        disabled={disabled}
        style={onStyle}
        title="Switch Cards ON for the selected clients"
      >
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: disabled ? '#6e5a99' : '#9B6DFF' }} />
        ON
      </button>
      <button
        type="button"
        onClick={() => apply(false)}
        disabled={disabled}
        style={offStyle}
        title="Switch Cards OFF for the selected clients"
      >
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: disabled ? '#8a7a3a' : '#F0B90B' }} />
        OFF
      </button>
    </div>
    {confirmDialog}
    </>
  );
}
