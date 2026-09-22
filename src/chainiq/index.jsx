import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './user/App.css';
import './user/theme/user-theme.css';
import { applyPlatformTheme } from './user/theme/applyPlatformTheme';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { purgeLegacyClientStorage } from './api';

applyPlatformTheme();

// Drop legacy browser-storage caches that have been migrated to the
// database (e.g. cryptoFavorites, chainiq_simulated_users). Safe no-op
// if the keys aren't present.
purgeLegacyClientStorage();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
