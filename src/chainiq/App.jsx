import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { DataProvider } from './user/contexts/DataContext';
import SessionExpiredToast from './user/components/SessionExpiredToast';
import PlatformThemeEffect from './user/theme/PlatformThemeEffect';
import AdminApp from './admin-app/App';

const Dashboard = lazy(() => import('./user/Dashboard'));
const LoginPage = lazy(() => import('./user/LoginPage'));

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#111', color: '#f8f8f2', padding: '40px', fontFamily: 'system-ui, sans-serif' }}>
          <h1 style={{ marginTop: 0 }}>Something went wrong</h1>
          <p>{this.state.error?.toString()}</p>
          {this.state.errorInfo?.componentStack && (
            <pre style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', color: '#f8f8f2' }}>
              {this.state.errorInfo.componentStack}
            </pre>
          )}
          <p>Refresh the page or check the browser console for details.</p>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <DataProvider>
          <PlatformThemeEffect />
          <MainApp />
        </DataProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

function VisitorTracker() {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname.startsWith('/admin')) return;
    try {
      fetch('/api/visitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: location.pathname + location.search,
          referrer: document.referrer || '',
        }),
      }).catch(() => {});
    } catch (_) {}
  }, [location.pathname]);
  return null;
}

function MainApp() {
  const navigate = useNavigate();

  const handleShowDashboard = (mode = 'login') => {
    const target = mode === 'signup' ? '/login?mode=signup' : '/login';
    navigate(target);
  };
  void handleShowDashboard;

  return (
    <div className="App">
      <VisitorTracker />
      <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0B0E11' }} />}>
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard/*" element={<Dashboard />} />
          <Route path="/admin/*" element={<AdminApp />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      <SessionExpiredToast />
    </div>
  );
}

function NotFound() {
  return (
    <div className="App">
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <h1>Page not found</h1>
        <p>The route you visited is not part of the user frontend app.</p>
      </div>
    </div>
  );
}

export default App;
