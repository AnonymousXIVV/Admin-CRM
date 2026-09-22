import React, { useState, useRef, useEffect } from 'react';
import { requestPasswordReset, resetPasswordWithCode } from '../../api';
import './signup-verify.css';

const CODE_LEN = 6;

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  const shown = local.length <= 2 ? `${local[0]}*` : `${local.slice(0, 2)}***`;
  return `${shown}@${domain}`;
}

export default function ForgotPasswordModal({ open, onClose }) {
  const [step, setStep]                   = useState('request');
  const [email, setEmail]                 = useState('');
  const [digits, setDigits]               = useState(Array(CODE_LEN).fill(''));
  const [password, setPassword]           = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy]                   = useState(false);
  const [error, setError]                 = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  const inputsRef = useRef([]);

  useEffect(() => {
    if (!open) return;
    setStep('request');
    setEmail('');
    setDigits(Array(CODE_LEN).fill(''));
    setPassword('');
    setConfirmPassword('');
    setError('');
    setResendCooldown(0);
  }, [open]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  if (!open) return null;

  const code = digits.join('');

  const handleDigitChange = (index, value) => {
    const v = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = v;
    setDigits(next);
    setError('');
    if (v && index < CODE_LEN - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, CODE_LEN);
    if (!pasted) return;
    e.preventDefault();
    const next = Array(CODE_LEN).fill('');
    pasted.split('').forEach((ch, i) => { next[i] = ch; });
    setDigits(next);
    const focusIdx = Math.min(pasted.length, CODE_LEN - 1);
    inputsRef.current[focusIdx]?.focus();
  };

  const sendCode = async (emailVal) => {
    setBusy(true);
    setError('');
    try {
      const result = await requestPasswordReset(emailVal.trim());
      if (result && result.registered === false) {
        setError('No account found with that email address. Please check and try again.');
        return;
      }
      setStep('verify');
      setResendCooldown(60);
    } catch (err) {
      setError(err?.message || 'Could not send reset code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    await sendCode(email);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    await sendCode(email);
  };

  const handleVerify = (e) => {
    e.preventDefault();
    if (code.length !== CODE_LEN) {
      setError('Please enter all 6 digits from your email.');
      return;
    }
    setError('');
    setStep('reset');
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPasswordWithCode(email.trim(), code, password);
      setStep('done');
    } catch (err) {
      setError(err?.message || 'Reset failed. The code may have expired - request a new one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sv-overlay" role="dialog" aria-modal="true" aria-labelledby="fp-title">
      <div className="sv-modal">
        <button type="button" className="sv-close" onClick={onClose} aria-label="Close">&times;</button>

        {step === 'request' && (
          <>
            <div className="sv-icon" aria-hidden style={{ background: 'rgba(240,185,11,0.1)', borderColor: 'rgba(240,185,11,0.35)' }}>🔑</div>
            <h2 id="fp-title" className="sv-title">Reset password</h2>
            <p className="sv-subtitle" style={{ marginBottom: 20 }}>
              Enter your account email. An administrator will send you a 6-digit code to reset your password.
            </p>
            <form onSubmit={handleRequest}>
              <label className="ui-field-wrap" style={{ marginBottom: 14 }}>
                <span className="ui-field-label">Email address</span>
                <input
                  type="email"
                  className="ui-field form-input"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
              {error && <div className="sv-banner sv-banner--error">{error}</div>}
              <button
                type="submit"
                className="ui-btn ui-btn--primary"
                style={{ width: '100%' }}
                disabled={busy}
              >
                {busy ? 'Sending...' : 'Request reset code'}
              </button>
            </form>
          </>
        )}

        {step === 'verify' && (
          <>
            <div className="sv-icon" aria-hidden>✉</div>
            <h2 id="fp-title" className="sv-title">Enter your code</h2>
            <p className="sv-subtitle">Enter the 6-digit code sent to:</p>
            <p className="sv-email">{maskEmail(email)}</p>

            {error && <div className="sv-banner sv-banner--error">{error}</div>}

            <form onSubmit={handleVerify} className="sv-form">
              <label className="sv-code-label">6-digit reset code</label>
              <div className="sv-code-row" onPaste={handlePaste}>
                {digits.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { inputsRef.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    className="sv-code-cell"
                    value={d}
                    onChange={e => handleDigitChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    disabled={busy}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              <button
                type="button"
                className="sv-resend"
                disabled={busy || resendCooldown > 0}
                onClick={handleResend}
              >
                {resendCooldown > 0 ? `Resend request in ${resendCooldown}s` : 'Resend request'}
              </button>

              <button
                type="submit"
                className="ui-btn ui-btn--primary sv-submit"
                disabled={busy || code.length !== CODE_LEN}
              >
                Continue
              </button>
            </form>

            <p className="sv-foot">
              Wrong email?{' '}
              <button type="button" className="sv-link" onClick={() => { setStep('request'); setError(''); }}>
                Go back
              </button>
            </p>
          </>
        )}

        {step === 'reset' && (
          <>
            <div className="sv-icon" aria-hidden style={{ background: 'rgba(14,203,129,0.1)', borderColor: 'rgba(14,203,129,0.35)' }}>🔒</div>
            <h2 id="fp-title" className="sv-title">New password</h2>
            <p className="sv-subtitle" style={{ marginBottom: 20 }}>
              Choose a strong password for your account.
            </p>
            <form onSubmit={handleReset}>
              <label className="ui-field-wrap" style={{ marginBottom: 14 }}>
                <span className="ui-field-label">New password</span>
                <input
                  type="password"
                  className="ui-field form-input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </label>
              <label className="ui-field-wrap" style={{ marginBottom: 14 }}>
                <span className="ui-field-label">Confirm new password</span>
                <input
                  type="password"
                  className="ui-field form-input"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </label>
              {error && <div className="sv-banner sv-banner--error">{error}</div>}
              <button
                type="submit"
                className="ui-btn ui-btn--primary"
                style={{ width: '100%' }}
                disabled={busy}
              >
                {busy ? 'Saving...' : 'Set new password'}
              </button>
            </form>
            <p className="sv-foot">
              <button type="button" className="sv-link" onClick={() => { setStep('verify'); setError(''); }}>
                Back to code entry
              </button>
            </p>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="sv-icon" aria-hidden style={{ background: 'rgba(14,203,129,0.12)', borderColor: 'rgba(14,203,129,0.35)' }}>✓</div>
            <h2 id="fp-title" className="sv-title">Password updated</h2>
            <p className="sv-subtitle" style={{ marginBottom: 20 }}>
              Your password has been reset. You can now sign in with your new password.
            </p>
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              style={{ width: '100%' }}
              onClick={onClose}
            >
              Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
