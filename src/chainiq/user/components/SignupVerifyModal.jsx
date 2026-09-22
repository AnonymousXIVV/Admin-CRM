import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSignupRequestStatus } from '../../api';
import './signup-verify.css';

const CODE_LEN = 6;

function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  const shown = local.length <= 2 ? `${local[0]}*` : `${local.slice(0, 2)}***`;
  return `${shown}@${domain}`;
}

export default function SignupVerifyModal({
  email,
  open,
  initialStatus = 'pending',
  onClose,
  onVerified,
  onVerify,
  error: externalError,
}) {
  const [status, setStatus] = useState(initialStatus);
  const [digits, setDigits] = useState(Array(CODE_LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputsRef = useRef([]);

  useEffect(() => {
    if (!open) return;
    setStatus(initialStatus);
    setDigits(Array(CODE_LEN).fill(''));
    setError('');
    setInfo('');
  }, [open, initialStatus, email]);

  const pollStatus = useCallback(async () => {
    if (!email?.trim()) return null;
    try {
      const st = await getSignupRequestStatus(email.trim());
      setStatus(st.status || 'none');
      if (st.status === 'rejected') {
        setError(st.rejection_message || 'Your registration was not approved.');
      } else if (st.status === 'approved' || st.needs_verification) {
        setInfo('');
        setError('');
      }
      return st;
    } catch (e) {
      setError(e?.message || 'Could not check status.');
      return null;
    }
  }, [email]);

  useEffect(() => {
    if (!open || status !== 'pending') return undefined;
    const id = setInterval(pollStatus, 12000);
    return () => clearInterval(id);
  }, [open, status, pollStatus]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  useEffect(() => {
    if (externalError) setError(externalError);
  }, [externalError]);

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

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setBusy(true);
    setError('');
    const st = await pollStatus();
    setBusy(false);
    setResendCooldown(30);
    if (st?.status === 'approved' || st?.needs_verification) {
      setInfo('A 6-digit code has been sent to your email.');
    } else if (st?.status === 'pending') {
      setInfo('');
    } else {
      setInfo('No active registration found for this address. Please sign up to continue.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.length !== CODE_LEN) {
      setError('Please enter all 6 digits from your email.');
      return;
    }
    if (status === 'pending') {
      setError('Please try again.');
      return;
    }
    if (status === 'rejected') {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onVerify(email, code);
      onVerified?.();
    } catch (err) {
      setError(err?.message || 'Verification failed. Check the code and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="sv-overlay" role="dialog" aria-modal="true" aria-labelledby="sv-title">
      <div className="sv-modal">
        <button type="button" className="sv-close" onClick={onClose} aria-label="Close">&times;</button>

        <div className="sv-icon" aria-hidden>✉</div>
        <h2 id="sv-title" className="sv-title">Verify your email</h2>
        <p className="sv-subtitle">
          {status === 'pending'
            ? 'A 6-digit verification code will be sent to:'
            : 'Enter the 6-digit code sent to:'}
        </p>
        <p className="sv-email">{maskEmail(email)}</p>

        {info && <div className="sv-banner sv-banner--info">{info}</div>}
        {error && <div className="sv-banner sv-banner--error">{error}</div>}

        <form onSubmit={handleSubmit} className="sv-form">
          <label className="sv-code-label">6-digit verification code</label>
          <div className="sv-code-row" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => { inputsRef.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                className="sv-code-cell"
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={busy || status === 'rejected'}
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
            {resendCooldown > 0
              ? `Check again in ${resendCooldown}s`
              : 'Resend code'}
          </button>

          <button
            type="submit"
            className="ui-btn ui-btn--primary sv-submit"
            disabled={busy || code.length !== CODE_LEN || status === 'rejected'}
          >
            {busy ? 'Verifying...' : 'Activate account & sign in'}
          </button>
        </form>

        <p className="sv-foot">
          Wrong email? <button type="button" className="sv-link" onClick={onClose}>Go back</button>
        </p>
      </div>
    </div>
  );
}
