import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import { DataContext } from './contexts/DataContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { usePlatformSettings } from '../platformDefaults';

const Sidebar = ({ navItems, isActive, onClose }) => {
    const { cryptoDataState, currentUser, supportUnreadCount, notificationsDataState, formatBalance } = useContext(DataContext);
    const notifUnreadCount = Array.isArray(notificationsDataState)
        ? notificationsDataState.filter(n => !n.read).length
        : 0;
    const platformSettingsState = usePlatformSettings();

    const totalCryptoBalance = cryptoDataState.reduce((acc, asset) => acc + (asset.balance * asset.price), 0);
    const totalFiatBalance = Number(currentUser?.balances?.usd) || 0;

    const platformName = platformSettingsState.platformName || 'Chain-IQ';
    const platformAbbr = platformSettingsState.platformAbbreviation
        || platformName.split(' ').map(word => word[0]).join('').toUpperCase();

    return (
        <aside className={`sidebar${isActive ? ' active' : ''}`} id="sidebar">
            <div className="sidebar-header">
                <div className="logo-container">
                    <div className="logo-img">{platformAbbr}</div>
                    <span className="logo-text">{platformName}</span>
                </div>
                <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
                    <i className="fas fa-times"></i>
                </button>
            </div>

            <div className="sidebar-content">
                <div className="account-card">
                    <div className="account-header">
                        <span className="account-title">Account Balance</span>
                    </div>
                    <div className="balance-item">
                        <div className="balance-label">
                            <i className="fas fa-dollar-sign"></i>
                            <span>Fiat</span>
                        </div>
                        <div className="balance-value">{formatBalance(totalFiatBalance)}</div>
                    </div>
                    <div className="balance-item">
                        <div className="balance-label">
                            <i className="fas fa-coins"></i>
                            <span>Crypto</span>
                        </div>
                        <div className="balance-value">{formatBalance(totalCryptoBalance)}</div>
                    </div>
                    <NavLink to="/dashboard/crypto-assets" className="account-card-tag" onClick={onClose}>
                        <i className="fas fa-wallet"></i>
                        <span>Wallet</span>
                        <i className="fas fa-arrow-right account-card-tag-arrow"></i>
                    </NavLink>
                </div>

                <div className="menu-section">
                    <h3 className="menu-title">Main Menu</h3>
                    <ul className="menu-list">
                        {navItems.mainMenu.map(item => (
                            <li key={item.id}>
                                <NavLink
                                    to={item.path}
                                    end={item.id === 'dashboard'}
                                    className="menu-link"
                                    onClick={onClose}
                                >
                                    <FontAwesomeIcon icon={item.icon} className="menu-icon" />
                                    <span className="menu-text">{item.text}</span>
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="menu-section">
                    <h3 className="menu-title">Account</h3>
                    <ul className="menu-list">
                        {navItems.accountSettings.map(item => {
                            // Badge for Support: agent replies not yet read.
                            const showSupportBadge =
                                item.id === 'support' && supportUnreadCount > 0;
                            // Badge for Notifications: unread admin/system notifications.
                            const showNotifBadge =
                                item.id === 'notifications' && notifUnreadCount > 0;
                            return (
                                <li key={item.id}>
                                    <NavLink
                                        to={item.path}
                                        className="menu-link"
                                        onClick={onClose}
                                    >
                                        <FontAwesomeIcon icon={item.icon} className="menu-icon" />
                                        <span className="menu-text">{item.text}</span>
                                        {showSupportBadge && (
                                            <span
                                                className="menu-badge"
                                                style={{
                                                    marginLeft: 'auto',
                                                    background: '#f6465d',
                                                    color: '#fff',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    minWidth: 18,
                                                    height: 18,
                                                    borderRadius: 9,
                                                    padding: '0 6px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    lineHeight: 1,
                                                }}
                                            >
                                                {supportUnreadCount > 99 ? '99+' : supportUnreadCount}
                                            </span>
                                        )}
                                        {showNotifBadge && (
                                            <span
                                                className="menu-badge"
                                                style={{
                                                    marginLeft: showSupportBadge ? 4 : 'auto',
                                                    background: '#F0B90B',
                                                    color: '#181A20',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 700,
                                                    minWidth: 18,
                                                    height: 18,
                                                    borderRadius: 9,
                                                    padding: '0 6px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    lineHeight: 1,
                                                }}
                                            >
                                                {notifUnreadCount > 99 ? '99+' : notifUnreadCount}
                                            </span>
                                        )}
                                    </NavLink>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </div>

            <div className="logout-section">
                <NavLink to={navItems.logout.path} className="logout-link" onClick={onClose}>
                    <FontAwesomeIcon icon={navItems.logout.icon} className="menu-icon" />
                    <span className="menu-text">{navItems.logout.text}</span>
                </NavLink>
            </div>
        </aside>
    );
};

export default Sidebar;
