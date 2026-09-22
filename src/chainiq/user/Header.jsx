import React, { useState, useEffect, useContext } from 'react';
import { useLocation, NavLink, useNavigate } from 'react-router-dom';
import { DataContext } from './contexts/DataContext';
import { isPresetAvatar, AvatarSvg } from './avatarPresets';

const Header = ({ toggleSidebar }) => {
    const { userSettingsState, cryptoDataState, transactionDataState, cardDataState, currentUser, logout, notificationsDataState, markAllNotificationsRead } = useContext(DataContext);
    const [isUserMenuOpen, setUserMenuOpen] = useState(false);
    const [isNotificationMenuOpen, setNotificationMenuOpen] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    const toggleUserMenu = () => {
        setUserMenuOpen(!isUserMenuOpen);
        setNotificationMenuOpen(false);
    }

    const toggleNotificationMenu = () => {
        setNotificationMenuOpen(!isNotificationMenuOpen);
        setUserMenuOpen(false);
    }

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (isUserMenuOpen && !event.target.closest('#user-menu-button')) {
                setUserMenuOpen(false);
            }
            if (isNotificationMenuOpen && !event.target.closest('#notification-bell')) {
                setNotificationMenuOpen(false);
            }
        }

        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [isUserMenuOpen, isNotificationMenuOpen]);

    const pageMap = {
        '/dashboard': { title: 'Dashboard' },
        '/dashboard/trades': { title: 'Trades' },
        '/dashboard/crypto-assets': { title: 'Crypto Assets' },
        '/dashboard/cards': { title: 'Cards' },
        '/dashboard/withdrawals': { title: 'Withdrawals' },
        '/dashboard/transactions': { title: 'Transaction History' },
        '/dashboard/notifications': { title: 'Notifications' },
        '/dashboard/settings': { title: 'Settings' },
        '/dashboard/profile': { title: 'Profile' },
        '/dashboard/support': { title: 'Support' }
    };

    const getActivePage = () => {
        return pageMap[location.pathname] || { title: 'Dashboard' };
    }

    const getInitials = (name) => {
        if (!name) return '';
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    }

    const profileName = currentUser?.name || userSettingsState?.name;
    const profileEmail = currentUser?.email || userSettingsState?.email;
    const avatarUrl = currentUser?.avatarUrl || null;
    const [avatarImgFailed, setAvatarImgFailed] = useState(false);

    useEffect(() => {
        setAvatarImgFailed(false);
    }, [avatarUrl]);

    const renderAvatarContent = () => {
        if (avatarUrl && isPresetAvatar(avatarUrl)) {
            return <AvatarSvg presetId={avatarUrl} size={36}/>;
        }
        if (avatarUrl && !avatarImgFailed) {
            return (
                <img
                    src={avatarUrl}
                    alt=""
                    className="user-avatar-img"
                    onError={() => setAvatarImgFailed(true)}
                />
            );
        }
        return getInitials(profileName);
    };

    // Pulled straight from context - no DOM lookups. (The previous version
    // read its own badge element's textContent, which always returned 0 on
    // first render and never updated.)
    const notifications = Array.isArray(notificationsDataState) ? notificationsDataState : [];
    const unreadCount = notifications.filter(n => !n.read).length;
    const dropdownNotifications = notifications.slice(0, 5);

    const handleHeaderMarkAllRead = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (unreadCount === 0 || typeof markAllNotificationsRead !== 'function') return;
        markAllNotificationsRead().catch(() => { /* swallow - page-level UI also surfaces errors */ });
    };

    return (
        <header className="header" id="header">
            <div className="header-left">
                <button 
                    className="mobile-nav-toggle"
                    onClick={toggleSidebar}
                    title="Toggle Navigation"
                    aria-label="Toggle Navigation Menu"
                >
                    <i className="fas fa-bars"></i>
                </button>
                <h1 className="page-title" id="page-title">{getActivePage().title}</h1>
            </div>

            <div className="header-center"></div>

            <div className="header-right">
                <div className="header-divider"></div>
                
                <div className="header-icon notification-icon" id="notification-bell" style={{position: 'relative'}} onClick={toggleNotificationMenu} title="Notifications">
                    <i className="fas fa-bell"></i>
                    {unreadCount > 0 && (
                        <span className="notification-badge" id="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                    )}

                    {/* Notification Dropdown */}
                    <div id="notification-dropdown" className={`header-dropdown notification-dropdown ${isNotificationMenuOpen ? 'open' : ''}`}>
                        <div className="dropdown-header">
                            <h3>Notifications {unreadCount > 0 && <span className="header-notif-count">({unreadCount})</span>}</h3>
                            <button
                                id="modal-mark-all-read-btn"
                                className="dropdown-action-btn"
                                title="Mark all as read"
                                onClick={handleHeaderMarkAllRead}
                                disabled={unreadCount === 0}
                                style={unreadCount === 0 ? { opacity: 0.5, cursor: 'default' } : undefined}
                            >
                                Mark all as read
                            </button>
                        </div>
                        <div id="header-notification-list" className="dropdown-content">
                            {dropdownNotifications.length === 0 ? (
                                <div className="header-notif-empty" style={{ padding: '20px 16px', textAlign: 'center', fontSize: '0.875rem' }}>
                                    <i className="fas fa-bell-slash" style={{ fontSize: '1.5rem', display: 'block', marginBottom: 8 }}></i>
                                    No notifications yet
                                </div>
                            ) : dropdownNotifications.map(n => (
                                <div
                                    key={n.id}
                                    className="notification-item"
                                    style={{
                                        padding: '10px 12px',
                                        opacity: n.read ? 0.6 : 1,
                                        display: 'flex',
                                        gap: 10,
                                        alignItems: 'flex-start',
                                    }}
                                >
                                    <i className={`fas ${
                                        n.kind === 'security'    ? 'fa-shield-alt' :
                                        n.kind === 'transaction' ? 'fa-exchange-alt' :
                                        n.kind === 'system'      ? 'fa-cog' :
                                        n.kind === 'message'     ? 'fa-comment-dots' :
                                                                   'fa-info-circle'
                                    }`} style={{
                                        color: n.kind === 'security' ? '#f6465d'
                                             : n.kind === 'transaction' ? '#22c55e'
                                             : n.kind === 'message' ? '#22c55e'
                                             : '#F0B90B',
                                        marginTop: 3,
                                        flex: '0 0 auto',
                                    }}></i>
                                    <div
                                        style={{ flex: 1, minWidth: 0, cursor: n.kind === 'message' ? 'pointer' : 'default' }}
                                        onClick={n.kind === 'message' ? () => { setNotificationMenuOpen(false); navigate('/dashboard/support'); } : undefined}
                                    >
                                        <div className="header-notif-message" style={{ fontSize: '0.85rem', lineHeight: 1.35 }}>{n.message}</div>
                                        <div className="header-notif-time" style={{ fontSize: '0.7rem', marginTop: 2 }}>
                                            {new Date(n.timestamp).toLocaleString(undefined, { timeZone: userSettingsState.timezone })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <NavLink to="/dashboard/notifications" className="dropdown-footer">View All Notifications</NavLink>
                    </div>
                </div>

                {profileName && (
                    <div className="user-profile-menu" id="user-menu-button" style={{position: 'relative'}} onClick={toggleUserMenu}>
                        <div className="user-avatar" id="header-avatar" title={profileName}>
                            {renderAvatarContent()}
                        </div>
                        <span className="user-name-header" id="header-user-name">{profileName}</span>
                        <i className="fas fa-chevron-down chevron-icon"></i>
                        
                        {/* User Dropdown */}
                        <div id="user-dropdown" className={`header-dropdown user-dropdown ${isUserMenuOpen ? 'open' : ''}`}>
                            <div className="dropdown-header user-info">
                                <div className="dropdown-user-avatar">{renderAvatarContent()}</div>
                                <div className="dropdown-user-details">
                                    <div className="dropdown-user-name" id="dropdown-user-name">{profileName}</div>
                                    <div className="dropdown-user-email" id="dropdown-user-email">{profileEmail}</div>
                                </div>
                            </div>
                            <NavLink to="/dashboard/profile" className="dropdown-item">
                                <i className="fas fa-user"></i>
                                <span>Profile</span>
                            </NavLink>
                            <NavLink to="/dashboard/settings" className="dropdown-item">
                                <i className="fas fa-cog"></i>
                                <span>Settings</span>
                            </NavLink>
                            <NavLink to="/dashboard/support" className="dropdown-item">
                                <i className="fas fa-headset"></i>
                                <span>Support</span>
                            </NavLink>
                            <button
                                type="button"
                                className="dropdown-item logout-item"
                                onClick={() => {
                                    logout();
                                    navigate('/login');
                                }}
                            >
                                <i className="fas fa-sign-out-alt"></i>
                                <span>Logout</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </header>
    )
}

export default Header;