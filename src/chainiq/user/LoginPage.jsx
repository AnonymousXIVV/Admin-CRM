import React, { useState, useContext, useEffect } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { DataContext } from './contexts/DataContext';
import { getLead } from '../api';
import SignupVerifyModal from './components/SignupVerifyModal';
import ForgotPasswordModal from './components/ForgotPasswordModal';
import { usePlatformSettings } from '../platformDefaults';

const LoginPage = () => {
  const { currentUser, login, register, completeSignupVerification, impersonateLead } = useContext(DataContext);
  const platformSettingsState = usePlatformSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const requestedMode = searchParams.get('mode') === 'signup' ? 'signup' : 'login';
  const [mode, setMode] = useState(requestedMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyModalStatus, setVerifyModalStatus] = useState('pending');
  const [showForgotModal, setShowForgotModal] = useState(false);

  const clientEmail = searchParams.get('clientEmail') || '';
  const clientName = searchParams.get('clientName') || '';
  const clientPwdEncoded = searchParams.get('clientPwd') || '';
  const autoLogin = searchParams.get('autoLogin') === '1';
  const impersonateLeadId = searchParams.get('impersonateLeadId') || '';

  useEffect(() => {
    setError('');
  }, [mode]);

  useEffect(() => {
    if (requestedMode !== mode) {
      setMode(requestedMode);
    }
  }, [requestedMode, mode]);

  useEffect(() => {
    if (clientEmail) {
      setEmail(clientEmail);
      if (clientName) setName(clientName);
    }
  }, [clientEmail, clientName]);

  useEffect(() => {
    if (!impersonateLeadId && !(autoLogin && clientEmail)) return;
    if (currentUser && currentUser.id === impersonateLeadId) {
      try { sessionStorage.removeItem('chainiq_impersonate_lead'); } catch (_) {}
      navigate('/dashboard', { replace: true });
      return;
    }

    const readStashedLead = (idToMatch) => {
      try {
        const raw = sessionStorage.getItem('chainiq_impersonate_lead');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!idToMatch || parsed?.id === idToMatch) return parsed;
        return null;
      } catch (_) {
        return null;
      }
    };

    const performImpersonation = async () => {
      setLoading(true);
      try {
        if (impersonateLeadId) {
          let lead = null;
          try {
            lead = await getLead(impersonateLeadId);
          } catch (apiErr) {
            console.warn('getLead API failed, using stashed lead:', apiErr);
          }
          if (!lead) lead = readStashedLead(impersonateLeadId);
          if (!lead) {
            throw new Error('Lead data is no longer available. Please open the lead again from the CRM and click Enter.');
          }
          impersonateLead(lead);
          try { sessionStorage.removeItem('chainiq_impersonate_lead'); } catch (_) {}
          navigate('/dashboard');
          return;
        }

        let pwd = 'password123';
        if (clientPwdEncoded) {
          try { pwd = atob(decodeURIComponent(clientPwdEncoded)); } catch { pwd = 'password123'; }
        }
        await login(clientEmail, pwd);
        navigate('/dashboard');
      } catch (impErr) {
        console.error('Impersonation failed:', impErr);
        setError('Unable to access lead account. Please try again from the CRM.');
        setLoading(false);
      }
    };

    performImpersonation();
  }, [autoLogin, clientEmail, clientPwdEncoded, clientName, impersonateLeadId, currentUser, login, impersonateLead, navigate]);

  if (currentUser && !impersonateLeadId && !(autoLogin && clientEmail)) {
    return <Navigate to="/dashboard" replace />;
  }

  if (impersonateLeadId || (autoLogin && clientEmail)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0B0E11', color: '#EAECEF' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{
            width: 48, height: 48, border: '4px solid #2B3139', borderTopColor: '#F0B90B',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 24px',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          {error ? (
            <div style={{ color: '#f6465d', marginTop: 16 }}>{error}</div>
          ) : (
            <p style={{ color: '#848E9C', fontSize: 15 }}>Accessing client account...</p>
          )}
        </div>
      </div>
    );
  }

  const openVerifyAfterSignup = (result) => {
    const st = result?.status || 'pending';
    setVerifyModalStatus(st === 'approved' || result?.needs_verification ? 'approved' : 'pending');
    setShowVerifyModal(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
        navigate('/dashboard');
        return;
      }

      const result = await register({ name, email, password });
      openVerifyAfterSignup(result);
    } catch (loginError) {
      setError(loginError?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (verifyEmail, code) => {
    await completeSignupVerification(verifyEmail, code);
  };

  return (
    <div className="login-page user-ui-shell">
      <SignupVerifyModal
        email={email}
        open={showVerifyModal}
        initialStatus={verifyModalStatus}
        onClose={() => setShowVerifyModal(false)}
        onVerify={handleVerify}
        onVerified={() => navigate('/dashboard')}
        error={error}
      />
      <ForgotPasswordModal open={showForgotModal} onClose={() => setShowForgotModal(false)} />

      <div className="login-card">
        <div style={{ marginBottom: '28px', textAlign: 'center' }}>
          <div className="login-brand">{platformSettingsState.platformName || 'Chain-IQ'}</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>
        </div>

        <div className="login-tabs">
          <button type="button" onClick={() => setMode('login')} className={`login-tab${mode === 'login' ? ' is-active' : ''}`}>
            Login
          </button>
          <button type="button" onClick={() => setMode('signup')} className={`login-tab${mode === 'signup' ? ' is-active' : ''}`}>
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <label className="ui-field-wrap" style={{ marginBottom: 16 }}>
              <span className="ui-field-label">Full Name</span>
              <input
                type="text"
                className="ui-field form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                autoComplete="name"
                required
              />
            </label>
          )}

          <label className="ui-field-wrap" style={{ marginBottom: 16 }}>
            <span className="ui-field-label">Email Address</span>
            <input
              type="email"
              className="ui-field form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john.doe@example.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="ui-field-wrap" style={{ marginBottom: 16 }}>
            <span className="ui-field-label">Password</span>
            <input
              type="password"
              className="ui-field form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && !showVerifyModal && <div className="login-error">{error}</div>}

          <button type="submit" disabled={loading} className="ui-btn ui-btn--primary" style={{ width: '100%', marginTop: 4 }}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Submit registration'}
          </button>

          {mode === 'login' && (
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => setShowForgotModal(true)}
            >
              Forgot password?
            </button>
          )}

          {mode === 'signup' && email && (
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => {
                setVerifyModalStatus('pending');
                setShowVerifyModal(true);
              }}
            >
              Already submitted? Enter verification code
            </button>
          )}
        </form>

        <div className="login-footnote">
          {mode === 'login'
            ? 'No account yet? Switch to Register above.'
            : 'After registering, a 6-digit verification code will be sent to your email.'}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
