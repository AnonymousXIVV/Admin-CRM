import React, { useState, useEffect, useContext, useMemo } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { userNavItems } from './navigation';
import Header from './Header';
import DashboardPage from './pages/DashboardPage';
import CryptoAssets from './pages/CryptoAssets';
import Cards from './pages/Cards';
import Withdrawals from './pages/Withdrawals';
import Transactions from './pages/Transactions';
import Trades from './pages/Trades';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';
import Support from './pages/Support';
import { DataContext } from './contexts/DataContext';
import ImpersonationBanner from './components/ImpersonationBanner';

const Dashboard = () => {
    const { isLoading, setUserSettingsState, currentUser, refreshSession, logout } = useContext(DataContext);
    const [isSidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const toggleSidebar = () => setSidebarOpen(prev => !prev);
    const closeSidebar = () => setSidebarOpen(false);

    const searchParams = new URLSearchParams(location.search);

    // Hide the Trades menu entry when the agent has switched trades off for
    // this client. Default = enabled, so the field has to be explicitly false
    // to disable.
    const tradesEnabled = currentUser?.tradesEnabled !== false;
    const cardsEnabled  = currentUser?.cardsEnabled  !== false;
    const filteredNavItems = useMemo(() => {
        const hidden = new Set();
        if (!tradesEnabled) hidden.add('trades');
        if (!cardsEnabled)  hidden.add('cards');
        if (hidden.size === 0) return userNavItems;
        return {
            ...userNavItems,
            mainMenu: userNavItems.mainMenu.filter((item) => !hidden.has(item.id)),
        };
    }, [tradesEnabled, cardsEnabled]);

    useEffect(() => {
        const clientName = searchParams.get('clientName');
        const clientEmail = searchParams.get('clientEmail');
        if (clientName || clientEmail) {
            setUserSettingsState((prev) => ({
                ...prev,
                name: clientName || prev.name,
                email: clientEmail || prev.email,
            }));
        }
    }, [location.search, setUserSettingsState]);

    // Pull the latest user (name, KYC status, balances) from the backend on
    // every dashboard mount, so admin-side changes show up the next time the
    // client lands on /dashboard. Only intentionally on mount - refreshSession
    // itself skips impersonation sessions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { if (refreshSession) refreshSession(); }, []);

    useEffect(() => {
        const mainContainer = document.querySelector('.main-container');
        if (mainContainer) mainContainer.scrollTop = 0;
        closeSidebar();
    }, [location.pathname]);

    if (!isLoading && !currentUser && !searchParams.get('clientName')) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="dashboard-layout">
            {currentUser?.impersonated && (
                <ImpersonationBanner
                    leadName={currentUser.name}
                    onExit={() => {
                        logout();
                        navigate('/login', { replace: true });
                    }}
                />
            )}
            <Sidebar navItems={filteredNavItems} isActive={isSidebarOpen} onClose={closeSidebar} />

            {/* Overlay to close sidebar on mobile/tablet */}
            <div
                className={`sidebar-overlay${isSidebarOpen ? ' active' : ''}`}
                onClick={closeSidebar}
                aria-hidden="true"
            />

            <div className="main-container">
                <Header toggleSidebar={toggleSidebar} />
                <main className={`main-content${location.pathname.includes('/trades') ? ' main-content--fullscreen' : ''}`}>
                    {isLoading ? (
                        <p>Loading...</p>
                    ) : (
                        <Routes>
                            <Route index element={<DashboardPage />} />
                            <Route path="crypto-assets" element={<CryptoAssets />} />
                            <Route
                                path="cards"
                                element={cardsEnabled ? <Cards /> : <Navigate to="/dashboard" replace />}
                            />
                            <Route path="withdrawals" element={<Withdrawals />} />
                            <Route path="transactions" element={<Transactions />} />
                            <Route
                                path="trades"
                                element={tradesEnabled ? <Trades /> : <Navigate to="/dashboard" replace />}
                            />
                            <Route path="settings" element={<Settings />} />
                            <Route path="profile" element={<Profile />} />
                            <Route path="notifications" element={<Notifications />} />
                            <Route path="support" element={<Support />} />
                        </Routes>
                    )}
                </main>
            </div>
        </div>
    );
};

export default Dashboard;
