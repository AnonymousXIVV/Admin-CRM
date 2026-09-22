import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE } from '../../shared';
import { adminLogin, mapAdminToUser, getStoredAdminProfile } from '../../adminApi';

const ROLE_PATH = {
  [ROLE.SUPER_ADMIN]:    'super-admin',
  [ROLE.OFFICE_MANAGER]: 'office-manager',
  [ROLE.TEAM_LEADER]:    'team-leader',
  [ROLE.AGENT]:          'agent',
};

const ROLE_META = {
  [ROLE.SUPER_ADMIN]:    { icon: '👑', title: 'Super Admin',    subtitle: 'Sign in to your Super Admin account' },
  [ROLE.OFFICE_MANAGER]: { icon: '[office]', title: 'Office Manager', subtitle: 'Sign in to your Office Manager account' },
  [ROLE.TEAM_LEADER]:    { icon: '[users]', title: 'Team Leader',    subtitle: 'Sign in to your Team Leader account' },
  [ROLE.AGENT]:          { icon: '[agent]', title: 'Agent',          subtitle: 'Sign in to your Agent account' },
};

const BINANCE = {
  bg:         '#2A2E36',
  surface:    '#363B44',
  border:     '#444A55',
  text:       '#EAECEF',
  muted:      '#848E9C',
  yellow:     '#F0B90B',
  red:        '#F6465D',
};

const RoleLogin = ({ role, onAdminLogin }) => {
  const navigate  = useNavigate();
  const meta      = ROLE_META[role] || ROLE_META[ROLE.AGENT];
  const rolePath  = ROLE_PATH[role];

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

  // If the user lands here while still authenticated for THIS role (e.g. they
  // pressed the browser back button from inside their panel), bounce them
  // straight back to the panel instead of showing an empty login form. We use
  // `replace: true` so the login URL is not added to history - back-arrow
  // then walks through the panel's own pages page-by-page as expected.
  useEffect(() => {
    const stored = getStoredAdminProfile();
    if (stored && stored.role === role && stored.id) {
      navigate(`/admin/${rolePath}/${stored.id}`, { replace: true });
    }
  }, [role, rolePath, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const admin = await adminLogin(email.trim(), password);

      if (admin.role !== role) {
        setError(`This account has the ${admin.role} role. Please use the correct login page.`);
        return;
      }

      if (typeof onAdminLogin === 'function') {
        onAdminLogin(mapAdminToUser(admin));
      }

      navigate(`/admin/${rolePath}/${admin.id}`, { replace: true });
    } catch (err) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: BINANCE.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <h1 style={{ color: BINANCE.text, fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            {meta.title} Login
          </h1>
        </div>

        <div style={{
          background: BINANCE.surface,
          border: `1px solid ${BINANCE.border}`,
          borderRadius: '14px',
          padding: '32px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
        }}>

          {error && (
            <div style={{
              background: 'rgba(246,70,93,0.1)', border: '1px solid rgba(246,70,93,0.3)',
              borderRadius: '8px', padding: '12px 14px', marginBottom: '20px',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '15px' }}>Warning</span>
              <span style={{ color: BINANCE.red, fontSize: '0.85rem', fontWeight: 500 }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: '18px' }}>
              <label style={{
                display: 'block', color: BINANCE.muted, fontSize: '0.78rem',
                fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                placeholder="you@company.com"
                required
                autoFocus
                autoComplete="email"
                style={{
                  width: '100%', background: BINANCE.surface, border: `1px solid ${BINANCE.border}`,
                  borderRadius: '8px', padding: '12px 14px', color: BINANCE.text,
                  fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={(e) => (e.target.style.borderColor = BINANCE.yellow)}
                onBlur={(e)  => (e.target.style.borderColor = BINANCE.border)}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{
                display: 'block', color: BINANCE.muted, fontSize: '0.78rem',
                fontWeight: 600, marginBottom: '8px', letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  style={{
                    width: '100%', background: BINANCE.surface, border: `1px solid ${BINANCE.border}`,
                    borderRadius: '8px', padding: '12px 44px 12px 14px', color: BINANCE.text,
                    fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = BINANCE.yellow)}
                  onBlur={(e)  => (e.target.style.borderColor = BINANCE.border)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    width: '32px', height: '32px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: BINANCE.muted, padding: 0, margin: 0, lineHeight: 1,
                  }}
                  tabIndex={-1}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {showPassword ? (
                      <>
                        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.83 21.83 0 0 1-3.17 4.19" />
                        <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </>
                    ) : (
                      <>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </>
                    )}
                  </svg>
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                width: '100%', padding: '13px',
                background: loading || !email || !password
                  ? 'rgba(240,185,11,0.4)'
                  : BINANCE.yellow,
                border: 'none', borderRadius: '8px',
                color: loading || !email || !password ? 'rgba(0,0,0,0.45)' : '#0a0f1e',
                fontSize: '0.95rem', fontWeight: 700,
                cursor: loading ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: loading || !email || !password ? 'none' : '0 4px 16px rgba(240,185,11,0.3)',
                letterSpacing: '0.02em',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p style={{ color: BINANCE.muted, fontSize: '0.85rem', margin: '16px 0 0', textAlign: 'center' }}>
          {meta.subtitle}
        </p>

      </div>
    </div>
  );
};

export default RoleLogin;
