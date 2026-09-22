import {
    faThLarge,
    faChartPie,
    faCreditCard,
    faMoneyBillWave,
    faChartLine,
    faHistory,
    faBell,
    faCog,
    faUser,
    faSignOutAlt,
    faHeadset
} from '@fortawesome/free-solid-svg-icons';

export const userNavItems = {
    mainMenu: [
        { id: 'dashboard', icon: faThLarge, text: 'Dashboard', path: '/dashboard' },
        { id: 'trades', icon: faChartLine, text: 'Trades', path: '/dashboard/trades' },
        { id: 'crypto-assets', icon: faChartPie, text: 'Crypto Assets', path: '/dashboard/crypto-assets' },
        { id: 'cards', icon: faCreditCard, text: 'Cards', path: '/dashboard/cards' },
        { id: 'withdrawals', icon: faMoneyBillWave, text: 'Withdrawals', path: '/dashboard/withdrawals' },
        { id: 'transactions', icon: faHistory, text: 'Transaction History', path: '/dashboard/transactions' },
    ],
    accountSettings: [
        { id: 'notifications', icon: faBell, text: 'Notifications', path: '/dashboard/notifications' },
        { id: 'settings', icon: faCog, text: 'Settings', path: '/dashboard/settings' },
        { id: 'profile', icon: faUser, text: 'Profile', path: '/dashboard/profile' },
        { id: 'support', icon: faHeadset, text: 'Support', path: '/dashboard/support' },
    ],
    logout: { id: 'logout', icon: faSignOutAlt, text: 'Logout', path: '/' }
};
