import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DataContext } from '../contexts/DataContext';

const AUTO_DISMISS_MS = 6000;

const SessionExpiredToast = () => {
  const { sessionNotice, dismissSessionNotice } = useContext(DataContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const lastSeenAtRef = useRef(0);

  useEffect(() => {
    if (!sessionNotice || sessionNotice.at === lastSeenAtRef.current) return;
    lastSeenAtRef.current = sessionNotice.at;
    setVisible(true);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      dismissSessionNotice();
      const onAuthScreen = location.pathname.startsWith('/login') || location.pathname === '/';
      if (!onAuthScreen) {
        navigate('/login', { replace: true });
      }
    }, AUTO_DISMISS_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sessionNotice, dismissSessionNotice, navigate, location.pathname]);

  if (!visible || !sessionNotice) return null;

  const isDisabled = sessionNotice.kind === 'disabled';
  const title = isDisabled ? 'Account unavailable' : 'Session expired';
  const body  = isDisabled
    ? 'Your account is no longer active. Please sign in again or contact support.'
    : 'Your session has expired. Please sign in again to continue.';

  const handleSignIn = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    dismissSessionNotice();
    navigate('/login', { replace: true });
  };

  const handleDismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
    dismissSessionNotice();
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed',
        top: 24,
        right: 24,
        zIndex: 10000,
        maxWidth: 380,
        background: '#161A1E',
        border: `1px solid ${isDisabled ? '#f6465d' : '#F0B90B'}`,
        borderLeft: `4px solid ${isDisabled ? '#f6465d' : '#F0B90B'}`,
        borderRadius: 10,
        padding: '14px 16px',
        color: '#EAECEF',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        animation: 'ciq-toast-in 220ms ease-out',
      }}
    >
      <style>{`
        @keyframes ciq-toast-in {
          from { transform: translateY(-12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div
          aria-hidden="true"
          style={{
            flex: '0 0 auto',
            width: 28, height: 28,
            borderRadius: '50%',
            background: isDisabled ? 'rgba(246,70,93,0.15)' : 'rgba(240,185,11,0.15)',
            color: isDisabled ? '#f6465d' : '#F0B90B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 16,
          }}
        >
          !
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 13, color: '#B7BDC6', lineHeight: 1.4 }}>{body}</div>
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleSignIn}
              style={{
                background: '#F0B90B', color: '#0B0E11',
                border: 'none', borderRadius: 6, padding: '6px 12px',
                fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              style={{
                background: 'transparent', color: '#848E9C',
                border: '1px solid #2B3139', borderRadius: 6, padding: '6px 12px',
                fontWeight: 500, fontSize: 13, cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionExpiredToast;
