import React, { useContext, useState, useEffect, useCallback } from 'react';
import { DataContext } from '../contexts/DataContext';
import { markNotificationRead } from '../../api';
import {
  AccountPage,
  AccountPageGrid,
  AccountSection,
  AccountToggleRow,
  AccountActionButton,
} from '../components/AccountPage';

const DEFAULT_NOTIFICATION_SETTINGS = {
  securityAlerts: true,
  transactionAlerts: true,
  priceAlerts: false,
  newsletter: false,
  emailDelivery: true,
  pushDelivery: true,
};

const Notifications = () => {
  const {
    notificationsDataState,
    userSettingsState,
    markAllNotificationsRead,
    notificationSettings,
    saveNotificationSettings,
    refreshNotifications,
  } = useContext(DataContext);

  useEffect(() => { refreshNotifications?.(); }, [refreshNotifications]);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState('');
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATION_SETTINGS);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (notificationSettings) {
      setPrefs({ ...DEFAULT_NOTIFICATION_SETTINGS, ...notificationSettings });
    }
  }, [notificationSettings]);

  const unreadCount = notificationsDataState.filter((n) => !n.read && n.id !== '__support_unread__').length;

  const handleMarkAllRead = async () => {
    if (marking || unreadCount === 0) return;
    setMarkError('');
    setMarking(true);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      setMarkError(err?.message || 'Could not mark notifications as read.');
    } finally {
      setMarking(false);
    }
  };

  const handleMarkOneRead = async (n) => {
    if (n.read || n.id === '__support_unread__') return;
    try {
      await markNotificationRead(n.id);
    } catch (_) { /* badge refresh on next poll */ }
  };

  const updatePref = useCallback(async (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await saveNotificationSettings(next);
    } finally {
      setSavingPrefs(false);
    }
  }, [prefs, saveNotificationSettings]);

  const maskedEmail = userSettingsState.email
    ? `${userSettingsState.email.slice(0, 1)}***@${userSettingsState.email.split('@')[1] || 'email'}`
    : 'Account email';

  return (
    <AccountPage id="notifications-page">
      <AccountPageGrid columns={2}>
        <AccountSection title="Notification Settings">
          <AccountToggleRow
            label="Security Alerts"
            description="Login attempts and security updates"
            checked={prefs.securityAlerts}
            disabled={savingPrefs}
            onChange={(v) => updatePref('securityAlerts', v)}
          />
          <AccountToggleRow
            label="Transaction Notifications"
            description="Deposits, withdrawals, and trades"
            checked={prefs.transactionAlerts}
            disabled={savingPrefs}
            onChange={(v) => updatePref('transactionAlerts', v)}
          />
          <AccountToggleRow
            label="Price Alerts"
            description="Cryptocurrency price movements"
            checked={prefs.priceAlerts}
            disabled={savingPrefs}
            onChange={(v) => updatePref('priceAlerts', v)}
          />
          <AccountToggleRow
            label="Newsletter"
            description="Weekly updates and news"
            checked={prefs.newsletter}
            disabled={savingPrefs}
            onChange={(v) => updatePref('newsletter', v)}
          />
          {savingPrefs && <p className="account-section__subtitle">Saving preferences...</p>}
        </AccountSection>

        <AccountSection title="Delivery Methods">
          <AccountToggleRow
            label="Email Notifications"
            description={maskedEmail}
            checked={prefs.emailDelivery}
            disabled={savingPrefs}
            onChange={(v) => updatePref('emailDelivery', v)}
          />
          <AccountToggleRow
            label="Push Notifications"
            description="In-app alerts while you are signed in"
            checked={prefs.pushDelivery}
            disabled={savingPrefs}
            onChange={(v) => updatePref('pushDelivery', v)}
          />
        </AccountSection>
      </AccountPageGrid>

      <AccountSection
        title="Recent Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        action={
          <AccountActionButton
            className="notifications-mark-read-btn"
            onClick={handleMarkAllRead}
            disabled={marking || unreadCount === 0}
          >
            {marking ? 'Marking...' : 'Mark all read'}
          </AccountActionButton>
        }
      >
        {markError && (
          <div className="modal-error-msg" style={{ marginBottom: 10 }}>
            <i className="fas fa-exclamation-circle" /> {markError}
          </div>
        )}
        <div className="notification-list">
          {notificationsDataState.length === 0 ? (
            <div className="account-row" style={{ justifyContent: 'center', textAlign: 'center' }}>
              <div>
                <i className="fas fa-bell-slash" style={{ fontSize: 24, marginBottom: 8, opacity: 0.5 }} />
                <div className="account-row__desc">You are all caught up - no notifications yet.</div>
              </div>
            </div>
          ) : (
            notificationsDataState.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                className={`notification-item ${n.read ? 'opacity-60' : ''}`}
                onClick={() => handleMarkOneRead(n)}
                onKeyDown={(e) => e.key === 'Enter' && handleMarkOneRead(n)}
              >
                <i
                  className={`notification-icon fas ${
                    n.kind === 'security'    ? 'fa-shield-alt text-red-400' :
                    n.kind === 'transaction' ? 'fa-exchange-alt text-green-400' :
                    n.kind === 'message'     ? 'fa-comment-dots text-blue-400' :
                    n.kind === 'system'      ? 'fa-cog text-yellow-400' :
                    n.kind === 'warning'     ? 'fa-exclamation-triangle text-yellow-400' :
                    n.kind === 'blocked'     ? 'fa-ban text-red-400' :
                    n.kind === 'failed'      ? 'fa-times-circle text-red-500' :
                    'fa-info-circle'
                  }`}
                />
                <div className="notification-content">
                  <p className="notification-message">{n.message}</p>
                  <span className="notification-time">
                    {new Date(n.timestamp).toLocaleString(undefined, { timeZone: userSettingsState.timezone })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </AccountSection>
    </AccountPage>
  );
};

export default Notifications;
