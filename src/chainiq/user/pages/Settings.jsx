import React, { useContext, useState } from 'react';
import { DataContext } from '../contexts/DataContext';
import {
  AccountPage,
  AccountPageGrid,
  AccountSection,
  AccountRow,
  AccountActionButton,
  AccountToggleRow,
} from '../components/AccountPage';

const getPasswordStrength = (pwd) => {
  let score = 0;
  const checks = {
    length: pwd.length >= 8,
    upper: /[A-Z]/.test(pwd),
    number: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  };
  score = Object.values(checks).filter(Boolean).length;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const colors = ['', '#ef4444', '#f97316', '#eab308', '#22c55e'];
  return { score, checks, label: labels[score] || '', color: colors[score] || '' };
};

const daysSince = (isoDate) => {
  if (!isoDate) return null;
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
};

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

const Settings = () => {
  const {
    userSettingsState,
    setUserSettingsState,
    currentUser,
    changePassword,
    logoutEverywhere,
    saveCurrencyPreference,
    saveUserSetting,
  } = useContext(DataContext);

  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeError, setRevokeError] = useState('');

  const handleLogoutEverywhere = async () => {
    setRevokeError('');
    setRevokeLoading(true);
    try {
      await logoutEverywhere();
    } catch (err) {
      setRevokeError(err?.message || 'Could not sign out of all devices.');
      setRevokeLoading(false);
      setRevokeConfirm(false);
    }
  };

  const timezones = Intl.supportedValuesOf('timeZone');

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const strength = getPasswordStrength(newPwd);
  const pwdDaysAgo = daysSince(currentUser?.passwordLastChanged);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (!currentPwd) { setPwError('Please enter your current password.'); return; }
    if (newPwd.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPwd !== confirmPwd) { setPwError('New passwords do not match.'); return; }
    if (newPwd === currentPwd) { setPwError('New password must be different from the current one.'); return; }
    setPwLoading(true);
    try {
      await changePassword(currentPwd, newPwd);
      setPwSuccess('Password updated successfully.');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err) {
      setPwError(err.message || 'Failed to update password.');
    } finally {
      setPwLoading(false);
    }
  };

  const updateSetting = (key, value) => {
    if (saveUserSetting) {
      saveUserSetting(key, value);
    } else {
      setUserSettingsState(prev => ({ ...prev, [key]: value }));
    }
  };

  const [pendingCurrency, setPendingCurrency] = useState(null);
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencySaved, setCurrencySaved] = useState(false);

  const activeCurrency = userSettingsState.currency || 'USD';
  const displayedCurrency = pendingCurrency !== null ? pendingCurrency : activeCurrency;

  const handleCurrencySave = async () => {
    if (!pendingCurrency || pendingCurrency === activeCurrency) return;
    setCurrencySaving(true);
    try {
      await saveCurrencyPreference(pendingCurrency);
      setPendingCurrency(null);
      setCurrencySaved(true);
      setTimeout(() => setCurrencySaved(false), 2500);
    } finally {
      setCurrencySaving(false);
    }
  };

  return (
    <AccountPage id="settings-page">
      <AccountPageGrid columns={2}>
          <AccountSection title="Account Settings">
              <AccountRow
                label="Time Zone"
                description="Set your local time zone"
                action={
                  <select
                    className="form-select"
                    style={{ maxWidth: 220, minWidth: 160 }}
                    value={userSettingsState.timezone || ''}
                    onChange={e => updateSetting('timezone', e.target.value)}
                  >
                    {timezones.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                  </select>
                }
              />
              <AccountRow
                label="Display Currency"
                description="Primary currency used across the app"
                action={
                  <div className="flex items-center gap-2">
                    <select
                      className="form-select"
                      style={{ width: 88 }}
                      value={displayedCurrency}
                      onChange={e => setPendingCurrency(e.target.value)}
                    >
                      {CURRENCIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <AccountActionButton
                      onClick={handleCurrencySave}
                      disabled={currencySaving || !pendingCurrency || pendingCurrency === activeCurrency}
                    >
                      {currencySaving ? '...' : currencySaved ? 'Saved' : 'Save'}
                    </AccountActionButton>
                  </div>
                }
              />
          </AccountSection>

          <AccountSection title="Privacy Settings">
              <AccountToggleRow
                label="Balance Display"
                description="Show balance on cards"
                checked={!!userSettingsState.showCardBalance}
                onChange={(v) => updateSetting('showCardBalance', v)}
              />
          </AccountSection>
      </AccountPageGrid>

        <AccountSection
          title="Security Settings"
          subtitle="Manage your account security preferences"
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="p-4 bg-gray-800 rounded-lg">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-green-900/20 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-check-circle text-accent-green text-xl"></i>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Security Status</h4>
                  <p className="text-sm text-gray-400">
                    {currentUser ? 'Password set' : 'Not signed in'}
                  </p>
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <i className="fas fa-check-circle text-green-400"></i>
                      Password set
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <i className="fas fa-times-circle text-gray-500"></i>
                      2FA not available
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-800 rounded-lg">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-clock text-accent-blue text-xl"></i>
                </div>
                <div>
                  <h4 className="font-semibold mb-1">Last Password Change</h4>
                  <p className="text-sm text-gray-400">
                    {pwdDaysAgo !== null
                      ? `${pwdDaysAgo === 0 ? 'Today' : `${pwdDaysAgo} day${pwdDaysAgo !== 1 ? 's' : ''} ago`}`
                      : 'Never changed'}
                  </p>
                  <div className="text-xs text-gray-400 mt-3">
                    <i className="fas fa-info-circle mr-1"></i>
                    {pwdDaysAgo !== null && pwdDaysAgo > 90
                      ? 'Your password is overdue for a change.'
                      : 'We recommend changing your password every 90 days.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 mt-2">
              <div className="bg-gray-800 rounded-lg p-6">
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <i className="fas fa-key text-accent-yellow"></i>
                  Change Password
                </h4>

                {pwSuccess && (
                  <div className="mb-4 p-3 bg-green-900/20 border border-green-700/30 rounded-lg text-green-400 text-sm flex items-center gap-2">
                    <i className="fas fa-check-circle"></i> {pwSuccess}
                  </div>
                )}
                {pwError && (
                  <div className="mb-4 p-3 bg-red-900/20 border border-red-700/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                    <i className="fas fa-exclamation-circle"></i> {pwError}
                  </div>
                )}

                <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="form-group">
                      <label htmlFor="current-password" className="form-label">Current Password</label>
                      <div className="relative">
                        <input
                          type={showCurrent ? 'text' : 'password'}
                          id="current-password"
                          className="form-input pr-10"
                          value={currentPwd}
                          onChange={e => { setCurrentPwd(e.target.value); setPwError(''); setPwSuccess(''); }}
                          required
                        />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-accent-yellow" onClick={() => setShowCurrent(v => !v)}>
                          <i className={`fas fa-${showCurrent ? 'eye-slash' : 'eye'}`}></i>
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="new-password" className="form-label">New Password</label>
                      <div className="relative">
                        <input
                          type={showNew ? 'text' : 'password'}
                          id="new-password"
                          className="form-input pr-10"
                          value={newPwd}
                          onChange={e => { setNewPwd(e.target.value); setPwError(''); setPwSuccess(''); }}
                          required
                          minLength="8"
                        />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-accent-yellow" onClick={() => setShowNew(v => !v)}>
                          <i className={`fas fa-${showNew ? 'eye-slash' : 'eye'}`}></i>
                        </button>
                      </div>
                    </div>

                    <div className="form-group lg:col-span-2">
                      <label htmlFor="confirm-password" className="form-label">Confirm New Password</label>
                      <div className="relative">
                        <input
                          type={showConfirm ? 'text' : 'password'}
                          id="confirm-password"
                          className="form-input pr-10"
                          value={confirmPwd}
                          onChange={e => { setConfirmPwd(e.target.value); setPwError(''); setPwSuccess(''); }}
                          required
                          style={confirmPwd.length > 0 ? {
                            borderColor: newPwd === confirmPwd ? '#22c55e' : '#ef4444',
                            boxShadow: newPwd === confirmPwd
                              ? '0 0 0 1px rgba(34,197,94,0.35)'
                              : '0 0 0 1px rgba(239,68,68,0.35)',
                            transition: 'border-color 0.15s, box-shadow 0.15s',
                          } : { transition: 'border-color 0.15s, box-shadow 0.15s' }}
                        />
                        <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-accent-yellow" onClick={() => setShowConfirm(v => !v)}>
                          <i className={`fas fa-${showConfirm ? 'eye-slash' : 'eye'}`}></i>
                        </button>
                      </div>

                      {newPwd.length > 0 && (
                        <div id="password-strength" className="mt-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-semibold text-gray-400">Password Strength:</div>
                            <div className="text-sm font-medium" style={{ color: strength.color }}>{strength.label}</div>
                          </div>
                          <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-3">
                            <div className="h-full transition-all duration-300 rounded-full" style={{ width: `${(strength.score / 4) * 100}%`, background: strength.color }}></div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                            {[
                              { key: 'length', label: '8+ characters' },
                              { key: 'upper', label: 'Uppercase letter' },
                              { key: 'number', label: 'Number' },
                              { key: 'special', label: 'Special character' },
                            ].map(({ key, label }) => (
                              <div key={key} className={`flex items-center gap-2 ${strength.checks[key] ? 'text-green-400' : 'text-gray-500'}`}>
                                <i className={`fas fa-${strength.checks[key] ? 'check-circle' : 'circle'}`}></i>
                                {label}
                              </div>
                            ))}
                          </div>
                          {confirmPwd.length > 0 && (
                            <div className={`mt-2 text-sm flex items-center gap-2 ${newPwd === confirmPwd ? 'text-green-400' : 'text-red-400'}`}>
                              <i className={`fas fa-${newPwd === confirmPwd ? 'check-circle' : 'times-circle'}`}></i>
                              {newPwd === confirmPwd ? 'Passwords match' : 'Passwords do not match'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-4">
                    <button type="submit" className="btn-action" disabled={pwLoading}>
                      <i className="fas fa-key mr-2"></i>
                      {pwLoading ? 'Updating...' : 'Update Password'}
                    </button>
                    <button type="button" className="btn-action btn-secondary" onClick={() => { setCurrentPwd(''); setNewPwd(''); setConfirmPwd(''); setPwError(''); setPwSuccess(''); }}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </AccountSection>

        <AccountSection
          title="Active Sessions"
          subtitle="Sign out of every browser and device that's currently signed in to your account."
        >
          <div className="account-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="flex items-start gap-3 mb-4">
              <i className="fas fa-shield-alt text-yellow-400 text-lg mt-1"></i>
              <div className="text-sm text-gray-300 leading-relaxed">
                If you've lost a device or suspect someone else has access to your account, sign out of all devices to revoke every existing session. You'll need to sign in again on this device too.
              </div>
            </div>

            {revokeError && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-700/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
                <i className="fas fa-exclamation-circle"></i> {revokeError}
              </div>
            )}

            {!revokeConfirm ? (
              <button
                type="button"
                className="btn-action"
                style={{ background: '#dc2626', color: '#fff' }}
                onClick={() => { setRevokeError(''); setRevokeConfirm(true); }}
                disabled={revokeLoading}
              >
                <i className="fas fa-sign-out-alt mr-2"></i>
                Sign out of all devices
              </button>
            ) : (
              <div>
                <div className="text-sm font-semibold text-yellow-300 mb-3">
                  This will end every active session - including this one. Continue?
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="btn-action"
                    style={{ background: '#dc2626', color: '#fff' }}
                    onClick={handleLogoutEverywhere}
                    disabled={revokeLoading}
                  >
                    <i className="fas fa-check mr-2"></i>
                    {revokeLoading ? 'Signing out...' : 'Yes, sign out everywhere'}
                  </button>
                  <button
                    type="button"
                    className="btn-action btn-secondary"
                    onClick={() => setRevokeConfirm(false)}
                    disabled={revokeLoading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </AccountSection>

    </AccountPage>
  );
};

export default Settings;
