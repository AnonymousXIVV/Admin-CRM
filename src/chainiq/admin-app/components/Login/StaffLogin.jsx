import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin, mapAdminToUser, getStoredAdminProfile } from '../../adminApi';

const STAFF_ROLES = ['Office Manager', 'Team Leader', 'Agent'];

const ROLE_PATH = {
  'Office Manager': 'office-manager',
  'Team Leader':    'team-leader',
  'Agent':          'agent',
};

const StaffLogin = ({ onAdminLogin }) => {
  const navigate = useNavigate();

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);

  // Auto-redirect already-authenticated staff back to their panel so the back
  // button doesn't show a stale, empty login form (which previously felt like
  // an automatic logout). Super Admin accounts get bounced to their own page.
  useEffect(() => {
    const stored = getStoredAdminProfile();
    if (!stored || !stored.id || !stored.role) return;
    const target = ROLE_PATH[stored.role];
    if (target) {
      navigate(`/admin/${target}/${stored.id}`, { replace: true });
    } else if (stored.role === 'Super Admin') {
      navigate(`/admin/super-admin/${stored.id}`, { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const admin = await adminLogin(email.trim(), password);

      if (!STAFF_ROLES.includes(admin.role)) {
        setError('Super Admin accounts must use the Super Admin login page.');
        setLoading(false);
        return;
      }

      const rolePath = ROLE_PATH[admin.role];
      if (!rolePath) {
        setError('Your account role is not supported for staff login.');
        setLoading(false);
        return;
      }

      if (typeof onAdminLogin === 'function') {
        onAdminLogin(mapAdminToUser(admin));
      }

      // replace: true keeps the login URL out of history so back-arrow from
      // the panel walks through the panel's own pages, not back to a form.
      navigate(`/admin/${rolePath}/${admin.id}`, { replace: true });
    } catch (err) {
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#2A2E36',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '14px',
            background: '#f3ba2f',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 24px rgba(243,186,47,0.3)',
            fontSize: '24px',
          }}>
            [security]
          </div>
          <h1 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: '700', margin: '0 0 6px' }}>
            Staff Login
          </h1>
          <p style={{ color: '#6b7a99', fontSize: '0.9rem', margin: 0 }}>
            Sign in to your Chain-IQ CRM account
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#363B44',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px',
          padding: '32px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px', padding: '12px 16px', marginBottom: '20px',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '16px' }}>Warning</span>
              <span style={{ color: '#f87171', fontSize: '0.875rem', fontWeight: '500' }}>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block', color: '#a3adc0', fontSize: '0.8rem',
                fontWeight: '600', marginBottom: '8px', letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                placeholder="you@company.com"
                required
                autoFocus
                autoComplete="email"
                style={{
                  width: '100%', background: '#363B44', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px', padding: '12px 14px', color: '#e2e8f0',
                  fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#f3ba2f'}
                onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: '28px' }}>
              <label style={{
                display: 'block', color: '#a3adc0', fontSize: '0.8rem',
                fontWeight: '600', marginBottom: '8px', letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  style={{
                    width: '100%', background: '#363B44', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px', padding: '12px 44px 12px 14px', color: '#e2e8f0',
                    fontSize: '0.95rem', outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={e => e.target.style.borderColor = '#f3ba2f'}
                  onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  style={{
                    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#6b7a99', fontSize: '16px', padding: '4px', lineHeight: 1,
                  }}
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : 'View'}
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
                  ? 'rgba(243,186,47,0.4)'
                  : '#f3ba2f',
                border: 'none', borderRadius: '8px',
                color: loading || !email || !password ? 'rgba(0,0,0,0.4)' : '#0a0f1e',
                fontSize: '0.95rem', fontWeight: '700', cursor: loading ? 'wait' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: loading || !email || !password ? 'none' : '0 4px 16px rgba(243,186,47,0.3)',
                letterSpacing: '0.02em',
              }}
            >
              {loading ? '[pending] Signing in...' : '🔑 Sign In'}
            </button>
          </form>
        </div>

        {/* Role badges */}
        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <p style={{ color: '#4a5568', fontSize: '0.8rem', marginBottom: '12px' }}>
            Supported roles
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {STAFF_ROLES.map(role => (
              <span key={role} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '20px', padding: '4px 12px',
                color: '#6b7a99', fontSize: '0.75rem', fontWeight: '500',
              }}>
                {role}
              </span>
            ))}
          </div>
        </div>

        {/* Super admin link */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <span
            onClick={() => navigate('/admin/login/super-admin')}
            style={{ color: '#4a5568', fontSize: '0.78rem', textDecoration: 'none', cursor: 'pointer' }}
            onMouseOver={e => e.target.style.color = '#f3ba2f'}
            onMouseOut={e  => e.target.style.color = '#4a5568'}
          >
            Super Admin access →
          </span>
        </div>
      </div>
    </div>
  );
};

export default StaffLogin;
